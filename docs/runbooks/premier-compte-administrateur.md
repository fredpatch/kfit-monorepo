---
titre: Premier compte administrateur
public: exploitation
statut: brouillon
vérifié-sur: 4db73be
couvre: [SEC-02a]
---

# Premier compte administrateur

Sources : `packages/server/src/modules/auth/services/bootstrap.service.ts`, `packages/server/src/modules/auth/repositories/auth.repositories.ts` (`DrizzleBootstrapRepository`), `packages/server/src/modules/auth/routes/auth.routes.ts`, `packages/client/src/auth/components/BootstrapForm.tsx`, `packages/server/src/modules/auth/services/device-login.service.ts`.

## 1. Comment l'initialisation est atteinte et fermée

- Tant que la table `users` est vide, `GET /auth/bootstrap/status` répond `{ "required": true }` et l'application affiche l'écran « Initialisation » (« Crée le premier compte coach. Aucun identifiant par défaut n'est fourni. »).
- `POST /auth/bootstrap` crée ce premier compte avec le rôle administrateur. La route ne demande ni session, ni jeton CSRF, ni contrôle d'origine : **n'importe qui peut l'appeler tant qu'aucun compte n'existe**.
- Fermeture : dès qu'un compte existe, la route répond `409 BOOTSTRAP_ALREADY_COMPLETED` (événement d'audit `auth.bootstrap.rejected`). La création se fait dans une transaction protégée par un verrou PostgreSQL (`pg_advisory_xact_lock`), qui revérifie la table : deux appels simultanés ne créent jamais deux comptes.
- L'adresse e-mail saisie n'est pas vérifiée à la création : aucun e-mail de confirmation n'est envoyé.

## 2. Procédure en production

1. Démarrer l'API ([démarrage en production](demarrage-production.md)). SMTP doit fonctionner : sans lui, la première connexion est impossible (étape 4).
2. **Immédiatement**, ouvrir l'application et remplir « Initialisation » avec l'e-mail de l'administrateur (une boîte à laquelle il a accès tout de suite) et un mot de passe conforme (12 caractères minimum, au moins une lettre et un chiffre).
3. « Créer le compte ». Résultat attendu : le message de confirmation, puis l'écran « Connexion ».
4. Se connecter. Le navigateur est inconnu : K'FIT envoie un code à 6 chiffres à l'e-mail du compte (sujet « K'FIT — Code de connexion »). Le saisir, et choisir de faire confiance à l'appareil pour ne pas redemander de code pendant 30 jours.

**À vérifier** : l'écran de saisie du code arrive avec SEC-02b. D'ici là, l'application affiche « Une erreur est survenue. Réessaie dans un instant. » à l'étape 4, et le code se valide depuis la console du navigateur (voir le rapport SEC-02a).

**Risque.** Entre le premier démarrage et l'étape 3, la route est ouverte. Faire l'initialisation dans la foulée du démarrage, avant d'annoncer l'adresse du site. **À vérifier** au Sprint 9 : restreindre l'accès (nginx) pendant cette fenêtre.

## 3. Si l'e-mail saisi est faux

Symptôme : aucun code n'arrive à l'étape 4, et « Mot de passe oublié » n'aide pas, car le code de récupération part aussi vers cette adresse.

Aucun écran ne permet de corriger l'e-mail d'un compte. La correction se fait dans la base, par l'exploitation :

1. Faire une sauvegarde ([sauvegarde et restauration](sauvegarde-restauration.md)).
2. Corriger l'adresse, en minuscules (la connexion compare l'e-mail en minuscules, sans espaces) :
   ```sql
   UPDATE users SET email = '<bonne adresse en minuscules>', updated_at = now() WHERE email = '<adresse erronée>';
   ```
   Résultat attendu : `UPDATE 1`.
3. Se reconnecter : le code part vers la nouvelle adresse.

Ne jamais supprimer le compte pour rouvrir l'initialisation une fois que des données métier existent.

## 4. Pour aller plus loin

- Appareils de confiance, révocation, effet d'une réinitialisation de mot de passe : [guide de l'administrateur](../guides/guide-administrateur.md#6-comptes-et-sessions).
- `AUTH_DEVICE_PEPPER` (obligatoire en production) : [démarrage en production](demarrage-production.md).
