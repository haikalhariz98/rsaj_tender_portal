/**
 * Demo data for the public Results page (product owner's ruling 4, 2026-10-06). Invented throughout; every
 * configured value it leans on is the earlier demos' and ASSUMED, and none is a customer's figure or source.
 *
 * One new open quotation, demo_sx30 "Booster pump house roof renewal, Demo Ridge", taken from its requisition to an
 * issued award, so the Results page has one honest row:
 * - its requisition demo_rq50 (route demo_ai160, the RM40,000 to RM250,000 band) approved, its references drawn from
 *   the requisition and exercise series as a save draws them (never typed);
 * - 6.2's panel and estimate, 6.4's documents (tendering route demo_ai161), and 6.5's window ADVERTISED with its
 *   publications recorded on the demo's three channels, demo_evm2 pinned, three sets sold;
 * - 6.6's three envelopes in time and the box locked; 6.7's opening demo_op30 by the Quotation Opening Committee,
 *   finalised with its scan; 6.8's evaluation demo_evl30 issued, the Kertas Cadangan checked and recommended;
 * - the award opened, its terms saved, sent for approval, its Quotation Committee step decided at a sitting scheduled
 *   for it, the Chief Executive's step decided, the indent recorded, and the award ISSUED, each by the product's own
 *   server action at the demo's instant (prisma/demo-acts.ts), so the issue is the real issue rule's.
 *
 * The earlier modules' acts (6.2 to 6.8) are the demo's own classes, each judged by the product's functions as it is
 * written (X-10 c). Every act is dated on the working days before the load day, after the configuration the earlier
 * demos write (W(17) of the load day at the latest), never after now (X-10 a). demo_aw7 / demo_sx16 are not read
 * or written, and AwardPolicy.publishAwardedValue is left as it stands: the Results page shows the row without its
 * value unless the organisation chooses otherwise.
 *
 * Additive: `npm run demo:results` applies it to a database the demo is already loaded in (never a wipe), and does
 * nothing where the award is already issued. `npm run demo:load` runs it last. `demo:wipe` removes it with the rest:
 * every row is on a demo exercise or carries a demo id.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { dayIn, dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { formatDate } from "../src/lib/format";
import { ACT_LABEL } from "../src/lib/labels";
import { parseSen, senToDecimalString } from "../src/lib/money";

import { act, actRoute, at as onDay, seedActIds } from "./demo-acts";
import type { Add } from "./demo-tender-docs";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";

/// The fixture's own ids: a range no earlier module uses (src/lib/demo/results-fixture.test.ts holds it there).
export const RESULTS_EXERCISE = `${P}sx30`;
const SX_NO = 30;
const RQ = `${P}rq50`;
const REQ_ROUTE = `${P}ai160`;
const TENDERING_ROUTE = `${P}ai161`;
const PACK = `${P}tpk30`;
const WINDOW = `${P}win30`;
const OPENING = `${P}op30`;
const EVALUATION = `${P}evl30`;
const BOX = `${P}box30`;
const MOVEMENT = `${P}bm80`;
/// The sitting the Quotation Committee's step is decided at: typed, as the earlier demo's DEMO/SQ/1A was.
const SITTING_REFERENCE = "DEMO/SQ/1B/2026";

const TITLE = "Booster pump house roof renewal, Demo Ridge";
const VALUE = "96500.00";
const QUOTATION_COMMITTEE = `${P}c2`;

const CLERK = { id: `${P}p4`, name: "Daniel Anak Jelani" };
const HOD_CP = { id: `${P}p3`, name: "Chen Wei Ling" };
const FD = { id: `${P}p2`, name: "Bala Krishnan" };
const CEO = { id: `${P}p1`, name: "Aisyah Rahman" };
const IMPL = { id: `${P}p15`, name: "Mohd Rizal Ahmad" };
const PROC = { id: `${P}p14`, name: "Kumar Selvam" };
const Q_CHAIR = { id: `${P}p15`, name: "Mohd Rizal Ahmad" };
const Q_MEMBER = { id: `${P}p16`, name: "Azlan Shah Demo" };

const MID = { key: "demo.requisition.3", label: "Requisition, RM40,000 to RM250,000", clause: "DEMO 3.1(c)", chain: [["DEPT_HEAD", "Head of Department", "P", "p9", "Imran Hakim"], ["DIV_HEAD", "Head of Division", "R", "p7", "Gopal Nair"], ["FD", "Finance Director", "A", "p2", "Bala Krishnan"]] } as const;

/// The three bidders, in the order their envelopes are opened (bid No. 1 is the one recommended and awarded).
const BIDDERS = [
  { party: `${P}pty30`, firm: "paip", envelope: `${P}env30`, bid: `${P}ob30`, sale: `${P}sale30`, receiptNo: "FR/26/004450", price: "92850.00", months: 4 },
  { party: `${P}pty31`, firm: "contoh", envelope: `${P}env31`, bid: `${P}ob31`, sale: `${P}sale31`, receiptNo: "FR/26/004451", price: "95400.00", months: 5 },
  { party: `${P}pty32`, firm: "rekaan", envelope: `${P}env32`, bid: `${P}ob32`, sale: `${P}sale32`, receiptNo: "FR/26/004452", price: "101200.00", months: 4 },
] as const;
/// The indent number the finance system issues for the award (INT-05), invented in the shape of demo_aw4's.
const INDENT_NO = "XI202600930";

const fail = (what: string): never => {
  throw new Error(`Demo results: ${what}.`);
};

/// Where the fixture stands: not there, there and issued, or there and not issued (refused: never repaired by hand).
export async function resultsDemoState(db: Db): Promise<"ABSENT" | "ISSUED" | "PARTIAL"> {
  const ex = await db.sourcingExercise.findUnique({ where: { id: RESULTS_EXERCISE }, select: { id: true, awards: { select: { status: true } } } });
  const req = await db.requisition.findUnique({ where: { id: RQ }, select: { id: true } });
  if (!ex && !req) return "ABSENT";
  return ex?.awards.some((a) => a.status === "ISSUED" || a.status === "ACCEPTED") ? "ISSUED" : "PARTIAL";
}

export interface ResultsDemoHooks {
  /// demo.ts's determination of draft exercises (bands, snapshot, trail), as a save writes it.
  determine(ids: string[]): Promise<void>;
}

export async function loadResultsDemo(db: Db, organisationId: string, hooks: ResultsDemoHooks) {
  const { calendarOf, CHANNELS, COMPLETE_APPENDIX, FIRMS, QUOTATION_FEE_BASIS, quotationWindow, scopeReady, Acts } = await import("./demo-window");
  const { answer, conditionsFor, confirm, decide, enterAppendix, markAllReady, moveIntoPreparation, startPack, submit } = await import("./demo-tender-docs");
  const { answers, Receipts } = await import("./demo-bids");
  const { OpeningActs } = await import("./demo-opening");
  const { EvaluationActs } = await import("./demo-evaluation");
  const { demoPdf, writeDemoDocs } = await import("./demo-documents");
  const { issueReference } = await import("../src/lib/numbering/issue");

  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  const iso = (x: Date) => x.toISOString().slice(0, 16);

  // Every configuration row the fixture stands on, written by the earlier demos at W(17) of their load day at the latest.
  for (const [what, ok] of [
    ["the demo's issued quotation model", !!(await db.evaluationModel.findFirst({ where: { id: `${P}evm2`, status: "ISSUED" } }))],
    ["the Quotation Opening Committee", !!(await db.committee.findUnique({ where: { id: `${P}c7` } }))],
    ["the Quotation Committee", !!(await db.committee.findUnique({ where: { id: QUOTATION_COMMITTEE } }))],
    ["the award policy", !!(await db.awardPolicy.findUnique({ where: { organisationId } }))],
  ] as const) if (!ok) fail(`${what} is not loaded`);
  // The acts below continue every demo id series after what the database holds (a run on a database loaded earlier).
  await seedActIds(db);
  // A live clause whose "every agreement carries it" is unset refuses every pack's submission. The demo loaded before
  // 2026-10-06 left its own valuation clause demo_cl2 so (demo-lifecycle.ts now sets it): decided here, once, through
  // Configuration's own act at the real instant, ASSUMED, with its reason. Any other unset clause is the organisation's: refused.
  const unset = await db.clauseText.findMany({ where: { organisationId, mandatoryInAgreements: null, retiredOn: null } });
  if (unset.some((c) => c.id !== `${P}cl2`)) fail(`a clause that is not the demo's has "every agreement carries it" unset (${unset.map((c) => c.titleEn).join(", ")}): set it under Configuration first`);
  const cl2 = unset.find((c) => c.id === `${P}cl2`);
  if (cl2) {
    const { saveClause } = await import("../src/app/configuration/tender-documents/conditions-actions");
    const nowKl = new Date(Date.now() + 8 * 3_600_000 - 60_000).toISOString().slice(0, 16);
    await act(nowKl, "the demo's valuation clause decided", saveClause, {
      id: cl2.id, code: cl2.code, titleEn: cl2.titleEn, titleMs: cl2.titleMs, bodyEn: cl2.bodyEn, bodyMs: cl2.bodyMs, mandatoryInAgreements: "no", sortOrder: String(cl2.sortOrder),
      governingSource: cl2.governingSource, provenance: "ASSUMED", notes: "Invented for the demo: not every agreement need carry it.",
      reason: "The demo loaded this clause with whether every agreement carries it unset, which refuses every pack's submission. Set to No (invented, ASSUMED) so the Results demo's quotation can be submitted (product owner's ruling 4, 2026-10-06).",
    });
  }

  const trail: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}rsau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  let doc = 200;
  const nextDoc = () => `${P}doc${doc++}`;
  const docs = async (ds: Parameters<typeof writeDemoDocs>[2]) => {
    if (!ds.length) return;
    const e = await writeDemoDocs(db, organisationId, ds, `${P}rsdoc${ds[0].id.slice(P.length)}au`, HOD_CP);
    await e.flush();
  };

  // ---- the requisition, approved on the RM40,000 to RM250,000 band
  const raised = W(16);
  const decidedOn = MID.chain.map(() => W(15));
  const approvedOn = W(15);
  const reqRef = await db.$transaction((tx) => issueReference(tx as never, organisationId, "requisition", dayToDate(raised)));
  {
    const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: `${P}bcode9` } });
    const original = movements.filter((m) => m.kind === "ORIGINAL").reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    const balance = original - movements.filter((m) => m.kind === "COMMITMENT" && !m.releasedOn).reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    if (balance < parseSen(VALUE)) fail("the budget code has no room for the requisition");
    const fmt = (x: bigint) => senToDecimalString(x);
    await db.requisition.create({
      data: {
        id: RQ, organisationId, reference: reqRef, origin: "PORTAL", erpRequisitionNo: "XR2026000361", erpNoteNo: "RN/2026/0361", erpRefSource: "MANUAL", erpRefRecordedAt: dayToDate(raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title: TITLE, justification: "The pump house roof sheets have corroded through over the switchgear bay and rain reaches the panels.", needStatement: "Renew the roof sheets, purlins and gutters of the booster pump house.",
        costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Demo Ridge booster station", dateRequired: dayToDate(W(-60)),
        estimatedValue: VALUE, raisedOn: dayToDate(raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES", status: "APPROVED", commitmentMovementId: MOVEMENT,
        lines: { create: [{ id: `${RQ}l1`, lineNo: 1, description: TITLE, estimatedAmount: VALUE }] },
      },
    });
    await db.requisitionEndorsement.createMany({ data: [{ id: `${P}en50a`, requisitionId: RQ, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: dayToDate(raised) }, { id: `${P}en50b`, requisitionId: RQ, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: dayToDate(raised) }] });
    await db.requisitionBudgetCheck.create({ data: { id: `${P}bk50`, requisitionId: RQ, checkedAt: dayToDate(raised), asAt: dayToDate(raised), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode9`, budgetCodeCode: "CAP26-050", requestedAmount: VALUE, actualBudget: fmt(original), balanceAsAt: fmt(balance), approvedAccount: fmt(original - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - parseSen(VALUE)), verdict: "WITHIN" } });
    await db.requisitionSplitCheck.create({ data: { id: `${P}sp50`, requisitionId: RQ, checkedAt: dayToDate(raised), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
    await db.budgetMovement.create({ data: { id: MOVEMENT, budgetCodeId: `${P}bcode9`, kind: "COMMITMENT", amount: VALUE, occurredOn: dayToDate(approvedOn), reference: reqRef, description: TITLE } });
    const hours = ["10:00", "11:00", "14:00"];
    await db.approvalInstance.create({
      data: {
        id: REQ_ROUTE, organisationId, matterKind: "REQUISITION", requisitionId: RQ, domain: "requisition", value: VALUE, authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: MID.key, ruleLabel: MID.label, ruleClause: MID.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex", budgetCheckId: `${P}bk50`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp50`, splitState: "CLEAR",
        checkedAgainstMatrix: true, status: "APPROVED", openedAt: dayToDate(raised), closedAt: T(approvedOn, "16:00"), commitOnApproval: true, routeCommitsBudget: true, createdAt: T(raised, "11:00"),
        steps: { create: MID.chain.map(([roleCode, roleLabel, a, pid, name], i) => ({ id: `${P}rs50_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act: a, nonDelegable: false, sourceRuleKey: MID.key, decision: "DONE" as const, decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: dayToDate(decidedOn[i]), recordedAt: T(decidedOn[i], hours[i]) })) },
      },
    });
    const label = `${reqRef} · ${TITLE}`;
    entry("Requisition", RQ, label, "CREATE", T(raised, "09:00"), diffFields(null, { reference: reqRef, title: TITLE, requestingUnitCode: "NTH", estimatedValue: VALUE, status: "DRAFT" }));
    entry("Requisition", RQ, label, "UPDATE", T(raised, "10:00"), diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
    entry("ApprovalInstance", REQ_ROUTE, `${reqRef} · approval route`, "CREATE", T(raised, "11:00"), diffFields(null, { matrix: "Demo limits, issue 1", rule: MID.label, route: MID.chain.map(([, roleLabel, a]) => `${roleLabel} (${ACT_LABEL[a]?.toLowerCase() ?? "acts"})`).join(" → ") }));
    MID.chain.forEach(([, roleLabel, , , name], i) => entry("ApprovalStep", `${P}rs50_${i + 1}`, `${reqRef} · ${roleLabel}`, "UPDATE", T(decidedOn[i], hours[i]), diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: dayToDate(decidedOn[i]), recordedOnBehalf: "not signed" })));
    entry("Requisition", RQ, label, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
  }

  // ---- the exercise, then 6.2 and 6.4 by their own acts
  const sx = RESULTS_EXERCISE;
  const created = T(W(15), "16:30");
  const ref = await db.$transaction((tx) => issueReference(tx as never, organisationId, "exercise", dayToDate(W(15))));
  await db.sourcingExercise.create({ data: { id: sx, organisationId, reference: ref, requisitionId: RQ, title: TITLE, estimatedValue: VALUE, sourcingMethodCode: "open_quotation", methodReason: "", status: "DRAFT", contractBasisCode: "ds", createdAt: created } });
  await db.exerciseScopePart.create({ data: { id: `${sx}p1`, exerciseId: sx, deliverableKind: "MEASURED_CONSTRUCTION", amount: VALUE, description: TITLE, sortOrder: 1 } });
  await hooks.determine([sx]);
  const scopeOn = W(14);
  await scopeReady(db, organisationId, tz, sx, ref, SX_NO, scopeOn, T, nextDoc, docs as never, entry, VALUE);
  await moveIntoPreparation(db, organisationId, sx, scopeOn, { report: "works" }, entry);
  const packOn = W(13);
  await startPack(db, organisationId, { id: PACK, exerciseId: sx, versionNo: 1, at: T(packOn, "08:30") }, entry);
  const parts = await db.tenderPackPart.findMany({ where: { packId: PACK, source: "UPLOAD" }, orderBy: { sortOrder: "asc" } });
  await docs(parts.map((p, i) => {
    const did = nextDoc();
    const t = `${p.labelSnapshot}, ${ref}`;
    const when = iso(T(packOn, `08:${String(40 + i).padStart(2, "0")}`));
    return { id: did, title: t, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: when, versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([t, "Quotation document part (demo)."]), mediaType: "application/pdf", filename: `${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: packOn, storedAt: when }], attachments: [{ id: `${did}a1`, purpose: "TENDER_PART" as const, owner: { tenderPackPartId: p.id }, ownerLabel: `${ref} · Tender pack v1 · part ${p.printedNumber}, ${p.labelSnapshot}`, versionId: `${did}v1`, at: when }] };
  }));
  await enterAppendix(db, organisationId, PACK, ref, COMPLETE_APPENDIX, T(packOn, "09:00"), entry);
  await conditionsFor(db, organisationId, sx, ref, [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D2, category roofing works", group: 2 }], T(packOn, "09:10"), entry);
  await answer(db, organisationId, sx, ref, { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_1" }, T(packOn, "09:20"), entry);
  await confirm(db, organisationId, PACK, ref, "NO_AMBIGUITY", CLERK.id, packOn, T(packOn, "09:30"), entry, L);
  await confirm(db, organisationId, PACK, ref, "DRAWINGS_COORDINATED", `${P}p10`, packOn, T(packOn, "09:35"), entry, L);
  await markAllReady(db, organisationId, PACK, ref, T(packOn, "10:00"), entry);
  const advertised = W(12);
  const closingDay = W(4);
  const dates = { startOn: advertised, closingDay };
  await submit(db, organisationId, { packId: PACK, routeId: TENDERING_ROUTE, at: T(packOn, "11:00"), startOn: dates.startOn, closingDay: dates.closingDay, closingTime: "15:00" }, entry);
  await decide(db, organisationId, { packId: PACK, decision: "DONE", personId: HOD_CP.id, decidedOn: advertised, at: T(advertised, "09:00"), reason: "", dates: { ...dates, closingTime: "15:00" } }, entry);

  // ---- 6.5: the window ADVERTISED, its publications recorded on each required channel, three sets sold
  const acts = new Acts(db, organisationId, tz, entry);
  await acts.saveWindow(sx, WINDOW, quotationWindow(advertised, W(7)), T(advertised, "09:30"));
  await acts.feeLines(sx, SX_NO, QUOTATION_FEE_BASIS, T(advertised, "09:40"));
  await answers(db, organisationId, entry, sx, ref, { days: 90, provenance: "ASSUMED", alternativesPermitted: false, reason: "" }, T(advertised, "09:45"));
  const channelRef: Record<string, string> = { [`${P}pch1`]: "Demo Daily, page 14", [`${P}pch2`]: "Head office notice board, ground floor", [`${P}pch3`]: `https://www.demo.invalid/tenders/${ref.replace(/\//g, "-")}` };
  for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub30_${i + 1}`, c.id, advertised, channelRef[c.id] ?? fail(`no reference for channel ${c.id}`), T(advertised, `10:0${i}`));
  await acts.publish(sx, T(advertised, "11:00"));
  for (const [i, b] of BIDDERS.entries()) await acts.sale(sx, b.sale, { party: { id: b.party, ...FIRMS[b.firm] }, receiptNo: b.receiptNo, collectedBy: "Demo representative", paymentMethod: "Bank draft" }, T(W(11 - i), "10:00"));

  // ---- 6.6: three envelopes in time, the box locked at the closing
  const { loadExercise } = await import("../src/lib/method/repo");
  const close = (await loadExercise(sx))?.ex.closingAt ?? fail(`${ref} has no closing`);
  if (dayIn(close, tz) !== closingDay) fail(`${ref} does not close on its closing day`);
  const marks = `Quotation ${ref}, booster pump house roof, closing ${formatDate(closingDay)} 3.00 pm`;
  const r = new Receipts(db, organisationId, tz, entry, sx, ref);
  for (const [i, b] of BIDDERS.entries()) await r.receive(b.envelope, { kind: "BID", channel: "COUNTER", markings: marks, by: CLERK, at: T(W(6 - i), "10:30") });
  await r.lock(BOX, HOD_CP, new Date(close.getTime() + 4 * 60_000), "Locked at the closing by the Head of Contract & Procurement.");

  // ---- 6.7: the opening by the Quotation Opening Committee, the same afternoon, finalised with its scan
  const op = new OpeningActs(db, organisationId, tz, entry);
  const sec = (x: Date, s: number) => new Date(x.getTime() + s * 1000);
  await op.start(sx, OPENING, { panel: [Q_CHAIR, Q_MEMBER], by: Q_CHAIR, at: T(closingDay, "15:10") });
  await op.authorise(sx, OPENING, Q_CHAIR, T(closingDay, "15:11"));
  await op.authorise(sx, OPENING, Q_MEMBER, sec(T(closingDay, "15:11"), 30));
  for (const [i, b] of BIDDERS.entries()) {
    const x = T(closingDay, `15:${String(13 + i * 4).padStart(2, "0")}`);
    await op.open(sx, OPENING, { id: b.bid, envelopeId: b.envelope, bidder: { partyId: b.party }, price: b.price, months: b.months, validityDays: 90, cls: "Grade D2", status: "Active", at: x });
    await op.initial(sx, b.bid, Q_CHAIR, sec(x, 60));
    await op.initial(sx, b.bid, Q_MEMBER, sec(x, 75));
    await op.answers(sx, b.bid, [], sec(x, 120));
    await op.verdict(sx, b.bid, "PASS", "", Q_CHAIR, sec(x, 150));
  }
  await op.signature(sx, OPENING, Q_CHAIR, closingDay, T(closingDay, "15:35"));
  await op.signature(sx, OPENING, Q_MEMBER, closingDay, sec(T(closingDay, "15:35"), 30));
  await op.details(sx, OPENING, 1, "The box was opened at 3.11 pm on the panel's two authorisations. Three quotations in time were opened, each complete, and read aloud. The estimate's paper copy was not in the box.", T(closingDay, "15:37"));
  await op.finalise(sx, OPENING, Q_CHAIR, { notInBox: true }, T(closingDay, "15:40"));
  await op.scan(sx, OPENING, nextDoc(), "Signed schedule of quotations", T(closingDay, "15:50"));
  await op.explain(sx, OPENING, HOD_CP, "The estimate's copy was kept by the Head of Contract & Procurement when it was lodged, not placed in the box. Invented for the demo.", T(closingDay, "15:55"));

  // ---- 6.8: evaluated on demo_evm2, the report issued, the Kertas Cadangan checked and recommended
  const ev = new EvaluationActs(db, organisationId, tz, entry);
  const e1 = W(3);
  const e2 = W(2);
  await ev.start(sx, EVALUATION, { by: PROC, appointedOn: e1, at: T(e1, "09:00") });
  const tech: [number, string, string][] = [[1, "17", "25"], [2, "15", "22"], [3, "13", "19"]];
  for (const [k, [bid, method, experience]] of tech.entries()) {
    await ev.score(sx, bid, "technical", "method", { marks: method }, IMPL, T(e1, `10:${String(k * 10).padStart(2, "0")}`));
    await ev.score(sx, bid, "technical", "experience", { marks: experience }, IMPL, T(e1, `10:${String(k * 10 + 5).padStart(2, "0")}`));
  }
  await ev.submit(sx, "technical", IMPL, T(e1, "15:00"));
  await ev.shortlist(sx, "shortlist", [1, 2], PROC, T(e2, "09:00"));
  await ev.inputs(sx, 1, { factor: "contractor_materials", balances: ["14200.00", "13800.00", "15100.00"] }, PROC, T(e2, "10:00"));
  await ev.inputs(sx, 2, { factor: "employer_materials", balances: ["9800.00", "10400.00", "9900.00"] }, PROC, T(e2, "10:10"));
  await ev.submit(sx, "financial", PROC, T(e2, "11:00"));
  await ev.submit(sx, "price", PROC, T(e2, "11:30"));
  const verdicts: [number, string[]][] = [
    [1, ["Every item on the checklist was found with the quotation at the opening.", "About 4% above the company estimate: a reasonable price for the scope.", "Four months, within what the documents ask.", "Two similar roof renewals completed for another authority in the last two years."]],
    [2, ["Every item on the checklist was found with the quotation at the opening.", "About 7% above the company estimate.", "Five months: one longer than the first.", "Capable, with a smaller roofing crew than the first."]],
  ];
  let k = 0;
  for (const [bid, narratives] of verdicts) {
    for (const [i, code] of ["demo_completeness", "demo_price", "demo_period", "demo_capability"].entries()) await ev.aspect(sx, bid, code, "SATISFACTORY", narratives[i], IMPL, T(e2, `14:${String(k++ * 2).padStart(2, "0")}`));
  }
  await ev.submit(sx, "aspects", IMPL, T(e2, "15:00"));
  await ev.recommend(sx, 1, PROC, T(e2, "15:30"));
  await ev.issue(sx, PROC, T(e2, "16:00"));
  await ev.paper(sx, PROC, T(e2, "16:15"));
  await ev.sign(sx, "CHECKER", HOD_CP, T(e2, "16:30"));
  await ev.sign(sx, "RECOMMENDER", FD, T(e2, "16:45"));
  await ev.attach(sx, { evaluationId: EVALUATION }, nextDoc(), "SIGNED_REPORT", "Signed evaluation report", T(e2, "17:00"));
  await ev.attach(sx, { evaluationId: EVALUATION }, nextDoc(), "SIGNED_PROPOSAL_PAPER", "Signed Kertas Cadangan", T(e2, "17:05"));

  if (trail.some((x) => x.at > new Date())) fail("an act is dated after now (X-10 a)");
  await db.auditEntry.createMany({ data: trail as never });

  // ---- the award, by the product's own server actions at the demo's instant
  const A = await import("../src/app/awards/actions");
  const C = await import("../src/app/committees/actions");
  const { POST: vote } = await import("../src/app/api/committees/decisions/[id]/votes/route");
  const d = W(1);
  const winner = BIDDERS[0];
  const firm = FIRMS[winner.firm];
  await act(`${d}T09:00`, "award opened", A.createAward, {
    exerciseId: sx, awardeePartyId: winner.party, awardeeName: firm.name, awardeeRegistrationNo: firm.registrationNo, awardeeAddress: firm.address,
    awardedValue: winner.price, completionPeriod: String(winner.months), completionUnit: "MONTHS", startDate: W(-3),
  });
  const award = await db.award.findFirst({ where: { exerciseId: sx }, select: { id: true } }) ?? fail("the award was not opened");
  await act(`${d}T09:15`, "award terms", A.updateAwardTerms, {
    id: award.id, bondRequired: "yes", bondBasis: "CONTRACT_PRICE", bondPercent: "5", bondValidityExtraMonths: "12", bondBasisProvenance: "ASSUMED",
    retentionPercent: "5", retentionCapPercent: "5", termsProvenance: "ASSUMED", wcBasis: "PERCENT_OF_CONTRACT",
  });
  await act(`${d}T09:30`, "award sent for approval", A.submitAward, { id: award.id });
  const route = await db.approvalInstance.findFirst({ where: { awardId: award.id, status: "PENDING" }, include: { steps: { orderBy: { sequence: "asc" } } } }) ?? fail("no appointment route was opened");
  const committeeStep = route.steps.find((s) => s.committeeCode === "QUOTE_CTTE") ?? fail("the route has no Quotation Committee step");
  await act(`${d}T10:00`, "Quotation Committee sitting scheduled", C.scheduleSitting, { committeeId: QUOTATION_COMMITTEE, meetingDate: d, agenda: `Appointment on ${ref}.`, reference: SITTING_REFERENCE, items: [committeeStep.id], tabledByPersonId: HOD_CP.id });
  const sitting = await db.meeting.findFirst({ where: { committeeId: QUOTATION_COMMITTEE, reference: SITTING_REFERENCE }, include: { decisions: true } }) ?? fail("the sitting was not scheduled");
  const matter = sitting.decisions.find((x) => x.exerciseId === sx) ?? fail("the appointment was not tabled");
  await act(`${d}T14:00`, "sitting opened", C.changeStatus, { meetingId: sitting.id, to: "IN_PROGRESS" });
  for (const p of [FD, CLERK]) await act(`${d}T14:05`, `attendance ${p.name}`, C.recordAttendance, { meetingId: sitting.id, personId: p.id, attended: "yes" });
  for (const p of [FD, CLERK]) await actRoute(`${d}T14:30`, `vote ${p.name}`, () => vote(new Request("http://demo/api", { method: "POST", body: JSON.stringify({ personId: p.id, choice: "SETUJU", votedAt: d }) }), { params: Promise.resolve({ id: matter.id }) } as never));
  await act(`${d}T14:45`, "outcome", C.recordOutcome, { decisionId: matter.id, outcome: "CARRIED", outcomeNote: "" });
  await act(`${d}T15:00`, "minutes", C.saveMinutes, { meetingId: sitting.id, minutes: `The Committee recommended the appointment on ${ref} (demo).` });
  await act(`${d}T15:10`, "sitting minuted", C.changeStatus, { meetingId: sitting.id, to: "MINUTED" });
  const cited = await db.approvalStep.findUniqueOrThrow({ where: { id: committeeStep.id }, select: { decision: true } });
  if (cited.decision === "PENDING") await act(`${d}T15:20`, "committee decision cited", A.citeAppointmentDecision, { id: award.id, stepId: committeeStep.id, committeeDecisionId: matter.id });
  for (const s of route.steps.filter((x) => !x.committeeCode)) {
    if (s.roleCode !== "CEO") fail(`the route asks ${s.roleLabel}, which the fixture does not decide`);
    await act(`${d}T16:00`, `appointment approved by ${s.roleLabel}`, A.decideAppointmentStep, { id: award.id, stepId: s.id, decision: "DONE", personId: CEO.id, decidedOn: d, receivedOn: d, reason: "" });
  }
  await act(`${d}T16:30`, "indent recorded", A.recordCommitment, { id: award.id, erpCommitmentNo: INDENT_NO, erpCommitmentKind: "INDENT", receivedOn: d });

  // The signatory the issue resolves, and the person holding that office on the day (as the drawer offers them).
  const { awardFacts, loadAward } = await import("../src/lib/award/repo");
  const { evaluateAward } = await import("../src/lib/award/evaluate");
  const { holdersFor } = await import("../src/lib/requisition/holders");
  const signer = await onDay(`${d}T16:50`, async () => {
    const f = await awardFacts((await loadAward(award.id)) ?? fail("the award did not load"));
    const pre = evaluateAward(f.facts);
    if (pre.issueFaults.length) fail(`the award would not issue (${pre.issueFaults.map((x) => x.code).join(", ")})`);
    const sig = pre.signatory;
    if (!sig?.ok) fail("the award's signatory does not resolve");
    const holders = holdersFor(sig!.ok ? sig!.roleCode : "", f.unitPath, f.roster, f.delegations, d).holderIds;
    return holders[0] ?? fail(`nobody holds ${sig!.ok ? sig!.roleLabel : "the signatory's office"} on ${d}`);
  });
  await act(`${d}T17:00`, "award issued", A.issueAward, { id: award.id, signatoryPersonId: signer, signedOn: d });
  return { reference: ref, awardId: award.id };
}

/**
 * Read back as the public page reads it: the exercise is a result, with its awardee and day, and with the value
 * neither shown nor read while the organisation has not chosen to publish it.
 */
