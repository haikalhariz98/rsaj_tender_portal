/**
 * Interim payment demo (6.13 Part A run 2, step 3). Invented throughout, ASSUMED; no RSAJ figure, office, form or
 * period (the materials allowance here is 80%, the issue clock 20 days and the warning's response clock 10 days,
 * all invented, never the customer's).
 *
 * - Configuration: three rows on the demo matrix (demo_rule62 an interim payment up to RM50,000, demo_rule63 above
 *   it, demo_rule64 an advance payment; their steps demo_st41–43), each following the boundary switch; the payment
 *   certificates' forms (demo_qks1 the interim certificate on demo_dt30 with the interim routing sheet demo_hrt1,
 *   demo_qks2 the advance on demo_dt30 with no sheet; the damages warning and the non-completion certificate left
 *   unset, so the screens say so); two contract clocks (demo_qck1, demo_qck2); and the interim payment controls on
 *   the demo's own post-award controls (demo_wpa1, only where it is the demo's): routed on the payment
 *   recommended, the materials allowance and where a split's sen go, the first release and the certificates
 *   before signing left unset.
 * - demo_con3: the valuation calendar (demo_qcl1, the 30th); interim valuation 1 (demo_qiv1, 30 Sep, wages
 *   deducted demo_qde1) raises 6.14's demo_hct1, whose figures are now this valuation's (the core's demo issues
 *   it); interim valuation 2 (demo_qiv2, 2 Oct, on the contractor's claim: materials demo_qml1–2, one not valued;
 *   the nominated sub-contractor's totals demo_qpl1) raises interim certificate demo_qct1, sent for approval on
 *   the matrix (route demo_ai130, steps demo_as130_*), its routing sheet started. Trail demo_qau*.
 * - Every act is judged by the product's own rule, through the product's own loaders, before its rows are written
 *   (X-10 c); nothing is dated after the load day (X-10 a).
 * - Ids: the demo_q three-letter sub-prefixes above (qcl, qiv, qde, qml, qpl, qct, qks, qck, qau; demo_qpt is the
 *   supervision demo's), demo_rule62–64, demo_st41–43, demo_ai130 and demo_as130_*, grepped free; the wipe
 *   matches each exactly. The advance payment, the retention release and the damages chain are not loaded here
 *   (their screens show their empty states and refusals): a contract past its date for completion arrives with
 *   step 5's demo.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACTOR } from "./demo-actor";

type Db = PrismaClient;
const P = "demo_";
const CON = `${P}con3`;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/// An instant written as UTC (10:00 in Kuala Lumpur is 02:00 UTC).
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const ON_BEHALF = "recorded on behalf of, not signed";
const people = { chen: { id: `${P}p3`, name: "Chen Wei Ling", isActive: true }, eng: { id: `${P}p5`, name: "Eng Siew Mei", isActive: true } };

function fail(what: string, faults: readonly { code: string }[]) {
  if (faults.length) throw new Error(`Demo payment act refused (${what}): ${faults.map((f) => f.code).join(", ")}`);
}

type Audit = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean };
let auditNo = 0;
function trail(organisationId: string, contract: string) {
  const audits: Audit[] = [];
  const add = (entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE", when: string, changes: object[], reason = "") => audits.push({ id: `${P}qau${++auditNo}`, organisationId, entity, entityId, entityLabel: `${contract} · ${suffix}`, action, at: at(when), changes, reason, ...DEMO_ACTOR });
  return { audits, add };
}

// ------------------------------------------------------------------ configuration

/// After the certificates' configuration (the interim form and routing sheet) and the supervision's (the controls).
export async function configurePaymentDemo(db: Db, organisationId: string) {
  const mx = `${P}mx1`;
  await db.authorityRule.createMany({
    data: [
      { id: `${P}rule62`, authorityMatrixId: mx, domain: "payment", ruleKey: "demo.payment.low", maxValue: "50000", followsBoundarySwitch: true, labelEn: "Interim payment, up to RM50,000", approverCode: "FD", clause: "DEMO 7.1", sortOrder: 62 },
      { id: `${P}rule63`, authorityMatrixId: mx, domain: "payment", ruleKey: "demo.payment.high", minValue: "50000", followsBoundarySwitch: true, labelEn: "Interim payment, above RM50,000", approverCode: "CEO", clause: "DEMO 7.2", sortOrder: 63 },
      { id: `${P}rule64`, authorityMatrixId: mx, domain: "advance_payment", ruleKey: "demo.advance", followsBoundarySwitch: true, labelEn: "Advance payment", approverCode: "FD", clause: "DEMO 7.3", sortOrder: 64 },
    ],
  });
  await db.authorityRuleStep.createMany({
    data: [
      { id: `${P}st41`, authorityRuleId: `${P}rule62`, roleCode: "HOD_CP", act: "R", sequence: 1 },
      { id: `${P}st42`, authorityRuleId: `${P}rule63`, roleCode: "FD", act: "R", sequence: 1 },
      { id: `${P}st43`, authorityRuleId: `${P}rule64`, roleCode: "HOD_CP", act: "R", sequence: 1 },
    ],
  });
  await db.certificateKindSetting.createMany({
    data: [
      { id: `${P}qks1`, organisationId, kind: "INTERIM_PAYMENT", templateId: `${P}dt30`, routingTypeId: `${P}hrt1`, provenance: "ASSUMED", notes: "Invented for the demo." },
      { id: `${P}qks2`, organisationId, kind: "ADVANCE_PAYMENT", templateId: `${P}dt30`, routingTypeId: null, provenance: "ASSUMED", notes: "Invented for the demo." },
    ],
  });
  await db.contractClockRule.createMany({
    data: [
      { id: `${P}qck1`, organisationId, clock: "CERT_ISSUE", length: 20, unit: "DAYS", provenance: "ASSUMED", notes: "Invented for the demo." },
      { id: `${P}qck2`, organisationId, clock: "LAD_WARNING_RESPONSE", length: 10, unit: "DAYS", provenance: "ASSUMED", notes: "Invented for the demo." },
    ],
  });
  // Only the demo's own controls row: an organisation's own is never touched.
  await db.postAwardPolicy.updateMany({
    where: { id: `${P}wpa1`, organisationId },
    data: { unfixedMaterialsDefaultPct: "80", unfixedMaterialsProvenance: "ASSUMED", paymentRouteFigure: "RECOMMENDED", paymentRouteProvenance: "ASSUMED", waterfallRemainder: "LARGEST_REMAINDER", waterfallProvenance: "ASSUMED" },
  });
}

// ------------------------------------------------------------------ shared readings

async function readings() {
  const { loadContract, contractLabel } = await import("../src/lib/contract/repo");
  const { loadSupervision, soOfficeOn, delegationFactsOf } = await import("../src/lib/supervision/load");
  const { capacityFor } = await import("../src/lib/supervision/authority");
  const pay = await import("../src/lib/payment/load");
  const { assembleInterim } = await import("../src/lib/payment/assemble");
  const { diffFields } = await import("../src/lib/audit/diff");
  const l = (await loadContract(CON))!;
  const contract = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  /// The officer the act is recorded for, in the capacity the act needs on the day (as the payment acts judge it).
  const recordedFor = async (personId: string, need: Parameters<typeof capacityFor>[1], on: string) => {
    const s = await loadSupervision(CON);
    const so = await soOfficeOn(l, s, on);
    const r = capacityFor(personId, need, so?.office ?? null, delegationFactsOf(s), on);
    fail(`recorded for ${personId} on ${on}`, r.faults);
    return so!.office.roleLabel;
  };
  /// The valuation assembled as the Payments tab and the raising act assemble it, on the rows as they stand.
  const assemble = async (valuationId: string, on: string) => {
    const [p, cfg] = await Promise.all([pay.loadPayment(CON), pay.loadPaymentConfig(l.org.id)]);
    const v = p.interimValuations.find((x) => x.id === valuationId)!;
    const lNow = (await loadContract(CON))!;
    const input = pay.assembleInputOf(lNow, p, cfg, v, on, await pay.preExecutionFacts(lNow));
    if (!input) throw new Error(`demo ${valuationId}: no baseline in force on ${on}`);
    const a = assembleInterim(input);
    fail(`${valuationId} raise`, a.faults);
    return { a, input };
  };
  return { l, contract, recordedFor, assemble, diffFields };
}

type Raised = { snapshot: NonNullable<Awaited<ReturnType<Awaited<ReturnType<typeof readings>>["assemble"]>>["a"]["result"]["snapshot"]>; judgedUnder: unknown; sequence: number; summary: Record<string, string | number | null> };

/**
 * Interim valuation 1 on demo_con3 (30 Sep), up to the moment its certificate is raised: the calendar agreed, the
 * valuation opened on the agreed day, valued jointly and agreed, the wages paid direct deducted. Called by the
 * certificates' demo, which opens demo_hct1 on these figures and then calls `linkFirstInterimDemo`.
 */
