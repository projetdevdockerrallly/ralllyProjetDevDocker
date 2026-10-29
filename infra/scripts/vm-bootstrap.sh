#!/usr/bin/env bash
# =============================================================================
#  Installation de la stack sur une VM Énov (Ubuntu 24.04), à lancer en root.
#
#    curl -fsSL https://raw.githubusercontent.com/lllnnll/ralllyProjetDevDocker/main/infra/scripts/vm-bootstrap.sh | bash
#  ou, depuis un clone :
#    sudo bash infra/scripts/vm-bootstrap.sh
#
#  Idempotent : peut être relancé (mise à jour du dépôt + redémarrage de la stack).
#  Variables optionnelles :
#    REPO_URL   (défaut : dépôt du groupe)       BRANCH (défaut : main)
#    APP_DIR    (défaut : /opt/rallly-projet)    VM_IP  (défaut : IP de la route par défaut)
#    DOMAIN     (défaut : <VM_IP>.sslip.io)
# =============================================================================
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/lllnnll/ralllyProjetDevDocker.git}
BRANCH=${BRANCH:-main}
APP_DIR=${APP_DIR:-/opt/rallly-projet}

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root (sudo)." >&2; exit 1; }

# --- Réseau ------------------------------------------------------------------
IFACE=$(ip route show default | awk '{print $5; exit}')
VM_IP=${VM_IP:-$(ip -4 -o addr show dev "$IFACE" | awk '{print $4}' | cut -d/ -f1 | head -n1)}
HOST_MTU=$(cat "/sys/class/net/$IFACE/mtu")
DOMAIN=${DOMAIN:-${VM_IP}.sslip.io}
log "Interface $IFACE, IP $VM_IP, MTU $HOST_MTU, domaine $DOMAIN"

# --- DNS ----------------------------------------------------------------------
# Les VM Énov sont livrées sans DNS (ETH0_DNS vide dans le contexte OpenNebula) :
# aucune résolution de nom possible (apt, git, registres Docker).
if ! getent hosts github.com >/dev/null 2>&1; then
  log "Aucun DNS fonctionnel : configuration de 1.1.1.1 / 8.8.8.8 (systemd-resolved)"
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\nFallbackDNS=9.9.9.9\n' > /etc/systemd/resolved.conf.d/dns.conf
  systemctl restart systemd-resolved
  sleep 2
  getent hosts github.com >/dev/null || { echo "Toujours pas de résolution DNS : la VM a-t-elle accès à Internet ? (ping 1.1.1.1)" >&2; exit 1; }
fi

# --- Paquets de base ---------------------------------------------------------
log "Paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw openssl >/dev/null

# --- Swap (la stack consomme ~3 Go) -------------------------------------------
RAM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$RAM_MB" -lt 6000 ] && ! swapon --show | grep -q .; then
  log "RAM ${RAM_MB} Mo : création d'un swap de 4 Go"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- Docker (dépôt officiel) --------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installation de Docker Engine + plugin compose"
  curl -fsSL https://get.docker.com | sh
fi
# Rotation des logs + MTU aligné sur l'interface de la VM (réseau encapsulé Énov)
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "mtu": ${HOST_MTU},
  "live-restore": true
}
EOF
systemctl enable --now docker >/dev/null
systemctl restart docker

# --- Pare-feu : seuls SSH et HTTP(S) entrent -----------------------------------
# NB : Docker contourne ufw pour les ports publiés ; seul Traefik en publie.
log "Pare-feu ufw (22, 80, 443)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# --- Code ----------------------------------------------------------------------
log "Dépôt $REPO_URL ($BRANCH) -> $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR/infra"

# --- .env ----------------------------------------------------------------------
log "Configuration (.env)"
sh scripts/init-env.sh >/dev/null || true
set_env() { # clé valeur
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
set_env DOMAIN "$DOMAIN"
set_env DOCKER_MTU "$HOST_MTU"
chmod 600 .env

# --- Démarrage -----------------------------------------------------------------
log "Démarrage de la stack"
docker compose -f compose.yml -f compose.vm.yml pull -q
docker compose -f compose.yml -f compose.vm.yml up -d --remove-orphans

# Rallly lit la discovery OIDC d'Authentik et garde l'échec en mémoire si le
# blueprint n'a pas encore créé le provider : on attend qu'il réponde 200,
# puis on redémarre Rallly.
log "Attente de la discovery OIDC d'Authentik (blueprints)…"
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: auth.${DOMAIN}" \
    http://localhost/application/o/rallly/.well-known/openid-configuration || true)
  [ "$code" = "200" ] && break
  sleep 5
done
if [ "$code" = "200" ]; then
  docker compose -f compose.yml -f compose.vm.yml restart rallly >/dev/null
  log "SSO prêt (discovery 200), Rallly redémarré."
else
  echo "Discovery OIDC toujours en $code après 5 min : vérifier 'docker compose logs authentik-worker'." >&2
fi

log "Terminé."
cat <<EOF

  Rallly     : http://rallly.${DOMAIN}
  Authentik  : http://auth.${DOMAIN}     (akadmin / $(grep '^AUTHENTIK_BOOTSTRAP_PASSWORD=' .env | cut -d= -f2-))
  Mailpit    : http://mail.${DOMAIN}     (admins)
  Traefik    : http://traefik.${DOMAIN}  (admins)
  Démo       : alice / bob / charlie     ($(grep '^DEMO_USERS_PASSWORD=' .env | cut -d= -f2-))

  Accessible uniquement via le VPN NetBird Énov.
  Suivi : cd $APP_DIR/infra && docker compose -f compose.yml -f compose.vm.yml ps
EOF
