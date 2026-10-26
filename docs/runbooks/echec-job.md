---
titre: Échec de job
public: exploitation
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.2, S7.3, S7.4b]
---

# Échec de job

## Faits disponibles aujourd'hui

- Liste des jobs, planning, verrou et idempotence : [jobs](../reference/jobs.md).
- Trace : table `scheduled_job_runs` (`job_key`, `run_key`, `status`, `attempt`, `error_code`, `result_json`).
- Dans le journal de l'API : `✖ <job_key> failed (<code>)` ou `✖ <job_key> could not run (database unavailable?)`.
- Jobs de l'API : une exécution `failed` est retentée au réveil suivant avec `attempt + 1`. Une exécution `succeeded` pour la même clé n'est pas rejouée.
- Scripts ops : codes et actions dans [sauvegarde et restauration](sauvegarde-restauration.md) § 8.

Dernières exécutions en échec :

```sql
select job_key, run_key, status, error_code, attempt, started_at
from scheduled_job_runs where status = 'failed' order by started_at desc limit 20;
```

## Par job

À rédiger — DOC-01b : `notifications.reconcile`, `notifications.email-delivery`, `privacy.purge`.

## Relancer

À rédiger — DOC-01b.