export async function raiseFirstInterimDemo(db: Db, organisationId: string): Promise<Raised> {
  const { calendarFaults, openFaults, jointFaults } = await import("../src/lib/payment/valuation");
  const { baselineOn } = await import("../src/lib/payment/load");
  const { TRIGGER_WORDS, ANSWER_WORDS, DEDUCTION_WORDS } = await import("../src/lib/payment/labels");
  const r = await readings();
  const t = trail(organisationId, r.contract);
  const on = "2026-09-30";

  // The calendar: the 30th, agreed with the contractor's agent (FR-PAY-003).
  fail("calendar", calendarFaults({ dayOfMonth: 30, agreedOn: on, agreedWith: "Demo Contractor's site agent", today: on, existing: false, reason: "" }));
  const so = await r.recordedFor(people.chen.id, { principalOrSo: true }, on);
  await db.paymentCalendar.create({ data: { id: `${P}qcl1`, organisationId, contractId: CON, dayOfMonth: 30, agreedOn: day(on), agreedWith: "Demo Contractor's site agent", personId: people.chen.id, note: "Agreed at the start-up meeting (demo).", recordedAt: at(`${on}T02:30`) } });
  t.add("PaymentCalendar", `${P}qcl1`, "valuation calendar", "CREATE", `${on}T02:30`, r.diffFields(null, { valuationDay: "day 30 of each month (the last day of a shorter month)", agreedOn: on, agreedWith: "Demo Contractor's site agent", recordedFor: `${people.chen.name}, as ${so}`, partiesNotified: "computed, not sent (notifications send nothing yet)", recordedOnBehalf: ON_BEHALF }));

  // The valuation, on the agreed day.
  fail("valuation 1", openFaults({ trigger: "VALUATION_DATE", triggerDate: null, valuationDate: on, today: on, calendarDay: 30, inProgress: false, lastIssuedOn: null, baselineInForce: !!baselineOn(r.l, on) }));
  await r.recordedFor(people.chen.id, { act: "VALUATION" }, on);
  const v1 = `${P}qiv1`;
  const label = `interim valuation of ${on}`;
  await db.interimValuation.create({ data: { id: v1, organisationId, contractId: CON, trigger: "VALUATION_DATE", valuationDate: day(on), personId: people.chen.id, participants: [], recordedAt: at(`${on}T02:35`), recordedOn: day(on) } });
  t.add("InterimValuation", v1, label, "CREATE", `${on}T02:35`, r.diffFields(null, { startedBy: TRIGGER_WORDS.VALUATION_DATE.en, valuationDay: on, forInterimCertificate: 1, recordedFor: `${people.chen.name}, as ${so}`, recordedOnBehalf: ON_BEHALF }));
  await db.interimValuation.update({ where: { id: v1 }, data: { mainWorks: "12000.00", mainWorksNote: "Trench excavation and the first 120 m of main laid (demo)." } });
  t.add("InterimValuation", v1, label, "UPDATE", `${on}T02:40`, r.diffFields({ mainContractorWorks: null }, { mainContractorWorks: "12000.00" }), "Trench excavation and the first 120 m of main laid (demo).");
  const participants = [`${people.chen.name} (${so})`, "Demo Contractor's site agent"];
  const method = "Measured jointly on site against the bill of quantities (demo).";
  fail("joint 1", jointFaults({ participants, method, answer: "AGREED", dissent: "", on, valuationDate: on, today: on }));
  await db.interimValuation.update({ where: { id: v1 }, data: { jointOn: day(on), participants, method, contractorAnswer: "AGREED" } });
  t.add("InterimValuation", v1, label, "UPDATE", `${on}T02:45`, r.diffFields({ valuedJointlyOn: null, participants: null, valuationMethod: null, contractorsAnswer: null }, { valuedJointlyOn: on, participants: participants.join("; "), valuationMethod: method, contractorsAnswer: ANSWER_WORDS.AGREED.en }));
  await db.valuationDeduction.create({ data: { id: `${P}qde1`, organisationId, valuationId: v1, kind: "WAGES", label: "", amount: "500.00", note: "Two workers' wages paid direct by the employer (demo).", recordedAt: at(`${on}T02:50`) } });
  t.add("ValuationDeduction", `${P}qde1`, `${label} · ${DEDUCTION_WORDS.WAGES.en}`, "CREATE", `${on}T02:50`, r.diffFields(null, { deductionFor: DEDUCTION_WORDS.WAGES.en, deductionAmount: "500.00" }), "Two workers' wages paid direct by the employer (demo).");

  const { a } = await r.assemble(v1, on);
  if (a.sequence !== 1) throw new Error(`demo ${v1}: assembled as interim certificate ${a.sequence}, not 1`);
  await db.auditEntry.createMany({ data: t.audits as never });
  const f = a.result.figures!;
  const { senToDecimalString: s } = await import("../src/lib/money");
  return { snapshot: a.result.snapshot!, judgedUnder: a.judgedUnder, sequence: a.sequence, summary: { asInterimCertificate: a.sequence, grossValueToDate: s(f.gross), carriedForward: s(f.carryForward), totalDeductions: s(f.deductions), paymentRecommended: s(f.recommended), baselineVersion: "" } };
}

