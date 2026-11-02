# S5 - Finance, justificatifs, devis, reçus et documents

## But
Valider le sous-système financier et documentaire sans coupler paiement et statut d'abonnement.

## Plan de paiement
- [ ] Ouvrir l'onglet Paiements.
- [ ] Créer/inspecter le plan d'échéances prévu.
- [ ] Vérifier total, dû, futur, en retard et encaissé.
- [ ] Vérifier qu'un paiement ne change pas automatiquement le statut de l'abonnement.

## Paiement / allocation
- [ ] Enregistrer un paiement valide.
- [ ] Vérifier allocation vers la/les échéance(s) attendue(s).
- [ ] Vérifier impossibilité de double application d'une commande idempotente.
- [ ] Vérifier correction/historique sans réécriture destructive si une correction est testée.

## Justificatif client
- [ ] Générer le lien public justificatif.
- [ ] Envoyer un fichier accepté.
- [ ] Vérifier preview/taille/scan dans l'admin.
- [ ] Appliquer une décision de revue.
- [ ] Vérifier que le fichier reste privé et que le statut est cohérent.

## Devis
- [ ] Créer/générer un devis depuis les données autoritatives.
- [ ] Ouvrir le lien public.
- [ ] Tester une réponse permise.
- [ ] Vérifier version/historique si une nouvelle version est créée.

## Reçu
- [ ] Générer le reçu lié au paiement.
- [ ] Vérifier numéro séquentiel et contenu.
- [ ] Ouvrir le partage public sécurisé si prévu.

## Documents personnalisés
- [ ] Ajouter/générer un document.
- [ ] Créer V2 d'un document et conserver V1.
- [ ] Créer un lien pour une version exacte.
- [ ] Document sensible : vérifier challenge séparé.
- [ ] Tester expiration/révocation/max-use lorsque pratique.
- [ ] Vérifier stockage privé et absence d'URL fichier publique.
- [ ] Vérifier photo de progression privée si consentement progress_photo_storage accordé.

## Sortie
Finance, devis, reçus, justificatifs et documents restent traçables, versionnés et indépendants du lifecycle abonnement.
