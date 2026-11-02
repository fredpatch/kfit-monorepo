---
titre: S3 - Onboarding, consentements, questionnaire et avis médical
public: développeur
statut: validé
vérifié-sur: 15476f3
couvre: [Sprint 8, UAT-001]
---

# S3 - Onboarding, consentements, questionnaire et avis médical

## But

Valider les bloqueurs serveur avant activation.

## Précondition

S2 vert.

## Préparation

- [x] Ouvrir la fiche client puis l'abonnement.
- [x] Onglet Préparation affiche les éléments requis issus de la politique effective.
- [x] Les éléments système ne peuvent pas être forgés manuellement.
- [x] Réservation capacité cohérente si offre limitée.

## Consentements

- [x] Générer/ouvrir le lien public de consentement.
- [x] Accepter conditions de service + confidentialité requises.
- [x] Tester au moins un consentement facultatif séparément.
- [x] Tester health_data selon le questionnaire de santé.
- [x] Un lien consommé ne peut pas rejouer la décision.
- [x] Historique append-only visible.

## Questionnaire

- [x] Générer le lien questionnaire.
- [x] Questionnaire non-santé fonctionne sans consentement santé.
- [x] Questionnaire santé refuse la persistance sans health_data.
- [x] Avec consentement santé, réponses valides sont enregistrées.
- [x] Une correction crée une révision N+1 sans écraser N.
- [x] Voir les réponses côté coach exige le fresh OTP prévu.

## Risque / avis médical

Utiliser uniquement des données UAT synthétiques.

- [x] Une règle de risque peut exiger l'avis médical.
- [x] Le blocage empêche ready_to_start.
- [x] Une réponse ensuite rassurante ne supprime pas automatiquement le besoin d'avis déjà créé.
- [x] Dans Préparation, l'exigence médicale non résolue propose « Valider l'avis médical », sans complete/waive générique.
- [x] Ouvrir la confirmation et saisir une courte note interne synthétique facultative (2000 caractères maximum).
- [x] « Confirmer la validation » envoie la commande dédiée `POST /admin/subscriptions/:subscriptionId/onboarding/medical-clearance/clear`.
- [x] Après succès et rechargement, le bloqueur médical reste visible comme complété.
- [x] DBeaver : le dossier médical est `cleared`, avec acteur/date et note éventuelle ; `documentId` reste inchangé.
- [x] L'audit `medical_clearance.cleared` contient uniquement `medicalClearanceRecordId` et `triggerSource`, jamais la note.
- [x] Un second envoi est indisponible ou retourne un conflit sûr sans effet/audit dupliqué.
- [x] Sur offre limitée, la validation ne réserve aucune place : sans réservation valide, « Prêt à démarrer » reste indisponible.
- [x] Réserver la place puis confirmer explicitement « Prêt à démarrer » lorsque tous les bloqueurs sont satisfaits.
- [x] Répéter avec une exigence issue d'un questionnaire à risque ; une correction rassurante ne la lève jamais implicitement.
- [x] Tous les bloqueurs requis résolus -> ready_to_start.

## Sortie

Abonnement prêt à être activé uniquement lorsque tous les bloqueurs autoritatifs sont satisfaits.
