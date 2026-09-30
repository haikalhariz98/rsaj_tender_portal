# Decisions log

Decisions taken on the founder's behalf by the product-owner agent during the autonomous
build (`docs/notes/autonomous-build.md`). Newest first. Each entry: date · module ·
decision · reason · spec ID.

## Where the build stopped

Phase 1 started 2026-09-30. Module in progress: 6.10 committee meetings.

**Environment caveat for the founder.** This session ran on PostgreSQL 16 (no Docker) and
could not download Prisma's native schema engine (binaries.prisma.sh is blocked by the
session's network policy). Migrations were generated and applied with Prisma's npm-hosted
WASM schema engine (same engine version, e922089) through `@prisma/adapter-pg`, and every
migration folder was proved by rebuilding a throwaway database from it and diffing
against `schema.prisma` (empty diff). Before relying on them, run `npx prisma migrate
dev` on a normal machine against Postgres 17 and confirm it reports no drift.

## Decisions

- 2026-09-30 · 6.10 · FR-CTE-007/008/013 deferred to Phase 2 (6.4–6.6) — a departure from §13.3 "6.10 in full". Reason: §13.3 keeps sourcing outside the system in Phase 1, so there are no late tenders or evaluation record. Hook: dependsOnDecisionId. Spec: FR-CTE-007, 008, 013, §13.3.
- 2026-09-30 · 6.10 · FR-CTE-014 carried over within Phase 1 to 6.9/6.11 (routing sheets); must close before Phase 1 is accepted. decisionRecord() is the only source a sheet may read. Spec: FR-CTE-014.
- 2026-09-30 · 6.10 · Signed-minutes attachment deferred (no document storage). Minutes captured as text; the screen shows "not attached". Spec: FR-CTE-004.
- 2026-09-30 · 6.10 · Not-approved memo deferred (no delivery). NotificationRule eventKey only; the screen shows "memo not issued". Spec: FR-CTE-009.
- 2026-09-30 · 6.10 · Controlled quorum change: maker-checker deferred until sign-in; audited save meanwhile. Spec: FR-CTE-003, NFR-USE-004, AGENTS.md.
- 2026-09-30 · 6.10 · Tender Board quorum 3 is customer seed, not a product default; unset still blocks. Spec: FR-CTE-003, B5.
- 2026-09-30 · 6.10 · FR-CTE-011 (S) deferred: needs exercises (6.5) and a Person→OrgUnit link. Spec: FR-CTE-011.
- 2026-09-30 · 6.10 · Fixes D1–D5 in scope: ex-officio seats vote, votes route checks attendance and writes audit in the same transaction, outcomes recordable, Tender Board demo can meet quorum, stand-in is a seat link. Spec: FR-CTE-002/003/004/005.
- 2026-09-30 · 6.10 · Sittings at /committees under Work, added to ALLOWED_EXTRA as a departure from the prototype; per-matter view added in Phase 2. Spec: FR-CTE-004.
- 2026-09-30 · 6.10 · Ex-officio seats offer "Remove office from committee": reason required, ended by effective date, history kept. Spec: FR-CTE-002.
- 2026-09-30 · 6.10 · Matter referenced by matterRef + matterKind (closed set, rendered by label); typed nullable FKs added per module, never a polymorphic (type,id). Spec: FR-CTE-004.
- 2026-09-30 · 6.10 · Secretariat = Committee.secretariatRoleCode (validated office), resolved on the tabling date; null refuses tabling; tabler shown as attested until sign-in. Spec: FR-CTE-006.
- 2026-09-30 · 6.10 · B4: NOT_CARRIED requires a configured NotApprovedOutcome (plan's "outcome not set" option rejected). Zero rows shipped; the blocker says what to configure and where; minuting waits. Reason: FR-CTE-009 acceptance requires a selection. Spec: FR-CTE-009, B4.
- 2026-09-30 · 6.10 · Voting rule: unset blocks recording (VOTING_RULE_UNCONFIGURED); no assumed majority default. The decision snapshots the rule and its provenance. Reason: silent-source policy; an assumed majority could later make a recorded CARRIED wrong. Spec: B5, FR-CTE-003/005, AGENTS.md provenance.
- 2026-09-30 · 6.10 · ABSTAIN refused on input (422); enum value kept for existing tests. Spec: FR-CTE-005.
- 2026-09-30 · 6.10 · Secretary never votes or counts toward quorum (product assumption, shown on screen, reversible via a future per-seat flag). Question for RSAJ with the Terms of Reference (B5). Spec: FR-CTE-002/003/005.
- 2026-09-30 · 6.10 · Mandatory acts (MR/MJR/MA) keep the full-voting-body rule; a seat covered by a valid alternate counts (test added). Spec: FR-CTE-005, DAL.
- 2026-09-30 · setup · Migrations are hand-checked output of the WASM schema engine, not
  `prisma migrate dev`, and no migration comment may contain a semicolon (the WASM path
  splits scripts on them). Reason: native engine download blocked; the rule keeps the
  migrations valid on both paths. Spec: n/a (tooling).

- 2026-09-30 · setup · The RSAJ documents (`docs/requirements/`, `docs/prototype/`) are
  gitignored and were NOT committed by Claude; adding them to this branch is the founder's
  own action. If they are absent, build from `docs/prototype/spec/` if present and from
  AGENTS.md, and record every place the spec was needed but unavailable.
