# S8 - Fin d'abonnement et renouvellement

## But

Valider la sortie du cycle actif sans casser finance, composants ou historique.

## Completion due

- [ ] Passer explicitement l'abonnement actif en `completion_due`.
- [ ] Vérifier qu'une date de fin seule ne complète rien automatiquement.
- [ ] Si une prestation coach reste due, vérifier le blocage normal.
- [ ] Utiliser un override explicite uniquement si nécessaire et avec une raison.

## Completion

- [ ] Compléter l'abonnement.
- [ ] Vérifier l'historique de statut.
- [ ] Vérifier que les balances/composants ne sont pas réécrits.
- [ ] Vérifier que la finance reste indépendante.

## Renouvellement

Si le workflow le permet depuis l'état testé :

- [ ] Créer un renouvellement.
- [ ] Un seul nouvel abonnement onboarding est créé.
- [ ] L'abonnement source reste inchangé.
- [ ] Les snapshots commerciaux/composants sont clonés.
- [ ] Les compteurs consumed/owed repartent à zéro.
- [ ] Consentements/questionnaires/RDV/suivis/objectifs/paiements ne sont pas clonés.
- [ ] Le nouvel abonnement recommence son onboarding normalement.

## Sortie

Le cycle V1 peut se terminer ou repartir en renouvellement avec historique intact.
