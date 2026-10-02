# 0017 — The opening is a record of a paper opening: two recorded authorisations, the box judged by its lock, offers written only by the opening's acts

**Status:** Accepted (product owner, 2026-10-02, with 6.7 at 8361948; proposed with 6.7 (2026-10-02), under the 6.7 rulings C-1..C-13 and OD-1..OD-11
(`docs/notes/plans/phase2-rulings.md` §6.7; decisions log "· 6.7 ·" entries). Plan: `docs/notes/plans/6.7-bid-opening.md`.)
Builds on ADR 0012 (the sealed estimate), 0014 (the window's phase from instants) and 0016 (the envelope register).

## Context

The customer opens bids on paper. A committee's panel unlocks the tender box after the closing, empties it, opens each
envelope in turn, reads the offer aloud, initials it, checks it against a list of documents, signs a schedule of tenders
(Jadual Tawaran) and files it. FR-OPN-001..011 ask the portal to record that sitting: who sat, that two people authorised the
opening, the offers as read, what was missing, the schedule and its Grand Summary, and that nothing changes afterwards.

What the portal cannot do in Phase 2 shapes the record. Nobody signs in (NFR-SEC-001), so "two officers authorised it" cannot
be proved: an officer types both names. The register holds no offer before opening (ADR 0016), so the offer's first and only
writer is the opening. The tender box's lock is a server-stamped event recorded by 6.6, but a bid may have been put in the box
up to that instant: whether a box envelope is in time is a question of the lock, not of when an officer types it in. And the
company estimate is sealed until the opening (ADR 0012), with its paper copy in the box beside the bids.

## Decision

1. **An opening is its own record (OD-6 A).** `Opening` (main, or supplementary for one admitted late envelope, OD-5) with its
   sittings, panel (seat and unit snapshotted), authorisations, offers (`OpenedBid`), initials, checklist answers, signatures
   and the copy explanation. Its rules — the committee, panel size and independence rule, completeness and unpurchased-bid
   consequences, the minimum, alternatives, restriction, the estimate's requirement — are read when it starts and frozen on it
   (`policySnapshot`), as is its checklist (the approved pack's mandatory parts a bidder returns, then every issued addendum).
   A supplementary opening uses the main opening's checklist and rules.
2. **Two recorded authorisations, never called dual control (C-2, OD-1 A).** Each is one present panel member's own act,
   stamped by the server, recorded on their behalf, not signed. The second distinct present member's authorisation opens the
   box (the main opening writes 6.6's `UNLOCKED_FOR_OPENING` event and the exercise becomes Opening in progress) or lets a
   resumed sitting record again. Adjourning lapses an unpaired authorisation (kept, marked lapsed); resuming needs two fresh
   ones. The box and its key remain the control; the screen says so. The authenticated half waits for sign-in (a stated
   departure from §13.4).
3. **The closing second (OD-11).** The box is refused at the closing second itself (a bid recorded in that second is in time,
   BD-66-3) and opened from the next second. Every act reads the server's clock once, at its entry, to the second (6.6 CR-3).
4. **A box envelope is in time by the lock (C-3).** It is registered at the main opening, after the box is opened and before
   any envelope is opened. Its `receivedAt` is the `LOCKED` event's server stamp (an upper bound, labelled "In the box when it
   was locked at …", never a receipt time), `receivedSource` is `BOX_AT_OPENING` (a CHECK ties it to the opening that registered
   it) and `recordedAfterClosing` is stored true. Any gap between the closing and the lock is a finding shown to the panel and
   frozen on the schedule, with no tolerance constant. 6.6's "recorded after the closing is late" governs envelopes an officer
   receives; the box is the specific rule.
5. **The offer is written only by the opening's acts (C-4, OD-2).** `openEnvelope` creates an offer and is the one writer of an
   envelope's party; `recordAlternative` adds an alternative found inside; `correctAsRead` alone changes what was read, before
   finalising, with the reason and fresh initials (OD-10). A source scan holds each to its writer. A price as read is SULIT: it
   appears only on the Opening and Schedule sections, the print and (later) evaluation, each chipped "SULIT · not restricted
   until sign-in", never on a list, the dashboard, the activity feed or an export; the trail keeps it under a registered key.
6. **The panel judges only on eliminatory grounds.** A verdict is "carried to evaluation" or "not carried", the latter only
   where a rule makes a ground eliminatory (a missing document where the method eliminates an incomplete bid; no live
   purchase, or not invited, where the method eliminates such a bid; a restriction not evidenced; an alternative the documents
   do not permit). A rule that reports instead carries the bid and says what is reported. There is no free "other" rejection: a
   concern goes in the minutes for the committee. A changed checklist answer clears the verdict.
7. **Finalising freezes the paper, and only then discloses the estimate (C-1, C-5, OD-2 A).** Every check runs first and never
   depends on the figure typed from the estimate's paper copy; only then, in the same transaction, the estimate is disclosed
   through 6.2's `disclose`, its figures read through `readSealedFigures` (the opening's one call), the paper copy compared with
   the lodged version (MATCH, MISMATCH, NOT_IN_BOX, all frozen), the schedule and Grand Summary frozen, and a main opening moves
   the exercise to Opened. A MISMATCH or NOT_IN_BOX never refuses finalising: it is a finding that holds evaluation and the award
   back until its explanation (its own record, once, never edited). The signed schedule's scan is attached only after
   finalising (the paper carries the estimate's row), on the document store with the opening as its owner.
8. **Nothing changes once finalised (FR-OPN-011).** Every act but the copy explanation judges the opening's state first; a
   late tender admitted afterwards is opened at its own supplementary opening, whose offer is added to the schedule as the next
   version, every earlier version kept as frozen.
9. **What is the customer's is configuration, unset never a default.** The opening committee and the unpurchased-bid
   consequence per method; the panel size and independence rule per committee (a member's unit on the person, checked against
   the structure); how the schedule counts the tenderers invited (OD-9) and the Grand Summary's words. Unset blocks the act it
   governs, naming the setting — except the independence rule, under which a panel is assigned with the warning "Independence
   rule not set; panel not checked", frozen on the opening (C-6), and the words, which read the product's own.
10. **The award follows the opening (C-7, C-8).** For an exercise published through its window with tender or quotation
    documents, an award is opened only once the exercise is Opened, its openings finalised with their scans, any copy finding
    explained and every admitted late tender opened; it names its awardee as a party carried to evaluation (`awardeePartyId`),
    compared by identity, never by registration text.

## Consequences

- The record says exactly what it is: who was named, what was typed, when the server saw it. It does not claim that two
  people acted, that a price was restricted, or that the box was sealed; each screen says so.
- The estimate stays sealed until the instant the schedule is frozen, and the figure on its paper copy cannot be used to probe
  it: a refusal reads the same for any figure, and a typed figure is never stored before the comparison.
- A gap between the closing and the lock is visible forever on the schedule; a customer that wants a tolerance has to say so,
  and the product would add it as configuration.
- Prices are on screens no sign-in protects; only the absence of broadcast surfaces limits them. Sign-in (and NFR-SEC-002's
  restriction) closes that, with the authenticated half of the two authorisations.
- 6.8 starts from `evaluationSet()`: the carried offers of finalised openings. Its supersession hook (C-11, E-7) attaches to
  this module's finalise in 6.8.
- Cancelling after the opening is a window change (C-9): from Opened, or Opening in progress only once adjourned; the opening's
  rows are kept, and an undisclosed estimate stays sealed.
