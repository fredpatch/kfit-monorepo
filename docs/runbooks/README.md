---
titre: Runbooks
public: exploitation
statut: à jour
vérifié-sur: d2fc5df
couvre: [DOC-01a]
---

# Runbooks

Procédures d'exploitation, pas à pas. Chacune donne les commandes exactes et le résultat attendu.

| Runbook | Quand l'utiliser | Statut |
| --- | --- | --- |
| [Démarrage en production](demarrage-production.md) | Avant chaque mise en service, ou quand l'API refuse de démarrer. | à jour |
| [Premier compte administrateur](premier-compte-administrateur.md) | Premier démarrage sur une base vide, ou e-mail du premier compte erroné. | brouillon |
| [Sauvegarde et restauration](sauvegarde-restauration.md) | Mise en place des sauvegardes, contrôle hebdomadaire, restauration après une perte de données. | à jour |
| [Plancher de sécurité](plancher-securite.md) | Nouvelle faille Node.js, mise à jour de Node, `security:check` en échec. | à jour |
| [Incident](incident.md) | Panne, comportement anormal ou suspicion d'atteinte aux données. | brouillon |
| [Rotation des secrets](rotation-secrets.md) | Secret exposé ou changement planifié d'un secret. | brouillon |
| [Panne de dépendance](panne-dependances.md) | PostgreSQL, SMTP ou ClamAV indisponible. | brouillon |
| [Échec de job](echec-job.md) | Une ligne `failed` dans `scheduled_job_runs` ou `✖ <job> failed` dans le journal. | brouillon |
