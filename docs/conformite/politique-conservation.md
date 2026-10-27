---
titre: Politique de conservation (brouillon technique)
public: juriste
statut: brouillon
vérifié-sur: 482f843
couvre: [S7.3, S7.4b, DOC-01a, RET-01]
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

## Durées de conservation automatiques (RET-01)

> **Valeurs par défaut techniques - à valider par le juriste.** Les minimums viennent de la décision RET-01 ; les maximums sont des bornes techniques de l'application, pas des durées légales.

Elles s'appliquent dans le job quotidien `privacy.purge` (03:00, Libreville), après la suppression des fichiers. Chaque étape est rejouable sans effet en double ; le job ne garde que des nombres.

| Donnée                                                                       | Durée par défaut                                   | Min - max       | Action                                                                                                                                                          | Réglage                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Contenu des e-mails envoyés (file d'envoi)                                   | 30 jours après l'envoi, ou après l'échec définitif | 7 - 365 jours   | L'adresse, l'objet et le texte sont remplacés par « [purgé] ». La ligne, son statut, ses dates et sa clé d'envoi restent : le même e-mail ne peut pas repartir. | `retention.email_outbox_days`        |
| Notifications résolues                                                       | 180 jours après la résolution                      | 30 - 730 jours  | Supprimées. Une notification encore ouverte n'est jamais supprimée.                                                                                             | `retention.notifications_days`       |
| Journaux de sécurité (`auth.*`, `ops.*` de l'audit, accès aux liens publics) | 395 jours                                          | 90 - 1095 jours | Supprimés, sauf les preuves ci-dessous.                                                                                                                         | `retention.security_logs_days`       |
| Prospects jamais convertis                                                   | 12 mois sans nouvelle demande                      | 3 - 60 mois     | Aucune suppression : la liste et l'alerte « Prospects inactifs » apparaissent dans la Supervision. L'anonymisation reste manuelle.                              | `retention.prospect_inactive_months` |

Les réglages se modifient dans « Réglages › Confidentialité ».

**Preuves jamais supprimées.** Événements d'audit `auth.bootstrap.created`, `auth.user.created`, `auth.user.role_changed`, `auth.dev_demo.created`, `ops.create_user`, `ops.set_role` (création de compte, changement de rôle ; constante `RETENTION_EVIDENCE_EVENT_TYPES`), et tous les événements hors `auth.*` / `ops.*` : consentements, confidentialité (`privacy.*`), paiements, reçus, devis.

## Points sans règle automatique dans le code

- Prospects jamais convertis : signalés après le délai réglé (voir ci-dessus), jamais anonymisés automatiquement.
- Clients sans activité : aucune archivation automatique.
- Événements d'audit hors journaux de sécurité (consentements, confidentialité, paiements, reçus, devis) : conservés sans limite. Durée légale **à compléter par le juriste**.
- Données financières : conservées après anonymisation. Durée légale de conservation comptable : **à compléter par le juriste**.

## Durées légales

**À compléter par le juriste**, pour chaque catégorie du [registre](registre-traitements.md).
