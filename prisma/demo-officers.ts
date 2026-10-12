/**
 * Demo data for Sourcing Requirements v2 SR-05 to SR-07 (rulings 8, 9 and 11): the opening officers named on the demo exercises that open
 * bids, and the proposed dates, notice and fee on the exercise whose pack is still being prepared, so a demo exercise still submits and opens
 * from the screens (what is still refused is returned, not hidden). Invented throughout. The demo may write these directly (ruling G2); a customer's own values arrive through the screens.
 *
 * - Where an opening already sat, its panel are the officers named (the people who in fact opened).
 * - Otherwise the first holders of the opening committee's seats are named, as many as the committee's panel size says (the demo sets 2,
 *   FR-OPN-002); the roster's own rules (`rosterFaults`) are asked of the result, and a demo that fails them stops the load.
 * - An exercise whose method names no opening committee, or whose committee has no panel size, is left without officers, and says so
 *   on its screen.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { DEMO_ACTOR } from "./demo-actor";
import { DEMO_PREFIX as P } from "./demo-sign-in";

type Db = PrismaClient;

const dayIn = (at: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function loadOpeningOfficersDemo(db: Db, organisationId: string, now = new Date()) {
  const { loadOpeningRoster, rosterFindings } = await import("../src/lib/opening/roster-store");
  const { approvalDatesFault } = await import("../src/lib/tender-docs/tendering");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { id: true, code: true, timeZone: true } });
  const tz = org.timeZone ?? "Asia/Kuala_Lumpur";
  const today = dayIn(now, tz);
  const trail: Record<string, unknown>[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: Date, changes: object[]) =>
    trail.push({ id: `${P}ooau${++n}`, organisationId, entity, entityId, entityLabel, action, at, changes, reason: "", ...DEMO_ACTOR });

  const exercises = await db.sourcingExercise.findMany({
    where: { organisationId, openingRosterRequired: true, packKindSnapshot: { in: ["TENDER", "QUOTATION"] }, status: { not: "CANCELLED" } },
    select: { id: true, reference: true, title: true, status: true, sourcingMethodCode: true, openingRosterRequired: true, createdAt: true, openingOfficers: { select: { id: true } } },
    orderBy: { reference: "asc" },
  });
  const named: string[] = [];
  const left: string[] = [];
  for (const ex of exercises) {
    if (ex.openingOfficers.length) continue;
    const roster = await loadOpeningRoster(ex, { id: org.id, code: org.code, today }, db);
    const size = roster.committee?.panelSize ?? null;
    if (!roster.committee || size == null) {
      left.push(ex.reference);
      continue;
    }
    // Who opened, where an opening sat; otherwise the first holders of the committee's seats.
    const sat = await db.openingPanelMember.findMany({ where: { opening: { exerciseId: ex.id, sequenceNo: 1 } }, orderBy: { id: "asc" }, select: { personId: true, committeeMemberId: true, seatLabelSnapshot: true } });
    const people = sat.length ? sat : roster.input.seats.map((s) => ({ personId: s.personId, committeeMemberId: s.committeeMemberId, seatLabelSnapshot: s.seatLabel }));
    const accounts = new Set((await db.staffAccount.findMany({ where: { organisationId, isAdministrator: true }, select: { personId: true } })).map((a) => a.personId));
    const chosen = people.filter((p) => !accounts.has(p.personId)).slice(0, size);
    const namedAt = new Date(Math.min(now.getTime(), ex.createdAt.getTime() + 86_400_000));
    // Named by the person in charge of the exercise's requisition is not recorded here: the demo loader names them.
    const by = await db.person.findFirstOrThrow({ where: { organisationId, isActive: true }, orderBy: { id: "asc" }, select: { id: true } });
    for (const [i, p] of chosen.entries()) {
      const id = `${P}oo${named.length + i + 1}`;
      await db.exerciseOpeningOfficer.create({ data: { id, organisationId, exerciseId: ex.id, personId: p.personId, committeeMemberId: p.committeeMemberId, seatLabelSnapshot: p.seatLabelSnapshot, namedAt, namedByPersonId: by.id } });
      entry("ExerciseOpeningOfficer", id, `${ex.reference} Â· Opening officer`, "CREATE", namedAt, diffFields(null, { officer: p.personId, seat: p.seatLabelSnapshot }));
    }
    named.push(...chosen.map((_, i) => `${ex.reference}#${i}`));
    const after = await loadOpeningRoster(ex, { id: org.id, code: org.code, today }, db);
    const faults = rosterFindings(after).filter((f) => f.level === "block");
    if (faults.length) throw new Error(`Demo opening officers on ${ex.reference} fail the roster's own rules: ${faults.map((f) => f.code).join(", ")}`);
  }

  // The pack still being prepared (not submitted): its dates proposed, so it can go for approval from the screen.
  const preparing = await db.sourcingExercise.findMany({ where: { organisationId, status: "DOCUMENTS_IN_PREPARATION", proposedStartOn: null, packKindSnapshot: { in: ["TENDER", "QUOTATION"] } }, select: { id: true, reference: true, sourcingMethodCode: true, regime: true, packKindSnapshot: true, openingRosterRequired: true, proposedStartOn: true, proposedClosingAt: true } });
  for (const ex of preparing) {
    const startOn = plusDays(today, 7);
    const closingDay = plusDays(today, 28);
    const judged = approvalDatesFault({ startOn, closingDay, closingTime: "12:00", timeZone: tz, today });
    if (judged.faults.length || !judged.closingAt) {
      left.push(`${ex.reference} (dates)`);
      continue;
    }
    await db.sourcingExercise.update({ where: { id: ex.id }, data: { proposedStartOn: new Date(`${startOn}T00:00:00.000Z`), proposedClosingAt: judged.closingAt } });
    entry("SourcingExercise", ex.id, ex.reference, "UPDATE", now, diffFields({ proposedStart: null, proposedClosing: null }, { proposedStart: startOn, proposedClosing: `${closingDay} 12:00` }));
  }

  // Their notice and fee: places, hours, the days of sale, the fee and its payment, and the bids' validity (invented), written as Scope and estimate's Notice and fee does.
  const { windowPathOf } = await import("../src/lib/window/publish");
  const { loadSubmitExtras } = await import("../src/lib/tender-docs/submit-extras");
  for (const ex of preparing) {
    const method = await db.sourcingMethod.findFirst({ where: { organisationId, code: ex.sourcingMethodCode }, select: { requiresAdvertisement: true, invitesNamedSuppliers: true } });
    const path = windowPathOf(method);
    if (!path || (await db.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { id: true } }))) continue;
    const id = `${P}winp${ex.id.slice(-4)}`;
    const items = { inspectionPlace: "Contract & Procurement, level 3, 1 Demo Avenue", purchasePlace: "Finance counter, ground floor, 1 Demo Avenue", inspectionHours: "Monday to Friday, 9.00 am to 4.00 pm", feeAmount: "200.00", feePaymentMethods: "Bank draft or cheque to Demo Utilities Sdn Bhd, or cash at the counter", submissionPlace: "The tender box, ground floor, 1 Demo Avenue", bidValidityDays: 90, bidValidityProvenance: "ASSUMED" as const, purchaseFromDay: new Date(`${plusDays(today, 8)}T00:00:00.000Z`), purchaseCloseDay: new Date(`${plusDays(today, 26)}T00:00:00.000Z`) };
    await db.exerciseWindow.create({ data: { id, organisationId, exerciseId: ex.id, path, ...items, createdAt: now } });
    entry("ExerciseWindow", id, `${ex.reference} · Notice and fee`, "CREATE", now, diffFields(null, { path, fee: "RM200.00", bidValidityDays: 90 }));
    const fresh = await db.sourcingExercise.findUniqueOrThrow({ where: { id: ex.id }, select: { id: true, sourcingMethodCode: true, regime: true, packKindSnapshot: true, openingRosterRequired: true, proposedStartOn: true, proposedClosingAt: true } });
    const extras = await loadSubmitExtras(fresh, { id: org.id, code: org.code, timeZone: org.timeZone, today }, db);
    const open = [...extras.dates, ...extras.officers, ...extras.notice].filter((f) => f.level === "block").map((f) => f.code);
    if (open.length) left.push(`${ex.reference} would still be refused for: ${open.join(", ")}`);
  }

  if (trail.length) await db.auditEntry.createMany({ data: trail as never });
  return { named: named.length, left };
}
