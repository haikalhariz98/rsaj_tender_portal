# Sign-in programme: plan (Phase 0 to Phase 5)

Status: approved by the product owner as amended, 2026-10-06 (decisions log). Part A is for the founder, Part B for the builders. Companion files: `docs/notes/architecture/0034-sign-in-sessions-authorisation-and-tenant-isolation.md` (the ADR, as amended) and `docs/notes/plans/signin-threat-model.md`. The open items O-1 to O-3 at the end are now ruled; the rulings are in the last section.

The first section below is the planner's note on what it relied on, from the code at HEAD `6546934`.

I wrote the plan below without changing anything in the repository. Six facts it relies on come from the code at HEAD `6546934`, and some of them correct the inputs:

- **The stash touches other files than the inventory says.** `stash@{0}` ("Run 1b C8b WIP") changes `src/app/approvals/actions.ts`, `src/lib/committee/labels.ts` and its test, and `src/lib/contract/lock-order.test.ts`. It does not touch `matter-actions`, `time-actions` or `committees/actions.ts`.
- **The scan targets are smaller than the loose counts suggest.**
  - There are 11 Next route handlers, all under `src/app/**/route.ts`. The six `src/lib/*/route.ts` files are routing modules, not route handlers.
  - Of the 59 files that mention `"use server"`, 54 are server modules. The other five are comments or tests, and none of them holds an inline server function.
  - 85 files under `src/` use `ORGANISATION_CODE`.
- **Numbering is not fully atomic.**
  - `src/lib/numbering/issue.ts` locks correctly.
  - `src/app/committees/actions.ts` reads the series before its transaction (`usable` at line 417) and writes `nextSerial` without locking (about lines 440–448).
  - The `nextSerial` floor check in `src/app/configuration/numbering/actions.ts` (about lines 94–101) runs outside any lock.
- **Next 16 documentation checked.**
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md` (lines 72–83): `cookies().set`/`.delete` work only in Server Functions and Route Handlers.
  - `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` (line 29): the proxy should make only quick cookie checks, not database reads.
  - `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- **The test suite has no database.** `vitest.config` includes only `src/**/*.test.ts` and calls it pure. The only script that touches the database is `scripts/check-numbering-concurrency.ts`.
- **Writes that the new triggers will refuse.**
  - `AuditEntry` rows are deleted by `prisma/demo.ts` and these 11 files: `demo-award`, `demo-bids`, `demo-certificates`, `demo-contracts`, `demo-documents`, `demo-evaluation`, `demo-opening`, `demo-scope`, `demo-suppliers`, `demo-tender-docs`, `demo-window`. Nothing in `src/` deletes an organisation.
  - `src/app/documents/actions.ts:204` sets the withdrawal fields on `DocumentVersion`, so that trigger must still allow those two fields.

---

# PART A — For the founder

## What you will have when this is done

- **Staff accounts.** Every staff member signs in with their own name and password. Each account is tied to that person's existing record.
- **Supplier accounts.** Suppliers sign in on the public portal with a separate account, tied to their registered contact person.
- **Your name on everything.** Every action records who did it, from which address and in which office. An approval or signature asks for the password again at that moment.
- **A permanent history.** The database itself refuses any edit or deletion of the history, even by the app.
- **Two people for configuration changes.** A change to configuration (the approval matrix, policies, permissions, quorum, every Configuration section) is proposed by one person and approved by another.
  - If only one eligible person exists, the change is refused. The screen says a second person is needed.
- **Confidential (SULIT) information shown only to the right people.** That means people named on the record, or holders of a permission your organisation has chosen to grant.
  - Every view and every refusal is logged.
  - Confidential (restricted) tenders are hidden from everyone else.
- **Staff inbox.** "My steps" waiting for you, counts, and notices.
- **Supplier portal (signed in):**
  - application status, company documents and expiry reminders;
  - a bank-details form;
  - the declaration at submission;
  - briefing sign-up and addendum acknowledgement;
  - the status of their own bids;
  - "My Projects" for contractor acts;
  - announcements.
- **Password reset without email.** An administrator hands over a one-time code in person or by phone.
  - Staff who hold an office need a second person to issue it.
  - Nobody can issue a code for their own account.

## What stays blocked, and why

| Blocked | Why |
|---|---|
| Electronic bids, the electronic tender box, sealed online submission, unsealing with two credentials (6.15c) | Needs RSAJ's SK002 §7.7 amendment (decision D6) and an outside cryptography review |
| Sending email or SMS | No messaging service is connected. Notices appear inside the portal, labelled "not sent" |
| Paying for tender documents online | No payment service. A supplier can ask for the documents, and the release switch exists but is left unset |
| Signing in through a corporate directory | Directory not connected; local accounts only |
| Registry checks (SSM, CIDB and similar) | Stay manual |
| Second sign-in step (authenticator app) | Your ruling. The requirement is recorded as **not met** and the risk as R-1. Whether go-live may proceed without it is your decision |

**Settings left for each customer to decide.** These stay unset until the customer chooses, and the screens say so:
- non-award notices (decision D7);
- whether approvals recorded from paper are allowed;
- session limits;
- reporting lines;
- releasing documents after payment.

## Phases, and what you can try after each

There is **no release between Phase 1 and the end of Phase 2.** Until Phase 2 lands, a signed-in user could still name someone else as the person acting.

| Phase | What you can try |
|---|---|
| **0. Housekeeping** | Nothing visible. Paused work is settled; two places that could issue the same number, or save over each other, are fixed. |
| **1. Sign-in** | Create the first administrator from the command line. Sign in, sign out, change your password. Create a colleague's account and give them a one-time code. Every existing screen works once signed in and refuses you when signed out. History shows your name. |
| **2. Signed acts** | Approvals and signatures ask for your password. Acts read "Signed by you" or "Recorded by you on behalf of X". Grant permissions. Propose a policy change and see a second person approve it. Issue the approval matrix only if you did not edit it. |
| **3. Confidentiality and inbox** | Sign in as someone not on a tender and see its SULIT values withheld. Make a tender restricted and see it disappear for others. Your inbox and step counts. Delegation and reporting-line settings. |
| **4. Supplier portal** | A supplier signs in, tracks an application, fills in company and bank details, registers for a briefing, acknowledges an addendum, sees their own bids and projects, and signs a site diary. Announcements come last. |
| **5. Two-person rule everywhere** | Every remaining Configuration section asks for a second person. |

