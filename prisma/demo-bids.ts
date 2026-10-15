/**
 * Demo data for 6.6: the envelope register (plan §6, as ruled: X-4, X-10, X-11). Invented
 * throughout; every configured value is ASSUMED and none is a customer's figure or source
 * (X-10 d). Every row passes the checks of its act, judged by the product's own functions as it is
 * written (X-10 c); every act is dated relative to the load day on its working days, never after
 * now (X-10 a, b). The load reads each exercise back and refuses if one is not what it says.
 *
 * - Configuration: the open tender method's late-admission committee is the Tender Board, and an
 *   incomplete bid is reported to it (both ASSUMED); the quotation methods leave the committee not
 *   set (D9), and no method sets a minimum number of bids (B7). The `bid.validity.expiring` alert
 *   rule demo_nr6 at 30 and 7 days (ASSUMED).
 * - demo_sx16 (open tender, closed the working day before the load day at 15:00, 6.5's demo):
 *   the validity, 120 days ASSUMED, recorded once after publication through the tab's exit (the
 *   window was published before the register asked for it); envelopes demo_env1–3 over the
 *   counter or by post in time, demo_env5 recorded the morning after it arrived by post (stated
 *   time and reason kept, the server stamp in time), demo_env6 withdrawn by letter demo_bw1 (its
 *   letter SULIT) and handed back unopened, demo_env4 recorded at 15:00:01 — late; the box
 *   demo_box1 locked at 15:05. demo_env4's admission tabled at the Tender Board's sitting
 *   demo_mt13 as demo_d42, carried. The validity extended on demo_vx1 with an invented consent.
 * - demo_sx20 (open tender, new, X-10 b): its own requisition (demo_rq35, route demo_ai72) and
 *   tendering route (demo_ai73), taken through 6.2, 6.4 and 6.5 by their own acts, the validity
 *   set before publication, closed two working days before the load day. Its estimate's lodgement
 *   is on the register (demo_env7, the company estimate); demo_env8 in time; demo_env9 by post
 *   after the closing — late and not tabled, so its appointment cannot be tabled (the refusal);
 *   the box demo_box2 locked.
 * Bidders are not named before opening (OD-2): no envelope names a party.
 */

