---
titre: S8 - Fin d'abonnement et renouvellement
public: développeur
statut: à revoir
vérifié-sur: da0eee3
couvre: [Sprint 8, UAT-002]
---

# S8 - Fin d'abonnement et renouvellement

> Revue du 2026-11-03 : les coches ci-dessous sont conservées comme saisies par Fred. Les assertions de blocage/dérogation sont contestées par UAT-002 et restent à retester ; elles ne constituent pas une validation finale de cette règle. Voir [le rapport](../S8_UAT_REVIEW.md).

## But

Valider la sortie du cycle actif sans casser finance, composants ou historique.

## Completion due

- [x] Passer explicitement l'abonnement actif en `completion_due`.
- [x] Vérifier qu'une date de fin seule ne complète rien automatiquement.
- [x] Si une prestation coach reste due, vérifier le blocage normal.
- [x] Utiliser un override explicite uniquement si nécessaire et avec une raison.

## Completion

- [x] Compléter l'abonnement.
- [x] Vérifier l'historique de statut.
- [x] Vérifier que les balances/composants ne sont pas réécrits.
- [x] Vérifier que la finance reste indépendante.

## Renouvellement

Si le workflow le permet depuis l'état testé :

- [x] Créer un renouvellement.
- [x] Un seul nouvel abonnement onboarding est créé.
- [x] L'abonnement source reste inchangé.
- [x] Les snapshots commerciaux/composants sont clonés.
- [x] Les compteurs consumed/owed repartent à zéro.
- [x] Consentements/questionnaires/RDV/suivis/objectifs/paiements ne sont pas clonés.
- [x] Le nouvel abonnement recommence son onboarding normalement.

## Sortie

Le cycle V1 peut se terminer ou repartir en renouvellement avec historique intact.
