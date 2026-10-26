---
titre: Jobs planifiés et scripts d'exploitation
public: exploitation, développeur
statut: à jour
vérifié-sur: d2fc5df
couvre: [S7.2, S7.3, S7.4a, S7.4b]
---

# Jobs planifiés et scripts d'exploitation

Sources :
- jobs de l'API : `packages/server/src/runtime.ts`, `packages/server/src/modules/notifications/jobs/scheduled-job.runner.ts`, `packages/server/src/modules/privacy/jobs/privacy-purge.job.ts`, `packages/server/src/modules/privacy/services/privacy.policy.ts` ;
- scripts : `packages/server/src/ops/*`.

Toutes les exécutions sont tracées dans la table `scheduled_job_runs`. Le couple (`job_key`, `run_key`) y est unique.

## Jobs de l'API

| `job_key` | Planning | `run_key` | Rôle | Désactivable |
| --- | --- | --- | --- | --- |
| `notifications.reconcile` | toutes les 15 min (`*/15 * * * *`) | début de la fenêtre de 15 min (ISO UTC) | Réconcilie les notifications du coach (S7.2) ; en cas d'échec, l'exécution est marquée `failed` et aucun e-mail ne part sans historique durable. | `KFIT_NOTIFICATION_JOBS=off` (avertissement en production) |
| `notifications.email-delivery` | toutes les 5 min (`*/5 * * * *`) | début de la fenêtre de 5 min (ISO UTC) | Envoie les e-mails en attente ; l'envoi SMTP se fait hors transaction et un échec SMTP ne touche ni les notifications ni les données métier. | `KFIT_NOTIFICATION_JOBS=off` |
| `privacy.purge` | tous les jours à 03:00, Africa/Libreville (`0 3 * * *`) | date du jour à Libreville (`AAAA-MM-JJ`) | Supprime les fichiers des personnes anonymisées dont le délai est échu, par lots de 50. Les blocages de conservation actifs sont respectés. | Non en production (`PRIVACY_JOBS_DISABLED`) ; `KFIT_PRIVACY_JOBS=off` en développement |

Chaque job s'exécute une première fois au démarrage, puis selon son planning.

**Verrou.** Avant chaque exécution, le job prend un verrou consultatif PostgreSQL (`pg_try_advisory_lock` sur `kfit:job:<job_key>`). Une seule instance de l'API exécute donc un job donné à un instant donné. Sans verrou : exécution ignorée (`skipped_locked`), rien n'est écrit.

**Idempotence.**
- Une exécution `succeeded` pour le même `run_key` n'est pas rejouée (`skipped_done`).
- Une exécution `failed`, ou une exécution `running` laissée par un processus arrêté, est reprise avec `attempt + 1`.
- Une exécution en échec enregistre `error_code` : le code de l'erreur s'il a la forme `MAJUSCULES_SOULIGNÉS`, sinon `JOB_FAILED`.

**Journal de l'API.** `✖ <job_key> failed (<code>)` ou `✖ <job_key> could not run (database unavailable?)`.

## Scripts d'exploitation

Lancés à la main ou par un timer de l'hôte (Sprint 9), jamais par l'API ni depuis l'interface (S7.4 D9, D12).

| `job_key` | Commande | `run_key` | Base où la ligne est écrite |
| --- | --- | --- | --- |
| `ops.backup` | `npm run ops:backup` | nom de la sauvegarde (`kfit-backup-<UTC>`) | base source (`DATABASE_URL`), insérée après l'instantané : la sauvegarde ne contient pas sa propre ligne |
| `ops.restore` | `npm run ops:restore -- …` | nom du dossier de la sauvegarde | base restaurée une fois `pg_restore` terminé ; sinon base source |
| `ops.restore_drill` | `npm run ops:restore-drill` | `<sauvegarde>:<identifiant du contrôle>` | base source |

Statuts : `running` (sauvegarde et contrôle seulement), puis `succeeded` ou `failed`. Une nouvelle exécution sur la même clé incrémente `attempt`. `result_json` ne contient que des nombres, des durées et des noms ; `error_code` est un des codes [ops](codes-erreur.md). Détails : [sauvegarde et restauration](../runbooks/sauvegarde-restauration.md).

Le script `privacy:replay` (rejouer les anonymisations après une restauration, base locale du port 5433 uniquement) et `privacy:journal-sync` (compléter le journal depuis la base) n'écrivent pas de ligne `scheduled_job_runs`. `privacy:replay` écrit un événement d'audit `privacy.replay_run`.
