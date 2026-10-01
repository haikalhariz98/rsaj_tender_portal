# Lessons the reviews enforced on 6.10 and 6.1 — apply from the start

Correctness
- Every write re-validates inside its transaction on locked rows (SELECT … FOR UPDATE on the parent record, re-run the pure check on the locked data). No check-then-write races. Reads that feed a decision (roster, delegations, policy, matrix issue) happen inside the transaction.
- A decided/approved/issued record stores a snapshot of every rule and policy value it was judged under (with provenance) and renders from it. Later configuration edits never rewrite it. New snapshot columns backfill null, never current configuration.
- Unset policy never silently becomes a default (quorum / voting rule / time zone precedent). Unset blocks with a blocker naming the setting and linking to where it is set. Unset renders "Not set" / "Not recorded", never 0, never a guess.
- A "not assessed" result is stored as such and never later shown as clear/pass.
- Money: Decimal in DB; in lib, sen as bigint via parseSen(string) — never Number()/float, including comparisons (use compareAmounts). Convert once at the boundary.
- Dates: the organisation's day via src/lib/org-time.ts / dates.ts; unset Organisation.timeZone blocks date-sensitive acts; displayed dates via formatOrgDay.
- Audit: every mutation (including status changes, ledger movements, child rows) writes an audit row in the same transaction.
- Refusals are never a dead end: every blocker names what to do or where to configure it. A state must always have an exit.
- Self-approval / conflict / holder checks apply to the recorded Person; recorded acts read "recorded on behalf of, not signed" (no sign-in yet).
- Rules live in src/lib with vitest tests that would FAIL if the rule were removed; include the spec's worked examples. Don't restate rules in actions or components.
- Never weaken or delete an existing test. If a ruling contradicts one, change it only as the minimal faithful update and flag it in the report.
- Demo wipe must delete in dependency order, only demo rows, and refuse (listing references) when non-demo rows point at demo rows.

UI
- Shared components only: PageHeader (use `actionsNote` for disabled-action reasons), Card, Badge/Chip (wrap by default), Button, Field, Table with RowActions + ActionsCol (pixel widths), Callout/EmptyState, DataList (columns may set `mobile: "primary"|"meta"|"hide"` for stacked rows below md; `chips` cell), Tabs, drawer shell. No retired prototype classes, no dark: variants.
- Codes never on screen: no enum values, rule keys, requirement IDs (FR-…), regexes, internal ids, unformatted money. History tab formats money and maps labels.
- Actions the logic says cannot proceed are disabled with the reason shown; copy must match the record's actual state; destructive buttons say what they do ("Cancel requisition").
- Check at 1280, 1440 and 390px: no cell content past its edges, no clipped badges, no horizontal page scroll, headers don't squash; match sibling screens.
