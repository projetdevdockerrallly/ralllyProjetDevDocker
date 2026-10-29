# Déploiement sur la VM Énov

## 1. Prérequis Énov (une seule fois)

Procédure officielle : [Enov-Salle-Serveur/Documentation_Public](https://github.com/Enov-Salle-Serveur/Documentation_Public).

1. **Compte** sur https://enov.icu, avec une adresse `@ynov.com` et le code de vérification reçu par mail.
2. **VPN NetBird** : installer le client, puis choisir **« Auto-hébergé »** (pas « Cloud ») et
   l'URL de management `https://netbird.enov.icu:4443`. La connexion se fait via Keycloak, avec les
   identifiants enov.icu.
3. **Clé SSH** : `ssh-keygen -t ed25519`, puis Sunstone (http://nebula.cloud.enov.local:2616)
   → *Settings* → *Add SSH Key*.
4. **VM** : *Templates* → **Ubuntu 24.04** → *Instantiate* avec 2 vCPU et 4 Go de RAM.
   *Attach NIC* → le réseau attribué au groupe `INFO_M2`.

| VM du projet | |
|---|---|
| Nom | `rallly-projet` |
| OS | Ubuntu 24.04 (template #36) |
| Ressources | 2 vCPU, 4 Go RAM (+ 4 Go de swap créés par le script) |
| IP | `10.2.192.8` (réseau `704_ROBOT_M2`, partagé entre groupes M2) |
| Accès | `ssh root@10.2.192.8`, **VPN NetBird obligatoire** |

## 2. Installation de la stack

```bash
ssh root@10.2.192.8
curl -fsSL https://raw.githubusercontent.com/lllnnll/ralllyProjetDevDocker/main/infra/scripts/vm-bootstrap.sh | bash
```

Le script [`scripts/vm-bootstrap.sh`](../scripts/vm-bootstrap.sh) est idempotent : on peut le relancer
pour mettre à jour la VM. Il effectue les étapes suivantes :

1. Installation de Docker Engine et du plugin compose (dépôt officiel).
2. Rotation des logs Docker, MTU aligné sur l'interface, `live-restore`.
3. Swap de 4 Go si la RAM fait moins de 6 Go.
4. Pare-feu `ufw` : seuls 22, 80 et 443 sont ouverts en entrée.
5. Clone ou mise à jour du dépôt dans `/opt/rallly-projet`.
6. Génération du `.env` avec des secrets propres à la VM, `DOMAIN=<IP>.sslip.io`.
7. `docker compose -f compose.yml -f compose.vm.yml up -d`.

URLs (via le VPN) :

| Service | URL |
|---|---|
| Rallly | http://rallly.10.2.192.8.sslip.io |
| Authentik | http://auth.10.2.192.8.sslip.io |
| Mailpit (admins) | http://mail.10.2.192.8.sslip.io |
| Traefik (admins) | http://traefik.10.2.192.8.sslip.io |

Les comptes sont les mêmes qu'en local (`akadmin`, `alice`, `bob`, `charlie`). Les mots de passe
sont affichés à la fin du script et stockés dans `/opt/rallly-projet/infra/.env` sur la VM.

## 3. Cohérence local / VM

Les **mêmes images**, le **même `compose.yml`** et les **mêmes blueprints Authentik** sont utilisés.
Seuls les éléments suivants changent :

| Sujet | Local | VM | Pourquoi |
|---|---|---|---|
| Domaine | `localhost` | `10.2.192.8.sslip.io` | `sslip.io` résout `x.<IP>.sslip.io` vers `<IP>` : pas de DNS à gérer ni de fichier hosts |
| Fichiers compose | `compose.yml` | `compose.yml` + `compose.vm.yml` | La surcharge VM ne contient que les écarts |
| Redémarrage | `unless-stopped` | `always` | Reprise automatique après un reboot de la VM |
| MTU réseaux Docker | 1500 | MTU de l'interface (`DOCKER_MTU`) | Réseau encapsulé Énov : éviter les paquets perdus |
| Exposition | Poste du développeur | IP privée, **uniquement via VPN** + `ufw` | Réseau partagé entre groupes M2 |
| Secrets | `.env` local | `.env` propre à la VM, généré sur place | Jamais copiés d'un environnement à l'autre |
| Image Rallly | Officielle ou build local | Image publiée par la CI (GHCR) | Pas de build sur la VM |
| TLS | HTTP | HTTP dans le tunnel NetBird (chiffré WireGuard) | Pas de Let's Encrypt possible sur une IP privée (voir limites) |

## 4. Accès formateur

1. Se connecter au VPN NetBird Énov.
2. Ouvrir http://rallly.10.2.192.8.sslip.io et se connecter avec `alice` (admin) ou `bob` (utilisateur).
   Les mots de passe sont communiqués séparément, jamais dans le dépôt.

## 5. Limites assumées et pièges

- **DNS rebinding.** Certains résolveurs (box, DNS d'entreprise) refusent qu'un nom public comme
  `sslip.io` renvoie une IP privée. Dans ce cas, utiliser un autre DNS (1.1.1.1) ou ajouter les quatre
  noms au fichier hosts.
- **Pas de HTTPS.** Le trafic est chiffré par le tunnel WireGuard de NetBird, mais pas de bout en bout
  au niveau HTTP. Une évolution possible : une autorité de certification locale (mkcert) et
  l'entrypoint `websecure` de Traefik.
- **Docker contourne `ufw`** pour les ports publiés. Seul Traefik publie des ports, ce qui garde la
  surface identique.
- **Compte `root`.** C'est le compte par défaut des VM Énov. Évolution possible : un utilisateur dédié
  avec `sudo` et SSH root désactivé.
