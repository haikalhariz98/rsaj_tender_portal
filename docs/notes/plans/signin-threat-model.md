# Threat model: adding sign-in for staff and suppliers to Perolehan

This was a read-only review of the code before any sign-in work. Open items O-1 (retention) and O-2 (no second factor) are since ruled; see `docs/notes/plans/signin-programme.md`, last section. Everything below comes from the code at the `build-all-modules` branch HEAD (6546934).

**Scope:** the authenticator-app second step is out of this phase, as you ruled. It is not listed as a go-live blocker or as a phase test below. Its absence is recorded once as a residual risk (R-1), and the controls that cover for it are must-haves.

## A. Ranked findings (most exploitable first)

### F1. Critical once sign-in exists: the person who acts is chosen by the browser, so every separation-of-duties check can be bypassed
- **Where:** about 22 distinct `*PersonId` fields are read straight from the submitted form in server actions. Examples:
  - `recordedByPersonId` and `tabledByPersonId` (`src/app/sourcing/[id]/bids/actions.ts`, `src/app/committees/actions.ts`)
  - `startedByPersonId`, `panelOverrideByPersonId` and `lateOverridePersonId` (`src/app/sourcing/[id]/opening/actions.ts`)
  - `declaredByPersonId` (`src/app/approvals/actions.ts`)
  - `fromPersonId` and `toPersonId` (`src/app/configuration/users/actions.ts`)
  - also `scoredBy`, `issuedBy`, `receivedBy`, `reviewer` and `signatory`.
- The committee vote route takes the voter from the request body: `src/app/api/committees/decisions/[id]/votes/route.ts`, `const { personId, choice, ... } = body`.
- **Why it matters:** every separation-of-duties rule runs on these picked ids. That includes self-approval escalation, requester not being the approver, endorsers, opening-panel independence and delegation `TO_SELF`.
- **Exploit after sign-in:** officer A raises a requisition, then records the approval step naming colleague B. The self-approval check passes. Or any signed-in user posts a vote with another member's `personId`. Adding sign-in does not close this on its own.
- **Fix:** every act records two fields.
  - **Actor:** always taken from the session, never from the request.
  - **Attested person:** picked on the form and labelled "recorded on behalf of". This keeps the paper process working.
- The separation-of-duties checks must run against both. For example, a requester who records an approval "on behalf of" the approver is still refused, and an opening authorisation's two officers must both differ from the actor.
- **Votes, one of two designs:** either `personId` must equal the session's person, or the session must hold the secretariat seat for that sitting (paper sheets entered by the secretary, with both fields stored).

### F2. Critical: the audit trail can be edited or deleted, and records nobody
- `src/lib/audit/record.ts`, `writeAudit`, hard-codes `actorPersonId: null, unattributed: true`.
- None of the 163 migrations has a trigger or a REVOKE.
- `AuditEntry.organisation` uses `onDelete: Cascade` (`prisma/schema.prisma` line 1598).
- `compose.yaml` runs the app as the Postgres owner/superuser.
- **Exploit today:** anyone with the app's database credentials, or any future code path, can UPDATE or DELETE trail rows. Deleting an organisation wipes its trail.
- **Fix:**
  - Separate database roles: a migration owner, plus an app runtime role that is not the owner and not a superuser.
  - REVOKE UPDATE, DELETE and TRUNCATE on `AuditEntry` (and the new security-event table) from the app role.
  - A `BEFORE UPDATE OR DELETE` trigger that raises an error.
  - Change the cascade to `Restrict`.
  - Write `actorUserId` and `sessionId` from the session; `unattributed=false` only where a session exists.
  - Existing rows stay `unattributed=true`. That is honest and must not be backfilled.

### F3. Critical when sign-in goes live: separation between the public copy and the staff copy rests on the proxy alone
- `src/proxy.ts` and `src/lib/portal/surface.ts` are the only barrier. Today no staff action asks who is calling.
- Next's own data-security guide (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`) treats the proxy as a router, not as authorisation. The proxy also imports no database on purpose, so it cannot check a session anyway.
- **Fix:** add server-only `requireStaff(capability)` and `requireSupplier()` guards, called first in every page loader, every export of a `"use server"` file (there are 54 such files) and every `route.ts` handler. Each guard also asserts the running copy (public or internal). The proxy stays as an outer layer only.

