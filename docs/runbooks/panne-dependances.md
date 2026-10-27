---
titre: Panne de dépendance
public: exploitation
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.4a]
---

# Panne de dépendance (PostgreSQL, SMTP, ClamAV)

## Faits disponibles aujourd'hui

| Service    | Variables                                                                      | Au démarrage                                                   | En fonctionnement                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL | `DATABASE_URL`                                                                 | Bloquant : `✖ Database unreachable (…)`, l'API ne démarre pas. | À rédiger - DOC-01b. Les jobs journalisent `✖ <job> could not run (database unavailable?)`.                                                                                  |
| SMTP       | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Non bloquant : `⚠ SMTP unreachable (…)`.                       | Les codes envoyés par e-mail échouent ; les e-mails de notification restent dans `notification_email_outbox` (job `notifications.email-delivery`). Reprise : **À vérifier**. |
| ClamAV     | `CLAMAV_HOST`, `CLAMAV_PORT`                                                   | Non bloquant : `⚠ ClamAV unreachable (…)`.                     | Les dépôts de documents sont refusés avec `DOCUMENT_FILE_SCAN_FAILED` (« L'analyse antivirus est indisponible. Le fichier n'a pas été enregistré. »).                        |

Délai de chaque contrôle au démarrage : 3 secondes ([démarrage production](demarrage-production.md) § 4).

## Diagnostic

À rédiger - DOC-01b.

## Rétablissement

À rédiger - DOC-01b.
