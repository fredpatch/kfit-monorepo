---
titre: Variables d'environnement
public: exploitation
statut: à jour
vérifié-sur: généré (npm run docs:check en CI)
couvre: [S7.4a, S7.4b, DOC-01a]
---

# Variables d'environnement

> Fichier généré — ne pas modifier à la main (npm run docs:generate).

Source : clés et commentaires de `.env.example` (jamais les valeurs d'un `.env`). « Requis en production » = `PRODUCTION_REQUIRED_ENV` (`packages/server/src/runtime/production-guards.ts`) : l'API de production refuse de démarrer si la variable manque ou contient une valeur d'exemple. « Scripts ops » = lue par `ops:backup`, `ops:restore`, `ops:restore-drill`, pas par l'API.

53 variables.

| Variable | Groupe | Requis en production | Scripts ops | Description |
| --- | --- | --- | --- | --- |
| `POSTGRES_DB` | PostgreSQL | — | — | Reserve host port 5432 for a native/local PostgreSQL installation. Docker publishes its internal 5432 port on host port 5433 by default. |
| `POSTGRES_USER` | PostgreSQL | — | — | — |
| `POSTGRES_PASSWORD` | PostgreSQL | — | — | — |
| `POSTGRES_PORT` | PostgreSQL | — | — | — |
| `DATABASE_URL` | Host-side Drizzle / API connection to Docker PostgreSQL | oui | — | — |
| `KFIT_API_PORT` | Client/API local routing | — | — | The real local API listens on KFIT_API_PORT. Vite proxies /auth, /catalogue and /health to it. Keep VITE_API_BASE_URL empty for browser same-origin cookies/CSRF during local Vite development. |
| `VITE_API_BASE_URL` | Client/API local routing | — | — | — |
| `VITE_API_PROXY_TARGET` | Client/API local routing | — | — | — |
| `VITE_PUBLIC_WHATSAPP` | Client/API local routing | — | — | Public landing page contact links (UX-11). Leave empty to hide the buttons. Replaced later by the coach onboarding settings. |
| `VITE_PUBLIC_INSTAGRAM` | Client/API local routing | — | — | — |
| `STAGING_AUTH_PROXY_PORT` | Client/API local routing | — | — | Separate Sprint 1 staging-style auth smoke harness. |
| `AUTH_STAGING_SMOKE_PORT` | Client/API local routing | — | — | — |
| `AUTH_OTP_PEPPER` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | Generate a unique secret with at least 32 random characters; never commit the real value. |
| `AUTH_AUDIT_HASH_PEPPER` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | Optional dedicated pepper for one-way audit context hashes. Defaults to AUTH_OTP_PEPPER if unset. |
| `AUTH_REFRESH_TOKEN_PEPPER` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | Optional dedicated pepper for refresh-token hashes. Defaults to AUTH_OTP_PEPPER if unset. |
| `AUTH_ACCESS_TOKEN_SECRET` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | Optional dedicated access-JWT signing secret. Defaults to AUTH_OTP_PEPPER if unset. |
| `AUTH_OTP_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_OTP_MAX_ATTEMPTS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_FRESH_OTP_WINDOW_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_ACCESS_TOKEN_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_REFRESH_TOKEN_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_INACTIVITY_TIMEOUT_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_ABSOLUTE_SESSION_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_TRUSTED_DEVICE_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_RECOVERY_TOKEN_SECRET` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | Optional dedicated password-recovery grant signing secret. Defaults to AUTH_OTP_PEPPER. |
| `AUTH_DEVICE_PEPPER` | Sprint 1 authentication policy (durations are milliseconds) | oui | — | SEC-02 E2: keys the stored hash of the kfit_device cookie (trusted devices). At least 32 characters; required in production, defaults to AUTH_OTP_PEPPER elsewhere. |
| `AUTH_RECOVERY_GRANT_TTL_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_RECOVERY_RATE_LIMIT_WINDOW_MS` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_RECOVERY_REQUEST_MAX` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_RECOVERY_VERIFY_MAX` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `AUTH_RECOVERY_RESET_MAX` | Sprint 1 authentication policy (durations are milliseconds) | — | — | — |
| `MAILPIT_SMTP_PORT` | Dev SMTP sink (Mailpit) | — | — | — |
| `MAILPIT_UI_PORT` | Dev SMTP sink (Mailpit) | — | — | — |
| `SMTP_HOST` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_PORT` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_SECURE` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_USER` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_PASS` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_FROM` | Dev SMTP sink (Mailpit) | oui | — | — |
| `SMTP_TEST_TO` | Dev SMTP sink (Mailpit) | — | — | — |
| `KFIT_APP_BASE_URL` | S7.2 notifications: absolute base for links in reminder/digest e-mails; jobs on by default (set off to disable). | oui | — | — |
| `KFIT_NOTIFICATION_JOBS` | S7.2 notifications: absolute base for links in reminder/digest e-mails; jobs on by default (set off to disable). | — | — | — |
| `KFIT_PRIVACY_JOBS` | S7.3 privacy: daily purge job of anonymized subjects' private files (set off to disable). | — | — | — |
| `KFIT_PRIVACY_JOURNAL_DIR` | S7.3 privacy: daily purge job of anonymized subjects' private files (set off to disable). | oui | — | Off-database privacy journal directory (one JSONL line per executed anonymization, IDs only). Keep it outside the database backup and back it up separately. Empty = journal disabled (dev warns at startup). A relative path resolves from the repository root (FIX-03), e.g. packages/server/privacy-journal. |
| `CLAMAV_HOST` | Dev malware scanner (ClamAV clamd) | oui | — | — |
| `CLAMAV_PORT` | Dev malware scanner (ClamAV clamd) | oui | — | — |
| `BACKUP_ENCRYPTION_KEY` | Sprint 0 backup/restore pre-flight only. | — | oui | Generate a local 32-byte key, for example with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" Never reuse this example/pre-flight key as a production backup key. |
| `BACKUP_DIR` | S7.4b sauvegardes (npm run ops:backup, ops:restore, ops:restore-drill) : BACKUP_ENCRYPTION_KEY ci-dessus chiffre aussi ces sauvegardes. | — | oui | Deux répertoires distincts, hors de PRIVATE_STORAGE_ROOT et du journal de confidentialité (backups/ est ignoré par git). Chemins relatifs à la racine du dépôt (FIX-03), quel que soit le dossier de lancement. |
| `BACKUP_SECONDARY_DIR` | S7.4b sauvegardes (npm run ops:backup, ops:restore, ops:restore-drill) : BACKUP_ENCRYPTION_KEY ci-dessus chiffre aussi ces sauvegardes. | — | oui | — |
| `BACKUP_PG_MODE` | S7.4b sauvegardes (npm run ops:backup, ops:restore, ops:restore-drill) : BACKUP_ENCRYPTION_KEY ci-dessus chiffre aussi ces sauvegardes. | — | oui | Accès PostgreSQL : docker (docker compose exec dans le service postgres, par défaut) ou native (pg_dump / pg_restore sur le PATH, connexion DATABASE_URL). |
| `BACKUP_COMPOSE_FILE` | S7.4b sauvegardes (npm run ops:backup, ops:restore, ops:restore-drill) : BACKUP_ENCRYPTION_KEY ci-dessus chiffre aussi ces sauvegardes. | — | oui | Fichier compose (vide = docker-compose.yml à la racine du dépôt) et nom du service PostgreSQL. |
| `BACKUP_PG_SERVICE` | S7.4b sauvegardes (npm run ops:backup, ops:restore, ops:restore-drill) : BACKUP_ENCRYPTION_KEY ci-dessus chiffre aussi ces sauvegardes. | — | oui | — |
| `PRIVATE_STORAGE_ROOT` | — | oui | — | Absente de .env.example : voir .env.prod.example. |
