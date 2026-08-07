<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below is ours. `next dev` only rewrites the block above, between its
     markers, so content here survives. Do not add anything inside those markers. -->

# Perolehan

Procurement and contract administration: value-banded authority limits, committee
recommendations, and an audit trail behind every decision.

## This is a product, not one organisation's system

No customer's data ships with it. Authority limits, offices and committees are policy,
and shipping someone else's as a default is how a wrong threshold reaches production.
`organisationId` is on every configuration table, so a second customer is a seed rather
than a migration. There is no tenant isolation middleware yet; it arrives with
authentication.

When a requirement looks like a blocker, first ask whether it is really a **customer
policy choice**. Where governing documents contradict each other — say, which side of a
threshold an exact value falls — the product ships the switch and the customer sets it.
`AuthorityMatrix.boundaryInclusive` is the worked example.

## Platform decisions already made

| Decision | Why |
| --- | --- |
| Next.js 16 + Prisma 7 + Postgres 17 | Resellable; no per-tenant platform licensing. |
| Standalone system of record, integrate behind a façade | Never build against one ERP's schema. |
| No auth, no `User` model yet | Deliberate. `Person` is identity, separate from sign-in. Do not stub auth. |

## The UI is ported, not designed

`src/app/design-system.css` and `src/app/design-system-runtime.css` are a design system
carried over as-is. **Build screens from those classes.** Do not write new component CSS
and do not restyle with Tailwind utilities.

- Both are deliberately **unlayered plain CSS**, so they beat Tailwind's layered
  utilities on any class both define (`.table`, `.grid`, `.container`, `.row`). Never
  wrap them in `@layer`.
- Light-only. There is no dark theme; do not add `dark:` variants.
- Vocabulary already there: `.card`, `.dl`/`.table`, `.pagehead`, `.stat`, `.chip`,
  `.badge`, `.callout`, `.chain`, `.quorum__pip`, `.vote__btn`, `.avatar`, `.empty`,
  `.field`/`.input`/`.select`, `.stack`, `.grid.g2..g6`, `.record`/`.rrail`,
  `.cfg-wrap`/`.cfg-rail`/`.cfg-main`, `.acc`, `.subnav`.
- Icons are inline SVG in `src/components/icons.tsx`. Add there rather than pulling in
  an icon package.
- Reusable: `DataList` (search, sort, filters, selection, density, CSV), `Accordion`,
  `RuleChain`, `NotBuilt`.

**If a screen must match a prototype, render the prototype and diff against it** —
`scripts/render-prototype.mjs`, `outline.mjs`, `compare-shell.mjs`. Reading a
prototype's source and rebuilding from fragments produces something plausible every
time and the same thing never. Note that a prototype may inject a second stylesheet
from its JavaScript; `extract-runtime-css.mjs` recovers it.

## Provenance: the pattern to copy

Governing documents are often silent on what the system must still decide. Configuration
records **where a fact came from** — `STATED`, `OBSERVED` or `ASSUMED`. A screen that
renders a written rule and an observed habit identically overstates its own authority.

Apply the same three-state honesty to any rule whose source is silent. Quorum is the
worked example: met, not met, and **not set** — an unset quorum is not a quorum of zero,
and `assessQuorum` will not certify a sitting under one.

## What exists

```
src/lib/authority/resolve.ts   the routing engine — pure, no database
src/lib/authority/fixture.ts   synthetic matrix the tests run against
src/lib/authority/load.ts      loads the effective-dated matrix from Postgres
src/lib/committee/quorum.ts    quorum and vote arithmetic
```

44 tests. Everything else in the navigation is a placeholder that says so.

## Rules that are not negotiable

1. **No hard-coded approver, threshold, rate or weighting.** If it varies by customer or
   by revision, it is a column, not a literal.
2. **Gaps stay honest.** A matter with no rule resolves but warns that the route is an
   assumption. Never quietly promote one.
3. **Business logic is pure and tested.** `src/lib/**` takes inputs and returns outputs.
   Route handlers and components call it; they never restate it.
4. **Money is `Decimal` in the database.** Convert at the boundary, never store float.
5. **Codes never reach a screen.** Matter codes, rule keys and clause slugs are
   configuration keys. Render labels.

## Commands

```bash
npm run setup      # Postgres + migrations + one empty organisation
npm run dev        # localhost:3000
npm test           # vitest
npm run typecheck  # next typegen && tsc --noEmit
npm run lint
npm run db:reset   # DESTROYS the volume, then re-runs setup
```

`npm run typecheck` runs `next typegen` first on purpose — `RouteContext<...>` types do
not exist until it has run, so bare `tsc` fails on a fresh clone. `npm run db:migrate`
prompts for a name; pass `--name` when scripting it.

