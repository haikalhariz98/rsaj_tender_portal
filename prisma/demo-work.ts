/**
 * Work items demo (workspace 3a step 6, WS-22; plan workspace-3a-build-plan.md §5 "Step 6"). Invented throughout; it sets no policy.
 *
 * On demo_con3 (XI202600799, active), the only demo contract executed and not practically complete when the load ends (a Defect raised from practical
 * completion on needs its observed day and due day, WB-12 lifted OQ-4's refusal; demo_con13 is closed by stage C), two rounds of items, each holding every one of the seven types:
 * late items (due before the load day), unassigned items, a cancelled task with its reason, an action In review, done items inside and outside the Board's
 * 14-day Done window, an answered RFI, a failed inspection (the NCR view), a send back, item links and comments.
 *
 * Written through the real cores of `src/lib/work/store.ts` (raise, edit a field, move, comment, link), under the real `withLockedContract`, inside `act()`
 * (prisma/demo-acts.ts) for the demo clock and `demo_` ids; so numbering, status with `closedAt`, `cancelReason`, the audit rows with the Work label prefix,
 * the attributions and the notices are the acts' own. The server actions of `work-actions.ts` are not called: under a loader `staffForAct` answers the
 * loader's actor, which holds no person, and the cores write the raiser, commenter and linker from the actor and judge every move by it. So each act runs
 * as the loader's system actor (its audit rows say "demo loader", as every demo act's do) carrying the demo person it is recorded for, who is also named
 * to `beginAct` (recorded on behalf, as the other demo acts are).
 *
 * Dates: the recent acts are relative to the load instant (so "Done this fortnight" and Late read right on the day the demo is loaded); the old ones are
 * fixed early in October 2026, after the contract was stamped (1 Oct), so they stay outside the Done window. The organisation's time zone is the demo's
 * (set by `demo:load` where none is set), without which nothing reads Late.
 *
 * demo_con15 (practically complete, Work still open) is NOT the contract WS-22 asks for (executed, not practically complete: only demo_con3 is); it holds the six types other than Defect (`loadSecond`; step 12 decides whether it gains the seventh).
 * Accepted by the orchestrator (decisions log, 2026-10-30): WS-22's "two executed, not-yet-PC contracts" is met by demo_con3 (all seven types) and demo_con15
 * (practically complete, so it holds six types: WB-12 lifted OQ-4's refusal); a second ACTIVE demo contract is not built. `npm run demo:work` adds whichever round a loaded database does not hold yet.
 *
 * Ids: WorkItem demo_wki*, WorkItemComment demo_wkc*, WorkItemLink demo_wkl*, StaffNotice demo_wkn*, ProjectTeamMember demo_wtm*, DocumentAttachment demo_wka*, and the
 * staged files demo_wkd* (ACT_PREFIX; grepped free). Each round runs once: the 3a rounds where demo_con3 holds no work item, the 3b round (`loadSharing`, the contractor's
 * side) where it has no Project team and no shared item.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { act } from "./demo-acts";

type Db = PrismaClient;
const P = "demo_";
/// The one demo contract that is executed and not practically complete once the load ends (demo_con13 is closed by stage C; the rest are before execution, complete or ended).
const CON = `${P}con3`;
/// A second contract with Work open (not the one WS-22 asks for): practically complete, where Work is still open; a Defect now needs its observed day and due day (WB-12 lifted OQ-4), and it holds the other six types.
const CON2 = `${P}con15`;
const people = { aisyah: `${P}p1`, bala: `${P}p2`, chen: `${P}p3`, daniel: `${P}p4`, eng: `${P}p5`, gopal: `${P}p7` };

type Fields = Record<string, string>;
type Core = (c: import("../src/lib/work/store").WorkCtx, who: import("../src/lib/auth/types").StaffActor, a: import("../src/lib/auth/act-begin").PreparedAct | null) => Promise<unknown>;

/// One work act, through the store's core, at its instant, recorded for `personId`. `slot` is the act's attribution where it has one.
async function run(organisationId: string, contractId: string, when: string, what: string, personId: string, slot: string | null, core: Core): Promise<void> {
  const { beginAct } = await import("../src/app/_auth/act");
  const { loaderActor, loaderLabel } = await import("../src/app/_auth/loader");
  const { withLockedContract } = await import("../src/lib/contract/repo");
  const { dayOf } = await import("../src/lib/dates");
  const { WorkRefused } = await import("../src/lib/work/store");
  const { toSecond } = await import("../src/lib/bids/lateness");
  await act(when, `work: ${what}`, async () => {
    const who = { ...(await loaderActor(loaderLabel()!)), personId };
    let prepared = null;
    if (slot) {
      const form = new FormData();
      form.set("personId", personId);
      const begun = await beginAct(who, form, slot, { personField: "personId", onBehalf: false });
      if (!begun.ok) return begun.state;
      prepared = begun.act;
    }
    const now = toSecond(new Date());
    try {
      const done = await withLockedContract(organisationId, contractId, (tx, l) => core({ tx, l, now, today: dayOf(now, l.org.timeZone) }, who, prepared).then(() => true));
      return done ? { ok: true } : { ok: false, message: `${contractId} is not loaded` };
    } catch (e) {
      if (e instanceof WorkRefused) return { ok: false, message: e.words };
      throw e;
    }
  }, {});
}

/// The demo has no page to have seen a share state: it reads the item's own, inside the act (WSEC-1's `expectedShared`).
const sharedNow = async (c: { tx: { workItem: { findUniqueOrThrow(a: { where: { id: string }; select: { sharedAt: true } }): Promise<{ sharedAt: Date | null }> } } }, itemId: string): Promise<boolean> =>
  (await c.tx.workItem.findUniqueOrThrow({ where: { id: itemId }, select: { sharedAt: true } })).sharedAt !== null;

/// The acts on one contract, by the demo people.
function on(organisationId: string, contractId: string) {
  const ids = new Map<string, string>();
  const refs = new Map<string, string>();
  const id = (key: string) => ids.get(key) ?? (() => { throw new Error(`demo work: no item ${key}`); })();
  return {
    id,
    async raise(when: string, key: string, by: string, f: Fields) {
      const { parseNewItem } = await import("../src/lib/work/fields");
      const { createItem } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `raise ${key}`, by, "WorkItem.raisedBy", async (c, who, a) => {
        const form = new FormData();
        for (const [k, v] of Object.entries(f)) form.set(k, v);
        const n = parseNewItem(form, c.l.org.timeZone);
        if (!n) throw new Error(`demo work: ${key}'s form does not read`);
        const made = await createItem(c, who, n, a!);
        ids.set(key, made.id);
        refs.set(key, made.ref);
      });
    },
    async edit(when: string, key: string, by: string, field: string, value: string) {
      const { parseFieldEdit } = await import("../src/lib/work/fields");
      const { editField } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} ${field}`, by, null, async (c, who) => {
        const edit = parseFieldEdit(field, value, c.l.org.timeZone);
        if (!edit) throw new Error(`demo work: ${key}'s ${field} does not read`);
        await editField(c, who, { itemId: id(key), edit });
      });
    },
    async move(when: string, key: string, by: string, from: string, to: string, extra: { reason?: string; comment?: string } = {}) {
      const { moveItem } = await import("../src/lib/work/store");
      const sendBack = from === "IN_REVIEW" && to === "IN_PROGRESS";
      await run(organisationId, contractId, when, `${key} ${from} to ${to}`, by, sendBack ? "WorkItemComment.person" : null, (c, who, a) =>
        moveItem(c, who, { itemId: id(key), expectedFrom: from as never, to: to as never, ...extra }, a),
      );
    },
    async comment(when: string, key: string, by: string, body: string, audience: "REPLY" | "INTERNAL" | null = null) {
      const { comment } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} comment`, by, "WorkItemComment.person", async (c, who, a) => comment(c, who, { itemId: id(key), body, audience, expectedShared: await sharedNow(c, id(key)) }, a!));
    },
    async share(when: string, key: string, by: string) {
      const { shareItem } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} share`, by, null, (c, who) => shareItem(c, who, { itemId: id(key), share: true }));
    },
    async attach(when: string, key: string, by: string, versionId: string) {
      const { attachFiles } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} attach`, by, null, async (c, who) => attachFiles(c, who, { itemId: id(key), stagedVersionIds: [versionId], expectedShared: await sharedNow(c, id(key)) }));
    },
    async team(when: string, by: string, role: import("../src/lib/work/types").TeamRole, personId: string) {
      const { addTeamMember } = await import("../src/lib/work/team-store");
      await run(organisationId, contractId, when, `team ${role}`, by, "ProjectTeamMember.addedBy", (c, who, a) => addTeamMember(c, who, { role, personId }, a!));
    },
    /// The item's reference as the portal addresses it (RFI-3), for the contractor's acts.
    ref: (key: string) => refs.get(key) ?? (() => { throw new Error(`demo work: no item ${key}`); })(),
    /// Remember an item the contractor raised, under a key, for the staff acts that follow.
    keep(key: string, made: { id: string; ref: string }) {
      ids.set(key, made.id);
      refs.set(key, made.ref);
    },
    async link(when: string, key: string, by: string, to: { item?: string; documentId?: string }) {
      const { link } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} link`, by, "WorkItemLink.person", (c, who, a) =>
        link(c, who, { itemId: id(key), toItemId: to.item ? id(to.item) : null, documentId: to.documentId ?? null }, a!),
      );
    },
  };
}

export async function loadWorkDemo(db: Db, organisationId: string): Promise<{ notes: string[] }> {
  const { dayOf, dayPlus } = await import("../src/lib/dates");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  if (!org.timeZone) return { notes: ["the organisation has no time zone: the work demo is skipped (nothing would read Late)"] };
  const today = dayOf(new Date(), org.timeZone)!;
  /// The organisation's local day `n` days before the load day, at a wall-clock time (the form `act()` reads).
  const ago = (n: number, hhmm: string) => `${dayPlus(today, -n)}T${hhmm}`;
  const dayAgo = (n: number) => dayPlus(today, -n);

  if (!(await db.contract.findUnique({ where: { id: CON }, select: { id: true } }))) return { notes: [`${CON} is not loaded: the work demo is skipped`] };
  const first = (await db.workItem.count({ where: { contractId: CON } })) > 0 ? [] : await loadFirst(db, organisationId, today, ago, dayAgo);
  return { notes: [...first, ...(await loadSharing(db, organisationId, today, ago))] };
}

/// The two 3a rounds on demo_con3 (and demo_con15's), once: only where demo_con3 holds no work item yet.
async function loadFirst(db: Db, organisationId: string, today: string, ago: (n: number, hhmm: string) => string, dayAgo: (n: number) => string): Promise<string[]> {
  const { dayPlus } = await import("../src/lib/dates");
  const w = on(organisationId, CON);
  {
    // An RFI answered, sent for review by its assignee and closed by its raiser: Done inside the window. Linked to the site instruction it led to.
    await w.raise("2026-10-05T09:00", "rfi", people.eng, { type: "RFI", title: "Bedding material for the 300 mm main at the river crossing", description: "The drawings show granular bedding; the bill of quantities says sand. Which governs?", priority: "HIGH", dueOn: "2026-10-12", assigneePersonId: people.bala, location: "Chainage 0+850" });
    await w.raise("2026-10-06T10:00", "si", people.bala, { type: "SITE_INSTRUCTION", title: "Use granular bedding at the river crossing", description: "Granular bedding, 150 mm under and around the pipe, from chainage 0+800 to 0+900.", dueOn: dayAgo(4), assigneePersonId: people.chen, impact: "COST", location: "Chainage 0+800 to 0+900" });
    await w.link("2026-10-06T10:05", "rfi", people.bala, { item: "si" });
    await w.move("2026-10-06T11:00", "si", people.chen, "TO_DO", "IN_PROGRESS");
    await w.comment(ago(3, "16:20"), "si", people.chen, "Granular material delivered for half the length; the rest is due on Friday.");
    await w.move(ago(4, "09:00"), "rfi", people.bala, "TO_DO", "IN_PROGRESS");
    await w.edit(ago(4, "09:10"), "rfi", people.bala, "answer", "The drawings govern: granular bedding. The site instruction confirms it.");
    await w.move(ago(4, "09:15"), "rfi", people.bala, "IN_PROGRESS", "IN_REVIEW");
    await w.move(ago(3, "08:30"), "rfi", people.eng, "IN_REVIEW", "DONE");
    // An inspection that failed and stays open: the NCR view. A defect raised from it, unassigned and late.
    await w.raise(ago(6, "08:00"), "insp", people.bala, { type: "INSPECTION", title: "Pressure test, section 2", description: "Hydrostatic test of section 2 before backfilling.", dueOn: dayAgo(5), assigneePersonId: people.daniel, location: "Chainage 1+200 to 1+600" });
    await w.edit(ago(5, "15:00"), "insp", people.daniel, "inspectionResult", "FAILED");
    await w.comment(ago(5, "15:05"), "insp", people.daniel, "Pressure fell 0.4 bar in the first hour. A joint weeps at chainage 1+340.");
    await w.raise(ago(5, "15:30"), "defect", people.bala, { type: "DEFECT", title: "Leaking joint at chainage 1+340", priority: "URGENT", dueOn: dayAgo(2), location: "Chainage 1+340" });
    await w.link(ago(5, "15:35"), "defect", people.bala, { item: "insp" });
    // A near miss reported and nobody yet holding it.
    await w.raise(ago(2, "11:00"), "incident", people.chen, { type: "SAFETY_INCIDENT", title: "Trench edge gave way beside the excavator", description: "No one in the trench; the shoring was not yet in.", severity: "NEAR_MISS", happenedAt: ago(2, "10:30"), location: "Chainage 1+450" });
    // An action in review.
    await w.raise(ago(8, "09:00"), "action", people.eng, { type: "ACTION", title: "Send the revised traffic management plan", dueOn: dayPlus(today, 3), assigneePersonId: people.bala });
    await w.move(ago(7, "09:00"), "action", people.bala, "TO_DO", "IN_PROGRESS");
    await w.move(ago(1, "14:00"), "action", people.bala, "IN_PROGRESS", "IN_REVIEW");
    await w.comment(ago(1, "14:05"), "action", people.bala, "Revised plan attached to the transmittal of yesterday; the police have seen it.");
    // Tasks: one raised twice and cancelled with its reason, one done early in October (outside the window).
    await w.raise("2026-10-03T09:00", "taskOld", people.bala, { type: "TASK", title: "Photograph the road before possession" });
    await w.move("2026-10-03T09:05", "taskOld", people.bala, "TO_DO", "IN_PROGRESS");
    await w.move("2026-10-04T17:00", "taskOld", people.bala, "IN_PROGRESS", "DONE");
    await w.raise(ago(3, "10:00"), "taskDup", people.eng, { type: "TASK", title: "Book the pressure test again" });
    await w.move(ago(3, "10:10"), "taskDup", people.eng, "TO_DO", "CANCELLED", { reason: "Raised twice: the defect on the leaking joint covers the retest." });
  }
  // The second round.
  {
    // An RFI awaiting its answer, due later this week; an instruction done this fortnight; a passed inspection done long ago.
    await w.raise(ago(2, "09:30"), "rfi2", people.chen, { type: "RFI", title: "Valve chamber cover rating on the service road", priority: "NORMAL", dueOn: dayPlus(today, 4), assigneePersonId: people.eng });
    await w.raise(ago(10, "09:00"), "si2", people.eng, { type: "SITE_INSTRUCTION", title: "Move the washout to the low point", dueOn: dayAgo(6), assigneePersonId: people.daniel, impact: "NONE", location: "Chainage 1+650" });
    await w.move(ago(9, "08:00"), "si2", people.daniel, "TO_DO", "IN_PROGRESS");
    await w.move(ago(6, "16:00"), "si2", people.daniel, "IN_PROGRESS", "IN_REVIEW");
    await w.move(ago(5, "09:00"), "si2", people.eng, "IN_REVIEW", "IN_PROGRESS", { comment: "The chamber is moved, but the drain to the ditch is not laid yet." });
    await w.move(ago(4, "15:00"), "si2", people.daniel, "IN_PROGRESS", "IN_REVIEW");
    await w.move(ago(4, "17:00"), "si2", people.eng, "IN_REVIEW", "DONE");
    await w.raise("2026-10-02T09:00", "insp2", people.eng, { type: "INSPECTION", title: "Thrust blocks at the bends, before concrete", assigneePersonId: people.eng });
    await w.edit("2026-10-02T11:00", "insp2", people.eng, "inspectionResult", "PASSED");
    await w.move("2026-10-02T11:05", "insp2", people.eng, "TO_DO", "DONE");
    // A first-aid case held by the safety officer; an action late and in progress; a defect not yet due; a task nobody holds, late.
    await w.raise(ago(1, "13:00"), "incident2", people.daniel, { type: "SAFETY_INCIDENT", title: "Cut hand while handling pipe", severity: "FIRST_AID", happenedAt: ago(1, "11:45"), assigneePersonId: people.gopal, location: "Pipe yard" });
    await w.raise(ago(9, "10:00"), "action2", people.eng, { type: "ACTION", title: "Agree the reinstatement standard with the road authority", priority: "HIGH", dueOn: dayAgo(1), assigneePersonId: people.aisyah });
    await w.move(ago(8, "10:00"), "action2", people.aisyah, "TO_DO", "IN_PROGRESS");
    await w.link(ago(8, "10:05"), "action2", people.eng, { item: "si2" });
    await w.raise(ago(1, "15:00"), "defect2", people.daniel, { type: "DEFECT", title: "Kerb chipped at the site entrance", priority: "LOW", dueOn: dayPlus(today, 10), assigneePersonId: people.daniel, location: "Site entrance" });
    await w.raise(ago(7, "09:00"), "task2", people.eng, { type: "TASK", title: "Check the quantities on invoice INV-DEMO-0141", dueOn: dayAgo(3) });
    await w.comment(ago(2, "10:00"), "task2", people.eng, "Still needs someone: the quantity surveyor is on leave.");
    await w.link(ago(2, "10:05"), "task2", people.eng, { documentId: `${P}sic1` });
  }
  return [`${CON}: work items of every type, twice`, ...(await loadSecond(db, organisationId, today, ago, dayAgo))];
}

/// Six of the seven types on the second contract (no Defect: it is past practical completion).
async function loadSecond(db: Db, organisationId: string, today: string, ago: (n: number, hhmm: string) => string, dayAgo: (n: number) => string): Promise<string[]> {
  const { dayPlus } = await import("../src/lib/dates");
  if (!(await db.contract.findUnique({ where: { id: CON2 }, select: { id: true } }))) return [`${CON2} is not loaded: its work demo is skipped`];
  if ((await db.workItem.count({ where: { contractId: CON2 } })) > 0) return [];
  const w = on(organisationId, CON2);
  await w.raise(ago(6, "09:00"), "rfi", people.eng, { type: "RFI", title: "Colour of the line markings at the junction", dueOn: dayAgo(2), assigneePersonId: people.bala });
  await w.raise(ago(5, "10:00"), "si", people.bala, { type: "SITE_INSTRUCTION", title: "Repaint the stop line", dueOn: dayPlus(today, 2), assigneePersonId: people.chen, impact: "NONE" });
  await w.link(ago(5, "10:05"), "si", people.bala, { item: "rfi" });
  await w.raise(ago(4, "08:00"), "insp", people.bala, { type: "INSPECTION", title: "Drainage run-off after rain", dueOn: dayAgo(1), assigneePersonId: people.daniel });
  await w.edit(ago(3, "15:00"), "insp", people.daniel, "inspectionResult", "FAILED");
  await w.raise(ago(2, "11:00"), "incident", people.chen, { type: "SAFETY_INCIDENT", title: "Reversing vehicle struck a cone", severity: "NEAR_MISS", happenedAt: ago(2, "10:30") });
  await w.raise(ago(7, "09:00"), "action", people.eng, { type: "ACTION", title: "Issue the as-built drawings", dueOn: dayPlus(today, 5), assigneePersonId: people.bala });
  await w.move(ago(6, "09:00"), "action", people.bala, "TO_DO", "IN_PROGRESS");
  await w.move(ago(1, "14:00"), "action", people.bala, "IN_PROGRESS", "IN_REVIEW");
  await w.comment(ago(1, "14:05"), "action", people.bala, "Drawings sent for checking.");
  await w.raise(ago(5, "09:00"), "taskDone", people.eng, { type: "TASK", title: "Return the site keys", assigneePersonId: people.gopal });
  await w.move(ago(4, "09:00"), "taskDone", people.gopal, "TO_DO", "IN_PROGRESS");
  await w.move(ago(4, "14:00"), "taskDone", people.gopal, "IN_PROGRESS", "IN_REVIEW");
  await w.move(ago(4, "16:00"), "taskDone", people.eng, "IN_REVIEW", "DONE");
  await w.raise(ago(3, "10:00"), "taskDup", people.eng, { type: "TASK", title: "Book a second survey" });
  await w.move(ago(3, "10:10"), "taskDup", people.eng, "TO_DO", "CANCELLED", { reason: "The first survey covers it." });
  return [`${CON2}: work items of six types (no Defect after practical completion)`];
}

/// The contractor's acts, through the portal's own cores (`src/lib/work/portal-store.ts`) on the demo clock, as the demo contractor's portal account. A refusal stops the load.
function asContractor(actor: import("../src/lib/auth/types").SupplierActor) {
  return async <T>(when: string, what: string, fn: (a: typeof actor) => Promise<T>): Promise<T> => {
    const { WorkRefused } = await import("../src/lib/work/store");
    let out: T | undefined;
    await act(when, `work: contractor ${what}`, async () => {
      try {
        out = await fn(actor);
        return { ok: true };
      } catch (e) {
        if (e instanceof WorkRefused) return { ok: false, message: e.words };
        throw e;
      }
    }, {});
    return out as T;
  };
}

/**
 * Workspace 3b-i L3 (plan workspace-3b-build-plan.md, "L3"): the contractor's side of Work on demo_con3. A Project team with a Project manager; an instruction raised unshared
 * with a file, then shared, then given a second file (the first stays staff-only, the contractor sees the second), with a Reply and an Internal note and the contractor's Reply;
 * an Action assigned to the contractor when raised, and an RFI first held by a person and then moved to the contractor, who writes its Answer and sends it for checking; an RFI
 * and a near miss raised by the contractor, the RFI answered by the Contract administrator it was routed to and left In review for the contractor to accept. The 3a items stay
 * unshared. Staff acts run through the staff cores, the contractor's through the portal cores, as the awardee's portal account (`demo.ctr5`, waiting for activation until
 * `npm run demo:accounts`: the cores judge the supplier and its standing, not the session). The two files are staged as the upload route stages them (rows, as every demo
 * upload is) and pinned by `attachFiles`.
 *
 * Runs once: everything is checked before the first act, and the round is skipped (with its reason) where demo_con3 already has a Project team or a shared item, so a team or
 * a share made by hand is never written over and a second run adds nothing.
 */
