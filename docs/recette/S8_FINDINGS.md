---
titre: Sprint 8 - Journal des anomalies UAT
public: développeur
statut: à jour
vérifié-sur: ba48ab9
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

### UAT-002 - Clôture possible malgré le blocage, sans case cochée ni motif

- Scénario : S8 - fin d'abonnement ; régression S9 concernée.
- Sévérité : P1 - majeur. Le signalement décrit un contournement d'un garde-fou de clôture autoritatif, sans override explicite ni motif, pour superadmin et admin/coach.
- Statut : RETEST
- Mise à jour du signalement : 2026-11-03, sans nouvelle investigation à la demande explicite de Fred.
- Étape : `completion_due -> completed`, case de dérogation décochée et aucun motif.
- Résultat attendu selon le signalement de Fred : le blocage empêche de terminer l'abonnement tant que la case de dérogation n'est pas cochée et qu'une raison n'est pas fournie.
- Signalement exact de Fred : « I could complete completion_due even if there was a blocage. Investigate the matter. Il ya un blocage pour terminier l'abonnement, mais meme si je ne coche pas le blocage (en super admin) pour doonner une raison, jarrive quand meme a terminer labonement. The goes for admin / coach account. so this rule seems to be overriden. »
- Règle / owner : abonnement ; `exploration-cache/tasks/sprint-5.md` S5.1 Completion et `exploration-cache/project/state-machines.md` règles Subscription.
- Cause : non conclue dans cette mise à jour. L'interprétation technique du commit 1536ff3 est conservée dans l'historique, mais ne vaut pas diagnostic accepté du problème signalé.
- Correctif implémenté : le serveur verrouille les composants pour la clôture, refuse tout solde `quantityOwedByCoach > 0` sans override strictement égal à `true`, puis exige un motif non vide. La raison seule ne vaut jamais dérogation. L'UI affiche le blocage autoritatif et désactive la confirmation jusqu'à sélection explicite et motif non vide. Aucun bypass de rôle.
- Historique/audit : le motif reste dans l'historique de statut ; l'audit générique conserve le booléen structurel `completionOverride`, sans copier le motif. Compteurs, finance et renouvellement ne sont pas modifiés par ce correctif.
- Retest Fred : matrice complète à exécuter dans S8 pour les comptes autorisés, avec et sans blocage ; le gate S9 reste décoché.
- Décision : RETEST / P1 bloquant Sprint 8 jusqu'au retest vert confirmé par Fred. Ne pas marquer RESOLVED avant sa confirmation.
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
