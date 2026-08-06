<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below is ours. `next dev` only rewrites the block above, between its
     markers, so content here survives. Do not add anything inside those markers. -->

# Perolehan

Procurement and contract administration for Malaysian governance: value-banded authority
limits, committee recommendations, and an audit trail that cites the clause behind every
decision.

## Read this before designing anything

**This is a product, not a bespoke build.** Ranhill SAJ (RSAJ) is the first customer and the
source of requirements — it is not the codebase. Anything that varies between organisations
is versioned, effective-dated configuration in the database. Never code.

That principle is load-bearing, not stylistic. The requirements specification lists five
decisions (D1–D5) it says must be settled before a bespoke build can start. For a product,
several are simply settings the customer chooses — D3, whether RM300,000 is `>` or `>=`,
ships as `DalVersion.boundaryInclusive`. **When a requirement looks like a blocker, first
ask whether it is really a customer policy choice.**

`organisationId` is already on every configuration table, so a second customer is a seed
rather than a migration. There is deliberately no tenant isolation middleware yet; it
arrives with authentication, not before.

## Platform decisions already made — do not relitigate

| Decision | Why |
| --- | --- |
| Next.js 16 + Prisma 7 + Postgres 17, **not** Power Apps / Power Pages / Dataverse | §1.1 of the spec mandates Power Platform. Rejected: per-tenant licensing cannot be resold as a product. |
| Standalone system of record; integrate later behind a façade | Spec §9.3. |
| The live RSAJ ERP is **Oracle, not D365** | Spec §9.1. Every "Synced to D365 F&O" badge in the prototype is aspirational. Build against a stable internal contract, not either system's schema. |
| No auth, no `User` model yet | Deliberate. Do not stub one. |

## Sources of truth

| Path | What it is |
| --- | --- |
| `docs/requirements/RSAJ-Portal-Requirements-Specification.md` | **The spec.** 381 requirements traced to Operation Manuals OM/KP/SK/001–014 and the Board-approved DAL. Extracted text — grep this, not the .docx. §7 is the data model, §8 the calculation rules, §13 the phasing. |
| `docs/requirements/*.docx`, `*.xlsx` | The controlled originals. |
| `docs/prototype/RSAJ-Tender-Portal.html` | The approved prototype (4 Aug 2026, rebuilt from the spec). Single file, React bundled inline. Carries the design system and the DAL matrix. **Superseded prototypes are in `archive/` — do not read those; they predate the spec and still assume D365.** |

`docs/` is **gitignored** — it holds RSAJ's internal Operation Manuals and Board-approved
authority limits. Do not commit it, and do not paste its contents into anything that leaves
the machine.

Regenerate the extracted text after replacing a .docx:

```bash
node scripts/extract-docx.mjs docs/requirements/<file>.docx
```

## What exists today

The **DAL approval engine** — and nothing else from the spec yet.

```
src/lib/dal/resolve.ts    pure resolver, no database — the shape to copy for new domains
src/lib/dal/load.ts       loads the effective-dated matrix from Postgres
src/lib/dal/types.ts      the authority grammar: P, JP, R, JR, MR, MJR, A, MA
prisma/seed-data/         the RSAJ matrix as data: 92 rules, 19 roles, each citing its clause
```

Seeded and verified against the two worked examples the spec states in prose in §2.4:

- RM180,000 works quotation → `APP_OPEN_15K_300K` → `HODEPT:P → HOD:R → QC:MR → CEO:A`
- RM620,000 interim payment → `T16A_PAY_GT_500K` → `HODEPT:P → HOD:R → CEO:A`

Next up, per §13.3: committees (membership, quorum, per-member SETUJU/TIDAK SETUJU votes),
then requisition intake, then award. Those four must land together before anything is safe
for a real transaction.

## Rules that are not negotiable

1. **No hard-coded approver, threshold, rate or weighting.** If a number varies by customer
   or by DAL revision, it is a column, not a literal.
2. **Every routing decision cites its clause.** A chain a user cannot trace to the printed
   manual is a governance failure, not a UX gap.
3. **Gaps stay honest.** Three DAL rows are marked `isGap` because the manual has no rule
   at all. They resolve, but they warn that the route is an assumption. Never quietly
   promote a gap to a rule.
4. **Business logic is pure and tested.** `src/lib/**` takes inputs and returns outputs.
   Route handlers and components call it; they never restate it.
5. **Money is `Decimal` in the database.** Convert at the boundary, never store float.

## Commands

```bash
npm run setup      # Postgres + migrations + seed. Idempotent.
npm run dev        # localhost:3000
npm test           # vitest
npm run typecheck  # next typegen && tsc --noEmit
npm run lint
npm run db:reset   # DESTROYS the volume, then re-runs setup
```

`npm run typecheck` runs `next typegen` first on purpose — `RouteContext<...>` types do not
exist until it has run, so bare `tsc` fails on a fresh clone.
