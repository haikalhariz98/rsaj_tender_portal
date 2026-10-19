# Go-live N5: ClamAV scanner adapter behind `MalwareScanner`

**Chosen by:** product owner for the founder, decisions log 2026-10-20 "the next three backlog items" (commit 17f3e6ef).
**Requirement:** NFR-SEC-007 (Must), ruling 12a, threat model G must-have 3, backlog rows "Malware scanning of every upload",
"Supplier release of unscanned files (SR-10 review SEC-5)" and "Online sealed bids: a real malware scanner".
**Dev server:** no restart needed. Every new setting is read from the environment per call, and with nothing set the product
behaves exactly as today (NOT_SCANNED everywhere, `NotConfiguredScanner`). No migration. No ClamAV image is pulled and no
outside service is contacted: every test talks to a fake clamd built with `net.createServer`.

## 1. What exists (read 2026-10-20)

- `src/lib/documents/store/types.ts`: `ScanResult = "NOT_SCANNED" | "CLEAN" | "THREAT" | "ERROR"` and
  `interface MalwareScanner { readonly configured: boolean; scan(bytes: Uint8Array): Promise<ScanResult> }`.
- `src/lib/documents/store/scanner.ts`: `NotConfiguredScanner` (configured false, always NOT_SCANNED) and `runScan`, which turns
  a throw, a rejection or an unknown answer from a configured scanner into ERROR (M3, 20o). Tested in `scanner.test.ts`.
- `src/lib/documents/store/index.ts:29`: `malwareScanner = (): MalwareScanner => NotConfiguredScanner`. `store.test.ts:24` pins
  "ships unconfigured". The sibling `blobStore(env = process.env)` and `select.ts` show the house pattern: a pure parser over
  an injected env, returning `{ fault }` rather than throwing.
- Callers of `malwareScanner()`:
  - `src/app/supplier/bids/part/route.ts:106-128`: scans each bid part with `runScan` before sealing. `partUploadFaults` and
    `storedScan` (`src/lib/bids/online/parts.ts:57-68`) refuse THREAT and ERROR in both modes, and refuse NOT_SCANNED unless the
    mode is DEMONSTRATION with no scanner configured. **This path needs no change.** Once a scanner is set it scans for real.
  - `src/app/configuration/bid-sealing/core.ts:85` passes `scannerConfigured` to `liveIssueFaults` (`src/lib/sealing/switch.ts:38`,
    fault `SCANNER_NOT_CONFIGURED`).
  - `src/app/configuration/bid-sealing/page.tsx:66,138`: a "Malware scanner: Configured / Not configured" row.
- **The SEC-5 release path:** `src/lib/portal/bids/download-store.ts:73-125` `prepareDownload(actor, i, now)`, served by
  `src/app/supplier/bids/[id]/download/route.ts`. Today it refuses only what `downloadDecision` (`src/lib/documents/access.ts:12`)
  refuses (stored THREAT, unclassified, SULIT). Then it reads the bytes, checks the digest and serves them. Covered by
  `src/lib/portal/bids/purchase.db.test.ts:327` "downloading what a released purchase releases".
- **No code writes a scan result to a `DocumentVersion`.** `ScanState` in Prisma is `NOT_SCANNED | CLEAN | THREAT` (no ERROR).
  Every upload store hard-codes NOT_SCANNED. The row is guarded by `DocumentVersion_guard`
  (`prisma/migrations/20261007100100_trail_refusal_triggers/migration.sql:72-80`): it changes only by being withdrawn once.
  A result can never be written back to a stored version.
- `src/lib/documents/labels.ts:249-262`: `DOWNLOAD_REFUSAL_TEXT` and `accessReasonText(code)`, which turn the stored access-event
  `reasonCode` into words on the staff document screen. An unknown code falls through to `documentFaultText`.
- `docs/notes/sealed-bids-deployment.md:63-70` "The malware scanner": same host, local socket, tmpfs, no quarantine, required
  under LIVE. It names no environment variable yet.

## 2. Target

1. With `MALWARE_SCANNER_SOCKET` or `MALWARE_SCANNER_PORT` set and valid, `malwareScanner()` returns a clamd INSTREAM client.
   OK reads CLEAN, `<signature> FOUND` reads THREAT, and anything else reads ERROR, never CLEAN.
