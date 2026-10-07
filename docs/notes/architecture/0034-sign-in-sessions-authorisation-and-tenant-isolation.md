# 0034 — Sign-in: local credentials behind the identity façade, database sessions, authorisation, tenant isolation, maker-checker and SULIT restriction

**Status:** Accepted as amended, 2026-10-06 (product owner, for the founder: decisions log 2026-10-06 rulings on the sign-in programme, and open items O-1 and O-2). Supersedes 0020; 0020 is marked "superseded by 0034" in Phase 1d. It rests on the founder decision of 2026-10-06: build sign-in, then everything waiting on it, with no second sign-in factor. Before go-live it needs the security auditor's review and an outside review, as 0020 item 5 requires.

**Amended from the first draft.** Where this text differs from the draft the product owner reviewed: there is no `assurance` field and no `stepUpWindowSeconds`; both cookies are Lax and every POST passes an Origin/Sec-Fetch guard; there is no row-level security and the supported deployment is one organisation per database; the bootstrap command re-runs only with `--additional` or `--recover`; `sulit.read.organisation` is undecided by default; the sign-in address and user agent live in a side table (O-1); and `ActAttribution` gains `recordedBySystemLabel`. Numbering: 0034 is the next free number. 0026 is held for 6.16 (backlog); 0027 and 0028 were named for 6.17, which was removed. None of those three is reused.

### Context

- Until now, every act has been "recorded on behalf of, not signed".
  - `writeAudit` always writes `actorPersonId: null` and `unattributed: true`.
  - Actions take the acting person from a form field: `recordedByPersonId` 24 times, `tabledByPersonId` 15 times, and others.
- The only thing keeping strangers off the staff screens is the `PORTAL_SURFACE` split (`src/proxy.ts`, `src/lib/portal/surface.ts`).
- The organisation is `ORGANISATION_CODE` from the environment, used in 85 files. Actions load rows by id without checking which organisation they belong to; for example `approvalStep.findUnique({ where: { id } })` in `src/app/approvals/actions.ts`.
- Requirements that apply:
  - NFR-SEC-001: role-based access with record-level scoping.
  - NFR-SEC-002: SULIT classification.
  - NFR-SEC-004: the administrator role is kept apart from every transactional capability, and configuration changes need maker-checker.
  - NFR-SEC-005: separate staff and vendor identity stores, and MFA for approvers.
  - NFR-SEC-006: session timeout, a concurrent-session limit, and re-authentication at approve, sign and unseal.
  - NFR-AUD-001: actor, role held at the time and source address on every audit entry.
  - NFR-AUD-004: every access to a SULIT record logged, whether allowed or refused.
  - NFR-USE-004: configuration changes subject to maker-checker.
  - FR-VND-013: a vendor sees only its own records.
- Constraints that still hold:
  - No outside service: no hosted identity provider, no email or SMS, no payment service.
  - No database reset.
  - No hard-coded policy.
  - `Person` stays identity, separate from sign-in.
  - `organisationId` on every configuration table.
- Next 16 behaviour this design relies on:
  - The proxy runs on Node, but its own docs say it should make only optimistic cookie checks, not database reads.
  - `cookies().set` and `.delete` work only in Server Functions and Route Handlers, not while a page renders.
  - Server actions are public POST endpoints. They have an Origin check built in, but must re-check sign-in and permission themselves.
  - `unauthorized()` and `forbidden()` are experimental, so this design does not use them.

### Decision

**D1. Two stores behind one façade, both local.**
- `IdentityProvider` (in `src/lib/auth/identity.ts`) has two local adapters: `StaffCredentials` and `SupplierCredentials`.
- They use separate tables (`StaffAccount` and `SupplierAccount`), separate session tables and separate cookies. One table never serves both.
- A corporate directory adapter can replace `StaffCredentials` later without touching anything above the façade.
- This replaces 0020's "corporate directory" and "external vendor store" for this phase.

**D2. Accounts.**
- **Staff:** `StaffAccount` is 1:1 with `Person` (`personId @unique`). An account is never deleted, only disabled. Making a `Person` inactive disables the account and revokes its sessions in the same transaction.
- **Supplier:** `SupplierAccount` is 1:1 with `SupplierContact` (`contactId @unique`) and through it belongs to one `Supplier`. Retiring the contact (`retiredOn`) disables the account in the same transaction.
- **Sign-in names** are unique across the whole product within each store, compared in lower case (`loginKey`). This lets the sign-in form work without asking for an organisation.

**D3. Passwords.**
- Hashed with scrypt from `node:crypto`, stored as a PHC-style string: `$scrypt$ln=15,r=8,p=3$salt$hash`, with `maxmem` set to 64 MiB.
- At most 4 hashes run at once in one process.
- `node:crypto` argon2id exists on Node 24.13. Calling it gave no experimental warning, but its stability marker is unconfirmed and the deployed Node version is not pinned (`engines` is unset). Because the parameters are stored in each hash, a successful sign-in can later re-hash to argon2id with no migration.
- Rules for a password:
  - Minimum length comes from `SecurityPolicy`, with a database CHECK of at least 8 (NIST SP 800-63B).
  - Maximum 256 characters.
  - No composition rules.
  - Must not equal the sign-in name.
- No breached-password check: that needs an outside list or service.
- An unknown sign-in name still runs a dummy hash, so timing does not reveal whether an account exists.

**D4. Database sessions.**
- `StaffSession` and `SupplierSession` each hold:
  - `tokenHash` (SHA-256 of a 32-byte random token; only the cookie carries the token itself)
  - `accountId` and `organisationId`
  - `createdAt`, `lastSeenAt`, `absoluteExpiresAt`
  - `stepUpAt`
  - `sourceAddress` and `userAgent` (ordinary editable columns, covered by the retention setting in D16)
  - there is no `assurance` field: a later second factor attaches at the password re-entry step (D13), not at a session column
  - `revokedAt` and `revokedReason`
- Cookies are named `__Host-perolehan-staff` and `__Host-perolehan-supplier`. Both are `HttpOnly; Secure; SameSite=Lax; Path=/`, with `Max-Age` equal to the absolute time remaining. Lax is not a CSRF defence on its own, so **every POST** (route handler and server action) must pass the Origin/Sec-Fetch guard (`assertSameOrigin`, D7).
  - HTTPS is required in deployment. Browsers accept `Secure` cookies on localhost, so development is unaffected.