import { raiseSeries } from "./demo-series";
import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { bidAnswerFields, BID_ENTITY, boxFields, envelopeFields, extensionFields, appliedFields, returnFields, statusField, withdrawalFields } from "../src/lib/bids/audit-view";
import { lockFaults } from "../src/lib/bids/box";
import { judgeLodgement, lodgementFaults, lodgementMarkings } from "../src/lib/bids/estimate";
import { applyFaults, extensionFaults } from "../src/lib/bids/extension";
import { LATE_DOMAIN, lateAdmissionFault, lateMatterFault, lateMatterSubject } from "../src/lib/bids/late";
import { judgeReceipt, receiptFaults } from "../src/lib/bids/receipt";
import type { Finding as BidFinding } from "../src/lib/bids/types";
import { VALIDITY_ALERT_EVENT } from "../src/lib/bids/validity";
import { bidFieldsFaults, EXIT_RECORDED_BY_FIELD } from "../src/lib/bids/window-fields";
import { returnFaults, withdrawFaults } from "../src/lib/bids/withdrawal";
import { ACT_LABEL } from "../src/lib/labels";
import { dayIn, dayPlus, dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { formatDate } from "../src/lib/format";
import { parseSen, senToDecimalString } from "../src/lib/money";
import { BIG, calendarOf, CHANNELS, COMPLETE_APPENDIX, FIRMS, scopeReady, TENDER_FEE_BASIS, tenderWindow, Acts } from "./demo-window";
import { demoPdf, writeDemoDocs, type DemoDoc } from "./demo-documents";
import { answer, conditionsFor, confirm, decide, enterAppendix, markAllReady, moveIntoPreparation, startPack, submit, type Add } from "./demo-tender-docs";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const demoRef = { startsWith: P };
const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;
const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
/// The exercises this demo writes envelopes on: 6.5's closed tender and its own.
export const BID_EXERCISES = [`${P}sx16`, `${P}sx20`] as const;
const NEW_EXERCISE = `${P}sx20`;
const CLERK = { id: `${P}p4`, name: "Daniel Anak Jelani" };
const HOD_CP = { id: `${P}p3`, name: "Chen Wei Ling" };

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

const fail6 = (what: string): never => {
  throw new Error(`Demo 6.6: ${what}.`);
};

function refuse(what: string, fs: readonly BidFinding[]) {
  const b = fs.filter((f) => f.level === "block");
  if (b.length) throw new Error(`Demo 6.6 ${what} refused: ${b.map((f) => f.code).join(", ")}`);
}

export interface BidsDemoHooks {
  determine(ids: string[]): Promise<void>;
}

export async function loadBidsDemo(db: Db, organisationId: string, hooks: BidsDemoHooks): Promise<{ sittings: string[] }> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 6.6: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  const sec = (at: Date, s: number) => new Date(at.getTime() + s * 1000);
  const iso = (at: Date) => at.toISOString().slice(0, 16);
  const now = new Date();

  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") =>
    trail.push({ id: `${P}bau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };
  let doc = 80;
  const nextDoc = () => `${P}doc${doc++}`;
  const docs = async (ds: DemoDoc[]) => {
    if (!ds.length) return;
    const e = await writeDemoDocs(db, organisationId, ds, `${P}bdoc${doc}au`, HOD_CP);
    await e.flush();
  };

  // ---- configuration: set by configureBidsDemo, before 6.5's windows are published, so each
  // publication freezes the method's bid-receipt rules with it (CR-2).

  // ---- sx20: a requisition, the exercise, 6.2 and 6.4 by their own acts, then the window (6.5's acts)
  await loadRequisition(db, organisationId, W, T);
  await db.sourcingExercise.create({
    data: { id: NEW_EXERCISE, organisationId, specPanelUsed: true, onScreenBillUsed: true, saleMode: "COUNTER", submissionChannel: "PAPER", reference: SX(20), requisitionId: `${P}rq35`, title: "Clear water tank relining, Demo Heights", estimatedValue: "420000.00", sourcingMethodCode: "open_tender", methodReason: "", status: "DRAFT", contractBasisCode: "ds", createdAt: T(W(10), "10:00") },
  });
  await db.exerciseScopePart.create({ data: { id: `${NEW_EXERCISE}p1`, exerciseId: NEW_EXERCISE, deliverableKind: "MEASURED_CONSTRUCTION", amount: "420000.00", description: "Clear water tank relining, Demo Heights", sortOrder: 1 } });
  await hooks.determine([NEW_EXERCISE]);
  {
    const ref = SX(20);
    const on = W(9);
    await scopeReady(db, organisationId, tz, NEW_EXERCISE, ref, 20, on, T, nextDoc, docs, entry, "420000.00");
    // 6.6 (the flagged hook): the estimate's copy 1 went into the box when it was lodged, recorded on the register.
    const lodgedAt = T(on, "08:50");
    const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: NEW_EXERCISE }, select: { status: true, closingAt: true } });
    refuse("lodging the estimate into the box", lodgementFaults({ status: ex.status, closing: ex.closingAt, now: lodgedAt }));
    const j = judgeLodgement(lodgedAt, ex.closingAt);
    await envelope(db, organisationId, entry, tz, { id: `${P}env7`, exerciseId: NEW_EXERCISE, ref, sequence: 1, kind: "COMPANY_ESTIMATE", channel: "BOX", ...j, receivedSource: "SERVER", statedReceivedAt: null, entryReason: "", receivedBy: HOD_CP, markings: lodgementMarkings(1), recordedAt: lodgedAt });
    await moveIntoPreparation(db, organisationId, NEW_EXERCISE, on, { report: "works" }, entry);
    const pack = `${P}tpk20`;
    const packOn = W(8);
    await startPack(db, organisationId, { id: pack, exerciseId: NEW_EXERCISE, versionNo: 1, at: T(packOn, "08:30") }, entry);
    const parts = await db.tenderPackPart.findMany({ where: { packId: pack, source: "UPLOAD" }, orderBy: { sortOrder: "asc" } });
    await docs(
      parts.map((p, i) => {
        const did = nextDoc();
        const title = `${p.labelSnapshot}, ${ref}`;
        const atIso = iso(T(packOn, `08:${String(40 + i).padStart(2, "0")}`));
        return {
          id: did, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: atIso,
          versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([title, "Tender document part (demo)."]), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: packOn, storedAt: atIso }],
          attachments: [{ id: `${did}a1`, purpose: "TENDER_PART" as const, owner: { tenderPackPartId: p.id }, ownerLabel: `${ref} · Tender pack v1 · part ${p.printedNumber}, ${p.labelSnapshot}`, versionId: `${did}v1`, at: atIso }],
        };
      }),
    );
    await enterAppendix(db, organisationId, pack, ref, COMPLETE_APPENDIX, T(packOn, "09:00"), entry);
    await conditionsFor(db, organisationId, NEW_EXERCISE, ref, [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D4, category civil works", group: 2 }], T(packOn, "09:10"), entry);
    await answer(db, organisationId, NEW_EXERCISE, ref, { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_2" }, T(packOn, "09:20"), entry);
    await confirm(db, organisationId, pack, ref, "NO_AMBIGUITY", `${P}p4`, packOn, T(packOn, "09:30"), entry, L);
    await confirm(db, organisationId, pack, ref, "DRAWINGS_COORDINATED", `${P}p10`, packOn, T(packOn, "09:35"), entry, L);
    await markAllReady(db, organisationId, pack, ref, T(packOn, "10:00"), entry);
    const dates = { startOn: W(7), closingDay: W(2) };
    await submit(db, organisationId, { packId: pack, routeId: `${P}ai73`, at: T(packOn, "11:00"), startOn: dates.startOn, closingDay: dates.closingDay, closingTime: "15:00" }, entry);
    await decide(db, organisationId, { packId: pack, decision: "DONE", personId: `${P}p3`, decidedOn: W(7), at: T(W(7), "09:00"), reason: "", dates: { ...dates, closingTime: "15:00" } }, entry);

    const acts = new Acts(db, organisationId, tz, entry);
    await acts.saveWindow(NEW_EXERCISE, `${P}win20`, tenderWindow(W(7), W(4)), T(W(7), "09:30"));
    await acts.feeLines(NEW_EXERCISE, 20, TENDER_FEE_BASIS, T(W(7), "09:40"));
    // 6.6: the bids' validity and alternatives, prepared with the window before it is published.
    await answers(db, organisationId, entry, NEW_EXERCISE, ref, { days: 120, provenance: "ASSUMED", alternativesPermitted: false, reason: "" }, T(W(7), "09:45"));
    for (const [i, c] of CHANNELS.entries()) await acts.publication(NEW_EXERCISE, `${P}pub20_${i + 1}`, c.id, W(7), c.reference(20), T(W(7), `10:0${i}`));
    await acts.publish(NEW_EXERCISE, T(W(7), "11:00"));
    await acts.sale(NEW_EXERCISE, `${P}sale8`, { party: { id: `${P}pty10`, ...FIRMS.rekaan }, receiptNo: "FR/26/004301", collectedBy: "Wong Demo", paymentMethod: "Bank draft" }, T(W(5), "10:00"));
    await acts.sale(NEW_EXERCISE, `${P}sale9`, { party: { id: `${P}pty11`, ...FIRMS.teladan }, receiptNo: "FR/26/004302", collectedBy: "Rajan Demo", paymentMethod: "Cheque" }, T(W(4), "14:00"));
  }
  await raiseSeries(db, `${P}n5`, 21);

  // ================================================================ sx16: the register of a closed tender
  const sx16 = `${P}sx16`;
  const ref16 = SX(16);
  const close16 = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: sx16 }, select: { closingAt: true } })).closingAt!;
  if (dayIn(close16, tz) !== W(1)) throw new Error("Demo 6.6: sx16 does not close on the working day before the load day.");
  // The window was published before the register asked for the validity: recorded once, with a reason (the tab's exit).
  await answers(db, organisationId, entry, sx16, ref16, { days: 120, provenance: "ASSUMED", alternativesPermitted: false, reason: "Recorded from the instructions to tenderers: the window was published before the register asked for the bids' validity.", recordedBy: HOD_CP.name }, T(W(3), "09:00"));
  const marks16 = `Tender ${ref16}, Reservoir inlet main and inlet works, closing ${formatDate(W(1))} 3.00 pm`;
  const r16 = new Receipts(db, organisationId, tz, entry, sx16, ref16);
  await r16.receive(`${P}env1`, { kind: "BID", channel: "COUNTER", markings: marks16, by: CLERK, at: T(W(3), "10:15") });
  await r16.receive(`${P}env2`, { kind: "BID", channel: "COUNTER", markings: marks16, by: CLERK, at: T(W(3), "11:40") });
  await r16.receive(`${P}env3`, { kind: "BID", channel: "POST", markings: `${marks16}, registered post`, by: CLERK, at: T(W(2), "10:20") });
  await r16.receive(`${P}env5`, { kind: "BID", channel: "POST", markings: `${marks16}, by post`, by: CLERK, at: T(W(2), "11:05"), stated: { at: T(W(3), "16:30"), reason: "Arrived by the afternoon post after the registry had closed; recorded the next morning." } });
  await r16.receive(`${P}env6`, { kind: "BID", channel: "COUNTER", markings: marks16, by: CLERK, at: T(W(2), "14:00") });
  // The withdrawal letter for env6, received before the closing; its envelope handed back unopened.
  await r16.withdraw(`${P}bw1`, `${P}env6`, "Our letter ref. DEMO/WD/1 of today withdraws the tender we lodged at the counter yesterday afternoon.", HOD_CP, T(W(1), "10:00"));
  {
    const did = nextDoc();
    const title = `Withdrawal letter, ${ref16}`;
    const seq = (await db.bidEnvelope.findUniqueOrThrow({ where: { id: `${P}env6` }, select: { sequence: true } })).sequence;
    const when = iso(T(W(1), "10:05"));
    await docs([{
      id: did, title, classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: when,
      versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([`Withdrawal letter (demo, SULIT) — ${ref16}`, "A bidder withdraws its tender before the closing.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: "withdrawal-letter.pdf", receivedOn: W(1), storedAt: when }],
      attachments: [{ id: `${did}a1`, purpose: "WITHDRAWAL_LETTER", owner: { bidWithdrawalId: `${P}bw1` }, ownerLabel: `${ref16} · Withdrawal of envelope ${seq}`, versionId: `${did}v1`, at: when }],
    }]);
  }
  await r16.receive(`${P}env4`, { kind: "BID", channel: "COUNTER", markings: marks16, by: CLERK, at: sec(close16, 1) });
  await r16.lock(`${P}box1`, HOD_CP, T(W(1), "15:05"), "Locked by the Head of Contract & Procurement at the closing; key held in the strong room.");
  await r16.returned(`${P}env6`, W(1), "Handed back unopened to the bidder's representative, who signed for it.", T(W(1), "16:45"));

  // The Tender Board's sitting on the late envelope: tabled, attended, voted and carried (FR-CTE-008).
  const sittings = await lateSitting(db, organisationId, tz, entry, { sx: sx16, ref: ref16, title: "Reservoir inlet main and inlet works, Demo Heights", envelopeId: `${P}env4`, on: W(1), at: T(W(1), "16:00") });

  // The validity extended on the recommended tenderer's consent (OD-7, attested), on the load day.
  await extension(db, organisationId, tz, entry, docs, nextDoc, { sx: sx16, ref: ref16, party: { id: `${P}pty2`, name: FIRMS.contoh.name }, recordedAt: new Date(now.getTime() - 150 * 60_000), today: L });

  // ================================================================ sx20: its own register
  {
    const ref = SX(20);
    const close20 = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: NEW_EXERCISE }, select: { closingAt: true } })).closingAt!;
    const marks = `Tender ${ref}, Clear water tank relining, closing ${formatDate(W(2))} 3.00 pm`;
    const r = new Receipts(db, organisationId, tz, entry, NEW_EXERCISE, ref);
    await r.receive(`${P}env8`, { kind: "BID", channel: "COUNTER", markings: marks, by: CLERK, at: T(W(3), "10:00") });
    await r.lock(`${P}box2`, HOD_CP, sec(close20, 360), "");
    await r.receive(`${P}env9`, { kind: "BID", channel: "POST", markings: `${marks}, by post`, by: CLERK, at: T(W(1), "09:15") });
  }

  await flush();
  return { sittings };
}

// ------------------------------------------------------------------ configuration

/**
 * The method's bid-receipt rules and the validity alert rule, dated W(16), before any window the
 * demo publishes (6.5's and 6.6's): publication freezes the three rules with the window (CR-2), so
 * this runs before loadWindowDemo. Its trail entries have their own ids (demo_bauc…).
 */
export async function configureBidsDemo(db: Db, organisationId: string) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 6.6: the organisation's time zone is not set.");
  const { W } = calendarOf(todayIn(new Date(), tz)!);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") =>
    trail.push({ id: `${P}bauc${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  await configure(db, organisationId, instantAt(W(16), "09:00", tz)!, entry);
  await db.auditEntry.createMany({ data: trail as never });
}

async function configure(db: Db, organisationId: string, at: Date, entry: Add) {
  const method = await db.sourcingMethod.findFirstOrThrow({ where: { organisationId, code: "open_tender" }, select: { id: true, nameEn: true, lateAdmissionCommitteeCode: true, lateAdmissionProvenance: true, minimumBids: true, minimumBidsProvenance: true, completenessEliminates: true, completenessProvenance: true } });
  const { id, nameEn, ...before } = method;
  const after = { ...before, lateAdmissionCommitteeCode: "TENDER_BOARD", lateAdmissionProvenance: "ASSUMED" as const, completenessEliminates: false, completenessProvenance: "ASSUMED" as const };
  await db.sourcingMethod.update({ where: { id }, data: after });
  entry("SourcingMethod", id, nameEn, "UPDATE", at, diffFields(before, after));
  const rule = { id: `${P}nr6`, organisationId, eventKey: VALIDITY_ALERT_EVENT, nameEn: "Bid validity expiring", recipientRoleCodes: ["HOD_CP"], reminderOffsetDays: [30, 7], provenance: "ASSUMED" as const, sortOrder: 6, notes: "Invented demo offsets, not a recommendation." };
  await db.notificationRule.create({ data: rule });
  entry("NotificationRule", rule.id, rule.nameEn, "CREATE", new Date(at.getTime() + 60_000), diffFields(null, { event: rule.nameEn, recipients: "Head of Contract & Procurement", reminders: "30 and 7 days before", provenance: "Assumed" }));
}

// ------------------------------------------------------------------ the window's bid answers (saveBidAnswers)

export async function answers(db: Db, organisationId: string, entry: Add, exerciseId: string, ref: string, v: { days: number; provenance: "ASSUMED"; alternativesPermitted: boolean; reason: string; recordedBy?: string }, at: Date) {
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { status: true, packKindSnapshot: true } });
  const w = await db.exerciseWindow.findUniqueOrThrow({ where: { exerciseId }, select: { id: true, bidValidityDays: true, bidValidityProvenance: true, alternativesPermitted: true } });
  // Published, the alternatives answer is left as it stands (it changes only before publication).
  const published = ex.status === "ADVERTISED" || ex.status === "INVITED";
  const next = { bidValidityDays: v.days, bidValidityProvenance: v.provenance, alternativesPermitted: published ? w.alternativesPermitted : v.alternativesPermitted };
  refuse(`the bids' validity on ${ref}`, bidFieldsFaults({ status: ex.status, packKind: ex.packKindSnapshot, current: { days: w.bidValidityDays, alternativesPermitted: w.alternativesPermitted }, next: { days: next.bidValidityDays, provenance: next.bidValidityProvenance, alternativesPermitted: next.alternativesPermitted }, reason: v.reason }));
  await db.exerciseWindow.update({ where: { id: w.id }, data: next });
  // As saveBidAnswers: recorded after publication, the trail names the officer (S-6).
  const by = published ? { [EXIT_RECORDED_BY_FIELD]: `${v.recordedBy ?? fail6("the validity recorded after publication names nobody")}, recorded on their behalf, not signed` } : {};
  entry("ExerciseWindow", w.id, `${ref} · Bids and opening, Received · window answers`, "UPDATE", at, diffFields(bidAnswerFields(w), { ...bidAnswerFields(next), ...by }), v.reason);
}

// ------------------------------------------------------------------ the register's acts, as the actions write them

async function envelope(
  db: Db,
  organisationId: string,
  entry: Add,
  tz: string,
  e: { id: string; exerciseId: string; ref: string; sequence: number; kind: "BID" | "ALTERNATIVE" | "COMPANY_ESTIMATE"; channel: "COUNTER" | "POST" | "COURIER" | "BOX"; receivedAt: Date; late: boolean; closingAtJudged: Date | null; recordedAfterClosing: boolean; receivedSource: "SERVER" | "ENTERED"; statedReceivedAt: Date | null; entryReason: string; receivedBy: { id: string; name: string }; markings: string; recordedAt: Date },
) {
  const row = await db.bidEnvelope.create({
    data: {
      id: e.id, organisationId, exerciseId: e.exerciseId, sequence: e.sequence, kind: e.kind, channel: e.channel, receivedAt: e.receivedAt, receivedSource: e.receivedSource,
      statedReceivedAt: e.statedReceivedAt, entryReason: e.entryReason, recordedAt: e.recordedAt, receivedByPersonId: e.receivedBy.id, markings: e.markings, late: e.late,
      closingAtJudged: e.closingAtJudged, recordedAfterClosing: e.recordedAfterClosing, createdAt: e.recordedAt,
    },
  });
  entry(BID_ENTITY.envelope, row.id, `${e.ref} · Envelope ${e.sequence}`, "CREATE", e.recordedAt, diffFields(null, envelopeFields({ ...row, receivedBy: e.receivedBy.name, parentSequence: null }, tz)), e.entryReason);
}

/// The register's acts on one exercise, each judged as its action judges it on the rows as they stand.
export class Receipts {
  constructor(
    private readonly db: Db,
    private readonly org: string,
    private readonly tz: string,
    private readonly entry: Add,
    private readonly exerciseId: string,
    private readonly ref: string,
  ) {}

  private async state(at: Date) {
    const ex = await this.db.sourcingExercise.findUniqueOrThrow({ where: { id: this.exerciseId }, select: { status: true, closingAt: true, window: { select: { publishedAt: true } } } });
    const events = await this.db.boxEvent.findMany({ where: { exerciseId: this.exerciseId }, include: { person: { select: { name: true } } } });
    const envelopes = await this.db.bidEnvelope.findMany({ where: { exerciseId: this.exerciseId }, include: { withdrawal: { select: { id: true, receivedAt: true } } }, orderBy: { sequence: "asc" } });
    const exercise = { status: ex.status, closing: ex.closingAt, publishedAt: ex.window?.publishedAt ?? null, timeZone: this.tz, openingStarted: events.some((e) => e.kind === "UNLOCKED_FOR_OPENING") };
    return { ex, exercise, events: events.map((e) => ({ kind: e.kind, occurredAt: e.occurredAt, personName: e.person.name })), envelopes, today: dayIn(at, this.tz) };
  }

  /// recordReceiptNow, or recordReceiptAfterTheFact where a stated time is given: the server's stamp is `at`.
  async receive(id: string, r: { kind: "BID" | "ALTERNATIVE"; channel: "COUNTER" | "POST" | "COURIER"; markings: string; by: { id: string; name: string }; at: Date; stated?: { at: Date; reason: string } }) {
    const s = await this.state(r.at);
    refuse(`receiving ${id}`, receiptFaults({ exercise: s.exercise, kind: r.kind, channel: r.channel, markings: r.markings, personActive: true, now: r.at, stated: r.stated ?? null }));
    const j = judgeReceipt(r.at, s.ex.closingAt!);
    const sequence = s.envelopes.reduce((m, e) => Math.max(m, e.sequence), 0) + 1;
    await envelope(this.db, this.org, this.entry, this.tz, { id, exerciseId: this.exerciseId, ref: this.ref, sequence, kind: r.kind, channel: r.channel, ...j, receivedSource: r.stated ? "ENTERED" : "SERVER", statedReceivedAt: r.stated?.at ?? null, entryReason: r.stated?.reason ?? "", receivedBy: r.by, markings: r.markings, recordedAt: r.at });
  }

  async withdraw(id: string, envelopeId: string, markings: string, by: { id: string; name: string }, at: Date) {
    const s = await this.state(at);
    const env = s.envelopes.find((e) => e.id === envelopeId)!;
    refuse(`withdrawal ${id}`, withdrawFaults({ exercise: s.exercise, now: at, envelope: { kind: env.kind, late: env.late, status: env.status, withdrawn: env.withdrawal != null }, markings, personActive: true }));
    await this.db.bidWithdrawal.create({ data: { id, organisationId: this.org, exerciseId: this.exerciseId, receivedAt: at, recordedAt: at, receivedByPersonId: by.id, markings, closingAtJudged: s.ex.closingAt!, envelopeId, createdAt: at } });
    this.entry(BID_ENTITY.withdrawal, id, `${this.ref} · Withdrawal of envelope ${env.sequence}`, "CREATE", at, diffFields(null, withdrawalFields({ receivedAt: at, markings, receivedBy: by.name, envelopeSequence: env.sequence }, this.tz)));
    await this.db.bidEnvelope.update({ where: { id: envelopeId }, data: { status: "WITHDRAWN" } });
    this.entry(BID_ENTITY.envelope, envelopeId, `${this.ref} · Envelope ${env.sequence}`, "UPDATE", at, diffFields(statusField("RECEIVED"), statusField("WITHDRAWN")));
  }

  async returned(envelopeId: string, day: string, note: string, at: Date) {
    const s = await this.state(at);
    const env = s.envelopes.find((e) => e.id === envelopeId)!;
    refuse(`returning ${envelopeId}`, returnFaults({ envelope: env, withdrawnOn: env.withdrawal ? dayIn(env.withdrawal.receivedAt, this.tz) : null, day, today: s.today, cancelled: s.ex.status === "CANCELLED" }));
    await this.db.bidEnvelope.update({ where: { id: envelopeId }, data: { returnedUnopenedOn: dayToDate(day), returnNote: note } });
    this.entry(BID_ENTITY.envelope, envelopeId, `${this.ref} · Envelope ${env.sequence}`, "UPDATE", at, diffFields({ returnedUnopened: null, note: null }, returnFields({ returnedUnopenedOn: dayToDate(day), note })));
  }

  async lock(id: string, by: { id: string; name: string }, at: Date, note: string) {
    const s = await this.state(at);
    refuse(`locking the box ${id}`, lockFaults({ exercise: s.exercise, now: at, events: s.events, personActive: true }));
    await this.db.boxEvent.create({ data: { id, organisationId: this.org, exerciseId: this.exerciseId, kind: "LOCKED", occurredAt: at, recordedAt: at, personId: by.id, note } });
    this.entry(BID_ENTITY.box, id, `${this.ref} · Tender box locked`, "CREATE", at, diffFields(null, boxFields({ at, by: by.name, note }, this.tz)));
  }
}

// ------------------------------------------------------------------ the late envelope's sitting (X-4: demo_mt13, demo_d42)

async function lateSitting(db: Db, organisationId: string, tz: string, entry: Add, i: { sx: string; ref: string; title: string; envelopeId: string; on: string; at: Date }): Promise<string[]> {
  const { checkTabling, secretariatHoldersOn } = await import("../src/lib/committee/tabling");
  const { loadRoster } = await import("../src/lib/people/load");
  const { loadBidRule, loadBidWindow, loadLateMatters } = await import("../src/lib/bids/repo");
  const committee = await db.committee.findUniqueOrThrow({ where: { id: `${P}c1` }, select: { code: true, nameEn: true, secretariatRoleCode: true } });
  const env = await db.bidEnvelope.findUniqueOrThrow({ where: { id: i.envelopeId } });
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: i.sx }, select: { status: true, sourcingMethodCode: true } });
  // CR-2: the committee frozen with the window at publication, as tableLateMatter reads it.
  const frozen = await loadBidRule(await loadBidWindow(i.sx), organisationId, ex.sourcingMethodCode);
  refuse("tabling the late envelope", lateMatterFault({ exerciseCancelled: ex.status === "CANCELLED", committeeCode: frozen.rule?.lateAdmissionCommitteeCode ?? null, committeeSource: frozen.committee, envelope: env, matters: await loadLateMatters(i.sx), sitting: { committeeCode: committee.code, frozen: false } }));
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const roster = await loadRoster(ORGANISATION_CODE);
  const holders = secretariatHoldersOn(roster, committee.secretariatRoleCode, i.on).map((h) => h.id);
  const tabling = checkTabling({ secretariatRoleCode: committee.secretariatRoleCode, tabledByPersonId: HOD_CP.id, holderIdsOnDate: holders, tablingDay: i.on });
  if (!tabling.ok) throw new Error(`Demo 6.6: the late envelope could not be tabled (${tabling.fault}).`);
  const mt = `${P}mt13`;
  await db.meeting.create({
    data: {
      id: mt, committeeId: `${P}c1`, reference: "DEMO/SIT/5A/2026", meetingDate: dayToDate(i.on), status: "MINUTED", minutedAt: dayToDate(i.on),
      agenda: `Admission of a late envelope: ${i.title} (${i.ref}).`,
      minutes: "The Board noted that the envelope was recorded one second after the closing, with the box locked five minutes later, and admitted it.",
    },
  });
  await db.meetingAttendance.createMany({ data: [{ id: `${P}at60`, meetingId: mt, personId: `${P}p1`, attended: true }, { id: `${P}at61`, meetingId: mt, personId: `${P}p2`, attended: true }, { id: `${P}at62`, meetingId: mt, personId: `${P}p3`, attended: true }, { id: `${P}at63`, meetingId: mt, personId: `${P}p7`, attended: true }] });
  const subject = lateMatterSubject(i.title, env.sequence);
  await db.committeeDecision.create({
    data: {
      id: `${P}d42`, meetingId: mt, sequence: 1, domain: LATE_DOMAIN, matterKind: "LATE_TENDER", matterRef: i.ref, bidEnvelopeId: env.id, subject, act: "A",
      tabledByPersonId: HOD_CP.id, tabledAt: dayToDate(i.on), outcome: "CARRIED", decisionDate: dayToDate(i.on), quorumRequired: 3, presentVoters: 3, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.vote.createMany({
    data: ["p1", "p2", "p7"].map((p, k) => ({ id: `${P}v6${k}`, decisionId: `${P}d42`, personId: `${P}${p}`, choice: "SETUJU" as const, votedAt: dayToDate(i.on), recordedAt: dayToDate(i.on) })),
  });
  entry("CommitteeDecision", `${P}d42`, `${i.ref} · ${subject}`, "CREATE", i.at, diffFields(null, { matter: subject, envelope: `Envelope ${env.sequence}`, sitting: "DEMO/SIT/5A/2026", committee: committee.nameEn, act: ACT_LABEL.A ?? "Approve", tabledBy: HOD_CP.name, tabledOn: formatDate(i.on), recordedOnBehalf: "yes" }));
  return [mt];
}

// ------------------------------------------------------------------ the validity extension (demo_vx1)

async function extension(db: Db, organisationId: string, tz: string, entry: Add, docs: (ds: DemoDoc[]) => Promise<void>, nextDoc: () => string, i: { sx: string; ref: string; party: { id: string; name: string }; recordedAt: Date; today: string }) {
  const { validityOf } = await import("../src/lib/bids/repo");
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: i.sx }, select: { status: true, closingAt: true, window: { select: { bidValidityDays: true } } } });
  const v = validityOf({ closing: ex.closingAt, timeZone: tz, days: ex.window!.bidValidityDays, extensions: [], offsets: [], now: i.recordedAt });
  const to = dayPlus(v.expiry!, 30);
  const consentOn = dayIn(i.recordedAt, tz);
  const reason = "Invented for the demo: the evaluation of the reservoir inlet works is expected to run past the bids' validity; the recommended tenderer consented in writing.";
  refuse("recording the extension", extensionFaults({ cancelled: false, closing: ex.closingAt, now: i.recordedAt, today: i.today, currentExpiry: v.expiry, toExpiry: to, reason, partyKnown: true, partyId: i.party.id, recommendedPartyId: null, consentReceivedOn: consentOn, pendingExists: false, personActive: true }));
  const id = `${P}vx1`;
  const row = await db.validityExtension.create({ data: { id, organisationId, exerciseId: i.sx, fromExpiry: dayToDate(v.expiry!), toExpiry: dayToDate(to), reason, consentPartyId: i.party.id, consentReceivedOn: dayToDate(consentOn), recordedByPersonId: HOD_CP.id, recordedAt: i.recordedAt, createdAt: i.recordedAt } });
  entry(BID_ENTITY.extension, id, `${i.ref} · Validity extension to ${formatDate(to)}`, "CREATE", i.recordedAt, diffFields(null, extensionFields({ ...row, consentParty: i.party.name, recordedBy: HOD_CP.name })), reason);
  const did = nextDoc();
  const title = `Consent to extend the validity of its tender, ${i.ref}`;
  const attachAt = new Date(i.recordedAt.getTime() + 5 * 60_000);
  await docs([{
    id: did, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: attachAt.toISOString().slice(0, 16),
    versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([`Consent to extend validity (demo) — ${i.ref}`, `${i.party.name} agrees its tender stays valid until ${formatDate(to)}.`, "Signed on paper."]), mediaType: "application/pdf", filename: "validity-consent.pdf", receivedOn: consentOn, storedAt: attachAt.toISOString().slice(0, 16) }],
    attachments: [{ id: `${did}a1`, purpose: "VALIDITY_CONSENT", owner: { validityExtensionId: id }, ownerLabel: `${i.ref} · Validity extension to ${formatDate(to)}`, versionId: `${did}v1`, at: attachAt.toISOString().slice(0, 16) }],
  }]);
  const appliedAt = new Date(i.recordedAt.getTime() + 10 * 60_000);
  const consents = await db.documentAttachment.count({ where: { validityExtensionId: id, detachedAt: null, version: { withdrawnAt: null } } });
  refuse("applying the extension", applyFaults({ cancelled: false, appliedAt: null, liveConsents: consents, toExpiry: to, currentExpiry: v.expiry }));
  await db.validityExtension.update({ where: { id }, data: { appliedAt } });
  entry(BID_ENTITY.extension, id, `${i.ref} · Validity extension to ${formatDate(to)}`, "UPDATE", appliedAt, diffFields({ applied: null }, appliedFields(appliedAt, tz)));
}

