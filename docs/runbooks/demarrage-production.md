---
titre: Démarrage en production
public: exploitation
statut: à jour
vérifié-sur: c38dc9f
couvre: [S7.4a, SEC-01, FIX-03, SEC-02a, S9A.2, S9A.2b, S9A.3]
---

# Démarrage en production

Sources : `packages/server/scripts/prod/api-server.mjs`, `packages/server/src/runtime/production-guards.ts`, `packages/server/src/dev/startup-checks.ts`.

L'API de production refuse de démarrer tant qu'un contrôle échoue. Tous les échecs sont listés ensemble sur une seule ligne. Le message cite des codes et des noms de variables, jamais une valeur.

## 1. Prérequis

- [ ] Node à la version de `.nvmrc`, ou au moins au [plancher de sécurité](plancher-securite.md) : `npm run security:check` → `✔`.
- [ ] Dépendances et build : `npm ci` puis `npm run build` à la racine. `start:prod` lit `packages/server/dist/` et ne compile pas.
- [ ] PostgreSQL démarré, base de production migrée (`npm run db:migrate` avec le `DATABASE_URL` de production dans l'environnement). Dans le compose de production, la migration est une commande explicite du service `ops` (§ 6), jamais lancée au démarrage de l'API. Procédure d'exécution : S9A.6.
- [ ] Dossier du journal de confidentialité (`KFIT_PRIVACY_JOURNAL_DIR`) créé et accessible en écriture.
- [ ] Dossier des fichiers privés (`PRIVATE_STORAGE_ROOT`) persistant. Ce dossier et celui du journal sont donnés en **chemins absolus**.
- [ ] Toutes les variables « requis en production » renseignées, sans valeur d'exemple ([liste](../reference/variables-environnement.md)). Modèle : `.env.prod.example`.
- [ ] Aucun texte de consentement publié portant « DÉMONSTRATION » dans son titre (Configuration › Consentements).
- [ ] `AUTH_DEVICE_PEPPER` renseigné (SEC-02) : c'est la clé de l'empreinte (HMAC) des appareils de confiance. Le changer plus tard invalide tous les appareils de confiance : chaque navigateur redemandera un code par e-mail.
- [ ] SMTP opérationnel : une connexion depuis un appareil inconnu exige un code envoyé par e-mail. Sans SMTP, elle répond `503 AUTH_OTP_DELIVERY_FAILED`.
- [ ] Premier démarrage d'une base vide : définir `KFIT_BOOTSTRAP_TOKEN` (sinon l'initialisation est fermée), créer le compte administrateur, puis retirer la variable ([premier compte administrateur](premier-compte-administrateur.md)).

## 2. Démarrer et arrêter

Le point d'entrée ne charge **aucun** fichier `.env` : l'environnement vient du processus, ou du compose de production (§ 6).

```bash
NODE_ENV=production npm run start:prod
```

- `NODE_ENV` doit valoir exactement `production`. Sinon : `✖ K'FIT production API not started: NODE_ENV must be "production" …`, code de sortie `1`.
- Adresse d'écoute : `KFIT_API_HOST` (par défaut `127.0.0.1`) et `KFIT_API_PORT` (par défaut `3000`). Un port invalide est refusé.
- Arrêt : `SIGTERM` ou `SIGINT` (`Ctrl+C`). Le journal affiche `Received SIGTERM; shutting down K'FIT production API.`. Les jobs s'arrêtent, les connexions se ferment, puis le processus sort avec le code `0`.

## 3. Contrôles au démarrage

Ordre :

1. `NODE_ENV` et port ;
2. contrôles de production (tableau ci-dessous) ;
3. services externes (§ 4) ;
4. composition de l'application ;
5. démarrage des jobs ;
6. écoute.

Échec des contrôles de production :

```
✖ K'FIT production API not started - production guards failed: ENV_MISSING (SMTP_PASS, AUTH_OTP_PEPPER); APP_BASE_URL_NOT_HTTPS (KFIT_APP_BASE_URL)
```

