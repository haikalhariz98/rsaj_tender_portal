# Perolehan

Procurement and contract administration: value-banded authority limits, committee
recommendations, and an audit trail behind every decision.

**Stack:** Next.js 16 (App Router, TypeScript) · Prisma 7 · Postgres 17.

## Status

A working shell and two engines, with **no organisation's data in it**. Configure an
authority matrix and committees, and the rest of the portal builds on top.

Nothing ships with sample limits or committees on purpose: those are policy, and
shipping someone else's is how a wrong threshold reaches production. Every screen
handles the unconfigured state and says what is missing.

## Getting started

Requires Node 20+ and Docker Desktop running.

```bash
cp .env.example .env
npm install
npm run setup           # Postgres, migrations, and one empty organisation
npm run dev             # http://localhost:3000
```

Set who you are in `.env`:

```
ORGANISATION_CODE=ACME
ORGANISATION_NAME=Acme Water
ORGANISATION_STRAPLINE=Procurement
```

## What is built

### The shell

Two workspaces — internal staff and a supplier portal — with a switch in the top bar.
Navigation, breadcrumbs, page heads, cards, stat tiles and a `DataList` with search,
sort, filters, row selection, density and CSV export. Modules that do not exist yet
appear in the navigation and say plainly that they are not built.

### The authority engine

`src/lib/authority/resolve.ts` answers one question: *given a matter and a value, who
must propose, recommend and approve, and under what authority?* It is a pure function
over a matrix, so routing is testable without a database.

- Bands on the matter's value, on a percentage of contract sum, and on the parent
  contract's value — three independent families
- Most-specific rule wins; matters with no rule rank last and warn
- **Upward-reverting absence** — when a holder is absent, authority rises, never falls
- **No self-approval** — an actor who is also the approver is downgraded to
  recommender and the approval escalates
- Superintending Officer resolved from contract value
- External-funding override

### The committee engine

`src/lib/committee/quorum.ts` decides whether a sitting may lawfully record a decision.

- **Quorum has three states, not two**: met, not met, and *not set*. An unset quorum is
  not a quorum of zero, and a full room does not make an unwritten rule lawful.
- Individual votes, never one aggregate committee position
- A **mandatory recommendation requires every entitled member to vote**
- **A tie does not carry** — the system does not invent a casting vote

`npm test` runs 44 tests over both, against a synthetic fixture in
`src/lib/authority/fixture.ts` rather than any real organisation's limits.

## Provenance

Governing documents are often silent on things the system must still decide — who sits
on a committee, what its quorum is. Configuration therefore records **where a fact came
from**: `STATED` (written down), `OBSERVED` (seen in practice), `ASSUMED` (neither).
A screen that renders a written rule and an observed habit identically overstates its
own authority.

## Layout

```
prisma/
  schema.prisma        Organisation, AuthorityRole, AuthorityMatrix, AuthorityRule,
                       Committee, Meeting, CommitteeDecision, Vote
  seed.ts              Creates one empty organisation and nothing else
src/lib/authority/     The routing engine, its types, its loader and its test fixture
src/lib/committee/     Quorum and vote arithmetic
src/app/               Dashboard, Configuration, and the module placeholders
src/components/        Shell, DataList, accordion, rule chain, icons
src/app/design-system.css          Ported design system
src/app/design-system-runtime.css  Second stylesheet, extracted from the prototype
scripts/               Tooling to render a prototype and diff this app's DOM against it
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next dev server / production build / serve |
| `npm test` / `test:watch` | Vitest |
| `npm run lint` / `typecheck` | ESLint / `next typegen` + `tsc --noEmit` |
| `npm run setup` | `db:up` → `db:migrate` → `db:seed` |
| `npm run db:up` / `db:down` | Start (wait for healthy) / stop Postgres |
| `npm run db:reset` | **Destroys the volume**, then re-runs setup |
| `npm run db:migrate` | Prompts for a migration name — pass `--name` in scripts |

## Design fidelity tooling

`scripts/` can run an HTML prototype in jsdom, print its rendered structure, and diff
this app's DOM against it — so "does it match" is a measurement rather than an opinion.

```bash
PROTOTYPE=your-prototype.html node scripts/render-prototype.mjs out screen "Configuration"
node scripts/outline.mjs out/rendered-screen.html .content 6
node scripts/compare-shell.mjs out/rendered-screen.html http://localhost:3000/
```

A prototype may inject a second stylesheet from its JavaScript; `extract-runtime-css.mjs`
pulls that out. Porting only the `<style>` block leaves screens unstyled.

## Notes for a second customer

`organisationId` is on every configuration table, so a second organisation is a seed
rather than a migration. There is deliberately no tenant routing or isolation
middleware yet — that arrives with authentication.

## Renaming

`perolehan` appears in the directory name, `package.json`, `compose.yaml` (`name:`,
which pins the Docker volume) and `.env`. Run `docker compose down -v` **before**
changing them, or the old volume is orphaned.