export async function checkResultsDemo(db: Db) {
  const { loadResults, loadOpportunity } = await import("../src/lib/portal/repo");
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: RESULTS_EXERCISE }, select: { reference: true, organisationId: true, window: { select: { path: true, publishedAt: true, publications: { select: { id: true } } } }, awards: { select: { status: true, issuedAt: true } } } });
  if (ex.window?.path !== "ADVERTISED" || !ex.window.publishedAt || ex.window.publications.length === 0) fail(`${ex.reference} was not advertised with its publications recorded`);
  if (!ex.awards.some((a) => a.status === "ISSUED" && a.issuedAt)) fail(`${ex.reference} has no issued award`);
  const policy = await db.awardPolicy.findUnique({ where: { organisationId: ex.organisationId }, select: { publishAwardedValue: true } });
  const { showsValue, results } = await loadResults();
  const row = results.find((x) => x.id === RESULTS_EXERCISE) ?? fail(`${ex.reference} is not on the Results page`);
  if (!row.awardee || !row.awardedOn) fail(`${ex.reference}'s result names no awardee or day`);
  if (policy?.publishAwardedValue !== true && (showsValue || row.awardedSen != null)) fail(`${ex.reference}'s value is shown while the organisation has not chosen to publish it`);
  const opportunity = await loadOpportunity(RESULTS_EXERCISE);
  if (opportunity?.state !== "AWARDED") fail(`${ex.reference}'s opportunity page does not read Awarded`);
}
