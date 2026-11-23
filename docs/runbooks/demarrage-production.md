---
titre: Démarrage en production
public: exploitation
statut: à jour
vérifié-sur: 2365597
couvre: [S7.4a, SEC-01, FIX-03, SEC-02a, S9A.2]
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
  - `trust proxy` limité au proxy local (`loopback`) ;
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

- `kfit_backend` est un réseau interne (pas de sortie). `kfit_edge` est un réseau ordinaire : il donne à l'API l'accès SMTP sortant et recevra le proxy public au S9A.3. `kfit_clamav_egress` est un réseau ordinaire réservé à ClamAV : seule sortie de `freshclam` pour mettre à jour les signatures, sans port publié.
- Fichier d'environnement : `KFIT_ENV_FILE` (par défaut `.env.prod`, modèle `.env.prod.example`). Le compose impose les valeurs liées à la topologie : `NODE_ENV=production`, `KFIT_API_HOST=0.0.0.0`, `KFIT_API_PORT=3000`, `PRIVATE_STORAGE_ROOT=/srv/kfit/private`, `KFIT_PRIVACY_JOURNAL_DIR=/srv/kfit/privacy-journal`, `CLAMAV_HOST=clamav`, `CLAMAV_PORT=3310`.
- Fichiers privés et journal de confidentialité : dossiers de l'hôte `/srv/kfit/private` et `/srv/kfit/privacy-journal`, montés aux mêmes chemins. Ils doivent exister et appartenir à l'utilisateur `1000` de l'image ; le compose ne les crée jamais.
- Contrôles de santé : `pg_isready` (PostgreSQL), `clamdcheck.sh` (ClamAV), `GET /health` sur `127.0.0.1:3000` dans le conteneur (API), page d'accueil (client). L'API attend PostgreSQL et ClamAV « healthy ».
- PDF : l'image API contient le Chrome de Puppeteer (`/opt/puppeteer`) et ses bibliothèques. Le bac à sable de Chrome reste actif. Contrôle : `npm run preflight:pdf` dans l'image.
- **Exception temporaire `SYS_ADMIN`** (décision du 2026-11-23) : le service `api` reçoit la capacité `SYS_ADMIN`, nécessaire au bac à sable de Chromium tant que Puppeteer tourne dans le processus de l'API. Pas de `--no-sandbox`, pas de mode privilégié. Acceptée **uniquement** pour la bêta Hostinger contrôlée, avec les données de Konny ou des données synthétiques. **Avant toute donnée client réelle**, le rendu PDF doit être isolé pour que le conteneur API n'ait plus besoin de cette capacité.
- Migrations : service `ops` (profil `ops`, image avec `drizzle-kit`), lancé seulement par une commande explicite. `docker compose up -d` ne le démarre jamais.

Encore à venir dans Sprint 9A :

- nginx en proxy inverse public et certificats TLS (Certbot) : S9A.3 ;
- exécution des migrations sur l'hôte : S9A.6 ;
- timer de l'hôte pour les sauvegardes et copie hors serveur : S9A.7 ;
- mode maintenance.