// ------------------------------------------------------------------ sx20's requisition (demo_rq35, route demo_ai72)

async function loadRequisition(db: Db, organisationId: string, W: (k: number) => string, T: (d: string, t: string) => Date) {
  const r = { n: 41, title: "Clear water tank relining, Demo Heights", value: "420000.00", justification: "The clear water tank's lining has blistered and the tank leaks at the floor joints.", need: "Reline the tank and seal its floor joints." };
  const rule = BIG;
  const fmt = (s: bigint) => senToDecimalString(s);
  const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: `${P}bcode9` } });
  const original = movements.filter((m) => m.kind === "ORIGINAL").reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
  const balance = original - movements.filter((m) => m.kind === "COMMITMENT" && !m.releasedOn).reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
  const value = parseSen(r.value);
  if (balance < value) throw new Error("Demo 6.6: the budget code has no room for sx20's requisition.");
  const raised = W(23);
  const endorsed = W(22);
  const checked = W(21);
  const steps = rule.chain.map((_, s) => W(20 - s));
  const approvedOn = steps[steps.length - 1];
  const rq = `${P}rq35`;
  const route = `${P}ai72`;
  const movement = `${P}bm60`;
  await db.requisition.create({
    data: {
      id: rq, organisationId, reference: REQ(r.n), origin: "PORTAL", erpRequisitionNo: `XR20260003${r.n}`, erpNoteNo: `RN/2026/03${r.n}`, erpRefSource: "MANUAL", erpRefRecordedAt: dayToDate(raised),
      requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: r.title, justification: r.justification, needStatement: r.need,
      costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: dayToDate(W(-120)),
      estimatedValue: r.value, raisedOn: dayToDate(raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES",
      status: "APPROVED", commitmentMovementId: movement,
      lines: { create: [{ id: `${rq}l1`, lineNo: 1, description: r.title, estimatedAmount: r.value }] },
    },
  });
  await db.requisitionEndorsement.createMany({
    data: [
      { id: `${P}en35a`, requisitionId: rq, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: dayToDate(endorsed) },
      { id: `${P}en35b`, requisitionId: rq, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: dayToDate(endorsed) },
    ],
  });
  await db.requisitionBudgetCheck.create({
    data: { id: `${P}bk35`, requisitionId: rq, checkedAt: dayToDate(checked), asAt: dayToDate(checked), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode9`, budgetCodeCode: "CAP26-050", requestedAmount: r.value, actualBudget: fmt(original), balanceAsAt: fmt(balance), approvedAccount: fmt(original - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - value), verdict: "WITHIN" },
  });
  await db.requisitionSplitCheck.create({ data: { id: `${P}sp35`, requisitionId: rq, checkedAt: dayToDate(checked), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
  await db.budgetMovement.create({ data: { id: movement, budgetCodeId: `${P}bcode9`, kind: "COMMITMENT", amount: r.value, occurredOn: dayToDate(approvedOn), reference: REQ(r.n), description: r.title } });
  await db.approvalInstance.create({
    data: {
      id: route, organisationId, matterKind: "REQUISITION", requisitionId: rq, domain: "requisition", value: r.value,
      authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: rule.key, ruleLabel: rule.label, ruleClause: rule.clause,
      boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex",
      budgetCheckId: `${P}bk35`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp35`, splitState: "CLEAR",
      checkedAgainstMatrix: true, status: "APPROVED", openedAt: dayToDate(checked), closedAt: T(approvedOn, "16:00"), commitOnApproval: true, routeCommitsBudget: true, createdAt: T(checked, "10:00"),
      steps: {
        create: rule.chain.map(([roleCode, roleLabel, act, pid, name], s) => ({
          id: `${P}rs35_${s + 1}`, sequence: s + 1, roleCode, roleLabel, act, nonDelegable: act === "MR", sourceRuleKey: rule.key,
          decision: "DONE", decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: dayToDate(steps[s]), recordedAt: T(steps[s], "11:00"),
        })),
      },
    },
  });
  const label = `${REQ(r.n)} · ${r.title}`;
  const rlabel = `${REQ(r.n)} · approval route`;
  const entries: object[] = [];
  let k = 0;
  const e = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: Date, changes: object[], reason = "") => entries.push({ id: `${rq}_au${++k}`, organisationId, entity, entityId, entityLabel, action, at, changes, reason, ...DEMO_ACTOR });
  e("Requisition", rq, label, "CREATE", T(raised, "09:00"), diffFields(null, { reference: REQ(r.n), title: r.title, justification: r.justification, needStatement: r.need, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: dayToDate(W(-120)), estimatedValue: r.value, fundingRouteCode: "capex", contractTypeCode: null, lines: 1, status: "DRAFT" }));
  e("RequisitionEndorsement", `${P}en35a`, `${REQ(r.n)} · Section endorsement`, "CREATE", T(endorsed, "09:00"), diffFields(null, { tier: "SECTION", unit: "Maintenance Section", person: "Lim Kok Seng", endorsedOn: dayToDate(endorsed), note: "" }));
  e("RequisitionEndorsement", `${P}en35b`, `${REQ(r.n)} · Department endorsement`, "CREATE", T(endorsed, "10:00"), diffFields(null, { tier: "DEPARTMENT", unit: "Northern Region", person: "Imran Hakim", endorsedOn: dayToDate(endorsed), note: "" }));
  e("Requisition", rq, label, "UPDATE", T(endorsed, "10:00"), diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
  e("RequisitionBudgetCheck", `${P}bk35`, `${REQ(r.n)} · budget check`, "CREATE", T(checked, "09:30"), diffFields(null, { source: "PORTAL_LEDGER", asAt: dayToDate(checked), budgetCode: "CAP26-050", verdict: "WITHIN", requestedAmount: r.value }));
  e("ApprovalInstance", route, rlabel, "CREATE", T(checked, "10:00"), diffFields(null, { matrix: "Demo limits, issue 1", rule: rule.label, route: rule.chain.map(([, roleLabel, act]) => `${roleLabel} (${ACT_LABEL[act]?.toLowerCase() ?? "acts"})`).join(" → "), overBudget: false, fundingOverrideApplied: false, splitState: "CLEAR" }));
  e("Requisition", rq, label, "UPDATE", T(checked, "10:00"), diffFields({ status: "ENDORSED", sourcingPermitted: null }, { status: "PENDING_APPROVAL", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES" }));
  rule.chain.forEach(([, roleLabel, , , name], s) => e("ApprovalStep", `${P}rs35_${s + 1}`, `${REQ(r.n)} · ${roleLabel}`, "UPDATE", T(steps[s], "11:00"), diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: dayToDate(steps[s]), recordedOnBehalf: "not signed", underDelegation: null })));
  e("BudgetMovement", movement, `CAP26-050 · commitment for ${REQ(r.n)}`, "CREATE", T(approvedOn, "16:00"), diffFields(null, { kind: "COMMITMENT", budgetCode: "CAP26-050", reference: REQ(r.n), amount: r.value, occurredOn: dayToDate(approvedOn) }));
  e("ApprovalInstance", route, rlabel, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: "written" }));
  e("Requisition", rq, label, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  await db.auditEntry.createMany({ data: entries as never });
  await raiseSeries(db, `${P}n1`, 42);
}

