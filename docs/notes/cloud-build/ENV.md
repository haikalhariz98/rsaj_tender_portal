# Build environment for this session (read before touching the schema or the database)

The Prisma engine host (binaries.prisma.sh) is blocked by the network policy, so the
native schema engine is missing. `prisma migrate dev` / `migrate deploy` / `db seed` do NOT work.
Postgres 16 runs locally (a fresh container has no `perolehan` role: create it as a login superuser with password `perolehan`, then `createdb -O perolehan perolehan` and `perolehan_shadow`); if it is down (container restart) run `service postgresql start`. DB `perolehan`, user/pass `perolehan`.

- Generate the client:   `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`
  After generating, restart a running `npm run dev`: the client is cached on `globalThis` (`src/lib/db.ts`),
  so hot reload keeps the old one, which lacks new models, columns and global `omit`s.
- Seed:                  `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx tsx prisma/seed.ts`
- Demo data:             `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npm run demo:load` (and `demo:wipe`)
Tools directory (`$SEW` below): a scratch copy of `docs/notes/cloud-build/tools/` with the WASM engine installed in it
(set it up as "Second run" below says). `pmig.mjs` and `verify.sh` find their helpers next to themselves, wherever
the directory is; `PEROLEHAN_TOOLS_DIR` overrides that, and `PEROLEHAN_REPO` overrides the repository (default
`/home/user/repo`). Nothing in them names a scratch path.

- Apply migrations:      `STRIP_COMMENTS=1 NODE_PATH=/home/user/repo/node_modules node $SEW/pmig.mjs deploy`
  (always STRIP_COMMENTS=1: `20260930131827_authority_issue_lifecycle` has a `;` in a comment, so a fresh
  database fails on it otherwise. The applied checksums are then those of the stripped files, so keep using it.)
- Show pending SQL:      `NODE_PATH=/home/user/repo/node_modules node $SEW/pmig.mjs diff`
  (diff = live DB -> prisma/schema.prisma; "-- This is an empty migration." means in sync)
- Create a migration:    edit prisma/schema.prisma, then
                         `NODE_PATH=/home/user/repo/node_modules node $SEW/pmig.mjs create <snake_name>`
                         review the generated prisma/migrations/<ts>_<name>/migration.sql, then `deploy`.
- Prove migrations rebuild the schema: `bash $SEW/verify.sh` (rebuilds throwaway DB
  `perolehan_verify` from the migrations folder; last line must be "-- This is an empty migration.").
  It checks for every helper (pmig.mjs, the patched adapter, the WASM engine, the repository's node_modules)
  before it drops anything, and stops with "nothing was dropped" when one is missing. Running the
  committed copy in `docs/notes/cloud-build/tools/` therefore stops there: it has no engine installed.

Rules for migration SQL (the WASM engine splits scripts on every `;`, even inside comments):
- NEVER put `;` inside a comment or a string literal in migration.sql.
- NEVER edit an existing migration.sql (checksums). Additive migrations only; never reset or drop the `perolehan` database.
- After deploy, `psql postgresql://perolehan:perolehan@localhost:5432/perolehan -Atc "select migration_name from _prisma_migrations where finished_at is null"` must print nothing.
- Data backfills (UPDATE/INSERT) go in the migration SQL by hand, after the generated DDL.

Checks: `npm test`, `npm run typecheck`, `npm run lint` must all pass.
Dev server: `npm run dev` (port 3000). Never push, never contact outside services.

Second run (2026-10-01): the tools now live in `docs/notes/cloud-build/tools/`; copy them to a directory in the
scratchpad (that is `$SEW`; this session used `<scratchpad>/sew`) and
`npm i @prisma/schema-engine-wasm@7.9.0-1.e922089b7d7502aff4249d5da3420f6fa55fc6ad` there. No path in the copies
needs editing (64-C3). After changing a tool, copy it there again; keep that directory's node_modules.
`npm ci --ignore-scripts` then `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`.

Document store (2026-10-01): the first CHECK constraints in the schema made the WASM describer panic
("Getting constraint_type ... as char failed"), because the patched adapter read Postgres `"char"` (oid 18,
`pg_constraint.contype`) as text. `tools/adapter-pg-patched.cjs` now reads it as a character, as the native
engine does; with it `verify.sh` again ends with an empty diff and the CHECKs are present in the rebuilt
database. Prisma does not model CHECK constraints, so they live only in the migration SQL.
