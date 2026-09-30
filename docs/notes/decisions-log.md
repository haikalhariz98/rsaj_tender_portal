# Decisions log

Decisions taken on the founder's behalf by the product-owner agent during the autonomous
build (`docs/notes/autonomous-build.md`). Newest first. Each entry: date · module ·
decision · reason · spec ID.

## Where the build stopped

Phase 1 started 2026-09-30. Module in progress: 6.10 committee meetings.

**Environment caveat for the founder.** This session ran on PostgreSQL 16 (no Docker) and
could not download Prisma's native schema engine (binaries.prisma.sh is blocked by the
session's network policy). Migrations were generated and applied with Prisma's npm-hosted
WASM schema engine (same engine version, e922089) through `@prisma/adapter-pg`, and every
migration folder was proved by rebuilding a throwaway database from it and diffing
against `schema.prisma` (empty diff). Before relying on them, run `npx prisma migrate
dev` on a normal machine against Postgres 17 and confirm it reports no drift.

## Decisions

- 2026-09-30 · setup · Migrations are hand-checked output of the WASM schema engine, not
  `prisma migrate dev`, and no migration comment may contain a semicolon (the WASM path
  splits scripts on them). Reason: native engine download blocked; the rule keeps the
  migrations valid on both paths. Spec: n/a (tooling).

- 2026-09-30 · setup · The RSAJ documents (`docs/requirements/`, `docs/prototype/`) are
  gitignored and were NOT committed by Claude; adding them to this branch is the founder's
  own action. If they are absent, build from `docs/prototype/spec/` if present and from
  AGENTS.md, and record every place the spec was needed but unavailable.
