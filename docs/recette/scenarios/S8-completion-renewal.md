---
titre: S8 - Fin d'abonnement et renouvellement
public: développeur
statut: à revoir
vérifié-sur: ba48ab9
couvre: [Sprint 8, UAT-002]
---

# S8 - Fin d'abonnement et renouvellement

> Revue du 2026-11-03 : les coches ci-dessous sont conservées comme saisies par Fred. Les assertions de blocage/dérogation sont contestées par UAT-002 et restent à retester ; elles ne constituent pas une validation finale de cette règle. Voir [le rapport](../S8_UAT_REVIEW.md).

> UAT-002 : correctif implémenté, statut RETEST. Le signalement accepté est conservé dans le journal ; seul le retest de Fred valide le correctif. Sprint 8 et le gate S9 restent ouverts.

## Retest UAT-002 - blocage et dérogation de clôture

Le bloqueur autoritatif est au moins un composant avec `quantityOwedByCoach > 0`. Le serveur relit/verrouille l'état courant et ne déduit jamais l'override d'un motif ou du rôle. Utiliser des données synthétiques.

- [ ] Blocage + case décochée + aucun motif : confirmation UI indisponible ; appel direct refusé avec `SUBSCRIPTION_COMPONENTS_OUTSTANDING`.
- [ ] Blocage + case décochée + motif fourni : refus identique ; le motif seul n'autorise rien.
- [ ] Blocage + case cochée + motif absent/vide/espaces : UI refuse et serveur retourne `SUBSCRIPTION_COMPLETION_REASON_REQUIRED`.
- [ ] Blocage + case cochée + motif non vide : clôture réussie exactement une fois.
- [ ] Décocher efface le motif et la validation spécifique ; la case n'est jamais cochée automatiquement.
- [ ] Refaire les quatre combinaisons avec le compte admin/coach normalement autorisé.
- [ ] Refaire le parcours bloqué avec superadmin : aucun bypass implicite.
- [ ] Sans blocage + case décochée : clôture normale possible sans motif de dérogation.
- [ ] Un override explicitement demandé sans blocage reste accepté avec un motif non vide, comme auparavant ; il est audité comme tel.
- [ ] Recharger : l'état et l'historique persistent.
- [ ] DBeaver : `completed`, dates de fin et historique corrects ; une répétition ne crée aucun nouvel historique/audit.
- [ ] Les quantités de tous les composants sont conservées exactement.
- [ ] La clôture dérogatoire conserve son motif dans l'historique ; audit `completionOverride=true`, sans motif en metadata générique. Une clôture normale porte `completionOverride=false`.
- [ ] La finance reste inchangée ; renouvellement en régression seulement.

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
