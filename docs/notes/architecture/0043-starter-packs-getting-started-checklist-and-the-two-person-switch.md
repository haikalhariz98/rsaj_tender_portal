# 0043 — Starter packs, the Getting-started checklist, and the two-person switch

- **Status:** accepted 2026-10-23. The founder approved the simplification proposal ("please proceed dont stop unitil it complete").
- **Supersedes in part:** ADR 0034 D15, the clause "Phase 5b moves every remaining Configuration section onto it". Two-person
  approval of configuration becomes an organisation switch (D3 below). Everything else in D15 stands.
- **Retires:** the "creates the organisation and nothing else" stance in `prisma/seed.ts`, `prisma/demo.ts` and AGENTS.md
  (the maker-checker row, and "Every screen handles the unconfigured state").
- **Plan:** `docs/notes/plans/simplification-plan.md`, step 4.

## Context

- Nearly every configuration group ships empty, and an empty group blocks what it governs. On the founder's database the
  public supplier registration needed 24 settings before it would open.
- The founder (2026-10-23) wants a simple, SaaS-grade product. The research (`simplification-plan.md` §7) found:
  - RSAJ's own specification names default values for about 35 setting groups, for example 2.30 pm closing (FR-ADV-006),
    a Tender Board quorum of 3 (FR-CTE-003) and two opening officers (FR-OPN-002).
  - About 30 decision-log rulings ("ships unset") went the other way.
- Constraints that do not move:
  - AGENTS.md rule 1: no customer value is a literal in product code.
  - NFR-USE-004 and FR-APR-001: thresholds and routes are configuration.
  - NFR-SEC-004 and FR-APR-020 (Must): a second person approves a configuration change.