### F4. High: supplier features after sign-in will need writes the public copy refuses today
- `publicAllows` refuses any request carrying `next-action`.
- Loosening that rule would expose every staff server action whose id is known.
- **Fix:** supplier writes are route handlers listed in `PUBLIC_PAGES`/`SUBMIT_PATH` style, or there is an explicit allow-list of supplier action ids. Never a blanket "allow actions".
- Staff sign-in must never be served on the public copy.
- Use two session stores (as ADR 0020 proposes) with separate cookie names, each with the `__Host-` prefix. A supplier cookie must mean nothing to the staff copy, and the reverse.

### F5. High: one supplier reading another's records (sealed bids, documents, contracts, scores)
- My Bids, Company and Projects are still placeholders, so nothing leaks today.
- **Fix, before any of them is filled in:**
  - Every supplier query is scoped by `session.supplierId` in the data-access layer, never by an id in the URL.
  - Another supplier's record answers 404, not 403.
  - Database-level enforcement: the public copy connects as its own role. That role has SELECT only on portal views, row-level security keyed on supplier id, and no grant on `CompanyEstimateVersion`, the bid tables or staff tables.
- This also means a proxy bypass on the public copy reaches nothing.

### F6. High, but not exploitable today: one organisation reading another's data
- About 471 lookups use only a record id (`findUnique`/`update`/`delete({ where: { id } })`).
- The organisation is resolved by an unfiltered `db.organisation.findFirst()` in three places (`src/lib/window/read.ts` lines 430, 478 and 490) and by the `ORGANISATION_CODE` environment value elsewhere.
- **Not exploitable while each deployment holds one organisation. It becomes exploitable the moment a second organisation is added to a shared database.**
- **Fix:**
  - The organisation comes from the session only.
  - Postgres row-level security on every table, keyed on `organisationId` via `SET LOCAL app.org_id` per transaction, with `FORCE ROW LEVEL SECURITY`, under the non-owner role from F2. An owner or superuser bypasses row-level security.
  - With Prisma 7 and adapter-pg, every request must run inside a transaction (or a client extension) so the setting applies.
- This is a go-live blocker for any deployment holding more than one organisation. For single-organisation go-live it is a should-have.

### F7. High: an administrator can take over an approver or escalate their own rights
Without email, an administrator password reset is the recovery path, and it is also a takeover path: reset an approver's password, then act as them. Likewise, an administrator can create an account for a real Person, grant themselves roles, edit the authority matrix to route to themselves, or set up a delegation.

**Fix:**
- Account-to-Person binding:
  - one Person has at most one account (`@@unique(personId)`);
  - the binding never changes once made;
  - a supplier account is bound to a `SupplierContact` and through it to one `Supplier`, never to a `Person` (ADR 0019/0020).
- A reset:
  - is never done to your own account;
  - produces a one-time code with a configured lifetime, handed over in person;
  - forces a password change;
  - revokes all the target's sessions;
  - is audited;
  - is shown to the user at their next sign-in.
- Resets of approver or administrator accounts, role grants, account creation, matrix issue, quorum changes and delegations all need a second person (maker-checker). The checker's person must differ from the maker's, compared by Person, not by account.
- Supplier-side resets: the officer records how they verified the caller (in person, or a call-back to the registered number). This is the most likely route to taking over a rival's supplier account.

### F8. Medium: delegation loops and delegations granted by the wrong person
- `faultsIn` (`src/lib/people/delegation.ts`) refuses delegating to yourself and overlaps, but not cycles (A to B while B to A), and not a grantor who is not the person signed in.
- **Fix:**
  - The grantor is the session's person, or the act is recorded on their behalf by a holder of an administrator capability, with both fields stored.
  - Add a cycle/chain check over delegations in force.
  - Apply the line-management rule (FR-APR-011) once reporting lines exist; it stays an honest gap until then.

### F9. Medium: cross-site requests (CSRF) on route handlers
- `api/documents` checks `Sec-Fetch-Site` and Origin. `votes` (POST) and `method/determine` (POST) do not.
- `request.json()` will parse a cross-site `text/plain` form body.
- Next's Origin-against-Host check covers server actions only.
- SameSite=Lax cookies reduce this but do not cover sibling subdomains, which count as the same site.
- **Fix:** one shared guard (the `uploadRequestFault` pattern) on every state-changing route handler: `Sec-Fetch-Site` same-origin, Origin matches, `application/json` required. Set `serverActions.allowedOrigins` explicitly behind the reverse proxy. Sign-out is a POST.