- **Idle timeout:** checked in the database when a session is read. A session idle past `idleMinutes` is revoked with reason `IDLE`. `lastSeenAt` is written at most once a minute. That write is allowed during a page render because it changes no cookie.
- **Absolute timeout:** fixed when the session is created and never extended.
- **Token rotation:** only in Server Functions and Route Handlers, and only at these points:
  - sign-in: always a new token, never an existing one, which stops session fixation;
  - password change or reset-code use: every other session is revoked;
  - a change to the account's administrator flag or status: every session is revoked.
- There is no periodic rotation, because a page render cannot set a cookie.
- **Concurrent-session limit:** `SecurityPolicy.maxConcurrentSessions`. When the limit is reached, `concurrentSessionAction` decides: `REVOKE_OLDEST` or `REFUSE_NEW`. This is the customer's switch.
- Sign-out revokes the session and deletes the cookie. "Sign out everywhere" revokes all of the account's sessions.

**D5. Lockout and throttling. No new infrastructure.**
- **Per account:** `failedAttempts` and `lockedUntil`, against `maxFailedAttempts` and `lockoutMinutes`.
- **Per address:** failed `SignInEvent` rows for that address within `addressThrottleMinutes`, counted before any hash is computed.
- **What the person sees:** the same "Sign-in failed" message whether the password is wrong, the account is locked or the name is unknown. The event row records which it was.
- An administrator can unlock an account. The unlock is audited.

**D6. Password reset and activation without email.**
- An authorised officer issues a `OneTimeCode`:
  - purpose `ACTIVATION` or `RESET`;
  - 128 random bits, shown once in base32 groups and stored as SHA-256;
  - valid for `resetCodeValidityMinutes`, usable once.
- The officer must give a reason, saying how identity was checked outside the system. The code is handed over by hand, in a printed letter or by phone; the system never sends it.
- Who may issue a code:
  - **Staff codes:** an administrator. No administrator may issue a code for their own account, and nobody resets their own account. **For a staff account whose Person holds, or has ever held, an office, a committee seat or a delegation, and for the account of an administrator, activating or resetting needs a second person** (the product owner's ruling of 2026-10-07, following NFR-SEC-004 and threat model F7: an administrator's account is not reset by one administrator acting alone): the change is proposed by one and the second person issues the code and is the one shown it (`ConfigurationChange` kind `ACCOUNT_CODE`, Phase 2c). With exactly two administrators neither resets the other through the product, because a second person does not exist, and the product says so. The way out is the operator's bootstrap command with `--recover`, below. **A reset ends the target's sessions when the code is issued**, not only when it is used, because a reset is ordered when the account may be in someone else's hands. An activation code ends nothing. The person whose password was reset sees a notice at their next sign-in (`resetNoticePending`).
  - **Supplier codes:** one officer with `supplierAccounts.manage`, who must record how the caller's identity was checked (`OneTimeCode.identityCheck`). A supplier activation code is offered when a `PortalApplication` is accepted or a contact is added.
- Using a code needs the sign-in name, the code and a new password. It revokes every session for the account.
- If the only administrator is locked out, the bootstrap command with `--recover` (D18) recovers the account, because anyone with server access already holds the database.

**D7. One way to get the signed-in actor.**
- `src/app/_auth/actor.ts` provides `requireStaff()`, `requireSupplier()` and `stepUp()`. They wrap the session store in React `cache()`, so each request reads the session once.
- Every exported server action and every route handler calls `requireStaff()` or `requireSupplier()` before anything else, or appears in `PUBLIC_ENTRY_POINTS` with a reason. A source scan enforces this over all 54 `"use server"` files and all 11 `route.ts` files.
- Pages call the same functions. When nobody is signed in they `redirect()` to the sign-in page.
- **The proxy:**
  - stays database-free and makes only the optimistic cookie check;
  - refuses a staff cookie on the public copy and a supplier cookie on the internal copy;
  - on the internal copy, sends a page request with no cookie to `/sign-in`, and answers a POST with no cookie with 401;
  - keeps `PORTAL_SURFACE` as a second line of defence.
- Supplier sign-in, sign-out, activation, reset and every 6.15b write are **route handlers** at literal paths added to `publicAllows`.
  - The public copy still refuses every server action, because an action's encrypted id cannot be allow-listed by path.
  - Every POST route handler calls `assertSameOrigin(request)`. Server actions keep Next's built-in Origin check.

**D8. Authorisation.** It has three parts and nothing else.

- **Holder checks** — "who may decide this step". These are unchanged: `holdersFor`, `supplierHolders`, delegations, escalation, self-approval and conflict checks. They are now applied to the actor rather than to a person picked in a form.
- **Product permissions** — a closed list in code (`PermissionKey`). These are product vocabulary, not policy:
  - Held through the administrator flag only:
    - `accounts.manage`
    - `security.policy`
    - `permissions.grant`
  - Held by administrators through the flag, and grantable to roles:
    - `configuration.draft`
    - `configuration.issue`
    - `audit.read`
  - Grantable to roles only:
    - `supplierAccounts.manage`
    - `sulit.read.organisation`
    - `acts.recordOnBehalf`
  - Grants are configuration, held in a new `RolePermission` table: `organisationId, permissionKey, roleCode, decision GRANTED|WITHHELD`.
  - No row means `UNDECIDED`. Undecided is refused, but the grid shows it as undecided, never as withheld.
  - Permissions come from role assignments in force on the organisation's "today" (`todayIn`). Delegation does not carry product permissions in this phase; it carries approval authority only, as now.
  - The customer's existing `Capability` and `RoleCapability` vocabulary stays as it is.
  - *As built (Phase 2a, `src/lib/auth/permissions.ts`):* a person's permissions are read on every request from the administrator flag, the offices in force on the organisation's today and the grants to their roles. An administrator holds exactly what the flag confers and never a granted-only key. A stored row for an administrator-only key or an unknown key is ignored. With no time zone set no office is claimed. Two rules the product owner has not ruled on are taken in the refusing direction and logged as open: a key GRANTED on one held role and WITHHELD on another is refused, and an office held only for a department carries no permission.
- **Record scope:**
  - tenant (D9);
  - SULIT and restricted exercises (D14);
  - supplier ownership: a supplier actor's `supplierId` always comes from the session. A scan checks that supplier route handlers never read it from the request.

**D9. NFR-SEC-004: administration is kept apart from transactions.**
- `StaffAccount.isAdministrator`.
- A pure rule, `administrationConflict`, refuses all of these:
  - making an account an administrator while its Person holds any `RoleAssignment`, named `CommitteeMember` seat or `Delegation`;
  - giving any of those to an administrator's Person;
  - any holder-checked act, signature or unseal by an administrator account. This is checked again inside `requireStaff`.
