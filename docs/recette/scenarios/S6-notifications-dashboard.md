# S6 - Dashboard, notifications et Supervision

## But
Valider les vues opérationnelles transversales.

## Aujourd'hui / dashboard
- [ ] Ouvrir /admin.
- [ ] KPIs chargent sans erreur.
- [ ] Périodes analytics 4 sem. / 8 sem. / 12 mois fonctionnent.
- [ ] Funnel et finance affichent des valeurs cohérentes avec les données UAT.
- [ ] Alertes ouvrent le bon workspace propriétaire.
- [ ] Les alertes dashboard ne dupliquent pas inutilement À traiter.

## Notifications
Créer ou utiliser une condition UAT qui produit une notification.
- [ ] Badge non lu cohérent.
- [ ] Ouvrir le centre de notifications.
- [ ] Deep-link correct.
- [ ] Marquer une notification lue ne résout pas le problème métier.
- [ ] Tout marquer comme lu fonctionne.
- [ ] Une condition résolue apparaît ensuite dans l'historique/résolues.
- [ ] /admin/reglages sauvegarde les réglages.
- [ ] Les réglages invalides sont refusés.

Si SMTP/jobs sont activés :
- [ ] Digest e-mail reçu dans Mailpit.
- [ ] Contenu minimal/confidentialité respecté.
- [ ] Une panne d'envoi ne supprime pas la notification in-app.

## Supervision
Avec compte superadmin :
- [ ] /admin/supervision s'ouvre.
- [ ] État jobs/sauvegardes/confidentialité/sécurité s'affiche.
- [ ] Une alerte de supervision attendue se matérialise correctement si une condition de test existe.

Avec compte non-superadmin si pratique :
- [ ] même URL retourne le comportement admin-not-found attendu.

## Sortie
Dashboard, notifications et Supervision donnent une vue cohérente sans modifier les états métier propriétaires.
