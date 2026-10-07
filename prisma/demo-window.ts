/**
 * Demo data for 6.5: the invitation window (plan §6, as ruled: X-4, X-10). Invented throughout;
 * every configured value is ASSUMED and none is a customer's figure or source (X-10 d). Every row
 * passes the checks of its act, judged by the product's own functions as it is written (X-10 c),
 * and every act is dated relative to the load day — the organisation's today — on its working
 * days, never after it; only scheduled dates (a closing, a last day of sale) lie ahead (X-10 a, b).
 * The load reads each phase back from the stored instants and refuses if one is not what it says.
 *
 * - Invitation controls: policy demo_wp1 (only where the organisation has none): 7 days minimum
 *   from the advertisement day to the closing, 10 the target, a 2-day margin for a late
 *   newspaper, sale closing 2 days before the closing, closing time 15:00, the advertisement day
 *   the latest required channel's, mandatory attendance permitted; the demo notice, letter and
 *   addendum templates demo_dt13–15. Channels demo_pch1–3 (a newspaper, the notice board, the
 *   website), each required. Fee floors demo_ff1–2 (tender RM200.00, quotation RM40.00; invented, X-10 d). Calendar
 *   demo_hol1, weekends Saturday and Sunday, invented holidays demo_hd*, each year the demo's dates
 *   touch maintained in full and the year after them not (it shows the block).
 * - Authority rows: approval for tendering of a tender (demo_rule42, the Head of Contract &
 *   Procurement); changes to the window (demo_rule43 tender, demo_rule44 quotation, the Head of
 *   Division); the selective quotation's name route gains a Quotation Committee recommendation
 *   (step demo_st40), so its committee step is cited (OD-12).
 * - Requisitions demo_rq32–34, approved; exercises taken through 6.2's panel and estimate and
 *   6.4's documents with 6.4's own acts (demo-tender-docs.ts), then:
 *   - demo_sx19 (open tender): advertised, one set sold, cancelled with the fees refunded on an
 *     approved window_change route (demo_ai70); its purchaser told. Replaced by demo_sx16.
 *   - demo_sx16 (open tender, replaces sx19): advertised, a mandatory briefing held with two
 *     attending, two sets sold (one receipt not yet recorded), closed before the load day. A
 *     contractor who missed the briefing is refused a set (checked, never written).
 *   - demo_sx17 (selective quotation): three invitees, the name route (demo_ai69) with the list
 *     frozen on it, its committee step cited from demo_d41 at demo_mt12, invited, letters frozen,
 *     two despatched (one acknowledged), one sold; open for purchase.
 *   - demo_sx18 (open quotation, restricted): advertised, three sets sold (one certificate expiring
 *     before the closing), addendum 1 issued (one copy not yet despatched, one given with the
 *     documents), the closing extended on an approved route (demo_ai71), notices recorded in part;
 *     open for purchase.
 * Parties are not linked to a supplier register (ExerciseParty.vendorId stays null until 6.15).
 */

import { raiseSeries } from "./demo-series";
import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { routeCoreFields, stepOrigin } from "../src/lib/authority/core-routing";
import { committeeCitationWrite, personDecisionWrite } from "../src/lib/authority/decided-step";
import { actingOffice } from "../src/lib/authority/escalation";
import { rejectionSnapshot } from "../src/lib/authority/rejection";
import { boundaryOperatorFor } from "../src/lib/authority/resolve";
import { dayIn, dayToDate, instantAt, isoWeekday, storedDay, todayIn } from "../src/lib/dates";
import { formatDate, formatOrgDateTime } from "../src/lib/format";
import { manualFeeReceipt } from "../src/lib/integration/fee-receipt";
import { ACT_LABEL } from "../src/lib/labels";
import { exerciseRouteMatter, exerciseRoutesOf, nameRequestFault, nameRouteForRequester, nameRoutesOf, requesterHolding, WITHDRAWN_ON_CANCEL, windowChangeRoutesOf } from "../src/lib/method/approval";
import { REGIME_LABEL } from "../src/lib/method/labels";
import { moveExercise } from "../src/lib/method/move";
import { nameRequestProposalFault } from "../src/lib/method/proposal";
import { NAME_APPROVAL_DOMAIN, WINDOW_CHANGE_DOMAIN, type Regime } from "../src/lib/method/types";
import { parseSen, senToDecimalString } from "../src/lib/money";
import { pathTo } from "../src/lib/organisation/structure";
import type { OrgUnit } from "../src/lib/organisation/types";
import { committeeStepFrom } from "../src/lib/requisition/committee-step";
import { deciderFaults, NO_EARLIER_RECORDERS, holdersFor } from "../src/lib/requisition/holders";
import { estimateCreatedAudit, estimateEventAudit, estimateStateAudit, estimateVersionAudit, verificationAudit, ENTITY as SCOPE_ENTITY } from "../src/lib/scope/audit-view";
import { packStatusAudit, ENTITY as PACK_ENTITY } from "../src/lib/tender-docs/audit-view";
import { addendaForNewPurchaser, deliveryFaults, issueFaults, nextAddendumNumber, recipientsFor } from "../src/lib/window/addendum";
import { addendumFields, changeFields, deliveryFields, eventFields, feeLineFields, partyFields, saleFields, windowFields, ENTITY } from "../src/lib/window/audit-view";
import { cancelFaults, closingChangeFaults, noticeRecipients, windowChangeRouteForRequester, type WindowChangeCond } from "../src/lib/window/change";
import { policyFaults } from "../src/lib/window/config";
import { loadBidMethodRule } from "../src/lib/bids/repo";
import { BID_RULES_KEY, bidRulesSnapshot } from "../src/lib/bids/rule-snapshot";
import { policySnapshot } from "../src/lib/window/dates";
import { invitedSaleFault, publicationFault, windowChangeRejectionSnapshot, windowEditFault } from "../src/lib/window/edit";
import { eventFaults, heldFault, mandatoryPermittedFor } from "../src/lib/window/events";
import { lineAmount } from "../src/lib/window/fee";
import { approvedNameRoute, inviteeEditFault, nameListFault, regKey } from "../src/lib/window/invitees";
import { closingDay, judgePublish, nameRoutesWithLists, pathOf, phaseOf, proposedInvitees, renderAddendum } from "../src/lib/window/judge";
import { CHANGE_ROUTE_TEXT, DAY_RULE_LABEL, windowFindingText } from "../src/lib/window/labels";
import { nameCitationFault } from "../src/lib/window/name-citation";
import { closingConsistent, closingHistory } from "../src/lib/window/phase";
import { saleAnnotation, saleFaults } from "../src/lib/window/sale";
import type { CertSighted, DeliveryMethod, FeeCostKind, Finding, PartySource, SiteEventKind } from "../src/lib/window/types";
import { demoPdf, writeDemoDocs, type DemoDoc } from "./demo-documents";
import { answer, conditionsFor, confirm, decide, enterAppendix, markAllReady, moveIntoPreparation, startPack, submit, type Add } from "./demo-tender-docs";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const demoRef = { startsWith: P };
const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;
const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
const SOURCE = "Demo procedure 5 (invented)";
/// Who records the window's acts, on whose behalf (not signed): an officer of the Pre-contract
/// Section. Nothing here claims he acts for the Section Head: his delegation (demo_dg3) covers only
/// 28 September to 16 October, and the demo's acts are not all inside it.
const CLERK = `${P}p4`;
const CLERK_NAME = "Daniel Anak Jelani";

/// The demo's exercises (X-4), in the order their windows run.
export const WINDOW_EXERCISES = [`${P}sx19`, `${P}sx16`, `${P}sx17`, `${P}sx18`] as const;

/// Invented holidays, by month and day, in every year the demo maintains in full.
const HOLIDAYS: readonly [string, string][] = [
  ["01-01", "Demo New Year's Day"],
  ["05-01", "Demo Workers' Day"],
  ["08-21", "Demo Foundation Day"],
  ["12-25", "Demo Year-End Holiday"],
];
const WEEKEND = [6, 7];

// ------------------------------------------------------------------ the calendar the demo runs on

/// The load day in the organisation's zone, and its working days either side.
export function calendarOf(today: string) {
  const isHoliday = (d: string) => HOLIDAYS.some(([md]) => d.slice(5) === md);
  const working = (d: string) => !WEEKEND.includes(isoWeekday(d)) && !isHoliday(d);
  const step = (d: string, n: number) => {
    const t = dayToDate(d);
    t.setUTCDate(t.getUTCDate() + n);
    return storedDay(t);
  };
  /// The k-th working day before the load day (k > 0), or after it (k < 0). Never the load day.
  const W = (k: number) => {
    let d = today;
    let left = Math.abs(k);
    while (left > 0) {
      d = step(d, k > 0 ? -1 : 1);
      if (working(d)) left--;
    }
    return d;
  };
  return { W, working };
}

// ------------------------------------------------------------------ the load

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

export interface WindowDemoHooks {
  /// demo.ts's determination of draft exercises (bands, snapshot, trail), as a save writes it.
  determine(ids: string[]): Promise<void>;
}

/**
 * Load 6.5's demo. Returns the minuted sitting it adds, for demo.ts to give its trail and register
 * (as it does for the other sittings).
 */