/// The valuation raised: tied to the certificate opened on its figures, with everything those figures rest on.
export async function linkFirstInterimDemo(db: Db, organisationId: string, certId: string, raised: Raised, when: string) {
  const r = await readings();
  const t = trail(organisationId, r.contract);
  const moved = await db.interimValuation.updateMany({ where: { id: `${P}qiv1`, status: "OPEN" }, data: { status: "RAISED", certificateId: certId, judgedUnder: raised.judgedUnder as never } });
  if (moved.count !== 1) throw new Error("demo qiv1: not open when its certificate was raised");
  const cert = await db.certificate.findUniqueOrThrow({ where: { id: certId }, select: { baseline: { select: { version: true } } } });
  t.add("InterimValuation", `${P}qiv1`, "interim valuation of 2026-09-30", "UPDATE", when, r.diffFields({ valuationStage: "being valued" }, { valuationStage: "certificate raised", ...raised.summary, baselineVersion: `version ${cert.baseline.version}` }));
  await db.auditEntry.createMany({ data: t.audits as never });
}

// ------------------------------------------------------------------ interim valuation 2, raised and sent for approval

export async function loadPaymentDemo(db: Db, organisationId: string) {
  const { openFaults, jointFaults } = await import("../src/lib/payment/valuation");
  const { baselineOn, loadPayment } = await import("../src/lib/payment/load");
  const { afterCutOff } = await import("../src/lib/payment/materials");
  const { TRIGGER_WORDS, ANSWER_WORDS } = await import("../src/lib/payment/labels");
  const { storedDay } = await import("../src/lib/dates");
  const { senToDecimalString: s } = await import("../src/lib/money");
  const { snapshotFaults } = await import("../src/lib/certificate/snapshot");
  const { routingTypeNow } = await import("../src/lib/certificate/repo");
  const { freezeRoutingType, typeFaults } = await import("../src/lib/certificate/routing-sheet");
  const { certificateTransition } = await import("../src/lib/certificate/status");
  const { KIND_WORDS, STATUS_WORDS } = await import("../src/lib/certificate/labels");
  const { baselineFor } = await import("../src/lib/contract/baseline");
  const r = await readings();
  const t = trail(organisationId, r.contract);
  const on = "2026-10-02";

  // ------------------------------------------------ the valuation, on the contractor's claim
  const p0 = await loadPayment(CON);
  const lastIssued = p0.interimValuations.filter((v) => v.certificate?.status === "ISSUED").map((v) => storedDay(v.valuationDate)).sort().at(-1) ?? null;
  if (lastIssued !== "2026-09-30") throw new Error(`demo qiv2: interim certificate 1 is not issued from its valuation (last ${lastIssued})`);
  fail("valuation 2", openFaults({ trigger: "CLAIM", triggerDate: on, valuationDate: on, today: on, calendarDay: p0.paymentCalendar?.dayOfMonth ?? null, inProgress: false, lastIssuedOn: lastIssued, baselineInForce: !!baselineOn(r.l, on) }));
  const so = await r.recordedFor(people.chen.id, { act: "VALUATION" }, on);
  const v2 = `${P}qiv2`;
  const label = `interim valuation of ${on}`;
  await db.interimValuation.create({ data: { id: v2, organisationId, contractId: CON, trigger: "CLAIM", triggerDate: day(on), valuationDate: day(on), personId: people.chen.id, participants: [], recordedAt: at(`${on}T01:30`), recordedOn: day(on) } });
  t.add("InterimValuation", v2, label, "CREATE", `${on}T01:30`, r.diffFields(null, { startedBy: TRIGGER_WORDS.CLAIM.en, claimReceivedOn: on, valuationDay: on, forInterimCertificate: 2, recordedFor: `${people.chen.name}, as ${so}`, recordedOnBehalf: ON_BEHALF }));
  await db.interimValuation.update({ where: { id: v2 }, data: { mainWorks: "20000.00", mainWorksNote: "A further 80 m of main laid and tested (demo)." } });
  t.add("InterimValuation", v2, label, "UPDATE", `${on}T01:40`, r.diffFields({ mainContractorWorks: null }, { mainContractorWorks: "20000.00" }), "A further 80 m of main laid and tested (demo).");
  const participants = [`${people.chen.name} (${so})`, "Demo Contractor's site agent"];
  const method = "Measured jointly on site; the materials counted against the delivery orders (demo).";
  fail("joint 2", jointFaults({ participants, method, answer: "AGREED", dissent: "", on, valuationDate: on, today: on }));
  await db.interimValuation.update({ where: { id: v2 }, data: { jointOn: day(on), participants, method, contractorAnswer: "AGREED" } });
  t.add("InterimValuation", v2, label, "UPDATE", `${on}T01:45`, r.diffFields({ valuedJointlyOn: null, participants: null, valuationMethod: null, contractorsAnswer: null }, { valuedJointlyOn: on, participants: participants.join("; "), valuationMethod: method, contractorsAnswer: ANSWER_WORDS.AGREED.en }));

  // The materials list, submitted the day before: one line valued, one not (temporary works).
  const materials = [
    { id: `${P}qml1`, description: "Ductile iron pipes, 150 mm", quantity: "24 lengths", location: "The fenced compound by the pump house", value: "2000.00", protectedOnSite: true, notTooEarly: true, formsPartOfWorks: true, temporary: false },
    { id: `${P}qml2`, description: "Timber for trench shoring", quantity: "40 boards", location: "Beside the trench", value: "600.00", protectedOnSite: true, notTooEarly: true, formsPartOfWorks: false, temporary: true },
  ];
  for (const [i, m] of materials.entries()) {
    if (afterCutOff("2026-10-01", on)) throw new Error("demo materials: after the cut-off");
    await db.materialLine.create({ data: { ...m, organisationId, valuationId: v2, submittedOn: day("2026-10-01"), recordedAt: at(`${on}T02:0${i}`) } });
    t.add("MaterialLine", m.id, `${label} · ${m.description}`, "CREATE", `${on}T02:0${i}`, r.diffFields(null, { material: m.description, quantity: m.quantity, storedAt: m.location, materialValue: m.value, adequatelyProtected: "yes", notDeliveredTooEarly: "yes", formsPartOfTheWorks: m.formsPartOfWorks ? "yes" : "no", temporaryWorks: m.temporary ? "yes" : "no", submittedOn: "2026-10-01" }));
  }
  // The nominated sub-contractor's totals (B1).
  const party = p0.contractParties.find((x) => x.id === `${P}qpt1` && !x.retiredOn);
  if (!party || party.kind !== "NOMINATED_SUBCONTRACTOR") throw new Error("demo qpl1: the nominated sub-contractor is not on demo_con3");
  await db.partyLine.create({ data: { id: `${P}qpl1`, organisationId, valuationId: v2, partyId: party.id, value: "3000.00", due: "2700.00", submittedOn: day("2026-10-01"), note: "Its first claim, less its own retention (demo).", recordedAt: at(`${on}T02:10`) } });
  t.add("PartyLine", `${P}qpl1`, `${label} · ${party.name}`, "CREATE", `${on}T02:10`, r.diffFields(null, { partyValueToDate: "3000.00", dueThisCertificate: "2700.00", submittedOn: "2026-10-01" }), "Its first claim, less its own retention (demo).");

  // ------------------------------------------------ raised: interim certificate 2, opened through the core's rule
  const { a, input } = await r.assemble(v2, on);
  if (a.sequence !== 2) throw new Error(`demo ${v2}: assembled as interim certificate ${a.sequence}, not 2`);
  const snap = a.result.snapshot!;
  fail("qct1 figures", snapshotFaults(snap));
  fail("qct1 routing type", typeFaults(await routingTypeNow(`${P}hrt1`), "CERTIFICATE", "INTERIM_PAYMENT", on));
  const lNow = (await (await import("../src/lib/contract/repo")).loadContract(CON))!;
  const b = baselineFor(lNow.contract.baselines.filter((x) => x.version != null).map((x) => ({ ...x, recordedOn: x.recordedOn ? storedDay(x.recordedOn) : null })), on)!;
  const c1 = `${P}qct1`;
  const certLabel = KIND_WORDS.INTERIM_PAYMENT.en;
  await db.certificate.create({ data: { id: c1, organisationId, contractId: CON, kind: "INTERIM_PAYMENT", templateId: `${P}dt30`, routingTypeId: `${P}hrt1`, baselineId: b.id, computedSnapshot: snap as never, openedAt: at(`${on}T03:00`), openedOn: day(on) } });
  t.add("Certificate", c1, certLabel, "CREATE", `${on}T03:00`, r.diffFields(null, { certificate: KIND_WORDS.INTERIM_PAYMENT.en, stage: STATUS_WORDS.DRAFT.en, baselineVersion: `version ${b.version}`, figures: snap.rule.en, routed: "yes" }));
  const moved = await db.interimValuation.updateMany({ where: { id: v2, status: "OPEN" }, data: { status: "RAISED", certificateId: c1, judgedUnder: a.judgedUnder as never } });
  if (moved.count !== 1) throw new Error("demo qiv2: not open when raised");
  const f = a.result.figures!;
  t.add("InterimValuation", v2, label, "UPDATE", `${on}T03:00`, r.diffFields({ valuationStage: "being valued" }, { valuationStage: "certificate raised", asInterimCertificate: a.sequence, grossValueToDate: s(f.gross), carriedForward: s(f.carryForward), totalDeductions: s(f.deductions), paymentRecommended: s(f.recommended), baselineVersion: `version ${input.baseline.version}`, materialsAllowance: a.judgedUnder?.materialsPct.state === "SET" ? `${a.judgedUnder.materialsPct.pct}%` : null }));

  // ------------------------------------------------ sent for approval by the section (not an office on its route)
  await sendDemoRoute(db, organisationId, c1, on, t.add);
  // Its routing sheet starts in the same act: the type and the figures freeze.
  const tr = certificateTransition("DRAFT", "IN_ROUTING");
  if (tr) throw new Error(`demo qct1: DRAFT → IN_ROUTING refused (${tr})`);
  const frozen = freezeRoutingType((await routingTypeNow(`${P}hrt1`))!, on);
  await db.certificate.update({ where: { id: c1 }, data: { status: "IN_ROUTING", routingSnapshot: frozen as never } });
  t.add("Certificate", c1, certLabel, "UPDATE", `${on}T03:30`, r.diffFields({ stage: STATUS_WORDS.DRAFT.en }, { stage: STATUS_WORDS.IN_ROUTING.en, routingSheet: frozen.labelEn, checks: frozen.checks.map((x) => x.labelEn).join(", ") || "none", figures: "frozen as computed" }));
  await db.auditEntry.createMany({ data: t.audits as never });
}

