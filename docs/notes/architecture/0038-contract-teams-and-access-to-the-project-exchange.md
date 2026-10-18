# 0038 — Contract teams, and who reaches the Project exchange

**Status:** Proposed, **held for CPD** (AC-7). Written on 2026-10-19 by the solution architect, at wave P step P0 of design note 0004.
Nothing here is built. No migration and no code follow until the founder records CPD's written sign-off of P-1 to P-7 as [NET-NEW] in
the decisions log, giving the signer's name, the date and the document version, together with the AC-7 policy answers (R-1 in the
Part 2 build plan, `docs/notes/plans/wave-p-build-plan.md` §7). The rulings behind this record are AC-25 and AC-29 in design note
0004 §4. The table shapes are declared in the build plan §2. If CPD's answers differ from the defaults below, this record is amended
before it is accepted, not after.

**Relation to earlier ADRs.**
- **Extends ADR 0034.** It adds one granted-only permission (D8's registry of permissions, with D9 keeping administrators out) and reuses the D6 identity check when a contractor
  member's account is opened. The design note's §7 says this record extends ADR 0020. ADR 0020 was superseded by ADR 0034 D1 to D3 on
  2026-10-07, so this record cites 0034. The two stores and "no self-service account" are unchanged: a contractor Lead **requests** a
  member, and staff open the account.
- **ADR 0007 is unchanged.** Membership attaches to the Contract row, which `issueAward` alone creates.
- **ADR 0037 is unchanged.** `caseVisibility` still decides what a staff reader sees of the case. Team membership is a second gate,
  inside the Project stage, on the exchange only.
- Nothing is superseded.

## Context

The requirement (P-2) puts a team on each side of every contract. It says "only team members can see the workspace" and "a contractor
sees only their own contracts". New contractor people are requested by the contractor's Lead and approved by RSAJ.

Today:
- **Staff.** There is no membership. A staff reader reaches a contract through `caseVisibility` (ADR 0037). The S.O. is an office
  (`ContractSoAssignment`, `soOfficeOn` in `src/lib/supervision/load.ts:75`). Its delegates are `SoDelegation` rows whose scope lists
  `SupervisionAct` values, `CONTRACTOR_COMMUNICATION` among them. Authority is checked at the act by `recorderFaultToday`
  (`load.ts:88`).
- **Contractors.** Every active account of the awardee sees every contract whose award names its supplier and stands
  (`supplierHoldsContract`, `src/lib/portal/projects/visibility.ts:17-19`). Nothing narrows that per person.
- **Accounts.** A supplier account is opened by staff holding `supplierAccounts.manage` through `openSupplierAccount`
  (`src/lib/auth/supplier-administration.ts:79`). The account needs a `SupplierContact` and an identity check (D6). Reading a contact's
  details is a SULIT read (ADR 0034, Phase 4a note under D6).

AC-25 rules on the gaps. If "only team members" covered the whole case page, it would lock out Finance, Legal, C&P and the approvers
(FR-CON-006, FR-FIN, FR-APR). So it covers the exchange only.

## Decision

**D1. Membership gates the Part 2 exchange, and nothing else.** The exchange is the kick-off meeting, the submissions with their
revisions, comments and files, the register, and the exchange's notices. Other surfaces are unchanged:
- the case page's other stages and tabs, through `caseVisibility`;
- the contractor's diary attestation, certificates, payments and announcements, through `supplierHoldsContract`.

A reader who is refused the exchange gets the same answer as for a contract that does not exist. Staff get a Project-stage panel that
says they are not on the team. A contractor gets a 404.

**D2. Staff membership is partly derived and partly stored.**
- **Derived, never stored.** A derived member is computed at the moment of the read or the act, from the rows that already decide
  supervision authority. Removing a delegation or ending an office removes the member at once, with no second write to forget.
  - **Leads:** the holders, and the acting holders, of the contract's S.O. office on the organisation's today.
  - **Reviewers:** delegates in force today whose scope includes `CONTRACTOR_COMMUNICATION` or `PROGRAMME_SCRUTINY`.
  - **Viewers:** other in-force delegates.
- **Stored.** Other staff, such as a project engineer or a document controller, are `ContractTeamMember` rows (side STAFF). A staff
  Lead adds and removes them. The roles are LEAD, REVIEWER and VIEWER.
- A stored row never overrides a derived role. Where both apply, the stronger role is used: LEAD, then REVIEWER, then VIEWER.
- **Membership is not authority.** Being a REVIEWER lets a person comment and recommend. The answer the contractor sees is checked
  separately at the act (ADR 0039 D4).

**D3. Oversight is a new permission, `projects.exchange.oversee`.**
- It is GRANT_ONLY, and undecided until the organisation grants it. Undecided is refused and shown as undecided.
- An administrator never holds it, through the flag or any other way (NFR-SEC-004, the ADR 0034 pattern).
- It lets the holder **read** every contract's exchange. It does not let them act on one. The proposal says "oversight" and nothing
  more, so the read-only reading is taken as the conservative one and logged.
- Labels: en "Oversee every contract's Project exchange", ms "Pantau pertukaran Projek setiap kontrak". Lets (en): "Read the
  meetings, submissions, register and files of every contract's Project exchange. It answers nothing and opens no SULIT value it would
  not otherwise open." ms: "Baca mesyuarat, serahan, daftar dan fail pertukaran Projek setiap kontrak. Ia tidak menjawab apa-apa dan
  tidak membuka nilai SULIT yang tidak dibuka sebaliknya."

**D4. Contractor membership is always stored.**
- Each member is a `ContractTeamMember` row (side CONTRACTOR) naming one `SupplierAccount` of the awardee. The roles are LEAD,
  SUBMITTER and VIEWER.
- **The first Lead** is set by staff holding `supplierAccounts.manage`.
- **The go-live backfill**, in the P1 migration, makes each account of the awardee that is ACTIVE at migration time a contractor Lead,
  on each contract that `supplierHoldsContract` gives it. "Every account sees what it saw" is a db-tested parity condition.
- **A contractor Lead** removes members of its own side. It cannot remove the last Lead, and it cannot disable an account. Disabling
  stays with `supplierAccounts.manage`.
- **An account that is disabled or closed** reaches nothing, whatever its rows say. The account's status is read on every request, as
  ADR 0034 already requires.
- **An account opened after go-live** outside the request path is not a member until it is added. Membership is never inferred from
  the supplier, because inferring it would undo the narrowing that P-2 asks for.

**D5. Contractual notices never wait on a team.** AC-27 rules that a contractual notice is never refused. P-7 moves FR-EOT-001's delay
notice into the exchange, so a contract issued after go-live, with no contractor Lead set yet, must not block the notice.
- The six **system** types (ADR 0039 D8) may be **sent** by any active account of the awardee that `supplierHoldsContract` admits,
  member or not. That is today's reach for those six.
- The sender reads its own submission and files, as AC-29 allows ("files they submitted").
- A non-member reads nothing else in the exchange.
- The staff side shows "No contractor Lead is set" on the Project stage, so the gap is visible and gets closed.
- This is the architect's reading of AC-27 against AC-25. It is logged as a product-owner question.

**D6. A contractor Lead requests new people, and staff approve them. There is no self-service.**
- **The request.** A contractor Lead files a `ContractTeamRequest` giving the proposed name, designation, email, phone and role.
- **The details are SULIT.** They are the same personal details as a `SupplierContact`, so they are SULIT under the supplier scope.
  Staff read them only with the right that reads a contact's details. The requesting supplier's own Lead reads its own request.
- **The decision.** Staff holding `supplierAccounts.manage` approve or refuse, with the D6 identity check recorded as a reason (how
  the person's identity was confirmed outside the system).
- **Approval is one transaction.** It takes the supplier lock (`withLockedSupplier`, `src/lib/suppliers/write.ts:44`) and then the
  contract lock (`withLockedContract`). It then writes:
  - the `SupplierContact`;
  - the account, through `openSupplierAccount`, issuing the activation code shown once to the approving officer;
  - the member row;
  - the request's result.
  Each write carries its audit row.
- **Reuse instead of a new contact.** If the person already has an active account on this supplier, approval adds the existing account
  as a member and opens nothing. A person who works for two suppliers needs two accounts (accepted, AC-25).
- **Refusal** needs a reason. The Lead sees the refusal and its reason.
- **Signing is separate.** Being a Submitter grants no signing authority. `authorisedToSignForContractor` and the organisation switch
  still decide who signs.

**D7. Lock order.** When an act takes more than one lock, it takes them in this order: supplier, then contract, then submission, then
document. Only the staff approval of a member request (D6) takes the supplier row. Every contractor act starts at the contract lock,
as ADR 0034's Phase 4e record already requires ("supplier acts take the contract's canonical lock and never the supplier row").

**D8. The reach is pure, and its reader is the only door.**
- `contractTeamAccess(facts)` in `src/lib/project-docs/team.ts` is pure. It takes the derived office, the delegations, the stored
  rows, the account status and the oversight grant, and returns the reader's role or the reason for refusal.
- `exchangeReach(reader, contractId)` in `src/lib/project-docs/reach.ts` loads those facts and calls it.
- Every exchange store calls `exchangeReach` first: the portal's `context-store`, `list-store` and each `*-store`, and the staff panels.
- A scan test pins that each exchange read and act calls it.

**D9. Audit and retention.**
- Adding, removing, requesting, approving and refusing are each audited with before and after, in the same transaction as the change.
- Removal sets `removedAt` and `removeReason` and never deletes the row, so the team on any past day can be rebuilt.

## Consequences

- **Easier:**
  - Finance, Legal, C&P and approvers keep the case page they have today.
  - A delegation revoked or an office handed over changes the exchange at once, with no second write.
  - A second customer's team is data, not a rule.
- **Harder:**
  - Each exchange read pays for a reach check: one query for the stored rows, plus the supervision rows the case page already loads.
  - Two gates sit on one page (`caseVisibility`, then the team), and the Project stage must say which one refused.
- **Ruled out:**
  - Contractors opening their own accounts.
  - Membership gating the contract's certificates, payments or diary.
  - Administrators reading the exchange through the flag.
  - Inferring membership from the supplier after go-live.
- **Depends on CPD (R-1):** who on the RSAJ side approves member requests. The default is `supplierAccounts.manage`. If CPD names the
  S.O. instead, the approval act changes, and the D6 identity check stays with the officer who issues the code.
