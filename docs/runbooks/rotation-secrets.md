---
titre: Rotation des secrets
public: exploitation
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.4a, S7.4b]
---

# Rotation des secrets

## Secrets en place

| Variable                                                      | Usage                                                                                         | Contrainte connue                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `AUTH_OTP_PEPPER`                                             | Empreinte des codes à usage unique ; valeur par défaut des autres secrets d'authentification. | ≥ 32 caractères en production (`ENV_WEAK_SECRET`).                                                          |
| `AUTH_AUDIT_HASH_PEPPER`                                      | Empreintes de l'IP et du user-agent dans l'audit.                                             | ≥ 32 caractères en production.                                                                              |
| `AUTH_REFRESH_TOKEN_PEPPER`                                   | Empreinte des jetons de rafraîchissement de session.                                          | ≥ 32 caractères en production.                                                                              |
| `AUTH_ACCESS_TOKEN_SECRET`                                    | Signature des jetons d'accès.                                                                 | ≥ 32 caractères en production.                                                                              |
| `AUTH_RECOVERY_TOKEN_SECRET`                                  | Signature des autorisations de récupération de mot de passe.                                  | ≥ 32 caractères en production.                                                                              |
| `SMTP_PASS`                                                   | Compte d'envoi des e-mails.                                                                   | Requis en production.                                                                                       |
| `BACKUP_ENCRYPTION_KEY`                                       | Chiffrement des sauvegardes.                                                                  | 64 caractères hexadécimaux ; voir [sauvegarde](sauvegarde-restauration.md) § 2.2 pour le changement de clé. |
| Mot de passe PostgreSQL (`DATABASE_URL`, `POSTGRES_PASSWORD`) | Accès à la base.                                                                              | -                                                                                                           |

## Effets d'un changement

À rédiger - DOC-01b. **À vérifier** pour chaque secret : sessions invalidées, liens publics et codes en cours, empreintes d'audit qui ne se recoupent plus avec les anciennes.

## Procédure

À rédiger - DOC-01b.
