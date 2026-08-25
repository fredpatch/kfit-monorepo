# K'FIT Docker Environments

## Local development

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

3. Check container state:

   ```bash
   docker compose ps
   ```

   Expected state for `postgres`: `healthy`.

4. Validate the schema tooling:

   ```bash
   npm run db:check
   npm run db:generate
   npm run db:migrate
   ```

5. Optional PostgreSQL connectivity check:

   ```bash
   docker compose exec postgres psql -U kfit -d kfit_dev -c "select current_database(), current_user, version();"
   ```

6. Stop the environment without deleting data:

   ```bash
   npm run db:down
   ```

7. Reset the development database and delete its volume:

   ```bash
   npm run db:reset
   ```

   This is destructive and must only be used for local development data.

## Environment boundaries

- Development exposes PostgreSQL to the host on `${POSTGRES_PORT:-5432}` for local Drizzle/API tooling.
- Staging and production do not publish PostgreSQL ports to the host or Internet.
- Staging and production use separate named volumes and separate `.env` files.
- Real staging/production secrets must never be committed.
- Application containers will later connect to PostgreSQL through the private Docker network using hostname `postgres`.

## Staging foundation

Create `.env.staging` from `.env.staging.example`, replace all placeholder secrets, then:

```bash
docker compose -f docker-compose.staging.yml up -d postgres
```

## Production foundation

Create `.env.prod` from `.env.prod.example`, replace all placeholder secrets, then:

```bash
docker compose -f docker-compose.prod.yml up -d postgres
```

## Sprint 0 acceptance for the database environment

The database foundation is accepted only when all of the following pass on a fresh local volume:

- PostgreSQL container reaches `healthy`.
- `npm run typecheck` passes from the repository root.
- `npm run db:check` passes.
- `npm run db:generate` succeeds.
- `npm run db:migrate` applies successfully to the Docker database.
- A second `npm run db:migrate` is safe/no-op.
- PostgreSQL can be stopped and restarted without losing migrated schema.
