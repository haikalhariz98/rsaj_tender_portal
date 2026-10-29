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
| Maker-checker deferred until sign-in | NFR-USE-004 / NFR-SEC-004 require a second person to approve a configuration change. Without sign-in there is no "who", so a second approver cannot be told apart from the first. Until then: every change is audited with its before/after in the same transaction; the approval matrix has a draft → issued lifecycle, and **issuing** is where the checker step will attach; destructive changes ask for a reason. Do not fake a second approval. |
| Delegation line-management rules deferred | FR-APR-011 also requires the grantor to be the jobholder's superior and the delegate a line subordinate. There are no reporting lines in the data and no sign-in to say who is granting; `faultsIn` enforces everything else and says so. |

## The UI: one design system, in `src/components/ui`

The product has its own design system (indigo on slate, Plus Jakarta Sans, rounded
cards), replacing the ported prototype stylesheet. Tokens live in the `@theme` block of
`src/app/globals.css`; components live in `src/components/ui` and are used through
Tailwind utilities.

- **Every screen uses the shared pieces, never its own copy.** `PageHeader` (title,
  status badge, subtitle, facts, actions) heads every screen; `Tabs`
  (`src/components/tabs.tsx`) is the only tab strip; `DataList` is the only list.
  Also: `Card`/`CardHeader`/`CardBody`, `Badge`/`Chip`/`Dot`, `Button`/`ButtonLink`/
  `IconButton`, `Stat`/`KeyValues`, `Callout`/`EmptyState`/`Meter`, `Field`/`Input`/
  `Select`, `Avatar`, `Skeleton` (grey loading shapes, never a "Loading…" line). If a screen needs something they cannot do, extend the shared
  component — a one-off variant is how two screens stop matching.
- **Check a change against its siblings before calling it done.** A screen is not
  finished when it looks right alone; open the neighbouring screens in the same area
  and compare headers, tabs, spacing and list styling. `scripts/check-ui.mjs` (run by `npm run
  lint`) fails on the retired prototype classes anywhere in the app.
- **The prototype's stylesheet is gone.** Every screen is on the design system; the
  ported `design-system*.css` files were deleted once the last one moved. Its class names
  (`.pagehead`, `.card__head`, `.table`, `.btn`, `.badge--*`…) now style nothing — do not
  write them. `scripts/text-snapshot.mjs <dir>` records every screen's visible text; diff
  two runs to prove a restyle dropped no field, warning or provenance tag.
- Light-only. There is no dark theme; do not add `dark:` variants.
- Icons are inline SVG in `src/components/icons.tsx`. Add there rather than pulling in
  an icon package.

The prototype (`docs/prototype/`) remains the reference for **what a screen holds** —
its fields, lists and actions — not for how it looks. The screen comparator was retired
(it read the prototype's retired class names, so it saw nothing on our screens); every
decided difference from the sample, with its reason, is recorded in
`docs/notes/prototype-differences.md`, and a new one is added there.
`scripts/text-snapshot.mjs` and the screen walk check screens and drawers.

## Provenance: the pattern to copy

Governing documents are often silent on what the system must still decide. Configuration
records **where a fact came from** — `STATED`, `OBSERVED` or `ASSUMED`. A screen that
renders a written rule and an observed habit identically overstates its own authority.

Apply the same three-state honesty to any rule whose source is silent. Quorum is the
worked example: met, not met, and **not set** — an unset quorum is not a quorum of zero,
and `assessQuorum` will not certify a sitting under one.

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