## Decisions the product owner took for you

- Scope is everything waiting on sign-in except the blocked items above. The second sign-in step is out.
- Three corrections to the inputs:
  - FR-APR-010 is escalation to a superior.
  - Personal queues are FR-APR-018.
  - The bank-details form needs no payment service, so it is in.
- Notices are shown in the portal only.
- Non-award notices and document release are built, with their switches left unset.
- Two people are needed for every configuration change, for resets of office holders, and for corrections of recorded money and terms.
- One organisation per database until isolation is proven for every action.
- A separate, restricted database login for the running app, and a history the database itself protects.
- Demo loading becomes additive and never deletes history.
- The rewrite of the project rules (AGENTS.md) is drafted but **held for your own review**. The product owner did not approve it.

**One question for you** (Part B, open item O-1): PDPA expects sign-in logs to be purged when they expire, but the ruling makes those logs undeletable.

---

# PART B — For the builders

## Standing rules for every phase brief

1. **Authority.** The founder's decision of 2026-10-06 (build sign-in and everything waiting on it; no second factor) overrides three rows of AGENTS.md: "No auth, no User model / Do not stub auth", "Maker-checker deferred until sign-in" and "no tenant isolation middleware yet". It also overrides the autonomous-build.md rule "Never: build sign-in, tenancy or maker-checker". Every brief must quote this override, because builders read AGENTS.md through CLAUDE.md.
   - Do **not** edit AGENTS.md. The rewrite goes to a separate draft file (Phase 1d) and is held for the founder.
2. **Use the amended values, not the draft ADR's:**
   - there is no `assurance` field and no `stepUpWindowSeconds`;
   - both cookies are `__Host-`, HttpOnly, Secure and **Lax**, and every POST passes the Origin/Sec-Fetch guard;
   - there is no row-level security, and the deployment is one organisation per database;
   - bootstrap needs `--additional` or `--recover` to run again;
   - `sulit.read.organisation` is undecided by default, which means refused.
3. **Labels.** "ADR-D*n*" means ADR 0034 decision *n*. "Policy D6/D7" means the decisions-log policy items (D6 is electronic submission, D7 is the non-award notice).
4. **Still binding:**
   - no outside service;
   - never reset the database;
   - no literal policy (new policy is a nullable column with no default, and an unset value refuses and says what is unset);
   - `Person` stays identity, separate from sign-in;
   - all money stays `Decimal`;
   - codes never reach a screen;
   - business logic stays pure in `src/lib/**`;
   - UI uses `src/components/ui` only, with no `dark:` variants and icons in `icons.tsx`.
5. **Gates for every phase:**
   - `npm test`, `npm run typecheck` and `npm run lint` all pass.
   - A security review is done against the threat-model checklist for that phase.
   - The sibling-screen check and a diff of `scripts/text-snapshot.mjs` before and after, for any screen touched.
   - Every group J test that changes does so deliberately, never weakened, with its own decisions-log line.
   - A decisions-log entry and a commit on `build-all-modules`.
6. **Tests that need a database.** The vitest suite is pure. Database checks (triggers, roles, the cross-organisation suite, lock races) go in `src/**/*.db.test.ts` under a separate `npm run test:db` config. That config refuses to run unless `TEST_DATABASE_URL` names a database other than `DATABASE_URL`, and it never touches the founder's database. `scripts/check-numbering-concurrency.ts` is the precedent.
7. **Migrations.**
   - Each change is additive, and each new enum value gets its own migration (BD-613-112).
   - Pre-checks run before a new CHECK constraint is applied.
   - The founder's database moves forward by `migrate deploy` only.

---

## Phase 0 — Prerequisites (one build)

**Scope**
1. **Settle `stash@{0}`** ("Run 1b C8b WIP"). It touches `src/app/approvals/actions.ts`, `src/lib/committee/labels.ts` and its test, and `src/lib/contract/lock-order.test.ts`.
   - Apply it on a branch, finish or reconcile it, run the gates and commit.
   - **Do not drop it.** If it cannot be finished, commit it as a parked branch and record that.
   - It must be settled before Phase 2b rewrites `approvals/actions.ts`.
2. **Group E locks.**
   - `saveTimeZone` (`src/app/configuration/organisation/actions.ts:281`): read the organisation inside the transaction, under `SELECT … FOR UPDATE`. Take the "before" snapshot from the row as locked, not from the stale read.
   - `saveMatrix` (`src/app/configuration/approval-matrix/actions.ts:164`): move the duplicate-label and funding checks inside the transaction, after locking the matrix row.
   - `saveRule` (`:327`): move the sibling checks inside, after locking the parent matrix.
   - Follow the order pinned by `lock-order.test.ts` and extend that test to cover these three.
3. **Numbering.**
   - The committee sitting reference (`src/app/committees/actions.ts`, `usable` at line 417, write at about 440–448) must go through `issueReference(tx, …)` inside the transaction.
   - `configuration/numbering/actions.ts` (about lines 94–101): run the `nextSerial` floor check inside the transaction, under the same `FOR UPDATE` on the series row.
   - Add a source scan: no `numberingSeries.update` outside `src/lib/numbering/issue.ts` and the configuration editor.
   - Extend `scripts/check-numbering-concurrency.ts` to cover the sitting path.

**Accept when**
- the stash is gone from the stash list and its work is committed;
- the three save functions run every check under a lock;
- the numbering scan passes and the concurrency script shows no duplicates;
- `lock-order.test.ts` is extended deliberately, with a log line.

**Review checks** that nothing is weakened in `lock-order.test.ts`, that the lock order is consistent, and that no other numbering path exists.

---

## Phase 1 — Accounts, sessions, actor in the audit trail, organisation isolation

The phase is split into 1a to 1d, each one build and one review. **No release** until Phase 2 is complete.

### 1a — Foundation and sign-in screens

