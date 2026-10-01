# Build environment for this session (read before touching the schema or the database)

The Prisma engine host (binaries.prisma.sh) is blocked by the network policy, so the
native schema engine is missing. `prisma migrate dev` / `migrate deploy` / `db seed` do NOT work.
Postgres 16 runs locally (a fresh container has no `perolehan` role: create it as a login superuser with password `perolehan`, then `createdb -O perolehan perolehan` and `perolehan_shadow`); if it is down (container restart) run `service postgresql start`. DB `perolehan`, user/pass `perolehan`.

- Generate the client:   `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`
- Seed:                  `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx tsx prisma/seed.ts`
- Demo data:             `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npm run demo:load` (and `demo:wipe`)
- Apply migrations:      `STRIP_COMMENTS=1 NODE_PATH=/home/user/repo/node_modules node /tmp/claude-0/sew/pmig.mjs deploy`
  (always STRIP_COMMENTS=1: `20260930131827_authority_issue_lifecycle` has a `;` in a comment, so a fresh
  database fails on it otherwise. The applied checksums are then those of the stripped files, so keep using it.)
- Show pending SQL:      `NODE_PATH=/home/user/repo/node_modules node /tmp/claude-0/sew/pmig.mjs diff`
  (diff = live DB -> prisma/schema.prisma; "-- This is an empty migration." means in sync)
- Create a migration:    edit prisma/schema.prisma, then
                         `NODE_PATH=/home/user/repo/node_modules node /tmp/claude-0/sew/pmig.mjs create <snake_name>`
                         review the generated prisma/migrations/<ts>_<name>/migration.sql, then `deploy`.
- Prove migrations rebuild the schema: `/tmp/claude-0/sew/verify.sh` (rebuilds throwaway DB
  `perolehan_verify` from the migrations folder; last line must be "-- This is an empty migration.")

Rules for migration SQL (the WASM engine splits scripts on every `;`, even inside comments):
- NEVER put `;` inside a comment or a string literal in migration.sql.
- NEVER edit an existing migration.sql (checksums). Additive migrations only; never reset or drop the `perolehan` database.
- After deploy, `psql postgresql://perolehan:perolehan@localhost:5432/perolehan -Atc "select migration_name from _prisma_migrations where finished_at is null"` must print nothing.
- Data backfills (UPDATE/INSERT) go in the migration SQL by hand, after the generated DDL.

Checks: `npm test`, `npm run typecheck`, `npm run lint` must all pass.
Dev server: `npm run dev` (port 3000). Never push, never contact outside services.

Second run (2026-10-01): the tools now live in `docs/notes/cloud-build/tools/`; copy them to the scratchpad, replace
`/tmp/claude-0/sew` with that directory, and `npm i @prisma/schema-engine-wasm@7.9.0-1.e922089b7d7502aff4249d5da3420f6fa55fc6ad`
there. `npm ci --ignore-scripts` then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`.