async function loadSharing(db: Db, organisationId: string, today: string, ago: (n: number, hhmm: string) => string): Promise<string[]> {
  const { dayPlus } = await import("../src/lib/dates");
  const { loadContract } = await import("../src/lib/contract/repo");
  const { activeAmong, leadOf } = await import("../src/lib/work/load");
  const { answerAsContractor, moveAsContractor, raiseAsContractor, replyAsContractor } = await import("../src/lib/work/portal-store");
  const { STAGED_FOR_WORK_ITEM } = await import("../src/lib/documents/staged-for");
  const { demoPdf, writeDemoDocs } = await import("./demo-documents");
  const skip = (why: string) => [`${CON}: the sharing round is skipped (${why})`];

  if ((await db.projectTeamMember.count({ where: { contractId: CON } })) > 0 || (await db.workItem.count({ where: { contractId: CON, sharedAt: { not: null } } })) > 0) return skip("it already has a Project team or a shared item");
  const l = await loadContract(organisationId, CON);
  if (!l?.award.vendorId) return skip("its award names no supplier on the register");
  const account = await db.supplierAccount.findFirst({ where: { organisationId, supplierId: l.award.vendorId }, orderBy: { id: "asc" }, select: { id: true, loginName: true, status: true, contact: { select: { id: true, name: true } }, supplier: { select: { registeredName: true } } } });
  if (!account) return skip("its contractor has no portal account");
  const policy = await db.documentStorePolicy.findUnique({ where: { organisationId }, select: { projectDocumentClass: { select: { id: true, nameEn: true, classification: true } } } });
  const fileClass = policy?.projectDocumentClass;
  if (!fileClass || fileClass.classification === null || fileClass.classification === "SULIT") return skip("the class for project files is not set, or is not one a contractor may download");
  const lead = (await leadOf(l, today)).ids[0] ?? people.eng;
  // What the cores would refuse part-way (the round's acts commit one by one, and the demo is never wiped), asked first.
  const { actStatusFault } = await import("../src/lib/contract/act-status");
  const { portalStandingBarOf } = await import("../src/lib/portal/standing-gate-store");
  const status = l.contract.status as import("../src/lib/contract/types").ContractStatus;
  if (actStatusFault("PROJECT_TEAM", status) || actStatusFault("WORK_ITEM", status)) return skip("its status does not allow work or team changes");
  const named = [lead, people.eng, people.bala, people.chen, people.daniel];
  if ((await activeAmong(db as never, organisationId, named)).size !== new Set(named).size) return skip("someone the round names is not active");
  if (await portalStandingBarOf(db as never, { supplierId: l.award.vendorId, organisationId }, "TRANSACT")) return skip("its contractor's standing bars it from acting on the portal");

  const w = on(organisationId, CON);
  const contractor = asContractor({
    kind: "SUPPLIER", accountId: account.id, sessionId: "demo loader", contactId: account.contact.id, displayName: account.contact.name, supplierId: l.award.vendorId, supplierName: account.supplier.registeredName,
    loginName: account.loginName, organisationId, organisationTimeZone: l.org.timeZone, stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false, resetNoticePending: false,
  });
  // A wall clock in the organisation's zone (the demo's, UTC+8 with no daylight saving) as the UTC wall clock `writeDemoDocs` reads.
  const utc = (local: string) => new Date(new Date(`${local}:00.000Z`).getTime() - 8 * 3600_000).toISOString().slice(0, 16);
  const engName = (await db.person.findUniqueOrThrow({ where: { id: people.eng }, select: { name: true } })).name;
  const stage = async (key: string, title: string, local: string, lines: string[]) => {
    const docId = `${P}wkd${key}`;
    const entry = await writeDemoDocs(db, organisationId, [{ id: docId, title, classId: fileClass.id, className: fileClass.nameEn, classification: fileClass.classification, createdAt: utc(local), stagedFor: STAGED_FOR_WORK_ITEM, versions: [{ id: `${docId}v1`, n: 1, bytes: demoPdf(lines), mediaType: "application/pdf", filename: `${title}.pdf`, receivedOn: null, storedAt: utc(local) }], attachments: [] }], `${P}wkdau${key}_`, { id: people.eng, name: engName });
    await entry.flush();
    return `${docId}v1`;
  };

  // The Project team: the S.O. in force (the lead until a manager is named) names the Project manager (WSEC-2: only the manager and the S.O. change the team), who is the lead
  // from then on and names the Contract administrator a contractor's question is routed to, and a Site engineer.
  await w.team(ago(5, "08:30"), lead, "PROJECT_MANAGER", people.eng);
  await w.team(ago(5, "08:35"), people.eng, "CONTRACT_ADMINISTRATOR", people.bala);
  await w.team(ago(5, "08:40"), people.eng, "SITE_ENGINEER", people.chen);

  // An instruction raised unshared, with a file only staff ever see; then shared, and a second file the contractor does see. A Reply, an Internal note and the contractor's Reply.
  await w.raise(ago(4, "08:30"), "siShared", people.eng, { type: "SITE_INSTRUCTION", title: "Traffic signs for the road closure at the river crossing", description: "Advance warning signs 100 m either side, as the revised traffic management plan shows.", dueOn: dayPlus(today, 2), assigneePersonId: people.chen, impact: "NONE", location: "Chainage 0+850" });
  await w.attach(ago(4, "08:50"), "siShared", people.eng, await stage("1", "Police comments on the closure", ago(4, "08:45"), ["Traffic police comments on the proposed closure.", "For staff: not shared with the contractor."]));
  await w.share(ago(4, "09:30"), "siShared", people.eng);
  await w.attach(ago(4, "09:40"), "siShared", people.eng, await stage("2", "Sign layout at the river crossing", ago(4, "09:35"), ["Sign layout, chainage 0+750 to 0+950."]));
  await w.comment(ago(4, "09:45"), "siShared", people.eng, "The sign layout is attached. Please have the signs up before the closure starts.", "REPLY");
  await w.comment(ago(4, "10:00"), "siShared", people.chen, "The police asked for a second flagman; we will raise it with the contractor if the signs alone do not work.", "INTERNAL");
  await contractor(ago(3, "09:00"), "reply", (a) => replyAsContractor(a, { contractId: CON, item: w.ref("siShared"), body: "Signs ordered; they will be up on the morning of the closure." }));

  // Assigned to the contractor when raised (and so shared at once).
  await w.raise(ago(4, "11:00"), "actionCon", people.eng, { type: "ACTION", title: "Send the method statement for the river crossing", dueOn: dayPlus(today, 5), assigneePersonId: "contractor" });
  // First held by a person, then moved to the contractor; the contractor writes the Answer and sends it for checking.
  await w.raise(ago(4, "14:00"), "rfiCon", people.bala, { type: "RFI", title: "Working hours allowed at the river crossing", priority: "NORMAL", dueOn: dayPlus(today, 3), assigneePersonId: people.daniel });
  await w.edit(ago(3, "10:00"), "rfiCon", people.bala, "assigneePersonId", "contractor");
  await contractor(ago(2, "10:00"), "answer", (a) => answerAsContractor(a, { contractId: CON, item: w.ref("rfiCon"), answer: "08:00 to 18:00 on weekdays; no work on Sundays or public holidays." }));
  await contractor(ago(2, "10:05"), "send for checking", (a) => moveAsContractor(a, { contractId: CON, item: w.ref("rfiCon"), action: "SEND_FOR_REVIEW", expectedFrom: "TO_DO", comment: "" }));

  // A question the contractor raised: routed to the Contract administrator, who answers it and sends it for the contractor to accept.
  w.keep("rfiByCon", await contractor(ago(3, "15:00"), "raise a question", (a) => raiseAsContractor(a, { contractId: CON, type: "RFI", title: "Spoil disposal site for the excavated material", description: "The tender names a site that has since closed. Where should the spoil go?", location: "Chainage 0+800 to 1+600", dueOn: dayPlus(today, 4), severity: "", happenedAt: "", stagedVersionIds: [] })));
  await w.move(ago(2, "09:00"), "rfiByCon", people.bala, "TO_DO", "IN_PROGRESS");
  await w.edit(ago(2, "09:10"), "rfiByCon", people.bala, "answer", "Use the council's licensed site at Kampung Demo; the extra haul is at the bill rate.");
  await w.move(ago(2, "09:15"), "rfiByCon", people.bala, "IN_PROGRESS", "IN_REVIEW");
  // A near miss the contractor reported: routed to the lead.
  await contractor(ago(1, "10:00"), "report an incident", (a) => raiseAsContractor(a, { contractId: CON, type: "SAFETY_INCIDENT", title: "Unsecured load on a delivery lorry", description: "Pipes shifted on the lorry as it turned into the site. Nobody was hurt.", location: "Site entrance", dueOn: "", severity: "NEAR_MISS", happenedAt: ago(1, "09:30"), stagedVersionIds: [] }));
  return [`${CON}: the contractor's side of Work (a Project team, shared items and files, and the contractor's acts as ${account.loginName}${account.status === "ACTIVE" ? "" : ", whose account waits for activation: npm run demo:accounts"})`];
}

