# Backlog N4: source-scan tests portable to Windows

**Backlog row:** "Source-scan tests portable to Windows" (`docs/notes/backlog.md`, the row after "Code-review Considers").
**Dev server:** no restart needed. N4 touches only tests, `src/lib/scan/files.ts` (imported by tests alone) and `scripts/`.
No Next code, configuration or migration changes.

**Scope:** one shared helper that turns every walker's paths into `/` paths, used by every scan test that builds paths with
`path.join`. No assertion, allow-list or pinned-list changes. Nobody outside the programme is needed.

## 1. What exists (measured 2026-10-19 on the founder's Windows machine, two full `npx vitest run`)

- **The real Windows failures differ from the backlog's "37".** Both runs failed the same 27 of 15,621 tests in 7 files:
  - **Path failures (26 tests, 6 files):**
    - `src/lib/contract/act-status-scan.test.ts` (6)
    - `src/lib/contract/act-status-screens.test.ts` (13)
    - `src/lib/certificate/certificate-scan.test.ts` (1)
    - `src/lib/certificate/fidelity-scan.test.ts` (4)
    - `src/lib/committee/matter-amount.test.ts` (1)
    - `src/lib/matter/contract-matter-sulit.test.ts` (1)
  - **Timeout, not paths (1 test):** `src/lib/method/lifecycle.test.ts:312`. This is the exhaustive `exerciseFlow` sweep. It sets no
    timeout of its own. Alone it passes in about 4.5 s. In the full suite under load it took 10.4 s and 12.3 s and was failed
    with `STACK_TRACE_ERROR`. `scripts/test-linux.ps1` passes `--testTimeout=120000` and `npm test` does not.
  - `holding-edit.db.test.ts` is a `*.db.test.ts`, so `vitest.config.mts` excludes it from `npm test`. **The Windows target is
    therefore a fully green `npm test`.**
- **100 test files under `src/` call `readdirSync`.** They contain about 67 bespoke walkers (`walk`, `files`, `screens`,
  `sources` …). Each walker has its own filters: extensions, `.test` exclusion, `generated/`, `migrations/`, `node_modules/`.
  - About 35 places already convert by hand with `.split(path.sep).join("/")` or a local `posix`/`rel`, for example
    `src/app/_auth/administrator-sweep-scan.test.ts:25` and `src/lib/bids/online/screens-claims.test.ts:41`.
  - One walker uses `readdirSync(dir, { recursive: true })`, which returns `sub\file.tsx` on Windows:
    `src/lib/certificate/screen-words.test.ts:31`.
- **Some tests pass on Windows yet read a different file set from Linux.**
  - `contract-matter-sulit.test.ts:38` filters `!f.includes("/generated/")` on native paths, so on Windows it also reads the
    generated Prisma client. The prototype recorder below counted 336 extra `src/generated/**` reads.
  - The same failure mode, in reverse, appears once paths are converted: `${path.sep}generated${path.sep}` filters applied
    after a walker returns (`src/app/configuration/_editors/registry-scan.test.ts:139`, `src/lib/sealing/finalise-grants.test.ts:18`).
- **Shared scan code** lives in `src/lib/scan/source.ts` (lexer and spans, with `source.test.ts`). There is no path helper.
- **The Linux gate** is `scripts/test-linux.ps1`: `node:22`, the repo mounted at `/repo`, `node_modules` in volume
  `perolehan_linux_nm22`. The script passes no environment variables through.
- **Someone else's uncommitted work** is in two walker tests: `src/app/_auth/auth-reach.test.ts` and
  `src/app/_auth/supplier-reach.test.ts`. They hold N2 (PDPA right of access) changes, alongside the untracked
  `src/app/supplier/account/data/` and modified `src/lib/auth/*` and `src/lib/portal/surface.ts`.

## 2. Target

- Every walker hands back `/` paths on every platform.
- On Linux each test reads exactly the files it read before.
- On Windows each test reads that same set.
- `npm test` is green on Windows and `scripts/test-linux.ps1` is still green.

## 3. Contracts

### 3.1 `src/lib/scan/files.ts` (new, pure, beside `source.ts`)

```ts
import path from "node:path";

/** `p` with "/" between its parts. Where `sep` is "/" (Linux) it returns `p` unchanged. */
export function toPosix(p: string, sep: string = path.sep): string;            // p.split(sep).join("/")

/** `impl.relative(root, p)` with "/" separators: the form every pinned list is written in. */
export function posixRelative(root: string, p: string, impl: path.PlatformPath = path): string;
```

The `sep` and `impl` parameters exist so `files.test.ts` can test both platforms on either one, using `path.win32` and
`path.posix`. The cases to cover:
- a Windows absolute path;
- a recursive `readdir` entry `a\b.tsx`;
- an already-posix path, which must come back unchanged under both;
- `posixRelative` across both implementations.

