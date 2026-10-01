# 0015 — The name route approves a frozen invitee list

**Status:** proposed 2026-10-01 with 6.5, under rulings OD-4 A and OD-12 (`docs/notes/plans/6.5-invitation-window.md` §8;
decisions log "· 6.5 ·" entry) and the NameRouteInvitee Restrict ruling. Builds on 6.3's name route and the
close-out condition CO-8 (`invitationFault`).

## Context

FR-MTD-008 asks that the firms a selective method invites have their names approved before they are invited. 6.3 built the
approval of the name as an engine route on the exercise (`name_approval`), but the route recorded no names: it approved
"the name" of an exercise whose proposed contractors could change afterwards, and nothing tied the letters later issued to
what was approved. 6.3 also refused a committee step on that route (BD-7), carried to 6.5. With 6.5 the invitation itself
is issued by the portal (FR-ADV-002), so the list it goes to must be the list that was approved.

## Decision

1. **Asking for the name freezes the list on the route.** `requestNameApproval` reads the exercise's proposed invitees
   (`ExerciseParty`, source PROPOSED_INVITEE) under the exercise's lock and writes one `NameRouteInvitee` per contractor
   (name and registration number as they stood) with the route, in the same transaction; with no proposed invitee it
   refuses (NAME_NO_INVITEES). The rows are written once and never edited, and the route cannot be deleted while they
   stand (Restrict).
2. **The invitation goes to exactly that list.** Publication on the invited path requires the method's name approval
   (`invitationFault`) and that the latest approved route's frozen list is the proposed list, compared by registration
   number (`inviteeListFault`: LIST_CHANGED with what was added and removed). A route approved before lists were recorded
   approved no list (LIST_NOT_RECORDED, OD-4 A): the name is asked for again with the list. Each letter records the route
   it was issued on.
3. **Changing the list withdraws the route.** Proposing or removing an invitee while a name route is pending or approved
   recalls it ("Withdrawn on change"), with its audit row: it no longer describes the exercise. Once invited the list is
   frozen (LIST_FROZEN); the exit is cancelling the exercise and opening a replacement linked to it (FR-ADV-016).
4. **A committee step on the name route is discharged by citation (OD-12, lifting 6.3 BD-7).** Only a matter tabled as an
   exercise matter against this exercise, on the approval of the name, before the step's committee, for the step's act,
   decided no earlier than the route opened and not already cited (`nameCitationFault`); what the committee decided is read
   from its record (carried discharges, not carried refuses the route, deferred waits). A person's decision on a committee
   step stays refused (6.1's `deciderFaults`).

## Consequences

- What was approved can be shown and compared at any time: the route's frozen list beside the proposed one.
- A list edited after approval cannot be invited by mistake; it costs a new request, which is the point.
- Name routes approved under 6.3 (before this module) cannot be invited on until asked again with their list.
- 6.6–6.8 read the invitees through the letters and their route, never through a re-derived list.
- The supplier register (6.15) will link `ExerciseParty.vendorId`; until then contractors are matched by registration
  number as typed, and the comparison says so.
