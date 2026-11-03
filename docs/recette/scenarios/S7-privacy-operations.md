---
titre: S7 - Confidentialité et opérations
public: développeur
statut: validé
vérifié-sur: e5880e7
couvre: [Sprint 8, UAT review]
---

# S7 - Confidentialité et opérations

## But

Valider les comportements de confidentialité déjà implémentés sans introduire de nouvelle règle ni exécuter d'opération hors des flows prévus par l'application.

## Précondition

Utiliser un sujet UAT synthétique secondaire afin de préserver le client principal pour la suite de la recette.

## Archivage

- [x] Archiver le sujet admissible via l'UI prévue.
- [x] Vérifier le mode lecture seule attendu.
- [x] Vérifier que les écritures interdites retournent le conflit métier prévu.
- [x] Désarchiver si le flow le permet et vérifier le retour à l'état attendu.

## Retention hold

- [x] Ajouter une retenue via le flow prévu.
- [x] Vérifier que l'action concernée est bloquée tant que la retenue est active.
- [x] Libérer la retenue.
- [x] Vérifier que l'historique reste visible.

## Anonymisation

Sur un sujet synthétique archivé :

- [x] Fresh OTP exigé.
- [x] Confirmation explicite exigée.
- [x] Identité remplacée ou vidée selon les règles déjà validées.
- [x] Données santé et texte libre ciblés ne restent pas exposés.
- [x] Faits financiers conservés sous forme dé-identifiée.
- [x] Liens publics concernés ne donnent plus accès aux données.
- [x] L'UI présente clairement le caractère irréversible.

## Purge / rétention

- [x] Vérifier la valeur configurée de `privacy.purge.delay_days`.
- [x] Une ressource non éligible reste conservée.
- [x] Une ressource éligible suit l'état de purge attendu via le mécanisme déjà implémenté.
- [x] Une répétition du traitement ne crée pas d'état incohérent.

## Journal / récupération

- [x] L'action de confidentialité est représentée dans le journal durable prévu.
- [x] Les outils de synchronisation/replay restent idempotents au niveau métier.

## Sauvegarde / restauration

Le drill complet a déjà été validé au Sprint 7. Pour Sprint 8 :

- [x] vérifier que le runbook et les scripts restent présents;
- [x] vérifier que la dernière preuve de drill validé est toujours référencée;
- [x] confirmer que la destination réellement hors serveur reste un blocker Sprint 9.

## Sortie

Les limites de confidentialité restent cohérentes avec le reste du parcours V1 Core.


## Validation locale 2026-11-03

Fred a vérifié dans DBeaver que les événements privacy sont persistés dans le journal durable. Les tests de synchronisation/replay déjà exécutés restent verts et confirment l'idempotence métier.

Limite UX non bloquante : aucun écran admin ne permet encore de parcourir/filtrer le journal d'audit. Cette amélioration est différée au backlog opérations/Supervision.
