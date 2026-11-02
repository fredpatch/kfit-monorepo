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
- [ ] Enregistrer/valider l'avis médical via le flow prévu.
- [ ] Tous les bloqueurs requis résolus -> ready_to_start.

## Sortie
Abonnement prêt à être activé uniquement lorsque tous les bloqueurs autoritatifs sont satisfaits.