This is deliberately **not a shared walker**. The walkers' filters differ, and unifying them would change file sets, which the
scope forbids.

### 3.2 Conversion rules (each step applies all of them)

- **R1.** Every path a walker returns goes through `toPosix` exactly once, where it leaves the walker. Use the leaf
  `[toPosix(p)]`, or `.map(toPosix)` at the single call site that owns the walker. This includes `{ recursive: true }` entries.
  Filters inside the walker that run on native paths before conversion stay as they are (e.g.
  `src/lib/portal/bids/purchase-writers.test.ts:25`).
- **R2.** Every hand-written `.split(path.sep).join("/")` or `.split(sep).join("/")` becomes `toPosix` or `posixRelative`.
  Local names such as `rel` and `posix` may stay as one-line aliases, to keep the diff small.
- **R3.** A filter that runs on converted paths and names `path.sep` or `sep` is rewritten with `"/"`, with the same meaning
  (`registry-scan.test.ts:139`, `finalise-grants.test.ts:18`).
- **R4.** A key built with `join(...)` and compared with a `/` list or with walker output is wrapped in `toPosix`. This covers
  import resolution `join(file, "..", spec)` at `act-status-scan.test.ts:68` and `act-status-screens.test.ts:73`.
- **R5.** An expected value built with `path.join` and compared with walker output is wrapped in `toPosix`
  (`contract-matter-sulit.test.ts:39`). Both sides go through the helper. **Which file is expected does not change.**
- **R6. Forbidden:** changing any expected list, allow-list, pinned count, regex meaning, exclusion, `it` title, or message text,
  except where a message interpolates a path. No `it.skip`.
- **R7.** Every converted test file imports from `@/lib/scan/files`. A test file that calls `readdirSync` and does not import it
  must be named in the step's commit message with the reason (for example, it reads one flat directory of names it never
  compares as paths).

### 3.3 The file-set recorder (`scripts/scan-sets/`, committed, so the proof can be repeated)

**`record-setup.mts`** is a vitest `setupFiles` entry. A prototype was proven on Windows on 2026-10-19 and then removed.
- It wraps `fs.readdirSync` and `fs.readFileSync`, then calls `syncBuiltinESMExports()`, so the tests' named
  `import { readFileSync } from "node:fs"` see the wrapper.
- For each test file, in `afterAll`, it writes `{ test, dirs: string[], files: string[] }` (sorted) to
  `coverage/scan-sets/<SCAN_SET_LABEL>/<test path with / as __>.json`. `/coverage` is already gitignored.
- Paths are recorded with `/`, relative to `process.cwd()`. Only paths under the repo are kept, minus `node_modules/`,
  `.next/`, `coverage/`, `.claude/` and `.codex/`. The Linux container has its own `node_modules`. The two agent directories
  are not product code, and `.claude/worktrees/` holds whole repo copies that come and go with other agents. A walker
  starting at the repo root, such as `walkAll` at `auth-reach.test.ts:256`, would otherwise pick them up.
- It records what tests **list and read**, not a walker's return value. A path a walker filters out before reading never
  appears. That is accepted, because every walker exists to read what it returns.

**`vitest.config.mts`** is `mergeConfig` of `../../vitest.config.mts` with `test.setupFiles: ["scripts/scan-sets/record-setup.mts"]`.
It must live in the repo: a config outside it cannot resolve `vitest/config`.

**`compare.mjs <dirA> <dirB> [--subset] [--ignore <path-prefix>]...`** compares each test file's `dirs` and `files` across the
two runs.
- It prints test files present on only one side, plus each added and removed path.
- `--subset` compares only the test files present in `<dirB>`, and treats files missing from `<dirB>` as not run. Steps 2 and
  3 use it for their partial runs. **Step 4's two full comparisons must not use it.**
- It exits 1 on any difference.
- Every `--ignore` used must appear in the log line with its reason. It is only for paths changed by non-N4 commits between
  the two runs.

**Windows run** (PowerShell):
```powershell
$env:SCAN_SET_LABEL="windows-before"
$env:NODE_OPTIONS="--max-old-space-size=8192"
npx vitest run --testTimeout=120000 --config scripts/scan-sets/vitest.config.mts
```

**Linux run.** `test-linux.ps1` passes no environment, so use docker directly. Run `scripts/test-linux.ps1` once first, so the
volume holds `node_modules`.
```powershell
docker run --rm -e SCAN_SET_LABEL=linux-before -v "${PWD}:/repo" -v "perolehan_linux_nm22:/repo/node_modules" -w /repo node:22 sh -c "NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --testTimeout=120000 --config scripts/scan-sets/vitest.config.mts"
```

A failing test still writes its set, so the recorder runs whether or not tests pass.

## 4. Steps

**Order:** 1, then 2 and 3 (one after the other, because they share the recorder baseline), then 4.

