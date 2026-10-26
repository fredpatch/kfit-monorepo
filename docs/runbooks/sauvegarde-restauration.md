---
titre: Sauvegarde et restauration
public: exploitation
statut: à jour
vérifié-sur: 953cb22
couvre: [S7.4b, S7.4c]
---

# Sauvegarde et restauration

Ce runbook s'adresse à la personne qui exploite K'FIT sans l'avoir construit. Chaque étape donne la commande exacte et le résultat attendu.

Sources : `packages/server/scripts/ops/*.mjs`, `packages/server/src/ops/*`. Codes d'erreur : [référence](../reference/codes-erreur.md), section « sauvegarde / restauration (S7.4b) ».

## 1. Principes

**Contenu d'une sauvegarde.** Chaque exécution produit un dossier `kfit-backup-<AAAAMMJJTHHMMSSZ>` (heure UTC, à la seconde), par exemple `kfit-backup-20261026T020000Z`. Il contient quatre fichiers :

| Fichier             | Contenu                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `db.dump.enc`       | La base PostgreSQL complète (`pg_dump` au format custom), chiffrée.                                               |
| `files.tar.enc`     | Tous les fichiers privés (`PRIVATE_STORAGE_ROOT` : documents, photos, justificatifs), en archive `tar`, chiffrée. |
| `journal.jsonl.enc` | Une copie du journal de confidentialité (`KFIT_PRIVACY_JOURNAL_DIR/privacy-journal.jsonl`), chiffrée.             |
| `manifest.json`     | La description signée de la sauvegarde (en clair, sans donnée client).                                            |

**Chiffrement.** Chaque fichier est chiffré en AES-256-GCM avec la clé `BACKUP_ENCRYPTION_KEY`, en flux, avec un vecteur d'initialisation aléatoire propre à chaque fichier. Sans la clé, une sauvegarde est illisible et ne peut pas être restaurée.

**Manifeste signé.** `manifest.json` contient :