| Code                          | Signification                                                                                                                                                                                                                    | Correction                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `SECURITY_FLOOR`              | La version de Node est sous le plancher de sécurité, ou sa ligne majeure n'est pas prise en charge (détail : `<advisory>:below_minimum` ou `:unsupported_line`).                                                                 | Installer la version de `.nvmrc` ([plancher de sécurité](plancher-securite.md)).              |
| `ENV_MISSING`                 | Variable requise absente, vide, ou contenant une valeur d'exemple. Le test ignore la casse et refuse toute valeur contenant `change-me`, `changeme`, `change_me`, `example`, `dev-`, `xxx` ou `todo`.                            | Renseigner la valeur réelle. Attention : une adresse comme `noreply@example.com` est refusée. |
| `ENV_WEAK_SECRET`             | Un des 6 secrets (`AUTH_OTP_PEPPER`, `AUTH_AUDIT_HASH_PEPPER`, `AUTH_REFRESH_TOKEN_PEPPER`, `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_RECOVERY_TOKEN_SECRET`, `AUTH_DEVICE_PEPPER`) fait moins de 32 caractères.                         | Générer un secret long (ex. `openssl rand -base64 48`), différent pour chacun.                |
| `APP_BASE_URL_NOT_HTTPS`      | `KFIT_APP_BASE_URL` n'est pas une URL `https://`.                                                                                                                                                                                | Mettre l'adresse publique en `https`.                                                         |
| `DATABASE_TARGET_FORBIDDEN`   | `DATABASE_URL` vise `kfit_dev` ou `kfit_test`, ou le port de développement `5433` sur `localhost` / `127.0.0.1`. Détail `DATABASE_URL unreadable` si l'URL est illisible.                                                        | Pointer sur la base de production.                                                            |
| `PATH_NOT_ABSOLUTE`           | `PRIVATE_STORAGE_ROOT` ou `KFIT_PRIVACY_JOURNAL_DIR` est un chemin relatif. En production, ces dossiers doivent être absolus pour ne pas dépendre du dossier de lancement.                                                       | Donner le chemin absolu (ex. `/srv/kfit/private`).                                            |
| `PRIVACY_JOURNAL_UNAVAILABLE` | Le dossier `KFIT_PRIVACY_JOURNAL_DIR` est absent (`missing`), n'est pas un dossier (`not a directory`) ou refuse l'écriture (`not writable`).                                                                                    | Créer le dossier et donner les droits d'écriture à l'utilisateur de l'API.                    |
| `PRIVACY_JOBS_DISABLED`       | `KFIT_PRIVACY_JOBS=off`. La purge des fichiers des personnes anonymisées est obligatoire en production.                                                                                                                          | Retirer la variable ou la mettre à `on`.                                                      |
| `DEMO_CONSENT_PUBLISHED`      | Un texte de consentement publié contient « démonstration » dans son titre, sans tenir compte des accents ni de la casse. Le détail donne le nombre et les types. `not verified: database unreachable` : la base n'a pas répondu. | Retirer ou remplacer le texte de démonstration ; ou rendre la base joignable.                 |

Un avertissement n'empêche pas le démarrage : `⚠ KFIT_NOTIFICATION_JOBS=off: notification jobs disabled in production`.

## 4. Services externes

Après les contrôles, une ligne par service :

| Service    | Succès                                        | Échec                        | Effet de l'échec                                                                        |
| ---------- | --------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| PostgreSQL | `✔ Database connected (<hôte>:<port>/<base>)` | `✖ Database unreachable (…)` | **Bloquant** : `✖ K'FIT production API not started: a required service is unreachable.` |
| SMTP       | `✔ SMTP ready (<hôte>:<port>)`                | `⚠ SMTP unreachable (…)`     | Non bloquant : les codes envoyés par e-mail échouent.                                   |
| ClamAV     | `✔ ClamAV ready (<hôte>:<port>)`              | `⚠ ClamAV unreachable (…)`   | Non bloquant : les dépôts de documents échouent à l'analyse.                            |

Délai de chaque contrôle : 3 secondes. Les identifiants de `DATABASE_URL` ne sont jamais affichés.

## 5. État « sain »

- Le journal contient, dans l'ordre :

  ```
  ✔ Database connected (…)
  ✔ SMTP ready (…)
  ✔ ClamAV ready (…)
  ✔ K'FIT production API listening on 127.0.0.1:3000
  ```

- `GET /health` répond `200` avec `{"status":"ok"}` :

  ```bash
  curl -s http://127.0.0.1:3000/health
  ```

- Chaque réponse porte un en-tête `X-Request-Id`. Un UUID valide reçu est conservé ; sinon, un UUID est généré.
- Les jobs `privacy.purge` et, sauf `KFIT_NOTIFICATION_JOBS=off`, `notifications.reconcile` et `notifications.email-delivery` s'exécutent une première fois au démarrage, puis selon leur planning ([jobs](../reference/jobs.md)). Leurs échecs sont journalisés : `✖ <job> failed (<code>)`.
- Différences avec le développement :
  - cookies `Secure` ;
  - `trust proxy` limité à `loopback` et à l'adresse exacte `KFIT_TRUSTED_PROXY_IP` (passerelle `kfit_edge`, voir §7) ;
  - outils de développement (« Données de test ») jamais montés.

