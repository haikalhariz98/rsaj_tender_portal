# Phase 3 acceptance

**Accepted with carries at 397c1e8 (2026-10-03).** Phase 3 is delivered as 6.15a, the staff-side supplier register (OD-1 B), a logged departure from §13.5. The vendor-facing half is re-designated to 6.15b and 6.15c below. Gates re-run by the reviewer at 397c1e8: 381 test files / 6,132 tests, typecheck, lint with check-ui clean. Signed off by the product owner on the founder's behalf.

## Must requirements
- **Met:** FR-VND-002, 003, 004 (registry check manual), 007, 008 (reminders shown, never sent), 009, 010; FR-TRM-017; FR-ADV-010; FR-AWD-009 (warns, never refuses: 615-C5).
- **Partly met:** FR-VND-001 (officer-recorded from paper), FR-VND-005 (paper E-Payment receipt only), FR-VND-006 (paper declaration only), FR-BID-008 (paper; grade and field codes read "not assessed" until 615-C1), FR-ADV-002 (carried from Phase 2; listing check 615-C3).
- **Deferred to 6.15b** (after sign-in, ADR 0020): FR-VND-001 self-registration, FR-VND-005 bank data, FR-VND-006 acknowledgement, FR-VND-012, FR-VND-013 (attendance, acknowledgement, own-bid status), FR-DOC-010 inspection log; Shoulds FR-VND-011 vendor view, FR-AWD-010; Could FR-VND-014.
- **Deferred to 6.15c** (after D6, the SK002 §7.7 amendment, sign-in and electronic opening): NFR-SEC-003, FR-VND-013 sealed bid, FR-BID-008 "cannot submit", FR-DOC-009 electronic half.

## Carries and what they block
| Carry | Blocks |
| --- | --- |
| 615-C1 structured registration needs on a requirement (6.4) | go-live |
| 615-C2 writer of REGISTRATION_CANCELLED | 6.13 Part B, step 0 |
| 615-C3 FR-ADV-002 open-or-invited check | 6.15b public listing |
| 615-C4 committee step on supplier routes | RSAJ's supplier-route configuration (OQ-07) |
| 615-C5 whether an award to a barred supplier is refused | go-live: the switch must exist, unset, before RSAJ answers |
| 615-C6 a party linked at a sale carries no awards | nothing (log only) |
| 615-C7 watched-lists chain read one link deep | 6.15b sending reminders |
| P2-C1 class: new window, opening and award words English-only | go-live (bilingual pass) |

Phase 1 and Phase 2 carries stand as recorded in `phase1-acceptance.md` and `phase2-acceptance.md`.

## Founder conditions
1. **Native-engine check.** On a normal machine with native Prisma 7.9.1 and PostgreSQL 17: `prisma migrate deploy` of every folder onto a fresh database, and `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` must come back empty. Every CHECK must be present in pg_constraint, including StandingEvent_ends_after_start, StandingRequest_withdrawal and the unique index ExerciseParty_exerciseId_vendorId_key. Scope: 60 folders after `20261001011312_phase1_closeout` (49 from Phase 2, 11 from 6.15a). Until it passes, these migrations go to no database that is not throwaway, and not to go-live.
   **Passed 2026-10-04 (local machine, all 153 folders):** native Prisma 7.9.1 on PostgreSQL 17.10 applied every folder to a fresh database (`perolehan_native_check`); `migrate diff` empty; all 211 CHECK names added by the migrations present in pg_constraint (213 in all), all 17 partial unique indexes present, and the three named above confirmed. See the decisions-log entry of that date.
2. **Before …210000 and …210200 reach any database holding real data:** …210000 shifts every StandingEvent.endsOn by one day and must run exactly once. …210200 has no duplicate pre-check, so first confirm that no ExerciseParty shares an (exerciseId, vendorId) pair.
3. **Founder decisions:** sign-in (OD-1, ADR 0020) and the §13.5 departure. 6.15b and 6.15c cannot start without them.
   *Note, 2026-10-07 (sign-in programme Phase 1d; this item is not rewritten, ruling O-3):* the founder authorised the sign-in programme on 2026-10-06 (build sign-in and everything waiting on it, with no second sign-in factor). Phases 0 and 1a to 1d are built on `build-all-modules` (accounts, sessions, the guard on every entry point, the actor in every audit row, one organisation per database, the trail append-only in the database); Phases 2 to 5 are not. NFR-SEC-005 (second factor) is still not met and stays a go-live condition: risk R-1 is accepted for the build and internal acceptance runs only (O-2). The §13.5 departure is unchanged by it. Plan: `docs/notes/plans/signin-programme.md`; ADR 0034.
4. **RSAJ decisions, left unset in configuration:** OD-2 and the registration and blacklisting authorities (OQ-07), OD-4 lapse rule, OD-5, OD-6 consequence, the first-offence blacklisting period, the restriction's evidence document, 615-C5, and the published CIDB/MOF lists as a seed.

## Evidence
- Module record: `decisions-log.md` › Modules › 6.15a; decisions BD-615-1..17 and the review, fix-round and residual entries of 2026-10-02/03.
- ADRs 0019 (supplier register) and 0020 (identity, Proposed, docs only).
- Write-path verify runs on `perolehan_verify` through the real actions: 63 build, 57 fix-round, 34 residual cases.
- Text snapshots: `cloud-build/evidence/6.15a-text-snapshot.diff`, `6.15a-fix-text-snapshot.diff`, `6.15a-fix-residual-text-snapshot.diff`.
- Screenshots and bundle sent to the founder at acceptance.

## Next
Phase 4 begins with 6.12 (contract formation and baseline), per `plans/phase3-6-rulings.md`.
