# myapp

Full-stack starter: **Next.js 16** (App Router, TypeScript, Tailwind v4) + **Prisma 7** + **Postgres 17** in Docker.

> `myapp` is a placeholder name and `Item` is a placeholder model. See [Renaming](#renaming) and [Making it yours](#making-it-yours).

## Requirements

- Node 20+ (built on 24.13)
- Docker Desktop running

## Getting started

```bash
cp .env.example .env    # defaults already match compose.yaml
npm install
npm run setup           # start Postgres, apply migrations, seed
npm run dev             # http://localhost:3000
```

`npm run setup` is idempotent — safe to re-run.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next dev server on :3000 |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` / `typecheck` | ESLint / `next typegen` + `tsc --noEmit` |
| `npm run setup` | `db:up` → `db:migrate` → `db:seed` |
| `npm run db:up` / `db:down` | Start (wait for healthy) / stop Postgres |
| `npm run db:reset` | **Destroys the volume**, then re-runs setup |
| `npm run db:migrate` | `prisma migrate dev` — prompts for a migration name |
| `npm run db:generate` | Regenerate the Prisma client (also runs on `npm install`) |
| `npm run db:seed` | Insert sample rows (skips if any exist) |
| `npm run db:studio` | Prisma Studio DB browser |

## Layout

```
compose.yaml               Postgres 17 + healthcheck; project name pinned to `myapp`
prisma/
  schema.prisma            Data model — edit, then `npm run db:migrate`
  migrations/              Committed migration history
  seed.ts                  Sample data
prisma.config.ts           Prisma CLI config (schema path, migrations, seed command)
src/
  app/page.tsx             Server Component — reads Postgres directly
  app/api/items/route.ts   GET (list) / POST (create)
  app/api/items/[id]/      PATCH (toggle) / DELETE
  components/item-list.tsx Client Component — calls the API, then router.refresh()
  lib/db.ts                Prisma client singleton
  generated/prisma/        Generated client — gitignored, never edit
```

## How the pieces connect

Reads go straight from the Server Component to Postgres via Prisma. Writes go through the
`/api/items` route handlers, then `router.refresh()` re-renders the server component with
fresh rows. That exercises both paths, so a break shows up immediately.

Two things worth knowing:

- **Prisma 7 needs a driver adapter.** `PrismaClient` is constructed with `PrismaPg` in
  `src/lib/db.ts`; a bare `new PrismaClient()` throws at runtime.
- **`export const dynamic = "force-dynamic"` in `page.tsx` is load-bearing.** Without it Next
  prerenders the page at build time and the list freezes at build-time data.

## Environment

`.env` is read by the Prisma CLI (via `dotenv` in `prisma.config.ts`), by Next.js, and by
Docker Compose for the container credentials. It is gitignored; `.env.example` is the
committed template. `DATABASE_URL` must live in `.env` — the Prisma CLI does not read
`.env.local`.

## Renaming

Drop the old volume **first**, while `compose.yaml` still says `myapp` — otherwise
`down -v` targets the new project name, deletes nothing, and strands `myapp_db-data`
on disk:

```bash
docker compose down -v
```

Then change all four places together:

1. the directory name
2. `name` in `package.json`
3. `name:` in `compose.yaml` — pinned so the data volume survives a directory rename
4. `POSTGRES_*` and `DATABASE_URL` in `.env` and `.env.example`

Finally `npm run setup` to recreate the volume under the new name.

## Making it yours

1. Replace the `Item` model in `prisma/schema.prisma` with the real domain model.
2. `npm run db:migrate` to create the migration.
3. Rewrite `src/app/api/items/`, `src/components/item-list.tsx`, and `src/app/page.tsx`
   against the new model, and clear out `prisma/seed.ts`.

Auth is not wired up — there is deliberately no `User` model yet.

## Deploying

Vercel + a hosted Postgres (Neon, Supabase, RDS) is the shortest path: set `DATABASE_URL`
in the project's environment and run `prisma migrate deploy` in the build step. The bundled
`compose.yaml` is for local development only.