## 6. Empaquetage Docker (S9A.2)

Le paquetage existe ; il n'est **pas encore validé sur l'hébergement Hostinger** (porte de validation ultérieure de Sprint 9A).

`docker-compose.prod.yml` assemble quatre services, sans aucun port publié sur l'hôte :

| Service    | Image                                                                        | Réseaux                              | Rôle                                                                    |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`                                                         | `kfit_backend`                       | base de production (volume nommé `kfit_postgres_prod_data`)             |
| `clamav`   | `clamav/clamav:1.5.5`                                                        | `kfit_backend`, `kfit_clamav_egress` | antivirus (volume nommé `kfit_clamav_prod_data`)                        |
| `api`      | `packages/server/Dockerfile`, cible `runtime` (`node:22.23.5-bookworm-slim`) | `kfit_backend`, `kfit_edge`          | API (`scripts/prod/api-server.mjs`), utilisateur non root, `init: true` |
| `client`   | `packages/client/Dockerfile` (`nginx:1.27-alpine`)                           | `kfit_edge`                          | application web statique, port 80 interne                               |

- `kfit_backend` est un réseau interne (pas de sortie). `kfit_edge` est un réseau ordinaire : il donne à l'API l'accès SMTP sortant. Le proxy public (S9A.3) tourne sur l'hôte, voir §7. `kfit_clamav_egress` est un réseau ordinaire réservé à ClamAV : seule sortie de `freshclam` pour mettre à jour les signatures, sans port publié.
- Fichier d'environnement : `KFIT_ENV_FILE` (par défaut `.env.prod`, modèle `.env.prod.example`). Le compose impose les valeurs liées à la topologie : `NODE_ENV=production`, `KFIT_API_HOST=0.0.0.0`, `KFIT_API_PORT=3000`, `PRIVATE_STORAGE_ROOT=/srv/kfit/private`, `KFIT_PRIVACY_JOURNAL_DIR=/srv/kfit/privacy-journal`, `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310`.
- Fichiers privés et journal de confidentialité : dossiers de l'hôte `/srv/kfit/private` et `/srv/kfit/privacy-journal`, montés aux mêmes chemins. Ils doivent exister et appartenir à l'utilisateur `1000` de l'image ; le compose ne les crée jamais.
- Contrôles de santé : `pg_isready` (PostgreSQL), `clamdcheck.sh` (ClamAV), `GET /health` sur `127.0.0.1:3000` dans le conteneur (API), page d'accueil (client). L'API attend PostgreSQL et ClamAV « healthy ».
- PDF : l'image API contient le Chrome de Puppeteer (`/opt/puppeteer`) et ses bibliothèques. Le bac à sable de Chrome reste actif. Contrôle : `npm run preflight:pdf` dans l'image.
- **Exception temporaire `SYS_ADMIN`** (décision du 2026-11-23) : le service `api` reçoit la capacité `SYS_ADMIN`, nécessaire au bac à sable de Chromium tant que Puppeteer tourne dans le processus de l'API. Pas de `--no-sandbox`, pas de mode privilégié. Acceptée **uniquement** pour la bêta Hostinger contrôlée, avec les données de Konny ou des données synthétiques. **Avant toute donnée client réelle**, le rendu PDF doit être isolé pour que le conteneur API n'ait plus besoin de cette capacité.
- Migrations : service `ops` (profil `ops`, image avec `drizzle-kit`), lancé seulement par une commande explicite. `docker compose up -d` ne le démarre jamais.

### Images publiées (S9A.2b)

Les images applicatives (`api`, `client`, `ops`) ne sont **jamais construites sur le VPS** dans le parcours normal. GitHub Actions (`.github/workflows/publish-images.yml`) les construit à chaque push sur `main`, après la CI complète, puis :

- vérifie l'image exacte avant publication (`ops/ci/verify-image.sh`, étiquette de révision, `npm run preflight:pdf` avec `--cap-add=SYS_ADMIN`) ;
- publie uniquement `ghcr.io/fredpatch/kfit-monorepo/<image>:sha-<commit>` ;
- produit l'artefact `release-manifest-<commit>` : références par digest (`@sha256:...`) des trois images et bloc `compose_env`.

GitHub ne se connecte jamais au VPS et ne déploie rien.

Revue locale (poste de développement) : `docker compose -f docker-compose.prod.yml build api client` ; sans variables, les images portent les noms locaux `kfit-prod-*:local`.

Mise en production sur le VPS, à partir du manifeste de la version choisie :

```bash
export KFIT_API_IMAGE=ghcr.io/fredpatch/kfit-monorepo/api@sha256:<digest>
export KFIT_CLIENT_IMAGE=ghcr.io/fredpatch/kfit-monorepo/client@sha256:<digest>
export KFIT_OPS_IMAGE=ghcr.io/fredpatch/kfit-monorepo/ops@sha256:<digest>
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml --profile ops pull api client ops
docker compose -f docker-compose.prod.yml up -d --no-build
```

- `--no-build` est obligatoire : le compose garde ses sections `build:`, et une image absente serait sinon reconstruite sur le VPS.
- Jamais de `latest` : seules les références par digest du manifeste sont déployées.
- Conserver le manifeste de chaque version déployée sur le VPS (par exemple `/srv/kfit/releases/<commit>.json`) : l'artefact GitHub expire après 90 jours (maximum d'un dépôt public).
- S9A.7 : copier ce manifeste dans `/srv/kfit/releases/<commit>.json` et en dériver `/srv/kfit/config/release.env` (trois références d'images, aucun secret), que lit le timer de sauvegarde. Procédure : [sauvegarde et restauration](sauvegarde-restauration.md#42-version-déployée-releaseenv).
- Retour arrière : reprendre les trois références du manifeste précédent, puis `pull` et `up -d --no-build`.
- Si les paquets GHCR sont privés : `docker login ghcr.io` sur le VPS avec un jeton en lecture seule (`read:packages`), jamais stocké dans le dépôt.

Encore à venir dans Sprint 9A :

- exécution des migrations sur l'hôte : S9A.6 ;
- timer de l'hôte pour les sauvegardes : empaqueté en S9A.7 ([sauvegarde et restauration](sauvegarde-restauration.md#4-production-sur-le-vps-s9a7)), validation sur le VPS en attente ; copie hors serveur avant toute donnée client réelle ;
- mode maintenance.

## 7. Reverse proxy et HTTPS (S9A.3)

Le proxy public tourne sur l'hôte, pas dans Docker. Docker publie donc seulement, sur la boucle locale de l'hôte :

- API : `127.0.0.1:13000 -> api:3000`
- client : `127.0.0.1:18080 -> client:80`

PostgreSQL et ClamAV restent sans port hôte. Les ports publics 80/443 appartiennent uniquement à nginx.

### Adresse du client et relais de confiance

Docker ne conserve pas `127.0.0.1` comme source : une connexion de nginx vers `127.0.0.1:13000` arrive dans le conteneur depuis la passerelle du réseau Docker (mesuré sur le VPS Hostinger le 2026-11-24 : `172.17.0.1` pour le réseau `bridge` par défaut). Sans confiance dans ce relais, l'API verrait la passerelle comme adresse de tous les visiteurs : limites de débit par IP partagées par tous, empreintes d'IP d'audit identiques.

Frontière de confiance (exacte, rien d'autre) :

- `loopback` ;
- la passerelle du réseau `kfit_edge`, fixée dans `docker-compose.prod.yml` (sous-réseau `10.247.13.0/24`, passerelle `10.247.13.1`, hors des plages automatiques de Docker `172.17-31.x` et `192.168.x`).

Le compose définit cette passerelle une seule fois (ancre `x-kfit-edge-gateway`) et l'utilise à la fois pour le réseau et pour `KFIT_TRUSTED_PROXY_IP` du service `api`. L'API de production refuse de démarrer si la valeur manque (`ENV_MISSING`) ou n'est pas une adresse IPv4 privée unique (`TRUSTED_PROXY_INVALID`). nginx ajoute l'adresse réelle du client à droite de `X-Forwarded-For` ; Express s'arrête au premier relais non fiable en partant de la droite, donc les relais ajoutés par le client sont ignorés.

Vérifier sur le VPS :

```bash
docker network inspect kfit-prod_kfit_edge --format '{{json .IPAM.Config}}'
docker compose -f docker-compose.prod.yml exec api printenv KFIT_TRUSTED_PROXY_IP
ip -4 route
```

Les deux premières commandes doivent afficher la même passerelle ; `ip -4 route` ne doit montrer aucune autre route vers `10.247.13.0/24`.

**Interdit sans nouvelle revue de sécurité** : élargir la confiance (sous-réseau entier, plages privées, nombre de relais, `true`) ou publier l'API ailleurs que sur `127.0.0.1`.

Nom canonique bêta : `https://kfitpulse.io`. `www.kfitpulse.io` redirige vers le domaine racine.