- An organisation that wants an IT administrator gives them their own `Person` with no offices.
- *As built (Phase 2a):* the pure rule is `administrationConflict` in `src/lib/auth/administration-conflict.ts` (not `administration.ts`, which is the Phase 1b account administration). Each path that gives a holding (`saveAssignment`, `saveDelegation`, the committee seat editor) and each that makes an administrator (the bootstrap command, `demo:accounts`) asks inside its own transaction under a lock on the Person's row (`administration-guard.ts`). A holder-checked act is refused to an administrator account through `staffForAct` and `staffRoute({ holder })`; `ACT_SLOTS` names the entry points wired so far.

**D10. Tenant isolation: the actor's organisation scopes every query. No row-level security.**
- `actor.organisationId` and `organisationCode` replace `ORGANISATION_CODE` in all 85 files.
- `ORGANISATION_CODE` stays only in:
  - `src/lib/portal/**`, for anonymous public pages, which serve the deployment's one organisation (a supplier session's organisation must equal it);
  - `prisma/` seeds;
  - scripts.

  A scan forbids importing it anywhere else.
- Every load by id in an action or route handler either:
  - adds `organisationId: actor.organisationId` to its `where` (Prisma's extended unique `where`), or
  - for a child table without `organisationId`, filters through the parent: `approvalStep.findFirst({ where: { id, instance: { organisationId } } })`.

  The child tables are `RoleAssignment`, `ApprovalStep`, `RoleCapability`, `ExerciseParticipant` and `CommitteeMember`. A row from another organisation reads as "no longer exists".
- **Enforcement:**
  - a source scan over action and route files for `findUnique`, `findFirst`, `update`, `delete` and `upsert` keyed by `id` without an organisation filter. Exceptions must be marked `// tenant: via <parent>` and named in the scan's allow-list;
  - a two-organisation fixture, plus a cross-tenant suite that calls each action with organisation B's actor against organisation A's ids and expects a refusal.
- The unfiltered `db.organisation.findFirst()` calls in `src/lib/window/read.ts` take the organisation id instead.
- **Go-live condition:** two customers may share one database only once that suite covers every action. Until then the supported deployment is **one organisation per database**, which is the isolation boundary that holds today. There is no row-level security (see Ruled out).

**D11. Audit gets an actor.**
- `AuditContext` gains a required `actor: AuditActor`. Making it required turns every caller into a compile error, and those errors are the migration checklist.
- New `AuditEntry` columns, all nullable:
  - `actorKind` (`STAFF | SUPPLIER | SYSTEM`)
  - `actorSupplierAccountId`
  - `actorSystemLabel`
  - `actorSessionId`
  - `actorOffices` (JSON: role codes and scopes held at the time)
  - `sourceAddress`
- CHECK: `actorKind IS NULL` if and only if `unattributed`, and exactly one actor reference matches the kind.
- `SYSTEM` is for the bootstrap command, migrations and the demo loaders, each with a label.
- Source address: taken from `X-Forwarded-For` only when `TRUSTED_PROXY_HOPS` is set. That is deployment configuration, not customer policy.
- `AuditEntry`, `SignInEvent` and `SulitAccessEvent` get a database trigger that refuses UPDATE and DELETE. **The trigger has no bypass:** no maintenance role is let through, and it also fails for the table owner. `DocumentVersion` gets a trigger that refuses DELETE and refuses UPDATE unless only `withdrawnAt` and `withdrawnReason` change, from null to set (OD-9).
  - *As built (Phase 1d, migration `20261007100100_trail_refusal_triggers`):* these are the repo's first PL/pgSQL triggers (the first draft's "the repo already creates triggers" was wrong). Each guarded table also has a statement-level `BEFORE TRUNCATE` refusal, since TRUNCATE skips row triggers and the owner holds TRUNCATE by ownership. Every trigger is `ENABLE ALWAYS`, so `session_replication_role = replica` does not switch it off. Refusals carry their own SQLSTATE: `PA001` append-only, `PA002` a sign-in address still inside its retention (or with none set), `PA003` a document version changed other than by its one withdrawal. What remains possible for the owner is DDL (dropping a trigger), which is a migration and shows in the history. `SulitAccessEvent` gets its trigger when Phase 3a creates the table.
- **A separate database role for the running app** (`perolehan_app`): neither owner nor superuser, CRUD on all tables, with UPDATE, DELETE and TRUNCATE revoked on `AuditEntry`, `SignInEvent`, `SulitAccessEvent`, `DocumentAccessEvent` and `SignInEventDetail`. It is created by `scripts/db-roles.ts` after `migrate deploy`, not inside a migration (`CREATE ROLE` is cluster-wide and would break shadow-database replay, and a password in a migration is a hard-coded secret). `AuditEntry.organisation` changes from `Cascade` to `Restrict`.
  - *As built (Phase 1d):* `npm run db:roles` (run by `db:migrate` and `db:deploy` after Prisma) takes its password from `APP_DB_PASSWORD` and its name from `APP_DB_ROLE` (unset: `perolehan_app`); with no password it makes nothing and says so. It also takes every right on `_prisma_migrations` away from the role, and sets default privileges so the owner's later tables are usable at once (a new append-only table is therefore writable until the script runs again: run it after every `migrate deploy`). Migrations connect as the owner through `MIGRATE_DATABASE_URL`, falling back to `DATABASE_URL`. At start-up and at every sign-in the app asks the database who it is (`src/lib/auth/runtime-role-store.ts`): in production sign-in and code redemption are refused while it is the owner or a superuser; in development `/configuration/accounts` says so.
- **Demo and fixture loaders become additive** and never delete trail rows; `demo:wipe` is retired.
- **`AuditEntry.sourceAddress` stays permanent**, because NFR-AUD-001 requires the source address on each entry. Its disposal belongs to NFR-RET-001's per-record-class schedule; the privacy notice says so (threat model B17).

**D12. Signed acts versus acts recorded on someone's behalf. One central record per act.**

```
ActAttribution {
  organisationId, entity, entityId, slot,
  subjectPersonId,
  recordedByPersonId? | recordedBySupplierAccountId? | recordedBySystemLabel?,
  mode SIGNED | RECORDED_ON_BEHALF,
  stepUpAt?, sessionId?, paperReference, reason, at
}
@@unique([entity, entityId, slot])
```

