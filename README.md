# Perolehan

End-to-end procurement and contract administration, built for Malaysian governance —
value-banded authority limits, committee recommendations, and an audit trail that cites
the clause behind every decision.

Ranhill SAJ (RSAJ) is the first customer, not the codebase. Everything that varies
between organisations — authority limits, committees, thresholds, sourcing methods — is
versioned configuration in the database, never code.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Prisma 7 · Postgres 17.

## Status

The **DAL approval engine** and the **committee module** are built, seeded and tested, on the
prototype's own design system. Everything else in the
[requirements specification](#the-specification) is still to come — see [Roadmap](#roadmap).

## Getting started

Requires Node 20+ and Docker Desktop running.

```bash
cp .env.example .env    # defaults match compose.yaml
npm install
npm run setup           # Postgres + migrations + the RSAJ DAL matrix
npm run dev             # http://localhost:3000
```

The home page is a routing simulator: pick a matter and a value and it shows the
approval chain, the rule it came from, and its clause.

## The approval engine

The engine answers one question: *given a matter and a value, who must propose,
recommend and approve, and under what authority?*

```
GET /api/dal/resolve?domain=payment&method=tender&value=620000

{ "rule": { "key": "T16A_PAY_GT_500K", "clause": "DAL_3144_16" },
  "approver": "CEO",
  "chain": [ {"role":"HODEPT","act":"P"}, {"role":"HOD","act":"R"}, {"role":"CEO","act":"A"} ] }
```

It implements, from the manual:

- **92 authority rows across 29 matters**, each carrying its source clause
- **Band matching** on the matter's value, on a percentage of contract sum (variation
  orders), and on the parent contract's value — three independent band families
- **Most-specific-rule-wins** resolution, with documented gaps ranked last
- **Upward-reverting absence** (DAL §1.6) — when a holder is absent, authority rises; it
  never passes down automatically
- **No self-approval** — an actor who is also the approver is downgraded to recommender
  and the approval escalates
- **Superintending Officer resolution** from contract value, rather than as a standing office
- **Government-funding override** — government and developer funding supersede the DAL
- **Honest gaps** — three matters have no DAL row at all (signing the quotation award
  instrument, advance payment in the quotation regime, release of retention sums). They
  resolve, but they return a `gap` warning saying the route is an assumption.

`src/lib/dal/resolve.ts` is a pure function over the matrix and touches no database, so
routing is unit-testable against the printed manual. `npm test` runs 28 such tests,
including the two worked examples the specification states in prose (§2.4).

### Unresolved policy is configuration, not a blocker

The specification lists five decisions RSAJ must make before a bespoke build can start.
Several are thresholds, so the product ships the setting and the customer chooses:

| Spec decision | Where it lives |
| --- | --- |
| **D3** — is RM300,000 `>` or `>=`? Sources disagree. | `DalVersion.boundaryInclusive` |
| Value bands and regime floors | `DalVersion.quotationFloor` / `tenderFloor` / `boundaryValue` |
| Anti-splitting window | `DalVersion.splittingWindowDays` |

Flipping `boundaryInclusive` moves a value of exactly RM300,000 between the quotation and
tender regimes — different committee, different approver, different award instrument.
Only the boundary value itself is affected; every other band edge stays `(min, max]`.
Both readings are covered by tests.

## The committee module

Five bodies gate a DAL decision (`QC`, `TBC`, `VOC`, `TOC`, `QOC`); the specification
describes nine in total. All nine are seeded with their mandate, governing clause and value
scope.

The design problem is that §5.2 records their composition and quorum as *"not defined
anywhere in the corpus"* — with two exceptions. So configuration carries **provenance**:

| | |
| --- | --- |
| `STATED` | Written in a manual, the DAL or a controlled form. The Tender Opening Committee's two officers; the Tender Board's quorum of three. |
| `OBSERVED` | Seen in practice — an evaluation template, a flowchart. The Quotation and Variation Orders Committees. |
| `ASSUMED` | Neither. Requires sign-off. |

Only **one of nine** committees has a quorum stated anywhere. So quorum has three states, not
two: `MET`, `NOT_MET`, and `UNCONFIGURED`. An unstated quorum is not a quorum of zero, and a
sitting can never be certified quorate under one — a full room does not make it lawful.

Other rules the module enforces, all in `src/lib/committee/quorum.ts` and covered by tests:

- **Individual votes, never an aggregate.** §7.2: each member records `SETUJU` or
  `TIDAK SETUJU` with a comment and a date.
- **A mandatory recommendation needs everyone.** Where the DAL act is `MR` or `MJR` — as the
  Quotation Committee's recommendation on a RM180,000 appointment is — every entitled member
  must vote. A mandatory step half the body never saw is not a recommendation.
- **A tie does not carry.** Nothing in the corpus gives the chair a casting vote, so the
  system does not invent one.
- **Seats can be ex officio.** The corpus describes composition by office ("chaired by the
  COO with the CFO as deputy"), never by name, so a seat resolves through a role holder.

## The interface

`src/app/design-system.css` is the prototype's stylesheet ported as-is — 28 sections, 72
tokens, 448 classes — so screens are assembled from components the client has already
approved rather than designed afresh. It is unlayered plain CSS, which is what lets it win
over Tailwind's layered utilities where both define a class. The prototype is light-only;
there is no dark theme.

## Layout

```
prisma/
  schema.prisma             Organisation, AuthorityRole, DalVersion, DalRule
  seed-data/                The RSAJ matrix as transcribed data — 92 rules, 19 roles
  seed.ts                   Validates role references, then loads the matrix
src/lib/dal/
  types.ts                  The authority grammar (P, JP, R, JR, MR, MJR, A, MA)
  resolve.ts                The engine — pure, no database
  matrix.ts                 Seed shape -> domain shape
  load.ts                   Loads the effective-dated matrix from Postgres
  resolve.test.ts           28 tests, incl. the specification's worked examples
src/app/
  page.tsx                  Routing simulator
  api/dal/resolve/route.ts  The engine over HTTP
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
| `npm run db:migrate` / `db:generate` / `db:seed` / `db:studio` | Prisma |

## Roadmap

Sequenced per specification §13. Nothing ships until it is safe to use for a real
transaction, which is why the vendor portal is not first: a vendor who submits a bid
into a system that cannot then award it compliantly has been misled.

| Phase | Scope | State |
| --- | --- | --- |
| 1 | **DAL approval engine** | **done** |
| 1 | **Committees** — membership, quorum, meetings, per-member votes | **done** |
| 1 | Requisition intake, funding route, budget check | next |
| 1 | Award — Letter of Acceptance, Inden Kerja, securities register | |
| 2 | Sourcing — documents, advertisement, bids, opening, evaluation | |
| 3 | Vendor portal — registration, statutory documents, bid submission | |
| 4 | Post-award — contract, supervision, payment, variations, EOT, LAD | |

## The specification

The data model follows §7 of `RSAJ-Portal-Requirements-Specification.docx` (381
requirements, traced to Operation Manuals OM/KP/SK/001–014 and the Board-approved
Discretionary Authority Limits). That document is the source of truth for scope; this
README describes only what is built.

## Notes for a second customer

`organisationId` is on every configuration table from the start, so a second
organisation is a seed rather than a migration. There is deliberately no tenant routing
or isolation middleware yet — that arrives with authentication, not before.

## Renaming

`perolehan` appears in the directory name, `package.json`, `compose.yaml` (`name:`, which
pins the Docker volume identity) and `.env`. Run `docker compose down -v` **before**
changing them, or the old volume is orphaned.