/// The route opened as the certificate page's "Send for approval" opens it: the figure the organisation routes on,
/// the matrix in force that day under the requisition's funding route, the absence rule and the sender's office.
async function sendDemoRoute(db: Db, organisationId: string, certId: string, on: string, add: ReturnType<typeof trail>["add"]) {
  const { loadIssue, loadOverrideMatrix } = await import("../src/lib/authority/load");
  const { absentOffices } = await import("../src/lib/authority/absence");
  const { boundaryOperatorFor } = await import("../src/lib/authority/resolve");
  const { routeCoreFields, stepOrigin } = await import("../src/lib/authority/core-routing");
  const { rejectionSnapshot } = await import("../src/lib/authority/rejection");
  const { loadDestinations } = await import("../src/lib/approvals/rejection-store");
  const { applyOverrides } = await import("../src/lib/certificate/override");
  const { readComputedSnapshot } = await import("../src/lib/certificate/snapshot");
  const { loadContract } = await import("../src/lib/contract/repo");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const { senFromDecimal, senToDecimalString } = await import("../src/lib/money");
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const { pathTo } = await import("../src/lib/organisation/structure");
  const { loadDelegations, loadRoster } = await import("../src/lib/people/load");
  const { holdersFor } = await import("../src/lib/requisition/holders");
  const { methodKeyOf } = await import("../src/lib/supervision/load");
  const { KIND_ROUTE_DOMAIN, resolveCertificateRouteUnder } = await import("../src/lib/payment/route");
  const { routeValueOf, submitStateFaults } = await import("../src/lib/payment/route-state");
  const { diffFields } = await import("../src/lib/audit/diff");
  const { KIND_WORDS } = await import("../src/lib/certificate/labels");

  const l = (await loadContract(CON))!;
  const cert = await db.certificate.findUniqueOrThrow({ where: { id: certId }, include: { overrides: true, baseline: true, approvalInstances: true } });
  const domain = KIND_ROUTE_DOMAIN[cert.kind];
  fail("send state", submitStateFaults({ domain, status: cert.status, latest: null }));
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const policy = await db.postAwardPolicy.findUnique({ where: { organisationId }, select: { paymentRouteFigure: true } });
  const contractSum = senFromDecimal(cert.baseline.contractSum);
  const v = routeValueOf(cert.kind, snap ? applyOverrides(snap, cert.overrides) : null, policy?.paymentRouteFigure ?? null, contractSum);
  if (Array.isArray(v)) return fail("route figure", v);
  const onDate = day(on);
  const issue = await loadIssue(ORGANISATION_CODE, onDate, undefined, null, db);
  if (!issue) throw new Error(`demo route: no matrix in force on ${on}`);
  const supersedes = l.req.fundingSupersedesAuthority === true;
  const override = supersedes && l.req.fundingRouteCode ? await loadOverrideMatrix(ORGANISATION_CODE, l.req.fundingRouteCode, onDate, db) : null;
  const [roster, delegations, units] = await Promise.all([loadRoster(ORGANISATION_CODE, db), loadDelegations(ORGANISATION_CODE, db), db.orgUnit.findMany({ where: { organisationId } })]);
  const unitPath = pathTo(units as never, l.req.sectionUnitCode || l.req.requestingUnitCode, onDate).reverse().map((u) => u.code);
  const holdersOf = (code: string) => holdersFor(code, unitPath, roster, delegations, on);
  const known = new Map(roster.people.map((x) => [x.id, x]));
  const available = (pid: string) => !!known.get(pid)?.isActive && !!known.get(pid)?.isAvailable;
  const offices = Object.keys(issue.matrix.roles).filter((k) => !issue.matrix.roles[k].isCommittee);
  const sender = people.eng;
  const r = resolveCertificateRouteUnder({ dal: issue.matrix, override, supersedes }, { domain: domain!, value: v.value, contractValue: contractSum, method: await methodKeyOf(l, db), contractTypeCode: l.ex.contractTypeCode, absentRoleCodes: absentOffices(offices, holdersOf, available) }, issue.label, (code) => holdersOf(code).holderIds.includes(sender.id));
  if (!r.ok) return fail("route", r.faults);
  const matrix = r.source === "OVERRIDE" && override ? override.matrix : issue.matrix;
  const rule = r.resolution.rule!;
  const roleLabel = (code: string) => matrix.roles[code]?.nameEn ?? issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const now = at(`${on}T03:20`);
  const id = `${P}ai130`;
  await db.approvalInstance.create({
    data: {
      id, organisationId, matterKind: "CERTIFICATE", certificateId: certId, submittedByPersonId: sender.id, domain: domain!, value: senToDecimalString(v.value),
      authorityMatrixId: issue.id, matrixLabel: issue.label, ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause,
      boundaryValue: String(matrix.policy.boundaryValue), boundaryInclusive: matrix.policy.boundaryInclusive, ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, matrix.policy),
      fundingRouteCode: l.req.fundingRouteCode, fundingOverrideApplied: r.source === "OVERRIDE" && override != null, overrideMatrixId: r.source === "OVERRIDE" ? (override?.id ?? null) : null, overrideMatrixLabel: r.source === "OVERRIDE" ? (override?.label ?? null) : null,
      checkedAgainstMatrix: true, warnings: r.warnings as never, status: "PENDING", openedAt: onDate, createdAt: now,
      ...rejectionSnapshot(await loadDestinations(db as never, organisationId), domain!, onDate, now),
      ...routeCoreFields(r.resolution.core, now),
      steps: { create: r.resolution.chain.map((s, i) => ({ id: `${P}as130_${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
    },
  });
  add("ApprovalInstance", id, `${KIND_WORDS[cert.kind].en} · approval route`, "CREATE", `${on}T03:20`, diffFields(null, { matrix: issue.label, rule: rule.labelEn, routedOn: `${v.figure}, ${senToDecimalString(v.value)}`, route: r.resolution.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: r.source === "OVERRIDE" && override != null, sentBy: sender.name, recordedOnBehalf: "not signed" }));
}

/// Read back after the load, through the product's own readings.
export async function checkPaymentDemo(db: Db) {
  const { loadPayment, issuedInterims, inProgress } = await import("../src/lib/payment/load");
  const p = await loadPayment(CON);
  const issued = issuedInterims(p);
  if (issued.length !== 1 || issued[0].certificateId !== `${P}hct1` || issued[0].sequence !== 1) throw new Error("demo check: interim certificate 1 does not read as issued from its valuation");
  if (p.certificates.length !== 0) throw new Error("demo check: an interim certificate on demo_con3 was not raised from a valuation");
  const cur = inProgress(p);
  if (cur?.id !== `${P}qiv2` || cur.certificate?.status !== "IN_ROUTING") throw new Error("demo check: valuation 2 is not raised and in routing");
  const route = await db.approvalInstance.findUniqueOrThrow({ where: { id: `${P}ai130` }, include: { steps: true } });
  if (route.status !== "PENDING" || route.steps.length === 0 || !route.checkedAgainstMatrix) throw new Error("demo check: interim certificate 2's route is not pending on the matrix");
}

// ------------------------------------------------------------------ wipe

/// Every payment row on the given contracts (the demo's, and any made through the screens on them), children first.
/// Before the supervision's (a party line names a party, a release a handover, a premium its valuation) and the
/// certificates' (a valuation, an advance, a warning and a decision each name their certificate).
export async function wipePayments(db: Db, contractIds: readonly string[]) {
  if (!contractIds.length) return;
  const byContract = { contractId: { in: [...contractIds] } };
  await db.financePayment.deleteMany({ where: { certificate: byContract } });
  await db.retentionRelease.deleteMany({ where: byContract });
  await db.advanceRecoupmentRow.deleteMany({ where: { advance: byContract } });
  await db.advancePayment.deleteMany({ where: byContract });
  await db.partyLine.deleteMany({ where: { valuation: byContract } });
  await db.materialLine.deleteMany({ where: { valuation: byContract } });
  await db.valuationDeduction.deleteMany({ where: { valuation: byContract } });
  await db.pendingDeduction.updateMany({ where: { ...byContract, NOT: { valuationId: null } }, data: { valuationId: null } });
  await db.interimValuation.deleteMany({ where: byContract });
  // A replacement points at the decision it replaced.
  await db.nonCompletion.updateMany({ where: { ...byContract, NOT: { replacesId: null } }, data: { replacesId: null, replaceReason: "" } });
  await db.nonCompletion.deleteMany({ where: byContract });
  await db.ladWarning.deleteMany({ where: byContract });
  await db.paymentCalendar.deleteMany({ where: byContract });
  await db.openingPosition.deleteMany({ where: byContract });
}

/// The demo's payment configuration (rows by demo id), before the forms and routing sheets they name. The matrix
/// rows go with the demo matrix; the controls' payment fields with the demo's controls row.
export async function wipePaymentConfig(db: Db) {
  const sub = (s: string) => ({ id: { startsWith: `${P}${s}` } });
  await db.certificateKindSetting.deleteMany({ where: sub("qks") });
  await db.contractClockRule.deleteMany({ where: sub("qck") });
}