export async function loadWindowDemo(db: Db, organisationId: string, hooks: WindowDemoHooks): Promise<{ sittings: string[] }> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 6.5: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  /// An instant on a day at a clock time in the organisation's zone.
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  /// The same, as an ISO string in UTC to the minute (for the document helper).
  const iso = (d: string, hhmm: string) => T(d, hhmm).toISOString().slice(0, 16);

  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") =>
    trail.push({ id: `${P}wau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };

  // ---- configuration: the working day before the first exercise moves
  const configured = T(W(15), "08:30");
  await loadConfiguration(db, organisationId, configured, L, W, entry);

  // ---- requisitions, approved, then the exercises opened on them (drafts, determined as a save does)
  await loadRequisitions(db, organisationId, W, T);
  const created = T(W(14), "10:00");
  await createExercises(db, organisationId, [19, 17, 18], created);
  await hooks.determine([`${P}sx19`, `${P}sx17`, `${P}sx18`]);

  const acts = new Acts(db, organisationId, tz, entry);
  let doc = 30;
  const docs = async (ds: DemoDoc[]) => {
    if (!ds.length) return;
    const e = await writeDemoDocs(db, organisationId, ds, `${P}wdoc${doc}au`, { id: `${P}p3`, name: "Chen Wei Ling" });
    await e.flush();
  };
  const nextDoc = () => `${P}doc${doc++}`;

  // ---- 6.2 and 6.4, by their own acts, for each exercise before its window
  const prepare = async (sx: number, on: string, packOn: string, approveOn: string, dates: { startOn: string; closingDay: string }, conditions: { body: string; qualifiers?: string; group: number }[], restricted: boolean) => {
    const id = `${P}sx${sx}`;
    const ref = SX(sx);
    await scopeReady(db, organisationId, tz, id, ref, sx, on, T, nextDoc, docs, entry);
    await moveIntoPreparation(db, organisationId, id, on, { report: "works" }, entry);
    const pack = `${P}tpk${sx}`;
    await startPack(db, organisationId, { id: pack, exerciseId: id, versionNo: 1, at: T(packOn, "08:30") }, entry);
    const parts = await db.tenderPackPart.findMany({ where: { packId: pack, source: "UPLOAD" }, orderBy: { sortOrder: "asc" } });
    await docs(
      parts.map((p, i) => {
        const did = nextDoc();
        const title = `${p.labelSnapshot}, ${ref}`;
        const atIso = iso(packOn, `08:${String(40 + i).padStart(2, "0")}`);
        return {
          id: did, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: atIso,
          versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([title, "Tender document part (demo)."]), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: packOn, storedAt: atIso }],
          attachments: [{ id: `${did}a1`, purpose: "TENDER_PART" as const, owner: { tenderPackPartId: p.id }, ownerLabel: `${ref} · Tender pack v1 · part ${p.printedNumber}, ${p.labelSnapshot}`, versionId: `${did}v1`, at: atIso }],
        };
      }),
    );
    await enterAppendix(db, organisationId, pack, ref, COMPLETE_APPENDIX, T(packOn, "09:00"), entry);
    await conditionsFor(db, organisationId, id, ref, conditions, T(packOn, "09:10"), entry);
    await answer(db, organisationId, id, ref, { restrictedTender: restricted, regulatedActivity: true, regulatorPermitCode: sx === 16 || sx === 19 ? "class_2" : "class_1" }, T(packOn, "09:20"), entry);
    await confirm(db, organisationId, pack, ref, "NO_AMBIGUITY", `${P}p4`, packOn, T(packOn, "09:30"), entry, L);
    await confirm(db, organisationId, pack, ref, "DRAWINGS_COORDINATED", `${P}p10`, packOn, T(packOn, "09:35"), entry, L);
    await markAllReady(db, organisationId, pack, ref, T(packOn, "10:00"), entry);
    await submit(db, organisationId, { packId: pack, routeId: `${P}ai${TENDERING_ROUTE[sx]}`, at: T(packOn, "11:00"), startOn: dates.startOn, closingDay: dates.closingDay, closingTime: "15:00" }, entry);
    await decide(db, organisationId, { packId: pack, decision: "DONE", personId: `${P}p3`, decidedOn: approveOn, at: T(approveOn, "09:00"), reason: "", dates: { ...dates, closingTime: "15:00" } }, entry);
  };
  const works = (grade: string) => [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: grade, group: 2 }];

  // ================================================================ sx19: advertised, then cancelled
  {
    const sx = `${P}sx19`;
    await prepare(19, W(13), W(12), W(11), { startOn: W(11), closingDay: W(-3) }, works("grade D4, category civil works"), false);
    await acts.saveWindow(sx, `${P}win19`, tenderWindow(W(11), W(-1)), T(W(11), "09:30"));
    await acts.feeLines(sx, 19, TENDER_FEE_BASIS, T(W(11), "09:40"));
    for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub19_${i + 1}`, c.id, W(11), c.reference(19), T(W(11), `10:0${i}`));
    await acts.publish(sx, T(W(11), "11:00"));
    await acts.sale(sx, `${P}sale1`, { party: { id: `${P}pty1`, ...FIRMS.contoh }, receiptNo: "FR/26/004101", collectedBy: "Ahmad bin Demo", paymentMethod: "Cheque" }, T(W(10), "10:00"));
    await acts.requestCancellation(sx, `${P}wc1`, `${P}ai70`, "The scope is to be re-let with the reservoir inlet works added; the exercise is re-advertised as DEMO/SX/0016/2026.", true, T(W(9), "09:00"));
    await acts.decideChange(sx, `${P}ai70`, W(9), T(W(9), "15:00"));
    await acts.noticeDelivery(sx, "REGISTERED_POST", "RR 0001 4101 6MY", W(8), W(6), T(W(6), "10:00"));
  }

  // ================================================================ sx16: the replacement, closed
  {
    await createExercises(db, organisationId, [16], T(W(9), "16:00"), `${P}sx19`);
    await hooks.determine([`${P}sx16`]);
    const sx = `${P}sx16`;
    await prepare(16, W(8), W(7), W(6), { startOn: W(6), closingDay: W(1) }, works("grade D4, category civil works"), false);
    await acts.saveWindow(sx, `${P}win16`, tenderWindow(W(6), W(3)), T(W(6), "09:30"));
    await acts.feeLines(sx, 16, TENDER_FEE_BASIS, T(W(6), "09:40"));
    await acts.scheduleEvent(sx, `${P}brf1`, "BRIEFING", W(5), "10:00", "Demo Heights reservoir, site office", true, "Bring proof of the firm's registration.", T(W(6), "09:50"));
    for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub16_${i + 1}`, c.id, W(6), c.reference(16), T(W(6), `10:0${i}`));
    await acts.publish(sx, T(W(6), "11:00"));
    await acts.markHeld(sx, `${P}brf1`, W(5), T(W(5), "12:00"));
    await acts.attend(sx, `${P}brf1`, `${P}att1`, { id: `${P}pty2`, ...FIRMS.contoh }, "Ahmad bin Demo", T(W(5), "12:10"));
    await acts.attend(sx, `${P}brf1`, `${P}att2`, { id: `${P}pty3`, ...FIRMS.sampel }, "Lim Contoh", T(W(5), "12:15"));
    await acts.sale(sx, `${P}sale2`, { partyId: `${P}pty2`, receiptNo: "FR/26/004188", collectedBy: "Ahmad bin Demo", paymentMethod: "Bank draft" }, T(W(4), "10:00"));
    await acts.sale(sx, `${P}sale3`, { partyId: `${P}pty3`, receiptNo: null, collectedBy: "Lim Contoh", paymentMethod: "Cash at the finance counter" }, T(W(3), "11:30"));
  }

  // ================================================================ sx17: invited, on an approved list
  let sittings: string[] = [];
  {
    const sx = `${P}sx17`;
    await prepare(17, W(13), W(12), W(11), { startOn: W(10), closingDay: W(-8) }, works("grade D2, category civil works"), false);
    for (const [i, f] of [FIRMS.contoh, FIRMS.paip, FIRMS.teladan].entries()) await acts.proposeInvitee(sx, `${P}pty${4 + i}`, f, T(W(11), `10:0${i}`));
    await acts.requestName(sx, `${P}ai69`, T(W(11), "11:00"));
    // The route asks the Head of Department to propose and then to recommend jointly, and the
    // demo's region has one: on the day of the joint recommendation he is away at a commissioning,
    // and his office is delegated to the Section Head for that day (6.1's delegation, judged by faultsIn).
    await delegateForTheDay(db, organisationId, `${P}dg5`, W(10), W(9), T(W(10), "08:00"), entry);
    // The people before the committee on one day, the committee's sitting the next, the rest after it.
    const hours = ["10:00", "11:00", "12:00", "14:00", "15:00"];
    await acts.decideNext(`${P}ai69`, W(11), T(W(11), "15:00"));
    let h = 0;
    while (!(await acts.nextIsCommittee(`${P}ai69`))) await acts.decideNext(`${P}ai69`, W(10), T(W(10), hours[h++]));
    sittings = await loadNameSitting(db, W(9));
    await acts.cite(sx, `${P}ai69`, `${P}d41`, T(W(9), "16:00"));
    h = 0;
    while (!(await acts.decideNext(`${P}ai69`, W(8), T(W(8), hours[h++])))) {
      // each step decided in order until the route completes
    }
    await acts.saveWindow(sx, `${P}win17`, quotationWindow(W(7), W(-5)), T(W(8), "11:00"));
    await acts.feeLines(sx, 17, QUOTATION_FEE_BASIS, T(W(8), "11:10"));
    await acts.publish(sx, T(W(7), "10:00"));
    const letters = await db.invitationLetter.findMany({ where: { window: { exerciseId: sx } }, orderBy: { id: "asc" }, include: { party: true } });
    const byParty = (pid: string) => letters.find((x) => x.partyId === pid)!.id;
    await acts.letterDelivery(sx, byParty(`${P}pty4`), "REGISTERED_POST", "RR 0001 7001 6MY", W(6), W(5), T(W(5), "11:00"));
    await acts.letterDelivery(sx, byParty(`${P}pty5`), "BY_HAND", "", W(6), null, T(W(6), "15:00"));
    await acts.sale(sx, `${P}sale4`, { partyId: `${P}pty4`, receiptNo: "FR/26/004230", collectedBy: "Ahmad bin Demo", paymentMethod: "Bank draft" }, T(W(4), "10:30"));
  }

  // ================================================================ sx18: advertised, addendum, extended
  {
    const sx = `${P}sx18`;
    await prepare(18, W(13), W(12), W(11), { startOn: W(11), closingDay: W(-3) }, works("grade D2, category painting works"), true);
    // 6.15a (FR-ADV-017): sx18's notice offers special permission, so 6.15a's demo can grant one on it.
    await acts.saveWindow(sx, `${P}win18`, { ...quotationWindow(W(10), W(-1)), specialPermissionOffered: true }, T(W(11), "11:00"));
    await acts.feeLines(sx, 18, QUOTATION_FEE_BASIS, T(W(11), "11:10"));
    for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub18_${i + 1}`, c.id, W(10), c.reference(18), T(W(10), `09:0${i}`));
    await acts.publish(sx, T(W(10), "10:00"));
    const cert = (validUntil: string) => ({ certSighted: "ORIGINAL" as const, certValidUntil: validUntil });
    await acts.sale(sx, `${P}sale5`, { party: { id: `${P}pty7`, ...FIRMS.paip }, receiptNo: "FR/26/004201", collectedBy: "Siti Contoh", paymentMethod: "Bank draft", ...cert(W(-120)) }, T(W(9), "10:00"));
    await acts.sale(sx, `${P}sale6`, { party: { id: `${P}pty8`, ...FIRMS.teladan }, receiptNo: "FR/26/004215", collectedBy: "Rajan Demo", paymentMethod: "Cheque", certSighted: "CERTIFIED_COPY", certValidUntil: W(-2) }, T(W(8), "14:00"));
    await acts.draftAddendum(sx, `${P}add1`, "Revised access scaffold drawing", "Drawing DEMO-D-07 is replaced by revision B: the scaffold to the pipe bridge's east span is independent of the bridge. Price the independent scaffold.", T(W(7), "10:00"));
    {
      const did = nextDoc();
      const title = `Signed addendum 1, ${SX(18)}`;
      const when = iso(W(7), "11:00");
      await docs([{
        id: did, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL", createdAt: when,
        versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([title, "Revised access scaffold drawing (demo).", "Signed by the Head of Contract & Procurement on paper."]), mediaType: "application/pdf", filename: "addendum-1-signed.pdf", receivedOn: W(7), storedAt: when }],
        attachments: [{ id: `${did}a1`, purpose: "ADDENDUM_SIGNED", owner: { addendumId: `${P}add1` }, ownerLabel: `${SX(18)} · Addendum (draft), Revised access scaffold drawing`, versionId: `${did}v1`, at: when }],
      }]);
    }
    await acts.issueAddendum(sx, `${P}add1`, T(W(6), "10:00"));
    const copies = await db.addendumRecipient.findMany({ where: { addendumId: `${P}add1` } });
    await acts.copyDelivery(sx, copies.find((c) => c.partyId === `${P}pty7`)!.id, "REGISTERED_POST", "RR 0001 8001 6MY", W(6), W(5), T(W(5), "15:00"));
    await acts.sale(sx, `${P}sale7`, { party: { id: `${P}pty9`, ...FIRMS.rekaan }, receiptNo: "FR/26/004240", collectedBy: "Wong Demo", paymentMethod: "Bank draft", ...cert(W(-200)) }, T(W(5), "11:00"));
    await acts.requestExtension(sx, `${P}cc1`, `${P}ai71`, W(-8), "15:00", W(-6), "Bidders asked for time to price the independent scaffold in addendum 1.", T(W(3), "10:00"));
    await acts.decideChange(sx, `${P}ai71`, W(2), T(W(2), "11:00"));
    const notices = await db.windowNotice.findMany({ where: { closingChangeId: `${P}cc1` } });
    await acts.noticeDelivery(sx, "REGISTERED_POST", "RR 0001 8044 6MY", W(1), null, T(W(1), "10:00"), notices.find((x) => x.partyId === `${P}pty7`)!.id);
    await acts.noticeDelivery(sx, "BY_HAND", "", W(1), W(1), T(W(1), "11:00"), notices.find((x) => x.partyId === `${P}pty9`)!.id);
  }

  await raiseSeries(db, `${P}n5`, 20);
  await flush();
  return { sittings };
}

// ------------------------------------------------------------------ configuration

const TEMPLATES = [
  {
    id: `${P}dt13`, code: "demo_window_notice", nameEn: "Demo notice of invitation (window)", formCode: "DEMO-F-201",
    bodyEn: [
      "{{organisation.name}}",
      "NOTICE OF INVITATION: {{exercise.title}} ({{exercise.reference}}). Advertised on {{window.advertisedOn}}.",
      "Who may bid: firms registered with {{eligibility.registration}}, each registration valid {{eligibility.window}}.",
      "The documents may be inspected at {{window.inspectionPlace}} and bought at {{window.purchasePlace}}, {{window.inspectionHours}}, from {{window.purchaseFrom}} to {{window.purchaseClose}}. Fee: {{window.fee}}, paid by {{window.feePaymentMethods}}.",
      "Tender briefing: {{window.briefing}}. Site visit: {{window.siteVisit}}.",
      "Offers are delivered to {{window.submissionPlace}} by {{window.closing}}.",
      "(Invented demo text: not any organisation's real notice.)",
    ].join("\n\n"),
  },
  {
    id: `${P}dt14`, code: "demo_window_letter", nameEn: "Demo letter of invitation", formCode: "DEMO-F-202",
    bodyEn: [
      "{{organisation.name}}",
      "{{invitee.name}} ({{invitee.registrationNo}})\n{{invitee.address}}",
      "LETTER OF INVITATION: {{exercise.title}} ({{exercise.reference}}), dated {{window.advertisedOn}}.",
      "You are invited to quote. Your registration with {{eligibility.registration}} must be valid {{eligibility.window}}.",
      "The documents may be collected at {{window.purchasePlace}}, {{window.inspectionHours}}, from {{window.purchaseFrom}} to {{window.purchaseClose}}, for {{window.fee}}, paid by {{window.feePaymentMethods}}. Site visit: {{window.siteVisit}}.",
      "Your quotation is delivered to {{window.submissionPlace}} by {{window.closing}}.",
      "(Invented demo text: not any organisation's real letter.)",
    ].join("\n\n"),
  },
  {
    id: `${P}dt15`, code: "demo_window_addendum", nameEn: "Demo addendum", formCode: "DEMO-F-203",
    bodyEn: [
      "{{organisation.name}}",
      "ADDENDUM {{addendum.number}} to {{exercise.reference}}, {{exercise.title}}. Dated {{addendum.issuedOn}}.",
      "{{addendum.title}}",
      "{{addendum.whatChanged}}",
      "Every other part of the documents stands. Offers are delivered to {{window.submissionPlace}} by {{window.closing}}.",
      "(Invented demo text.)",
    ].join("\n\n"),
  },
] as const;

export const CHANNELS = [
  { id: `${P}pch1`, code: "demo_newspaper", nameEn: "Demo Daily (newspaper)", sortOrder: 1, reference: (sx: number) => `Demo Daily, page ${10 + sx}` },
  { id: `${P}pch2`, code: "demo_notice_board", nameEn: "Head office notice board", sortOrder: 2, reference: () => "Head office notice board, ground floor" },
  { id: `${P}pch3`, code: "demo_website", nameEn: "Organisation website", sortOrder: 3, reference: (sx: number) => `https://www.demo.invalid/tenders/${SX(sx).replace(/\//g, "-")}` },
] as const;

const FLOORS = [
  { id: `${P}ff1`, regime: "tender", minimum: "200.00" },
  { id: `${P}ff2`, regime: "quotation", minimum: "40.00" },
] as const;

const POLICY_ID = `${P}wp1`;
const POLICY = {
  minAdvertisementDays: 7, targetAdvertisementDays: 10, newspaperWarnDays: 2, purchaseCutoffDays: 2, dateRulesProvenance: "ASSUMED" as const,
  defaultClosingTime: "15:00", closingTimeProvenance: "ASSUMED" as const,
  advertisementDayRule: "LATEST_REQUIRED_CHANNEL" as const, advertisementChannelId: null, dayRuleProvenance: "ASSUMED" as const,
  calendarId: `${P}hol1`, mandatoryAttendancePermitted: true, attendanceProvenance: "ASSUMED" as const,
  noticeTemplateId: `${P}dt13`, invitationTemplateId: `${P}dt14`, addendumTemplateId: `${P}dt15`,
  dateRuleSource: SOURCE, notes: "Invented demo values, not a recommendation.",
};

/// Configuration is written in the order it depends on itself (templates, then channels and floors, calendars, the policy that names them): one minute apart, so the History reads in that order.
const after = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);