- la date, le nom de la base source (jamais l'hôte ni les identifiants) et la dernière migration appliquée ;
- le nombre de lignes de chaque table et le nombre et la taille des fichiers privés ;
- le nombre de lignes du journal ;
- l'empreinte SHA-256 de chaque fichier chiffré ;
- l'empreinte de la clé (16 caractères, pas la clé) et une signature HMAC.

Toute modification d'un champ ou d'un fichier est détectée avant la moindre restauration.

**Écriture sûre.** La sauvegarde est d'abord écrite dans un dossier temporaire `.tmp-kfit-backup-…`, puis renommée une fois complète. Chaque fichier est ensuite relu et son empreinte vérifiée. Une sauvegarde incomplète ne porte donc jamais le nom final.

**Copie secondaire.** La sauvegarde vérifiée est copiée dans `BACKUP_SECONDARY_DIR`, puis la copie est elle-même vérifiée.

**Rotation.** Après chaque sauvegarde, dans les deux dossiers, sont conservées :

- la dernière sauvegarde de chacun des 7 jours les plus récents ;
- la dernière sauvegarde de chacune des 4 semaines ISO les plus récentes.

Les jours et les semaines suivent le calendrier de Libreville. Une sauvegarde est donc datée du jour où elle a été faite à Libreville, même si son nom est en heure UTC. La sauvegarde la plus récente n'est jamais supprimée. Un dossier qui n'est pas une sauvegarde valide n'est jamais supprimé : dossier temporaire, fichier étranger, ou sauvegarde dont le manifeste ne se vérifie pas avec la clé actuelle.

**Journal de confidentialité : jamais écrasé.** Le journal liste les anonymisations exécutées (identifiants uniquement). Le journal en service peut contenir des anonymisations faites _après_ la sauvegarde. À la restauration, il n'est donc jamais remplacé. Seules les lignes de la sauvegarde absentes du journal en service (comparaison par `eventId`) y sont ajoutées. Ensuite, le « replay » réapplique toutes les anonymisations connues (journal ∪ base restaurée) à la base restaurée. Ainsi, une personne anonymisée après la sauvegarde reste anonymisée après restauration.

**Traçabilité.** Chaque exécution laisse une ligne dans la table `scheduled_job_runs` :

- `job_key` vaut `ops.backup`, `ops.restore` ou `ops.restore_drill` ;
- `status` passe de `running` à `succeeded` ou `failed` ;
- `result_json` ne contient que des nombres, des durées et le nom de la sauvegarde ;
- `error_code` porte le code d'échec.

## 2. Préparer

### 2.1 Variables d'environnement

| Variable                                        | Rôle                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `BACKUP_ENCRYPTION_KEY`                         | Clé de chiffrement : exactement 64 caractères hexadécimaux.                                                                   |
| `BACKUP_DIR`                                    | Dossier principal des sauvegardes.                                                                                            |
| `BACKUP_SECONDARY_DIR`                          | Dossier de la copie secondaire (idéalement un autre disque ou montage).                                                       |
| `BACKUP_PG_MODE`                                | `docker` (par défaut) ou `native`, voir 2.3.                                                                                  |
| `BACKUP_COMPOSE_FILE`                           | Fichier compose à utiliser en mode `docker` (vide = `docker-compose.yml` à la racine du dépôt).                               |
| `BACKUP_PG_SERVICE`                             | Nom du service PostgreSQL dans le fichier compose (par défaut `postgres`).                                                    |
| `DATABASE_URL`                                  | Base source. Elle doit être joignable depuis la machine qui lance le script (lignes `scheduled_job_runs`, comptages, replay). |
| `PRIVATE_STORAGE_ROOT`                          | Dossier des fichiers privés (par défaut `storage/private/documents` à la racine du dépôt).                                    |
| `KFIT_PRIVACY_JOURNAL_DIR`                      | Dossier du journal de confidentialité. Facultatif pour la sauvegarde, **obligatoire** pour `ops:restore`.                     |
| `AUTH_OTP_PEPPER` (ou `AUTH_AUDIT_HASH_PEPPER`) | Nécessaire à `ops:restore` et `ops:restore-drill` (le replay écrit un événement d'audit).                                     |

Les scripts lisent le fichier `.env` de la racine du dépôt s'il existe. Sinon, ils utilisent l'environnement du processus (cas de la production). Une variable déjà présente dans l'environnement n'est jamais remplacée par le `.env`.

Règles vérifiées au démarrage du script (échec `ENV_INVALID`) :

- `BACKUP_DIR` et `BACKUP_SECONDARY_DIR` sont différents et aucun n'est contenu dans l'autre ;
- aucun des deux n'est dans `PRIVATE_STORAGE_ROOT` ni dans le dossier du journal, et inversement.

Les chemins relatifs (variables et options `--bundle`, `--files-target`) sont résolus depuis le dossier courant. Avec `npm run ops:*`, c'est toujours `packages/server`. En lançant `node` directement, se placer d'abord dans `packages/server`. Sinon, un `KFIT_PRIVACY_JOURNAL_DIR` relatif désigne un autre dossier, et la restauration écrit dans un journal qui n'est pas celui de l'API. Utiliser de préférence des **chemins absolus**.

**Windows : chemins avec une espace.** Passé par `npm run …` (cmd, PowerShell ou Git Bash), un chemin contenant une espace arrive au script avec un `^` final, par exemple `…\Prime Daily\…\kfit-backup-…Z^`. La restauration s'arrête alors sur `MANIFEST_INVALID` sans rien écrire. Dans ce cas, utiliser un chemin sans espace, ou compiler puis appeler le script directement :

```bash
npm run build --workspace @kfit/server
cd packages/server
node scripts/ops/restore.mjs --bundle "C:/Chemin avec espace/kfit-backup-20261026T020000Z" --target-db kfit_restore_manual --files-target "C:/Chemin avec espace/fichiers"
```

Constaté le 2026-10-26 sous Windows. Sous Linux : **À vérifier** au Sprint 9.

Exemple de `.env` local (valeurs fictives) :

```dotenv
BACKUP_DIR=../../backups/primary
BACKUP_SECONDARY_DIR=../../backups/secondary
BACKUP_PG_MODE=docker
BACKUP_COMPOSE_FILE=
BACKUP_PG_SERVICE=postgres
```

### 2.2 Générer et conserver la clé

1. Générer une clé :

   ```bash
   openssl rand -hex 32
   ```

   ou, sans OpenSSL :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. La placer dans l'environnement du serveur (`BACKUP_ENCRYPTION_KEY`), jamais dans le dépôt.
3. En conserver **au moins une copie hors du serveur et hors du dépôt**, par exemple dans un gestionnaire de mots de passe et sur une copie papier dans un lieu sûr. Si le serveur est perdu, cette copie est la seule façon de relire les sauvegardes.
4. Ne jamais afficher la clé dans un ticket, un message ou un journal. Les scripts ne l'affichent jamais.

**Changer de clé.** Les sauvegardes faites avec l'ancienne clé ne se vérifient plus avec la nouvelle (`BACKUP_KEY_INVALID`). La rotation ne les supprime pas, car leur manifeste n'est plus valide. Il faut donc :

- conserver l'ancienne clé tant que ces sauvegardes sont utiles ;
- puis supprimer ces dossiers à la main.

### 2.3 Mode d'accès PostgreSQL

- **`docker`** (par défaut). `pg_dump` et `pg_restore` s'exécutent _dans_ le conteneur PostgreSQL :

  ```bash
  docker compose [-f BACKUP_COMPOSE_FILE] exec -T <BACKUP_PG_SERVICE> …
  ```

  Ils s'exécutent avec l'utilisateur `POSTGRES_USER` du conteneur, et aucun identifiant ne sort du conteneur. C'est le mode prévu pour la production, où PostgreSQL n'est pas exposé à l'hôte.

- **`native`** : `pg_dump`, `pg_restore` et la connexion viennent de l'hôte (outils sur le `PATH`, connexion lue dans `DATABASE_URL`). Le mot de passe passe par l'environnement du processus, jamais par la ligne de commande. C'est le mode de la CI.

Dans les deux cas, la version majeure de `pg_dump` / `pg_restore` doit être au moins celle du serveur. Sinon, le script refuse avec `PG_CLIENT_TOO_OLD`.

## 3. Sauvegarder manuellement et vérifier

1. Depuis la racine du dépôt :

   ```bash
   npm run ops:backup
   ```

   Le script compile le serveur (`npm run build`), puis lance la sauvegarde.

2. Résultat attendu : une ligne JSON sur la sortie standard et le code de sortie `0`. Exemple (valeurs fictives) :

   ```json
   {
     "job": "ops.backup",
     "status": "succeeded",
     "recorded": true,
     "bundle": "kfit-backup-20261026T020000Z",
     "durationMs": 1250,
     "bundleBytes": 4628220,
     "databaseBytes": 316697,
     "tables": 57,
     "rows": 1900,
     "files": 26,
     "fileBytes": 4279740,
     "journalLines": 2,
     "keptPrimary": 1,
     "deletedPrimary": 0,
     "keptSecondary": 1,
     "deletedSecondary": 0,
     "pgMode": "docker",
     "pgDump": "pg_dump (PostgreSQL) 16.15",
     "tar": "tar (GNU tar) 1.35"
   }
   ```

   | Champ                 | Lecture                                                                                   |
   | --------------------- | ----------------------------------------------------------------------------------------- |
   | `status` / `recorded` | `succeeded` et `true` : sauvegarde complète et ligne écrite dans `scheduled_job_runs`.    |
   | `tables`, `rows`      | Nombre de tables et total de lignes sauvegardées.                                         |
   | `files`, `fileBytes`  | Nombre et taille des fichiers privés sauvegardés.                                         |
   | `journalLines`        | Lignes du journal de confidentialité copiées.                                             |
   | `kept…` / `deleted…`  | Résultat de la rotation dans chaque dossier.                                              |
   | `pgDump`, `tar`       | Outils réellement utilisés (sous Windows, `tar` est toujours `System32\tar.exe`, bsdtar). |

3. En cas d'échec :
   - la sortie standard affiche la même ligne JSON avec `"status":"failed"`, `errorCode` et `detail` ;
   - la sortie d'erreur affiche `✖ ops.backup failed: <CODE> (<détail>)` ;
   - le code de sortie vaut `1` ;
   - voir [§ 8 Dépannage](#8-dépannage).

   Si la ligne d'exécution n'a pas pu être écrite (base injoignable), la sortie d'erreur affiche aussi `✖ ops.backup: run not recorded in scheduled_job_runs (database unreachable)`, et le code de sortie vaut `1`.

4. Vérifier la ligne d'exécution :

   ```sql
   select job_key, run_key, status, error_code, attempt, started_at, finished_at
   from scheduled_job_runs where job_key = 'ops.backup' order by started_at desc limit 5;
   ```

   Attendu : une ligne `run_key = kfit-backup-…`, `status = succeeded`, `error_code` vide.

5. Vérifier les dossiers : `BACKUP_DIR/kfit-backup-…/` et `BACKUP_SECONDARY_DIR/kfit-backup-…/` contiennent chacun les 4 fichiers. Aucun dossier `.tmp-…` ne doit rester.

## 4. Planifier (installé au Sprint 9)

La sauvegarde est lancée par un timer de l'hôte, pas par l'API (décision S7.4 D8). L'installation se fait au Sprint 9. Les exemples ci-dessous sont des modèles : chemins et utilisateur sont fictifs.

**systemd** (`/etc/systemd/system/kfit-backup.service`) :

```ini
[Unit]
Description=K'FIT sauvegarde chiffrée

[Service]
Type=oneshot
User=kfit
WorkingDirectory=/opt/kfit
EnvironmentFile=/etc/kfit/backup.env
ExecStart=/usr/bin/npm run ops:backup
```

`/etc/systemd/system/kfit-backup.timer` :

```ini
[Unit]
Description=K'FIT sauvegarde quotidienne

[Timer]
OnCalendar=*-*-* 02:00:00 Africa/Libreville
Persistent=true

[Install]
WantedBy=timers.target
```

Activer : `systemctl enable --now kfit-backup.timer`. Contrôler : `systemctl list-timers kfit-backup.timer` et `journalctl -u kfit-backup.service`.

**cron** (alternative) :

```cron
CRON_TZ=Africa/Libreville
0 2 * * * cd /opt/kfit && /usr/bin/npm run ops:backup >> /var/log/kfit/backup.log 2>&1
```

Le contrôle de restauration hebdomadaire (§ 5) se planifie de la même façon, par exemple le dimanche à 04:00 avec `npm run ops:restore-drill`.

## 5. Contrôle de restauration (`ops:restore-drill`)

**Fréquence recommandée** : une fois par semaine, et après chaque changement de clé, de serveur ou de version de PostgreSQL.

**Ce que fait le contrôle :**

1. Il choisit la sauvegarde valide la plus récente de `BACKUP_DIR`. On peut en imposer une avec `--bundle <dossier>`.
2. Il vérifie le manifeste et les empreintes, puis restaure dans une base jetable `kfit_restore_<8 caractères hexadécimaux>` et un dossier temporaire.
3. Avant le replay, il compare au manifeste :
   - le nombre de lignes de chaque table ;
   - le nombre et la taille des fichiers ;
   - la dernière migration.
4. Il exécute le replay avec le journal en service ∪ le journal de la sauvegarde. Le journal en service est seulement **lu** : le contrôle n'y écrit rien.
5. Il supprime **toujours** la base jetable et le dossier temporaire, puis vérifie que la base n'existe plus.
6. Il écrit sa ligne `ops.restore_drill` dans la base source. `run_key` vaut `<sauvegarde>:<identifiant du contrôle>`.

**Commande :**

```bash
npm run ops:restore-drill
# ou pour une sauvegarde précise (chemin absolu conseillé) :
npm run ops:restore-drill -- --bundle /chemin/absolu/vers/kfit-backup-20261026T020000Z
```

**Résultat attendu** (valeurs fictives), code de sortie `0` :

```json
{
  "job": "ops.restore_drill",
  "status": "succeeded",
  "recorded": true,
  "bundle": "kfit-backup-20261026T020000Z",
  "targetDb": "kfit_restore_1a2b3c4d",
  "tables": 57,
  "rows": 1900,
  "files": 26,
  "fileBytes": 4279740,
  "journalLive": 2,
  "journalBundle": 2,
  "journalMalformed": 0,
  "replayEvents": 2,
  "replayFromJournalOnly": 0,
  "replayReplayed": 2,
  "replayMissingSubject": 0,
  "replayPurged": 0,
  "replaySkippedHold": 0,
  "replayPurgeFailed": 0,
  "replayJournalMalformed": 0,
  "durationMs": 3456
}
```

**Lecture :**

| Champ                                        | Lecture                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `status` = `succeeded`                       | Les comptages, les fichiers et la migration correspondent au manifeste ; le replay est passé ; la base jetable est supprimée.        |
| `replayFromJournalOnly`                      | Anonymisations connues seulement du journal (faites après la sauvegarde) et réappliquées.                                            |
| `replayMissingSubject`                       | Événements dont la personne n'existe pas dans la base restaurée. Ce n'est pas une erreur, mais une hausse inattendue est à examiner. |
| `replayPurgeFailed`                          | Doit valoir `0`. Sinon : échec `DRILL_MISMATCH`.                                                                                     |
| `journalMalformed`, `replayJournalMalformed` | Lignes illisibles du journal. Doivent valoir `0` ; sinon, examiner le journal.                                                       |

**Échecs :**

- `DRILL_MISMATCH` avec un détail `table counts N`, `files`, `migration` ou `replay purge failed N` : la sauvegarde ne correspond pas à son manifeste. Ne pas s'y fier : faire une nouvelle sauvegarde et relancer le contrôle.
- Autres codes : [§ 8](#8-dépannage).

Vérifier qu'aucune base jetable ne reste (mode docker, développement) :

```bash
docker compose exec -T postgres psql -U kfit -d postgres -Atc "select datname from pg_database where datname like 'kfit_restore_%'"
```

Attendu : aucune ligne.

## 6. Restaurer en situation réelle

À n'utiliser qu'après une perte de données ou de serveur. Suivre l'ordre exact.

1. **Couper le trafic.** Arrêter l'API (signal `SIGTERM` ou `Ctrl+C` sur `npm run start:prod`) pour qu'aucune écriture n'arrive pendant la restauration. Le mode maintenance côté proxy est prévu au Sprint 9.
2. **Choisir et vérifier la sauvegarde.** Prendre la plus récente de `BACKUP_DIR`, ou de `BACKUP_SECONDARY_DIR` si le dossier principal est perdu. La vérification complète (manifeste, clé, empreintes) est faite par `ops:restore` **avant toute écriture**. Pour la vérifier sans rien restaurer, lancer d'abord `npm run ops:restore-drill -- --bundle <dossier>`.
3. **Restaurer dans une base cible**, avec les fichiers et le journal :

   ```bash
   npm run ops:restore -- --bundle /chemin/absolu/kfit-backup-20261026T020000Z --target-db kfit_restored_20261027 --files-target /chemin/absolu/storage-restaure
   ```

   - `--target-db` : nom simple en minuscules (lettres, chiffres, `_`). La base est créée si elle n'existe pas.
   - `--files-target` : dossier où les fichiers privés sont extraits. Il est créé s'il n'existe pas.
   - `--confirm-overwrite` : obligatoire si la base cible contient déjà des tables ou si le dossier n'est pas vide. Dans ce cas, `pg_restore` supprime puis recrée les objets (`--clean --if-exists`). Les fichiers de la sauvegarde remplacent ceux du dossier, mais les fichiers absents de la sauvegarde y restent. Ce chemin a été vérifié à la main le 2026-10-26 sur le cluster de développement : comptages revenus à ceux du manifeste. Il n'a pas de test automatique : préférer une base et un dossier neufs.
   - **Refus attendus, quels que soient les options :**
     - `--target-db kfit_dev` ou `kfit_test` → `TARGET_FORBIDDEN` ;
     - un nom qui n'est pas un identifiant simple → `TARGET_FORBIDDEN`.

   Ordre interne exécuté par le script :
   1. manifeste et clé ;
   2. empreintes des 3 fichiers ;
   3. contrôle de la cible ;
   4. création de la base et `pg_restore --no-owner --exit-on-error` ;
   5. extraction des fichiers ;
   6. fusion du journal : ajout dans `KFIT_PRIVACY_JOURNAL_DIR` des seules lignes absentes ;
   7. **replay automatique** depuis la date de la sauvegarde moins 24 h (marge de sécurité) ; les fichiers des personnes anonymisées sont supprimés de `--files-target`.

4. **Lire le résultat** (code de sortie `0`, valeurs fictives) :

   ```json
   {
     "job": "ops.restore",
     "status": "succeeded",
     "recorded": true,
     "bundle": "kfit-backup-20261026T020000Z",
     "targetDb": "kfit_restored_20261027",
     "durationMs": 5200,
     "journalLive": 3,
     "journalBundle": 2,
     "journalAppended": 0,
     "journalMalformed": 0,
     "replayEvents": 3,
     "replayFromJournalOnly": 1,
     "replayReplayed": 3,
     "replayMissingSubject": 0,
     "replayPurged": 1,
     "replaySkippedHold": 0,
     "replayPurgeFailed": 0,
     "replayJournalMalformed": 0
   }
   ```

   - `journalAppended` : lignes de la sauvegarde ajoutées au journal en service.
   - `replayFromJournalOnly` : anonymisations postérieures à la sauvegarde, réappliquées.
   - La ligne `ops.restore` est écrite **dans la base restaurée**. Si l'échec survient avant la fin de `pg_restore`, elle est écrite dans la base de `DATABASE_URL`.

5. **Contrôles avant réouverture :**
   - `replayPurgeFailed = 0` et `journalMalformed = 0`.
   - Comparer le nombre de lignes de quelques tables clés (`customers`, `subscriptions`, `payment_events`) avec les comptages du `manifest.json` de la sauvegarde (`tableCounts`). Certaines tables diffèrent normalement après le replay : `audit_events` (+1 événement `privacy.replay_run`), `scheduled_job_runs` (+1 ligne `ops.restore`) et les tables touchées par l'anonymisation et la purge des fichiers.
   - Vérifier qu'une personne anonymisée après la sauvegarde l'est bien (`anonymized_at` renseigné).
6. **Brancher l'application sur la base et les fichiers restaurés.** Faire pointer `DATABASE_URL` sur la base cible et `PRIVATE_STORAGE_ROOT` sur `--files-target`. **À vérifier — Sprint 9** : procédure exacte avec le compose de production.
7. **Réouvrir le trafic** : `npm run start:prod`, puis contrôler le démarrage ([démarrage production](demarrage-production.md)) et `GET /health`.

Codes d'erreur → action : [§ 8](#8-dépannage).

## 7. Exercice complet S7.4c (pour Fred)

Objectif : prouver de bout en bout qu'une sauvegarde se restaure et qu'une anonymisation faite après la sauvegarde survit à la restauration (S7.4 D10, D11).

**Possible en local aujourd'hui** (cluster de développement, mode `docker`, bases `kfit_restore_*` uniquement) :

- [ ] 1. Appliquer les migrations sur `kfit_dev` : `npm run db:migrate`.
- [ ] 2. Renseigner dans `.env` : `BACKUP_DIR`, `BACKUP_SECONDARY_DIR`, `BACKUP_ENCRYPTION_KEY` (64 hex), `KFIT_PRIVACY_JOURNAL_DIR`.
- [ ] 3. Créer dans l'application un client de test archivé, avec au moins un document. Noter son nom.
- [ ] 4. `npm run ops:backup` → `status: succeeded`, code `0`, une ligne `ops.backup` en base.
- [ ] 5. Anonymiser ce client dans l'application **après** la sauvegarde. Le journal reçoit une ligne.
- [ ] 6. `npm run ops:restore-drill` → `succeeded`, `replayFromJournalOnly ≥ 1`, aucune base `kfit_restore_%` restante.
- [ ] 7. Restauration réelle dans une base de test :

  ```bash
  npm run ops:restore -- --bundle <chemin absolu du dossier kfit-backup-…> --target-db kfit_restore_manual --files-target <chemin absolu d'un dossier vide>
  ```

  → `succeeded`, `replayFromJournalOnly ≥ 1`.

- [ ] 8. Contrôler dans `kfit_restore_manual` que le client est anonymisé :

  ```bash
  docker compose exec -T postgres psql -U kfit -d kfit_restore_manual -c "select full_name, anonymized_at from customers where anonymized_at is not null order by anonymized_at desc limit 3"
  ```

- [ ] 9. Contrôler la ligne `ops.restore` dans `kfit_restore_manual.scheduled_job_runs`.
- [ ] 10. Falsification : copier un dossier de sauvegarde, modifier un octet de `files.tar.enc`, lancer `ops:restore` sur la copie avec `--target-db kfit_restore_tamper`. Attendu : `VERIFY_FAILED`, code `1`, et la base `kfit_restore_tamper` n'existe pas.
- [ ] 11. Refus : `--target-db kfit_test` → `TARGET_FORBIDDEN`. Le refus arrive avant toute écriture, et le script ne fait que lire la liste des bases.
- [ ] 12. Nettoyer :

  ```bash
  docker compose exec -T postgres psql -U kfit -d postgres -c "drop database if exists kfit_restore_manual with (force)"
  ```

  Supprimer aussi le dossier `--files-target` et les sauvegardes de test.

**Attend le Sprint 9 :**

- Exercice sur `docker-compose.prod.yml`. Le service `postgres` de production est sur un réseau interne sans port publié, alors que les scripts ont besoin de `DATABASE_URL` joignable depuis l'hôte (comptages, lignes d'exécution, replay). Le mode d'accès reste à décider au Sprint 9 : port publié sur `127.0.0.1` ou scripts lancés dans le réseau.
- Timer de l'hôte (§ 4), copie hors serveur, coupure du trafic par le proxy, bascule de l'API sur la base restaurée.

## 8. Dépannage

Chaque échec affiche `✖ <job> failed: <CODE> (<détail>)` et sort avec le code `1`. Le détail ne contient jamais de chemin, d'hôte, de clé ni d'identifiant de personne.

| Code                    | Cause                                                                                                                                                                                                                                           | Action                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENV_INVALID`           | Variable manquante (`DATABASE_URL`, `BACKUP_DIR`, `BACKUP_SECONDARY_DIR`, `KFIT_PRIVACY_JOURNAL_DIR` pour la restauration, pepper d'audit), `BACKUP_PG_MODE` inconnu, dossiers confondus ou imbriqués, ou arguments de `ops:restore` manquants. | Lire le détail (il nomme la variable) et corriger l'environnement.                                                                                                                                                                                                                                                                      |
| `BACKUP_KEY_INVALID`    | Clé absente ou pas en 64 hexadécimaux ; ou, à la restauration, clé différente de celle de la sauvegarde (« key fingerprint mismatch »).                                                                                                         | Corriger `BACKUP_ENCRYPTION_KEY`. Pour une ancienne sauvegarde, utiliser la clé de l'époque.                                                                                                                                                                                                                                            |
| `PG_CLIENT_TOO_OLD`     | `pg_dump` / `pg_restore` d'une version majeure inférieure au serveur.                                                                                                                                                                           | Installer un client PostgreSQL de même version majeure, ou passer en mode `docker`.                                                                                                                                                                                                                                                     |
| `DUMP_FAILED`           | Base source injoignable, `pg_dump` ou `tar` indisponible ou en échec, `PRIVATE_STORAGE_ROOT` absent, fichiers illisibles.                                                                                                                       | Vérifier PostgreSQL (`docker compose ps`), le chemin des fichiers privés et les droits. Relancer.                                                                                                                                                                                                                                       |
| `ENCRYPT_FAILED`        | Écriture d'un fichier chiffré ou du manifeste impossible (disque plein, droits).                                                                                                                                                                | Vérifier l'espace disque et les droits sur `BACKUP_DIR`.                                                                                                                                                                                                                                                                                |
| `VERIFY_FAILED`         | Empreinte d'un fichier différente du manifeste (fichier corrompu ou modifié), ou sauvegarde du même nom déjà présente.                                                                                                                          | Ne pas utiliser cette sauvegarde. Prendre la copie de `BACKUP_SECONDARY_DIR` ou une sauvegarde antérieure.                                                                                                                                                                                                                              |
| `SECONDARY_COPY_FAILED` | Copie ou vérification de la copie secondaire impossible. La sauvegarde principale est valide.                                                                                                                                                   | Vérifier `BACKUP_SECONDARY_DIR` (montage, espace, droits) et relancer une sauvegarde.                                                                                                                                                                                                                                                   |
| `ROTATION_FAILED`       | Suppression d'une ancienne sauvegarde impossible. La nouvelle sauvegarde est valide.                                                                                                                                                            | Vérifier les droits du dossier indiqué dans le détail.                                                                                                                                                                                                                                                                                  |
| `MANIFEST_INVALID`      | `manifest.json` absent, illisible ou modifié (signature invalide) ; ou aucune sauvegarde valide dans `BACKUP_DIR` pour le contrôle.                                                                                                             | Prendre une autre sauvegarde. Ne jamais corriger un manifeste à la main.                                                                                                                                                                                                                                                                |
| `TARGET_FORBIDDEN`      | Base cible `kfit_dev`, `kfit_test` ou nom non conforme.                                                                                                                                                                                         | Choisir un autre nom (en développement : `kfit_restore_*`).                                                                                                                                                                                                                                                                             |
| `TARGET_NOT_EMPTY`      | La base cible a des tables ou le dossier cible n'est pas vide.                                                                                                                                                                                  | Choisir une base et un dossier neufs, ou ajouter `--confirm-overwrite` en connaissance de cause.                                                                                                                                                                                                                                        |
| `RESTORE_FAILED`        | Création de la base, `pg_restore`, extraction des fichiers ou lecture/écriture du journal en échec ; base jetable impossible à supprimer après un contrôle.                                                                                     | Lire le détail. Supprimer la base cible partielle, corriger, relancer dans une base neuve.                                                                                                                                                                                                                                              |
| `REPLAY_FAILED`         | Le replay des anonymisations a échoué.                                                                                                                                                                                                          | **Ne pas rouvrir le trafic.** Le replay est idempotent et rejoue chaque événement dans sa propre transaction. Aucune commande ne relance le replay seul sur une base cible (`privacy:replay` ne vise que la base locale du port 5433) : **À vérifier**. Relancer `ops:restore` dans une base neuve, puis escalader si l'échec persiste. |
| `DRILL_MISMATCH`        | Le contrôle a trouvé un écart avec le manifeste (`table counts N`, `files`, `migration`) ou des purges en échec.                                                                                                                                | Faire une nouvelle sauvegarde et relancer le contrôle. Si l'écart persiste, escalader.                                                                                                                                                                                                                                                  |

Si le script affiche `run not recorded in scheduled_job_runs (database unreachable)`, la base de suivi était injoignable. Vérifier PostgreSQL, puis relancer pour obtenir une trace.
