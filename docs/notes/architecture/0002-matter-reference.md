# 0002 — A committee matter references its record by kind plus a typed foreign key

**Status:** accepted (plan `docs/notes/plans/6.10-committee-meetings.md`, ruling 5.3)

## Context

Committees decide on requisitions, exercises, late tenders, contracts and variations, but most of
those modules do not exist yet. A matter must still be recordable now and must link with integrity
later.

## Decision

- `CommitteeDecision.matterKind` is a closed Prisma enum (`REQUISITION`, `EXERCISE`, `LATE_TENDER`,
  `CONTRACT`, `VARIATION`), rendered by label and never by code. Null means a manual matter, linked
  to no record ("Not linked to a record" on screen).
- `matterRef` holds the record's reference as text until the module exists.
- Each module adds its own nullable typed foreign key (for example `requisitionId`) beside
  `matterKind`. There is never a polymorphic `(type, id)` pair.

## Consequences

- Adding a kind is a migration, which each module needs anyway for its foreign key.
- Existing manual matters keep their text reference. Backfilling the typed key is the owning
  module's job.