**Schema** (migrations, in this order):
- **Enums**, one migration each: `ActorKind`, `AccountStatus`, `SessionRevokeReason`, `CodePurpose`, `SignInEventKind`, `ConcurrentSessionAction`, `PaperSignatureRecording`.
- **`StaffAccount`**: `organisationId`, `personId @unique`, `loginName`, `loginKey @unique` (lower case), `passwordHash`, `passwordChangedAt`, `mustChangePassword`, `isAdministrator`, `status`, `failedAttempts`, `lockedUntil?`, `lastSignInAt?`, `disabledAt?`, `disabledReason`, `resetNoticePending` (drives the next-sign-in notice).
- **`StaffSession`**:
  - `tokenHash @unique`, `accountId`, `organisationId`;
  - `createdAt`, `lastSeenAt`, `absoluteExpiresAt`, `stepUpAt?`;
  - `sourceAddress`, `userAgent`, `revokedAt?`, `revokedReason?`;
  - an index on `(accountId, revokedAt)`;
  - **no `assurance` field**.
- **`OneTimeCode`**: `store`, `staffAccountId?`, `supplierAccountId?` (CHECK: exactly one; the supplier FK is added in 4a), `purpose`, `codeHash`, `expiresAt`, `usedAt?`, `issuedByPersonId`, `reason`, `identityCheck`.
- **`SecurityPolicy`**: `organisationId @unique`. All columns are nullable, with CHECK ranges and no defaults:
  - `staffIdleMinutes`, `staffAbsoluteMinutes`, `supplierIdleMinutes`, `supplierAbsoluteMinutes`;
  - `maxConcurrentSessions`, `concurrentSessionAction`;
  - `maxFailedAttempts`, `lockoutMinutes`, `addressThrottleAttempts`, `addressThrottleMinutes`;
  - `passwordMinLength` (CHECK ≥ 8), `resetCodeValidityMinutes`;
  - `paperSignatureRecording`;
  - **no `stepUpWindowSeconds`**.
- **`SignInEvent`**: store, account (if matched), kind, time. Append-only; its trigger lands in 1d. **Per O-1, the source address and user agent are not on this row:** they go in `SignInEventDetail` (keyed by the event id; its trigger lands in 1d), and `SecurityPolicy` gets the nullable `signInDetailRetentionDays` (CHECK at least the address-throttle window). Both land in the 1a migration. 1a's `/account` and first page after sign-in also show the previous sign-in time and address and the failed attempts since (O-2).
- **`AuditEntry`**: add the nullable columns `actorKind`, `actorSupplierAccountId`, `actorSystemLabel`, `actorSessionId`, `actorOffices Json`, `sourceAddress`. Add the CHECK: `actorKind IS NULL ⇔ unattributed`, and exactly one actor reference matches the kind. Run the pre-check first: every existing row must have `unattributed = true` and a null `actorPersonId`.

**Pure modules** in `src/lib/auth/`, each with tests:
- `types.ts`: the ADR contracts, minus `assurance` and `stepUpWindowSeconds`.
- `password.ts`:
  - scrypt in PHC format, `ln=15,r=8,p=3`, `maxmem` 64 MiB;
  - a needs-rehash check;
  - length from 8 (or policy) to 256, not equal to the sign-in name, no composition rules.
- `session-rules.ts` (`sessionVerdict`)
- `lockout.ts` (`lockoutVerdict`)
- `codes.ts`: 128 bits, base32 groups, SHA-256.
- `policy.ts`: lists the unset settings sign-in needs.

**I/O**
- `src/lib/auth/session-store.ts`
- `src/lib/auth/identity.ts`: the `IdentityProvider` façade, with a `StaffCredentials` adapter only. `SupplierCredentials` comes in 4a. The directory adapter is named and left unconfigured.
- `src/lib/auth/origin.ts` (`assertSameOrigin`): Sec-Fetch-Site same-origin, Origin matches Host, and `application/json` or form content type as the route declares. `text/plain` is refused.
- `src/lib/auth/hash-pool.ts`: at most 4 concurrent hashes.

**Actor helper** — `src/app/_auth/actor.ts`:
- `requireStaff(opts?)`: wrapped in `cache()`.
  - In a page it calls `redirect("/sign-in")`.
  - In an action it throws `AuthRefusal`, which maps to a `FormState`.
- `toAuditActor`
- `currentStaffOrNull`, for the shell.

Do **not** use the experimental `unauthorized()` or `forbidden()`.

**Bootstrap** — `scripts/bootstrap-administrator.ts`, run as `npm run auth:bootstrap`:
- **Inputs.** Reads everything from the terminal, with no echo for the password, and ships no defaults. The organisation must already exist. It takes an existing Person or new Person details, refuses a Person who holds any office, seat or delegation, and asks for any unset `SecurityPolicy` values.
- **Re-running.** It refuses to run when an administrator exists, unless `--additional` or `--recover` is given. The flag goes into the audit label ("bootstrap command (--additional)"). Each run writes `actorKind SYSTEM` audit rows.
- **Help text.** States `concurrentSessionAction` and `paperSignatureRecording` neutrally as the customer's choice, advising neither (OQ-3, OQ-4).

**Screens** (on the design system, using `PageHeader`, `Card`, `Field` and the other shared components):
- `/sign-in`: says "No administrator yet: run `npm run auth:bootstrap`" when none exists. Names any unset policy setting.
- `/sign-in/code`: use a one-time code.
- `/account`: change password, list of sessions, sign out everywhere, and the "your password was reset" notice.
- Sign-out is a POST.
- The shell user menu replaces the `topbar.tsx` "Sign-in not built yet" text, `PEROLEHAN_GREETING_NAME` and `src/lib/shell.ts:58`.

Existing screens stay unguarded in 1a.

**Security tests**
- The token differs before and after sign-in (fixation).
- A forged or expired cookie is refused.
- Idle and absolute expiry work.
- Sign-out revokes the row.
- The same message and similar timing for an unknown name and a wrong password (dummy hash).
- Lockout and address throttle count from the database, and the lock ends when its window does.
- Unset policy refuses sign-in.
- The concurrent-session limit follows each action.

**Accept when** an operator can bootstrap, sign in, see `/account`, change the password and sign out, and every `SignInEvent` kind used so far is written.

### 1b — Guard everywhere, actor in every audit row, account administration

