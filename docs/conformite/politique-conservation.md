---
titre: Politique de conservation (brouillon technique)
public: juriste
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.3, S7.4b, DOC-01a]
---

> **Brouillon technique - à faire valider par un juriste avant toute mise en production. Ne constitue pas un avis juridique.**

# Politique de conservation (brouillon technique)

Ce document décrit les mécanismes **tels que configurés dans le code**. Les durées légales applicables sont **à compléter par le juriste**.

## Mécanismes en place

| Mécanisme                | Fonctionnement                                                                                                                                                                                                                                                                                 | Réglage                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Archivage                | Manuel, par l'administrateur. Un client ne peut être archivé que si tous ses abonnements sont terminés ou annulés ; un prospect, que si toutes ses demandes sont closes. Les données d'une personne archivée ne peuvent plus être modifiées et ses liens publics sont révoqués.                | -                                                                                          |
| Anonymisation            | Manuelle, sur une personne archivée, avec confirmation du nom. L'identité est remplacée par un pseudonyme (« Client anonymisé · XXXX ») ; les textes libres, réponses de santé et notes sont effacés ; les données financières sont conservées sans changement.                                | -                                                                                          |
| Suppression des fichiers | Job quotidien (03:00, Libreville) : les fichiers privés d'une personne anonymisée sont supprimés définitivement après un délai.                                                                                                                                                                | `privacy.purge.delay_days` : 30 jours par défaut, de 1 à 365 (Réglages › Confidentialité). |
| Blocage de conservation  | Un blocage actif (légal, litige, comptable) sur un client, un prospect ou un document empêche l'anonymisation et la suppression des fichiers.                                                                                                                                                  | Posé et levé par l'administrateur, avec motif.                                             |
| Sauvegardes              | Conservées : dernière sauvegarde des 7 derniers jours et des 4 dernières semaines. Une sauvegarde peut donc contenir, pendant environ 4 semaines, des données anonymisées depuis. À la restauration, toutes les anonymisations sont réappliquées automatiquement (journal de confidentialité). | Constantes `RETAIN_DAILY_BUNDLES = 7`, `RETAIN_WEEKLY_BUNDLES = 4`.                        |

## Points sans règle automatique dans le code

- Prospects jamais convertis : aucune suppression ni anonymisation automatique trouvée dans le code. **À vérifier** et règle à définir.
- Clients sans activité : aucune archivation automatique.
- Événements d'audit (`audit_events`) : aucune purge automatique trouvée. **À vérifier**.
- Notifications et file d'e-mails : aucune purge automatique trouvée. **À vérifier**.
- Données financières : conservées après anonymisation. Durée légale de conservation comptable : **à compléter par le juriste**.

## Durées légales

**À compléter par le juriste**, pour chaque catégorie du [registre](registre-traitements.md).
