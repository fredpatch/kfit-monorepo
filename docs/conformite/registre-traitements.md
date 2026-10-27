---
titre: Registre des traitements (brouillon technique)
public: juriste
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.3, DOC-01a]
---

> **Brouillon technique - à faire valider par un juriste avant toute mise en production. Ne constitue pas un avis juridique.**

# Registre des traitements (brouillon technique)

Source : schéma `packages/server/src/db/schema/` et fonctionnalités en place.

**Responsable du traitement, coordonnées, base légale de chaque traitement, destinataires, transferts hors du Gabon, durée légale de conservation : à compléter par le juriste.**

## Personnes concernées

- **Prospects** : personnes qui envoient une demande depuis la page publique.
- **Clients** : prospects convertis, ou clients créés par le coach.
- **Administrateurs** : le coach et toute personne disposant d'un compte d'administration.

## Catégories de données (par groupe de tables)

| Groupe                    | Tables                                                                                                                                  | Données                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identité et contact       | `prospects`, `customers`                                                                                                                | Nom complet, numéro WhatsApp, e-mail, ville, pays.                                                                                                   |
| Demandes et qualification | `service_requests`, `contact_attempts`, `qualification_reviews`, `waitlist_entries`                                                     | Objectif, message libre, prises de contact et notes, avis de qualification (dont notes d'aptitude), liste d'attente.                                 |
| Santé                     | `questionnaire_submissions`, `questionnaire_answers` (modèles de catégorie santé), `medical_clearance_records`, `progress_measurements` | Réponses aux questionnaires de santé, attestations médicales, mesures (poids, tours de taille / hanches / poitrine, masse grasse estimée), ressenti. |
| Photos et documents       | `documents`, `document_versions`, `progress_photos` ; fichiers dans `PRIVATE_STORAGE_ROOT`                                              | Photos de progression et documents marqués `sensitive_health` ; autres documents privés ; nom d'origine, type et empreinte de chaque fichier.        |
| Suivi du coaching         | `subscriptions` et tables liées, `appointments`, `follow_ups`, `goals`, `onboarding_items`                                              | Abonnements, pauses (avec motif), rendez-vous, suivis et notes, objectifs.                                                                           |
| Paiements                 | `payment_plans`, `installments`, `payment_events`, `payment_allocations`, `payment_proofs`, `quotes`, `receipts`                        | Montants, moyens et références de paiement, justificatifs déposés, devis, reçus.                                                                     |
| Consentements             | `consent_definitions`, `consent_records`                                                                                                | Textes versionnés et décisions (accepté / refusé, canal, date, nom saisi en confirmation).                                                           |
| Notifications             | `notifications`, `notification_email_outbox`                                                                                            | Notifications du coach (avec nom du client affiché), e-mails en file d'envoi.                                                                        |
| Comptes et sécurité       | `users`, `auth_sessions`, `otp_challenges`, `trusted_devices`                                                                           | E-mail et mot de passe haché des administrateurs, sessions, codes à usage unique (hachés).                                                           |
| Audit                     | `audit_events`, `external_access_events`                                                                                                | Acteur, action, résultat, identifiant de requête ; IP et user-agent **sous forme d'empreinte uniquement**.                                           |
| Confidentialité           | `anonymization_events`, `retention_holds`, journal de confidentialité (fichier hors base)                                               | Identifiants des personnes anonymisées, motifs de blocage de conservation. Le journal ne contient que des identifiants.                              |

## Finalités telles qu'implémentées

- Recevoir et qualifier les demandes de coaching.
- Gérer les clients, leurs abonnements, rendez-vous, suivis et objectifs.
- Recueillir les questionnaires de santé et suivre la progression (mesures, photos), sous réserve des consentements requis. Le code refuse la génération d'un bilan sans consentement santé (`DOCUMENT_HEALTH_CONSENT_REQUIRED`) et le stockage des photos de progression sans consentement photo (`DOCUMENT_PHOTO_CONSENT_REQUIRED`).
- Gérer les paiements, devis et reçus.
- Partager des documents avec le client par lien sécurisé.
- Prévenir le coach (notifications, e-mails).
- Sécuriser l'accès et tracer les actions (audit).
- Archiver, anonymiser et purger les données à la fin de la relation.
- Sauvegarder et restaurer les données.

Base légale de chaque finalité : **à compléter par le juriste**.