### F10. Medium: sealed estimate and SULIT readable outside the app
- The sealed company-estimate figure is hidden only by Prisma's `omit` setting (`src/lib/db.ts`). It sits in plain text in the database and in backups.
- SULIT values carry chips saying "not restricted until sign-in".
- **Fix:**
  - Restrict SULIT reads by capability once sign-in exists.
  - REVOKE SELECT on the sealed columns from the app role; read them through one SECURITY DEFINER function that logs each read.
  - Encrypted backups, with custody recorded.
- Sign-in does not fix the backup exposure. State that on screen, as the product already does.

### F11. Low: anyone can shut the public registration form for the day
- Not related to sign-in.
- The global `portalDailyLimit` in `src/app/supplier/register/receive.ts` can be used up by one anonymous sender, which closes registration for everyone that day.
- **Fix:** add a per-IP limit ahead of the global one.

## B. Must-have controls (go-live blockers)

1. **Credentials:**
   - `node:crypto` scrypt with a per-user salt and stored parameters (no new outside service);
   - password minimum length is an organisation setting with a product floor;
   - optionally an offline breached-password list.
2. **Brute force:**
   - attempt counters per account and per IP, stored in Postgres so every instance shares them;
   - progressive delay, then a temporary lock;
   - threshold and window are organisation settings.
   - Hard permanent lockout can be used to stop a rival supplier bidding near the closing time, so the lock is time-limited and an officer can unlock.
3. **No account discovery:**
   - the same response and timing for "no such user" and "wrong password" (hash a dummy when the user does not exist);
   - the same rule on reset requests.
4. **Sessions:**
   - an opaque random 256-bit token; only its SHA-256 is stored in the database; no JWT carrying roles;
   - cookies `__Host-`, HttpOnly, Secure, SameSite=Lax (Strict for staff);
   - a new token on sign-in and on any role or privilege change (stops session fixation);
   - idle and absolute lifetimes are organisation settings, with a shorter idle timeout for approver roles;
   - sign-out deletes the session on the server.
5. **Re-checked on every request:**
   - `Person.isActive` (or `SupplierContact` status), account status and roles are read from the database on every request;
   - offboarding or a role change ends the person's sessions in the same transaction.
6. **Password re-entry before critical acts** (covers part of the missing second step): approve, sign, record an opening authorisation, unseal or disclose the estimate, and the checker step of maker-checker. A configurable freshness window.
7. **The actor from the session** (F1), and a separation-of-duties re-check against both the actor and the attested person.
8. **A guard first in every page, action and route** (F3). Copy checks stay in the proxy as well.
9. **Two identity stores and cookies** (F4). No staff sign-in on the public copy. No blanket server actions on the public copy.
10. **Supplier isolation** (F5): data-access-layer scoping, 404 on other suppliers' ids, a database role per copy.
11. **Audit integrity** (F2): app role without UPDATE or DELETE, refusal trigger, `Restrict` instead of cascade, attribution, plus a security-event log covering sign-in success and failure, sign-out, reset, lock, role change and session revocation.
12. **Maker-checker** at matrix issue, quorum changes, role grants, account creation, approver and administrator resets, and delegation. Checker's person differs from maker's.
13. **Administrator bootstrap:**
    - a server-side CLI creates the first administrator, bound to an existing Person;
    - it refuses if an administrator already exists, prints a one-time setup code, and is audited;
    - no seeded or default password, no "first visitor becomes administrator", no database reset.
14. **Recovery without email** (F7).
15. **CSRF guard** on every route handler (F9). Set `allowedOrigins` explicitly.
16. **Organisation from the session** in every query. Row-level security is a blocker only for a deployment holding several organisations (F6).
17. **PDPA (Malaysia):**
    - Account records, sign-in logs and IP addresses are personal data. Their retention periods are organisation settings, and expired rows are purged.
    - IC numbers (two models, schema lines 3674 and 8138) are readable only with a capability.
    - A supplier contact can view and export their own data.
    - Deletion conflicts with the append-only trail: for a deletion request, hold personal data off the audit rows (the rows reference ids and labels), pseudonymise the identity record, and keep the trail. Say so in the privacy notice.

## C. Should-haves

