# Product owner rulings on the workspace 3b-i security audit (2026-10-30): BINDING

These rule on the product decisions raised by the security audit of workspace 3b-i. That is the stage where work items are shared with the
contractor through the supplier portal. They are read with the plan `docs/notes/plans/workspace-3b-build-plan.md`, ADR 0049 and the rulings WB-1 to WB-13
(`workspace-3b-po-rulings.md`). The product owner takes them for the founder. They are numbered WSEC-n so they never collide with WS-n or WB-n.
Where a ruling amends a WB ruling, the plan or the ADR, that text is read as amended.

**"Build now"** means the 3b-i fix round, before 3b-i is accepted (WB-1). It is not a signal to restart builders. **"Backlog / go-live"** means a row
in `docs/notes/backlog.md`.

**For the founder:** no new questions. Nothing here reverses one of his answers. Q1 (OQ-B5) and Q2 (OQ-B9) of the WB rulings are unchanged and
still his. WSEC-1 holds under either answer to Q2.

## Rulings

- **WSEC-1 (H1). Confirmed. On the server, a comment or file post with no audience is Internal. A post made against a stale share state is refused
  (409).** Build now.
  - **Server default:** in `commentAudience`, a missing `choice` on a shared item becomes `"INTERNAL"`, not `DEFAULT_AUDIENCE`.
  - **Composer:** `DEFAULT_AUDIENCE` stays the composer's preset (0008 §4.5, WB-9). The composer always posts an explicit value, so no screen
    default changes.
  - **Stale page:** the comment and file-attach posts carry the share state the page was drawn with, like the `expectedFrom` pattern. When it
    differs from the locked row, the server refuses with 409 CHANGED: "This item was shared a moment ago. Check before sending."
  - **Moves:** the Send back / Ask again comment is unaffected. It already takes its audience from the item's party state, not from a choice
    (`commentAudience(..., "SEND_BACK")`). The only staff comment inserts are `store.ts` `comment` and the send-back in `store.ts`. A cancel reason
    is not a comment.
  - *Why:* sharing is one-way (ADR 0049 D1), so a leak cannot be taken back. A missing value that resolves to the more public audience is a quiet
    promotion ("gaps stay honest"). This does not reverse the founder: his default is a screen preset, and it is kept.
  - *Lands:* `src/lib/work/audience.ts` (`commentAudience`, with a table test for a null choice on a shared item); `store.ts` `comment` and staff
    attach (the share-state check under the lock); the staff routes; a db test for the concurrent share, both on a comment and on an attach.

- **WSEC-2 (M1). Amends WB-7: an S.O. holder in force names the first Project manager, and S.O. holders keep the right to change the team.** Build now.
  - **Who may change the team:** the Project manager, and the S.O. holders and acting holders in force on the organisation's today.
  - **No lead:** with no lead (no PM, and no S.O. in force or no time zone), nobody may change the team. "Any staff member who may read the case" is
    withdrawn.
  - **Locked card:** shows 0008 §5.8's existing "Lead not named" state, whose visible words are "No project manager" (warn). Its info popover says what to set: the S.O. in force, or the
    organisation's time zone. No new words go on the card.
  - **Lead rights on items** are unchanged: the PM, else the S.O. holders. This ruling covers changes to the team only and widens no item right.
  - *Why:* under WB-7 any reader could name themselves PM, become the lead permanently and then share any item. Sharing cannot be undone, so the
    first PM must be named by a role the data already defines. This also stays close to the founder's OQ-2, which made the S.O. holders the lead. A
    new capability was not chosen because no act yet enforces the capability grid, so it would be new scope. Excluding sharing from lead rights was
    not chosen because it leaves the self-named lead in place for every other act.
  - **Consistency:** without a time zone every contractor act is already refused (`DAY_NOT_KNOWN`, B-14), so locking the card there matches.
  - **Test:** the test pinning "no lead: anyone may change the team" is rewritten to "no lead: refused" because the rule changed. The rule was not
    weakened.
  - *Lands:* WB-7 (read as amended); plan B-12 "Who may change the team" and the step-3 handoff note that has the manager *replace* the S.O. as the
    one who changes the team; `team.ts` / `lead.ts` (a pure `teamChangeFaults`, with a table test for PM, S.O., both, neither, inactive PM and no
    time zone); the team acts in `store.ts`; the Team card. The demo seed already sets a time zone and S.O. rows, and names its PM through a lead; it must still do so once this lands.

- **WSEC-3 (M2). Accepted and documented: one item number on both sides.** Build now (the ADR text and one check).
  - **ADR:** ADR 0049 gains a consequence. Item numbers run per contract and type over all items (WS-1), so from the gaps the contractor can infer
    how many unshared items of a shared type exist and how fast they are raised. Their content stays hidden.
  - **Not built:** a separate portal sequence.
  - **Check:** the portal and the staff screens render the type label and number ("Incident 3"), never the raw reference key ("SAFETY_INCIDENT-3").
    The reference stays as it is in addresses and in route values.
  - *Why:* one number that both sides quote is what makes a site record traceable. Two numbers for one RFI would be a correctness risk in a dispute.
    Less scope over guessed scope.
  - *Lands:* ADR 0049 Consequences; the screen check under AGENTS.md rule 5 (portal Work tab and drawer, staff panel). Backlog row: "Revisit a
    separate portal number if a customer treats internal item volume as sensitive."