### Step 1: helper, recorder, baselines (devops-engineer)

- Add `src/lib/scan/files.ts` and `src/lib/scan/files.test.ts` (3.1), and `scripts/scan-sets/` (3.3).
- Commit them. That commit changes no existing test.
- Then, on that commit and before any conversion, record `linux-before` and `windows-before`.
- Run `compare.mjs coverage/scan-sets/linux-before coverage/scan-sets/windows-before`. It is expected to differ. Keep its
  output: it is the "before" evidence.

**Tests:** `npx vitest run src/lib/scan`.

**Done when:**
- `files.test.ts` passes on Windows and through `scripts/test-linux.ps1 src/lib/scan`.
- `npm run check` is green.
- Both baseline directories exist and each holds one JSON per test file. The total count matches the run's file count.
- A `- 2026-10-19 · N4 step 1 · ...` log line records:
  - the commit;
  - the two baseline file counts;
  - the before-diff summary: which test files differ, and by how many paths.

### Step 2: convert `src/app`, `src/components`, `src/proxy.test.ts`, top-level `src/lib/*.test.ts`, and `src/lib/{approvals,audit,auth,authority,award,bids,certificate}` (test-engineer)

This is about 50 files. Apply R1 to R7 to every test file in these paths that calls `readdirSync`. The path-failing
`certificate-scan` and `fidelity-scan` are in this step.

**Foreign changes:** if `auth-reach.test.ts` or `supplier-reach.test.ts` still show uncommitted changes that are not this
programme's, leave them, say so in the commit message, and carry them to step 4.

**Tests:** run the recorder on Windows over the touched paths with label `windows-step2`, then run
`compare.mjs coverage/scan-sets/linux-before coverage/scan-sets/windows-step2 --subset`.

**Done when:**
- For every touched test file, the Windows sets equal `linux-before`.
- `npx vitest run src/app src/components src/proxy.test.ts src/lib` shows no failure in the touched files.
- `npm run check` is green, with one commit.

### Step 3: convert the rest of `src/lib` (committee to window) (test-engineer)

This is the other about 50 files: `committee`, `contract`, `demo`, `documents`, `evaluation`, `i18n`, `matter`, `method`,
`numbering`, `opening`, `payment`, `people`, `portal`, `scope`, `sealing`, `suppliers`, `tender-docs`, `time`, `variation`,
`window`. It includes the path-failing `act-status-scan`, `act-status-screens`, `matter-amount` and `contract-matter-sulit`,
and the R3, R4 and R5 sites.

**Tests:** the same as step 2, with label `windows-step3`.

**Done when:**
- For every touched test file, the Windows sets equal `linux-before`.
- `git grep -L "@/lib/scan/files"` over the test files that call `readdirSync` lists only files named under R7, or deferred
  under step 2.
- `npx vitest run src/lib` has no path failure.
- `npm run check` is green, with one commit.

### Step 4: the lifecycle timeout, the full proof, close the row (test-engineer)

**(a) Lifecycle timeout.** In `src/lib/method/lifecycle.test.ts:312`, give that one `it` an explicit timeout of `120_000` as
its third argument, with a comment citing N4. That is the Linux gate's own limit. Its assertions are untouched.
- **Ruling:** the most conservative reading is to touch that test alone, not raise `testTimeout` across the whole suite.
- Log it as a judgement call, plus a product-owner question: should `vitest.config.mts` carry the gate's `testTimeout` for
  everyone?

**(b) Deferred files.** Convert the two deferred `_auth` files if they are now committed. If they are still foreign, log a
product-owner question and leave them. They pass on Windows today.

**(c) Full proof.**
- Record `linux-after` and `windows-after`, both full runs on the final tree.
- Run `compare.mjs linux-before linux-after` and `compare.mjs linux-before windows-after`, both without `--subset`. Both
  must exit 0. Any `--ignore`
  must be justified by a non-N4 commit in `git log <step1>..HEAD`.

**Done when:**
- Both comparisons exit 0.
- `NODE_OPTIONS=--max-old-space-size=14000 npm test` on Windows is fully green.
- `powershell -NoProfile -File scripts/test-linux.ps1` is green.
- `npm run check` is green.
- One log line records the comparison outputs (file counts, `0 differences`, any ignores) and the two suite totals.
- The backlog row is marked **DONE 2026-10-19** with the commits.
- `scripts/test-linux.ps1`'s header comment is updated: it no longer says the scan tests fail on Windows, and the script stays
  as the Linux gate.

## 5. Not in scope

- A shared walker.
- A guard test that every future scan test imports the helper. A green Windows `npm test` is the guard from now on.
- `scripts/check-ui.mjs` and `scripts/check-agents.mjs`: they already run under `npm run lint` on Windows.
- Any change to what a scan asserts.
