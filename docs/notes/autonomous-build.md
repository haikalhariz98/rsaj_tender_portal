# Autonomous build brief

The founder is away and has asked for every module to be built without stopping. You
work alone. Read `AGENTS.md`, `docs/notes/handoff.md` and this file before anything else.

## Where you are

- Branch `build-all-modules`. Work and commit only here. Never touch, merge into, or
  rebase `master` or `redesign/modern-friendly` — the founder demos from the latter.
- The client's documents are on this branch only: `docs/requirements/` (the RSAJ
  specification — the `.md` is the text) and `docs/prototype/` (the clickable prototype
  and per-screen specs). Read them; never copy them anywhere outside this repository.

## Decisions: consult, don't ask

Do not stop to ask the founder anything. For every decision the spec leaves open, before
starting each module, and when finishing each module, consult the **product-owner**
agent (`.claude/agents/product-owner.md`). It decides on the founder's behalf. Append
every decision to `docs/notes/decisions-log.md` (date, module, decision, reason, spec ID).

## Order of work

Follow the specification's Section 13 phasing. What already exists: the approval engine
(6.9, with draft/issued DAL issues), committee configuration (6.10, partly — no meetings
UI), Configuration for organisation, users, budget, numbering, documents, templates,
reference data and notifications.

1. **Phase 1 — the spine:** committee meetings, attendance, votes and minutes (rest of
   6.10); requisition and intake with funding route and budget check (6.1); method
   selection, value bands and contract type (6.3); award instruments and registers (6.11,
   parts of 6.12).
2. **Phase 2 — sourcing window:** 6.2, 6.4, 6.5, 6.6, 6.7, 6.8.
3. **Phase 3 — vendor portal:** 6.15 (replaces the supplier "not built" pages).
4. **Phase 4 — post-award core:** 6.12, 6.13 (contract baseline first), 6.14.
5. **Phase 5 — post-award completion** (rest of 6.13).
6. **Phase 6 — performance and reporting:** 6.16, 6.17.

Within a phase, one module at a time: plan it against the spec's requirement table, get
the product-owner's go, build, verify, get the product-owner's acceptance, commit, move
on. Replace the module's `NotBuilt` page when it lands.

## How to build

- Everything in `AGENTS.md` applies — especially the five non-negotiable rules, the
  provenance pattern, and the UI rules (shared components only; `npm run lint` fails on
  retired classes).
- Schema changes are Prisma migrations with a clear name; additive where possible; never
  a reset. Business logic is pure, in `src/lib/**`, with vitest tests that include the
  spec's worked examples (Section 8 calculations especially).
- Extend `prisma/demo.ts` so each new module has invented demo data (ids `demo_`), so its
  screens can be seen populated.

## Verify, every module

`npm test`, `npm run typecheck`, `npm run lint` all pass. Start the app (Postgres via
`docker compose up -d` or the pre-installed server; `.env` from `.env.example`;
`npx prisma migrate deploy`, `npm run db:seed`, `npm run demo:load`, `npm run dev`) and
open the module's screens and their siblings. Fix what you see before moving on.

## Commit

One commit per coherent step, clear message saying what and why, ending with the
`Co-Authored-By` line in your instructions. Commit often: work that is not committed is
lost if the session ends.

## Never

Push, open pull requests, deploy, or contact any outside service. Delete or reset the
database. Build sign-in, tenancy or maker-checker (deferred — see AGENTS.md). Weaken or
delete an existing test to make something pass. Hard-code anything RSAJ-specific.

## Keep going

When a module is accepted, start the next one. Do not end the session while work
remains in the phasing. If the session must end, first commit, then write where you
stopped and what is next at the top of `docs/notes/decisions-log.md`.