Fichiers versionnés :

- `ops/nginx/kfitpulse-bootstrap.conf` : HTTP minimal pour le premier challenge ACME ;
- `ops/nginx/kfitpulse.conf` : redirection HTTP→HTTPS, TLS et reverse proxy ;
- `ops/certbot/reload-nginx.sh` : hook de rechargement nginx après renouvellement.

Le proxy reproduit les racines API définies dans `packages/client/vite.config.ts`. Ne jamais proxyfier tout `/admin/` ou `/public/`, car ces namespaces contiennent aussi des routes SPA.

La limite publique est `client_max_body_size 12m`, au-dessus du justificatif de paiement maximum de 10 MiB et de la limite Express de 11 MiB.

### Première émission du certificat

Après installation de nginx et Certbot sur l'hôte :

```bash
sudo mkdir -p /var/www/certbot
sudo cp ops/nginx/kfitpulse-bootstrap.conf /etc/nginx/sites-available/kfitpulse.conf
sudo ln -sfn /etc/nginx/sites-available/kfitpulse.conf /etc/nginx/sites-enabled/kfitpulse.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Vérifier le challenge HTTP avant Certbot, puis émettre le certificat SAN pour `kfitpulse.io` et `www.kfitpulse.io` avec le plugin webroot. Utiliser une adresse e-mail d'exploitation réelle :

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d kfitpulse.io -d www.kfitpulse.io \
  --email <CERTBOT_EMAIL> --agree-tos --no-eff-email
```

