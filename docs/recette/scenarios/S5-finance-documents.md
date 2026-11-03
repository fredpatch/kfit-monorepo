---
titre: S5 - Finance, justificatifs, devis, reçus et documents
public: développeur
statut: à revoir
vérifié-sur: da0eee3
couvre: [Sprint 8, UAT review]
---

# S5 - Finance, justificatifs, devis, reçus et documents

## But

Valider le sous-système financier et documentaire sans coupler paiement et statut d'abonnement.

## Plan de paiement

- [ ] Ouvrir l'onglet Paiements.
- [ ] Créer/inspecter le plan d'échéances prévu.
- [ ] Vérifier total, dû, futur, en retard et encaissé.
- [ ] Vérifier qu'un paiement ne change pas automatiquement le statut de l'abonnement.

## Paiement / allocation

- [x] Enregistrer un paiement valide.
- [x] Vérifier allocation vers la/les échéance(s) attendue(s).
- [x] Vérifier impossibilité de double application d'une commande idempotente.
- [x] Vérifier correction/historique sans réécriture destructive si une correction est testée.

## Justificatif client

- [x] Générer le lien public justificatif.
- [x] Envoyer un fichier accepté.
- [x] Vérifier preview/taille/scan dans l'admin.
- [x] Appliquer une décision de revue.
- [x] Vérifier que le fichier reste privé et que le statut est cohérent.

## Devis

- [x] Créer/générer un devis depuis les données autoritatives.
- [x] Ouvrir le lien public.
- [x] Tester une réponse permise.
- [x] Vérifier version/historique si une nouvelle version est créée.

## Reçu

- [x] Générer le reçu lié au paiement.
- [x] Vérifier numéro séquentiel et contenu.
- [x] Ouvrir le partage public sécurisé si prévu.

## Documents personnalisés

- [x] Ajouter/générer un document.
- [x] Créer V2 d'un document et conserver V1.
- [x] Créer un lien pour une version exacte.
- [x] Document sensible : vérifier challenge séparé.
- [x] Tester expiration/révocation/max-use lorsque pratique.
- [x] Vérifier stockage privé et absence d'URL fichier publique.
- [x] Vérifier photo de progression privée si consentement progress_photo_storage accordé.

## Sortie

Finance, devis, reçus, justificatifs et documents restent traçables, versionnés et indépendants du lifecycle abonnement.
