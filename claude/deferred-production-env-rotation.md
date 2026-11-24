# Deferred hardening - production environment and secret rotation

Status: deferred. Do not implement while S9A.3 is active.

## Goal

Adapt the proven environment/secret rotation mechanism used by AI Invoice Manager to K'FIT once the initial Hostinger beta environment is stable.

## Why

K'FIT production uses long-lived credentials and security material including:

- PostgreSQL password / DATABASE_URL;
- auth peppers and JWT signing secrets;
- SMTP credentials;
- backup encryption key;
- bootstrap token (temporary, first-run only).

A production process is needed for safe creation, staged rotation, rollback, restart sequencing and operator verification without storing secrets in Git.

## Constraints

- Never commit real values.
- Rotation must be deliberate and auditable.
- Secrets with persisted derivations or tokens need compatibility/invalidations understood before rotation.
- Database credentials must rotate atomically with DATABASE_URL.
- AUTH_DEVICE_PEPPER rotation invalidates trusted devices.
- JWT/session/refresh-related secret rotation can invalidate active sessions and must be planned.
- BACKUP_ENCRYPTION_KEY requires an off-server retained copy and cannot be casually replaced for historical backups.
- Bootstrap token is temporary and should normally be absent after first account creation.
- Preserve least privilege and rollback capability.

## Future implementation workflow

Before implementation, inspect the current AI Invoice Manager env-rotation implementation directly and extract the reusable mechanism. Then write a K'FIT-specific design covering:

1. secret inventory and rotation classes;
2. generated versioned env files or secret bundles;
3. atomic active-version switch;
4. permissions/ownership;
5. service restart/reload order;
6. validation before commit point;
7. rollback;
8. rotation log without secret values;
9. per-secret rotation consequences;
10. operator runbook and recovery path.

Do not copy AI Invoice Manager domain assumptions blindly.

## Current S9A rule

For the first beta deployment, provision one protected production env file manually and validate it. Rotation automation is a later hardening task and must not block S9A.3/S9A.4/S9A.6.
