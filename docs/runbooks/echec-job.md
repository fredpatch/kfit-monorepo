---
titre: Échec de job
public: exploitation
statut: brouillon
vérifié-sur: 99f2616
couvre: [S7.2, S7.3, S7.4b, OPS-01a, OPS-01b]
---

# Échec de job

## Commencer par la Supervision

1. Se connecter avec le compte super-administrateur, ouvrir « Configuration › Supervision ».
2. Lire le bandeau d'alertes en haut de la page : une ligne par alerte en cours.
3. Dans « Jobs planifiés », repérer le job en « En échec », « En retard » ou « Jamais exécuté » : intervalle, taux d'échec sur 30 jours, dernière exécution et sa durée, prochaine exécution.
4. Pour `notifications.reconcile` et `notifications.email-delivery` : « Lancer maintenant ». Résultat attendu : le message « Job lancé : réussi en … » et l'état « Réussi » après la mise à jour de la page. « Ce job est déjà en cours. » : attendre la fin. « Patiente une minute avant de relancer ce job. » : un seul lancement par minute.
5. Pour `privacy.purge` : « Simuler » affiche les comptes (« Rien n'a été supprimé. »), puis voir [Relancer](#relancer).
6. Si l'état ne change pas, chercher le code d'erreur dans `scheduled_job_runs` (ci-dessous).

Détails : [jobs § Supervision](../reference/jobs.md#supervision-ops-01).

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

À rédiger - DOC-01b : `notifications.reconcile`, `notifications.email-delivery`, `privacy.purge`.

## Relancer

- `notifications.reconcile` et `notifications.email-delivery` : `POST /admin/supervision/jobs/<job_key>/run` (super-administrateur, une fois par minute et par job). `409 SUPERVISION_JOB_BUSY` : une exécution est déjà en cours, attendre la fin. Sinon, le job repart seul au réveil suivant.
- `privacy.purge` : pas de lancement manuel. `POST /admin/supervision/jobs/privacy.purge/simulate` montre ce que la prochaine exécution supprimerait, sans rien supprimer. L'exécution réelle repart à 03:00 (Libreville) ou au redémarrage de l'API.
- Scripts ops : [sauvegarde et restauration](sauvegarde-restauration.md).
