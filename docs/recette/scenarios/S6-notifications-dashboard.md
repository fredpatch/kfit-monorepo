---
titre: S6 - Dashboard, notifications et Supervision
public: développeur
statut: à jour
vérifié-sur: da0eee3
couvre: [Sprint 8, UAT review]
---

# S6 - Dashboard, notifications et Supervision

## But

Valider les vues opérationnelles transversales.

## Aujourd'hui / dashboard

- [x] Ouvrir /admin.
- [x] KPIs chargent sans erreur.
- [x] Périodes analytics 4 sem. / 8 sem. / 12 mois fonctionnent.
- [x] Funnel et finance affichent des valeurs cohérentes avec les données UAT.
- [x] Alertes ouvrent le bon workspace propriétaire.
- [x] Les alertes dashboard ne dupliquent pas inutilement À traiter.

## Notifications

Créer ou utiliser une condition UAT qui produit une notification.

- [x] Badge non lu cohérent.
- [x] Ouvrir le centre de notifications.
- [x] Deep-link correct.
- [x] Marquer une notification lue ne résout pas le problème métier.
- [x] Tout marquer comme lu fonctionne.
- [x] Une condition résolue apparaît ensuite dans l'historique/résolues.
- [x] /admin/reglages sauvegarde les réglages.
- [x] Les réglages invalides sont refusés.

Si SMTP/jobs sont activés :

- [x] Digest e-mail reçu dans Mailpit.
- [x] Contenu minimal/confidentialité respecté.
- [x] Une panne d'envoi ne supprime pas la notification in-app.

## Supervision

Avec compte superadmin :

- [x] /admin/supervision s'ouvre.
- [x] État jobs/sauvegardes/confidentialité/sécurité s'affiche.
- [x] Une alerte de supervision attendue se matérialise correctement si une condition de test existe.

Avec compte non-superadmin si pratique :

- [x] même URL retourne le comportement admin-not-found attendu.

## Sortie

Dashboard, notifications et Supervision donnent une vue cohérente sans modifier les états métier propriétaires.
