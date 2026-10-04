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