2. With nothing set it still returns `NotConfiguredScanner`, so NOT_SCANNED stays the default.
3. With something set but invalid (for example a non-loopback host), the configuration is refused and the scanner **fails
   closed**. It reads as configured and every scan is ERROR, so no setting mistake ever turns into "not scanned". Bid parts are
   refused in both modes. LIVE cannot be issued, and the bid-sealing page says the setting is wrong.
4. **SEC-5, decided here as a product-owner judgement:** the release download scans the file's bytes **at download**, after the
   digest check, through `runScan`. Scanning at upload with a stored result is impossible for files already stored, because
   `DocumentVersion` is immutable. It would also need a migration adding ERROR to `ScanState`, and would leave every existing
   pack file unservable once a scanner is set. A scan at download also picks up signatures added since the upload.
   - A released file reading THREAT (stored or fresh) is refused, and so is one reading ERROR. Both refusals apply in every mode.
   - A file reading NOT_SCANNED is refused only when a scanner is configured.
5. The staff document paths (`read.ts`, `api/documents/versions/[id]`) and every upload store are **unchanged**. Scanning at
   upload stays the open NFR-SEC-007 backlog row.

## 3. Contracts (write these first)

### 3.1 Environment (deployment contract, documented in `sealed-bids-deployment.md`)

| Variable | Meaning | Valid values |
| --- | --- | --- |
| `MALWARE_SCANNER_SOCKET` | clamd's local socket (`LocalSocket` in `clamd.conf`) | An absolute POSIX path. Nothing else: the Windows socket-mode test calls `clamdScanner` directly with a named pipe, never through the parser. |
| `MALWARE_SCANNER_PORT` | clamd's TCP port (`TCPSocket`) | An integer 1 to 65535, digits only |
| `MALWARE_SCANNER_HOST` | Only with the port. Defaults to `127.0.0.1` | A loopback **literal**: an IPv4 address in `127.0.0.0/8`, dotted-quad, no leading zeros, or exactly `::1`. `localhost`, `0.0.0.0`, `::ffff:127.0.0.1`, bracketed forms and any name are refused. |
| `MALWARE_SCANNER_TIMEOUT_MS` | Whole-scan deadline: connect, send and reply | An integer 1000 to 300000. Defaults to 30000. |

A blank or whitespace value counts as unset. Setting the socket and the port together is a fault. So is a host or a timeout
with neither the socket nor the port set. These are deployment values, not customer policy, so a default for the timeout is
allowed.

### 3.2 Pure configuration: `src/lib/documents/store/scanner-config.ts`

```ts
export type ScannerTarget = { kind: "socket"; path: string } | { kind: "tcp"; host: string; port: number };
export type ScannerFault =
  | "SOCKET_AND_PORT" | "HOST_WITHOUT_PORT" | "TIMEOUT_WITHOUT_TARGET"
  | "HOST_NOT_LOOPBACK" | "PORT_INVALID" | "SOCKET_PATH_INVALID" | "TIMEOUT_INVALID";
export type ScannerSetting =
  | { state: "NONE" }
  | { state: "SET"; target: ScannerTarget; timeoutMs: number }
  | { state: "FAULT"; fault: ScannerFault };
export const DEFAULT_SCAN_TIMEOUT_MS = 30_000;
export function isLoopbackLiteral(host: string): boolean;
export function scannerSettingFrom(env: Readonly<Record<string, string | undefined>>): ScannerSetting;
```

### 3.3 The client: `src/lib/documents/store/clamd-scanner.ts` (server only, imports `node:net`)

```ts
export function parseClamdReply(reply: string): ScanResult;          // pure
export function clamdScanner(target: ScannerTarget, o: { timeoutMs: number; chunkBytes?: number }): MalwareScanner; // configured: true
export const FailClosedScanner: MalwareScanner;                       // configured: true, scan() always "ERROR"
```

Wire behaviour, pinned:
- Connect with `net.createConnection({ path })` or `({ host, port })`. Send `zINSTREAM\0`, then the bytes in chunks of at most
  `chunkBytes` (default 65536), each preceded by a 4-byte big-endian length, then a 4-byte zero terminator. Respect
  backpressure: if `write` returns false, wait for `drain`.
