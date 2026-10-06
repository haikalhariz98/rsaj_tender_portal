# Handover: cloud build → local CLI (2026-10-04)

The autonomous cloud build stopped here at the founder's request. This page is where a local
session starts. Read `AGENTS.md` first, then line 9 and the top entries of `decisions-log.md`.

## Where it stopped

- Branch `build-all-modules`. Never push from the build, never touch `master` or
  `redesign/modern-friendly` (standing rules from `autonomous-build.md`).
- **Tip `cdec150` is work in progress and NOT CHECKED.** The builder was stopped in the middle of
  Run 1b commit C8. Typecheck, lint and tests were not run on it (typecheck ran out of memory in
  the cloud container). The last checked commit is `36105e2` (C7).
- Accepted: Phases 1–3, 6.12, 6.13 Part A, 6.14 increments 1 and 2, 6.13 Part B Run 0 and Run 1a.
- In progress: **6.13 Part B Run 1b** (time and delay damages), phase A (rules and acts; no screens).

## First steps locally

1. Restore the branch from the bundle into your clone:
   `git fetch <path>/perolehan-build.bundle build-all-modules:build-all-modules && git checkout build-all-modules`
2. `npm install`, then `npm run setup` (Postgres, migrations, one empty organisation) and
   `npm run demo:load`. The cloud databases did not travel; the migrations and demo scripts rebuild them.
   - The cloud used Prisma's WASM schema engine through a scratch helper (`$SEW/pmig.mjs`,
     `verify.sh`) because the native engine was unavailable there. Locally, use the native tools:
     `npx prisma migrate deploy`, then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`
     must be empty. This is also the outstanding **native-engine check** every acceptance asked a
     human to run (all folders after `20261001011312_phase1_closeout`).
3. Run `npm run check` and `npm test` on `cdec150`. Expect failures: C8 is half-built.

## Done on the local machine (2026-10-04)

- Branch fast-forwarded to the cloud tip; native-engine check passed on all 153 folders (decisions
  log). The old dev database is kept as `perolehan_backup_20261004`; `perolehan` was rebuilt.
- Gates on Windows:
  - **Typecheck and lint:** `$env:NODE_OPTIONS='--max-old-space-size=14000'; npm run check`
    (typecheck needs more than 8 GB since run 1b C3).
  - **Full suite:** `powershell -File scripts/test-linux.ps1`, in a Linux container. The
    source-scan tests are not yet portable to Windows (backlog), and on Windows 37 fail that pass
    on Linux. The working tree must use LF endings (`git config core.autocrlf false`).
- At `cdec150` (C8a), check and the Linux suite are green: 568 files / 8,774 tests, after the
  zero-offset time-zone label fix (newer ICU writes UTC as "GMT+00:00").
- Stop a dev server by its PID (`Get-NetTCPConnection -LocalPort 3000`, then `Stop-Process -Id`),
  never by name. The cloud's `$SEW`, `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true`, `fuser` and
  `/tmp/claude-0` instructions in the log apply to the cloud only.

## Paused Run 1b work is in a git stash (2026-10-05)

The uncommitted C8b work (the /approvals escalation lock line for contract matters, committee
labels, the lock-order tests and the red gate file `r1b-08b-red.txt`) was parked as
`stash@{0}` "Run 1b C8b WIP (paused 2026-10-05)" while the founder's UI changes went in. Restore
it with `git stash pop` before resuming Run 1b. Expect conflicts in `src/lib/committee/labels.ts`
and `src/app/committees/actions.ts` if the committee auto-tabling work (founder, 2026-10-05) has
changed them; resolve by keeping both.

**Settled 2026-10-06 (sign-in programme, Phase 0).** The stash's work is committed (`30407e2`, with its red file). It is kept in the stash list, not dropped, as a record. Do not `git stash pop` it: it would re-apply what is already in the tree. Its third lock-order test was rewritten against the outcome path that landed (`inContractMatterForOutcome`); see the decisions log, 2026-10-06 · Phase 0.

## Finishing Run 1b

- The plan: `plans/6.13-post-award-lifecycle.md`, "Part B — full plan", Run 1b in B10.
- The ruling trace (what each commit must meet and which test pins it): the "Run 1b … phase A"
  entry near the top of `decisions-log.md`, table T1–T41, commits C1–C13.
- The design note: `plans/6.13B-run1b-design.md`.
- Gate and red-test files: `cloud-build/evidence/gates/r1b-*`.
- Committed so far: commit 0 (`68347d5`), C1 (`aa3fa07`), C2 (`5ce5fe5`), C3 (`9137e6e`),
  C4 (`41e6290`), C5 (`b0f0652`), C6 (`d4e1936`), C7 (`36105e2`), C8 WIP (`cdec150`).
- C8 was the contract-matter and time acts (`src/lib/matter/{act,load,route-write,write}.ts`,
  `src/app/projects/[id]/{matter,time}-actions.ts`); the builder was on the contract-matter
  single-writer scan in `contract-matter.test.ts`. Still to wire: the /approvals ContractMatter
  lock line in the same commit as the first send act (BD-613-117, trace T9).
- Then C9–C13 per the trace, then phase B (screens, settings editors, History labels).

## Process now (founder, 2026-10-04)

- One code review per run; fix Must and Should once; no re-review. Considers go to `backlog.md`.
- The product owner rules only on open build decisions; no per-run acceptance.
- Screen-text snapshot and write-path verify once, at the end of Part B.
- Target: close 6.13 Part B within about 20 hours of work (Run 1b, then runs 2–5 at about 4 h each).
  A run that overruns moves its remaining items to `backlog.md`.
- Still binding (`AGENTS.md`, decisions log): `npm run check` before every commit and the full
  suite before any commit that changes a shared rule's output; tests first for both-orders pairs;
  every act reads `ACT_STATUS` (src/lib/contract/act-status.ts) and refuses on CANCELLED; one lock
  order through `withLockedContract`; money as Decimal or sen; EN+MS words; no customer values
  hard-coded; never weaken a test; each commit ends with the session's attribution trailer.

## After Part B

- `backlog.md`: 6.16, 6.17, Part B acceptance and bundle, the Part A provenance split, review
  Considers. Worked after go-live.
- The founder's held questions (collected in the decisions log's "For a human" and "Founder's
  list" lines of each module) are gone through at the end of the build.