Une fois le certificat présent :

```bash
sudo cp ops/nginx/kfitpulse.conf /etc/nginx/sites-available/kfitpulse.conf
sudo install -m 0755 ops/certbot/reload-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/kfit-reload-nginx
sudo nginx -t
sudo systemctl reload nginx
```

Le déploiement applicatif continue à utiliser les références GHCR immuables du manifeste et `docker compose ... up -d --no-build`. nginx ne construit ni ne choisit les images.

### Pont SMTP temporaire Mailpit (S9A.3, retiré en S9A.4)

Tant qu'aucun compte SMTP réel n'existe, le service `mailpit` (profil `mailpit-bridge`) reçoit les e-mails de l'API pour lire les codes de connexion. Ce n'est pas la validation SMTP de S9A.4 : aucun e-mail ne quitte le serveur.

- SMTP : `mailpit:1025` sur le réseau interne `kfit_backend`, sans port sur l'hôte.
- Interface : `127.0.0.1:8025` sur l'hôte uniquement (réseau `kfit_mailpit_ui`, car Docker ne publie pas de port sur un réseau interne), lue par tunnel SSH. Aucune route nginx.
- Nodemailer envoie toujours `AUTH` dès que `SMTP_USER` est défini, et les contrôles de production exigent `SMTP_USER` et `SMTP_PASS`. Mailpit accepte donc n'importe quels identifiants en SMTP sans TLS (`MP_SMTP_AUTH_ACCEPT_ANY`, `MP_SMTP_AUTH_ALLOW_INSECURE`) : la frontière est le réseau interne, pas le mot de passe.
- Image figée par empreinte (`axllent/mailpit:v1.33.1@sha256:...`), stockage éphémère : les messages disparaissent à la recréation du conteneur.

Valeurs du pont dans `/srv/kfit/config/.env.prod` (non secrètes, propres à Mailpit) :

```dotenv
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=kfit-mailpit-bridge
SMTP_PASS=kfit-mailpit-bridge-only
SMTP_FROM=no-reply@kfitpulse.io
```

Démarrer le pont avant l'API, puis l'API sans le profil :

```bash
docker compose -f docker-compose.prod.yml --profile mailpit-bridge up -d mailpit
docker compose -f docker-compose.prod.yml up -d api
```

Lire l'interface depuis le poste de l'exploitant :

```bash
ssh -N -L 8025:127.0.0.1:8025 <utilisateur>@<hôte du VPS>
```

puis ouvrir `http://localhost:8025`.

Retrait (S9A.4) :

1. remplacer les six lignes `SMTP_*` par les valeurs du fournisseur réel ;
2. `docker compose -f docker-compose.prod.yml --profile mailpit-bridge rm -s -f mailpit`, puis `docker network rm kfit-prod_kfit_mailpit_ui` ;
3. `docker compose -f docker-compose.prod.yml up -d --force-recreate api` : le journal doit afficher `✔ SMTP ready (<hôte réel>:<port>)` ;
4. supprimer du compose le service `mailpit` et le réseau `kfit_mailpit_ui`, puis vérifier qu'aucun fichier ne mentionne plus `mailpit-bridge` ;
5. dérouler ensuite la validation SMTP de S9A.4.
