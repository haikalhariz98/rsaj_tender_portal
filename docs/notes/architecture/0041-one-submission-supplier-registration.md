# 0041 — Supplier registration is one submission, held against the online application and routed on it

**Status:** Accepted 2026-10-21, when step 1 of the plan landed (the data model, the shared rules, the terms text and the legacy tick). Proposed and written 2026-10-21 by the solution architect, from the product owner's rulings REG-1 to REG-6 of the same day
(the founder's words: "send all items from step 1 and step 4 together and being submitted at step 5", "the user cannot save draft",
"either approved or rejected"). The plan is `docs/notes/plans/registration-one-submission-plan.md`.

**Number.** 0040 is taken by the superseded staff-screen language layer. Design note 0004 calls the online award return "ADR 0040"
without a number actually reserved. That record takes the next free number when wave V writes it, not 0040 and not this one.

**Relation to earlier records.**
- **Supersedes** the 2026-10-07 two-stage ruling (decisions log line 1880), OD-3 B and the no-file rule for the public form (line
  1881), and the SR-01 reading of 2026-10-09 (line 1985). Those were rulings, not ADRs. This record replaces them as the design.
- **Amends ADR 0019, Amendment 3 (b).**
  - The new way: an online application is now the whole registration. An officer decides it on its route, and the supplier is
    created at the last approval.
  - What is unchanged: the supplier is still created by an officer's act, under lock, in one transaction with its audit rows.
  - Applications received on the step-one form before this record keep the Amendment 3 path: accept, issue the code, then the
    signed-in wizard.
- **Extends ADR 0005.** `ApprovalInstance` gains one subject, the online application. Nothing else in the engine changes.
- **Extends ADR 0011.** New attachment owners and purposes are added, and the store's transaction core takes a caller's
  transaction. No byte is ever purged; purging stays founder-reserved.
- **Uses ADR 0034** D6/F7 for opening the account: the one-time code, issued by a `supplierAccounts.manage` holder who records the
  identity check. It also uses D14 for the SULIT reads.

## Context

Until now, registration was split in two. A stranger's public form sent step 1 only, with no file and no bank detail. An officer
accepted it and issued an activation code. The supplier then completed steps 2 to 5 in a signed-in wizard, with server-side drafts.
The founder has overturned this: one five-step form, held in the browser for one visit, sent once at Submit, then checked by the
office and approved or rejected.

Four facts of the code shape the design:
1. `Supplier.registrationNoKey` is unique per organisation. Any row a stranger's submission created would let them squat a real
   company's number, or find out which numbers are held.
2. The registration route (`supplier_registration`), document verification, bank-details verification, the approval rules and the
   SULIT reads are all built on `SupplierApplication`, `SupplierDocument` and `CreditorProfile`, and each of those requires a
   `supplierId`.
3. Every column that names who recorded or signed something requires one of two things: a `Person` or a `SupplierAccount`. An
   applicant who is not signed in is neither.
4. The signed form token is `issuedAt.mac`. Two pages rendered in the same millisecond get the same token, so it cannot be
   single-use as it stands.

## Decision

**D1. Nothing is staged and nothing is saved before Submit.** The browser holds every field and every `File` until Submit. One
multipart POST to `/supplier/register/submit` carries them all. The server judges every step again, and its answer is final. A
refusal writes nothing, and that includes file bytes: the blob store is transactional, so bytes roll back with the transaction.

**D2. A submission creates no supplier.** It creates one `PortalApplication` (`form = WHOLE`) and, held against it:
- `PortalApplicationDocument` rows with their `PortalApplicationValue` codes;
- file versions attached with the new purpose `PORTAL_APPLICATION_DOCUMENT`;
- one `PortalApplicationCreditor` (the bank details, SULIT from receipt), with its statement attached as
  `PORTAL_APPLICATION_BANK_STATEMENT` in the configured SULIT class;
- `RegistrationDeclaration` rows for the agreements.

These rows are frozen by triggers. The only later changes allowed are the officer's verification columns, and erasure on set-aside.

**D3. "Applicant, not signed in" is one marker: a nullable `…PortalApplicationId` column.** The marker is added beside each
existing recorder or signer reference, and each `num_nonnulls` CHECK is widened to admit it:
- `DocumentVersion.recordedByPortalApplicationId`;
- `SupplierDocument.recordedByPortalApplicationId`;
- `CreditorProfile.enteredByPortalApplicationId`, with `enteredBySupplierAccountId` made nullable;
- `RegistrationDeclaration.portalApplicationId`, with `signedBySupplierAccountId` made nullable.

The audit trail gets `ActorKind.APPLICANT` with `AuditEntry.actorPortalApplicationId`. `SYSTEM` is never used for this, because it
would say a machine acted. Screens render the marker as "Unverified; not signed in". The applicant's act is not an attributed
signature: no `ActAttribution` row is written, because there is no sign-in to attribute.

