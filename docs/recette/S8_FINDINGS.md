---
titre: Sprint 8 - Journal des anomalies UAT
public: développeur
statut: à jour
vérifié-sur: da0eee3
couvre: [Sprint 8, UAT-001, UAT-002]
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

### UAT-002 - Avertissement de clôture incohérent avec le blocage serveur

- Scénario : S8 - fin d'abonnement ; régression S9 concernée.
- Sévérité : P2 pour l'incohérence UI confirmée ; P1 à réévaluer si un solde `quantityOwedByCoach > 0` a réellement été contourné.
- Statut : OPEN
- Commit inspecté : da0eee3
- Étape : `completion_due -> completed`, case de dérogation décochée et aucun motif.
- Résultat attendu : les prestations réellement dues par la coach bloquent la clôture sans dérogation explicite motivée ; l'interface décrit la même règle.
- Résultat observé par Fred : clôture possible malgré l'avertissement, en superadmin et avec un compte décrit comme admin/coach.
- Preuve confirmée : `outstandingComponents()` compte les prestations non consommées (`entitled - consumed`) ; le serveur vérifie `quantityOwedByCoach > 0`. Un solde non consommé peut donc afficher l'avertissement sans constituer le blocage serveur.
- Autorisation : aucune exception superadmin trouvée dans la règle de clôture. Le rôle réel `coach` est refusé par le contrôleur ; vérifier le rôle effectif de la session signalée.
- Règle / owner : abonnement ; `exploration-cache/tasks/sprint-5.md` S5.1 Completion et `exploration-cache/project/state-machines.md` règles Subscription.
- Cas fourni par Fred : le lien sélectionne le renouvellement `48b39acc-c0fc-4e84-9561-2d2dbc3bca16`, encore onboarding. Sa source `24a4060c-3bd7-4168-bb62-60c1ad58b705` est completed ; deux prestations entitled=1, consumed=0, owed=0, sans mise à jour après clôture ; historique sans motif et audit `completionOverride=false`.
- Cause établie : prédicats et message UI incohérents. Ce cas ne montre pas de contournement du blocage serveur : aucune quantité due par la coach n'est positive.
- Correctif : non implémenté ; investigation et décision GPT/Fred avant tranche dédiée.
- Preuves restantes : payload/réponse et rôle effectif pour tout nouveau cas avec solde coach positif ou rôle réel coach ; le compte acteur de la source inspectée est actuellement superadmin.
- Retest Fred : à planifier après décision ; revalider les assertions blocage/dérogation de S8.
- Décision : OPEN ; aucune clôture globale de Sprint 8 n'est enregistrée.
- Rapport : [S8_UAT_REVIEW.md](S8_UAT_REVIEW.md).

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