async function loadConfiguration(db: Db, organisationId: string, at: Date, today: string, W: (k: number) => string, entry: Add) {
  await db.documentTemplate.createMany({ data: TEMPLATES.map((t, i) => ({ ...t, organisationId, documentClassId: `${P}dc1`, revisionDate: dayToDate("2026-06-01"), bodyVersion: 1, provenance: "ASSUMED" as const, sortOrder: 13 + i, notes: "Invented demo text." })) });
  for (const t of TEMPLATES) entry("DocumentTemplate", t.id, t.nameEn, "CREATE", at, diffFields(null, { code: t.code, nameEn: t.nameEn, formCode: t.formCode, textVersion: 1, whereItComesFrom: "Assumed" }));

  for (const c of CHANNELS) {
    const row = { id: c.id, organisationId, code: c.code, nameEn: c.nameEn, requiredWhenAdvertised: true, governingSource: SOURCE, provenance: "ASSUMED" as const, sortOrder: c.sortOrder, notes: "Invented demo channel." };
    await db.publicationChannel.create({ data: row });
    entry("PublicationChannel", c.id, `Publication channel · ${c.nameEn}`, "CREATE", after(at, 1), diffFields(null, { name: c.nameEn, nameInMalay: null, required: "Required for every advertised exercise", governingSource: SOURCE, whereItComesFrom: "Assumed", retiredOn: null }));
  }
  for (const f of FLOORS) {
    if (await db.documentFeeFloor.findFirst({ where: { organisationId, regime: f.regime } })) continue;
    await db.documentFeeFloor.create({ data: { ...f, organisationId, governingSource: SOURCE, provenance: "ASSUMED", notes: "Invented demo floor." } });
    entry("DocumentFeeFloor", f.id, `Fee floor · ${REGIME_LABEL[f.regime as Regime]}`, "CREATE", after(at, 1), diffFields(null, { band: REGIME_LABEL[f.regime as Regime], minimumFee: `RM${f.minimum}`, governingSource: SOURCE, whereItComesFrom: "Assumed" }));
  }

  // The calendar: every year the demo's dates touch, maintained in full; the year after, not.
  const cal = { id: `${P}hol1`, code: "demo_state", name: "Demo state calendar" };
  await db.holidayCalendar.create({ data: { ...cal, organisationId, weekendDays: WEEKEND, weekendProvenance: "ASSUMED", governingSource: SOURCE, provenance: "ASSUMED", notes: "Invented demo calendar.", sortOrder: 1 } });
  entry("HolidayCalendar", cal.id, `Holiday calendar · ${cal.name}`, "CREATE", after(at, 2), diffFields(null, { name: cal.name, weekend: "Saturday, Sunday", weekendFrom: "Assumed", governingSource: SOURCE, whereItComesFrom: "Assumed", retiredOn: null }));
  const first = Number(W(30).slice(0, 4));
  const last = Number(W(-30).slice(0, 4));
  let h = 0;
  for (let y = first; y <= last + 1; y++) {
    const complete = y <= last;
    const yid = `${P}holy${y}`;
    await db.holidayCalendarYear.create({ data: { id: yid, organisationId, calendarId: cal.id, year: y, complete, source: complete ? "Demo state gazette (invented)" : "", provenance: "ASSUMED" } });
    entry("HolidayCalendarYear", yid, `Holiday calendar · ${cal.name} · ${y}`, "CREATE", after(at, 3), diffFields(null, { year: y, maintainedInFull: complete ? "Yes" : "No", listFrom: complete ? "Demo state gazette (invented)" : null, whereItComesFrom: "Assumed" }));
    if (!complete) continue;
    for (const [md, name] of HOLIDAYS) {
      const id = `${P}hd${++h}`;
      await db.publicHoliday.create({ data: { id, organisationId, calendarId: cal.id, day: dayToDate(`${y}-${md}`), nameEn: name, gazetteRef: "", provenance: "ASSUMED" } });
      entry("PublicHoliday", id, `Holiday calendar · ${cal.name} · ${name}`, "CREATE", after(at, 3), diffFields(null, { day: formatDate(`${y}-${md}`), name, nameInMalay: null, gazette: null, whereItComesFrom: "Assumed" }));
    }
  }

  // The policy, only where the organisation has none (its own would be the customer's).
  if (!(await db.windowPolicy.findUnique({ where: { organisationId } }))) {
    const channels = await db.publicationChannel.findMany({ where: { organisationId }, select: { id: true, retiredOn: true } });
    const calendars = await db.holidayCalendar.findMany({ where: { organisationId }, select: { id: true, retiredOn: true } });
    const templates = await db.documentTemplate.findMany({ where: { organisationId }, select: { id: true } });
    const fs = policyFaults({ ...POLICY, templateIds: [POLICY.noticeTemplateId, POLICY.invitationTemplateId, POLICY.addendumTemplateId] }, { channels: channels.map((c) => ({ id: c.id, retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null })), calendars: calendars.map((c) => ({ id: c.id, retiredOn: c.retiredOn ? storedDay(c.retiredOn) : null })), templateIds: templates.map((t) => t.id), today });
    if (fs.length) throw new Error(`Demo window policy refused: ${fs.map((f) => f.code).join(", ")}`);
    await db.windowPolicy.create({ data: { id: POLICY_ID, organisationId, ...POLICY } });
    entry("WindowPolicy", POLICY_ID, "Invitation controls · policy", "CREATE", after(at, 4), diffFields(null, {
      minimumDays: 7, targetDays: 10, newspaperMargin: 2, purchaseCutoffDays: 2, dateRulesFrom: "Assumed", defaultClosingTime: "15:00", closingTimeFrom: "Assumed",
      advertisementDay: DAY_RULE_LABEL.LATEST_REQUIRED_CHANNEL, namedChannel: null, dayRuleFrom: "Assumed", holidayCalendar: cal.name, mandatoryAttendance: "Permitted", attendanceFrom: "Assumed",
      noticeTemplate: TEMPLATES[0].nameEn, invitationTemplate: TEMPLATES[1].nameEn, addendumTemplate: TEMPLATES[2].nameEn, sourceCited: SOURCE,
    }));
  }

  // The authority rows the windows route on (the customer's in production; the demo's, invented).
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule42`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.tendering.tender", domain: "tendering_approval", method: "tender", labelEn: "Approval for tendering, tender", approverCode: "HOD_CP", clause: "DEMO 4.1", sortOrder: 42, generateCoreChain: false, coreChainReason: "One office approves the documents for tendering: nothing to generate (demo)." },
      { id: `${P}rule43`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.window_change.tender", domain: WINDOW_CHANGE_DOMAIN, method: "tender", labelEn: "Change to the invitation window, tender", approverCode: "DIV_HEAD", clause: "DEMO 5.3", sortOrder: 43, generateCoreChain: false, coreChainReason: "One office approves a change to the window: nothing to generate (demo)." },
      { id: `${P}rule44`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.window_change.quotation", domain: WINDOW_CHANGE_DOMAIN, method: "quotation", labelEn: "Change to the invitation window, quotation", approverCode: "DIV_HEAD", clause: "DEMO 5.3", sortOrder: 44, generateCoreChain: false, coreChainReason: "One office approves a change to the window: nothing to generate (demo)." },
    ],
  });
  // OD-12: the selective quotation's name is recommended by the Quotation Committee before it is approved.
  await db.authorityRuleStep.create({ data: { id: `${P}st40`, authorityRuleId: `${P}rule30`, roleCode: "QUOTE_CTTE", act: "R", sequence: 3 } });
}

// ------------------------------------------------------------------ requisitions and exercises

const REQUISITIONS = [
  { id: 32, n: 38, title: "Reservoir inlet main and inlet works, Demo Heights", value: "640000.00", justification: "The inlet main has burst twice this year and the inlet structure is cracked.", need: "Renew the inlet main and rebuild the inlet works." },
  { id: 33, n: 39, title: "Valve chamber rebuilding, Zone B", value: "180000.00", justification: "Eleven valve chambers in Zone B have collapsed walls.", need: "Rebuild the chambers so the valves can be operated." },
  { id: 34, n: 40, title: "Pipe bridge repainting, Sungai Demo", value: "150000.00", justification: "The pipe bridge's coating has failed and the steel is corroding.", need: "Blast and repaint the bridge's steelwork." },
] as const;

export const BIG = { key: "demo.requisition.4", label: "Requisition, above RM250,000", clause: "DEMO 3.1(d)", chain: [["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim"], ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair"], ["FD", "Finance Director", "MR", "p2", "Bala Krishnan"], ["CEO", "Chief Executive", "A", "p1", "Aisyah Rahman"]] } as const;
const MID = { key: "demo.requisition.3", label: "Requisition, RM40,000 to RM250,000", clause: "DEMO 3.1(c)", chain: [["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim"], ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair"], ["FD", "Finance Director", "A", "p2", "Bala Krishnan"]] } as const;

/// Three approved requisitions on the northern capital budget, written as 6.1's acts leave them (as 6.11's demo writes its own).
async function loadRequisitions(db: Db, organisationId: string, W: (k: number) => string, T: (d: string, t: string) => Date) {
  const fmt = (s: bigint) => senToDecimalString(s);
  const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: `${P}bcode9` } });
  const original = movements.filter((m) => m.kind === "ORIGINAL").reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
  let balance = original - movements.filter((m) => m.kind === "COMMITMENT" && !m.releasedOn).reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
  const entries: object[] = [];
  for (const [i, r] of REQUISITIONS.entries()) {
    const rule = r.id === 32 ? BIG : MID;
    const raised = W(26 - i);
    const endorsed = W(25 - i);
    const checked = W(24 - i);
    const steps = rule.chain.map((_, s) => W(23 - i - s));
    const approvedOn = steps[steps.length - 1];
    const rq = `${P}rq${r.id}`;
    const value = parseSen(r.value);
    await db.requisition.create({
      data: {
        id: rq, organisationId, reference: REQ(r.n), origin: "PORTAL", erpRequisitionNo: `XR20260003${r.n}`, erpNoteNo: `RN/2026/03${r.n}`, erpRefSource: "MANUAL", erpRefRecordedAt: dayToDate(raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: r.title, justification: r.justification, needStatement: r.need,
        costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: dayToDate(W(-120)),
        estimatedValue: r.value, raisedOn: dayToDate(raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES",
        status: "APPROVED", commitmentMovementId: `${P}bm${r.id + 18}`,
        lines: { create: [{ id: `${rq}l1`, lineNo: 1, description: r.title, estimatedAmount: r.value }] },
      },
    });
    await db.requisitionEndorsement.createMany({
      data: [
        { id: `${P}en${r.id}a`, requisitionId: rq, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: dayToDate(endorsed) },
        { id: `${P}en${r.id}b`, requisitionId: rq, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: dayToDate(endorsed) },
      ],
    });
    await db.requisitionBudgetCheck.create({
      data: { id: `${P}bk${r.id}`, requisitionId: rq, checkedAt: dayToDate(checked), asAt: dayToDate(checked), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode9`, budgetCodeCode: "CAP26-050", requestedAmount: r.value, actualBudget: fmt(original), balanceAsAt: fmt(balance), approvedAccount: fmt(original - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - value), verdict: "WITHIN" },
    });
    balance -= value;
    await db.requisitionSplitCheck.create({ data: { id: `${P}sp${r.id}`, requisitionId: rq, checkedAt: dayToDate(checked), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
    await db.budgetMovement.create({ data: { id: `${P}bm${r.id + 18}`, budgetCodeId: `${P}bcode9`, kind: "COMMITMENT", amount: r.value, occurredOn: dayToDate(approvedOn), reference: REQ(r.n), description: r.title } });
    const route = `${P}ai${r.id + 30}`;
    await db.approvalInstance.create({
      data: {
        id: route, organisationId, matterKind: "REQUISITION", requisitionId: rq, domain: "requisition", value: r.value,
        authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: rule.key, ruleLabel: rule.label, ruleClause: rule.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex",
        budgetCheckId: `${P}bk${r.id}`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp${r.id}`, splitState: "CLEAR",
        checkedAgainstMatrix: true, status: "APPROVED", openedAt: dayToDate(checked), closedAt: T(approvedOn, "16:00"), commitOnApproval: true, routeCommitsBudget: true, createdAt: T(checked, "10:00"),
        steps: {
          create: rule.chain.map(([roleCode, roleLabel, act, pid, name], s) => ({
            id: `${P}rs${r.id}_${s + 1}`, sequence: s + 1, roleCode, roleLabel, act, nonDelegable: act === "MR", sourceRuleKey: rule.key,
            decision: "DONE", decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: dayToDate(steps[s]), recordedAt: T(steps[s], "11:00"),
          })),
        },
      },
    });
    // The trail in the requisition actions' shape (as 6.11's demo writes its own).
    const label = `${REQ(r.n)} · ${r.title}`;
    const rlabel = `${REQ(r.n)} · approval route`;
    let k = 0;
    const e = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", at: Date, changes: object[], reason = "") => entries.push({ id: `${rq}_au${++k}`, organisationId, entity, entityId, entityLabel, action, at, changes, reason, ...DEMO_ACTOR });
    e("Requisition", rq, label, "CREATE", T(raised, "09:00"), diffFields(null, { reference: REQ(r.n), title: r.title, justification: r.justification, needStatement: r.need, requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: dayToDate(W(-120)), estimatedValue: r.value, fundingRouteCode: "capex", contractTypeCode: null, lines: 1, status: "DRAFT" }));
    e("RequisitionEndorsement", `${P}en${r.id}a`, `${REQ(r.n)} · Section endorsement`, "CREATE", T(endorsed, "09:00"), diffFields(null, { tier: "SECTION", unit: "Maintenance Section", person: "Lim Kok Seng", endorsedOn: dayToDate(endorsed), note: "" }));
    e("RequisitionEndorsement", `${P}en${r.id}b`, `${REQ(r.n)} · Department endorsement`, "CREATE", T(endorsed, "10:00"), diffFields(null, { tier: "DEPARTMENT", unit: "Northern Region", person: "Imran Hakim", endorsedOn: dayToDate(endorsed), note: "" }));
    e("Requisition", rq, label, "UPDATE", T(endorsed, "10:00"), diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
    e("RequisitionBudgetCheck", `${P}bk${r.id}`, `${REQ(r.n)} · budget check`, "CREATE", T(checked, "09:30"), diffFields(null, { source: "PORTAL_LEDGER", asAt: dayToDate(checked), budgetCode: "CAP26-050", verdict: "WITHIN", requestedAmount: r.value }));
    e("ApprovalInstance", route, rlabel, "CREATE", T(checked, "10:00"), diffFields(null, { matrix: "Demo limits, issue 1", rule: rule.label, route: rule.chain.map(([, roleLabel, act]) => `${roleLabel} (${ACT_LABEL[act]?.toLowerCase() ?? "acts"})`).join(" → "), overBudget: false, fundingOverrideApplied: false, splitState: "CLEAR" }));
    e("Requisition", rq, label, "UPDATE", T(checked, "10:00"), diffFields({ status: "ENDORSED", sourcingPermitted: null }, { status: "PENDING_APPROVAL", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES" }));
    rule.chain.forEach(([, roleLabel, , , name], s) => e("ApprovalStep", `${P}rs${r.id}_${s + 1}`, `${REQ(r.n)} · ${roleLabel}`, "UPDATE", T(steps[s], "11:00"), diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: dayToDate(steps[s]), recordedOnBehalf: "not signed", underDelegation: null })));
    e("BudgetMovement", `${P}bm${r.id + 18}`, `CAP26-050 · commitment for ${REQ(r.n)}`, "CREATE", T(approvedOn, "16:00"), diffFields(null, { kind: "COMMITMENT", budgetCode: "CAP26-050", reference: REQ(r.n), amount: r.value, occurredOn: dayToDate(approvedOn) }));
    e("ApprovalInstance", route, rlabel, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: "written" }));
    e("Requisition", rq, label, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  }
  await db.auditEntry.createMany({ data: entries as never });
  await raiseSeries(db, `${P}n1`, 41);
}

const EXERCISES: Record<number, { rq: number; title: string; value: string; method: string; methodReason?: string }> = {
  19: { rq: 32, title: "Reservoir inlet main renewal, Demo Heights", value: "640000.00", method: "open_tender" },
  16: { rq: 32, title: "Reservoir inlet main and inlet works, Demo Heights", value: "640000.00", method: "open_tender" },
  17: { rq: 33, title: "Valve chamber rebuilding, Zone B", value: "180000.00", method: "selective_quotation", methodReason: "The chambers sit on live mains: only firms that have worked on the zone's network are invited." },
  18: { rq: 34, title: "Pipe bridge repainting, Sungai Demo", value: "150000.00", method: "open_quotation" },
};

/// The tendering routes the demo opens (X-4: 6.5's routes are demo_ai62 and above).
const TENDERING_ROUTE: Record<number, number> = { 19: 65, 16: 66, 17: 67, 18: 68 };

async function createExercises(db: Db, organisationId: string, ns: number[], createdAt: Date, replaces: string | null = null) {
  for (const n of ns) {
    const x = EXERCISES[n];
    await db.sourcingExercise.create({
      data: { id: `${P}sx${n}`, organisationId, reference: SX(n), requisitionId: `${P}rq${x.rq}`, title: x.title, estimatedValue: x.value, sourcingMethodCode: x.method, methodReason: x.methodReason ?? "", status: "DRAFT", contractBasisCode: "ds", createdAt, replacesExerciseId: replaces },
    });
    await db.exerciseScopePart.create({ data: { id: `${P}sx${n}p1`, exerciseId: `${P}sx${n}`, deliverableKind: "MEASURED_CONSTRUCTION", amount: x.value, description: x.title, sortOrder: 1 } });
  }
}

// ------------------------------------------------------------------ 6.2: the panel and the estimate

/// The panel verified on its signed form and the estimate lodged, as 6.2's acts leave them; each judged by its rule.
export async function scopeReady(db: Db, organisationId: string, tz: string, exerciseId: string, ref: string, sx: number, on: string, T: (d: string, t: string) => Date, nextDoc: () => string, docs: (ds: DemoDoc[]) => Promise<void>, entry: Add, value: string = EXERCISES[sx].value) {
  const repo = await import("../src/lib/scope/repo");
  const { panelFaults, panelState } = await import("../src/lib/scope/panel");
  const { versionFaults } = await import("../src/lib/scope/estimate");
  const fail = (what: string, fs: readonly { code: string; level: string }[]) => {
    const b = fs.filter((f) => f.level === "block");
    if (b.length) throw new Error(`Demo 6.5 ${what} fails its own check: ${b.map((f) => f.code).join(", ")}`);
  };
  const panelId = `${P}spp${sx}`;
  const verifiers = [{ code: "prepared", label: "Prepared by", id: `${P}p11`, name: "Nurul Izzah Kamal" }, { code: "checked", label: "Checked by", id: `${P}p3`, name: "Chen Wei Ling" }, { code: "approved", label: "Approved for issue by", id: `${P}p7`, name: "Gopal Nair" }];
  await db.specificationPanel.create({ data: { id: panelId, organisationId, exerciseId, contractKindOther: "Works on drawings and specification", projectStatusOther: "Renewal of existing works", currentRevisionNo: "A", currentRevisionOn: dayToDate(on), completionPeriodText: "Twenty weeks", bqVersionId: null, status: "DRAFT" } });
  entry(SCOPE_ENTITY.panel, panelId, `${ref} · Specification panel`, "CREATE", T(on, "08:00"), [{ field: "contractKindSpecified", before: null, after: "Works on drawings and specification" }]);
  for (const [i, v] of verifiers.entries()) {
    const id = `${panelId}v${i + 1}`;
    await db.specPanelVerification.create({ data: { id, organisationId, panelId, columnCode: v.code, columnLabelSnapshot: v.label, personId: v.id, verifiedOn: dayToDate(on), recordedAt: T(on, `08:1${i}`) } });
    entry(SCOPE_ENTITY.verification, id, `${ref} · Specification panel · ${v.label}`, "CREATE", T(on, `08:1${i}`), verificationAudit({ column: v.label, personName: v.name, verifiedOn: on, note: "" }));
  }
  const did = nextDoc();
  const title = `Signed specification panel form, ${ref}`;
  const scanAt = T(on, "08:20").toISOString().slice(0, 16);
  await docs([{
    id: did, title, classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: scanAt,
    versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([`Specification panel form (demo, SULIT) — ${ref}`, "Prepared, checked and approved for issue, signed on paper.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: `panel-form-${String(sx).padStart(4, "0")}.pdf`, receivedOn: on, storedAt: scanAt }],
    attachments: [{ id: `${did}a1`, purpose: "SPEC_PANEL_FORM", owner: { specificationPanelId: panelId }, ownerLabel: `${ref} · Specification panel`, versionId: `${did}v1`, at: scanAt }],
  }]);
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { status: true, sourcingMethodCode: true, contractBasisCode: true } });
  const policy = await repo.loadScopePolicy(organisationId);
  const columns = (await repo.loadPanelColumns(organisationId)).filter((c) => c.id.startsWith(P));
  const rules = await repo.loadScopeRules(organisationId, ex);
  const before = await repo.loadPanel(exerciseId);
  fail(`panel ${exerciseId}`, panelFaults({ ...before!, bq: before!.bqVersion }, { columns, policy, today: on, exerciseStatus: ex.status, bqRequired: rules.basis?.requiresBq ?? null }));
  const verifiedAt = T(on, "08:30");
  await db.specificationPanel.update({
    where: { id: panelId },
    data: {
      status: "VERIFIED", verifiedAt,
      verifiedSnapshot: { columns: verifiers.map((v) => ({ code: v.code, label: v.label })), verifications: verifiers.map((v) => ({ column: v.label, person: v.name, verifiedOn: on })), signatoryLimit: policy.panelSignatoryLimit, signatoryLimitProvenance: "ASSUMED", scans: [{ versionId: `${did}v1`, title, versionNo: 1 }], bqVersionNo: null },
    },
  });
  entry(SCOPE_ENTITY.panel, panelId, `${ref} · Specification panel`, "UPDATE", verifiedAt, [{ field: "status", before: "Draft", after: "Verified" }]);
  const after = await repo.loadPanel(exerciseId);
  if (panelState(after!) !== "VERIFIED") throw new Error(`Demo panel ${panelId} reads ${panelState(after!)}.`);

  // The estimate, sealed (ADR 0012): its figure written, never printed, its trail "sealed".
  const estId = `${P}est${sx}`;
  const preparer = { id: `${P}p11`, name: "Nurul Izzah Kamal" };
  const custodian = { id: `${P}p3`, name: "Chen Wei Ling" };
  const prepared = T(on, "08:40");
  fail(`estimate ${estId}`, versionFaults({ value: parseSen(value) - parseSen("7500.00"), personId: preparer.id, reason: "" }, null, { closingAt: null, timeZone: tz, exerciseStatus: ex.status, now: prepared }));
  const lodged = T(on, "08:50");
  await db.companyEstimate.create({ data: { id: estId, organisationId, exerciseId, preparerPersonId: preparer.id, classification: "SULIT", state: "LODGED", currentVersionNo: 1, createdAt: prepared, lodgedAt: lodged, retainedPlace: "Contract & Procurement strong room, cabinet 2" } });
  entry(SCOPE_ENTITY.estimate, estId, `${ref} · Company estimate`, "CREATE", prepared, estimateCreatedAudit({ preparerName: preparer.name, classification: "SULIT" }));
  await db.companyEstimateVersion.create({ data: { id: `${estId}v1`, organisationId, estimateId: estId, versionNo: 1, value: senToDecimalString(parseSen(value) - parseSen("7500.00")), preparedOn: dayToDate(on), preparerPersonId: preparer.id, bqVersionId: null, createdAt: prepared } });
  entry(SCOPE_ENTITY.estimateVersion, `${estId}v1`, `${ref} · Company estimate · version 1`, "CREATE", prepared, estimateVersionAudit({ versionNo: 1, preparerName: preparer.name, preparedOn: on }));
  const events: [string, "PREPARED" | "LODGED" | "RETAINED", Date, { id: string; name: string }, string, number, string][] = [
    [`${estId}e1`, "PREPARED", prepared, preparer, "Preparer", 1, ""],
    [`${estId}e2`, "LODGED", lodged, custodian, "Custodian, Head of Contract & Procurement", 1, ""],
    [`${estId}e3`, "RETAINED", T(on, "08:55"), custodian, "Custodian, Head of Contract & Procurement", 2, "Contract & Procurement strong room, cabinet 2"],
  ];
  entry(SCOPE_ENTITY.estimate, estId, `${ref} · Company estimate`, "UPDATE", lodged, estimateStateAudit("Being prepared", "Lodged"));
  const { estimateEventLabel } = await import("../src/lib/audit/entity-labels");
  for (const [id, kind, when, person, capacity, copyNo, note] of events) {
    await db.estimateEvent.create({ data: { id, organisationId, estimateId: estId, kind, personId: person.id, capacity, note, versionNo: 1, copyNo: kind === "PREPARED" ? null : copyNo, at: when } });
    entry(SCOPE_ENTITY.estimateEvent, id, `${ref} · ${estimateEventLabel(kind)}`, "CREATE", when, estimateEventAudit({ kind, personName: person.name, capacity, versionNo: 1, copyNo: kind === "PREPARED" ? undefined : copyNo, place: kind === "RETAINED" ? note : undefined }));
  }
}

// ------------------------------------------------------------------ the windows' inputs

export type WindowInput = { inspectionPlace: string; purchasePlace: string; inspectionHours: string; purchaseFromDay: string; purchaseCloseDay: string; feeAmount: string; feePaymentMethods: string; submissionPlace: string; closingTimeReason: string; specialPermissionOffered?: boolean | null };
export const tenderWindow = (from: string, to: string): WindowInput => ({
  inspectionPlace: "Contract & Procurement, level 3, 1 Demo Avenue", purchasePlace: "Finance counter, ground floor, 1 Demo Avenue", inspectionHours: "Monday to Friday, 9.00 am to 4.00 pm",
  purchaseFromDay: from, purchaseCloseDay: to, feeAmount: "200.00", feePaymentMethods: "Bank draft or cheque to Demo Utilities Sdn Bhd, or cash at the counter", submissionPlace: "The tender box, ground floor, 1 Demo Avenue", closingTimeReason: "",
});
export const quotationWindow = (from: string, to: string): WindowInput => ({
  inspectionPlace: "Northern Region office, 12 Depot Road", purchasePlace: "Northern Region office, 12 Depot Road", inspectionHours: "Monday to Friday, 9.00 am to 4.00 pm",
  purchaseFromDay: from, purchaseCloseDay: to, feeAmount: "60.00", feePaymentMethods: "Bank draft or cheque to Demo Utilities Sdn Bhd", submissionPlace: "The quotation box, Northern Region office, 12 Depot Road", closingTimeReason: "",
});
export type FeeLineInput = { kind: FeeCostKind; description: string; quantity: string | null; unitCost: string | null; lump: string | null };
export const TENDER_FEE_BASIS: FeeLineInput[] = [
  { kind: "PAPER_A4", description: "Conditions, specification and forms", quantity: "420", unitCost: "0.10", lump: null },
  { kind: "PAPER_A1", description: "Drawings", quantity: "14", unitCost: "4.50", lump: null },
  { kind: "BINDING", description: "Two volumes, drawings folded", quantity: null, unitCost: null, lump: "30.00" },
  { kind: "ADMIN", description: "Issue and register", quantity: null, unitCost: null, lump: "50.00" },
];
export const QUOTATION_FEE_BASIS: FeeLineInput[] = [
  { kind: "PAPER_A4", description: "Conditions, specification and forms", quantity: "150", unitCost: "0.10", lump: null },
  { kind: "PAPER_A3", description: "Drawings", quantity: "6", unitCost: "1.50", lump: null },
  { kind: "ADMIN", description: "Issue and register", quantity: null, unitCost: null, lump: "20.00" },
];

export type Firm = { name: string; registrationNo: string; address: string; phone: string; fax: string; email: string };
export const FIRMS: Record<"contoh" | "sampel" | "paip" | "teladan" | "rekaan", Firm> = {
  contoh: { name: "Contoh Bina Sdn Bhd", registrationNo: "201001000101 (000101-A)", address: "8 Jalan Contoh, 00000 Demo City", phone: "+00 0-000 0101", fax: "", email: "tender@contohbina.invalid" },
  sampel: { name: "Sampel Kejuruteraan Enterprise", registrationNo: "DM0000102-X", address: "21 Lorong Sampel, 00000 Demo North", phone: "+00 0-000 0102", fax: "+00 0-000 0103", email: "" },
  paip: { name: "Demo Paip Services", registrationNo: "201501000104 (000104-D)", address: "3 Jalan Paip, 00000 Demo City", phone: "+00 0-000 0104", fax: "", email: "office@demopaip.invalid" },
  teladan: { name: "Teladan Mekanikal Sdn Bhd", registrationNo: "200801000105 (000105-T)", address: "55 Jalan Teladan, 00000 Demo South", phone: "+00 0-000 0105", fax: "", email: "" },
  rekaan: { name: "Rekaan Maju Construction", registrationNo: "DM0000106-K", address: "7 Jalan Rekaan, 00000 Demo North", phone: "+00 0-000 0106", fax: "", email: "" },
};

export const COMPLETE_APPENDIX = { ladOfficerRoleCode: "HOD_CP", eotOfficerRoleCode: "HOD_CP", terminationOfficerRoleCode: "CEO", warRiskOfficerRoleCode: "CEO", arbitrationOfficerRoleCode: "CEO", pcSumWorksApply: false, tplMinimum: "500000.00", wcMinimum: "250000.00", worksInsuranceUpliftKind: "PERCENT" as const, worksInsuranceUpliftPct: "10", insuranceExcess: "5000.00", ladKind: "PERCENT_OF_SUM_PER_DAY" as const, ladPct: "0.05", sectionalCompletion: false, dlpApplies: true, dlpMonths: 12, firstInterimMinimum: "2500.00", subsequentInterimMinimum: "2500.00", honourCertificateDays: 30 };

// ------------------------------------------------------------------ the delegation for the joint recommendation

/// saveDelegation's write: the whole Head of Department office, from its start to the end day, from its holder to the Section Head; every fault from faultsIn.
async function delegateForTheDay(db: Db, organisationId: string, id: string, from: string, to: string, at: Date, entry: Add) {
  const { faultsIn } = await import("../src/lib/people/delegation");
  const v = {
    fromPersonId: `${P}p9`, toPersonId: `${P}p10`, roleCode: "DEPT_HEAD", capabilityCodes: [] as string[],
    reason: "Away at the reservoir commissioning; the Section Head acts for the day.", reasonMs: "", effectiveFrom: dayToDate(from), effectiveTo: dayToDate(to),
    holderRecommendation: null, holderRecommendedOn: null,
  };
  const existing = await db.delegation.findMany({ where: { organisationId } });
  const held = await db.capability.findMany({ where: { organisationId, roles: { some: { roleCode: v.roleCode } } }, select: { code: true } });
  const spells = await db.roleAssignment.findMany({ where: { personId: v.fromPersonId, roleCode: v.roleCode }, select: { effectiveFrom: true, effectiveTo: true } });
  const mandatory = await db.authorityRule.count({ where: { authorityMatrix: { organisationId }, OR: [{ approverCode: v.roleCode, approverMandatory: true }, { recommenders: { some: { roleCode: v.roleCode, act: { in: ["MR", "MJR", "MA"] } } } }] } });
  const grantor = await db.person.findUniqueOrThrow({ where: { id: v.fromPersonId }, select: { isAvailable: true } });
  const asDelegation = (d: (typeof existing)[number]) => ({ ...d, valueCeiling: d.valueCeiling?.toString() ?? null, reasonMs: d.reasonMs ?? "" });
  const faults = faultsIn({ id, ...v, valueCeiling: null, noSubDelegation: true }, existing.map(asDelegation) as never, held.map((c) => c.code), {
    grantorHoldsOffice: spells.some((s) => s.effectiveFrom <= v.effectiveFrom && (s.effectiveTo == null || s.effectiveTo >= v.effectiveTo)),
    officeHasMandatoryActs: mandatory > 0, grantorUnavailable: !grantor.isAvailable, holderRecommendation: null,
  });
  if (faults.length) throw new Error(`Demo 6.5 delegation refused: ${faults.join(", ")}`);
  await db.delegation.create({ data: { id, organisationId, ...v, provenance: "STATED" } });
  entry("Delegation", id, "Delegation", "CREATE", at, diffFields(null, v), v.reason);
}

// ------------------------------------------------------------------ the selective quotation's committee sitting

/// The Quotation Committee's sitting that recommends sx17's invitee list (X-4: demo_mt12, demo_d41), minuted.
async function loadNameSitting(db: Db, on: string): Promise<string[]> {
  const mt = `${P}mt12`;
  await db.meeting.create({
    data: {
      id: mt, committeeId: `${P}c2`, reference: "DEMO/SQ/1A/2026", meetingDate: dayToDate(on), status: "MINUTED", minutedAt: dayToDate(on),
      agenda: "The firms proposed for invitation to quote: valve chamber rebuilding, Zone B (DEMO/SX/0017/2026).",
      minutes: "The Committee examined the three firms proposed and their registrations, and recommended the list for approval.",
    },
  });
  await db.meetingAttendance.createMany({ data: [{ id: `${P}at50`, meetingId: mt, personId: `${P}p2`, attended: true }, { id: `${P}at51`, meetingId: mt, personId: `${P}p4`, attended: true }, { id: `${P}at52`, meetingId: mt, personId: `${P}p3`, attended: true }] });
  await db.committeeDecision.create({
    data: {
      id: `${P}d41`, meetingId: mt, sequence: 1, domain: NAME_APPROVAL_DOMAIN, matterKind: "EXERCISE", matterRef: SX(17), exerciseId: `${P}sx17`, subject: "Firms proposed for invitation: valve chamber rebuilding, Zone B", act: "R",
      tabledByPersonId: `${P}p3`, tabledAt: dayToDate(on), outcome: "CARRIED", decisionDate: dayToDate(on), quorumRequired: 2, presentVoters: 2, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.vote.createMany({
    data: [
      { id: `${P}v50`, decisionId: `${P}d41`, personId: `${P}p2`, choice: "SETUJU", votedAt: dayToDate(on), recordedAt: dayToDate(on) },
      { id: `${P}v51`, decisionId: `${P}d41`, personId: `${P}p4`, choice: "SETUJU", votedAt: dayToDate(on), recordedAt: dayToDate(on) },
    ],
  });
  return [mt];
}

// ------------------------------------------------------------------ the window's acts, as the actions write them

export class Acts {
  constructor(
    private readonly db: Db,
    private readonly org: string,
    private readonly tz: string,
    private readonly entry: Add,
  ) {}

  private fail(what: string, fs: readonly Finding[]): void {
    const b = fs.filter((f) => f.level === "block");
    if (b.length) throw new Error(`Demo 6.5 ${what} refused: ${b.map((f) => `${f.code} (${windowFindingText(f)})`).join("; ")}`);
  }
  private day = (at: Date) => dayIn(at, this.tz);
  private async state(exerciseId: string) {
    const repo = await import("../src/lib/method/repo");
    const { windowData } = await import("../src/lib/window/repo");
    const l = (await repo.loadExercise(await demoOrgId(), exerciseId))!;
    const d = await windowData(this.org, l.ex);
    return { l, d, label: (what: string) => `${l.ex.reference} · ${what}` };
  }

  /// saveWindow's first save: the path from the method, the notice's items, the fee.
  async saveWindow(exerciseId: string, id: string, v: WindowInput, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) this.fail("saving the window", [ef]);
    const { method } = pathOf(d);
    if (!method) throw new Error(`Demo 6.5 window ${id}: the method gives no path.`);
    const after = { ...v, purchaseFromDay: dayToDate(v.purchaseFromDay), purchaseCloseDay: dayToDate(v.purchaseCloseDay) };
    await this.db.exerciseWindow.create({ data: { id, organisationId: this.org, exerciseId, path: method, ...after, createdAt: at } });
    this.entry(ENTITY.window, id, label("Invitation window"), "CREATE", at, diffFields(null, windowFields({ ...after, path: method })));
  }

  async feeLines(exerciseId: string, sx: number, lines: FeeLineInput[], at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) this.fail("the fee basis", [ef]);
    for (const [i, x] of lines.entries()) {
      const computed = lineAmount({ quantity: x.quantity, unitCost: x.unitCost ? parseSen(x.unitCost) : null, lump: x.lump ? parseSen(x.lump) : null });
      if ("fault" in computed) throw new Error(`Demo 6.5 fee line refused: ${computed.fault}`);
      const id = `${P}wfl${sx}_${i + 1}`;
      const row = { kind: x.kind, description: x.description, quantity: x.quantity, unitCost: x.unitCost, amount: senToDecimalString(computed.amount) };
      await this.db.windowFeeLine.create({ data: { id, organisationId: this.org, windowId: d.window!.id, sortOrder: i, ...row } });
      this.entry(ENTITY.feeLine, id, label("Fee basis"), "CREATE", new Date(at.getTime() + i * 60_000), diffFields(null, feeLineFields(row)));
    }
  }

  async publication(exerciseId: string, id: string, channelId: string, on: string, reference: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const channel = d.channels.find((c) => c.id === channelId) ?? null;
    this.fail("recording a publication", publicationFault({
      status: l.ex.status, path: pathOf(d).path, channel, alreadyRecorded: d.window!.publications.some((p) => p.channelId === channelId), publishedOn: on,
      approvedOn: l.ex.approvedForTenderingAt ? storedDay(l.ex.approvedForTenderingAt) : null, today: this.day(at), personActive: true,
    }));
    await this.db.publicationRecord.create({ data: { id, organisationId: this.org, windowId: d.window!.id, channelId, channelName: channel!.nameEn, publishedOn: dayToDate(on), reference, recordedByPersonId: CLERK, recordedAt: at } });
    this.entry(ENTITY.publication, id, label(`Publication · ${channel!.nameEn}`), "CREATE", at, diffFields(null, { channel: channel!.nameEn, publishedOn: formatDate(on), reference: reference || null, recordedBy: CLERK_NAME, recordedOnBehalf: "not signed" }));
  }

  /**
   * 6.8 (E-2, E-12, flagged): chooseEvaluationModel on the Window card, as the action judges it: the
   * demo's issued model for the exercise's pack (`demo-evaluation.ts`), while unpublished.
   */
  async chooseModel(exerciseId: string, at: Date) {
    const { chooseFaults } = await import("../src/lib/evaluation/pin");
    const { EVALUATION_MODEL_FOR } = await import("./demo-evaluation");
    const { isPublished } = await import("../src/lib/window/phase");
    const { l } = await this.state(exerciseId);
    const modelId = EVALUATION_MODEL_FOR[l.ex.packKindSnapshot === "QUOTATION" ? "QUOTATION" : "TENDER"];
    const m = await this.db.evaluationModel.findUniqueOrThrow({ where: { id: modelId }, select: { id: true, nameEn: true, version: true, status: true } });
    this.fail(`choosing ${l.ex.reference}'s evaluation model`, chooseFaults({ published: isPublished(l.ex.status) || l.ex.evaluationModelPinnedAt != null, cancelled: l.ex.status === "CANCELLED", model: { status: m.status, name: m.nameEn } }) as Finding[]);
    await this.db.sourcingExercise.update({ where: { id: exerciseId }, data: { evaluationModelId: m.id } });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ evaluationModel: null }, { evaluationModel: `${m.nameEn}, version ${m.version}` }));
  }

  /// publishWindow: every rule re-judged on the rows as they stand on the day; warnings said, never refused.
  async publish(exerciseId: string, at: Date) {
    // 6.8 (E-2, flagged): the model is chosen on the Window card before the publication pins it.
    await this.chooseModel(exerciseId, new Date(at.getTime() - 20 * 60_000));
    const { l, d, label } = await this.state(exerciseId);
    const today = this.day(at);
    const j = judgePublish(d, l.ex, { timeZone: this.tz, today });
    this.fail(`publishing ${l.ex.reference}`, j.result.findings);
    const adDay = j.result.advertisementDay!;
    const floor = d.floors.find((f) => f.regime === l.ex.regime) ?? null;
    const snapshot = policySnapshot(d.policy, d.calendar, d.channels, floor ? { regime: floor.regime, minimum: senToDecimalString(floor.minimum), provenance: floor.provenance } : null, {
      path: j.path, advertisementDay: adDay, warnings: j.result.findings.filter((f) => f.level !== "block").map((f) => ({ level: f.level, text: windowFindingText(f) })),
      // 6.6 CR-2: as publishWindow, the method's bid-receipt rules frozen with the window.
      [BID_RULES_KEY]: bidRulesSnapshot(await loadBidMethodRule(this.org, l.ex.sourcingMethodCode, this.db as never)),
    });
    const w = d.window!;
    // 6.8 (E-2, flagged): the chosen model's issued content pinned on the exercise in the publication's act.
    const m = d.evaluation.model!;
    await this.db.sourcingExercise.update({ where: { id: exerciseId }, data: { evaluationModelSnapshot: m.contentSnapshot as object, evaluationModelPinnedAt: at } });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ evaluationModelPinned: null }, { evaluationModelPinned: `${m.nameEn}, version ${m.version}` }));
    if (j.path === "ADVERTISED") {
      const t = d.templates.notice!;
      await this.db.exerciseWindow.update({ where: { id: w.id }, data: { advertisementDay: dayToDate(adDay), publishedAt: at, policySnapshot: snapshot as object, noticeText: j.notice!.text, noticeTemplateCode: t.code, noticeTemplateBodyVersion: t.bodyVersion } });
      this.entry(ENTITY.window, w.id, label("Invitation window"), "UPDATE", at, diffFields({ advertisedOn: null }, { advertisedOn: formatDate(adDay), notice: `${t.nameEn}, text version ${t.bodyVersion}`, rulesRecorded: "yes" }));
      await moveExercise(this.db as never, l.ex, "ADVERTISED", { today, via: "PUBLICATION", publishFaults: 0 });
      this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "ADVERTISED" }));
    } else {
      const t = d.templates.invitation!;
      const route = d.method?.requiresNameApproval ? approvedNameRoute(nameRoutesWithLists(l.ex, d.invitees)) : null;
      for (const [i, letter] of j.letters.entries()) {
        const id = `${w.id}_ltr${i + 1}`;
        await this.db.invitationLetter.create({ data: { id, organisationId: this.org, windowId: w.id, partyId: letter.party.id, nameRouteId: route?.id ?? null, templateId: t.id, templateCode: t.code, templateBodyVersion: t.bodyVersion, language: letter.rendered.language!, fields: letter.rendered.fields as object, renderedText: letter.rendered.text!, frozenAt: at } });
        this.entry(ENTITY.letter, id, label(`Letter of invitation · ${letter.party.name}`), "CREATE", at, diffFields(null, { invitee: letter.party.name, frozenFrom: `${t.nameEn}, text version ${t.bodyVersion}`, language: letter.rendered.language === "MS" ? "Malay" : "English" }));
      }
      await this.db.exerciseWindow.update({ where: { id: w.id }, data: { advertisementDay: dayToDate(adDay), publishedAt: at, policySnapshot: snapshot as object } });
      this.entry(ENTITY.window, w.id, label("Invitation window"), "UPDATE", at, diffFields({ invitedOn: null }, { invitedOn: formatDate(adDay), letters: j.letters.length, rulesRecorded: "yes" }));
      await moveExercise(this.db as never, l.ex, "INVITED", { today, via: "PUBLICATION", publishFaults: 0 });
      this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "INVITED" }));
    }
  }

  async scheduleEvent(exerciseId: string, id: string, kind: SiteEventKind, on: string, time: string, place: string, mandatory: boolean | null, notes: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) this.fail("scheduling an event", [ef]);
    const startsAt = instantAt(on, time, this.tz)!;
    this.fail("scheduling an event", eventFaults({ kind, startsAt, place, mandatory, cancelled: false }, d.policy.mandatoryAttendancePermitted, l.ex.closingAt).filter((f) => f.code === "MANDATORY_NOT_PERMITTED" || f.code === "EVENT_AFTER_CLOSING"));
    const row = await this.db.siteEvent.create({ data: { id, organisationId: this.org, windowId: d.window!.id, kind, startsAt, place, mandatory, notes, createdAt: at } });
    this.entry(ENTITY.event, id, label(kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "CREATE", at, diffFields(null, eventFields(row, this.tz)));
  }

  async markHeld(exerciseId: string, eventId: string, heldOn: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    if (l.ex.status !== "ADVERTISED" && l.ex.status !== "INVITED") throw new Error("Demo 6.5: an event is held only once published.");
    const e = d.window!.events.find((x) => x.id === eventId)!;
    const f = heldFault({ startsAt: e.startsAt, heldOn: e.heldOn ? storedDay(e.heldOn) : null, cancelled: e.cancelledAt != null }, heldOn, this.day(at), this.tz);
    if (f) this.fail("marking an event held", [f]);
    await this.db.siteEvent.update({ where: { id: e.id }, data: { heldOn: dayToDate(heldOn) } });
    this.entry(ENTITY.event, e.id, label(e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", at, diffFields({ heldOn: null }, { heldOn: formatDate(heldOn) }));
  }

  /// The party an act names, found by registration number or made with the act's source (register-actions' partyFor).
  private async partyFor(l: { ex: { id: string; reference: string } }, d: { parties: readonly { id: string; registrationNo: string }[] }, p: { id: string } & Firm, source: PartySource, at: Date) {
    const known = d.parties.find((x) => regKey(x.registrationNo) === regKey(p.registrationNo));
    if (known) return known.id;
    const { id, ...firm } = p;
    const row = { source, ...firm };
    await this.db.exerciseParty.create({ data: { id, organisationId: this.org, exerciseId: l.ex.id, ...row, createdAt: at } });
    this.entry(ENTITY.party, id, `${l.ex.reference} · Contractor ${p.name}`, "CREATE", at, diffFields(null, partyFields(row)));
    return id;
  }

  async attend(exerciseId: string, eventId: string, id: string, party: { id: string } & Firm, representative: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const w = d.window!;
    const e = w.events.find((x) => x.id === eventId)!;
    if (e.cancelledAt || !e.heldOn) throw new Error("Demo 6.5: attendance is recorded on a held event.");
    if (phaseOf(l.ex, w, at, this.tz).phase === "CANCELLED") throw new Error("Demo 6.5: the exercise is cancelled.");
    const known = d.parties.find((p) => regKey(p.registrationNo) === regKey(party.registrationNo)) ?? null;
    if (pathOf(d).path === "INVITED" && (!known || known.source !== "PROPOSED_INVITEE")) this.fail("recording attendance", [{ code: "NOT_INVITED", level: "block" }]);
    const partyId = await this.partyFor(l, d, party, "ATTENDEE", at);
    await this.db.siteEventAttendance.create({ data: { id, organisationId: this.org, eventId, partyId, representative, recordedByPersonId: CLERK, recordedAt: at } });
    this.entry(ENTITY.attendance, id, label(`${e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"} · ${party.name}`), "CREATE", at, diffFields(null, { contractor: party.name, representative, recordedBy: CLERK_NAME, recordedOnBehalf: "not signed" }));
  }

  /// recordSale: the sale day the organisation's day of the act; every check of FR-ADV-009–013 and FR-DOC-009 at sale.
  async sale(
    exerciseId: string,
    id: string,
    s: ({ party: { id: string } & Firm } | { partyId: string }) & { receiptNo: string | null; collectedBy: string; paymentMethod: string; certSighted?: CertSighted; certValidUntil?: string },
    at: Date,
  ) {
    const { l, d, label } = await this.state(exerciseId);
    const w = d.window!;
    const today = this.day(at);
    const phase = phaseOf(l.ex, w, at, this.tz).phase;
    const known = "partyId" in s ? d.parties.find((p) => p.id === s.partyId)! : (d.parties.find((p) => regKey(p.registrationNo) === regKey(s.party.registrationNo)) ?? null);
    const invited = invitedSaleFault(pathOf(d).path, !!known && w.letters.some((x) => x.partyId === known.id));
    if (invited) this.fail("selling the documents", [invited]);
    const taken = s.receiptNo ? !!(await this.db.documentSale.findFirst({ where: { organisationId: this.org, financeReceiptNo: s.receiptNo }, select: { id: true } })) : false;
    const fs: Finding[] = saleFaults({
      phase, soldOn: today, closingDay: closingDay(l.ex.closingAt, this.tz), restricted: l.ex.restrictedTender, certSighted: s.certSighted ?? null, certValidUntil: s.certValidUntil ?? null, authoritySighted: true,
      registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", partyId: known?.id ?? null, alreadySold: !!known && w.sales.some((x) => x.partyId === known.id && !x.voidedAt),
      events: (await import("../src/lib/window/repo")).eventFactsOf(w), mandatoryPermitted: mandatoryPermittedFor(w, d.policy.mandatoryAttendancePermitted).permitted, receiptNo: s.receiptNo, receiptTaken: taken, feeSet: w.feeAmount != null, collectedBy: s.collectedBy, paymentMethod: s.paymentMethod,
    });
    if (s.receiptNo) for (const rf of manualFeeReceipt.check({ number: s.receiptNo, recordedOn: today }, { pattern: null, today, taken: false })) fs.push({ code: rf, level: "block" });
    this.fail(`selling the documents of ${l.ex.reference}`, fs);
    const partyId = "partyId" in s ? s.partyId : await this.partyFor(l, d, s.party, "PURCHASER", at);
    const buyer = "partyId" in s ? known! : { ...s.party };
    const soldOn = dayToDate(today);
    const annotation = saleAnnotation({ exerciseReference: l.ex.reference, purchaser: buyer.name, address: buyer.address, phone: buyer.phone, fax: buyer.fax, closingText: formatOrgDateTime(l.ex.closingAt, this.tz), issuedBy: CLERK_NAME, soldOnText: formatDate(today), receiptNo: s.receiptNo });
    const row = {
      partyId, soldOn, collectedBy: s.collectedBy, authoritySighted: true,
      restrictionCertSighted: l.ex.restrictedTender ? (s.certSighted ?? null) : null, restrictionCertValidUntil: l.ex.restrictedTender && s.certValidUntil ? dayToDate(s.certValidUntil) : null,
      registrationCheck: "NOT_CHECKED" as const, suspensionCheck: "NOT_CHECKED" as const, checkNote: "", amount: w.feeAmount!, paymentMethod: s.paymentMethod,
      financeReceiptNo: s.receiptNo, receiptRecordedOn: s.receiptNo ? soldOn : null, issuedByPersonId: CLERK,
      // The demo's sales are made before the register reads sales (6.15a): no register reading, none named.
      noSupplierNamed: false,
    };
    await this.db.documentSale.create({ data: { id, organisationId: this.org, windowId: w.id, ...row, annotation: annotation as object, createdAt: at } });
    this.entry(ENTITY.sale, id, label(`Sale · ${buyer.name}`), "CREATE", at, diffFields(null, saleFields({ ...row, partyName: buyer.name, issuedBy: CLERK_NAME })));
    for (const a of addendaForNewPurchaser(w.addenda)) {
      if (a.recipients.some((x) => x.partyId === partyId)) continue;
      const cid = `${a.id}_c${id.slice(P.length)}`;
      await this.db.addendumRecipient.create({ data: { id: cid, organisationId: this.org, addendumId: a.id, partyId, withDocuments: true } });
      this.entry(ENTITY.addendumCopy, cid, label(`Addendum ${a.number} · ${buyer.name}`), "CREATE", at, diffFields(null, { recipient: buyer.name, given: "with the documents" }));
    }
  }

  async proposeInvitee(exerciseId: string, id: string, f: Firm, at: Date) {
    const { l, d } = await this.state(exerciseId);
    const fault = inviteeEditFault(l.ex.status);
    if (fault) this.fail("proposing an invitee", [fault]);
    if (pathOf(d).method === "ADVERTISED") this.fail("proposing an invitee", [{ code: "NOT_INVITED_PATH", level: "block" }]);
    if (d.parties.some((p) => regKey(p.registrationNo) === regKey(f.registrationNo))) this.fail("proposing an invitee", [{ code: "DUPLICATE", level: "block" }]);
    const row = { source: "PROPOSED_INVITEE" as const, ...f };
    await this.db.exerciseParty.create({ data: { id, organisationId: this.org, exerciseId, ...row, createdAt: at } });
    this.entry(ENTITY.party, id, `${l.ex.reference} · Invitee ${f.name}`, "CREATE", at, diffFields(null, partyFields(row)));
    // No name route is pending or approved yet: nothing to withdraw (proposeInvitee's withdrawal).
    if (nameRoutesOf(l.ex.approvalInstances).some((r) => r.status === "PENDING" || r.status === "APPROVED")) throw new Error("Demo 6.5: the list changed under a name route.");
  }

  /// requestNameApproval: the route resolved with the requester in mind, the list frozen on it (ADR 0015).
  async requestName(exerciseId: string, routeId: string, at: Date) {
    const repo = await import("../src/lib/method/repo");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { ORGANISATION_CODE } = await import("../src/lib/org");
    const { loadDestinations } = await import("../src/lib/approvals/rejection-store");
    const { db: lib } = await import("../src/lib/db");
    const { l } = await this.state(exerciseId);
    const ex = l.ex;
    const today = this.day(at);
    const { issue, ctx, cfg } = await repo.evaluationContext(l.org, l.req, ex);
    const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
    const rf = nameRequestFault(ex.status, method, nameRoutesOf(ex.approvalInstances), today);
    if (rf) throw new Error(`Demo 6.5 name request refused: ${rf.code}`);
    const pf = nameRequestProposalFault(method!.requiresProposal, ex.proposalState);
    if (pf) throw new Error(`Demo 6.5 name request refused: ${pf.code}`);
    const proposed = await this.db.exerciseParty.findMany({ where: { exerciseId, source: "PROPOSED_INVITEE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true, registrationNo: true } });
    const lf = nameListFault(proposed);
    if (lf) this.fail("asking for the name", [lf]);
    const value = parseSen(ex.estimatedValue.toString());
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE), await loadDelegations(ORGANISATION_CODE)];
    const units = (await this.db.orgUnit.findMany({ where: { organisationId: this.org } })) as unknown as OrgUnit[];
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(today)).reverse().map((u) => u.code);
    const res = nameRouteForRequester(ctx!.funder, method!, Number(senToDecimalString(value)), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, today), l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
    if (res.refusal || res.nameState !== "RESOLVED" || res.warnings.some((w) => w.level === "err")) throw new Error(`Demo 6.5 name route does not resolve: ${res.refusal ?? res.nameState}`);
    const rule = issue!.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    const roleLabel = (code: string) => issue!.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    await this.db.approvalInstance.create({
      data: {
        id: routeId, organisationId: this.org, matterKind: "EXERCISE", exerciseId, domain: NAME_APPROVAL_DOMAIN, value: ex.estimatedValue, authorityMatrixId: issue!.id, matrixLabel: issue!.label,
        ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause, boundaryValue: String(issue!.matrix.policy.boundaryValue), boundaryInclusive: issue!.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, issue!.matrix.policy), fundingRouteCode: l.req.fundingRouteCode, fundingOverrideApplied: false,
        checkedAgainstMatrix: true, warnings: res.warnings as object, status: "PENDING", openedAt: dayToDate(today), createdAt: at,
        ...rejectionSnapshot(await loadDestinations(lib, this.org), NAME_APPROVAL_DOMAIN, dayToDate(today), at),
        ...routeCoreFields(res.core, at),
        steps: { create: res.chain.map((s, i) => ({ id: `${routeId}_s${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    const nameLabel = `${ex.reference} · name approval`;
    this.entry("ApprovalInstance", routeId, nameLabel, "CREATE", at, diffFields(null, { matrix: issue!.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: false, invitees: proposed.length }));
    for (const [i, p] of proposed.entries()) {
      const id = `${routeId}_inv${i + 1}`;
      await this.db.nameRouteInvitee.create({ data: { id, organisationId: this.org, approvalInstanceId: routeId, name: p.name, registrationNo: p.registrationNo, sortOrder: i } });
      this.entry("NameRouteInvitee", id, `${nameLabel} · ${p.name}`, "CREATE", at, diffFields(null, { invitee: p.name, registrationNo: p.registrationNo }));
    }
  }

  /// Whether the route's next pending step is a committee's (cited, never decided by a person).
  async nextIsCommittee(routeId: string): Promise<boolean> {
    const step = await this.db.approvalStep.findFirst({ where: { instanceId: routeId, decision: "PENDING" }, orderBy: { sequence: "asc" }, select: { committeeCode: true } });
    if (!step) throw new Error(`Demo 6.5: ${routeId} has no pending step.`);
    return step.committeeCode != null;
  }

  /**
   * A person's decision on the next pending step of a route (recordNameDecision /
   * recordWindowChangeDecision): someone holding the step's office on the day, not the requester
   * and not a decider of another step, judged by 6.1's deciderFaults. Returns whether the route is
   * now complete (the caller applies what it approves).
   */
  async decideNext(routeId: string, decidedOn: string, at: Date): Promise<boolean> {
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { ORGANISATION_CODE } = await import("../src/lib/org");
    const inst = await this.db.approvalInstance.findUniqueOrThrow({ where: { id: routeId }, include: { steps: { orderBy: { sequence: "asc" } }, exercise: { include: { requisition: true } } } });
    const step = inst.steps.find((s) => s.decision === "PENDING")!;
    if (step.committeeCode) throw new Error(`Demo 6.5: ${routeId}'s next step is a committee's; cite its decision.`);
    const req = inst.exercise!.requisition;
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE), await loadDelegations(ORGANISATION_CODE)];
    const units = (await this.db.orgUnit.findMany({ where: { organisationId: this.org } })) as unknown as OrgUnit[];
    const unitPath = pathTo(units, req.sectionUnitCode || req.requestingUnitCode, dayToDate(decidedOn)).reverse().map((u) => u.code);
    const holders = holdersFor(actingOffice(step)!, unitPath, roster, delegations, decidedOn);
    const others = inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!);
    const today = todayIn(new Date(), this.tz);
    let chosen: { person: { id: string; name: string }; delegationId: string | null } | null = null;
    const tried: string[] = [];
    for (const pid of [...holders.holderIds, ...holders.delegates.map((x) => x.personId)]) {
      const person = await this.db.person.findUnique({ where: { id: pid }, select: { id: true, name: true, isActive: true } });
      const check = deciderFaults(step, {
        today, holders, declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [], person, requesterId: req.requestingPersonId, endorserIds: [], earlier: NO_EARLIER_RECORDERS, otherDeciderIds: others,
        earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"), decidedOn, openedOn: storedDay(inst.openedAt), value: parseSen(inst.exercise!.estimatedValue.toString()),
      });
      if (check.faults.length === 0 && person) {
        chosen = { person: { id: person.id, name: person.name }, delegationId: check.delegationId };
        break;
      }
      tried.push(`${pid}: ${check.faults.join(", ")}`);
    }
    if (!chosen) throw new Error(`Demo 6.5: nobody may decide ${step.roleLabel} on ${routeId} on ${decidedOn} (${tried.join("; ") || "no holder"}).`);
    await this.db.approvalStep.update({ where: { id: step.id }, data: personDecisionWrite({ decision: "DONE", person: chosen.person, decidedOn: dayToDate(decidedOn), delegationId: chosen.delegationId, reason: "", recordedAt: at }) });
    this.entry("ApprovalStep", step.id, `${inst.exercise!.reference} · ${step.roleLabel}`, "UPDATE", at, diffFields({ decision: step.decision }, { decision: "DONE", decidedBy: chosen.person.name, decidedOn: dayToDate(decidedOn), recordedOnBehalf: "not signed", underDelegation: chosen.delegationId ? "yes" : null }));
    const complete = inst.steps.every((s) => s.id === step.id || s.decision === "DONE");
    if (complete) {
      await this.db.approvalInstance.update({ where: { id: routeId }, data: { status: "APPROVED", closedAt: at } });
      this.entry("ApprovalInstance", routeId, `${inst.exercise!.reference} · ${exerciseRouteMatter(inst.domain).auditNoun}`, "UPDATE", at, diffFields({ status: "PENDING" }, { status: "APPROVED" }));
    }
    return complete;
  }

  /// citeNameDecision: the committee step discharged from its carried decision (OD-12), checked by nameCitationFault.
  async cite(exerciseId: string, routeId: string, decisionId: string, at: Date) {
    const { exerciseMatters, matterRecord } = await import("../src/lib/award/repo");
    const { l } = await this.state(exerciseId);
    const inst = nameRoutesOf(l.ex.approvalInstances).find((i) => i.id === routeId && i.status === "PENDING")!;
    const step = inst.steps.find((s) => s.decision === "PENDING")!;
    if (!step.committeeCode) throw new Error("Demo 6.5: the next step is not a committee's.");
    const matter = (await exerciseMatters(exerciseId)).find((m) => m.id === decisionId)!;
    const cited = await this.db.approvalStep.findMany({ where: { committeeDecisionId: matter.id }, select: { id: true } });
    const fault = nameCitationFault({ id: matter.id, exerciseId: matter.exerciseId, matterKind: matter.matterKind, domain: matter.domain, act: matter.act, committeeCode: matter.meeting.committee.code, decidedOn: matter.decisionDate ? storedDay(matter.decisionDate) : null }, step, exerciseId, storedDay(inst.openedAt), cited.length ? [matter.id] : []);
    if (fault) this.fail("citing the committee", [{ code: fault, level: "block" }]);
    const { record, minuted } = matterRecord(matter);
    const s = committeeStepFrom(record);
    if (s.decision !== "DONE") throw new Error("Demo 6.5: the committee's decision is not carried.");
    await this.db.approvalStep.update({ where: { id: step.id }, data: committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: at }) });
    this.entry("ApprovalStep", step.id, `${l.ex.reference} · ${step.roleLabel}`, "UPDATE", at, diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: minuted ? "yes" : "no" }));
  }

  async letterDelivery(exerciseId: string, letterId: string, method: DeliveryMethod, consignmentRef: string, sent: string, ack: string | null, at: Date) {
    const { d, label } = await this.state(exerciseId);
    const letter = d.window!.letters.find((x) => x.id === letterId)!;
    this.fail("recording a letter's delivery", deliveryFaults({ method, despatchedOn: sent, acknowledgedOn: ack }, this.day(at)));
    const after = { method, consignmentRef, despatchedOn: dayToDate(sent), acknowledgedOn: ack ? dayToDate(ack) : null };
    await this.db.invitationLetter.update({ where: { id: letter.id }, data: after });
    this.entry(ENTITY.letter, letter.id, label(`Letter of invitation · ${letter.party.name}`), "UPDATE", at, diffFields(deliveryFields(letter), deliveryFields(after)));
  }

  async draftAddendum(exerciseId: string, id: string, title: string, whatChanged: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const { addendumWindowFault } = await import("../src/lib/window/addendum");
    const wf = addendumWindowFault(phaseOf(l.ex, d.window!, at, this.tz).phase);
    if (wf) this.fail("drafting an addendum", [wf]);
    const a = await this.db.addendum.create({ data: { id, organisationId: this.org, windowId: d.window!.id, title, whatChanged, closingChangeId: null, createdAt: at } });
    this.entry(ENTITY.addendum, id, label(`Addendum (draft), ${title}`), "CREATE", at, diffFields(null, addendumFields(a)));
  }

  /// issueAddendum: numbered one after the last issued, its text frozen, its recipients the register as it stands.
  async issueAddendum(exerciseId: string, id: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const w = d.window!;
    const today = this.day(at);
    const a = w.addenda.find((x) => x.id === id)!;
    const number = nextAddendumNumber(w.addenda);
    const rendered = renderAddendum(d, l.ex, this.tz, { number, title: a.title, whatChanged: a.whatChanged, issuedOn: today });
    const recipients = recipientsFor(w.sales, w.letters.map((x) => ({ partyId: x.partyId })));
    const signedCopies = a.attachments.filter((x) => !x.detachedAt && !x.version.withdrawnAt).length;
    this.fail("issuing an addendum", issueFaults({ status: a.status, phase: phaseOf(l.ex, w, at, this.tz).phase, title: a.title, whatChanged: a.whatChanged, signedCopies, template: { state: rendered.state === "NO_LANGUAGE" ? "NO_TEXT" : rendered.state, missing: rendered.missing, unknown: rendered.unknown, stampMissing: rendered.stampMissing }, recipients: recipients.length, today }));
    const t = d.templates.addendum!;
    await this.db.addendum.update({ where: { id }, data: { status: "ISSUED", number, issuedOn: dayToDate(today), renderedText: rendered.text!, templateCode: t.code, templateBodyVersion: t.bodyVersion, frozenAt: at } });
    this.entry(ENTITY.addendum, id, label(`Addendum ${number}, ${a.title}`), "UPDATE", at, diffFields({ status: "Draft", number: null }, { status: "Issued", number, issuedOn: formatDate(today), frozenFrom: `${t.nameEn}, text version ${t.bodyVersion}`, recipients: recipients.length }));
    for (const [i, partyId] of recipients.entries()) {
      const p = d.parties.find((x) => x.id === partyId)!;
      const cid = `${id}_r${i + 1}`;
      await this.db.addendumRecipient.create({ data: { id: cid, organisationId: this.org, addendumId: id, partyId } });
      this.entry(ENTITY.addendumCopy, cid, label(`Addendum ${number} · ${p.name}`), "CREATE", at, diffFields(null, { recipient: p.name }));
    }
  }

  async copyDelivery(exerciseId: string, copyId: string, method: DeliveryMethod, consignmentRef: string, sent: string, ack: string | null, at: Date) {
    const { d, label } = await this.state(exerciseId);
    const a = d.window!.addenda.find((x) => x.recipients.some((c) => c.id === copyId))!;
    const copy = a.recipients.find((c) => c.id === copyId)!;
    this.fail("recording a copy's delivery", deliveryFaults({ method, despatchedOn: sent, acknowledgedOn: ack, withDocuments: copy.withDocuments }, this.day(at)));
    const after = { method, consignmentRef, despatchedOn: dayToDate(sent), acknowledgedOn: ack ? dayToDate(ack) : null };
    await this.db.addendumRecipient.update({ where: { id: copy.id }, data: after });
    this.entry(ENTITY.addendumCopy, copy.id, label(`Addendum ${a.number} · ${copy.party.name}`), "UPDATE", at, diffFields(deliveryFields(copy), deliveryFields(after)));
  }

  /// openChangeRoute: the window_change route resolved with the requester in mind, and opened with its steps.
  private async openChangeRoute(exerciseId: string, routeId: string, cond: WindowChangeCond, what: string, at: Date) {
    const repo = await import("../src/lib/method/repo");
    const { loadRoster, loadDelegations } = await import("../src/lib/people/load");
    const { ORGANISATION_CODE } = await import("../src/lib/org");
    const { l, label } = await this.state(exerciseId);
    const today = this.day(at);
    const { issue, ctx, cfg } = await repo.evaluationContext(l.org, l.req, l.ex);
    const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode)!;
    const value = parseSen(l.ex.estimatedValue.toString());
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE), await loadDelegations(ORGANISATION_CODE)];
    const units = (await this.db.orgUnit.findMany({ where: { organisationId: this.org } })) as unknown as OrgUnit[];
    const unitPath = pathTo(units, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(today)).reverse().map((u) => u.code);
    const res = windowChangeRouteForRequester(ctx!.funder, method, Number(senToDecimalString(value)), cond, requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, today), l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
    if (res.changeState !== "RESOLVED") throw new Error(`Demo 6.5 change route: ${CHANGE_ROUTE_TEXT[res.changeState]}`);
    if (res.refusal || res.warnings.some((w) => w.level === "err")) throw new Error(`Demo 6.5 change route refused: ${res.refusal ?? "error"}`);
    const rule = issue!.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    const roleLabel = (code: string) => issue!.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    await this.db.approvalInstance.create({
      data: {
        id: routeId, organisationId: this.org, matterKind: "EXERCISE", exerciseId, domain: WINDOW_CHANGE_DOMAIN, cond, value: l.ex.estimatedValue, authorityMatrixId: issue!.id, matrixLabel: issue!.label,
        ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause, boundaryValue: String(issue!.matrix.policy.boundaryValue), boundaryInclusive: issue!.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, issue!.matrix.policy), fundingRouteCode: l.req.fundingRouteCode, fundingOverrideApplied: false,
        checkedAgainstMatrix: true, warnings: res.warnings as object, status: "PENDING", openedAt: dayToDate(today), createdAt: at,
        ...windowChangeRejectionSnapshot(at), ...routeCoreFields(res.core, at),
        steps: { create: res.chain.map((s, i) => ({ id: `${routeId}_s${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    this.entry("ApprovalInstance", routeId, label(exerciseRouteMatter(WINDOW_CHANGE_DOMAIN).auditNoun), "CREATE", at, diffFields(null, { matter: what, matrix: issue!.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: false, ifRefused: "not made; may be asked again" }));
  }

  private rules(l: { org: { timeZone: string | null } }, d: Awaited<ReturnType<Acts["state"]>>["d"], today: string) {
    const w = d.window!;
    return { advertisementDay: w.advertisementDay ? storedDay(w.advertisementDay) : null, closingTimeReason: w.closingTimeReason, timeZone: l.org.timeZone, policy: d.policy, calendar: d.calendar, today };
  }

  async requestExtension(exerciseId: string, id: string, routeId: string, toDay: string, toTime: string, toPurchaseClose: string, reason: string, at: Date) {
    const { l, d, label } = await this.state(exerciseId);
    const w = d.window!;
    const toClosingAt = instantAt(toDay, toTime, this.tz);
    const fs = closingChangeFaults({
      kind: "EXTENSION", status: l.ex.status, now: at, currentClosingAt: l.ex.closingAt, toClosingAt, currentPurchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null, toPurchaseCloseDay: toPurchaseClose,
      reason, changePending: windowChangeRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"), rules: this.rules(l, d, this.day(at)),
    });
    this.fail("asking for an extension", fs);
    await this.openChangeRoute(exerciseId, routeId, "EXTENSION", `Extension of the closing to ${formatOrgDateTime(toClosingAt!, this.tz)}`, at);
    const row = { kind: "EXTENSION" as const, fromClosingAt: l.ex.closingAt!, toClosingAt: toClosingAt!, fromPurchaseCloseDay: w.purchaseCloseDay, toPurchaseCloseDay: dayToDate(toPurchaseClose), reason };
    await this.db.closingChange.create({ data: { id, organisationId: this.org, windowId: w.id, ...row, approvalInstanceId: routeId, requestedOn: dayToDate(this.day(at)), faultsSnapshot: fs.map((f) => ({ level: f.level, text: windowFindingText(f) })) as object, createdAt: at } });
    this.entry(ENTITY.change, id, label("Closing extension"), "CREATE", at, diffFields(null, changeFields(row, this.tz)), reason);
  }

  async requestCancellation(exerciseId: string, id: string, routeId: string, reason: string, feeRefund: boolean, at: Date) {
    const { exerciseCancelBlockedBy } = await import("../src/lib/award/status");
    const { l, d, label } = await this.state(exerciseId);
    const live = exerciseCancelBlockedBy(await this.db.award.findMany({ where: { exerciseId }, select: { reference: true, status: true } }));
    this.fail("asking to cancel", cancelFaults({ status: l.ex.status, reason, feeRefund, changePending: windowChangeRoutesOf(l.ex.approvalInstances).some((i) => i.status === "PENDING"), awardStands: live?.reference ?? null, today: this.day(at) }));
    await this.openChangeRoute(exerciseId, routeId, "CANCELLATION", "Cancellation of the published exercise", at);
    await this.db.windowCancellation.create({ data: { id, organisationId: this.org, windowId: d.window!.id, reason, feeRefund, approvalInstanceId: routeId, requestedOn: dayToDate(this.day(at)), createdAt: at } });
    this.entry(ENTITY.cancellation, id, label("Cancellation"), "CREATE", at, diffFields(null, { reason, feesRefunded: feeRefund ? "Yes" : "No" }), reason);
  }

  /// recordWindowChangeDecision, then the change applied in the same act once the route completes.
  async decideChange(exerciseId: string, routeId: string, decidedOn: string, at: Date) {
    if (!(await this.decideNext(routeId, decidedOn, at))) return;
    const { l, d, label } = await this.state(exerciseId);
    const w = d.window!;
    const change = w.closingChanges.find((c) => c.approvalInstanceId === routeId) ?? null;
    const cancellation = w.cancellations.find((c) => c.approvalInstanceId === routeId) ?? null;
    const today = this.day(at);
    const notices = async (parent: { closingChangeId: string } | { cancellationId: string }, what: string) => {
      const ids = noticeRecipients(w.sales, w.letters.map((x) => ({ partyId: x.partyId })));
      for (const [i, partyId] of ids.entries()) {
        const p = d.parties.find((x) => x.id === partyId)!;
        const nid = `${"closingChangeId" in parent ? parent.closingChangeId : parent.cancellationId}_n${i + 1}`;
        await this.db.windowNotice.create({ data: { id: nid, organisationId: this.org, ...parent, partyId } });
        this.entry(ENTITY.notice, nid, label(`${what} · ${p.name}`), "CREATE", at, diffFields(null, { recipient: p.name, notice: what }));
      }
    };
    if (change) {
      // applyClosingChange: the rules re-run under the window's lock; the closing's second writer (X-2).
      const fs = closingChangeFaults({
        kind: change.kind, status: l.ex.status, now: at, currentClosingAt: l.ex.closingAt, toClosingAt: change.toClosingAt, currentPurchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null,
        toPurchaseCloseDay: change.toPurchaseCloseDay ? storedDay(change.toPurchaseCloseDay) : null, reason: change.reason, changePending: false, rules: this.rules(l, d, today),
      }).filter((f) => f.level === "block" && f.code !== "UNCHANGED");
      this.fail("applying the change", fs);
      await this.db.sourcingExercise.update({ where: { id: exerciseId }, data: { closingAt: change.toClosingAt } });
      if (change.toPurchaseCloseDay) await this.db.exerciseWindow.update({ where: { id: w.id }, data: { purchaseCloseDay: change.toPurchaseCloseDay } });
      await this.db.closingChange.update({ where: { id: change.id }, data: { appliedAt: at } });
      this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ closing: formatOrgDateTime(change.fromClosingAt, this.tz), lastDayOfSale: change.fromPurchaseCloseDay ? formatDate(storedDay(change.fromPurchaseCloseDay)) : null }, { closing: formatOrgDateTime(change.toClosingAt, this.tz), lastDayOfSale: change.toPurchaseCloseDay ? formatDate(storedDay(change.toPurchaseCloseDay)) : null }), change.reason);
      this.entry(ENTITY.change, change.id, label(`Closing ${change.kind === "EXTENSION" ? "extension" : "correction"}`), "UPDATE", at, diffFields({ outcome: null }, { outcome: "Applied" }));
      if (change.kind === "EXTENSION") await notices({ closingChangeId: change.id }, "Closing extended");
      return;
    }
    // applyCancellation: terminal; the live pack voided and the other routes withdrawn; the holders told.
    const c = cancellation!;
    this.fail("cancelling", cancelFaults({ status: l.ex.status, reason: c.reason, feeRefund: c.feeRefund, changePending: false, awardStands: null, today }));
    await moveExercise(this.db as never, l.ex, "CANCELLED", { today, via: "WINDOW_CANCELLATION", reason: c.reason }, { cancelReason: c.reason });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "CANCELLED" }), c.reason);
    await this.db.windowCancellation.update({ where: { id: c.id }, data: { appliedAt: at } });
    this.entry(ENTITY.cancellation, c.id, label("Cancellation"), "UPDATE", at, diffFields({ outcome: null }, { outcome: "Applied", feesRefunded: c.feeRefund ? "Yes" : "No" }));
    const { isLivePack } = await import("../src/lib/tender-docs/pack");
    for (const p of (await this.db.tenderPack.findMany({ where: { exerciseId }, select: { id: true, versionNo: true, status: true } })).filter((x) => isLivePack(x.status as never))) {
      await this.db.tenderPack.update({ where: { id: p.id }, data: { status: "VOID", voidReason: c.reason } });
      this.entry(PACK_ENTITY.pack, p.id, `${l.ex.reference} · Tender documents v${p.versionNo}`, "UPDATE", at, packStatusAudit(p.status as never, "VOID", { voidBecause: c.reason }), c.reason);
    }
    for (const inst of exerciseRoutesOf(l.ex.approvalInstances).filter((i) => i.status === "PENDING" && i.id !== routeId)) {
      const warning = { code: WITHDRAWN_ON_CANCEL, level: "info", messageEn: `Withdrawn: the exercise was cancelled — ${c.reason}` };
      await this.db.approvalInstance.update({ where: { id: inst.id }, data: { status: "RECALLED", closedAt: at, warnings: [...((inst.warnings as object[]) ?? []), warning] as object } });
      this.entry("ApprovalInstance", inst.id, label(exerciseRouteMatter(inst.domain).auditNoun), "UPDATE", at, diffFields({ status: inst.status }, { status: "RECALLED" }), `The exercise was cancelled: ${c.reason}`);
    }
    await notices({ cancellationId: c.id }, "Exercise cancelled");
  }

  /// recordNoticeDelivery: how a holder of the documents was told (recorded, never sent). The first notice where none is named.
  async noticeDelivery(exerciseId: string, method: DeliveryMethod, consignmentRef: string, sent: string, ack: string | null, at: Date, noticeId?: string) {
    const { d, label } = await this.state(exerciseId);
    const w = d.window!;
    const all = [...w.closingChanges.flatMap((c) => c.notices), ...w.cancellations.flatMap((c) => c.notices)];
    const n = noticeId ? all.find((x) => x.id === noticeId)! : all[0];
    this.fail("recording a notice's delivery", deliveryFaults({ method, despatchedOn: sent, acknowledgedOn: ack }, this.day(at)));
    const after = { method, consignmentRef, despatchedOn: dayToDate(sent), acknowledgedOn: ack ? dayToDate(ack) : null };
    await this.db.windowNotice.update({ where: { id: n.id }, data: after });
    this.entry(ENTITY.notice, n.id, label(`Notice · ${n.party.name}`), "UPDATE", at, diffFields(deliveryFields(n), deliveryFields(after)));
  }
}

// ------------------------------------------------------------------ the after-load check (X-10 b, c)

/**
 * Every window read back as the product reads it, now: sx16 closed (its award gate open, the
 * missed briefing refusing a set), sx18 and sx17 open for purchase, sx19 cancelled; each closing
 * the last entry of its history (X-2); sx17's letters on the approved name route with its list;
 * nothing recorded after now (X-10 a).
 */
export async function checkWindowDemo(db: Db) {
  const repo = await import("../src/lib/method/repo");
  const { windowData, eventFactsOf } = await import("../src/lib/window/repo");
  const { windowGate } = await import("../src/lib/window/gate");
  const fail = (what: string) => {
    throw new Error(`Demo 6.5: ${what}`);
  };
  const now = new Date();
  const want: Record<string, string> = { [`${P}sx16`]: "CLOSED", [`${P}sx17`]: "OPEN_FOR_PURCHASE", [`${P}sx18`]: "OPEN_FOR_PURCHASE", [`${P}sx19`]: "CANCELLED" };
  for (const id of WINDOW_EXERCISES) {
    const l = (await repo.loadExercise(await demoOrgId(), id))!;
    const d = await windowData(l.org.id, l.ex);
    const phase = phaseOf(l.ex, d.window, now, l.org.timeZone).phase;
    if (phase !== want[id]) fail(`${l.ex.reference} reads ${phase}, not ${want[id]}.`);
    const history = closingHistory(d.approved?.approvedClosingAt ? { closingAt: d.approved.approvedClosingAt, approvedAt: d.approved.approvedAt } : null, d.window!.closingChanges);
    if (id !== `${P}sx19` && !closingConsistent(history, l.ex.closingAt)) fail(`${l.ex.reference}'s closing is not the last entry of its history (X-2).`);
    if (d.window!.policySnapshot == null || !d.window!.advertisementDay) fail(`${l.ex.reference} was not published with its rules recorded.`);
    if (id === `${P}sx16`) {
      const gate = windowGate(l.ex, d.window, now, l.org.timeZone);
      if (gate.phase !== "CLOSED" || gate.changePending) fail("sx16's award gate is not open.");
      // The contractor who missed the mandatory briefing is refused a set (FR-ADV-013), had the window been open.
      const missed = saleFaults({ phase: "OPEN_FOR_PURCHASE", soldOn: storedDay(d.window!.purchaseFromDay!), closingDay: null, restricted: false, certSighted: null, certValidUntil: null, authoritySighted: true, registrationCheck: "NOT_CHECKED", suspensionCheck: "NOT_CHECKED", partyId: null, alreadySold: false, events: eventFactsOf(d.window!), mandatoryPermitted: mandatoryPermittedFor(d.window, d.policy.mandatoryAttendancePermitted).permitted, receiptNo: "X", receiptTaken: false, feeSet: true, collectedBy: "x", paymentMethod: "x" });
      if (!missed.some((f) => f.code === "ATTENDANCE_REQUIRED")) fail("a contractor absent from sx16's mandatory briefing would not be refused.");
      if (d.window!.sales.filter((s) => !s.financeReceiptNo).length !== 1) fail("sx16 should have one sale awaiting its receipt.");
    }
    if (id === `${P}sx17`) {
      const route = approvedNameRoute(nameRoutesWithLists(l.ex, d.invitees));
      if (!route || route.invitees.length !== 3) fail("sx17's name route is not approved with its list of three.");
      if (d.window!.letters.length !== proposedInvitees(d.parties).length || d.window!.letters.some((x) => x.nameRouteId !== route!.id)) fail("sx17's letters are not on the approved route.");
      const committee = route ? (await db.approvalStep.findMany({ where: { instanceId: route.id, NOT: { committeeCode: null } } })) : [];
      if (committee.length !== 1 || committee[0].committeeDecisionId !== `${P}d41`) fail("sx17's committee step is not discharged by demo_d41.");
    }
    if (id === `${P}sx18`) {
      const a = d.window!.addenda.find((x) => x.number === 1);
      if (!a || a.status !== "ISSUED" || !a.recipients.some((r) => !r.withDocuments && !r.despatchedOn) || !a.recipients.some((r) => r.withDocuments)) fail("sx18's addendum 1 is not issued with one copy outstanding and one given with the documents.");
      if (d.window!.closingChanges.filter((c) => c.appliedAt).length !== 1) fail("sx18's extension is not applied.");
    }
  }
  const sx16 = await db.sourcingExercise.findUniqueOrThrow({ where: { id: `${P}sx16` }, select: { replacesExerciseId: true } });
  if (sx16.replacesExerciseId !== `${P}sx19`) fail("sx16 does not record that it replaces sx19.");
  if (await db.exerciseParty.count({ where: { id: demoRef, NOT: { vendorId: null } } })) fail("a demo party names a vendor (it stays unlinked until 6.15).");
  // C-3: the History reads configuration first. Every entry of the invitation controls precedes every
  // entry of an act that is judged under them (a policy, channel, calendar or floor never follows the
  // publication, sale or letter it governs).
  const CONFIG = ["DocumentTemplate", "WindowPolicy", "PublicationChannel", "HolidayCalendar", "HolidayCalendarYear", "PublicHoliday", "DocumentFeeFloor"];
  const lastConfig = await db.auditEntry.aggregate({ _max: { at: true }, where: { id: { startsWith: `${P}wau` }, entity: { in: CONFIG } } });
  const firstAct = await db.auditEntry.aggregate({ _min: { at: true }, where: { id: { startsWith: `${P}wau` }, entity: { notIn: CONFIG } } });
  if (lastConfig._max.at && firstAct._min.at && lastConfig._max.at >= firstAct._min.at) fail("a configuration entry is not strictly before the first act that depends on it (History order).");
  const policyAt = await db.auditEntry.aggregate({ _min: { at: true }, where: { id: { startsWith: `${P}wau` }, entity: "WindowPolicy" } });
  const named = await db.auditEntry.aggregate({ _max: { at: true }, where: { id: { startsWith: `${P}wau` }, entity: { in: ["DocumentTemplate", "PublicationChannel", "HolidayCalendar"] } } });
  if (policyAt._min.at && named._max.at && policyAt._min.at <= named._max.at) fail("the policy's entry is not strictly after the channels, calendar and templates it names (History order).");
  const late = await db.auditEntry.count({ where: { id: { startsWith: `${P}wau` }, at: { gt: now } } });
  if (late) fail(`${late} trail entries are dated after now (X-10 a).`);
}

