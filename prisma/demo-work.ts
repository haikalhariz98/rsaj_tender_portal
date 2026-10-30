/**
 * Work items demo (workspace 3a step 6, WS-22; plan workspace-3a-build-plan.md §5 "Step 6"). Invented throughout; it sets no policy.
 *
 * On demo_con3 (XI202600799, active), the only demo contract executed and not practically complete when the load ends (a Defect is refused from practical
 * completion on, OQ-4; demo_con13 is closed by stage C), two rounds of items, each holding every one of the seven types:
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
 * demo_con15 (practically complete, Work still open) is NOT the contract WS-22 asks for (executed, not practically complete: only demo_con3 is); it holds the six types a Defect refusal leaves (`loadSecond`).
 *
 * Ids: WorkItem demo_wki*, WorkItemComment demo_wkc*, WorkItemLink demo_wkl*, StaffNotice demo_wkn* (ACT_PREFIX; grepped free). Runs once: a contract
 * that already holds a work item is left alone.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { act } from "./demo-acts";

type Db = PrismaClient;
const P = "demo_";
/// The one demo contract that is executed and not practically complete once the load ends (demo_con13 is closed by stage C; the rest are before execution, complete or ended).
const CON = `${P}con3`;
/// A second contract with Work open (not the one WS-22 asks for): practically complete, where Work is still open but a Defect item is refused (OQ-4), so it holds the other six types.
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

/// The acts on one contract, by the demo people.
function on(organisationId: string, contractId: string) {
  const ids = new Map<string, string>();
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
        ids.set(key, (await createItem(c, who, n, a!)).id);
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
    async comment(when: string, key: string, by: string, body: string) {
      const { comment } = await import("../src/lib/work/store");
      await run(organisationId, contractId, when, `${key} comment`, by, "WorkItemComment.person", (c, who, a) => comment(c, who, { itemId: id(key), body }, a!));
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
  if ((await db.workItem.count({ where: { contractId: CON } })) > 0) return { notes: [] };
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
  return { notes: [`${CON}: work items of every type, twice`, ...(await loadSecond(db, organisationId, today, ago, dayAgo))] };
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

/// Read back through the views' own rule (`inView`), on the load day, as the list and the Board read them.
export async function checkWorkDemo(db: Db) {
  const { inView } = await import("../src/lib/work/views");
  const { dayOf, dayPlus, dayOrNull } = await import("../src/lib/dates");
  const { BOARD_DONE_DAYS } = await import("../src/lib/work/board");
  const { WORK_ITEM_TYPES } = await import("../src/lib/work/types");
  const fail = (what: string) => {
    throw new Error(`demo check (work items): ${what}`);
  };
  const org = await db.organisation.findFirstOrThrow({ where: { id: (await db.contract.findUniqueOrThrow({ where: { id: CON }, select: { organisationId: true } })).organisationId }, select: { timeZone: true } });
  const today = dayOf(new Date(), org.timeZone);
  if (!today) fail("the organisation has no time zone");
  const rows = await db.workItem.findMany({ where: { contractId: CON } });
  for (const t of WORK_ITEM_TYPES) if (rows.filter((r) => r.type === t).length < 2) fail(`fewer than two of ${t}`);
  const read = rows.map((r) => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: r.raisedByPersonId!, assignee: r.assigneePersonId, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult, title: r.title, priority: r.priority }));
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
  const second = (await db.workItem.findMany({ where: { contractId: CON2 } })).map((r) => ({ id: r.id, type: r.type, number: r.number, status: r.status, raisedBy: r.raisedByPersonId!, assignee: r.assigneePersonId, dueOn: dayOrNull(r.dueOn), answer: r.answer, inspectionResult: r.inspectionResult, title: r.title, priority: r.priority }));
  for (const t of WORK_ITEM_TYPES.filter((x) => x !== "DEFECT")) if (!second.some((r) => r.type === t)) fail(`${CON2} has no ${t}`);
  if (!second.some((r) => inView(r, "late", { personId: "" }, today))) fail(`${CON2} has nothing late`);
  if ((await db.workItemComment.count({ where: { workItemId: { in: rows.map((r) => r.id) }, internal: true } })) < 3) fail("fewer than three comments");
  const links = await db.workItemLink.findMany({ where: { workItemId: { in: rows.map((r) => r.id) } }, select: { projectDocumentId: true } });
  if (links.length < 3 || !links.some((x) => x.projectDocumentId)) fail("fewer than three links, or none to a document");
}
