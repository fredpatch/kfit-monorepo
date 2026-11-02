# S0 - Préflight de recette

## But

Établir un environnement local stable et traçable avant de créer les données UAT.

## Dépendances

- branche `main`;
- PostgreSQL local K'FIT disponible;
- SMTP/Mailpit disponible si les flows OTP/e-mail sont testés;
- stockage privé/ClamAV/Puppeteer disponibles pour les scénarios qui en dépendent.

## À exécuter par Fred

```bash
git pull origin main
git status
git rev-parse HEAD
npm run db:up
npm run db:migrate
npm run db:check
```

Si le catalogue / admin / consentements de démo ne sont pas présents :

```bash
npm run seed:catalogue
npm run seed:demo-admin
npm run seed:demo-consents
```

Démarrer l'API et le client dans deux terminaux :

```bash
npm run dev:api:watch
```

```bash
npm run dev:client
```

## Vérifications

- [ ] Commit exact enregistré.
- [ ] Working tree propre avant recette.
- [ ] Migrations appliquées.
- [ ] `db:check` vert.
- [ ] API démarre sans erreur.
- [ ] Client démarre sans erreur.
- [ ] Connexion admin fonctionne.
- [ ] Reload restaure la session.
- [ ] Déconnexion fonctionne.
- [ ] Un login depuis un appareil/session non approuvé déclenche le flow prévu de nouvel appareil si applicable.
- [ ] Le code OTP reçu est accepté une fois et ne peut pas être rejoué.
- [ ] Navigation `/admin` et reload d'une route admin imbriquée fonctionnent.
- [ ] Mailpit/SMTP reçoit les e-mails nécessaires si SMTP est activé.
- [ ] DBeaver se connecte à `kfit_dev`.

## Données

Utiliser uniquement des identités synthétiques explicites, par exemple :

- Client UAT Alpha
- Client UAT Beta
- +24100000001 / +24100000002
- uat.alpha@example.test

Ne pas utiliser de données personnelles ou de santé réelles.

## Résultat attendu

Environnement stable, commit connu, aucune anomalie P0/P1 avant S1.
