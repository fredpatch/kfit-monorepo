---
titre: S3 - Onboarding, consentements, questionnaire et avis médical
public: développeur
statut: à jour
vérifié-sur: a28b7e1
couvre: [Sprint 8, UAT-001]
---

# S3 - Onboarding, consentements, questionnaire et avis médical

## But

Valider les bloqueurs serveur avant activation.

## Précondition

S2 vert.

## Préparation

- [ ] Ouvrir la fiche client puis l'abonnement.
- [ ] Onglet Préparation affiche les éléments requis issus de la politique effective.
- [ ] Les éléments système ne peuvent pas être forgés manuellement.
- [ ] Réservation capacité cohérente si offre limitée.

## Consentements

- [ ] Générer/ouvrir le lien public de consentement.
- [ ] Accepter conditions de service + confidentialité requises.
- [ ] Tester au moins un consentement facultatif séparément.
- [ ] Tester health_data selon le questionnaire de santé.
- [ ] Un lien consommé ne peut pas rejouer la décision.
- [ ] Historique append-only visible.

## Questionnaire

- [ ] Générer le lien questionnaire.
- [ ] Questionnaire non-santé fonctionne sans consentement santé.
- [ ] Questionnaire santé refuse la persistance sans health_data.
- [ ] Avec consentement santé, réponses valides sont enregistrées.
- [ ] Une correction crée une révision N+1 sans écraser N.
- [ ] Voir les réponses côté coach exige le fresh OTP prévu.

## Risque / avis médical

Utiliser uniquement des données UAT synthétiques.

- [ ] Une règle de risque peut exiger l'avis médical.
- [ ] Le blocage empêche ready_to_start.
- [ ] Une réponse ensuite rassurante ne supprime pas automatiquement le besoin d'avis déjà créé.
- [ ] Dans Préparation, l'exigence médicale non résolue propose « Valider l'avis médical », sans complete/waive générique.
- [ ] Ouvrir la confirmation et saisir une courte note interne synthétique facultative (2000 caractères maximum).
- [ ] « Confirmer la validation » envoie la commande dédiée `POST /admin/subscriptions/:subscriptionId/onboarding/medical-clearance/clear`.
- [ ] Après succès et rechargement, le bloqueur médical reste visible comme complété.
- [ ] DBeaver : le dossier médical est `cleared`, avec acteur/date et note éventuelle ; `documentId` reste inchangé.
- [ ] L'audit `medical_clearance.cleared` contient uniquement `medicalClearanceRecordId` et `triggerSource`, jamais la note.
- [ ] Un second envoi est indisponible ou retourne un conflit sûr sans effet/audit dupliqué.
- [ ] Sur offre limitée, la validation ne réserve aucune place : sans réservation valide, « Prêt à démarrer » reste indisponible.
- [ ] Réserver la place puis confirmer explicitement « Prêt à démarrer » lorsque tous les bloqueurs sont satisfaits.
- [ ] Répéter avec une exigence issue d'un questionnaire à risque ; une correction rassurante ne la lève jamais implicitement.
- [ ] Tous les bloqueurs requis résolus -> ready_to_start.

## Sortie

Abonnement prêt à être activé uniquement lorsque tous les bloqueurs autoritatifs sont satisfaits.
