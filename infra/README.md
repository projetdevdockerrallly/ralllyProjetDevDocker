# Infra : Rallly derrière Authentik et Traefik

Stack Docker Compose du projet « Dev avec Docker » (M2 DEVFULLSTACK, Ynov).
Un clone du dépôt + ce README suffisent pour démarrer.

## Architecture

```mermaid
flowchart LR
  user([Navigateur]) -- ":80" --> traefik

  subgraph proxy["réseau proxy"]
    traefik[Traefik v3]
    ak[Authentik server]
    rallly[Rallly]
    mailpit[Mailpit]
  end

  subgraph akb["authentik_backend (internal)"]
    akw[Authentik worker]
    akdb[(PostgreSQL 16)]
  end

  subgraph rb["rallly_backend (internal)"]
    rdb[(PostgreSQL 18)]
    garage[(Garage S3)]
  end

  traefik -- auth.DOMAIN --> ak
  traefik -- rallly.DOMAIN --> rallly
  traefik -- mail.DOMAIN --> mailpit
  ak --- akdb
  akw --- akdb
  rallly --- rdb
  rallly --- garage
  rallly -. OIDC discovery via alias auth.DOMAIN .-> traefik
  rallly -. SMTP (réseau mail) .-> mailpit
  akw -. SMTP .-> mailpit
```

| URL (local) | Service |
|---|---|
| http://rallly.localhost | Rallly |
| http://auth.localhost | Authentik (admin : `akadmin`) |
| http://mail.localhost | Mailpit, boîte mail de lab (tous les e-mails envoyés y arrivent). **Admins uniquement**, via Authentik |
| http://traefik.localhost | Dashboard Traefik. **Admins uniquement**, via Authentik |

`*.localhost` résout automatiquement vers `127.0.0.1` dans les navigateurs, il n'y a rien à ajouter au fichier hosts.

## Démarrage

Prérequis : Docker Desktop (ou Docker Engine + plugin compose), ainsi que Git Bash sous Windows pour le script.

```bash
cd infra
sh scripts/init-env.sh        # crée .env avec des secrets aléatoires et affiche le mdp akadmin
docker compose up -d
docker compose ps             # attendre que tout soit "healthy" (Authentik : ~1-2 min au 1er démarrage)
```

### Comptes

| Où | Compte | Mot de passe | Rôle |
|---|---|---|---|
| Authentik | `akadmin` | `AUTHENTIK_BOOTSTRAP_PASSWORD` | Admin Authentik |
| Authentik → Rallly | `alice` | `DEMO_USERS_PASSWORD` | Groupe `rallly-admins` |
| Authentik → Rallly | `bob` | `DEMO_USERS_PASSWORD` | Groupe `rallly-users` |
| Authentik → Rallly | `charlie` | `DEMO_USERS_PASSWORD` | Aucun groupe → **accès refusé** |

Les deux mots de passe sont affichés par `init-env.sh` et stockés dans `.env`.

Connexion à Rallly : http://rallly.localhost → **Authentik**. Le SSO, les groupes, les policies et
l'invitation externe sont décrits dans **[docs/authentik.md](docs/authentik.md)**.

Le script `init-env.sh` peut être relancé à tout moment. Il **complète** le `.env` (nouvelles clés)
sans toucher aux secrets existants.

### Avec l'image du fork (features du groupe)

```bash
docker compose -f compose.yml -f compose.build.yml up -d --build
```

Une fois la CI en place, il suffit de mettre `RALLLY_IMAGE=ghcr.io/<owner>/<repo>:main` dans `.env`. Aucun build local n'est alors nécessaire.

### Arrêt et remise à zéro

```bash
docker compose down        # conserve les données
docker compose down -v     # supprime aussi les volumes (bases, médias) → repart de zéro
```

## Choix techniques et sécurité

