---
titre: Sprint 8 - Journal des anomalies UAT
public: développeur
statut: à jour
vérifié-sur: a28b7e1
couvre: [Sprint 8, UAT-001]
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

### UAT-001 - Aucun workflow pour lever une exigence d'avis médical

- Scénario : S3 - onboarding
- Sévérité : P1
- Statut : RESOLVED
- Commit testé : 376399e61d2bdb8f50d86eca829047e69394d619
- Étape : lever le bloqueur `medical_clearance` avant `ready_to_start`
- Résultat attendu : un parcours dédié permet à l'admin/coach d'enregistrer la validation médicale, conserver sa preuve structurelle et lever atomiquement le bloqueur.
- Résultat observé : le système crée `medical_clearance_records` + l'item bloquant mais n'expose aucune commande API/UI de clearance; le generic complete/waive est volontairement interdit.
- Preuve : `onboarding.service.ts` retourne `owner: "medical", canComplete: false, canWaive: false`; aucune route onboarding ne gère une commande médicale.
- Règle / owner : onboarding + medical clearance; Explicit State Transitions / Atomic Business Operation / Audit Event System.
- Cause : workflow de résolution partiellement modélisé en base mais jamais implémenté.
- Correctif : commande dédiée `clear_medical` dans la transaction onboarding, audit structurel et action de confirmation dans Préparation. Capacité et Ready restent indépendants ; aucun complete/waive générique médical.
- Commit correctif : a28b7e1
- Retest Fred : tous les contrôles du parcours UAT-001 confirmés verts le 2026-11-02 ; commit/push autorisés.
- Décision : RESOLVED, validation locale confirmée par Fred.
- Cible si différé : non différable pour V1 Core; P1 bloquant.

Le scénario S3 médical peut reprendre. La levée du bloqueur passe par la commande médicale dédiée ; ne pas contourner via réponses questionnaire, changement de policy ou complete/waive générique.

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