- **Guards.** `requireStaff()` is called first in:
  - every export of the 54 `"use server"` modules (use `src/lib/scan/source.ts` `isServerModule`);
  - all 11 `src/app/**/route.ts` handlers, scanned under `src/app` only, since `src/lib/*/route.ts` are not handlers;
  - every staff page and layout loader.
- **`PUBLIC_ENTRY_POINTS`** lists, with reasons:
  - `supplier/register/submit`
  - `organisation/logo/[sha]`, if it is public
  - the sign-in routes
- **Every POST route handler** calls `assertSameOrigin`. This covers `votes`, `method/determine` and `briefing attendance`; it replaces the header check in `api/documents`.
- **Server actions.** Set `serverActions.allowedOrigins` explicitly; document it.
- **Audit.** `writeAudit` and every `audited*` helper take a **required** `actor: AuditActor`. The compile errors are the checklist.
  - `unattributed = false` only when there is a session.
  - `sourceAddress` is taken from `X-Forwarded-For` only when `TRUSTED_PROXY_HOPS` is set.
  - `actorOffices` holds the role assignments in force on the organisation's today (`todayIn`).
- **Demo and fixture loaders** (`prisma/demo*.ts`, `src/lib/demo`) pass `{kind:"SYSTEM", label:"demo loader"}`.
- **Form-picked people stay for now.** Form-picked `*PersonId` fields remain as the attested person until 2b. Do not remove pickers yet.
- **Proxy** (`src/proxy.ts`, `src/lib/portal/surface.ts`):
  - stays database-free and makes only the quick cookie check;
  - on the internal copy, a page request with no staff cookie goes to `/sign-in`, and a POST with none gets 401;
  - a staff cookie is refused on the public copy, and a supplier cookie on the internal one;
  - `/sign-in` returns 404 on the public copy;
  - `PORTAL_SURFACE` is kept.
- **`/configuration/accounts`** (requires `isAdministrator` until permissions arrive in 2a):
  - create an account for a Person;
  - disable an account (revokes its sessions in the same transaction);
  - unlock (audited);
  - issue an activation or reset code, shown once, with a reason. **No administrator issues a code for their own account.** The target gets `resetNoticePending`.
  - Making a Person inactive disables their account and revokes their sessions in the same transaction.
- **History** drawer and audit export show the actor. Rows from before sign-in keep "Not attributed — before sign-in". The wording changes in `history-drawer.tsx:103` and `audit/export.ts:103`.
- **Group J tests changed:** `audit/export.test.ts`, `entity-labels.test.ts`, `component-hints.test.ts` (shell wording), `proxy.test.ts` and `surface.test.ts` (extended).
- **Security tests:**
  - `auth-reach.test.ts`: the guard comes first, or the entry is listed.
  - CSRF: every POST route refuses a cross-site request and a `text/plain` body.
  - A disabled person's session fails on the next request.
  - An administrator issuing a code to themselves is refused.
  - Audit rows carry the session actor.
  - Bootstrap refuses without its flag.
- **Accept when:**
  - every existing screen works for a signed-in staff user, with the text-snapshot diff showing only the shell and attribution wording changed;
  - signed-out requests are redirected or refused;
  - a second administrator has been created with `--additional`, and the acceptance run uses both.

### 1c — Organisation isolation (ADR-D10)

- `actor.organisationId` and `organisationCode` replace `ORGANISATION_CODE` in the 85 `src/` files. It stays only in `src/lib/portal/**`, `prisma/` and `scripts/`, and a scan bans any other import.
- **Fix the unfiltered lookups.** `src/lib/window/read.ts:430,478,490` use an unfiltered `db.organisation.findFirst()`. Pass the organisation id instead.
- **Filter every load by id** in actions and route handlers:
  - add `organisationId: actor.organisationId` to the `where`;
  - for the child tables (`RoleAssignment`, `ApprovalStep`, `RoleCapability`, `ExerciseParticipant`, `CommitteeMember`), filter through the parent, e.g. `approvalStep.findFirst({ where: { id, instance: { organisationId } } })`.
  - A row from another organisation reads as "no longer exists".
- **`tenant-scan.test.ts`**: flags `findUnique`, `findFirst`, `update`, `delete` and `upsert` keyed by `id` without an organisation filter. Exceptions are marked `// tenant: via <parent>` and named in its allow-list.
- **`test:db` checks**: a two-organisation fixture and a cross-organisation suite, in which organisation B's actor against organisation A's ids gets a refusal. Record its coverage as a list of actions.
- **Accept when** the scan and the suite pass. The decisions log records that the supported deployment is **one organisation per database** until the suite covers every action.

### 1d — Audit integrity, app database role, docs drafts

- **Migration:** `AuditEntry.organisation` changes from `Cascade` to **`Restrict`** (`prisma/schema.prisma:1598`).
- **Migration — refusal triggers, with no bypass:**
  - `BEFORE UPDATE OR DELETE` on `AuditEntry` and `SignInEvent` raises an error. `TRUNCATE` is refused through the role grants below.
  - **OD-9:** on `DocumentVersion`, DELETE is refused, and UPDATE is refused unless only `withdrawnAt` and `withdrawnReason` change, going from null to set (`src/app/documents/actions.ts:204`).
  - `SulitAccessEvent` gets the same trigger when it is created in 3a.
- **App role.** It is **not** created in a migration: `CREATE ROLE` applies to the whole cluster and breaks the shadow-database replay, and a password in a migration is a hard-coded secret.
  - `scripts/db-roles.ts` runs after `migrate deploy` and is wired into `npm run setup` and `db:migrate`.
  - It creates `perolehan_app` with its password from `APP_DB_PASSWORD` (environment). The role is not owner and not superuser.
  - Grants: CRUD on all tables, and sequence usage.
  - On `AuditEntry`, `SignInEvent`, `SulitAccessEvent` and `DocumentAccessEvent` it revokes UPDATE, DELETE and TRUNCATE.
  - It sets default privileges for future tables, and is safe to re-run.
- **Database URLs.**
  - `prisma.config.ts` reads `MIGRATE_DATABASE_URL ?? DATABASE_URL` (the owner).
  - At runtime, `DATABASE_URL` is the app role.
  - Update `.env.example`; the change is additive for the founder's existing volume.