- **WSEC-4 (M3). Confirmed: a Send back that becomes a Reply shows the "{contractor} will see this" marker.** Build now.
  - *Why:* honesty on screen. A contractor-visible comment must never look internal (0008 §4.5's tint and lock icon).
  - *Lands:* the staff send-back drawer reads `commentAudience(..., "SEND_BACK")` and shows the shared marker; a screen test on a contractor-held item.

- **WSEC-5 (M4). Refused: on a Done or Cancelled item the contractor cannot reply, attach or answer.** Build now.
  - **Portal drawer:** a closed item shows no composer, no attach and no answer field (WB-5: no control that is always refused).
  - **Server:** the cores refuse, as the backstop for a stale page. The words come from `portalMoveFaultText` and name no staff.
  - **If something is still open:** the contractor raises a new item, or staff reopen the item.
  - *Why:* files cannot be removed from a shared item (WB-4), and nobody watches a closed item. Allowing posts there would add permanent records
    that nobody reads. Refusing is less scope than "allow, notify and mark", and it is reversible.
  - *Lands:* `src/lib/work/portal.ts` (`portalAction` / `mayAnswer` false when closed); the reply, attach and answer cores in `portal-store.ts`; a
    portal screen test and a db test for each core.

- **WSEC-6 (M5). Both: the go-live condition covers work-item files, and staff see "Not scanned".**
  - **Backlog / go-live:** backlog rows "Malware scanning of every upload (NFR-SEC-007)" and "Scanning at upload for every document version" name
    contractor uploads to work items. Before go-live, a scanner inspects them, and the staff download refuses a file whose scan is not clean.
  - **Build now:** each work-item file, staff side and portal, shows the existing scan label, as the project Documents tab does (`scanLabel`,
    "Not scanned"). This reuses the label and adds no new wording or component.
  - *Why:* NFR-SEC-007. A gap is shown as a gap: a contractor file must not look as trusted as a staff one.
  - *Lands:* `docs/notes/backlog.md` (both rows); the work-item file list on staff and portal; a screen test.

- **WSEC-7 (L4). The throttle is per supplier per contract, and answer edits count against the reply bound.** Build now.
  - **Count:** across all of the awardee's accounts on that contract, counted under the contract lock the core already holds.
  - *Why:* the contractor is a party as the company (ADR 0049 D2). An answer edit writes an audit row, so it needs the same bound. The bounds stay
    technical, not policy.
  - **Upload staging** (`work/upload`) moves to the same per-supplier count, so no per-account bound is left.
  - *Lands:* `src/lib/work/bounds.ts` (constants and reasons); `portal-store.ts`; throttle tests for two accounts of one supplier and for answers.
    The lock-order scan stays green.

- **WSEC-8 (PDPA / WS-11). The team card tells staff that the contractor may see the names on it. The disclosure's purpose is recorded.** Build now:
  the popover and the ADR line. Backlog / go-live: the customer's notice.
  - **Popover:** an info popover on the Team card reads "{contractor} may see these names on shared items." The portal names a team member only where they act on or hold a shared item (`portalStaffLabel`, WS-11); it never lists the card. No line is added to the card.
  - **Purpose (product side):** to tell the contractor whom to deal with on the contract. It is recorded in ADR 0049 and in the PDPA data-map
    backlog row.
  - **Customer side:** whether the customer's employee privacy notice covers this disclosure is the customer's call as data controller. It is a
    go-live / RSAJ question, not product wording.
  - *Why:* a disclosure made by a setting should not surprise the person who sets it. Product and customer duties stay separate (AGENTS.md:
    product, not one customer's system).
  - *Lands:* the Team card; ADR 0049; the backlog PDPA data-map row; the RSAJ questions list.

- **WSEC-9 (WB-6). Confirmed as intended: the contractor's draft answer is saved to the shared row.** Build now: one label.
  - **Label:** until the item is sent for checking, the staff Answer carries a "Draft" badge; its popover says {contractor} has not yet sent it for checking.
  - **Accepting:** the Done shortcut is refused while the contractor holds the item. A staff member who takes the item back and closes it accepts the answer text as it stands, and that act is audited.
  - *Why:* one field and one row (WB-6). The label keeps a draft from reading as a submitted answer.
  - *Lands:* the staff item panel (Answer field); a screen test.

- **WSEC-10 (L1, L2, L3, L5, L6). Confirmed: fixed as the audit says.** Build now.
  - **L1:** the portal waiting row is keyed on the item reference, not the cuid.
  - **L2:** for a staff-raised item, the contractor's export gives `sharedAt`, under the label "Shared on", never "Raised on".
  - **L3:** the portal order drops internal priority.
  - **L5:** a database trigger backs up the pin on `DocumentAttachment` work-item files (PA047 widened, WB-4).
  - **L6:** "Seen by {contractor}" becomes "Visible to {contractor}", because there are no read receipts.
  - *Why:* none of these changes a rule. Each removes a leak or an overstatement.
  - *Lands:* `portal-read.ts`; the supplier export; `portal.ts` ordering; a migration and its db test; `labels.ts`.

## Where each lands

| Ruling | Build now | Backlog / go-live |
|---|---|---|
| WSEC-1 | `audience.ts`, `store.ts`, staff routes, db test | — |
| WSEC-2 | WB-7 amended, plan B-12 and step-3 note, `team.ts`/`lead.ts`, Team card | — |
| WSEC-3 | ADR 0049 consequence; label-not-key check | Separate portal number, if asked |
| WSEC-4 | Send-back drawer marker | — |
| WSEC-5 | `portal.ts`, `portal-store.ts`, portal drawer | — |
| WSEC-6 | Scan label on item files | Malware rows extended to work-item files |
| WSEC-7 | `bounds.ts`, `portal-store.ts` | — |
| WSEC-8 | Team card popover; ADR 0049 purpose | PDPA data map; RSAJ privacy-notice question |
| WSEC-9 | Draft label on the staff Answer | — |
| WSEC-10 | L1, L2, L3, L5, L6 | — |
