---
titre: Jobs planifiés et scripts d'exploitation
public: exploitation, développeur
statut: à jour
vérifié-sur: bb2e993
couvre: [S7.2, S7.3, S7.4a, S7.4b, OPS-01a]
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

## Supervision (OPS-01)

Sources : `packages/server/src/modules/supervision/*`, `packages/shared/src/supervision/contracts.ts`. L'API est en place (OPS-01a) ; la page « Supervision » de l'interface arrive avec OPS-01b. Toutes les routes exigent une session administrateur (un coach reçoit `403 SUPERVISION_ADMIN_FORBIDDEN`). Les réponses ne contiennent que des nombres, des dates et des codes : jamais d'adresse IP, d'e-mail, de nom de cliente, de nom de fichier ou d'identifiant de personne du journal.

| Route | Rôle |
| --- | --- |
| `GET /admin/supervision/overview` | Alertes en cours, état de chaque job, dernière sauvegarde, dernier contrôle de restauration, confidentialité, version de Node et contrôles de production. |
| `GET /admin/supervision/status` | `{ level: ok \| warning \| critical, alertCount }`, à partir des notifications de supervision ouvertes de l'administrateur (pastille du menu). |
| `GET /admin/supervision/security?days=7\|30` | Une ligne par jour de Libreville, à zéro quand rien ne s'est passé : connexions refusées, codes faux ou bloqués, initialisations refusées, refus par limite de débit (par portée), corps compressés refusés, liens publics invalides ou expirés. |
| `POST /admin/supervision/jobs/<job_key>/run` | Lance tout de suite `notifications.reconcile` ou `notifications.email-delivery` (autres jobs : `400 SUPERVISION_JOB_NOT_RUNNABLE`). |
| `POST /admin/supervision/jobs/privacy.purge/simulate` | Compte ce que la suppression des fichiers ferait maintenant, sans rien supprimer. |

**État d'un job.** Dernière exécution (statut, début, durée, tentative, code d'erreur), dernière réussite, prochaine exécution, taux d'échec sur 30 jours. Un job est :
- `late` (en retard) quand sa dernière réussite date de plus de 2 intervalles ;
- `failing` (en échec) quand au moins la moitié de ses 10 dernières exécutions terminées ont échoué, ou les 3 dernières ;
- `never_run` quand il n'a aucune exécution (normal en développement si les jobs sont désactivés).

**Lancement manuel.** Même verrou et même travail que le planning, avec la clé `manual:<uuid>` : il laisse sa propre ligne dans `scheduled_job_runs`. Un lancement par job et par minute (sinon `429 SUPERVISION_RATE_LIMITED`, compté `RATE_LIMITED:supervision_run`). Si le job tourne déjà : `409 SUPERVISION_JOB_BUSY`. Chaque lancement est audité (`ops.job.manual_run` : job, résultat, durée). La route exige le jeton CSRF et la même origine.

**Simulation de la suppression des fichiers.** Même sélection que `privacy.purge` (documents `pending_purge` dont le délai est échu, blocages de conservation respectés), dans une transaction en lecture seule. Réponse : `subjectsDue` (personnes), `filesDue` (fichiers), `bytesDue` (octets), `heldBack` (documents retenus par un blocage). Rien n'est supprimé, aucune ligne `scheduled_job_runs` n'est écrite ; seul l'audit `ops.purge.simulated` est ajouté.

**Alertes.**

| Code | Gravité | Condition |
| --- | --- | --- |
| `BACKUP_STALE` | critique | Dernière sauvegarde réussie de plus de 26 heures, ou aucune en production. |
| `BACKUP_FAILED` | critique | La dernière sauvegarde (plus récente que la dernière réussite) a échoué. |
| `RESTORE_CHECK_FAILED` | critique | Le dernier contrôle de restauration a échoué. |
| `RESTORE_CHECK_STALE` | avertissement | Dernier contrôle de restauration de plus de 8 jours, ou aucun en production. |
| `PRIVACY_JOURNAL_UNAVAILABLE` | critique | Le dossier du journal n'est pas accessible en écriture (vérification sans écriture), ou n'est pas configuré en production. |
| `PURGE_FAILED` | avertissement | La dernière exécution de `privacy.purge` a échoué. |
| `SECURITY_FLOOR_NOT_MET` | critique | Node est sous le [plancher de sécurité](../runbooks/plancher-securite.md). |
| `JOB_FAILING` | avertissement | Un job est en échec (voir ci-dessus). |
| `JOB_LATE` | avertissement | Un job est en retard. |
| `JOB_NEVER_RUN` | avertissement | Un job ne s'est jamais exécuté (production seulement). |

**Notifications et e-mails.** `notifications.reconcile` calcule ces alertes à chaque passage. Chaque alerte ouvre une notification « Alerte de supervision » pour chaque administrateur actif (jamais un coach), avec un lien vers `/admin/supervision`, et la ferme quand la condition disparaît. La colonne `severity` ne connaît que `warning` et `info` : une alerte critique est enregistrée `warning`, la gravité exacte reste dans l'API. E-mail : réglage « Alertes de supervision » (`notifications.supervision_alert.email_enabled`), activé par défaut. Au plus un e-mail par alerte, par administrateur et par jour de Libreville (clé d'envoi `supervision:<administrateur>:<alerte>:<AAAA-MM-JJ>`) : une alerte qui disparaît puis revient le même jour n'est pas renvoyée, une alerte qui dure est rappelée une fois par jour.
