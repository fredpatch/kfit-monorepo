# S7 - Confidentialité et opérations

## But

Valider les comportements de confidentialité déjà implémentés sans introduire de nouvelle règle ni exécuter d'opération hors des flows prévus par l'application.

## Précondition

Utiliser un sujet UAT synthétique secondaire afin de préserver le client principal pour la suite de la recette.

## Archivage

- [ ] Archiver le sujet admissible via l'UI prévue.
- [ ] Vérifier le mode lecture seule attendu.
- [ ] Vérifier que les écritures interdites retournent le conflit métier prévu.
- [ ] Désarchiver si le flow le permet et vérifier le retour à l'état attendu.

## Retention hold

- [ ] Ajouter une retenue via le flow prévu.
- [ ] Vérifier que l'action concernée est bloquée tant que la retenue est active.
- [ ] Libérer la retenue.
- [ ] Vérifier que l'historique reste visible.

## Anonymisation

Sur un sujet synthétique archivé :

- [ ] Fresh OTP exigé.
- [ ] Confirmation explicite exigée.
- [ ] Identité remplacée ou vidée selon les règles déjà validées.
- [ ] Données santé et texte libre ciblés ne restent pas exposés.
- [ ] Faits financiers conservés sous forme dé-identifiée.
- [ ] Liens publics concernés ne donnent plus accès aux données.
- [ ] L'UI présente clairement le caractère irréversible.

## Purge / rétention

- [ ] Vérifier la valeur configurée de `privacy.purge.delay_days`.
- [ ] Une ressource non éligible reste conservée.
- [ ] Une ressource éligible suit l'état de purge attendu via le mécanisme déjà implémenté.
- [ ] Une répétition du traitement ne crée pas d'état incohérent.

## Journal / récupération

- [ ] L'action de confidentialité est représentée dans le journal durable prévu.
- [ ] Les outils de synchronisation/replay restent idempotents au niveau métier.

## Sauvegarde / restauration

Le drill complet a déjà été validé au Sprint 7. Pour Sprint 8 :

- [ ] vérifier que le runbook et les scripts restent présents;
- [ ] vérifier que la dernière preuve de drill validé est toujours référencée;
- [ ] confirmer que la destination réellement hors serveur reste un blocker Sprint 9.

## Sortie

Les limites de confidentialité restent cohérentes avec le reste du parcours V1 Core.
