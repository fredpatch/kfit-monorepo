# S4 - Abonnement actif, rendez-vous, suivis et progression

## But
Valider le coeur opérationnel du coaching après onboarding.

## Activation
- [ ] Activer l'abonnement ready_to_start.
- [ ] Vérifier actualStartDate et plannedEndDate.
- [ ] Vérifier les compteurs de prestations.

## Rendez-vous
- [ ] Planifier un rendez-vous lié à une prestation.
- [ ] Ouvrir le lien public de réponse.
- [ ] Confirmer le rendez-vous.
- [ ] Vérifier qu'un replay du lien ne produit pas un second effet.
- [ ] Terminer le rendez-vous.
- [ ] Vérifier consommation exactement une unité.
- [ ] Tester un reschedule sur un second RDV si pratique : original conservé + remplacement lié.

## Suivis
- [ ] Enregistrer un suivi structuré.
- [ ] Ajouter une prochaine action.
- [ ] Vérifier file /admin/suivis.
- [ ] Compléter/annuler une action selon le flow prévu.
- [ ] Vérifier que la cadence est recalculée depuis une activité significative.
- [ ] Pause abonnement -> exclusion de la file cadence.
- [ ] Reprise avec nouvelle date de fin explicite.

## Progression
Avec consentement health_data actuel :
- [ ] Ajouter une mesure.
- [ ] Ajouter une seconde mesure et vérifier delta.
- [ ] Vérifier ordre chronologique avec mesure backdatée valide si pratique.
- [ ] Créer un objectif qualitatif ou numérique.
- [ ] Vérifier que la suggestion est consultative.
- [ ] Confirmer explicitement un outcome.
- [ ] Vérifier historique append-only.
- [ ] Révoquer/refuser health_data bloque une nouvelle mesure sans effacer l'historique existant.

## Sortie
Le coaching actif modifie uniquement les compteurs/historiques attendus et respecte consentement + cadence.
