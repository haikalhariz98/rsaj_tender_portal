# Live demo script (2 Nov 2026)

Three records are prepared in the demo database, each stopped one step before the live act. Sign in with the demo password. Do not approve, start or move anything on these records before the demo. Use a private window per person, or sign out between people.

Starting-state screenshots: `C:\Users\MOHAMA~1\AppData\Local\Temp\claude\c--Users-MohamadHaikalHarizbi-projects-perolehan\2aa89ad0-6972-46e7-8fb0-199c5c2c82a5\scratchpad\demo-prep\` (`req-1..3`, `com-0..1`, `work-1..2`, all `.jpg`).

| Module | Record | URL |
| --- | --- | --- |
| Requisition | DEMO/REQ/0064/2026, "Pump spares, Zone A", RM800 | http://localhost:3000/requisitions/cmvypl81v01f5s4kcycx86da7 |
| Committee | Quotation Committee sitting DEMO/SIT/11/2026, 2 Nov 2026, Scheduled | http://localhost:3000/committees/cmvypp81y01gos4kcsyaclcjt |
| Project | Site instruction SI 4 on contract XI202600799 | http://localhost:3000/projects/demo_con3?stage=project&tab=work&item=SI-4 |

Check before you start: the dev server is up, and the demo clock still says 2 Nov 2026 (a sitting cannot start before the day it is dated).

---

## 1. Requisition: approval at Head of Department

State now: Pending approval, waiting at Head of Department for Imran Hakim. Route is one step, Head of Department approve, under rule "Requisition, up to RM1,000" (clause DEMO 3.1(a)).

Sign in as **demo.imran.hakim** (Head, Northern Region).

1. Open the requisition URL. Header shows "Pump spares, Zone A", badge Pending approval, RM800, and an **Approve** button.
   Say: "A Maintenance Engineer raised this, the Section Head and I endorsed it, the budget was checked against Northern minor works, and it went to approval."
2. Click the **Approval** tab. Route: Submitted (done), Head of Department (Awaiting decision, waiting now), Approved (not reached yet).
   Say: "At RM800 the system picks the route from the value band. Nobody typed this route."
3. Click **How this route was chosen**. It shows the rule "Requisition, up to RM1,000", the value band, "Within budget", funder's rules "Did not apply".
   Say: "Every route is explained. Change the amount and the route changes with it."
   Heads-up: it also shows "1 note to check: chain as entered, not checked against core routing". That is an honest configuration warning, not an error. If asked: "The system is saying nobody has yet decided whether this rule takes its chain from the core routing. The customer decides that in the approval matrix."
4. Click **Approve**. A drawer opens with Decision, Decided on, and a password field.
5. Choose Decision **Approved**, keep Decided on as 02 Nov 2026, type Imran's password, click **Record decision**.
   Expect: status Approved, all steps done, RM800 committed on OPX26-063 (Budget and checks tab), new History entries.
   Say: "Re-entering the password is the signature. Who decided and when is in History and cannot be edited."

Do not click **Escalate** (conflict of interest path).

---

## 2. Committee: Quotation Committee sitting

State now: DEMO/SIT/11/2026, Quotation Committee, 02 Nov 2026, Scheduled, "Quorum 2 required", simple majority of votes cast. One matter tabled: "Approval: Pump spares, Zone A supplier list" (Requisition, act Approve, Pending, not linked to a record).

Members: **Bala Krishnan (Chairman, Finance Director)** and **Daniel Anak Jelani (Member)**. Quorum is 2 of 2, so both must be marked present. Nobody has to sign in as Bala or Daniel: the Secretariat (Chen) marks attendance and records each member's vote from the paper sheet. If a member does sign in, he can vote for himself only.

Sign in as **demo.chen.wei.ling** (Head of Contract and Procurement, Secretariat).

1. Open the sitting URL. Status Scheduled; tabs Agenda and decisions (1), Attendance, Minutes, History. Attendance shows "Taken when the sitting starts".
   Say: "The Secretariat scheduled the sitting and tabled the matter. Nothing can be decided yet."
2. Click **Start**. Status In progress, "0 of 2 present".
3. Click **Attendance**, then **Present** on Bala Krishnan. Header: 1 of 2 present. Back on **Agenda and decisions**: "Not quorate, 1 of 2 required members present", and **Record outcome** is greyed.
   Say: "No quorum, no decision. The system enforces it."
4. Attendance: **Present** on Daniel Anak Jelani. Agenda now reads "Quorate, 2 of 2 required members present".
5. On the matter click **Agree** beside Bala Krishnan, then **Save vote** (a "date on the signed sheet" field shows, leave it at 02 Nov 2026). Repeat for Daniel Anak Jelani. Tally: 2 agree, 0 disagree.
   Say: "Chen is recording from the signed paper sheet. Members with their own sign-in cast their own."
6. Click **Record outcome**, choose **Carried**, confirm. The matter shows Carried, decided on date, voting rule, "Quorum at recording: 2 required", "2 counted, 0 recused".
   Say: "The outcome has to follow the votes. Recording Not carried now would be refused."
7. Click **Minutes**, click **Upload** beside Minutes, choose a PDF. A stand-in is ready at `C:\Users\MOHAMA~1\AppData\Local\Temp\claude\c--Users-MohamadHaikalHarizbi-projects-perolehan\2aa89ad0-6972-46e7-8fb0-199c5c2c82a5\scratchpad\demo-prep\sitting-minutes.pdf`. Any PDF works.
8. Click **Mark as minuted** (top right, greyed until minutes are uploaded). Status Minuted, register frozen.
   Say: "Once minuted, the register, votes and decisions are frozen."

Notes: the sittings list also shows older Quotation Committee sittings dated today (SIT/8 Minuted, SIT/9 and SIT/10 Cancelled) left over from QA. Open SIT/11 from the link. Do not click the two unlabelled icon buttons next to Start (edit and cancel the sitting).

---

## 3. Project: site instruction SI 4 on contract XI202600799

State now: "SI 4 · Install temporary barrier at valve chamber 3", Site instruction, To do, assigned to Bala Krishnan, due 05 Nov 2026, Normal priority, location "Valve chamber 3", raised by Chen Wei Ling, badge **Not shared**. Contract: Valve keys and chamber covers, Contoh Supplies Enterprise, RM36,000.

### Bala, sign in as **demo.bala.krishnan**
1. Open the item URL (or **My work**). Drawer: Status To do and a **Start** button.
   Say: "Chen raised a site instruction and assigned it to me."
2. Click **Start**. Status In progress; the button becomes **Send for review**.
3. Click the round **...** button beside the status, choose the share option. A confirm asks "Share with Contoh Supplies Enterprise? ... This can't be undone." Click **Share**. Badge becomes Shared.
   Say: "Sharing is deliberate and cannot be taken back. Until then the contractor sees nothing."
4. In the comment box choose **Internal note** (the Reply / Internal note choice only appears once an item is shared), write "Check the isolation valve is closed first", click **Add note**. It appears in Activity marked internal.
   Say: "The contractor sees replies but never internal notes."
   Order matters: before sharing there is no audience choice, because an unshared item is internal anyway. If you want to show Internal first, post a plain comment before step 3 and say "everything is internal until it is shared".
5. Click **Send for review**. Status In review.

### Chen, sign in as **demo.chen.wei.ling**
1. Open the item URL. Status In review, **Mark done** enabled (Chen raised it).
   Say: "I raised it, so I decide when it is finished."
2. Click **Mark done**. Status Done; the item leaves the Open list (Done filter).

Do not use Chen's **Start** on a To do item, and do not change status from the list-row dropdowns during the demo.

---

## Risks

- Approve, Record decision, Share and Mark as minuted have no undo from the UI. To redo the committee demo, schedule a fresh Quotation Committee sitting dated today.
- Not re-performed on the prepared records, because that would use them up: Start, attendance, votes, outcome, minuting and Bala's Start, Send for review, Internal note and Share. They are taken from the QA run on SIT/8 (screens and results documented in `docs/qa/sourcing-committee-qa.md`), from the move rules in `src/lib/work/move.ts`, and from the screens as they stand (buttons present and enabled).
- Saves can take several seconds after the dev server has been idle (one item save took 8 seconds). Wait, do not click twice.