/// Read back through the views' own rule (`inView`), on the load day, as the list and the Board read them.
export async function checkWorkDemo(db: Db, opts: { sharing: boolean } = { sharing: true }) {
  const { inView } = await import("../src/lib/work/views");
  const { dayOf, dayPlus, dayOrNull } = await import("../src/lib/dates");
  const { BOARD_DONE_DAYS } = await import("../src/lib/work/board");
  const { WORK_ITEM_TYPES } = await import("../src/lib/work/types");
  const { assigneeOf, raiserOf } = await import("../src/lib/work/party");
  const fail = (what: string): never => {
    throw new Error(`demo check (work items): ${what}`);
  };
  const org = await db.organisation.findFirstOrThrow({ where: { id: (await db.contract.findUniqueOrThrow({ where: { id: CON }, select: { organisationId: true } })).organisationId }, select: { timeZone: true } });
  const today = dayOf(new Date(), org.timeZone);
  if (!today) fail("the organisation has no time zone");
  const rows = await db.workItem.findMany({ where: { contractId: CON } });
  for (const t of WORK_ITEM_TYPES) if (rows.filter((r) => r.type === t).length < 2) fail(`fewer than two of ${t}`);
  const read = rows.map((r) => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: raiserOf(r), assignee: assigneeOf(r), sharedAt: r.sharedAt?.toISOString() ?? null, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult, title: r.title, priority: r.priority }));
  const count = (v: Parameters<typeof inView>[1]) => read.filter((r) => inView(r, v, { personId: "" }, today)).length;
  if (count("late") < 2) fail(`${count("late")} late`);
  if (count("unassigned") < 2) fail(`${count("unassigned")} unassigned`);
  if (count("ncr") < 1) fail("no failed inspection open");
  if (!rows.some((r) => r.status === "CANCELLED" && r.cancelReason.trim() && r.closedAt)) fail("no item cancelled with its reason");
  if (!rows.some((r) => r.status === "IN_REVIEW")) fail("nothing in review");
  if (!rows.some((r) => r.type === "RFI" && r.status === "DONE" && r.answer.trim())) fail("no answered RFI done");
  const windowStart = dayPlus(today!, -(BOARD_DONE_DAYS - 1));
  const closedDays = rows.filter((r) => r.status === "DONE").map((r) => dayOf(r.closedAt!, org.timeZone)!);
  if (!closedDays.some((d) => d >= windowStart) || !closedDays.some((d) => d < windowStart)) fail("done items are not both inside and outside the Done window");
  const second = (await db.workItem.findMany({ where: { contractId: CON2 } })).map((r) => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: raiserOf(r), assignee: assigneeOf(r), sharedAt: r.sharedAt?.toISOString() ?? null, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult, title: r.title, priority: r.priority }));
  // A database loaded before demo_con15 existed has none: its round was skipped, as the loader says.
  if (await db.contract.findUnique({ where: { id: CON2 }, select: { id: true } })) {
    for (const t of WORK_ITEM_TYPES.filter((x) => x !== "DEFECT")) if (!second.some((r) => r.type === t)) fail(`${CON2} has no ${t}`);
    if (!second.some((r) => inView(r, "late", { personId: "" }, today))) fail(`${CON2} has nothing late`);
  }
  if ((await db.workItemComment.count({ where: { workItemId: { in: rows.map((r) => r.id) }, internal: true } })) < 3) fail("fewer than three comments");
  const links = await db.workItemLink.findMany({ where: { workItemId: { in: rows.map((r) => r.id) } }, select: { projectDocumentId: true } });
  if (links.length < 3 || !links.some((x) => x.projectDocumentId)) fail("fewer than three links, or none to a document");
  if (opts.sharing) await checkSharing(db, fail);
}

