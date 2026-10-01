# Findings from the founder's local review

The founder's machine reviews each module the cloud returns. Fix these as part of the next
work, one commit per item, and say in the module report which commit fixed which item.

## For the founder to confirm

**Native-engine check of the document store migrations** (acceptance condition, decisions
log 2026-10-01). The cloud build applies migrations through a patched WASM engine
(`docs/notes/cloud-build/ENV.md`, BD-DS-6); confirm on the native Prisma engine that
`20261001055855_document_store` and `20261001073742_document_store_rulings` apply and that
their CHECK constraints exist. Prisma does not model CHECK constraints, so an empty diff
alone does not prove them.

1. `npx prisma migrate deploy` applies both, with no failed migration.
2. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
   prints an empty migration.
3. In psql:
   `select conrelid::regclass, conname from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace order by 1, 2;`
   lists exactly these nine (as the rebuilt cloud database does):
   - from `document_store`: `BlobContent_size_matches`, `DocumentVersion_size_not_negative`,
     `DocumentVersion_version_positive`, `DocumentVersion_withdrawal_reason`,
     `DocumentAttachment_detach_reason`, `DocumentAttachment_one_owner`,
     `DocumentAttachment_purpose_owner`, `LegalHold_reasons`;
   - from `document_store_rulings`: `DocumentClass_retention_positive`.
4. Optionally, `select count(*) from "Delegation" where "recommendationTextOnlyAtLanding"`
   shows how many delegations the backfill marked as recorded on text before attachments
   existed (none in the demo data).

## Verified locally (2026-10-01)

- All migrations through `20261001011312_phase1_closeout` apply on the native Prisma
  7.9.1 engine and PostgreSQL 17.10, and `migrate diff` against `schema.prisma` is empty.
- 1249 tests, typecheck and lint pass on Windows.

## 6.10 Committee sittings — accepted, four small fixes

1. **A sitting that hasn't started reads as not quorate.** On a SCHEDULED sitting (demo
   `demo_mt10`), each matter shows "Not quorate — 0 of 2 required members present, 2
   short", an amber "Cannot be recorded" callout and "0 agree / 0 disagree". Before the
   sitting starts, say it has not started (no register yet) and hide the tally.
2. **The sitting banner overstates its effect.** On `demo_mt1` the top callout says the
   configuration "stops the sitting from deciding", but it blocks one of three matters.
   Say how many matters it affects (and which), from the same lib assessment.
3. **Demo matter points at an exercise that doesn't exist.** On `demo_mt1`, matter
   "Award of the head office cleaning contract" reads "Sourcing exercise
   DEMO/T/2026/014"; no such exercise exists (exercise references look like
   `DEMO/SX/0010/2026`). Link it to a real demo exercise or make it a manual matter.
4. **Minuted demo sittings have no history.** `demo_mt6` (minuted) shows History 0. Write
   the audit trail the actions would have written, with the shared audit helpers, as the
   6.3 demo already does.

## 6.1, 6.3, 6.11

Not yet reviewed locally. The founder will review them from the returned bundle and the
screenshots; findings will be added here.