| Sujet | Choix |
|---|---|
| Point d'entrée | Traefik est le **seul** service qui publie un port (`HTTP_PORT`). Bases, Garage et worker ne sont pas joignables depuis l'hôte. |
| Segmentation | 4 réseaux. `authentik_backend`, `rallly_backend` et `mail` sont `internal: true`, donc sans accès Internet. |
| Secrets | `.env` est gitignoré et généré localement. `.env.example` est commité. Aucun secret n'est dans les images ni dans `.dockerignore` (`infra/` est exclu du contexte de build). |
| Privilèges | `no-new-privileges` partout. `cap_drop: ALL` sur Traefik (+ `NET_BIND_SERVICE`), Rallly, Garage et Mailpit. Traefik est en `read_only`. Le socket Docker est monté en lecture seule. |
| Utilisateurs | Rallly tourne en `nextjs` (non-root) et Authentik en utilisateur dédié. Le worker Authentik tourne **sans** `user: root` ni socket Docker, contrairement au compose officiel. |
| Versions | Toutes les images sont épinglées (`*_TAG` dans `.env`). |
| Télémétrie | Désactivée (Traefik, Authentik). |

Limites assumées (à traiter dans les phases suivantes) :

- **HTTP en local.** TLS est prévu pour la VM.
- **Socket Docker toujours monté**, même en lecture seule. Un `docker-socket-proxy` est envisagé.
- **Licence Rallly self-hosted.** Elle est gratuite pour un utilisateur. Au-delà, l'instance fonctionne mais affiche un rappel (système de confiance, cf. [Licensing](https://support.rallly.co/self-hosting/licensing)).

## Pièges connus

- **Discovery OIDC depuis le conteneur.** Rallly doit lire `http://auth.<DOMAIN>/...`, c'est-à-dire la même URL que le navigateur, sinon l'`issuer` ne correspond pas. Traefik porte donc les alias réseau `auth.<DOMAIN>` et `rallly.<DOMAIN>` sur le réseau `proxy`.
- **Port 80 occupé sous Windows (IIS, autre stack).** Mettre `HTTP_PORT=8080` et ajouter `:8080` à `RALLLY_URL` et `AUTHENTIK_URL`.
- **Fins de ligne CRLF sous Windows.** Le `.gitattributes` du dépôt force LF. Sans lui, `docker-start.sh` copié en CRLF casse le démarrage de l'image du fork.
- **E-mails Rallly.** `RALLLY_SUPPORT_EMAIL` et `RALLLY_NOREPLY_EMAIL` doivent être des e-mails valides. Une valeur vide fait planter Rallly au démarrage (validation zod).

## Feuille de route infra

- [x] Phase 1 : Compose local (Traefik, Authentik, Rallly, PostgreSQL ×2, Garage, Mailpit)
- [x] Phase 2 : SSO OIDC Authentik → Rallly, groupes + policies, invitation externe (blueprints déclaratifs)
- [x] Phase 2b : dashboard Traefik et Mailpit protégés par Authentik (forward-auth, groupe admin)
- [ ] Phase 3 : durcissement complémentaire, scan Trivy commenté
- [x] Phase 4 : déploiement VM Énov, écarts documentés → [docs/vm-enov.md](docs/vm-enov.md)
- [x] Phase 5 : CI GitHub Actions (`.github/workflows/docker-CI.yml`)

## CI/CD

Le workflow **Projet CI** s'exécute sur chaque push sur `main`, sur chaque PR, et à la demande :

1. **compose** : valide `compose.yml` et ses surcharges (local, build, VM) avec un `.env` généré, ainsi que la syntaxe des scripts.
2. **image** : build de l'image Rallly **du fork**, puis scan **Trivy** (HIGH/CRITICAL corrigeables, rapport
   dans le résumé du job et en artefact). Sur `main` seulement, l'image est publiée sur
   `ghcr.io/lllnnll/ralllyprojetdevdocker` (tags `main`, `latest`, `sha-xxxxxxx`).

Déploiement de l'image publiée sur la VM : dans `/opt/rallly-projet/infra/.env`, mettre
`RALLLY_IMAGE=ghcr.io/lllnnll/ralllyprojetdevdocker:main`, puis
`docker compose -f compose.yml -f compose.vm.yml pull rallly && docker compose -f compose.yml -f compose.vm.yml up -d rallly`.

Le scan ne bloque pas le pipeline (`exit-code: 0`). Les vulnérabilités relevées viennent de l'image de base
Node et des dépendances upstream de Rallly : elles sont suivies dans le rapport, pas masquées.
Les workflows d'origine de Rallly sont conservés dans `.github/workflows-upstream/` sans être exécutés.