- **One** overall deadline timer from before connect (`timeoutMs`), not only the socket's idle timeout. When it fires the scan
  is ERROR.
- Read the reply until the first `\0`. A reply above 4096 bytes is ERROR. A close before the `\0` is ERROR. Any reply arriving
  before the terminator has been written is ERROR. This covers `INSTREAM size limit exceeded. ERROR`, which clamd sends mid-stream.
- `parseClamdReply`, strict and after trimming the trailing `\0`:
  - exactly `stream: OK` reads CLEAN;
  - `^stream: (\S.*) FOUND$` reads THREAT;
  - everything else reads ERROR, including `... ERROR`, an empty reply, other text and a missing `stream:` prefix.
- Any socket `error` event, such as ECONNREFUSED, ENOENT or EPIPE, is ERROR. The promise resolves and never rejects. `runScan`
  still wraps it.
- The socket is destroyed and the timer cleared on every exit path. Neither the bytes nor the signature name are logged or
  returned. `ScanResult` has no slot for the name and none is added.

### 3.4 The façade: `src/lib/documents/store/index.ts`

```ts
export const scannerSetting = (env = process.env): ScannerSetting => scannerSettingFrom(env);
export function malwareScanner(env: Readonly<Record<string, string | undefined>> = process.env): MalwareScanner;
//   NONE -> NotConfiguredScanner;  SET -> clamdScanner(target, { timeoutMs });  FAULT -> FailClosedScanner
```

### 3.5 The SEC-5 rule: `src/lib/documents/release-scan.ts` (pure)

```ts
export type ReleaseScanRefusal = "THREAT" | "SCAN_ERROR" | "NOT_SCANNED";
export function releaseScanRefusal(i: { stored: ScanState; fresh: ScanResult; scannerConfigured: boolean }): ReleaseScanRefusal | null;
//  stored THREAT or fresh THREAT -> "THREAT"; fresh ERROR -> "SCAN_ERROR";
//  fresh NOT_SCANNED and scannerConfigured -> "NOT_SCANNED"; otherwise null (serve)
```

`downloadDecision` and its `DownloadRefusal` type are **not** widened, because staff reads share them. `accessReasonText`
gains words for the two new stored codes, so that no code reaches the staff access log:
- `SCAN_ERROR`: "The file could not be checked for malware."
- `NOT_SCANNED`: "The file was not checked for malware."

THREAT already has words. The supplier's refusal reuses the existing sentence "This file cannot be released to you. Ask the
procurement office for it." (403), so no new supplier text is added.

### 3.6 `prepareDownload` signature

`prepareDownload(actor, i, now = new Date(), scanner: MalwareScanner = malwareScanner())`. The scanner is injected so the
db test covers both modes without touching `process.env`.

## 4. Threats and how the design answers them

| # | Threat | Answer |
| --- | --- | --- |
| T1 | Fail-open: a broken scanner reads CLEAN | Only an exact `stream: OK` is CLEAN. Every abnormal path is ERROR (3.3), and `runScan` turns a throw into ERROR. |
| T2 | A setting mistake silently becomes "not scanned", and DEMONSTRATION stores unscanned bids | FAULT gives `FailClosedScanner` (configured, always ERROR). The bid-sealing page shows the fault and LIVE issue refuses. |
| T3 | Bid bytes cross a network | Socket path or loopback literal only. A name is never resolved, so a hosts-file entry cannot redirect it. The test proves refusal at configuration. |
| T4 | A hostile or confused peer on the port | A premature reply, an oversized reply or a malformed reply is ERROR. |
| T5 | A hung clamd holds a request open | One overall deadline, then the socket is destroyed. |
| T6 | A file larger than clamd's `StreamMaxLength` | The size-limit reply is ERROR. The notes require `StreamMaxLength` >= `DOCUMENT_MAX_BYTES`. |
| T7 | Bytes or a signature in logs | Nothing is logged by the client. The stored access event holds only the reason code. |
| T8 | Stored versions stay NOT_SCANNED forever (immutable row) | The release scans at download (2.4). No write-back is needed. |
| T9 | SULIT or unclassified bytes sent to the scanner from this path | The scan runs after `downloadDecision` and the digest check, so a refused file's bytes are never read. |
| T10 | Load from repeated downloads | The scan is bounded by the existing per-account download rate (SEC-2) and the size ceiling. |
| T11 | Windows Defender quarantines a test file holding EICAR | The tests assemble the EICAR string at runtime from fragments. The literal never appears in a source file. |

