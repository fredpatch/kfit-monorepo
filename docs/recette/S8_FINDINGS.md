---
titre: Sprint 8 - Journal des anomalies UAT
public: développeur
statut: actif
couvre: [Sprint 8]
---

# Sprint 8 - Findings

> Source unique des anomalies découvertes pendant la recette V1 Core de Fred.
>
> Ne pas corriger plusieurs anomalies en parallèle. Une anomalie P0/P1 reste bloquante jusqu'à retest vert.

## Sévérité

- **P0** - sécurité/confidentialité/perte de données ou parcours cœur impossible.
- **P1** - comportement V1 majeur incorrect ou parcours essentiel non fiable.
- **P2** - défaut non bloquant, incohérence récupérable ou UX confuse.
- **P3** - polish, texte, visuel ou ergonomie faible impact.

## Statuts

`OPEN` → `IN_FIX` → `RETEST` → `RESOLVED`

Alternative non bloquante : `DEFERRED` avec cible explicite.

## Findings actifs

Aucun pour le moment.

## Modèle

### UAT-XXX - Titre court

- Scénario : S?
- Sévérité : P0 | P1 | P2 | P3
- Statut : OPEN
- Commit testé :
- Étape :
- Résultat attendu :
- Résultat observé :
- Preuve :
- Règle / owner :
- Cause :
- Correctif :
- Commit correctif :
- Retest Fred :
- Décision : RESOLVED | DEFERRED
- Cible si différé :

## Règle de clôture

Sprint 8 ne ferme pas avec un P0/P1 ouvert ni avec une anomalie non triée.
