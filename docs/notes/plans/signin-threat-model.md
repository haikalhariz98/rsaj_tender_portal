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