/// The 3b round, read back: the team, the shares, the contractor's acts, and what the portal's own reader shows of the shared instruction (the Reply, never the Internal note or the
/// file attached before sharing).
async function checkSharing(db: Db, fail: (what: string) => never) {
  const { loadPortalItem } = await import("../src/lib/work/portal-read");
  const team = await db.projectTeamMember.findMany({ where: { contractId: CON }, select: { role: true } });
  if (!team.some((m) => m.role === "PROJECT_MANAGER")) fail("no Project manager");
  const rows = await db.workItem.findMany({ where: { contractId: CON }, select: { id: true, type: true, number: true, status: true, answer: true, sharedAt: true, assignedToContractor: true, raisedBySupplierAccountId: true } });
  if (!rows.some((r) => r.sharedAt === null) || !rows.some((r) => r.sharedAt !== null)) fail("not both shared and unshared items");
  if (rows.filter((r) => r.assignedToContractor).length < 2) fail("fewer than two items assigned to the contractor");
  if (!rows.some((r) => r.assignedToContractor && r.type === "RFI" && r.status === "IN_REVIEW" && r.answer.trim())) fail("no RFI the contractor answered and sent for checking");
  const byContractor = rows.filter((r) => r.raisedBySupplierAccountId !== null);
  if (!byContractor.some((r) => r.type === "RFI" && r.status === "IN_REVIEW" && r.answer.trim())) fail("no RFI the contractor raised, answered and in review");
  if (!byContractor.some((r) => r.type === "SAFETY_INCIDENT")) fail("no incident the contractor raised");
  const pins = await db.documentAttachment.findMany({ where: { workItemId: { in: rows.map((r) => r.id) }, detachedAt: null }, select: { workItemId: true, attachedAt: true } });
  const shared = rows.find((r) => r.sharedAt !== null && pins.some((p) => p.workItemId === r.id && p.attachedAt < r.sharedAt!) && pins.some((p) => p.workItemId === r.id && p.attachedAt >= r.sharedAt!));
  if (!shared) fail("no shared item with a file from before its sharing and one from after");
  const comments = await db.workItemComment.findMany({ where: { workItemId: shared!.id }, select: { internal: true, personId: true, supplierAccountId: true } });
  if (!comments.some((c) => c.internal) || !comments.some((c) => !c.internal && c.personId) || !comments.some((c) => c.supplierAccountId)) fail("the shared item lacks a Reply, an Internal note or the contractor's Reply");
  // The portal's own reader, as the contractor: one file and two comments (the staff Reply and its own), nothing else.
  const award = await db.contract.findUniqueOrThrow({ where: { id: CON }, select: { organisationId: true, award: { select: { vendorId: true } } } });
  const { itemRef } = await import("../src/lib/work/number");
  const seen = await loadPortalItem({ supplierId: award.award.vendorId!, organisationId: award.organisationId }, CON, itemRef(shared!.type, shared!.number));
  if (!seen || seen.files.length !== 1 || seen.comments.length !== 2) fail(`the portal shows the shared item ${seen ? `with ${seen.files.length} files and ${seen.comments.length} comments` : "not at all"} (one file and two comments expected)`);
}