- Since Phase 5 every configuration save is a `ConfigurationChange`, and a second person must decide it. The database holds
  this too:
  - the `ConfigurationChange_two_persons` CHECK;
  - the insert guard, which accepts only a PROPOSED row;
  - `guard_matrix_issue` and `guard_draft_issue` (PA005, ENABLE ALWAYS) on `AuthorityMatrix`, `EvaluationModel` and
    `RateSchedule`.

  An organisation in setup has one administrator, so it cannot configure itself. The founder hit exactly this ("we don't
  need second approver until after go live").

## Decision

### D1. Starter packs are data, loaded on purpose, never literals

- **A pack** is a typed data file. Its loader is the same for every pack. There are three packs:

  | Pack | File | Provenance | Holds | Runs on |
  | --- | --- | --- | --- | --- |
  | Generic | `prisma/packs/generic.ts` | ASSUMED, with the reason "generic starting value" | Values that are not authority: sign-in and session settings, upload rules, document classes, the time zone, supplier lists (entity types, Malaysia's states, banks, account types), registration limits and quotas, a weekend-only holiday calendar, generic numbering patterns | Any organisation, at `npm run setup` |
  | RSAJ | `prisma/rsaj/starter-pack/*.ts` | STATED, each entry citing its requirement ID and the clause that requirement names | The values RSAJ's documents state: window rules, the quorum, the opening panel, reminders, award clocks, reference lists, the tender and contract document parts, the six committees (without members), the numbering patterns, the two evaluation models **as drafts**, and the DAL **as an unissued draft** (D2) | An RSAJ organisation only, by an operator command |
  | Development fill | `prisma/dev-fill.ts` | ASSUMED, labelled "development wording, invented" | Sample legal texts (terms, false declaration, GIRO) and links to the demonstration's document classes | Only a database that holds the demonstration (`demoIsLoaded`); it refuses anywhere else |

- **One loader.** `src/lib/starter/plan.ts` is pure: given a pack and a snapshot of the organisation's current values, it
  returns the writes, the skips with their reasons, and the faults. `src/lib/starter/apply.ts` runs them. The command line
  is `scripts/load-pack.ts <pack>[,<pack>…] [--apply]`, run as `npm run pack -- …`.
- **The fill rules.** These make loading idempotent and ensure it never overwrites:
  - **A scalar group** is the columns that share one provenance column, for example the four columns under
    `WindowPolicy.dateRulesProvenance`. It is written only when **every** column in the group is null. A half-set group is
    skipped and reported, so one provenance tag never covers two sources.
  - **A list** (committees, classes, funding routes, supplier lists, document types, numbering series) is loaded only when
    that list is **empty** for the organisation. A non-empty list is skipped whole and reported. This stops RSAJ committees
    from landing beside the demonstration's.
  - **References inside a pack** (a supplier upload class, a window calendar) resolve to rows that the same run created. If
    the target was skipped, the referring group is skipped too.
  - **Packs named together load in the order given, and the first pack wins.** `rsaj,generic` loads RSAJ's STATED values
    and then fills the generic rest.
- **Each run is one transaction.** It takes the organisation's row lock (`FOR UPDATE`), as `prisma/rsaj/registration-seed.ts`
  does.
- **Audit.** Every write is one `AuditEntry` with a SYSTEM actor (`Starter pack: Generic v1`, `Starter pack: RSAJ v1`,
  `Development fill (founder's instruction 2026-10-23)`). It records the before and after, `whereItComesFrom`, and the
  governing source.
- **Dry run by default.** Without `--apply` the command prints what it would write and what it would skip, and writes nothing.
- **Validation.** Each value is judged by the product's own pure validators where they exist in `src/lib`, for example
  `policyFault` and `channelSettingFaults`. One fault refuses the whole run.
- **Packs load only while two-person approval is off** (D3). A live organisation's configuration changes through people,
  not through an operator's script.
- **At setup:** `prisma/seed.ts` creates the organisation and then loads `STARTER_PACKS`. The default is `generic`; an RSAJ
  deployment sets `rsaj,generic`. The test database is migrated, never seeded, so tests keep the "unset" states they
  assert.

### D2. Approval limits are pre-filled, never in force until a named person confirms them

- The RSAJ pack writes the DAL as an `AuthorityMatrix` **draft**, transcribed from the specification's Appendix B with the
  clause on each rule. It is never an issued row. (The matrix trigger lets an insert of an already-issued row through with
  no issuer; the pack must never use that.) It writes no `AuthorityMatrixMaker` row, because a script is not a person.
- **Confirming means putting the draft in force.** A person first adopts the draft (the existing adopt act makes them a
  maker), then puts it in force. While the switch is on, that second step is a different person (ADR 0034 D15). The
  checklist item "Confirm approval limits" is done only when an issued matrix names its issuer. Until then nothing routes:
  the existing "no matrix in force" refusal stands.
- Evaluation models (FR-EVL-008, FR-EVL-009) load as drafts and are confirmed the same way.
- The pack does not import `src/lib/authority/dal-fixture.ts`, which is for tests only. A test asserts that the pack's
  figures equal the fixture's for every row they share.

### D3. Two-person approval of configuration is an organisation switch

- **The switch.** `SecurityPolicy.twoPersonChanges BOOLEAN NOT NULL DEFAULT true`, added by a new migration.
  - Existing organisations keep it on. A migration never loosens a control.
  - The generic pack sets it off only when it creates the organisation's `SecurityPolicy` row, which happens on a new
    organisation at setup. Setup is before go-live by definition.
  - The development fill turns it off on a demonstration database only, with the founder's instruction as the reason.
- **What the switch covers.** Every configuration kind:
  - `CONFIGURATION_EDIT`, `QUORUM_CHANGE`, `OPENING_PANEL_SIZE` and `BID_SEALING_POLICY`;
  - `SECURITY_POLICY`, `PERMISSION_GRANT`, `ADMINISTRATOR_GRANT`, `ADMINISTRATOR_REVOKE` and `ACCOUNT_CODE`;
  - putting a matrix, evaluation model or rate schedule in force.

  **Never covered:** corrections of the record (`BASELINE_CORRECTION`, `AWARD_TERM_CORRECTION`,
  `CONTRACT_DATE_CORRECTION`, `AWARD_RETURN_CORRECTION`) and `CLASSIFICATION_DOWNGRADE`. These change records with legal
  weight, not settings. They stay two-person always.
- **While it is off:**
  - A covered save **applies at once** in one transaction, run by the same apply function the decision path uses, with the
    person as actor. No `ConfigurationChange` row is written, so that table's guards stay absolute: every row in it is a
    two-person decision.
  - The audit rows carry the reason "Applied without a second person: two-person approval is off".
  - A person may put in force a draft they made. A new migration changes `guard_matrix_issue` and `guard_draft_issue` to
    allow an issuer who is a maker **only when** that organisation's `SecurityPolicy.twoPersonChanges` is false. A missing
    row reads as on. The issue's audit row carries the same reason.
- **Moving the switch:**
  - **Off to on:** one person. It tightens the control.
  - **On to off:** a `SECURITY_POLICY` change that a second person decides, like any other change while the switch is on.
    One administrator can never switch the control off and then act alone.
- **Nothing fakes a second person.** No row names a decider who did not decide.
  - The changes made by one person are exactly the configuration audit rows inside the periods the switch was off. The
    switch's own audit rows bound those periods.
  - A matrix or draft whose issuer is among its makers was put in force by one person, and History says so.
- **The go-live rule.** The checklist's "Before go-live" item is done only when the switch is on. While it is off:
  - Settings shows one quiet chip, "Two-person approval off", to holders of `configuration.issue`;
  - the item links to the list of changes made by one person.

  RSAJ's NFR-SEC-004 and FR-APR-020 are met from the moment the switch is on.
- **Pending proposals.** Turning the switch off decides nothing. A proposal made while it was on stays waiting. Its proposer
  may withdraw it and save again.

### D4. The Getting-started checklist replaces "unset closes it" on screen, not in code

- **The checklist.** `/configuration` becomes the checklist. Its items are defined in code: they are product structure, not
  customer policy. `src/lib/setup/checklist.ts` is pure and works from facts that `src/lib/setup/checklist-repo.ts` reads.
- **Two kinds of item:**
  - **set:** done when the rows exist;
  - **confirm:** a pre-filled value, done when a named person has put it in force (D2).

  The plan lists the items.
- **The null checks stay.** `whatIsMissing`, `unsetSettings`, `assessQuorum` and every "not set refuses" gate stay as they
  are. A deleted check would become an implicit default in code, which breaks rules 1 and 2. A setting stops blocking
  because a pack gave it a value, not because the check went away.
- **Where a gap shows:**
  - **Staff:** one banner per Settings section, counting that section's checklist items still to do. On the edit pages an
    unset value reads plain "Not set". An act that is refused still names the setting (NFR-USE-002).
  - **The public:** never. The public portal shows no list of what is missing. A closed register says "Registration opens
    soon" with the help contact, and offers no Apply button.

## Consequences

- **Easier:**
  - A new organisation opens with working sign-in, upload rules, classes, supplier lists and limits.
  - An RSAJ organisation also gets every value its documents state, with the clause, after one dry run and one apply.
  - The founder's database can open its registration without a second account.
- **Harder:**
  - Two security triggers change. The migration is a security-reviewed step.
  - A wrong STATED value now arrives pre-filled. The mitigations:
    - every entry cites its clause;
    - the DAL and the evaluation models arrive only as drafts;
    - the product owner reviews the pack against the specification before its first load.
- **Ruled out:**
  - a pack that overwrites a set value;
  - a pack loaded into a live organisation (switch on);
  - any default in product code;
  - a configuration-gap list on the public portal;
  - a "second approval" recorded by anyone but a second person.
- **A second customer** gets the generic pack and the checklist, and never RSAJ's DAL by accident: the RSAJ pack runs only
  when named.