- CHECKs:
  - `SIGNED` requires the recorder to be the subject;
  - exactly one recorder is set (a person, a supplier account, or a system label, so that demo, fixture and migration acts are attributed honestly);
  - `RECORDED_ON_BEHALF` requires `paperReference` or `reason`.
- Each row is written in the same transaction as the act and its audit row, by one writer, `attributeAct`.
- **Separation-of-duties checks run against both people:** the signed-in actor and the attested person the act is recorded for (self-approval, requester is not the approver, endorser, opening-panel independence, delegation to self, FR-APR-009 conflict).
- **The committee votes route** stops reading `personId` from the request body. The voter is the session's person, or the actor holds the secretariat seat for that sitting; both people are stored.
- A registry, `ACT_SLOTS` in `src/lib/auth/act-slots.ts`, lists each person slot: key, entity, field, whether it is signature-class (approve, sign or unseal), and its label.
  - A schema scan checks that every `Person` relation on a non-configuration model is either in `ACT_SLOTS` or in `NOT_AN_ACT` with a reason.
- **Reading an attribution.** It is never inferred from a date:
  - **attribution row present:** "Signed by X", or "Recorded by Y on behalf of X, not signed".
  - **no row, and the act's audit row unattributed:** "Recorded on behalf of X, not signed (before sign-in)".
  - **no row, but the audit row attributed:** shown as a defect ("Attribution missing").
- **Signature-class acts.**
  - When signed, they require a fresh step-up (D13).
  - Recording one on someone's behalf (a paper decision) needs `acts.recordOnBehalf`, a paper reference, and `SecurityPolicy.paperSignatureRecording = ALLOWED`. While that switch is unset, the act is refused and the message says the setting is not set.