// ------------------------------------------------------------------ the read-back (X-10 b)

export async function checkBidsDemo(db: Db) {
  const { bidGate, loadEnvelopes, loadLateMatters } = await import("../src/lib/bids/repo");
  const { admission } = await import("../src/lib/bids/late");
  const { windowData } = await import("../src/lib/window/repo");
  const { phaseOf } = await import("../src/lib/window/judge");
  const repo = await import("../src/lib/method/repo");
  const fail = (what: string): never => {
    throw new Error(`Demo 6.6: ${what}`);
  };
  const now = new Date();
  const want: Record<string, string> = { [`${P}sx16`]: "CLOSED", [`${P}sx18`]: "OPEN_FOR_PURCHASE", [NEW_EXERCISE]: "CLOSED" };
  for (const [id, phase] of Object.entries(want)) {
    const l = (await repo.loadExercise(await demoOrgId(), id)) ?? fail(`${id} did not load.`);
    const d = await windowData(l.org.id, l.ex);
    const got = phaseOf(l.ex, d.window, now, l.org.timeZone).phase;
    if (got !== phase) fail(`${l.ex.reference} reads ${got}, not ${phase}.`);
  }
  // CR-2: both registers are judged by the rules frozen at publication, recorded and set.
  const { loadBidRule, loadBidWindow } = await import("../src/lib/bids/repo");
  for (const id of [`${P}sx16`, NEW_EXERCISE]) {
    const l = (await repo.loadExercise(await demoOrgId(), id)) ?? fail(`${id} did not load.`);
    const r = await loadBidRule(await loadBidWindow(id), l.org.id, l.ex.sourcingMethodCode);
    if (!r.frozen || r.committee !== "AS_PUBLISHED" || r.completeness !== "AS_PUBLISHED" || !r.rule?.lateAdmissionCommitteeCode || r.rule.completenessEliminates == null) fail(`${l.ex.reference} was not published with the method's bid-receipt rules recorded.`);
  }
  // S-6: sx16's validity, recorded after publication, reads when, by whom and why.
  {
    const { validityExitOf } = await import("../src/lib/bids/window-fields");
    const w16 = await db.exerciseWindow.findUniqueOrThrow({ where: { exerciseId: `${P}sx16` }, select: { id: true, publishedAt: true } });
    const trail16 = await db.auditEntry.findMany({ where: { entity: "ExerciseWindow", entityId: w16.id }, select: { at: true, reason: true, changes: true } });
    const exit = validityExitOf(trail16, w16.publishedAt);
    if (!exit?.by || !exit.reason) fail("sx16's validity, recorded after publication, does not say by whom and why.");
  }
  // sx16: the late envelope admitted, so nothing waits; the validity extended and valid.
  const e16 = await loadEnvelopes(`${P}sx16`);
  const late16 = e16.filter((e) => e.late);
  if (late16.length !== 1 || late16[0].id !== `${P}env4`) fail("sx16 should have exactly one late envelope, demo_env4.");
  if (admission(`${P}env4`, await loadLateMatters(`${P}sx16`)).state !== "ADMITTED") fail("demo_env4 is not admitted by demo_d42.");
  if (!e16.some((e) => e.receivedSource === "ENTERED" && !e.late)) fail("sx16 has no envelope recorded after the event in time.");
  if (!e16.some((e) => e.status === "WITHDRAWN" && e.returnedUnopenedOn)) fail("sx16 has no withdrawn envelope handed back.");
  const g16 = await bidGate(`${P}sx16`);
  if (!g16.published || g16.lateFault || g16.validityFault) fail("sx16's register holds its award back.");
  // sx20: a late envelope not tabled, so the gate refuses (the refusal the demo shows).
  const g20 = await bidGate(NEW_EXERCISE);
  if (g20.lateFault?.code !== "LATE_UNDECIDED") fail("sx20's late envelope does not hold its appointment back.");
  const e20 = await loadEnvelopes(NEW_EXERCISE);
  if (!e20.some((e) => e.kind === "COMPANY_ESTIMATE")) fail("sx20's estimate lodgement is not on its register.");
  // OD-2: no envelope names a bidder before opening (6.7 names each as it is opened).
  if (await db.bidEnvelope.count({ where: { id: demoRef, status: { not: "OPENED" }, NOT: { partyId: null } } })) fail("a demo envelope names a party before opening.");
  // 64-C4-d: demo_aw7 on sx16 still reads as it did, with nothing new held against it.
  const { evaluateAward } = await import("../src/lib/award/evaluate");
  const { awardFacts, loadAward } = await import("../src/lib/award/repo");
  const aw = (await loadAward(await demoOrgId(), `${P}aw7`)) ?? fail("demo_aw7 did not load.");
  const ev = evaluateAward((await awardFacts(aw)).facts);
  const held = [...ev.submitFaults, ...ev.issueFaults].filter((f) => ["LATE_UNDECIDED", "VALIDITY_NOT_SET", "BID_VALIDITY_EXPIRED", "VALIDITY_NOT_JUDGED"].includes(f.code));
  if (held.length) fail(`demo_aw7 is held back by the register (${held.map((f) => f.code).join(", ")}).`);
  const later = await db.auditEntry.count({ where: { id: { startsWith: `${P}bau` }, at: { gt: now } } });
  if (later) fail(`${later} trail entries are dated after now (X-10 a).`);
  const gate = lateAdmissionFault(e20, await loadLateMatters(NEW_EXERCISE), true);
  if (!gate) fail("sx20's late envelope reads as decided.");
}

/// Ids the demo writes, for the X-4 scan.
export const BID_DEMO_IDS = { sitting: `${P}mt13`, matter: `${P}d42`, exercise: NEW_EXERCISE, routes: [`${P}ai72`, `${P}ai73`] } as const;
