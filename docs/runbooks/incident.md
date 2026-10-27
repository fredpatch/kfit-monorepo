---
titre: Incident
public: exploitation
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.4a, S7.4b]
---

# Incident

## Faits disponibles aujourd'hui

- Chaque réponse HTTP porte un en-tête `X-Request-Id` (UUID), repris dans les événements d'audit (`audit_events.request_id`). Le journal de requêtes ne l'affiche pas. Demander à la personne qui signale le problème l'heure et, si possible, cet identifiant.
- Journal de l'API : sortie console, une ligne horodatée par événement, niveau réglé par `LOG_LEVEL` (par défaut `http`). Une ligne par requête : méthode, chemin, statut, durée, taille. Les jetons des liens publics sont masqués (`:token`) et la chaîne de requête n'est pas journalisée. Règle de code : ne jamais journaliser de mot de passe, jeton, code ou donnée personnelle.
- Événements d'audit : table `audit_events` (adresse IP et user-agent stockés sous forme d'empreintes uniquement).
- Jobs : table `scheduled_job_runs` ([jobs](../reference/jobs.md)).
- Refus 415 et 429 comptés par jour (heure de Libreville) dans `security_event_counters` : `REQUEST_ENCODING_UNSUPPORTED`, `RATE_LIMITED:<module>`.
- Restauration : [sauvegarde et restauration](sauvegarde-restauration.md) § 6.

## Qualifier

À rédiger - DOC-01b.

## Contenir et corriger

À rédiger - DOC-01b.

## Atteinte aux données personnelles

À rédiger - DOC-01b. Obligations de notification : à compléter par le juriste ([conformité](../conformite/README.md)).

## Après l'incident

À rédiger - DOC-01b.