- Other acts may be recorded on someone's behalf as they are today. The recorder is now the actor.
- *As built (Phase 2a):* `ActAttribution` is append-only (migration `20261007130200`, the Phase 1d trigger, and no UPDATE, DELETE or TRUNCATE for the app's login), the subject may also be a supplier account (`subjectSupplierAccountId`, exactly one subject), and the one writer is `attributeAct` in `attribution-store.ts`. The schema scan in `act-slots.test.ts` found 129 person slots over 100 models and 21 Person relations that are not acts; the ADR's "about 60" was an estimate.
- The three scattered labels become one module: `ON_BEHALF` in certificate labels, `RECORDED_ON_BEHALF` in document labels, and the literal in `rejection-store.ts`.
- **Why one central table:**
  - It covers roughly 60 person slots across roughly 50 tables, and future acts.
  - Old acts need no backfill: no row means "before sign-in", which is honest.
  - There is one writer, one reader and one set of CHECKs.
- **Cost:** there is no foreign key to the act row, which is the same trade-off `AuditEntry` already makes. Act rows are `Restrict` and attributions are never deleted. If per-table columns are wanted later, they can be backfilled from this table.

**D13. Re-authentication (NFR-SEC-006), without a second factor.**
- Signature-class forms carry a password field. `stepUp(actor, password)` checks it.
- A failed check counts towards lockout and writes `STEP_UP_FAILED`.
- A success writes the session's `stepUpAt` and stamps it on the `ActAttribution` row.
- **There is no time window and no `stepUpWindowSeconds` setting.** The password is asked at every approval, signature and unseal, at matrix issue and at the checker's decision on a change, because the specification requires re-authentication at each action. A second sign-in factor, when the founder authorises one, attaches at this same step.

**D14. SULIT reads.**
- Each `SULIT_FIELDS` entry gains a `scope`: `exercise`, `requisition`, `contract`, `supplier` or `evaluation`.
- One pure rule, `sulitAccess(actor, ctx, field) → { state: GRANTED | WITHHELD, basis }`, grants access when the actor is not an administrator and one of these is true:
  - **Named on the record.** The actor is a participant, an evaluation team member, on the opening panel, the person in charge, the proposal reviewer, on the routed step's holders, or holds a committee seat for the tabled matter. Each scope has its own resolver.
  - **Organisation-wide permission.** The actor holds `sulit.read.organisation` and the exercise is not restricted. The permission is undecided by default, which is refused and shown as undecided. For the scopes with no record of who is named (requisition, contract matter, supplier) it is the only route in. Administrators are always refused.
  - **Restricted exercises (FR-MTD-007).** If `SourcingExercise.restricted` is set, only named people are granted. `sulit.read.organisation` does not open a restricted exercise.
- Loaders return `Sulit<T>`, never the bare value. The shared `SulitValue` component renders "SULIT · withheld" or the value.
- Every SULIT field rendered, allowed or refused, writes a `SulitAccessEvent`: actor, record, field set, outcome and basis. Within one request it is de-duplicated with `cache()`.
- Exports, reports and search call the same rule. Every export with a SULIT column is audited and limited to entitled users; the audit export needs `audit.read`.
- The sealed company estimate (ADR 0012) stays sealed whoever is signed in.
- *As built (Phase 3a, `src/lib/auth/sulit-access.ts`, `sulit-store.ts`, `src/app/_auth/sulit.ts`):*
  - **The rule is `sulitAccess(actor, ctx, field)`.** It refuses a loader run (not a person), then an administrator, then grants a person named on the record, then refuses a restricted exercise the person is not named on, then grants the organisation-wide permission, and otherwise says why it refused: undecided, withheld from a role they hold, or held only for a department. A field is read only on the kind of record the registry names (`SULIT_FIELDS[].scope`, with `alsoIn` where a second kind carries it: the department estimate sits on a requisition and is copied onto its exercise).
  - **Named on an exercise** is its participants, its person in charge, its proposal's reviewer, its evaluation team (any version) and its opening panel (any opening). The `evaluation` scope is narrower: its team, the participants and the person in charge. Holders of a routed step and holders of a committee seat are **not** named by holding the office: the exercise must name them as participants (open for the product owner, logged with Phase 3a).
  - **`Sulit<T>`** carries no value when withheld. `SulitValue of={...}` draws the figure with a lock whose tooltip says why the reader may see it, or "SULIT · withheld" with the reason in words. The older children form stays for the values no loader judges yet; 3b retires it.
  - **The log (`SulitAccessEvent`)** is written for every field asked of a record, allowed or refused, and for a restricted exercise reached by its id. It is de-duplicated within a request. If it cannot be written the value is withheld. It is append-only (migration `20261008110200`), and its CHECKs hold the scope and basis to closed lists a test compares with the code.
  - **A restricted exercise (FR-MTD-007)** is refused where it is reached, not screen by screen: `withLockedRequisitionForSourcing` (every write to an exercise, its window, documents, scope and evaluation) and `withLockedAwardFor` answer "gone" and log; lists, counts, the dashboard, the feed, the approvals queue, the waiting-to-be-tabled list, the supplier register and the requisition's sourcing tab leave it out; a tabled matter of one keeps its place on the sitting and loses what names it. `exercise-scan.test.ts` holds every reader of exercises to a guard or to a named reason. A contract formed from a restricted exercise is not hidden (open for the product owner).
  - **A restricted exercise is never left with nobody who can see it:** whoever makes or edits an exercise so that its method restricts it is named on it, and the last person named cannot be removed.
  - **The company estimate (FR-EST-008)** is decided by `estimateAccessFor` (`src/lib/scope/estimate-access.ts`): sealed to everyone until the opening discloses it; then read by its preparer and the holders of the custodian and audit offices (`ScopePolicy`), an office held for a department counting only for that department's estimates, the nearest unit with a holder winning; either office unset, or no time zone, refuses and says which; an administrator is refused. It reads no figure.

**D15. Maker-checker.**
- **Approval matrix:** draft, then issue.
  - Each draft edit writes an `AuthorityMatrixMaker(matrixId, personId)` row through `noteMaker`.
  - Issuing needs `configuration.issue` and an issuer who is not among the makers. The issue writes `issuedByPersonId`.
  - Drafts that exist at migration get `makersUnknownAtLanding = true`. This is set once by the backfill, following the `recommendationTextOnlyAtLanding` precedent. Such a draft must first be adopted: an attributed edit, or an explicit "adopt" act that makes the actor a maker. Then a different person issues it.
- **Other high-risk configuration** goes through one generic `ConfigurationChange` record:
  - Fields: `kind`, `payload`, a `before` snapshot, `proposedBy`, `decidedBy`, and status `PROPOSED → APPLIED | DECLINED | WITHDRAWN | STALE`.
  - Proposer and decider must be different people. The decider needs the kind's permission.
  - Applying re-validates the payload. If the current values no longer equal `before`, the change becomes `STALE`.
  - Kinds in Phase 2c: `SECURITY_POLICY`, `PERMISSION_GRANT`, `ADMINISTRATOR_GRANT`, `ADMINISTRATOR_REVOKE` and `ACCOUNT_CODE` (activation or reset of the account of a Person who holds an office, seat or delegation; the second person issues the code and is shown it, D6). Phase 5a adds quorum (FR-CTE-003), the opening panel size, classification downgrades (BD-DS-11), the 6.12 corrections (`correctBaseline`, `correctAwardTerm`) and the BD-24 award-return correction; Phase 5b moves every remaining Configuration section onto it, people and assignments included.
- OQ-1 is settled by the specification (NFR-USE-004, NFR-SEC-004): maker-checker applies to every configuration editor. Transactional acts (window extensions, bid handling) are signed and attributed, with no second person.
- An organisation with one administrator cannot grant or issue, and the screen says a second person is needed. The product never fakes a second approval.

**D16. Sign-in events.**
- Each event is an append-only `SignInEvent` row: store, account (if matched), kind and time. It is fully permanent.
- **O-1, retention of personal data against an append-only table.** The source address and user agent are kept in a side table, `SignInEventDetail`, keyed by the event id, so that the permanent row holds no address. The side table's trigger always refuses UPDATE; refuses DELETE unless the row is older than `SecurityPolicy.signInDetailRetentionDays`; and refuses every DELETE while that setting is unset. This applies to every database login, including the owner: nobody is exempt, and there is no maintenance role. The app's login has no UPDATE, DELETE or TRUNCATE on the side table. A purge is a command-line run by the operator (no scheduler); it deletes the expired rows and writes one SYSTEM audit row recording the cutoff and the count, so the gap shows honestly. The purge command is built only after Phase 2c, when a change to the security policy needs a second person.
- `signInDetailRetentionDays` is nullable with no default. While unset the screen says "Retention period not set — sign-in addresses are kept". It must be at least the address-throttle window, or the throttle would lose its own evidence. Address fields on `StaffSession` are ordinary editable rows under the same setting. Legal hold (NFR-RET-002) is not built, and the screen says so beside the setting.
- The address throttle counts failed `SignInEvent` rows joined to their detail rows for the window; a detail row is never removed inside that window.
- `/account` and the first page after sign-in show the previous sign-in time and address and the failed attempts since then (O-2 compensating control).
- Event kinds:
  - `SIGNED_IN`, `FAILED`, `LOCKED_OUT`, `THROTTLED`, `SIGNED_OUT`
  - `IDLE_EXPIRED`, `ABSOLUTE_EXPIRED`, `REVOKED`
  - `PASSWORD_CHANGED`, `CODE_ISSUED`, `CODE_USED`
  - `STEP_UP_OK`, `STEP_UP_FAILED`
  - `ACCOUNT_CREATED`, `ACCOUNT_DISABLED`, `UNLOCKED`
- Changes to an account row are also written to `AuditEntry`.

**D17. Security policy is configuration, per organisation.**
- `SecurityPolicy` holds:
  - `staffIdleMinutes`, `staffAbsoluteMinutes`, `supplierIdleMinutes`, `supplierAbsoluteMinutes`;
  - `maxConcurrentSessions`, `concurrentSessionAction`;
  - `maxFailedAttempts`, `lockoutMinutes`, `addressThrottleAttempts`, `addressThrottleMinutes`;
  - `passwordMinLength`, `resetCodeValidityMinutes`;
  - `paperSignatureRecording`;
  - `signInDetailRetentionDays` (O-1).
- Every column is nullable, with a CHECK range and no default.
- If any setting sign-in needs is unset, sign-in refuses and names the setting.
- Changes go through `ConfigurationChange` (`SECURITY_POLICY`).

**D18. The first administrator is created with a command.**
- `npm run auth:bootstrap` runs `scripts/bootstrap-administrator.ts`, run by an operator with server access.
- It reads every value from the terminal (the password without echo) and ships no default, name or password:
  - the organisation code, which must already exist;
  - an existing Person, or the details for a new one;
  - the sign-in name and password;
  - the `SecurityPolicy` values, if they are unset.
- It refuses a Person who holds any office (D9).
- It refuses to run when an administrator already exists unless `--additional` (a second administrator, which maker-checker needs) or `--recover` (a locked-out sole administrator) is given. The flag goes into the audit label.
- Its help text states `concurrentSessionAction` and `paperSignatureRecording` neutrally as the customer's choice and advises neither (OQ-3, OQ-4).
- Each run writes `AuditEntry` rows with `actorKind SYSTEM` and the label "bootstrap command" (with the flag, if any).

**D19. Out of this phase, by user ruling.**
- TOTP and any second factor, until the founder's own go-ahead. NFR-SEC-005's MFA clause is recorded as **not met**, and its directory half is also not met (INT-14). **Risk R-1** is accepted for the build and for internal acceptance runs only (open item O-2). Going live without a second factor stays a go-live condition: it needs the founder's go-ahead and RSAJ's written acceptance of the gap.
- Compensating controls required before any go-live: the password asked again at every approval, signature, unseal, matrix issue and checker decision with no time window; account lockout and address throttling counted in the database; session idle and absolute limits and a concurrent-session limit (unset means sign-in is refused); every request re-checks the account, the Person and their roles; a sessions list with "sign out everywhere"; resets for office holders need a second person and nobody resets their own account; the reset notice at next sign-in; `/account` and the first page after sign-in show the previous sign-in time and address and the failed attempts since. No shorter idle limit for approvers (threat model B4): the password at every act already stops a stolen session approving.
- `/configuration/security` shows the notice "Second sign-in step not built — approvers sign in with a password only (NFR-SEC-005 not met)."

### Consequences

- The "recorded on behalf of" picker disappears from acts the actor performs themselves. It stays, now with the actor as recorder, only where an act is genuinely recorded from paper.
- `/approvals` can show "my steps".
- Self-approval and conflict checks finally see the real actor.
- FR-APR-011 becomes partly enforceable: the grantor is now the signed-in actor. Reporting lines (FR-APR-010/011) are built in Phase 3c as configuration per organisation and left **unset**: while unset, the superior and line-subordinate checks stay as `faultsIn` says, the screen says "reporting line not set", and a step is never silently promoted.
- Every screen and loader now takes an actor. That is a large, mechanical change, driven by compile errors and the scans.
- The demo and fixture loaders must pass a `SYSTEM` actor.
- Ruled out:
  - a maintenance role that the append-only trigger lets through (O-1): a bypass breaks the no-bypass rule of D11;
  - stateless JWT sessions: no revocation and no idle timeout;
  - a hosted identity provider: forbidden;
  - Auth.js: a new dependency whose credentials mode discourages database sessions;
  - Postgres row-level security for now: the existing nested `$transaction` usage conflicts with a per-request `SET LOCAL` transaction, child tables have no `organisationId`, and it would mean about 470 models' worth of policies. It can be revisited with a superseding ADR if shared hosting is sold;
  - a Prisma extension that adds `organisationId` automatically: it cannot cover child tables;
  - reusing `Capability` for product permissions: it is customer vocabulary with provenance.
- Still blocked after this ADR:
  - 6.15c (NFR-SEC-003, FR-BID-001, the sealed bid in FR-VND-013, FR-BID-008, the electronic half of FR-DOC-009, the unseal half of FR-OPN-003): needs D6, the SK002 §7.7 amendment and an outside cryptography review;
  - paying for tender documents online (INT-10), sending email or SMS (INT-09), signing in through a corporate directory (INT-14), registry checks (INT-11, which stay manual).
  - FR-VND-005 is not blocked: it is a SULIT bank-details form the vendor fills in, and needs no payment service. FR-VND-012 is built up to payment: the vendor can request documents and sees the FR-ADV-010 pre-sale checks, and `electronicDocumentRelease` is left unset.
- **Go-live conditions:** a review by the security auditor and an outside review; a public-copy database role (SELECT on portal views only); RSAJ's written acceptance of the missing second factor and the founder's go-ahead (D19); the one-organisation-per-database limit holds until the cross-organisation suite covers every action (D10).

---

## Schema additions

Every change is additive, and each new enum value lands in its own migration (BD-613-112).

| Model | Key fields |
|---|---|
| `StaffAccount` | `organisationId`, `personId @unique`, `loginName`, `loginKey @unique`, `passwordHash`, `passwordChangedAt`, `mustChangePassword`, `isAdministrator`, `status ACTIVE\|DISABLED\|PENDING_ACTIVATION`, `failedAttempts`, `lockedUntil?`, `lastSignInAt?`, `disabledAt?`, `disabledReason`, `resetNoticePending` |
| `SupplierAccount` | the same shape with `contactId @unique` (to `SupplierContact`) and `supplierId`, but no `isAdministrator` |
| `StaffSession`, `SupplierSession` | as in D4; `tokenHash @unique`; index on `(accountId, revokedAt)` |
| `OneTimeCode` | `store`, `staffAccountId?`, `supplierAccountId?` (CHECK: exactly one; the supplier FK arrives with the supplier tables), `purpose`, `codeHash`, `expiresAt`, `usedAt?`, `issuedByPersonId`, `reason`, `identityCheck` |
| `SecurityPolicy` | `organisationId @unique`, fields as in D17 |
| `RolePermission` | `organisationId`, `permissionKey`, `roleCode`, `decision`, `@@unique([organisationId, permissionKey, roleCode])` |
| `ActAttribution` | as in D12, with `recordedBySystemLabel?` |
| `AuthorityMatrixMaker` | `matrixId`, `personId`, `firstAt`, `@@unique([matrixId, personId])` |
| `AuthorityMatrix` changes | adds `issuedByPersonId?` and `makersUnknownAtLanding Boolean @default(false)` |
| `ConfigurationChange` | as in D15 |
| `SignInEvent` | append-only, trigger-guarded; store, account?, kind, time. No address. |
| `SignInEventDetail` | keyed by the event id; `sourceAddress`, `userAgent`. Trigger: UPDATE always refused; DELETE refused unless older than `SecurityPolicy.signInDetailRetentionDays`, and always while it is unset. No UPDATE, DELETE or TRUNCATE for the app role. |
| `SulitAccessEvent` | append-only, trigger-guarded (Phase 3a) |
| `AuditEntry` changes | adds `actorKind?`, `actorSupplierAccountId?`, `actorSystemLabel?`, `actorSessionId?`, `actorOffices Json?`, `sourceAddress?`, with the CHECK from D11 |
| `DocumentAccessEvent` changes | adds `actorKind?`, `actorPersonId?`, `actorSupplierAccountId?` |
| Enums | `ActorKind`, `AccountStatus`, `SessionRevokeReason`, `CodePurpose`, `SignInEventKind`, `ActMode`, `ConfigurationChangeKind`, `ConfigurationChangeStatus`, `PermissionDecision`, `ConcurrentSessionAction`, `PaperSignatureRecording`, `SulitOutcome` |

## Migrating existing data

There is no reset. Existing rows are touched in only one place.

- **People without accounts** stay as they are. Administrators create accounts over time. A Person without an account can still be the subject of an act recorded on their behalf.
- **Existing audit rows** are not touched. The new columns are null, and `unattributed = true` stays true; the CHECK holds for them as they are. The append-only trigger is installed after the column migration.
- **Existing acts** get no `ActAttribution` row, so they read "(before sign-in)" (D12).
- **Draft matrices** are the one backfill: `makersUnknownAtLanding = true`, set once by the migration.
- **Organisation:** `ORGANISATION_CODE` keeps naming the public copy's organisation. Organisations that already exist need `npm run auth:bootstrap` after deployment. Until it has run, `/sign-in` says so.
- **Demo and fixture loaders** (`prisma/demo-*.ts`, `src/lib/demo`) pass `SYSTEM` actors labelled "demo loader". `demo:results` and the other demo loads must keep working without a wipe.
- **The founder's dev database** is migrated forward with `migrate deploy`. Run the pre-checks for the new CHECK constraints before applying it.

## Contracts (TypeScript)

These are in `src/lib/auth/types.ts`.

```ts
export type PermissionKey =
  | "accounts.manage" | "security.policy" | "permissions.grant"
  | "configuration.draft" | "configuration.issue" | "audit.read"
  | "supplierAccounts.manage" | "sulit.read.organisation" | "acts.recordOnBehalf";

export interface StaffActor {
  kind: "STAFF"; accountId: string; sessionId: string;
  personId: string; personName: string; isAdministrator: boolean;
  organisationId: string; organisationCode: string; organisationTimeZone: string | null;
  offices: readonly { roleCode: string; scope: string | null }[];
  permissions: ReadonlySet<PermissionKey>;
  stepUpAt: Date | null; sourceAddress: string | null;
}
export interface SupplierActor {
  kind: "SUPPLIER"; accountId: string; sessionId: string;
  contactId: string; supplierId: string; organisationId: string; sourceAddress: string | null;
}
export type AuditActor =
  | { kind: "STAFF"; personId: string; sessionId: string; offices: StaffActor["offices"]; sourceAddress: string | null }
  | { kind: "SUPPLIER"; supplierAccountId: string; sessionId: string; sourceAddress: string | null }
  | { kind: "SYSTEM"; label: string };

// src/app/_auth/actor.ts
requireStaff(opts?: { permission?: PermissionKey }): Promise<StaffActor>;   // pages: redirect("/sign-in"); actions: throws AuthRefusal → FormState
requireSupplier(): Promise<SupplierActor>;
stepUp(actor: StaffActor, password: string): Promise<{ ok: true; at: Date } | { ok: false; message: string }>;
toAuditActor(actor: StaffActor | SupplierActor): AuditActor;

// src/lib/auth (pure)
verifyPassword(stored: string, given: string): Promise<{ ok: boolean; needsRehash: boolean }>;
sessionVerdict(s, policy, now): "VALID" | "IDLE" | "ABSOLUTE" | "REVOKED" | "POLICY_NOT_SET";
lockoutVerdict(account, recentAddressFailures, policy, now): "ALLOW" | "LOCKED" | "THROTTLED";
resolvePermissions(assignments, grants, isAdministrator, today): Set<PermissionKey>;
administrationConflict(input): null | { code: string; message: string };
sulitAccess(actor, ctx, field): { state: "GRANTED" | "WITHHELD"; basis: string };
makerCheckerFault(makers, makersUnknown, issuerPersonId): null | { code; message };
attributionLabel(row: ActAttribution | null, auditAttributed: boolean): { state: "SIGNED" | "ON_BEHALF" | "LEGACY" | "MISSING"; en; ms };
```

## What sign-in unblocks: inventory

- **Unblocked by sign-in, so built in this phase:**
  - NFR-SEC-001, 002 (the restriction half), 004, 006
  - NFR-AUD-001 (actor, role held, source address) and NFR-AUD-004
  - FR-APR-020 maker-checker at issue
  - 6.10 controlled quorum change (on `ConfigurationChange` in Phase 5a)
  - FR-MTD-007: hiding and access logging
  - the 6.7 authorisations and 6.8 scoring, now signed
  - the per-actor `/approvals` queue, with an in-product count rather than email
  - FR-APR-017 originator recall
  - the 6.10 tabler and secretariat checked against the actor
  - FR-DOC-011 endorser and FR-DOC-014 assurance actor checked
  - 6.11 IC-number masking turned into real restriction
  - 6.15b: FR-VND-001 with an account, FR-VND-004 to 008, 011, 013 (attendance, acknowledgement, own-bid status; not the sealed bid) and 014, FR-DOC-010 inspection log, FR-AWD-010 (with the D7 switch left unset), and notices shown in the portal (no email). FR-VND-012 was listed here in the first draft in error: it is built up to payment only.
  - every "not restricted until sign-in" or "recorded on behalf" label replaced
- **Partly unblocked:**
  - FR-APR-011: the grantor is now known; reporting lines are built as configuration and left unset (Phase 3c).
  - NFR-SEC-005: separate stores yes; MFA not met, by user ruling.
  - Savings on `/reports`: reporting is out of this build.
- **Still blocked:**
  - 6.15c: NFR-SEC-003, the FR-VND-013 sealed bid, FR-BID-008, and the electronic half of FR-DOC-009. These need D6, the SK002 §7.7 amendment and electronic opening.
  - Online document purchase (INT-10), email and SMS (INT-09), directory sign-in (INT-14).

## Component list, in build order

**Phase 1: accounts, sign-in and sign-out, the actor in the audit trail, tenant isolation**

1. **data-modeler:** the Phase 1 models and enums, including `SignInEventDetail` and `SecurityPolicy.signInDetailRetentionDays` (the O-1 split lands in the first migration). `RolePermission`, `ActAttribution`, `AuthorityMatrixMaker` and `ConfigurationChange` come in Phase 2. One migration per enum value. The `AuditEntry` columns and CHECK, then the append-only trigger migration.
2. **domain-engineer:** `src/lib/auth/types.ts` (the contracts above, written first) plus these pure modules, each with tests:
   - `password.ts` (scrypt in PHC format, re-hash check, length rule)
   - `session-rules.ts`
   - `lockout.ts`
   - `codes.ts` (generate, hash, format)
   - `policy.ts` (which `SecurityPolicy` settings are unset)
3. **api-engineer:**
   - `src/lib/auth/session-store.ts` (database I/O)
   - `src/app/_auth/actor.ts` (`requireStaff`, `requireSupplier`, `cache()`, cookies)
   - `src/lib/auth/origin.ts` (`assertSameOrigin`)
   - `src/lib/auth/identity.ts` (the `IdentityProvider` façade and the two local adapters)
4. **api-engineer:** `writeAudit` and the `audited*` helpers take a required `actor`. Thread `toAuditActor(actor)` through every caller, using the compile errors as the list. Add the `SYSTEM` actor to the demo loaders.
5. **api-engineer:** replace `ORGANISATION_CODE` with `actor.organisation*` in the 85 files. Add the organisation filter to every load by id in actions and route handlers.
6. **test-engineer:**
   - `auth-reach.test.ts`: every action and route handler calls `requireStaff` or `requireSupplier` first, or is listed with a reason.
   - `tenant-scan.test.ts`: the organisation-filter scan and the `ORGANISATION_CODE` import ban.
   - a two-organisation fixture and the cross-tenant suite.
7. **api-engineer:** `src/proxy.ts` gets the optimistic cookie check and the refusal of the wrong store's cookie. `surface.ts` gets the literal supplier auth paths. Extend `proxy.test.ts` and `surface.test.ts`.
8. **devops-engineer:** `scripts/bootstrap-administrator.ts` and `npm run auth:bootstrap`. Document `TRUSTED_PROXY_HOPS`, the HTTPS requirement, and a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
9. **frontend-engineer:** all on the shared design system.
   - `/sign-in`, `/sign-in/code` (use a reset code)
   - `/account` (change password, sessions, sign out everywhere)
   - `/configuration/accounts` (create, disable, unlock, issue a code shown once)
   - the user menu in the shell, replacing the greeting and `PEROLEHAN_GREETING_NAME`
   - History shows the actor
10. **security-auditor:** review of Phase 1 before Phase 2 starts.

**Phase 2: authorisation, administrator separation, maker-checker, re-authentication, signed acts**

11. **data-modeler:** `RolePermission`, `ActAttribution`, `AuthorityMatrixMaker`, the new `AuthorityMatrix` columns with the `makersUnknownAtLanding` backfill, and `ConfigurationChange`.
12. **domain-engineer:**
    - `permissions.ts` (`resolvePermissions`)
    - `administration.ts` (`administrationConflict`)
    - `act-slots.ts` (the `ACT_SLOTS` registry, plus a schema scan over `Person` relations)
    - `attribution.ts` (the writer `attributeAct` and `attributionLabel`); retire `ON_BEHALF`, `RECORDED_ON_BEHALF` and the literal in `rejection-store.ts`
    - `maker-checker.ts`
    - `configuration-change.ts` (a parser and applier per kind, and the staleness check)
13. **workflow-engineer:** the matrix issue path (makers and adoption). The `ConfigurationChange` lifecycle for the five Phase 2c kinds (the quorum change moves onto it in Phase 5a).
14. **api-engineer:** every act that holds a person slot gets `attributeAct`. Signature-class acts get `stepUp`. Person pickers stay only on acts recorded from paper, gated by `acts.recordOnBehalf` and `paperSignatureRecording`.
15. **frontend-engineer:**
    - the permissions grid gets a "Product permissions" group with three states
    - `/configuration/security`
    - `/configuration/changes`, the two-person queue
    - a password field on signature-class forms
    - the shared attribution component
16. **test-engineer:** tests for each pure rule, both orders for propose and apply, and a scan that every signature-class act calls `stepUp`. **security-auditor:** review.

**Phase 3: SULIT, confidential exercises, and the sign-in-dependent parts of each module**

17. **domain-engineer:** `SULIT_FIELDS[].scope`, `sulit-access.ts` with a membership resolver per scope, and the `Sulit<T>` loader type.
18. **api-engineer:** loaders return `Sulit<T>`, and every access writes a `SulitAccessEvent`. Exports, reports and search call `sulitAccess`. Restricted exercises hide their content from people not named on them.
19. **frontend-engineer:** the `SulitValue` component gets withheld and granted states, and the "until sign-in" chips are removed. Check against `scripts/text-snapshot.mjs`.
20. **workflow-engineer:**
    - "my steps" on `/approvals`, with an in-product count
    - FR-APR-017 originator recall
    - the FR-APR-011 grantor taken from the actor
    - the 6.10 tabler and secretariat checked against the actor
    - the FR-DOC-011 and 014 actors checked

**Phase 4: supplier accounts and 6.15b**

21. **api-engineer:** supplier route handlers at literal paths:
    - `/supplier/sign-in/submit`
    - `/supplier/sign-out`
    - `/supplier/activate/submit`
    - `/supplier/reset/submit`
    - the 6.15b writes

    The supplier repository takes `supplierId` only from `SupplierActor`. The scan from D8 covers this.
22. **workflow-engineer:** accepting a portal application offers an activation code. Retiring a contact disables the account.
23. **frontend-engineer:** `/supplier/sign-in`, `/supplier/activate`, `/supplier/account`, and the 6.15b screens.
24. **security-auditor:** the threat-model checklist, the go-live conditions, and the outside review.

**Phase 5 (OQ-1 settled):** roll `ConfigurationChange` out to every remaining configuration editor.

## Product-owner rulings

- **OQ-1, settled by the specification (NFR-USE-004, NFR-SEC-004):** maker-checker applies to every configuration editor. The matrix, evaluation models and templates use their issue step; everything else goes through `ConfigurationChange`. Transactional acts (window extensions, bid handling) are signed and attributed, with no second person. An organisation with one eligible person is refused and the screen says a second person is needed.
- **OQ-2, open for the product owner and customer:** who is "named on the record" for each SULIT scope (D14). Until decided, the requisition, contract matter and supplier scopes are reachable only through `sulit.read.organisation`, which is undecided and therefore refused.
- **OQ-3 and OQ-4, the customer's choices:** `concurrentSessionAction` and `paperSignatureRecording` are unset switches. The bootstrap help text advises neither.
- **OQ-5 and O-2:** NFR-SEC-005's MFA clause is recorded as **not met, by founder ruling**. It is a go-live condition (see D19).
- **O-1:** the split-table design in D16.
- **O-3:** the rewrite of AGENTS.md, autonomous-build.md and ADR 0019/0020 is held for the founder's review. Builders work under the founder's override (decision of 2026-10-06) until a ruling is made on that text. This ADR does not edit AGENTS.md.
