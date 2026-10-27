---
titre: Manuel de maintenance
public: développeur, exploitation
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.4a, S7.4b, SEC-01, TEST-01, DOC-01a]
---

# Manuel de maintenance

Ce qui existe aujourd'hui. Les sections marquées « À rédiger » ou « Sprint 9 » seront complétées plus tard.

## 1. Environnements

| Environnement | Fichier compose                                    | Fichier d'environnement                          | PostgreSQL                                                                                           |
| ------------- | -------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Développement | `docker-compose.yml` (PostgreSQL, Mailpit, ClamAV) | `.env` (copie de `.env.example`)                 | port `5433` de l'hôte ; bases `kfit_dev` (API de développement) et `kfit_test` (tests d'intégration) |
| Staging       | `docker-compose.staging.yml`                       | `.env.staging` (copie de `.env.staging.example`) | non publié sur l'hôte                                                                                |
| Production    | `docker-compose.prod.yml`                          | `.env.prod` (copie de `.env.prod.example`)       | non publié sur l'hôte (réseau interne)                                                               |

Règles :

- Staging et production n'exposent jamais PostgreSQL à l'hôte ni à Internet.
- Chaque environnement a ses volumes nommés et son fichier `.env`.
- Aucun secret réel n'est versionné.

Développement local :

```bash
cp .env.example .env          # puis renseigner les secrets locaux
npm install
npm run db:up                 # PostgreSQL seul (port 5433)
docker compose up -d mailpit clamav   # SMTP de développement et antivirus, si besoin
docker compose ps             # postgres doit être « healthy »
npm run db:migrate
npm run dev:api:watch         # API recompilée et relancée à chaque modification
npm run dev:client
```

Arrêter sans perdre les données : `npm run db:down`. Réinitialiser la base de développement et supprimer son volume : `npm run db:reset`. Cette commande est **destructive** et réservée aux données locales.

Le port `5432` de l'hôte reste réservé à une éventuelle installation native de PostgreSQL.

Le harnais d'authentification de type staging du Sprint 1 (proxy nginx `auth_proxy`, `npm run preflight:auth-staging`) est décrit dans l'[archive des environnements Docker](../archive/docker-environments.md).

## 2. Migrations

- Schéma : `packages/server/src/db/schema/`. Migrations générées dans `packages/server/src/db/migrations/`. Ne jamais modifier une migration à la main.
- Générer après un changement de schéma : `npm run db:generate`. Relancer ensuite : la commande doit répondre « No schema changes ».
- Vérifier la cohérence : `npm run db:check`.
- Appliquer : `npm run db:migrate` (base de `DATABASE_URL`).
- Base de tests : `npm run db:test:prepare` (`.env.test`). La commande crée `kfit_test` si besoin, applique les migrations et charge le catalogue. Elle peut être relancée sans risque.
- La CI échoue si un schéma modifié n'a pas sa migration.

## 3. Scripts npm

Catalogue complet, généré : [scripts npm](../reference/scripts-npm.md).

## 4. Journaux

- Journal de l'API : `winston`, sortie console, une ligne `HH:MM:SS niveau message`. Niveau réglé par `LOG_LEVEL` (par défaut `http` : une ligne par requête).
- Les chemins des liens publics sont masqués (`:token`) et les chaînes de requête ne sont pas journalisées.
- Règle de code : ne jamais journaliser de mot de passe, jeton, code ou donnée personnelle.
- Conservation et rotation des journaux : **Sprint 9**.

## 5. Routine mensuelle

- [ ] `npm audit` à la racine ; traiter les failles des dépendances.
- [ ] Revue du [plancher de sécurité](../runbooks/plancher-securite.md) : nouvelles failles Node.js.
- [ ] Relire les [contrôles de restauration](../runbooks/sauvegarde-restauration.md) de la semaine (`ops.restore_drill` en `succeeded`).
- [ ] `npm run docs:check` : références à jour, liens valides.

## 6. Tests

- `npm test` : tests unitaires (shared, server ; les tests PDF sont ignorés sans navigateur).
- `npm run test:integration` : tests sur la base locale `kfit_test` uniquement.
- `npm run typecheck`, `npm run build`, `npm run security:check`, `npm run docs:check`.

## 7. Déploiement

**Sprint 9** : image Docker, service API dans le compose de production, nginx, TLS, timer de sauvegarde, copie hors serveur.

## 8. Mise à jour des dépendances

À rédiger - DOC-01b.
