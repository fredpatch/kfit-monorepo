---
titre: Démarrage en production
public: exploitation
statut: à jour
vérifié-sur: 4db73be
couvre: [S7.4a, SEC-01, FIX-03, SEC-02a]
---

# Démarrage en production

Sources : `packages/server/scripts/prod/api-server.mjs`, `packages/server/src/runtime/production-guards.ts`, `packages/server/src/dev/startup-checks.ts`.

L'API de production refuse de démarrer tant qu'un contrôle échoue. Tous les échecs sont listés ensemble sur une seule ligne. Le message cite des codes et des noms de variables, jamais une valeur.

## 1. Prérequis

- [ ] Node à la version de `.nvmrc`, ou au moins au [plancher de sécurité](plancher-securite.md) : `npm run security:check` → `✔`.
- [ ] Dépendances et build : `npm ci` puis `npm run build` à la racine. `start:prod` lit `packages/server/dist/` et ne compile pas.
- [ ] PostgreSQL démarré, base de production migrée (`npm run db:migrate` avec le `DATABASE_URL` de production dans l'environnement). **À vérifier — Sprint 9** : procédure de migration dans le compose de production.
- [ ] Dossier du journal de confidentialité (`KFIT_PRIVACY_JOURNAL_DIR`) créé et accessible en écriture.
- [ ] Dossier des fichiers privés (`PRIVATE_STORAGE_ROOT`) persistant. Ce dossier et celui du journal sont donnés en **chemins absolus**.
- [ ] Toutes les variables « requis en production » renseignées, sans valeur d'exemple ([liste](../reference/variables-environnement.md)). Modèle : `.env.prod.example`.
- [ ] Aucun texte de consentement publié portant « DÉMONSTRATION » dans son titre (Configuration › Consentements).
- [ ] `AUTH_DEVICE_PEPPER` renseigné (SEC-02) : c'est la clé de l'empreinte (HMAC) des appareils de confiance. Le changer plus tard invalide tous les appareils de confiance : chaque navigateur redemandera un code par e-mail.
- [ ] SMTP opérationnel : une connexion depuis un appareil inconnu exige un code envoyé par e-mail. Sans SMTP, elle répond `503 AUTH_OTP_DELIVERY_FAILED`.
- [ ] Premier démarrage d'une base vide : définir `KFIT_BOOTSTRAP_TOKEN` (sinon l'initialisation est fermée), créer le compte administrateur, puis retirer la variable ([premier compte administrateur](premier-compte-administrateur.md)).

## 2. Démarrer et arrêter

Le point d'entrée ne charge **aucun** fichier `.env` : l'environnement vient du processus (et du compose au Sprint 9).

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
✖ K'FIT production API not started — production guards failed: ENV_MISSING (SMTP_PASS, AUTH_OTP_PEPPER); APP_BASE_URL_NOT_HTTPS (KFIT_APP_BASE_URL)
```

| Code | Signification | Correction |
| --- | --- | --- |
| `SECURITY_FLOOR` | La version de Node est sous le plancher de sécurité, ou sa ligne majeure n'est pas prise en charge (détail : `<advisory>:below_minimum` ou `:unsupported_line`). | Installer la version de `.nvmrc` ([plancher de sécurité](plancher-securite.md)). |
| `ENV_MISSING` | Variable requise absente, vide, ou contenant une valeur d'exemple. Le test ignore la casse et refuse toute valeur contenant `change-me`, `changeme`, `change_me`, `example`, `dev-`, `xxx` ou `todo`. | Renseigner la valeur réelle. Attention : une adresse comme `noreply@example.com` est refusée. |
| `ENV_WEAK_SECRET` | Un des 6 secrets (`AUTH_OTP_PEPPER`, `AUTH_AUDIT_HASH_PEPPER`, `AUTH_REFRESH_TOKEN_PEPPER`, `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_RECOVERY_TOKEN_SECRET`, `AUTH_DEVICE_PEPPER`) fait moins de 32 caractères. | Générer un secret long (ex. `openssl rand -base64 48`), différent pour chacun. |
| `APP_BASE_URL_NOT_HTTPS` | `KFIT_APP_BASE_URL` n'est pas une URL `https://`. | Mettre l'adresse publique en `https`. |
| `DATABASE_TARGET_FORBIDDEN` | `DATABASE_URL` vise `kfit_dev` ou `kfit_test`, ou le port de développement `5433` sur `localhost` / `127.0.0.1`. Détail `DATABASE_URL unreadable` si l'URL est illisible. | Pointer sur la base de production. |
| `PATH_NOT_ABSOLUTE` | `PRIVATE_STORAGE_ROOT` ou `KFIT_PRIVACY_JOURNAL_DIR` est un chemin relatif. En production, ces dossiers doivent être absolus pour ne pas dépendre du dossier de lancement. | Donner le chemin absolu (ex. `/srv/kfit/private`). |
| `PRIVACY_JOURNAL_UNAVAILABLE` | Le dossier `KFIT_PRIVACY_JOURNAL_DIR` est absent (`missing`), n'est pas un dossier (`not a directory`) ou refuse l'écriture (`not writable`). | Créer le dossier et donner les droits d'écriture à l'utilisateur de l'API. |
| `PRIVACY_JOBS_DISABLED` | `KFIT_PRIVACY_JOBS=off`. La purge des fichiers des personnes anonymisées est obligatoire en production. | Retirer la variable ou la mettre à `on`. |
| `DEMO_CONSENT_PUBLISHED` | Un texte de consentement publié contient « démonstration » dans son titre, sans tenir compte des accents ni de la casse. Le détail donne le nombre et les types. `not verified: database unreachable` : la base n'a pas répondu. | Retirer ou remplacer le texte de démonstration ; ou rendre la base joignable. |

Un avertissement n'empêche pas le démarrage : `⚠ KFIT_NOTIFICATION_JOBS=off: notification jobs disabled in production`.

## 4. Services externes

Après les contrôles, une ligne par service :

| Service | Succès | Échec | Effet de l'échec |
| --- | --- | --- | --- |
| PostgreSQL | `✔ Database connected (<hôte>:<port>/<base>)` | `✖ Database unreachable (…)` | **Bloquant** : `✖ K'FIT production API not started: a required service is unreachable.` |
| SMTP | `✔ SMTP ready (<hôte>:<port>)` | `⚠ SMTP unreachable (…)` | Non bloquant : les codes envoyés par e-mail échouent. |
| ClamAV | `✔ ClamAV ready (<hôte>:<port>)` | `⚠ ClamAV unreachable (…)` | Non bloquant : les dépôts de documents échouent à l'analyse. |

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

## 6. Sprint 9

Prévu au Sprint 9, non disponible aujourd'hui :
- service API dans `docker-compose.prod.yml` ;
- image Docker à étiquette Node exacte et corrigée ;
- nginx en proxy inverse et certificats TLS (Certbot) ;
- timer de l'hôte pour les sauvegardes ;
- copie hors serveur ;
- mode maintenance.