- **Runtime-role check.** `assertRuntimeRole()` runs at startup and queries for superuser or ownership.
  - With `NODE_ENV=production`, sign-in refuses while the app runs as owner or superuser.
  - In development, `/configuration/accounts` shows a `Callout`.
- **Demo loaders become additive** (ruling D11):
  - Remove every `auditEntry.deleteMany` from `prisma/demo.ts` (lines 114, 404, 440, 472, 498, 594) and the 11 `demo-*.ts` files listed at the top.
  - Loads become safe to re-run, upserting by stable keys, following the `demo-results.ts` pattern.
  - `npm run demo:wipe` is **retired**: the script refuses with a message explaining the reason. It must never delete trail rows. Business-row wiping is not kept.
- **Docs drafts**, **held for the founder** and not applied: `docs/notes/drafts/0034-agents-md-rewrite.md`. It covers:
  - the AGENTS.md rows on auth, maker-checker and delegation, plus the tenancy line;
  - the autonomous-build.md "Never" rule;
  - ADR 0020 marked "superseded by 0034";
  - ADR 0019's "every supplier recorded by an officer";
  - `phase1-acceptance.md` §6 item 10 and `phase3-acceptance.md` founder condition 3.
- **ADR 0034** goes to `docs/notes/architecture/0034-sign-in-sessions-authorisation-and-tenant-isolation.md`, **as amended**: no `assurance`, no `stepUpWindowSeconds`, Lax plus the guard, ADR-D6/D10/D11/D12/D13/D14/D18 as amended, and a `recordedBySystemLabel` field in ADR-D12.
- **Ops docs:** HTTPS is required; set a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`; set `TRUSTED_PROXY_HOPS`; strip `x-middleware-subrequest` at the reverse proxy.
- **Security tests (`test:db`):**
  - UPDATE, DELETE or TRUNCATE on `AuditEntry` or `SignInEvent` as the app role fails.
  - The trigger also fails for the owner.
  - Deleting an organisation that has trail rows is refused.
  - A change to `DocumentVersion` content is refused, while withdrawal is allowed.
  - Demo load run twice gives the same counts.
- **Phase 1 security review** (all of 1a–1d) covers threat-model findings F2, F3, F4 (staff part), F6 and F9, and section B items 1–5, 8, 9, 11, 13 and 15–16.

---

## Phase 2 — Signed acts, re-authentication, administrator separation, permissions, core maker-checker

### 2a — Permissions, administrator separation, attribution engine

**Schema**
- Enums `ActMode`, `PermissionDecision`, `ConfigurationChangeKind`, `ConfigurationChangeStatus`, one migration each.
- **`RolePermission`**: `organisationId`, `permissionKey`, `roleCode`, `decision`, unique on the three keys. No row means undecided.
- **`ActAttribution`** (ADR-D12, **amended**): adds `recordedBySystemLabel?`, so demo, fixture and migration acts are attributed honestly.
  - CHECK: exactly one of `recordedByPersonId`, `recordedBySupplierAccountId` and `recordedBySystemLabel` is set.
  - CHECK: `SIGNED` requires that the recorder is the subject.
  - CHECK: `RECORDED_ON_BEHALF` requires `paperReference` or `reason`.
  - `@@unique([entity, entityId, slot, occurrence])`. Amended in the Phase 2a review: a slot an act writes again is a new occurrence, and the highest is in force (see the decisions log).
- **`AuthorityMatrixMaker`**: `matrixId`, `personId`, `firstAt`, unique on the pair.
- **`AuthorityMatrix`**: adds `issuedByPersonId?` and `makersUnknownAtLanding` (backfilled to true once for existing drafts).
- **`ConfigurationChange`**: `kind`, `payload`, a `before` snapshot, `proposedByPersonId`, `decidedByPersonId?`, `status`, `reason`.

**Pure modules**, each with tests:
- `permissions.ts` (`resolvePermissions`): admin-only keys, admin-or-grant keys, grant-only keys; no permissions through delegation.
- `administration.ts` (`administrationConflict`)
- `act-slots.ts`: the `ACT_SLOTS` registry, plus a schema scan that every `Person` relation on a non-configuration model is in `ACT_SLOTS` or in `NOT_AN_ACT` with a reason.
- `attribution.ts` (`attributeAct`, `attributionLabel` with the states SIGNED, ON_BEHALF, LEGACY and MISSING): retires `ON_BEHALF` (certificate labels), `RECORDED_ON_BEHALF` (document labels) and the literal in `rejection-store.ts`.
- `maker-checker.ts` (`makerCheckerFault`)
- `configuration-change.ts`: a parser and applier per kind, and the STALE check.
- `stepUp(actor, password)`: the password is asked at **every** approval, signature and unseal, at matrix issue, and at the checker's decision.
  - There is no time window.
  - A failure counts towards lockout and writes `STEP_UP_FAILED`.
  - Success stamps `stepUpAt` on the session and the attribution row.

**Wiring**
- `requireStaff({permission})` comes into use.
- `administrationConflict` is checked inside `requireStaff` for holder-checked acts, and on every assignment, seat, delegation and administrator grant.

### 2b — Every act attributed (closes F1)

- **Every person slot in `ACT_SLOTS`** is written through `attributeAct`, in the same transaction as the act and its audit row. That is about 60 slots over about 50 models, including:
  - `recordedBy`, `tabledBy`, `startedBy`, `panelOverrideBy`, `lateOverridePerson`, `declaredBy`, `scoredBy`, `issuedBy`, `receivedBy`, `reviewer`, `signatory`, `fromPerson` and `toPerson`;
  - the act files in requisitions, sourcing, scope, documents, conditions, window, bids, opening, evaluation, awards, committees, suppliers, projects (actions, payment, supervision, time, variation, matter), certificates and routing.
- **The actor always comes from the session.** A form person is accepted only as the **attested person** of an act recorded on someone's behalf.
- **Separation-of-duties checks** run against both the actor and the attested person. These include:
  - self-approval and escalation;
  - requester is not the approver;
  - endorser;
  - opening-panel independence;
  - delegation to self;
  - FR-APR-009 conflict.
- **Signature-class acts** (approve, sign, unseal):
  - when signed, they need `stepUp`;
  - when recorded on someone's behalf, they need `acts.recordOnBehalf`, a `paperReference` and `paperSignatureRecording = ALLOWED`. While that switch is unset, the act is refused and the screen says the setting is not set.
- **Votes route** (`src/app/api/committees/decisions/[id]/votes/route.ts`): stops reading `personId` from the body.
  - The voter is the session's person, **or** the actor holds the secretariat seat for that sitting.
  - Both people are stored.
- **NFR-AUD-005:** approval time is stamped by the server.
- **NFR-AUD-006:** back-dating is a recorded exception with a reason and an authorising officer, attributed. Decide this as a column on the act or as a separate slot.
- **NFR-SIG-001:** the attribution for signature-class acts records the exact document or version id and the role held. This covers FR-AWD-002, 6.12 contract signing, 6.14 certificate blocks and 6.13 acts.
- **Shared attribution component.** It replaces the "Nobody is signed in…" subtitles and the "recorded on behalf, not signed" hints (`ON_BEHALF_HINT`; `REASON_HINT` where it gives that reason).
  - Person pickers remain only on acts genuinely recorded from paper.
- **Group J tests changed:**
  - `documents/labels.test.ts`, `supplier-owner.test.ts`
  - `certificate/certificate-scan.test.ts`
  - `contract/act-status-scan.test.ts`, `lock-order.test.ts` (attribution writes happen inside the locked contract)
  - `suppliers/recorder-required.test.ts`, `ends-exclusive.test.ts`, `legacy-ends.test.ts`
- **Security tests:**
  - Scan: no actor `*PersonId` is read from FormData or a request body except through the attested-person wrapper.
  - Scan: every signature-class act calls `stepUp`.
  - A requester recording an approval on the approver's behalf is refused.
  - A vote whose `personId` is not the session's person is refused unless the actor holds the secretariat seat.
  - Signature-class acts without a password are refused.
  - Legacy acts read "(before sign-in)". An attributed audit row with no attribution reads MISSING.

### 2c — Core maker-checker

- **Matrix issue** (`src/lib/authority/issue.ts`):
  - each draft edit calls `noteMaker`;
  - issue needs `configuration.issue` plus a password, and the issuer must not be among the makers;
  - a draft with `makersUnknownAtLanding` must be **adopted** first, by an attributed edit or an explicit adopt act, and then issued by someone else;
  - the issue writes `issuedByPersonId`.
- **`ConfigurationChange` kinds in this phase:**
  - `SECURITY_POLICY`
  - `PERMISSION_GRANT`
  - `ADMINISTRATOR_GRANT` and `ADMINISTRATOR_REVOKE`
  - `ACCOUNT_CODE`: activation or reset for a staff account whose Person holds an office, seat or delegation. The second person issues the code and is the one shown it (ADR-D6 as amended).
  - Proposer and decider must be different Persons. The decider needs the kind's permission and gives a password.
  - Applying re-validates the payload. If the current values differ from `before`, the change becomes STALE.
- **One eligible person only:** the act is refused and the screen says a second person is needed. Nothing fakes an approval.
- **Screens:**
  - `/configuration/security`
  - `/configuration/changes` (the two-person queue)
  - a "Product permissions" group in the permissions grid, with three states (GRANTED, WITHHELD, UNDECIDED shown as undecided)
  - `/configuration/accounts` gets `accounts.manage`.
- **Security tests:**
  - A checker who is the maker is refused; tested by Person (the unique `personId` stops one Person holding two accounts, and that is tested).
  - Propose and apply interleaved in both orders, including STALE.
  - A reset of an office holder needs a second person.
  - A reset revokes the target's sessions.
  - An administrator holding an office is refused.
  - A matrix with unknown makers cannot be issued before it is adopted.
- **Phase 2 security review** covers F1, F7, sections B6, B7 and B12, and the Phase 2 tests in threat-model section E. **Only after it passes** may a release be made.

---

## Phase 3 — SULIT, restriction, custody, inbox, reporting lines, module Musts

### 3a — SULIT engine, estimate custody, restricted exercises

- **`SULIT_FIELDS[].scope`** (`src/lib/sulit-fields.ts`): `exercise`, `requisition`, `contract`, `supplier` or `evaluation`.
- **`sulit-access.ts`**:
  - one resolver per scope for "named on the record";
  - requisition, contract matter and supplier scopes are reachable **only** through `sulit.read.organisation`, which is undecided by default, so they are refused and shown as undecided;
  - administrators are always refused;
  - restricted exercises admit only named people.
- **`Sulit<T>`** is the loader type. `SulitValue` shows "SULIT · withheld" or the value.
- **`SulitAccessEvent`** table, with its trigger and the revoked grants on the app role. Events are de-duplicated per request with `cache()`.
- **FR-EST-008:** wire `custodyList` and `viewFault` (`scope/estimate.ts:241-252`) to `ScopePolicy.estimateCustodianRoleCode` and `estimateAuditRoleCode`. There is still no reveal before disclosure (ADR 0012), and the sealed estimate stays sealed whoever is signed in.
- **FR-MTD-007:** a restricted exercise is hidden from people not on it, across lists, search, the dashboard, the feed and direct ids, and every access is logged. Remove the "Restriction not enforced until sign-in" text (`sourcing/page.tsx:67`, `[id]/page.tsx:125,574`, `editors.tsx:282`, `reference-data/editors.tsx:186`).
- **Group J tests changed:** `sulit-fields.test.ts`, `scope/estimate.test.ts`, `sealed.test.ts` (`custodyList` is now imported).

### 3b — SULIT rollout across modules

- **Loaders return `Sulit<T>`** in the BQ tab (6.2), opening prices and schedule (6.7), evaluation (FR-EVL-014), award IC number (FR-AWD-008), statutory declarations (BD-613-102), supplier contacts and scans (BD-615-6), and the contract and committee amounts.
- **Remove the "not restricted until sign-in" chips:** `VALUE_SULIT_LABEL`, `opening/labels.ts:95`, `evaluation/labels.ts:97`, `NOT_RESTRICTED_CHIP`, `EPAYMENT_SULIT_CHIP`, `suppliers/[id]/page.tsx:256,465`, `portal/labels.ts:326`. The dashboard value chip (founder item 26) is ruled withheld unless entitled.
- **Documents (OD-2):**
  - SULIT document bytes are downloadable to entitled users, and every download or refusal is logged.
  - Non-SULIT documents are scoped by the record's access (NFR-SEC-001: `documents/labels.ts:18`, `attachment-panel.tsx:25`, `document-drawer.tsx:484,512`).
  - Re-check C-6 (identical re-upload) against per-person access.
- **Exports:** every export with a SULIT column is audited and limited to entitled users (the `DataList` guard). Audit export needs `audit.read`. FR-EVL-017 annexes D and F are exportable to entitled users.
- **FR-EVL-020:** anonymised technical scoring, with the reveal logged.
- **Group J tests changed:** `data-list.test.ts`, `evaluation/export-sulit.test.ts`, `certificate/sulit.test.ts`, `contract/variance-sulit.test.ts`, `committee/matter-amount.test.ts`.
- **Security tests:**
  - SULIT values are absent from pages, server-action responses and exports without entitlement.
  - The sealed column is unreadable to the app (Prisma `omit` plus a scan).
  - A refused download is logged.
  - Events carry the actor.
  - Run a text-snapshot diff under three users: named, entitled, and neither.

### 3c — Inbox, queues, reporting lines, delegation

- **FR-APR-018 personal queue:** "My steps" on `/approvals`, with counts in the shell.
- **Staff inbox:** notices labelled "shown in the portal; not sent — email is not connected (INT-09)".
- **FR-APR-012:** pending steps move automatically when a holder is marked absent.
- **FR-APR-017:** the originator can recall on name and award routes.
- **FR-CTE-009:** the not-approved memo is issued as an in-portal notice.
- **Reporting lines** (FR-APR-010/011): a configuration model per organisation, left **unset**.
  - Escalation to the immediate superior uses it when set. When unset, the screen says "reporting line not set" and the step stays put, with no silent promotion.
  - `faultsIn` applies the superior and subordinate rules when lines are set, and says so otherwise.
- **Delegation:**
  - the grantor is the actor, or is recorded on their behalf with both fields stored;
  - **cycle and chain check (F8)** over delegations in force;
  - task-limited delegation.
- **Security tests:** a delegation cycle is refused; a grantor other than the actor without the permission is refused; an unset reporting line warns and does not route.

### 3d — Module Musts that need the actor beyond attribution

- **FR-REQ-003:** endorsement by the named user.
- **FR-EST-005:** panel verifications are signed.
- **FR-MTD-011:** the contract-type override is attributed.
- **FR-DOC-011 and 014:** the endorser and the assurance actor are checked against the actor.
- **FR-OPN-003, paper half:** each authorising panel member re-authenticates in the same session. Both must be different from each other and from the actor, unless the actor is one of them.
- **FR-EVL-001:** each evaluator scores under their own identity.
- **FR-APR-007:** attributed. **FR-APR-009:** signed.
- **FR-CTE-006:** the tabler is the actor, including variation tabling (`variation-actions.ts:519`).
- **FR-AWD-002:** the signatory signs.
- **FR-CON-007, 009 and 014:** signatures are acts by the signer. OD-1: Contract Date is the attributed signature act.
- **FR-SUP-002–004:** acts outside a Superintending Officer's delegated scope are hidden from the delegate (`supervision/authority.ts:9`, mapped from the session).
- **FR-CMP-011:** defect reports attributed to the department's actor.
- **FR-CRT-004:** certificate signature blocks are signed (`certificate/write.ts:9`, `route-write.ts:11`).
- **Phase 3 security review:** F10 and the Phase 3 tests in threat-model section E.

---

## Phase 4 — Supplier accounts and the 6.15b portal

### 4a — Supplier accounts

- **Schema:** `SupplierAccount` (`contactId @unique` to `SupplierContact`, plus `supplierId`, no administrator flag), `SupplierSession`, and the supplier FK on `OneTimeCode`.
- **Identity:** a `SupplierCredentials` adapter, a separate cookie, and supplier timeouts.
- **Route handlers** at literal paths, added to `publicAllows`. Each calls `assertSameOrigin`, and staff server actions on the public copy stay refused:
  - `/supplier/sign-in/submit`
  - `/supplier/sign-out`
  - `/supplier/activate/submit`
  - `/supplier/reset/submit`
- **Supplier codes:** issued by an officer holding `supplierAccounts.manage`, who **records how the caller's identity was checked**. Accepting a portal application offers an activation code. Retiring a contact disables the account and revokes its sessions.
- **`requireSupplier()`:** `supplierId` comes **only** from the session. A scan checks that supplier handlers never read it from the request. Another supplier's ids answer 404.
- **Portal form:** a signed form token (server secret from the environment) on the portal forms.
- **FR-VND-001:** application status tracking.
- **615-C3:** add a test for `isPublicOpportunity` (`src/lib/portal/public.ts:54`) and close it in the log only once the test passes.
- **Public-copy database role** (go-live condition): SELECT on portal views only; no grant on staff tables, `CompanyEstimateVersion` or the bid tables. Created by `db-roles.ts`.
- **Group J test:** `supplier/register/submit/route.test.ts` stays valid (route handlers, no `"use server"`). Extend it.

### 4b — Company

- **FR-VND-004:** the "not automatically validated" notice.
- **FR-VND-005:** the e-Payment / Creditor's Profile bank-details form, SULIT and entered by the vendor. It feeds BD-613-44 payment eligibility.
- **FR-VND-006:** the false-declaration acknowledgement, server-stamped.
- **FR-VND-007:** resubmission per document item online, with an in-portal notice on rejection.
- **615-C7:** fix the one-link-deep read of the watched-lists chain. Then **FR-VND-008:** expiry reminders shown in the portal.
- **615-C1:** structured registration needs on a requirement. Then **FR-VND-011:** the vendor's own eligibility view.

### 4c — My Bids and notices (not sealed)

- **FR-VND-013:** briefing and site-visit registration, addendum acknowledgement, own-bid status only. The sealed bid is not built.
- **FR-DOC-010:** inspection log by the signed-in vendor.
- **FR-ADV-012 and 014–016:** purchaser notices shown in the portal.
- **FR-VND-012:** request documents, the FR-ADV-010 pre-sale checks, and `electronicDocumentRelease` (unset), which would release the pack after an officer records the payment receipt. Online payment stays blocked on INT-10.
- **FR-AWD-010:** non-award notice and debrief, with a **policy-D7** switch left unset. While unset, nothing is issued and the screen says D7 is not set.
- Remove `SIGN_IN_TITLE`, `SIGN_IN_BADGE` and `SIGN_IN_REASON` and the "With sign-in" nav group as each screen fills.

### 4d — My Projects, then announcements

- **Contractor acts:** programme progress, interim claims and materials on site, certificates certified against paid, sign or dispute VO and adjustment certificates, delay notices, defects, statutory declaration.
- **FR-SUP-007:** the site diary is signed by both the officer and the contractor's agent (signed with the supplier account).
- **Routing contractor submissions** (6.14 OD-6, BD-614-31): each submission goes to an officer against a service level.
- **FR-VND-014 announcements**, built last.
- **Phase 4 security review:**
  - Supplier A gets 404 on every supplier-B id across routes, filters, exports and error messages.
  - The public role cannot read staff, sealed or other suppliers' rows.
  - Only allow-listed writes are accepted on the public copy.
  - A supplier reset records the identity check.
- **Go-live conditions:** an outside review and the public-copy role.

---

## Phase 5 — Maker-checker on every remaining configuration editor

- **5a:**
  - Versioned items: evaluation models (`configuration/evaluation/actions.ts:26`) and templates and forms are issued by a non-maker.
  - `ConfigurationChange` kinds for:
    - quorum (FR-CTE-003, replacing the audited direct save);
    - opening panel size;
    - classification downgrades (BD-DS-11; lifts the blanket refusal at `documents/classification.ts:9`);
    - the 6.12 corrections `correctBaseline` and `correctAwardTerm` (`projects/[id]/actions.ts:975`);
    - BD-24 award-return correction.
- **5b:** every remaining Configuration section moves onto `ConfigurationChange`, people and assignments included: audit, awards, budget, committees, contracts, documents, invitation, notifications, numbering, organisation, post-award, reference data, requisitions, routing sheets, scope, suppliers, tender documents, users.
  - The reason prompt in `configuration/users` (`actions.ts:132`, `editors.tsx:133,276,297`) becomes the proposal reason.
  - Transactional acts (window extensions, bid handling) stay signed, with no second person.
- **Registration values (added 2026-10-09, product owner ruling on log line 1909(A), after Phase 4):** `saveRegistrationValue` and `setRegistrationValueRetired` (`src/app/configuration/suppliers/actions.ts`: the lists a supplier's registration offers, rank corrections included) are on 5b's list under suppliers, as configuration editors are gated in this phase and not singly beforehand (ruling 1666). Their proposal carries the reason the audited direct save asks for today; the narrow guard that refuses a rank correction once a value is frozen on a registration stays.
- **Scan:** no configuration editor writes a configuration table except through the issue path or the `ConfigurationChange` applier.

---

## Open items: ruled by the product owner (2026-10-06)

- **O-1, PDPA retention against the append-only `SignInEvent`: split table.** `SignInEvent` stays fully permanent (store, account if matched, kind, time) with no bypass; ruling D11 stands. The source address and user agent move to a side table `SignInEventDetail` keyed by the event id. Its trigger always refuses UPDATE, refuses DELETE unless the row is older than `SecurityPolicy.signInDetailRetentionDays`, and refuses every DELETE while that is unset, for every database login including the owner. The app's login gets no UPDATE, DELETE or TRUNCATE on it. A purge is an operator command-line run (no scheduler) that deletes expired rows and writes one SYSTEM audit row with the cutoff and the count. The setting is nullable with no default; the screen says "Retention period not set — sign-in addresses are kept"; it must be at least the address-throttle window. `AuditEntry.sourceAddress` stays permanent (NFR-AUD-001; disposal belongs to NFR-RET-001; the privacy notice says so, threat model B17). `StaffSession` address fields are ordinary editable rows under the same setting. Legal hold (NFR-RET-002) is not built and the screen says so beside the setting. **The schema split lands in the Phase 1a migration** (so 1a creates `SignInEventDetail` and `SecurityPolicy.signInDetailRetentionDays`, and the SignInEvent trigger in 1d guards both tables as above). **The purge command is built only after Phase 2c.**
- **O-2, going live without a second factor: R-1 accepted for the build and internal acceptance runs only.** Go-live without it stays a go-live condition: the founder's own go-ahead and RSAJ's written acceptance (NFR-SEC-005 is the customer's Must; its directory half is also unmet, INT-14). Compensating controls required before any go-live: the password at every signature-class act with no window; lockout and address throttle counted in the database; session limits (unset means sign-in refused); a re-check of account, Person and roles on every request; the sessions list with sign out everywhere; a second person for office-holder resets and no self-reset; the reset notice. **Added to Phase 1a:** `/account` and the first page after sign-in show the previous sign-in time and address and the failed attempts since then. No shorter idle limit for approvers (B4). `/configuration/security` states: "Second sign-in step not built — approvers sign in with a password only (NFR-SEC-005 not met)."
- **O-3, the held rewrite: sent back, stays held.** Phase 1d writes the draft at `docs/notes/drafts/0034-agents-md-rewrite.md` and applies nothing to AGENTS.md or autonomous-build.md until a ruling on that text (agent configuration; a script or agent message cannot authorise changing it). ADR 0020 is marked "superseded by 0034" in 1d. ADR 0019's "every supplier is recorded by an officer" line is amended only when Phase 4a lands. The founder's acceptance documents (`phase1-acceptance.md` section 6 item 10, `phase3-acceptance.md` founder condition 3) get a dated note only. The draft must describe what each phase built (each AGENTS.md row tied to its phase), carry the amended values (no `assurance` field, Lax cookies plus the Origin check, one organisation per database, no row-level security), keep "do not fake a second approval" and "unset means refuse", record O-1 and R-1 with NFR-SEC-005 marked not met, and narrow the autonomous-build.md "Never" line rather than delete it (it still forbids the second factor without the founder's go-ahead, outside services, pushing, deploying and database resets). Builders work under standing rule 1 until then.