## 5. Steps

### Step 1: the clamd client, the setting parser and the façade (integration-engineer)

Files:
- `src/lib/documents/store/scanner-config.ts` (3.2)
- `src/lib/documents/store/clamd-scanner.ts` (3.3)
- `src/lib/documents/store/index.ts` (3.4)
- `src/lib/documents/store/clamd-scanner.test.ts`
- `src/lib/documents/store/scanner-config.test.ts`

Update the comments in `scanner.ts`/`types.ts` that say "ships unconfigured" to "ships unconfigured unless the environment
names a clamd". `store.test.ts:24` keeps passing unchanged: `malwareScanner()` with no env is still NOT_SCANNED.

Tests. The fake clamd is a `net.createServer` on `127.0.0.1` port 0. It parses `zINSTREAM\0` and the chunk frames, and is
scripted per test:
- `OK` gives CLEAN.
- The runtime-assembled EICAR string gives THREAT, with a reply of `stream: Eicar-Test-Signature FOUND\0`.
- A server that never answers, with `timeoutMs` 200, gives ERROR within about 1 s.
- A server that destroys the socket mid-stream gives ERROR.
- A closed port (connection refused) gives ERROR.
- A garbage reply gives ERROR.
- A reply without its `\0` followed by a close gives ERROR.
- A reply over 4096 bytes gives ERROR.
- `INSTREAM size limit exceeded. ERROR\0` sent before the terminator gives ERROR.
- A 300 KiB payload arrives as at least 5 frames whose lengths sum to the payload, with a zero terminator.
- Socket mode: `clamdScanner({ kind: "socket", path })` called directly against a fake listening on a temp unix path, or `\\.\pipe\perolehan-n5-<random>` on win32, gives CLEAN.
- `parseClamdReply` table: OK, FOUND, `stream:  FOUND`, `stream: OK extra`, empty, `ERROR`.
- `scannerSettingFrom`:
  - no env gives NONE;
  - `MALWARE_SCANNER_HOST=10.0.0.5`, `localhost`, `0.0.0.0`, `::ffff:127.0.0.1`, `127.0.0.01` and `clamd.internal` each give
    `HOST_NOT_LOOPBACK`;
  - `127.0.0.1`, `127.1.2.3` and `::1` are accepted;
  - every other fault in 3.2 has one case.
- `malwareScanner(env)`: NONE gives `NotConfiguredScanner` and NOT_SCANNED through `runScan`; FAULT gives configured true and
  ERROR through `runScan`.

**Done when:**
- `npx vitest run src/lib/documents/store` passes on Windows.
- `NODE_OPTIONS=--max-old-space-size=14000 npm run check` passes.
- No test leaves a server or socket open (each `afterEach` closes it).
- Committed alone.

### Step 2: the SEC-5 release rule and its words (domain-engineer). Can run alongside step 1.

Files:
- `src/lib/documents/release-scan.ts` (3.5)
- `src/lib/documents/release-scan.test.ts`
- `src/lib/documents/labels.ts`: `accessReasonText` gains `SCAN_ERROR` and `NOT_SCANNED`.

Tests:
- The full table over stored {NOT_SCANNED, CLEAN, THREAT} × fresh {NOT_SCANNED, CLEAN, THREAT, ERROR} × configured
  {true, false}, asserting the rule in 3.5. Under configured false, NOT_SCANNED is served and THREAT and ERROR are refused.
  Under configured true, only CLEAN is served.
- `accessReasonText("SCAN_ERROR")` and `accessReasonText("NOT_SCANNED")` return words, not codes.

**Done when:**
- `npx vitest run src/lib/documents` passes.
- `npm run check` passes, including `check-ui` minimal-words with the baseline still `{}`.
- Committed alone.

