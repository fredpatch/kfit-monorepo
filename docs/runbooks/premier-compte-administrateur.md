---
titre: Premier compte administrateur
public: exploitation
statut: brouillon
vérifié-sur: 0a1c210
couvre: [SEC-02a, SEC-02b, BOOT-01, ROLE-01]
---

# Premier compte administrateur

Sources : `packages/server/src/modules/auth/services/bootstrap.service.ts`, `packages/server/src/modules/auth/services/bootstrap-access.ts`, `packages/server/src/runtime/production-guards.ts`, `packages/server/src/modules/auth/repositories/auth.repositories.ts` (`DrizzleBootstrapRepository`), `packages/server/src/modules/auth/routes/auth.routes.ts`, `packages/client/src/auth/components/BootstrapForm.tsx`, `packages/server/src/modules/auth/services/device-login.service.ts`, `packages/server/src/ops/user-accounts.ts`, `packages/server/src/db/migrations/0019_role_superadmin.sql`.

## 1. Comment l'initialisation est atteinte et fermée

- Tant que la table `users` est vide, `GET /auth/bootstrap/status` répond `required: true` et l'application affiche l'écran « Initialisation » (« Crée le premier compte coach. Aucun identifiant par défaut n'est fourni. »).
- `POST /auth/bootstrap` crée ce premier compte avec le rôle super-administrateur (ROLE-01). C'est le seul chemin qui crée ce rôle : un seul compte l'a, celui de l'exploitation. Sur une base qui existait avant ROLE-01, la migration 0019 donne ce rôle au plus ancien compte actif, s'il n'existe encore aucun super-administrateur. La route ne demande ni session ni jeton CSRF. Elle refuse une origine étrangère (`403 AUTH_ORIGIN_INVALID`) et accepte 5 essais par adresse réseau sur 15 minutes (ensuite `429 AUTH_RATE_LIMITED`, compté `RATE_LIMITED:auth_bootstrap`).
- **En production (BOOT-01)**, la route exige l'en-tête `x-kfit-bootstrap-token`, égal à la variable `KFIT_BOOTSTRAP_TOKEN` (32 caractères minimum, pas de valeur d'exemple). L'écran affiche alors le champ « Jeton d'initialisation ».
  - Variable absente, trop courte ou d'exemple : `403 BOOTSTRAP_DISABLED`, et l'écran affiche « Initialisation désactivée : définis KFIT_BOOTSTRAP_TOKEN côté serveur (voir runbook). ».
  - Mauvais jeton : `403 BOOTSTRAP_TOKEN_INVALID`, audité `auth.bootstrap.rejected` (raison `token_invalid`, jamais la valeur).
- En développement, aucun jeton n'est demandé.
- Fermeture : dès qu'un compte existe, la route répond `409 BOOTSTRAP_ALREADY_COMPLETED` (événement d'audit `auth.bootstrap.rejected`). La création se fait dans une transaction protégée par un verrou PostgreSQL (`pg_advisory_xact_lock`), qui revérifie la table : deux appels simultanés ne créent jamais deux comptes.
- L'adresse e-mail saisie n'est pas vérifiée à la création : aucun e-mail de confirmation n'est envoyé.

## 2. Procédure en production

1. Générer un jeton, sans l'afficher dans un historique partagé :
   ```bash
   openssl rand -base64 48
   ```