- Row-level security on a single-organisation deployment as well (defence in depth).
- A hash chain over `AuditEntry` with a periodic anchored digest.
- A list of active sessions, with "sign out everywhere".
- An in-app notice to the user for a new device or a password reset.
- Revisit C-6 (re-uploading an exact file into a SULIT document confirms a guess of its bytes) now that per-person access exists.
- A per-IP limit on the registration form (F11).
- A fuller Content-Security-Policy with nonces through `proxy.ts`.
- Strip `x-middleware-subrequest` at the reverse proxy.
- An external review of the authentication code before go-live (ADR 0020 item 5).

## D. Residual risk deferred by your ruling

**R-1. No second sign-in step for approvers.** Someone who gets an approver's password can approve as them until the next password re-entry or the idle timeout. Partly covered by B2, B4, B6 and the in-app notices in C. Record it as an accepted risk at go-live; the authenticator-app step attaches later at the same place as the B6 password re-entry.

## E. Security tests per phase (source scans follow the existing `certificate-scan` and `sealed.test.ts` pattern)

**Phase 1: accounts, sign-in and sign-out, attribution, organisation isolation.**
- Scan: every export of a `"use server"` file, every `route.ts` handler and every page loader calls the guard first.
- Scan: no actor `*PersonId` is read from form data or a request body without the attested-person wrapper.
- The session token differs before and after sign-in (fixation).
- A forged or expired cookie is rejected.
- Sign-out deletes the session row.
- A deactivated person's session fails on the next request.
- A role change revokes the person's sessions.
- Lockout counts are kept in the database, shared across instances, and the lock ends when its window does.
- Same response for an unknown user and a wrong password.
- UPDATE, DELETE or TRUNCATE on `AuditEntry` as the app role fails. Deleting an organisation with trail rows is refused.
- Audit rows carry the session's actor.
- Bootstrap refuses when an administrator exists.
- Organisation isolation: a session for org A gets 404 on org B's ids. Where row-level security exists, a query as the app role with A's setting returns zero of B's rows.
- CSRF: every POST route refuses a cross-site request or a `text/plain` body.
- Extend `surface.test.ts`: staff sign-in gets 404 on the public copy, and a supplier cookie is ignored on the staff copy and the reverse.

**Phase 2: maker-checker and separation of duties with identity.**
- Checker equal to maker is refused (same Person through two accounts is impossible by the unique constraint, and that is tested).
- Requester recording an approval "on behalf of" the approver is refused.
- A vote whose `personId` is not the session's person is refused, unless the session holds the secretariat seat.
- Delegation cycle is refused, and a grantor other than the session's person is refused unless the actor holds the administrator capability.
- An administrator resetting their own account is refused. A reset of an approver account needs a checker. A reset revokes the target's sessions.
- Critical acts are refused without a recent password re-entry.

**Phase 3: SULIT, sealed estimate, documents.**
- SULIT values are absent from pages, responses and exports without the capability.
- The sealed column is unreadable as the app role.
- A SULIT download is refused without the capability, and the refusal is logged.
- Access events carry the actor.

**Phase 4: supplier sign-in and portal (My Bids, Company, Projects).**
- Supplier A gets 404 on every supplier-B id, across every supplier route, list filter, export and error message.
- The public copy's database role cannot read staff tables, the sealed estimate or other suppliers' rows.
- Only the allow-listed supplier writes are accepted on the public copy.
- A supplier reset records how the identity was verified.
- PDPA: a supplier can export their own data, and expired sign-in logs are purged.

## F. Files that matter

- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\proxy.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\portal\surface.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\audit\record.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\db.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\org.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\window\read.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\lib\people\delegation.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\app\api\committees\decisions\[id]\votes\route.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\app\api\method\determine\route.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\app\api\documents\route.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\src\app\supplier\register\receive.ts`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\prisma\schema.prisma`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\compose.yaml`
- `C:\Users\MohamadHaikalHarizbi\projects\perolehan\docs\notes\architecture\0020-identity-separate-staff-and-vendor-stores.md`

## G. Sealing online bids (wave 3b, ADR 0036)

- **When:** added 2026-10-12 as the design for SR-13 (rulings 20 and 21). Revised the same day after the product owner's rulings 20a–20q
  and the wave 3b security review. Revised on 2026-10-14 after the stage A review and security audit, and rulings 20y–20ac.
- **What this is:** a review of a design. Stage A (the schema, the triggers, the crypto module, the pure rules and the deployment
  reader; build plan steps 1–6) is built. The acts, routes and screens are built (steps 7 to 19, 2026-10-16), and the review fixes are applied. Where a line below says "until then", read it as: the screen exists and the condition is still the customer's to meet.
- **Numbering:** S1–S20 keep their numbers, because the rulings cite them. New threats start at S21.

### Assets

- **The bid contents:** files, the declared Harga and Tempoh Kerja, and the company estimate's lodged copy.
- **Who bid**, before the opening.
- **The integrity of the register:**
  - every in-time bid was in time;
  - the bid opened is the one submitted;
  - a replaced bid stays shut.
- **The secrets:**
  - the exercise private key *k*;
  - each share;
  - each officer's passphrase;
  - the deployment's scrypt pepper.

### Trust boundary

- **What sealing defends against:**
  - the database, a backup or a dump;
  - database administrators;
  - product administrators, through the screens;
  - an application server compromised while nobody is entering a passphrase.
- **What it does not defend against:**
  - the running application server while it handles a bid or a passphrase;
  - the malware scanner while it reads a bid (ruling 12a);
  - the application database role writing rows. Fabrication is **detected**, not prevented (S8, S11).
- **Ruling 20's "the server sees shares as typed"** applies here to the passphrases that unlock the shares.

### Threats

| # | Threat | Answer | Left |
| --- | --- | --- | --- |
| S1 | A dump or backup is read for bids | Ciphertext only. DEKs are HPKE-sealed to the exercise key or to officers' keys; shares are sealed to per-exercise officer keys wrapped under peppered scrypt. No plain-file hash, filename, media type or declaration hash is stored. | Sizes, times and counts. Identity is plain (S9). Between finalising and the mover, a file's `releasedDek` is plain, after the figures are already public to the capability (ADR 0036 D10). |
| S2 | Passphrases are guessed offline from a dump | scrypt N=2^17; the passphrase must differ from the sign-in password; a configured minimum, floor 12; **the pepper, held outside the database, is required for LIVE** (20v). | With the pepper as well (a server compromise), the GCM tag confirms a guess. **A lost pepper, or one rotated early, makes unopenable every exercise wrapped under it from which an opening can still follow (20y):** one not cancelled whose main opening is not finalised, or whose roll holds a late bid not withdrawn that is still undecided, or admitted and not yet opened at a finalised supplementary opening. The main finalise alone is not the end. See S14 and must-have 7. |
| S3 | An administrator reads a bid through the product | The roster refuses administrators; every sealed entry point refuses them and logs the refusal. | None known. |
| S4 | An administrator resets an officer's password (F7) | The unseal passphrase is separate and cannot be reset. | The administrator can still deny the opening before the unseal by deactivating the officer (S14). |
| S5 | The application server or the scanner is compromised at upload | Stated; nothing answers it. Plaintext stays in memory and **may touch the scanner's tmpfs**. The scanner is on the same host, over a local socket, with no quarantine and no copy. Nothing is logged; `BlobContent` and `DocumentVersion` never see plaintext; memory is zeroed best-effort; core dumps and swap are off. | Every bid that arrives while either is compromised. |
| S6 | The application server is compromised at key creation, an authorisation, a download or finalising | Stated; nothing answers it. *k* or an officer key lives for one request. | The server can keep *k* or passphrases and unseal later, even before the closing, and can misreport what it shows. |
| S7 | Officers collude before the closing, or one officer abuses a backup | The application refuses an unseal at or before the closing. Every authorisation is attributed and audited. | All named officers together, with a database copy, can decrypt early: no time lock is cryptographic. **Share releases are kept in the database (M1, chosen so the unseal survives restarts and several instances).** With n = 2, a backup taken after officer A authorises and before officer B does lets B alone open later, even if the sitting adjourned and the release was shredded. That is only after the closing, and only after A's recorded consent. |
| S8 | A database writer moves a sealed price, file or share into another row | AAD binds every ciphertext to its organisation, exercise, key, record and part. The unseal checks each manifest against its row. Ciphertext is immutable by trigger. `OnlineBidPart.fileId` is unique. | **The application role can still fabricate rows that pass the triggers. This is detected (by the manifest check, the opening roll and the receipt digests), not prevented.** The owner role can drop triggers. |
| S9 | Who bid is learnt before the opening | Received shows no names, and an ordinal in place of the sequence (20u). `sealedAuditMask` applies. Filenames are sealed. The void register answers the same way for every buyer (S21). | **FR-BID-001's identity clause is NOT met against a privileged query** (20a): `supplierId`, the account links, the audit actor, `ActAttribution` and `SealedAccessEvent` are plain. A scan pins the list. Whether to blind the link is a question for the outside review (20ck). Wave 3c adds no plain identity column (20cm): before finalising, a reader who is not a named officer gets no bidder name and no addendum acknowledgement day (`namesHeld`). **The timing exposure after the start (20bh) is accepted for LIVE only through the customer's written acceptance, which must name it.** The customer's written acceptance names this clause. |
| S10 | The exercise public key is swapped | `publishedKeyFingerprint` is frozen at publication. A trigger refuses a new or retired key after publication except with a `PublishedKeyChange` row, and refuses any after the closing. Every upload checks the live key against the fingerprint. The opportunity shows the fingerprint and its history, and every receipt shows it. | The owner role, through DDL. Suppliers can compare the fingerprint. |
| S11 | A bid is forged, or a rival's is swapped (anyone can encrypt to a public key) | A submission needs a SIGNED `ActAttribution`, a spent step-up moment, an audit row and an ONLINE envelope inserted in the same transaction. The **stamp is owned by a trigger on the database clock**, within a bounded skew. `late` and the closing judged are set by the trigger. Status moves after the closing are refused. `startOpening` freezes the opening roll. My Bids shows each supplier the opened receipt digest itself and asks it to compare it with the receipt it kept (20s); a server sentence comparing two server rows would prove nothing here. | **The application role can fabricate a complete bid inside the skew window before the closing, or move a real one to REPLACED before the closing. This is detected (no matching act by the supplier, or the supplier's receipt is missing from the roll), not prevented.** |
| S12 | A replaced or withdrawn bid is replayed as the live one | Status moves forward only. The unseal opens only SUBMITTED, in-time rows. The roll and the receipt digests are shown at the opening. **A replace is one act:** REPLACED is refused without an in-time replacement of the same kind written in the same transaction; a supplier holds one standing bid, checked at the commit (PA027); and (build plan step 10, PA028) a submission that names another as replaced is refused at the commit unless that one moved to REPLACED in the same transaction, so a "replaced" alternative cannot stay live beside its replacement. | None known: step 10's trigger (PA028) is built, so a named alternative cannot stay SUBMITTED beside its replacement. |
| S13 | A price is brute-forced from a hash | No hash of a plain file or a declaration is stored. | None known. |
| S14 | Denial of the opening | **Before the unseal:** deactivation lists the exercises at risk and asks a reason; "Check I can still unlock" is offered; re-key while no submission exists. **After the unseal (H3, option a):** every opened bid's declaration, file and estimate DEKs are re-sealed to each named officer, so finalising needs any ONE officer's passphrase. One officer can no longer force a re-tender after the prices are seen. | **Before the unseal, after the first submission:** a lost passphrase, a refusal or a deactivation means re-tender (20f; no escrow). **After the unseal:** deactivating a named officer needs a second approver until finalising (option b), whether through the person's leaving or through disabling their sign-in account (`disableAccount` refuses it for one administrator). Even when two approve it, that opening can never be finalised (the officer cannot sign; no substitution after the closing), so the deactivation screen lists the openings left unfinalisable and says they must be re-tendered; the way out is the existing cancellation (20t). An officer's procedural refusal to sign, or two colluding administrators deactivating one, still blocks finalising, as at a paper opening. One officer can block a supplementary opening, so a late bid admitted by the committee may never be opened. **A lost pepper, or one rotated early, denies every opening that can still follow of every exercise wrapped under it (20y):** the main opening before it is finalised, and any supplementary opening of a late bid admitted or still to be decided. An admitted late bid left unopenable blocks the award for ever (`ADMITTED_UNOPENED`); the way out is cancellation. Before any submission, a re-key under a new pepper is the remedy. The bid sealing screen lists the organisation's exercises that still need the held pepper (`pepperStillNeeded`), so an operator can check before a rotation. |
| S15 | A departing officer keeps the ability to unseal | Substitution seals the departing officer's share to the incoming officer and shreds the old row. | **Substitution transfers the share; it does not revoke it.** A backup taken before the substitution still holds the old row, which the departing officer's passphrase opens. It still needs every other officer, as S7 and M1 describe. |
| S16 | Malware reaches an officer through a bid | The recogniser and the scan run on plain bytes. **A scan ERROR or THREAT refuses the file in either mode.** NOT_SCANNED is possible only under DEMONSTRATION with no scanner, and is shown at download. LIVE requires a scanner. | The scanner's detection rate. |
| S17 | A rival is starved near the closing | Submit is a small act stamped before the password check. Bid uploads have a deployment pool, **one upload in flight per supplier**, a body-read deadline and a minimum rate. The caps are per supplier per exercise (20e). Lockout is time-limited. | A deployment-wide flood is the edge's job. |
| S18 | A supplier account is taken over, and the attacker withdraws or replaces the bid | The password is asked again at submit and at withdraw. My Bids shows every act. | No notice can be sent. R-1 applies to suppliers. |
| S19 | The append-only tables are filled | Per-account rates; per supplier per exercise caps; part sizes. Anonymous refusals write no row. Of a signed-in account's rate refusals, only the first per rate window writes a `SealedAccessEvent`; the rest are refused without one (20w). | None known. |
| S20 | Plaintext leaks through logs, errors or audit JSON | Bodies are never logged. Audit JSON holds ids, statuses and digests only (scan). Refusals are logged only after the session check, never through `logAccess`, which records the offered filename. | Proxies must not log bodies (must-have 5). Anonymous refusals are not in `SealedAccessEvent`; they are left to the deployment's edge access log, if it keeps one: method, path and status, never a body (20w). |
| S21 | The void register shows which buyers have bid (H1) | Before the opening, `voidSaleFault`'s `ENVELOPE_HELD` never reads online bids, matching paper, where envelopes are anonymous. A DB test shows the register answers identically for every buyer. | None known, provided the 17b reversal keeps 20r: before the opening it reads no bid on either channel, its screen says whether the buyer has bid is not shown, and it joins this DB test (same answer for every buyer, with and without online submissions). A reversed buyer's sealed bid is judged at the opening with no live sale. |
| S22 | The sequence reveals replacements and withdrawals | Received shows an ordinal before the opening starts, with the 20u words; the sequence appears from the start. | Someone who watches Received over time still sees a stamp vanish and a new one appear on a replace, and the count drop on a withdrawal (20u). The supplier's own My Bids shows its own sequences, which is its own information. |
| S23 | The file mover fails or races | A per-file advisory lock; the owner link is unique (`onlineBidFileId`) and is written in the store's transaction; the mover is idempotent; every GCM tag is verified before finalising commits. | `releasedDek` is plain until each file is moved (S1). |
| S24 | Stamp manipulation within the skew | The trigger bounds `receivedAt` (and a withdrawal's `statusAt`) to `[clock − MAX_STAMP_SKEW_SECONDS, clock]`, where clock is `sealed_clock()`: `clock_timestamp()`, the moment of the insert, declared VOLATILE and read once per trigger (20aa). The transaction's start is never the bound, so holding a transaction open does not carry an old stamp in. A database test pins this on the live function definitions. `startOpening`'s `SKEW_NOT_ELAPSED` reads the same clock. | An application-role writer can back-date by up to the skew, measured from the moment of the insert. That is detected as in S11. An honest submit held on the locks past the skew is refused, in words, and counts toward no lockout (20aa). |
| S25 | A trigger is deceived about what this transaction wrote, or about which table it reads | **"Written in this transaction"** is read from `xid8` columns that only a trigger writes (`insertedXact`, `statusXact`, `unsealedXact`, `finalisedXact`), never from a row's `xmin`, which any UPDATE resets: a no-op UPDATE of an old row cannot make it read as written now. An UPDATE of an ONLINE envelope that changes nothing is refused. Every ONLINE envelope has its submission by the commit (deferred). **Names:** every trigger function runs with `search_path = pg_catalog, public, pg_temp` and names its tables in `public`, so a temporary table named like a real one changes no outcome. As a second wall, `db:roles` revokes TEMPORARY on the database from PUBLIC and the app's role (stage A security audit 1, 2). | **The revoke reaches a database only when `npm run db:roles` runs**; until then, and for the owner, which keeps it, the pinned search path is the only wall. The runtime role check does not yet report a login that still holds TEMPORARY, and a LIVE refusal while it is held is a candidate control, not built (backlog, 20cw (a)). The owner role can still drop triggers (S8). |

### Must-haves before LIVE

These are in addition to section B, and are each recorded per organisation in `BidSealingPolicy` unless noted.

1. **The outside cryptography review is recorded.** It covers:
   - ADR 0036 D2 and D3;
   - these threats;
   - the recovery options (re-key-and-resubmit, k-of-m);
   - the blinded supplier link;
   - signed receipts.
2. **CPD's SK002/SK003 amendment is recorded.**
3. **A malware scanner is configured** (12a, NFR-SEC-007), deployed as S5 says.
4. **The public-copy database role is built**, with no SELECT on any sealed column (founder-reserved, log 1937). It is **attested, and not
   checked by the portal** (20v).
5. **Deployment hardening:** core dumps and swap off, HTTPS, no body logging. **Attested, and not checked by the portal** (20v).
6. **The customer's written acceptance of the honest limits** — S5 to S7, S9 (naming FR-BID-001's identity clause and the timing exposure after the start, 20bh, 20cm), S11, S14 and F10 (the company estimate's figure is plain in the database and its backups until the opening, so backups are encrypted with recorded custody) — recorded
   as `customerAcceptanceReference` (20o). It names the one-officer residual after the unseal: before finalising, one named officer with a
   database copy, the deployment's pepper and their own passphrase can read every opened bid's declaration and files, and the lodged
   estimate figure (20t).
7. **The scrypt pepper is configured**, with its custody and its backup apart from the database (20v), and it is **kept, unchanged, until no
   opening of any exercise wrapped under it can still follow (20y, correcting 20v's "finalised or cancelled")**: until the exercise is
   cancelled, or its main opening is finalised and every late online bid in its roll that is not withdrawn is either not admitted (its
   committee decided NOT_CARRIED) or admitted and opened at a supplementary opening that is itself finalised. One pepper at a time: a new
   pepper replaces the old only once nothing under the old one can still be opened. The bid sealing screen lists the exercises that still
   need it (`pepperStillNeeded`, build plan step 15); until then the operator checks the rule by hand.
8. **The deployment sets `SEALED_BIDS_LIVE_ALLOWED`** (20v).

### Tests (wave 3b)

- **Known-answer tests:**
  - RFC 7748, 5869 and 7914;
  - the GCM cases with 96-bit IVs only;
  - RFC 9180 A.1;
  - the vendored CFRG entry for X25519, HKDF-SHA256 and AES-256-GCM, with a pinned hash. If that entry is absent, the build stops and
    reports.
- **Splitting:** reconstruction works for n = 2, 3 and 5. An altered share flips a non-clamped bit and is refused.
- **Source scans:**
  - ciphertext and named key material only;
  - decryption only in `open.ts`;
  - the identity columns pinned;
  - FINALISE grants read only by `finaliseOnline`;
  - no "signed" or "proof" receipt.
- **Database tests as the application role,** one per trigger:
  - the stamp skew;
  - the forced late flag;
  - a late insert after the opening starts;
  - status moves after the closing;
  - the envelope required in the same transaction;
  - a unique `fileId`;
  - the fingerprint and key rules;
  - `releasedDek`;
  - the parent;
  - `LODGEMENT_CLOSED`;
  - delete and truncate;
  - from the stage A hardening: a stamp older than the skew at the moment of insert, inside a transaction held open; `sealed_clock` VOLATILE
    and no sealed function reading the transaction's start, on the live definitions (20aa); a no-op envelope UPDATE; an envelope left
    without its submission at the commit; a temporary table that changes no outcome, and none creatable by the app's role; the channel
    and rules frozen (PA025); a share release checked (PA026); one standing bid, and a stricter isolation refused (PA027);
  - owed: a replace that leaves its named submission unmoved (PA028, step 10); trigger 5's shred after the document link (step 15).
- **The void register** answers the same way for every buyer before the opening (S21).
- **Refusals:** an administrator is refused at every sealed entry point; a non-officer download is refused; each refusal is logged after
  the session check.
- **Ordering:**
  - an unseal at the closing second is refused;
  - a replaced bid is never opened;
  - a late bid is not opened at the main unseal;
  - n = 3 needs the third officer;
  - finalising with a NULL price is refused;
  - finalising with a corrupt blob is refused before it commits.