**D4. Agreements are `RegistrationDeclaration` rows, one per tick.**
- GIRO authorisation: one row.
- False declaration (FR-VND-006): one row, ticked separately.
- Terms and conditions: one row, under the new `DeclarationKind.TERMS_AND_CONDITIONS`. The Personal Data Notice is agreed by the
  same tick, so its frozen filled text and SHA-256 are carried on the TERMS row in two new nullable columns, `noticeFrozenEn` and
  `noticeSha256`. A CHECK holds that they are present exactly on TERMS rows. The notice stays in
  `SupplierPolicy.personalDataNoticeEn`. It has no version of its own, so its hash is its identity, and a stale hash is refused.

Each row carries:
- the text id and version;
- the SHA-256 and frozen filled text (`frozenWording`);
- the signatory as typed;
- the organisation's day and the server time.

The reference is the linked application's. The rows are append-only under the existing trigger. The signed-in wizard's Submit writes
the same TERMS row, signed by the account.

**D5. The online application is a route subject.**
- `ApprovalInstance.portalApplicationId` is added, and `ApprovalInstance_supplier_matter` is widened to count it.
- The officer who sends it is the requester (`PortalApplication.sentByPersonId`, read as `applicationSenderId`).
- The mandatory documents must stand before sending, and again at the last step, under the same `approveFaults` and `submitFaults`.
  They stand only once a named officer has verified each one on the held rows (FR-VND-004).
- Those rules read a `FileFacts` built from the held rows by a pure mapper. They are not restated.

**D6. The supplier is created at the route's last approval, in that step's transaction.** In that transaction:
- the number is re-checked against the register under the organisation lock, and the step is refused if a supplier now holds it;
- the `supplier` reference is issued;
- the `Supplier` is created (REGISTERED, today), with its primary `SupplierContact`;
- a `SupplierApplication` is created (NEW, PORTAL, APPROVED, `portalApplicationId` set) with its `ApplicationDecision` and snapshot;
- the documents, codes, bank details and statement are promoted. Attachments are moved as `submit-store.ts` moves them. Each
  verification is carried, and each recorder stays the applicant.

The declarations are not copied. Readers follow `SupplierApplication.portalApplicationId` and
`CreditorProfile.enteredByPortalApplicationId` back to them. The activation code stays a separate, later act on the supplier's
page, as today.

**D7. Rejection is the officer's recorded outcome, with verbatim reasons. It is not a route.** This matches paper and wizard
applications today, where the route only approves and a refused step returns the matter to the officer.
- A rejected online application leaves no supplier row. Reapplying is a fresh application under the per-number limit.
- Request Resubmission is not offered for it (REG-3, FR-VND-007 partly unmet).
- Set aside stays for junk. It erases the typed words and the bank details, and keeps the files (ADR 0011) and the append-only
  agreements.

**D8. The form token for `register` gains a random nonce, and is single-use on success only.**
- The token is `issuedAt.nonce.mac(purpose|issuedAt|nonce)`. Other purposes keep their shape.
- The SHA-256 of the token is stored in `PortalFormToken`. The row is inserted first inside the application's transaction, so a
  concurrent duplicate waits on the unique index and then reads the winner.
- The token travels in `x-form-token`. A spent token is answered with the stored reply (the same reference) before a byte of the
  body is read.
- A refusal does not spend the token.

**D9. Limits come from configuration, and an unset limit closes the register.** The request-body ceiling is derived from:
- the per-file cap: the smaller of `DocumentStorePolicy` and the deployment ceiling;
- `uploadMaxFilesPerApplication` and `uploadMaxBytesPerApplication`;
- a technical text allowance computed from the field bounds.

It is enforced twice: on the stated length (no length is refused), and while reading (`limitBody`). The route is excluded from the
`src/proxy.ts` matcher, because the proxy keeps only the first 10 MB, and it asks the boundary's own `gate()` itself.

## Consequences

- **Easy.** Almost everything after receipt is today's code: document verification rules, `approveFaults`, `deciderFaults`, the
  route engine, the SULIT rule, the activation code, and `registrationSummary` as the one projection the applicant and the officer
  both read.
- **Hard.** Every reader of `ApprovalInstance.supplierApplicationId` must learn the new subject:
  - the approvals actions and worklist;
  - `routed-people-store`;
  - `creditor-access-store`;
  - document owners and reads.

  Some files have two lines of descent: the `PortalApplication*` rows before approval, and the supplier's rows after.
- **Ruled out.**
  - Saving a draft anywhere.
  - Self-sign-up: officers still open every account.
  - A status lookup for applicants.
  - Purging the bytes of rejected or set-aside applications.
- **Database role.** The public copy's database role now writes files, SULIT bank details and agreements. The go-live condition
  on that role is widened and stays NOT MET (REG-6.2).
- **Reversible in one place.** The terms card sits inside step 5. A separate stepper step means adding `"terms"` to
  `REGISTRATION_STEPS` and pointing `TERMS_STEP` at it.