2. Ajouter `KFIT_BOOTSTRAP_TOKEN=<jeton>` à l'environnement de l'API, puis la démarrer ([démarrage en production](demarrage-production.md)). Résultat attendu dans le journal : `⚠ KFIT_BOOTSTRAP_TOKEN is set and no account exists: the first account can be created; remove the variable afterwards`. SMTP doit fonctionner : sans lui, la première connexion est impossible (étape 5).
3. Ouvrir l'application. Sur « Initialisation », saisir le « Jeton d'initialisation », l'e-mail de l'administrateur (une boîte à laquelle il a accès tout de suite) et un mot de passe conforme (12 caractères minimum, au moins une lettre et un chiffre).
4. « Créer le compte ». Résultat attendu : le message de confirmation, puis l'écran « Connexion ».
5. Se connecter. Le navigateur est inconnu : l'écran « Nouvel appareil » demande le code à 6 chiffres envoyé à l'e-mail du compte (sujet « K'FIT - Code de connexion »). Cocher « Faire confiance à cet appareil pendant 30 jours » sur un poste personnel, puis « Valider ».
6. **Retirer `KFIT_BOOTSTRAP_TOKEN`** de l'environnement et redémarrer l'API. Tant qu'elle reste définie, chaque démarrage affiche `⚠ KFIT_BOOTSTRAP_TOKEN is set but an account already exists: « retire KFIT_BOOTSTRAP_TOKEN » and restart`.

La variable n'est pas obligatoire au démarrage : sans elle, l'API démarre et l'initialisation reste fermée.

## 3. Créer le compte de la coach (ROLE-01)

Le premier compte (super-administrateur) est celui de l'exploitation. La coach a son propre compte, avec le rôle administrateur : tout l'espace coach et la configuration, sans la Supervision.

1. Sur le serveur, depuis la racine du dépôt :
   ```bash
   npm run ops:create-user -- --email <e-mail de la coach> --role admin --label <prénom>
   ```
   Résultat attendu : `Compte créé. La personne doit choisir son mot de passe via « Mot de passe oublié » sur l'écran de connexion.`, code de sortie 0. La commande compile l'API avant de s'exécuter.
   - Le compte est actif, avec un mot de passe aléatoire jamais affiché ni enregistré en clair : aucun mot de passe ne l'ouvre tant que la coach n'en a pas choisi un.
   - L'e-mail est enregistré en minuscules, sans espaces. Une adresse déjà utilisée, quelle que soit la casse, est refusée (`USER_EMAIL_TAKEN`). `--role superadmin` est refusé (`SUPERADMIN_ONLY_VIA_BOOTSTRAP`).
   - Trace : audit `auth.user.created` (acteur `system:ops`, rôle, prénom s'il est donné, jamais l'e-mail) et une ligne `ops.create_user` dans `scheduled_job_runs` ([scripts d'exploitation](../reference/jobs.md#scripts-dexploitation)).
2. La coach ouvre l'application, choisit « Mot de passe oublié », saisit son e-mail, reçoit le code et choisit son mot de passe.
3. Elle se connecte. Son navigateur est inconnu : l'écran « Nouvel appareil » demande le code envoyé à son e-mail. Sur son poste personnel, elle coche « Faire confiance à cet appareil pendant 30 jours ».

**Changer le rôle d'un compte** (administrateur ↔ coach) :

```bash
npm run ops:set-role -- --email <e-mail> --role admin|coach
```

Résultat attendu : `Rôle modifié. Il s'applique à la prochaine connexion ou au prochain rafraîchissement de session.` Le rôle porté par la session est relu au rafraîchissement, soit 15 minutes au plus avec la durée par défaut (`AUTH_ACCESS_TOKEN_TTL_MS`). Jamais vers ni depuis super-administrateur (`SUPERADMIN_ONLY_VIA_BOOTSTRAP`) : le dernier super-administrateur ne peut donc pas perdre son rôle. Audit `auth.user.role_changed` (ancien et nouveau rôle), ligne `ops.set_role`. Aucun écran ni route HTTP ne gère les comptes.

## 4. Si l'e-mail saisi est faux

Symptôme : aucun code n'arrive à l'étape 5, et « Mot de passe oublié » n'aide pas, car le code de récupération part aussi vers cette adresse.

Aucun écran ne permet de corriger l'e-mail d'un compte. La correction se fait dans la base, par l'exploitation :

1. Faire une sauvegarde ([sauvegarde et restauration](sauvegarde-restauration.md)).
2. Corriger l'adresse, en minuscules (la connexion compare l'e-mail en minuscules, sans espaces) :
   ```sql
   UPDATE users SET email = '<bonne adresse en minuscules>', updated_at = now() WHERE email = '<adresse erronée>';
   ```
   Résultat attendu : `UPDATE 1`.
3. Se reconnecter : le code part vers la nouvelle adresse.

Ne jamais supprimer le compte pour rouvrir l'initialisation une fois que des données métier existent.

## 5. Pour aller plus loin

- Rôles et accès : [guide de l'administrateur](../guides/guide-administrateur.md#1-rôles-et-accès).

- Appareils de confiance, révocation, effet d'une réinitialisation de mot de passe : [guide de l'administrateur](../guides/guide-administrateur.md#6-comptes-et-sessions).
- `AUTH_DEVICE_PEPPER` (obligatoire en production) : [démarrage en production](demarrage-production.md).
