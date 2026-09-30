# Handoff — state of `redesign/modern-friendly` (30 Sept 2026)

Read this first if you are picking the work up in a new session. `AGENTS.md` holds the
rules; this note holds where the work stands.

## What this branch did

1. **New design system** (indigo on slate, Plus Jakarta Sans). Tokens in the `@theme`
   block of `src/app/globals.css`; components in `src/components/ui` (PageHeader, Card,
   Badge, Button, Stat, Field, Table, Callout/EmptyState/Meter, Avatar, ProvenanceBadge,
   ActBadge, drawer shell). The ported prototype stylesheet is **deleted**; every screen
   is on the new components. `npm run lint` runs `scripts/check-ui.mjs`, which fails on
   any retired prototype class.
2. **Shell**: sidebar switches to Configuration's sections inside `/configuration`
   (settings pattern); topbar breadcrumb never shows a record code.
3. **Correctness fixes from the Configuration review** (commits since `ee6ab7c`):
   - edits no longer blank a record's code; numbering serials never reset by accident;
     downward budget revisions read correctly; matrix rules keep their variation bands;
   - approval engine: no hard-coded approvers or DAL clauses (clauses are configurable
     columns); incomplete routes (self-approval, absence, ties) are errors, not silent;
     money compared exactly; codes rendered as labels; seats judged by sitting date;
   - approval matrix has a **draft → issued lifecycle** (FR-APR-020): an issued issue is
     frozen; changes go through "New revision", then "Issue" from a date (never back-dated);
   - users: assignments editable/endable, roster faults shown, delegation rules enforced;
   - reference data: retired entries restorable; budget: closed periods refuse postings,
     period changes and clearing controls ask first; History drawer on most records;
   - forms keep what was typed when a save is refused (onSubmit + `formDataOf`).
4. **Organisation** rebuilt around who heads each unit (tree + read-only panel + drawers).

## Verification tools

- `npm test` (364 tests), `npm run typecheck`, `npm run lint`.
- `node scripts/text-snapshot.mjs <dir>` against a running dev server records every
  screen's visible text; diff two runs to prove a UI change dropped nothing.
- `npm run demo:load` loads invented demo data (ids prefixed `demo_`); `demo:wipe` removes it.

## Deferred on purpose (recorded in AGENTS.md)

- **Maker-checker** needs sign-in; "Issue" on the approval matrix is where it will attach.
- **Delegation superior/subordinate rules** need reporting lines and sign-in.

## Still open

- Organisation units, cost centres and sites are edited in place, not versioned.
- Numbering has no atomic issuance (two users could draw the same number).
- Budget has two ledgers; `checkAgainstBudget` reads the one no screen writes to.
- Decision needed: should "Vacate" be offered on ex-officio seats (seat held through an
  office, no named person)? It is currently hidden on any seat without a person.
- Bilingual UI (NFR-LNG-001) is not started; labels are English.

## Not in git

`docs/requirements/` and `docs/prototype/` (the client's RSAJ documents) are gitignored
on purpose and exist only on the original laptop. `.env` is gitignored; copy
`.env.example` and point `DATABASE_URL` at a Postgres 17 instance.