### Step 3: wire the release download and the bid-sealing row (api-engineer). Needs steps 1 and 2.

**`src/lib/portal/bids/download-store.ts`:**
- `prepareDownload` gains the injected `scanner` (3.6).
- After the digest check it calls `const fresh = await runScan(scanner, bytes)` and then `releaseScanRefusal({ stored:
  version.scanState, fresh, scannerConfigured: scanner.configured })`.
- On a refusal it calls `logAccess({ kind: "REFUSED", reasonCode: <refusal>, versionId, actor: who })` and returns 403 with the
  existing sentence. No `PurchaseDownload` row is written.
- The text (merged-text) branch is unchanged. It is product-generated text, not an uploaded file.

**`src/app/configuration/bid-sealing/core.ts:85`:** use `scannerSetting().state === "SET"` for `scannerConfigured`, so a
FAULT does not let LIVE be issued.

**`page.tsx:66,74,138`:** line 74 passes the same `scannerSetting().state === "SET"` to `liveIssueFaults`, so the page's missing
list matches what issue refuses. The row reads "Configured", "Not configured" or "Set wrongly" from `scannerSetting().state`, through the
existing `KeyValues`/`item` pieces. No fault code is shown.

**`src/lib/portal/bids/purchase.db.test.ts`:** a new `it` beside line 327, on the same released fixture:
- With `NotConfiguredScanner` injected explicitly (never the env default), the NOT_SCANNED file is served, as today.
- With a stub configured scanner answering CLEAN, it is served.
- With THREAT, ERROR or NOT_SCANNED, it is refused 403. Each refusal leaves one `DocumentAccessEvent` REFUSED with the matching
  `reasonCode`. That access-event row is the assertion that matters. `PurchaseDownload` is written only by `commit()`, which a
  refusal has none of.
- About five calls on one account sit well under the `document-download` limit of 60 a minute (`limits.ts`). If more are added,
  give each mode its own `supplier()` or space the calls with `now`.

The existing tests are not edited.

**Done when:**
- `npx vitest run src/lib/portal/bids src/lib/sealing src/app/configuration/bid-sealing` passes.
- `npm run test:db` passes, apart from the known `holding-edit.db.test.ts` scratch-data failure.
- `npm run check` passes.
- Committed alone.

**Decisions log, in the same commit as the step that puts the call into effect** (`- 2026-10-20 · ...` lines):
- Step 1 logs that a setting fault fails closed (T2), and that only loopback literals are accepted (T3).
- Step 3 logs that SEC-5 scans at download, not at upload, and why (2.4, T8).
- Step 4 logs the open-rows line.

### Step 4: deployment notes, decisions log and backlog (devops-engineer). Last.

**`docs/notes/sealed-bids-deployment.md` "The malware scanner"** gains:
- the four variables in 3.1, with one example for a socket and one for a port;
- that the host must be a loopback literal and anything else is refused, and the product then refuses every file;
- that clamd's `StreamMaxLength` must be at least `DOCUMENT_MAX_BYTES`, and its `TemporaryDirectory` on tmpfs;
- that setting or changing a variable needs a restart of the product;
- that released pack files are scanned at each download.

**`docs/notes/decisions-log.md`**, as a `- 2026-10-20 · ...` line. Steps 1 and 3 have already logged their own calls:
- **The go-live scanner condition, the SEC-5 row and the LIVE must-have 3 row stay open until a real clamd is deployed as the
   deployment notes say.** N5 builds the adapter only.

**`docs/notes/backlog.md`**: the three scanner rows (lines 58, 60, 71) get "adapter built 2026-10-20 (N5), open until deployed".
Two new rows:
- Scanning at upload for every document version (staff and supplier uploads still store NOT_SCANNED). Under a configured
  scanner, staff downloads of those files are not yet refused.
- `SCAN_LABEL.NOT_SCANNED` ("scanning not built") stops being accurate once a scanner is configured.

**Done when:**
- The full Linux suite passes: `powershell -NoProfile -File scripts/test-linux.ps1`.
- `npm run check` passes.
- Committed alone.
- No dev-server restart is needed: the environment stays unset on the founder's machine.
