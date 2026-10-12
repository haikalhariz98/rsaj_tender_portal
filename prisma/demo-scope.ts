/**
 * Demo data for 6.2 increment 1: scope, the bill of quantities, the specification panel and
 * the company estimate (plan §6, as ruled: X-4, X-10). Invented throughout; every figure
 * below is the demo's own (X-10 d: the RSAJ worked examples stay test-only fixtures), and
 * every configured value is ASSUMED. No recorded act is dated after the load day
 * (2026-10-01, X-10 a), and every row passes the checks of its act (X-10 c, `checkScope`).
 *
 * - Policy (only where the organisation has set none of it): a demo measurement standard, a
 *   qualification a bill's preparer holds (Nurul Izzah Kamal holds it, Lim Kok Seng does
 *   not), a 7-day lead, the Head of Contract & Procurement as custodian; audit office,
 *   override office and the panel lists left unset; a signatory limit of 6.
 * - Three verification columns; one bill template, six headings.
 * - Method and basis rules (OD-6): tenders and quotations need an estimate, direct and
 *   specialist do not, emergency and term contracts are left unset; the bill basis is let on
 *   a bill, drawings and specification is not. All ASSUMED.
 * - demo_sx1: bill v1 finalised; panel verified on its SULIT scan (demo-documents); estimate
 *   lodged, amended once before lodgement, its retained copy recorded.
 * - demo_sx5: bill v1 finalised, v2 a draft re-measuring the roof with the standard
 *   unanswered (shows the block); panel verified; estimate lodged, so 6.4 can use it (X-10 c).
 * - demo_sx3 (drawings and specification): panel a draft with one column unverified; one
 *   estimate void (its preparer moved before lodgement), a fresh one being prepared.
 * - demo_sx15 (X-4): FRP tank repair by its manufacturer, scoped by the specialist, its bill
 *   finalised, imported from the specialist's CSV (kept as demo_doc9, demo-documents). Its scope
 *   matter demo_d40 is tabled at the Technical Committee's sitting demo_mt11 and carried
 *   (increment 2, `loadScopeSitting`).
 * - Increment 2: scope approval required for the specialist method by the Technical
 *   Committee, under the act Approve (ASSUMED, as every demo value), not for the others,
 *   emergency unset; one schedule of rates in two issues, sx5's
 *   roof lines priced from issue 1 and kept after issue 2 superseded it.
 * - demo_sx2, sx4 and sx7 keep no bill, panel or estimate: the empty states.
 * - 6.4 (X-10 c): demo_sx15's panel is verified on 27 September on its signed form (demo_doc10),
 *   so its tender documents pass 6.2's readiness when they are submitted.
 *
 * Estimate versions are written with their figures (the demo's own client has no omit) and
 * nothing here prints them; their audit rows read "Sealed (version N)" (ADR 0012).
 */

import { raiseSeries } from "./demo-series";
import type { PrismaClient } from "../src/generated/prisma/client";
import { estimateCreatedAudit, estimateEventAudit, estimateStateAudit, estimateVersionAudit, bqFinalisedAudit, bqStatusAudit, itemAudit, sectionAudit, rateFromText, verificationAudit, ENTITY, RATE_ENTITY } from "../src/lib/scope/audit-view";
import { diffFields } from "../src/lib/audit/diff";
import { formatDate } from "../src/lib/format";
import { bqTotals, itemAmount, totalsSnapshot } from "../src/lib/scope/bq";
import { formatSen, parseSen, senToDecimalString } from "../src/lib/money";
import type { BqItemKind, BqLine } from "../src/lib/scope/types";
import { scopeMatterSubject } from "../src/lib/scope/scope-matter";
import { DEMO_ACTOR } from "./demo-actor";
import { demoOrgId } from "./demo-org";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);

/// The policy's demo values, in groups (a value with its provenance), each filled only where
/// the organisation has left the whole group unset, and cleared by the wipe only where the
/// whole group still holds the demo's values.
export const DEMO_SCOPE_POLICY_GROUPS = [
  { measurementStandardLabel: "Demo Standard Method of Measurement, 2nd edition", measurementStandardProvenance: "ASSUMED" },
  { bqPreparerQualificationCode: "QQM" },
  { estimateLeadDays: 7, estimateLeadProvenance: "ASSUMED" },
  { estimateCustodianRoleCode: "HOD_CP" },
  { panelSignatoryLimit: 6, panelSignatoryLimitProvenance: "ASSUMED" },
  { benchmarkLabelEn: "Company estimate" },
] as const;
export const DEMO_SCOPE_POLICY = Object.assign({}, ...DEMO_SCOPE_POLICY_GROUPS) as { measurementStandardLabel: string; measurementStandardProvenance: "ASSUMED"; bqPreparerQualificationCode: string; estimateLeadDays: number; estimateLeadProvenance: "ASSUMED"; estimateCustodianRoleCode: string; panelSignatoryLimit: number; panelSignatoryLimitProvenance: "ASSUMED"; benchmarkLabelEn: string };
const groupIs = (row: Record<string, unknown>, g: Record<string, unknown>, test: (have: unknown, want: unknown) => boolean) => Object.entries(g).every(([f, v]) => test(row[f], v));
const DEMO_POLICY_ID = `${P}scp1`;

// ------------------------------------------------------------------ the exercise 6.2 adds (before determination)

/// demo_sx15 (X-4), created with the other exercises so determineExercises bands it.
export async function loadScopeExercises(db: Db, organisationId: string): Promise<string[]> {
  await db.sourcingExercise.create({
    data: {
      id: `${P}sx15`, organisationId, specPanelUsed: true, onScreenBillUsed: true, reference: "DEMO/SX/0015/2026", requisitionId: `${P}rq14`, title: "FRP tank repair by its manufacturer", estimatedValue: "18000.00",
      sourcingMethodCode: "specialist", contractBasisCode: "bq", createdAt: day("2026-09-24"),
      methodReason: "The sectional tank's maker alone holds its panel moulds and repair warranty.",
      justificationReasonCode: "continuity", justificationText: "Repairs by anyone else void the tank's warranty; the maker inspected and scoped the repair on site on 22 September 2026.",
    },
  });
  await db.exerciseScopePart.create({ data: { id: `${P}sx15p1`, exerciseId: `${P}sx15`, deliverableKind: "MEASURED_CONSTRUCTION", amount: "18000.00", description: "FRP panel repair and resealing", sortOrder: 1 } });
  await raiseSeries(db, `${P}n5`, 16);
  return [`${P}sx15`];
}

// ------------------------------------------------------------------ load

type Item = [ref: string, description: string, unit: string, quantity: string, rate: string, kind?: BqItemKind, provisional?: boolean];
interface DemoBq {
  id: string;
  exerciseId: string;
  reference: string;
  versionNo: number;
  status: "DRAFT" | "FINALISED" | "SUPERSEDED";
  scopedBy: "IMPLEMENTING_DEPARTMENT" | "SPECIALIST_CONTRACTOR" | "COORDINATION_MEETING";
  scope: string;
  followsStandard: boolean | null;
  excluded: boolean | null;
  createdOn: string;
  finalisedOn?: string;
  revisionReason?: string;
  sections: { id: string; number: string; title: string; items: Item[] }[];
}

const line = (i: Item): BqLine => ({ itemRef: i[0], description: i[1], unit: i[2], quantity: i[3], rate: parseSen(i[4]), kind: i[5] ?? "MEASURED", provisional: i[6] ?? false });

const SX1_SECTIONS: DemoBq["sections"] = [
  { id: `${P}bqs1`, number: "1", title: "Preliminaries", items: [["1.1", "Site establishment, temporary works and removal", "item", "1", "18500.00"]] },
  {
    id: `${P}bqs2`, number: "2", title: "Filter renewal", items: [
      ["2.1", "Remove and dispose of spent filter media", "m³", "64.5", "210.00"],
      ["2.2", "Supply and place graded filter media", "m³", "64.5", "1840.00"],
      ["2.3", "Replace underdrain headers", "nr", "24", "3275.50"],
      ["2.4", "Make good filter bed concrete", "m²", "18", "412.25", "MEASURED", true],
    ],
  },
  { id: `${P}bqs3`, number: "3", title: "Sums", items: [["3.1", "Valve actuators, nominated supply", "sum", "1", "32000.00", "PRIME_COST_SUM"], ["3.2", "Contingencies", "sum", "1", "15000.00", "PROVISIONAL_SUM"]] },
];

const SX5_V1: DemoBq["sections"] = [
  { id: `${P}bqs4`, number: "1", title: "Preliminaries", items: [["1.1", "Access, scaffolding and protection of the tank", "item", "1", "9800.00"]] },
  {
    id: `${P}bqs5`, number: "2", title: "Roof and fittings", items: [
      ["2.1", "Strip and dispose of roof sheeting", "m²", "420", "18.50"],
      ["2.2", "New roof sheeting with insulation", "m²", "420", "142.75"],
      ["2.3", "Stainless steel access hatches", "nr", "6", "4150.00"],
      ["2.4", "Internal ladders and handrails", "m", "36", "385.00", "MEASURED", true],
    ],
  },
  { id: `${P}bqs6`, number: "3", title: "Sums", items: [["3.1", "Level instrumentation, nominated supply", "sum", "1", "22000.00", "PRIME_COST_SUM"], ["3.2", "Contingencies", "sum", "1", "6000.00", "PROVISIONAL_SUM"]] },
];
// The draft revision re-measures the roof: 436 m² instead of 420.
const SX5_V2: DemoBq["sections"] = SX5_V1.map((s, i) => ({
  ...s,
  id: `${P}bqs${7 + i}`,
  items: s.items.map((it) => (it[0] === "2.1" || it[0] === "2.2" ? ([it[0], it[1], it[2], "436", it[4], it[5], it[6]] as Item) : it)),
}));

const SX15_SECTIONS: DemoBq["sections"] = [
  {
    id: `${P}bqs10`, number: "1", title: "Repair", items: [
      ["1.1", "Repair damaged FRP panels", "m²", "12", "960.00"],
      ["1.2", "Reseal panel joints", "m", "48", "72.50"],
      ["1.3", "Leak test and repair report", "item", "1", "1850.00"],
      ["1.4", "Replacement fasteners", "sum", "1", "1000.00", "PROVISIONAL_SUM"],
    ],
  },
];

const BQS: DemoBq[] = [
  { id: `${P}bqv1`, exerciseId: `${P}sx1`, reference: "DEMO/SX/0001/2026", versionNo: 1, status: "FINALISED", scopedBy: "IMPLEMENTING_DEPARTMENT", scope: "Renew the media and underdrain headers of the four rapid gravity filters at Bukit Demo plant.", followsStandard: true, excluded: true, createdOn: "2026-09-10", finalisedOn: "2026-09-12", sections: SX1_SECTIONS },
  { id: `${P}bqv2`, exerciseId: `${P}sx5`, reference: "DEMO/SX/0005/2026", versionNo: 1, status: "FINALISED", scopedBy: "IMPLEMENTING_DEPARTMENT", scope: "Re-roof the clear-water tank and replace its access fittings.", followsStandard: false, excluded: false, createdOn: "2026-09-18", finalisedOn: "2026-09-19", sections: SX5_V1 },
  { id: `${P}bqv3`, exerciseId: `${P}sx5`, reference: "DEMO/SX/0005/2026", versionNo: 2, status: "DRAFT", scopedBy: "IMPLEMENTING_DEPARTMENT", scope: "Re-roof the clear-water tank and replace its access fittings.", followsStandard: null, excluded: false, createdOn: "2026-09-30", revisionReason: "The roof was re-measured on site: 436 m², not 420.", sections: SX5_V2 },
  { id: `${P}bqv4`, exerciseId: `${P}sx15`, reference: "DEMO/SX/0015/2026", versionNo: 1, status: "FINALISED", scopedBy: "SPECIALIST_CONTRACTOR", scope: "Repair the cracked FRP panels of the sectional tank and reseal its joints, as scoped by the tank's maker on site.", followsStandard: true, excluded: null, createdOn: "2026-09-25", finalisedOn: "2026-09-26", sections: SX15_SECTIONS },
];

/**
 * FR-EST-004 (increment 2): one invented schedule, two issues. Issue 1 took effect on
 * 1 January 2026; issue 2 was issued on 28 September 2026 to take effect on 1 October 2026,
 * superseding issue 1 that day. sx5's roof lines were priced from issue 1 on 18 September and
 * keep its rates, in version 1 and in the draft revision copied from it (X-10 a: every act is
 * dated on or before the load day; only the effective day is a scheduled date).
 */
const RATE_LABEL = "Demo schedule of rates for tank works";
const RATE_ISSUES = [
  {
    id: `${P}rs1`, issueNo: 1, status: "SUPERSEDED" as const, effectiveFrom: "2026-01-01", issuedOn: "2025-12-15", supersededOn: "2026-09-28",
    items: [
      { id: `${P}rsi1`, code: "TK-01", descriptionEn: "Strip and dispose of roof sheeting", unit: "m²", rate: "18.50" },
      { id: `${P}rsi2`, code: "TK-02", descriptionEn: "Roof sheeting with insulation", unit: "m²", rate: "142.75" },
      { id: `${P}rsi3`, code: "TK-03", descriptionEn: "Stainless steel access hatch", unit: "nr", rate: "4150.00" },
      { id: `${P}rsi4`, code: "TK-04", descriptionEn: "Internal ladder with handrail", unit: "m", rate: "385.00" },
    ],
  },
  {
    id: `${P}rs2`, issueNo: 2, status: "ISSUED" as const, effectiveFrom: "2026-10-01", issuedOn: "2026-09-28", supersededOn: null,
    items: [
      { id: `${P}rsi5`, code: "TK-01", descriptionEn: "Strip and dispose of roof sheeting", unit: "m²", rate: "19.20" },
      { id: `${P}rsi6`, code: "TK-02", descriptionEn: "Roof sheeting with insulation", unit: "m²", rate: "148.00" },
      { id: `${P}rsi7`, code: "TK-03", descriptionEn: "Stainless steel access hatch", unit: "nr", rate: "4310.00" },
      { id: `${P}rsi8`, code: "TK-04", descriptionEn: "Internal ladder with handrail", unit: "m", rate: "398.00" },
    ],
  },
];
/// Lines priced from issue 1, by section and item: the schedule item's code.
const SCHEDULE_PRICED: Record<string, Record<string, string>> = { [`${P}bqs5`]: { "2.1": "TK-01", "2.2": "TK-02" }, [`${P}bqs8`]: { "2.1": "TK-01", "2.2": "TK-02" } };
const PRICED_ON = "2026-09-18";

const PREPARER = { id: `${P}p11`, name: "Nurul Izzah Kamal" };
const CUSTODIAN = { id: `${P}p3`, name: "Chen Wei Ling" };

export async function loadScope(db: Db, organisationId: string) {
  const audit: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", when: Date, changes: object[], reason = "") =>
    audit.push({ id: `${P}scau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });

  // ---------------------------------------------------------------- configuration
  const existing = await db.scopePolicy.findUnique({ where: { organisationId } });
  if (!existing) await db.scopePolicy.create({ data: { id: DEMO_POLICY_ID, organisationId, ...DEMO_SCOPE_POLICY, notes: "Demo scope rules, invented and assumed." } });
  else {
    const unset = Object.assign({}, ...DEMO_SCOPE_POLICY_GROUPS.filter((g) => groupIs(existing, g, (have) => have == null)));
    if (Object.keys(unset).length) await db.scopePolicy.update({ where: { id: existing.id }, data: unset });
  }
  await db.qualification.create({ data: { id: `${P}q1`, organisationId, code: "QQM", nameEn: "Qualified quantity measurer", nameMs: "Juruukur bahan bertauliah", governingSource: "Demo staff qualification register", provenance: "ASSUMED" } });
  await db.personQualification.create({ data: { id: `${P}pq1`, organisationId, personId: PREPARER.id, qualificationCode: "QQM", validFrom: day("2024-01-01"), evidenceNote: "Certificate on the personnel file (demo)." } });
  await db.specPanelColumn.createMany({
    data: [
      { id: `${P}spc1`, organisationId, code: "prepared", labelEn: "Prepared by", labelMs: "Disediakan oleh", orgUnitCode: "NTH", sortOrder: 1, provenance: "ASSUMED" },
      { id: `${P}spc2`, organisationId, code: "checked", labelEn: "Checked by", labelMs: "Disemak oleh", orgUnitCode: "CP", sortOrder: 2, provenance: "ASSUMED" },
      { id: `${P}spc3`, organisationId, code: "approved", labelEn: "Approved for issue by", labelMs: "Diluluskan untuk dikeluarkan oleh", orgUnitCode: "OPS", sortOrder: 3, provenance: "ASSUMED" },
    ],
  });
  await db.bqTemplate.create({ data: { id: `${P}bqt1`, organisationId, code: "pipe_laying", nameEn: "Pipe laying works", deliverableKind: "MEASURED_CONSTRUCTION", provenance: "ASSUMED" } });
  await db.bqTemplateSection.createMany({
    data: ["Preliminaries", "Site clearance", "Excavation and backfill", "Pipe laying", "Reinstatement", "Sums"].map((titleEn, i) => ({ id: `${P}bqts${i + 1}`, organisationId, templateId: `${P}bqt1`, number: String(i + 1), titleEn, sortOrder: i + 1 })),
  });
  // OD-6: the two rules, on the demo's own rows, assumed.
  const est = (ids: string[], value: boolean) => db.sourcingMethod.updateMany({ where: { id: { in: ids } }, data: { requiresCompanyEstimate: value, requiresCompanyEstimateProvenance: "ASSUMED" } });
  await est([`${P}sm1`, `${P}sm2`, `${P}sm5`, `${P}sm6`], true);
  await est([`${P}sm3`, `${P}sm7`, `${P}sm8`], false);
  // OD-9: scope approval by the Technical Committee for the specialist method only, assumed;
  // emergency left unset, so its exercises show the rule as not set.
  await db.sourcingMethod.update({ where: { id: `${P}sm8` }, data: { scopeApprovalRequired: true, scopeApprovalProvenance: "ASSUMED", scopeCommitteeCode: "TECH_CTTE", scopeAct: "A", scopeActProvenance: "ASSUMED" } });
  await db.sourcingMethod.updateMany({ where: { id: { in: [`${P}sm1`, `${P}sm2`, `${P}sm3`, `${P}sm4`, `${P}sm5`, `${P}sm6`, `${P}sm7`] } }, data: { scopeApprovalRequired: false, scopeApprovalProvenance: "ASSUMED" } });
  await db.contractBasis.update({ where: { id: `${P}cb1` }, data: { requiresBq: true, requiresBqProvenance: "ASSUMED" } });
  await db.contractBasis.update({ where: { id: `${P}cb2` }, data: { requiresBq: false, requiresBqProvenance: "ASSUMED" } });

  // ---------------------------------------------------------------- schedules of rates (increment 2)
  for (const r of RATE_ISSUES) {
    const title = `Schedule of rates · ${RATE_LABEL}, issue ${r.issueNo}`;
    await db.rateSchedule.create({
      data: {
        id: r.id, organisationId, label: RATE_LABEL, issueNo: r.issueNo, status: r.status, effectiveFrom: day(r.effectiveFrom), issuedOn: day(r.issuedOn), issuedByPersonId: CUSTODIAN.id,
        supersededOn: r.supersededOn ? day(r.supersededOn) : null, governingSource: "Demo circular on tank works rates (invented)", provenance: "ASSUMED", notes: "Invented demo rates, not a recommendation.", createdAt: at(`${r.issuedOn}T09:00`),
      },
    });
    entry(RATE_ENTITY.schedule, r.id, title, "CREATE", at(`${r.issuedOn}T09:00`), diffFields(null, { schedule: RATE_LABEL, issue: r.issueNo, status: "Draft", provenance: "ASSUMED", governingSource: "Demo circular on tank works rates (invented)" }));
    for (const [i, it] of r.items.entries()) {
      await db.rateScheduleItem.create({ data: { id: it.id, organisationId, scheduleId: r.id, code: it.code, descriptionEn: it.descriptionEn, unit: it.unit, rate: it.rate, sortOrder: i + 1 } });
      entry(RATE_ENTITY.item, it.id, `${title} · ${it.code}`, "CREATE", at(`${r.issuedOn}T09:0${i + 1}`), diffFields(null, { code: it.code, description: it.descriptionEn, unit: it.unit, rate: formatSen(parseSen(it.rate)) }));
    }
    entry(RATE_ENTITY.schedule, r.id, title, "UPDATE", at(`${r.issuedOn}T10:00`), diffFields({ status: "Draft" }, { status: "Issued", effectiveFrom: r.effectiveFrom, issuedOn: r.issuedOn, issuedBy: `${CUSTODIAN.name} (recorded on behalf of, not signed)`, items: r.items.length }));
    if (r.supersededOn) entry(RATE_ENTITY.schedule, r.id, title, "UPDATE", at(`${r.supersededOn}T10:00`), diffFields({ status: "Issued" }, { status: "Superseded", supersededBy: "issue 2", supersededOn: r.supersededOn }));
  }
  const rs1 = RATE_ISSUES[0];
  const scheduleOf = (sectionId: string, ref: string) => {
    const code = SCHEDULE_PRICED[sectionId]?.[ref];
    return code ? { code, item: rs1.items.find((x) => x.code === code)! } : null;
  };

  // ---------------------------------------------------------------- bills
  for (const b of BQS) {
    const lines = b.sections.flatMap((s) => s.items.map(line));
    const finalised = b.status !== "DRAFT";
    const totals = finalised ? totalsSnapshot(bqTotals(lines, b.excluded)) : null;
    const created = at(`${b.createdOn}T09:00`);
    await db.bqVersion.create({
      data: {
        id: b.id, organisationId, exerciseId: b.exerciseId, versionNo: b.versionNo, status: b.status, scopedBy: b.scopedBy, scopeStatement: b.scope, followsStandard: b.followsStandard,
        departuresText: b.followsStandard === false ? "Roof sheeting measured net of laps; hatches enumerated with their frames." : "",
        preparerPersonId: PREPARER.id, provisionalExcludedFromFirm: b.excluded, revisionReason: b.revisionReason ?? "", createdAt: created,
        ...(finalised
          ? { finalisedAt: at(`${b.finalisedOn}T15:00`), totalsSnapshot: totals!, standardLabelSnapshot: DEMO_SCOPE_POLICY.measurementStandardLabel, preparerQualificationSnapshot: { code: "QQM", name: "Qualified quantity measurer", validFrom: "2024-01-01", validTo: null, judgedOn: b.finalisedOn } }
          : {}),
      },
    });
    const vLabel = `${b.reference} · Bill of quantities v${b.versionNo}`;
    entry(ENTITY.bqVersion, b.id, vLabel, "CREATE", created, bqStatusAudit(null, "DRAFT", { version: b.versionNo, ...(b.revisionReason ? { revises: "version 1" } : {}) }), b.revisionReason ?? "");
    for (const [si, s] of b.sections.entries()) {
      await db.bqSection.create({ data: { id: s.id, organisationId, versionId: b.id, number: s.number, title: s.title, sortOrder: si + 1 } });
      // A revision's sections and lines are copied rows, each audited as created (startBqRevision).
      if (b.revisionReason) entry(ENTITY.bqSection, s.id, `${vLabel} · section ${s.number}`, "CREATE", created, sectionAudit(null, { number: s.number, title: s.title }));
      for (const [ii, it] of s.items.entries()) {
        const l = line(it);
        const amount = itemAmount(l.quantity, l.rate);
        const id = `${s.id}i${ii + 1}`;
        const sch = scheduleOf(s.id, l.itemRef);
        if (sch && parseSen(sch.item.rate) !== l.rate) throw new Error(`Demo line ${id} is said to be priced from the schedule at a rate the schedule does not give.`);
        const priced = sch
          ? { rateSource: "SCHEDULE" as const, rateScheduleId: rs1.id, rateItemCode: sch.code, scheduleLabelSnapshot: RATE_LABEL, scheduleIssueSnapshot: `Issue ${rs1.issueNo}`, scheduleEffectiveFromSnapshot: day(rs1.effectiveFrom) }
          : {};
        await db.bqItem.create({ data: { id, organisationId, sectionId: s.id, itemRef: l.itemRef, description: l.description, unit: l.unit, kind: l.kind, quantity: l.quantity, rate: senToDecimalString(l.rate!), amount: amount == null ? null : senToDecimalString(amount), provisional: l.provisional, sortOrder: ii + 1, ...priced } });
        const rateFrom = sch ? rateFromText({ label: RATE_LABEL, issue: `Issue ${rs1.issueNo}`, effectiveFrom: rs1.effectiveFrom, itemCode: sch.code }, formatDate) : undefined;
        entry(ENTITY.bqItem, id, `${b.reference} · Bill of quantities v${b.versionNo} · ${l.itemRef}`, "CREATE", sch && !b.revisionReason ? at(`${PRICED_ON}T11:00`) : created, itemAudit(null, { ...l, ...(rateFrom ? { rateFrom } : {}) }));
      }
    }
    if (finalised) entry(ENTITY.bqVersion, b.id, vLabel, "UPDATE", at(`${b.finalisedOn}T15:00`), bqFinalisedAudit(bqTotals(lines, b.excluded), { standard: DEMO_SCOPE_POLICY.measurementStandardLabel, preparerQualification: "Qualified quantity measurer" }));
  }

  // ---------------------------------------------------------------- panels
  const verifiers = [{ code: "prepared", label: "Prepared by", person: PREPARER }, { code: "checked", label: "Checked by", person: CUSTODIAN }, { code: "approved", label: "Approved for issue by", person: { id: `${P}p7`, name: "Gopal Nair" } }];
  const panels = [
    { id: `${P}spp1`, exerciseId: `${P}sx1`, reference: "DEMO/SX/0001/2026", bq: `${P}bqv1`, bqNo: 1, verified: "2026-09-14", columns: 3, scan: { versionId: `${P}doc7v1`, title: "Signed specification panel form, DEMO/SX/0001/2026" } },
    { id: `${P}spp5`, exerciseId: `${P}sx5`, reference: "DEMO/SX/0005/2026", bq: `${P}bqv2`, bqNo: 1, verified: "2026-09-22", columns: 3, scan: { versionId: `${P}doc8v1`, title: "Signed specification panel form, DEMO/SX/0005/2026" } },
    { id: `${P}spp3`, exerciseId: `${P}sx3`, reference: "DEMO/SX/0003/2026", bq: null, bqNo: null, verified: null, columns: 2, scan: null },
    // 6.4 (X-10 c): sx15's tender documents go for approval, so its panel is verified on its signed form.
    { id: `${P}spp15`, exerciseId: `${P}sx15`, reference: "DEMO/SX/0015/2026", bq: `${P}bqv4`, bqNo: 1, verified: "2026-09-27", columns: 3, scan: { versionId: `${P}doc10v1`, title: "Signed specification panel form, DEMO/SX/0015/2026" } },
  ];
  for (const p of panels) {
    const on = p.verified ?? "2026-09-24";
    await db.specificationPanel.create({
      data: {
        id: p.id, organisationId, exerciseId: p.exerciseId, contractKindOther: p.bq ? "Measured works on a bill of quantities" : "Works on drawings and specification", projectStatusOther: "New works",
        currentRevisionNo: "A", currentRevisionOn: day(on), completionPeriodText: p.bq ? "Twelve weeks" : "Sixteen weeks", bqVersionId: p.bq,
        status: p.verified ? "VERIFIED" : "DRAFT", verifiedAt: p.verified ? at(`${p.verified}T16:00`) : null,
        verifiedSnapshot: p.verified
          ? { columns: verifiers.map((v) => ({ code: v.code, label: v.label })), verifications: verifiers.map((v) => ({ column: v.label, person: v.person.name, verifiedOn: p.verified })), signatoryLimit: 6, signatoryLimitProvenance: "ASSUMED", scans: [{ versionId: p.scan!.versionId, title: p.scan!.title, versionNo: 1 }], bqVersionNo: p.bqNo }
          : undefined,
      },
    });
    entry(ENTITY.panel, p.id, `${p.reference} · Specification panel`, "CREATE", at(`${on}T09:00`), [{ field: "contractKindSpecified", before: null, after: p.bq ? "Measured works on a bill of quantities" : "Works on drawings and specification" }]);
    for (const [i, v] of verifiers.slice(0, p.columns).entries()) {
      const id = `${p.id}v${i + 1}`;
      await db.specPanelVerification.create({ data: { id, organisationId, panelId: p.id, columnCode: v.code, columnLabelSnapshot: v.label, personId: v.person.id, verifiedOn: day(on), recordedAt: at(`${on}T1${i}:00`) } });
      entry(ENTITY.verification, id, `${p.reference} · Specification panel · ${v.label}`, "CREATE", at(`${on}T1${i}:00`), verificationAudit({ column: v.label, personName: v.person.name, verifiedOn: on, note: "" }));
    }
    if (p.verified) entry(ENTITY.panel, p.id, `${p.reference} · Specification panel`, "UPDATE", at(`${p.verified}T16:00`), [{ field: "status", before: "Draft", after: "Verified" }]);
  }

  // ---------------------------------------------------------------- estimates (sealed)
  type V = { n: number; value: string; on: string; reason?: string };
  const estimates: { id: string; exerciseId: string; reference: string; preparer: { id: string; name: string }; state: "DRAFT" | "LODGED" | "VOID"; versions: V[]; lodged?: string; retained?: { on: string; place: string }; voided?: { on: string; reason: string } }[] = [
    { id: `${P}est1`, exerciseId: `${P}sx1`, reference: "DEMO/SX/0001/2026", preparer: PREPARER, state: "LODGED", versions: [{ n: 1, value: "291000.00", on: "2026-09-15" }, { n: 2, value: "294250.00", on: "2026-09-22", reason: "Actuator prices re-quoted by the nominated supplier." }], lodged: "2026-09-24", retained: { on: "2026-09-24", place: "Contract & Procurement strong room, cabinet 2" } },
    { id: `${P}est4`, exerciseId: `${P}sx5`, reference: "DEMO/SX/0005/2026", preparer: PREPARER, state: "LODGED", versions: [{ n: 1, value: "148600.00", on: "2026-09-26" }], lodged: "2026-09-29", retained: { on: "2026-09-29", place: "Contract & Procurement strong room, cabinet 2" } },
    { id: `${P}est2`, exerciseId: `${P}sx3`, reference: "DEMO/SX/0003/2026", preparer: { id: `${P}p4`, name: "Daniel Anak Jelani" }, state: "VOID", versions: [{ n: 1, value: "431000.00", on: "2026-09-16" }], voided: { on: "2026-09-23", reason: "The preparer moved to the Southern Region office before the estimate was lodged." } },
    { id: `${P}est3`, exerciseId: `${P}sx3`, reference: "DEMO/SX/0003/2026", preparer: { id: `${P}p5`, name: "Eng Siew Mei" }, state: "DRAFT", versions: [{ n: 1, value: "428500.00", on: "2026-09-25" }] },
  ];
  let ev = 0;
  for (const e of estimates) {
    const created = at(`${e.versions[0].on}T10:00`);
    const last = e.versions[e.versions.length - 1];
    await db.companyEstimate.create({
      data: {
        id: e.id, organisationId, exerciseId: e.exerciseId, preparerPersonId: e.preparer.id, classification: "SULIT", state: e.state, currentVersionNo: last.n, createdAt: created,
        lodgedAt: e.lodged ? at(`${e.lodged}T11:00`) : null, retainedPlace: e.retained?.place ?? "", voidedAt: e.voided ? at(`${e.voided.on}T12:00`) : null, voidReason: e.voided?.reason ?? "",
      },
    });
    const label = `${e.reference} · Company estimate`;
    entry(ENTITY.estimate, e.id, label, "CREATE", created, estimateCreatedAudit({ preparerName: e.preparer.name, classification: "SULIT" }));
    const { estimateEventLabel } = await import("../src/lib/audit/entity-labels");
    const event = async (kind: "PREPARED" | "AMENDED" | "LODGED" | "RETAINED" | "VOIDED", when: Date, x: { person?: { id: string; name: string } | null; capacity?: string; versionNo?: number; copyNo?: number; note?: string } = {}) => {
      const id = `${P}esev${++ev}`;
      await db.estimateEvent.create({ data: { id, organisationId, estimateId: e.id, kind, personId: x.person?.id ?? null, capacity: x.capacity ?? "", note: x.note ?? "", versionNo: x.versionNo ?? null, copyNo: x.copyNo ?? null, at: when } });
      entry(ENTITY.estimateEvent, id, `${e.reference} · ${estimateEventLabel(kind)}`, "CREATE", when, estimateEventAudit({ kind, personName: x.person?.name ?? null, capacity: x.capacity, versionNo: x.versionNo, copyNo: x.copyNo, place: kind === "RETAINED" ? x.note : undefined, reason: kind === "VOIDED" ? x.note : undefined }), kind === "VOIDED" ? x.note ?? "" : "");
    };
    for (const v of e.versions) {
      const id = `${e.id}v${v.n}`;
      const when = at(`${v.on}T10:00`);
      // The figure and the reason, written; never printed, never in a trail (ADR 0012).
      await db.companyEstimateVersion.create({ data: { id, organisationId, estimateId: e.id, versionNo: v.n, value: v.value, preparedOn: day(v.on), preparerPersonId: e.preparer.id, reason: v.reason ?? "", bqVersionId: e.exerciseId === `${P}sx1` ? `${P}bqv1` : e.exerciseId === `${P}sx5` ? `${P}bqv2` : null, createdAt: when } });
      entry(ENTITY.estimateVersion, id, `${label} · version ${v.n}`, "CREATE", when, estimateVersionAudit({ versionNo: v.n, preparerName: e.preparer.name, preparedOn: v.on }));
      await event(v.n === 1 ? "PREPARED" : "AMENDED", when, { person: e.preparer, capacity: "Preparer", versionNo: v.n });
    }
    if (e.lodged) {
      const when = at(`${e.lodged}T11:00`);
      entry(ENTITY.estimate, e.id, label, "UPDATE", when, estimateStateAudit("Being prepared", "Lodged"));
      await event("LODGED", when, { person: CUSTODIAN, capacity: "Custodian, Head of Contract & Procurement", versionNo: last.n, copyNo: 1 });
    }
    if (e.retained) await event("RETAINED", at(`${e.retained.on}T11:30`), { person: CUSTODIAN, capacity: "Custodian, Head of Contract & Procurement", versionNo: last.n, copyNo: 2, note: e.retained.place });
    if (e.voided) {
      const when = at(`${e.voided.on}T12:00`);
      entry(ENTITY.estimate, e.id, label, "UPDATE", when, estimateStateAudit("Being prepared", "Void"), e.voided.reason);
      await event("VOIDED", when, { person: CUSTODIAN, versionNo: last.n, note: e.voided.reason });
    }
  }
  await db.auditEntry.createMany({ data: audit as never });
}

// ------------------------------------------------------------------ the load's own check (X-10 c)

/**
 * Every 6.2 row the demo loaded passes the checks of its act, judged by the product's own
 * rules on the rows as stored (after the documents are attached). Throws on the first that
 * does not, naming it: a demo that contradicts its own rules is worse than none.
 */
export async function checkScope() {
  const { finaliseFaults } = await import("../src/lib/scope/bq");
  const { panelFaults } = await import("../src/lib/scope/panel");
  const { packFaults } = await import("../src/lib/scope/pack");
  const { scopeApproval, scopeCitationFault } = await import("../src/lib/scope/scope-matter");
  const { priceFromSchedule } = await import("../src/lib/scope/rates");
  const { parseBqCsv } = await import("../src/lib/scope/csv");
  const { versionFaults } = await import("../src/lib/scope/estimate");
  const repo = await import("../src/lib/scope/repo");
  const { exerciseOrg } = await import("../src/lib/method/repo");
  const { panelState } = await import("../src/lib/scope/panel");
  const { checkTabling, secretariatHoldersOn } = await import("../src/lib/committee/tabling");
  const { loadRoster } = await import("../src/lib/people/load");
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const { lodgementBehind } = await import("../src/lib/scope/estimate");
  const { blocking } = await import("../src/lib/scope/types");
  const { db: lib } = await import("../src/lib/db");
  const org = (await exerciseOrg(await demoOrgId()))!;
  const policy = await repo.loadScopePolicy(org.id);
  const qualifications = await repo.loadQualifications(org.id);
  const holdings = await repo.loadHoldings(org.id);
  // The configuration each act was judged under is the demo's own: a column added for real
  // since (with no start day of its own) was not on the form the demo's panels were signed on.
  const columns = (await repo.loadPanelColumns(org.id)).filter((c) => c.id.startsWith(P));
  const fail = (what: string, fs: readonly { code: string; level: string }[]) => {
    const b = fs.filter((f) => f.level === "block");
    if (b.length) throw new Error(`Demo ${what} fails its own check: ${b.map((f) => f.code).join(", ")}`);
  };
  for (const exerciseId of [`${P}sx1`, `${P}sx3`, `${P}sx5`, `${P}sx15`]) {
    const ex = await lib.sourcingExercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { status: true, sourcingMethodCode: true, contractBasisCode: true } });
    const versions = await repo.loadBqVersions(exerciseId);
    for (const v of versions.filter((x) => x.status !== "DRAFT")) {
      const on = v.finalisedAt!.toISOString().slice(0, 10);
      fail(`bill ${exerciseId} v${v.versionNo}`, finaliseFaults({ status: "DRAFT", scopedBy: v.scopedBy, followsStandard: v.followsStandard, departuresText: v.departuresText, preparerPersonId: v.preparerPersonId, lines: repo.linesOf(v), sectionNumbers: v.sections.map((s) => s.number) }, { policy, holdings, qualifications, today: on, exerciseStatus: ex.status }));
    }
    const panel = await repo.loadPanel(exerciseId);
    const rules = await repo.loadScopeRules(org.id, ex);
    if (panel?.status === "VERIFIED") {
      fail(`panel ${exerciseId}`, panelFaults({ ...panel, bq: panel.bqVersion }, { columns, policy, today: panel.verifiedAt!.toISOString().slice(0, 10), exerciseStatus: ex.status, bqRequired: rules.basis?.requiresBq ?? null }));
      // BD-62-26: a verified demo panel stands on a live scan its snapshot names.
      if (panelState(panel) !== "VERIFIED") throw new Error(`Demo panel ${exerciseId} reads ${panelState(panel)}: its snapshot names no live scan.`);
    }
    const estimates = await repo.loadEstimates(exerciseId);
    for (const e of estimates) {
      for (const v of e.versions) {
        fail(`estimate ${e.id} v${v.versionNo}`, versionFaults({ value: 1n, personId: v.preparerPersonId, reason: v.versionNo === 1 ? "" : "sealed" }, v.versionNo === 1 ? null : { state: "DRAFT", preparerPersonId: e.preparerPersonId }, { closingAt: null, timeZone: org.timeZone, exerciseStatus: ex.status, now: v.createdAt }));
      }
    }
    if (exerciseId === `${P}sx15`) {
      // X-4: the scope matter was citable when it was tabled, and its decision approves the finalised bill.
      const matters = await repo.loadScopeMatters(exerciseId);
      const bill = versions.find((v) => v.id === `${P}bqv4`)!;
      // X-10 c: demo_d40 passes the act's own checks as tableScope runs them — the citation at
      // its own sitting (of its committee, not yet minuted on the tabling day) against the
      // matters before it, and the Secretariat holder rule on the tabling day.
      const d40 = await lib.committeeDecision.findUniqueOrThrow({
        where: { id: `${P}d40` },
        select: { tabledAt: true, tabledByPersonId: true, act: true, meeting: { select: { minutedAt: true, committee: { select: { code: true, secretariatRoleCode: true } } } } },
      });
      if (!d40.tabledAt) throw new Error("Demo demo_d40 has no tabling day.");
      const tabledOn = d40.tabledAt.toISOString().slice(0, 10);
      const frozen = d40.meeting.minutedAt != null && d40.meeting.minutedAt.getTime() <= d40.tabledAt.getTime();
      fail("sx15's scope tabling (demo_d40)", scopeCitationFault({ exercise: { id: exerciseId, status: ex.status }, rule: rules.method, version: bill, sitting: { committeeCode: d40.meeting.committee.code, frozen }, act: d40.act, matters: matters.filter((m) => m.id !== `${P}d40`) }));
      const secretariat = d40.meeting.committee.secretariatRoleCode;
      const roster = await loadRoster(ORGANISATION_CODE);
      const tabling = checkTabling({ secretariatRoleCode: secretariat, tabledByPersonId: d40.tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(roster, secretariat, tabledOn).map((h) => h.id), tablingDay: tabledOn });
      if (!tabling.ok) throw new Error(`Demo demo_d40 fails its tabling check: ${tabling.fault}`);
      const state = scopeApproval(rules.method, versions, matters).state;
      if (state !== "APPROVED") throw new Error(`Demo sx15's scope reads ${state}, not approved.`);
      // Q-3: the file it was imported from reads back, with the product's rule, as the bill's lines.
      const file = await lib.documentAttachment.findFirst({ where: { bqVersionId: bill.id, purpose: "BQ_IMPORT_SOURCE", detachedAt: null }, select: { version: { select: { sha256: true } } } });
      const blob = file ? await lib.blobContent.findFirst({ where: { sha256: file.version.sha256 } }) : null;
      const same = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      const parsed = blob ? parseBqCsv(Buffer.from(blob.bytes).toString("utf8")) : null;
      if (!parsed || parsed.faults.some((f) => f.level === "block") || same(parsed.sections.flatMap((x) => x.items)) !== same(repo.linesOf(bill))) {
        throw new Error("Demo sx15's imported file does not read back as its bill's lines.");
      }
    }
    if (exerciseId === `${P}sx5`) {
      // FR-EST-004: each schedule-priced line is what the issue in force on its pricing day gave.
      const issues = await repo.loadRateIssues(org.id);
      for (const v of versions) for (const sec of v.sections) for (const it of sec.items.filter((i) => i.rateSource === "SCHEDULE")) {
        const p = priceFromSchedule(issues, it.scheduleLabelSnapshot ?? "", it.rateItemCode ?? "", PRICED_ON);
        if (!p.ok || p.priced.rateScheduleId !== it.rateScheduleId || p.priced.rate !== parseSen(it.rate!.toString())) throw new Error(`Demo line ${it.id} is not what its schedule gave on ${PRICED_ON}.`);
      }
    }
    if (exerciseId === `${P}sx5`) {
      // X-10 c: 6.4 builds its pack v1 on sx5, so its scope must be ready but for scope approval.
      const live = estimates.find((x) => x.state !== "VOID");
      const facts = live ? repo.estimateFactsOf(live) : null;
      const scope = scopeApproval(rules.method, versions, await repo.loadScopeMatters(exerciseId)).state;
      const f = packFaults({ basis: rules.basis, method: rules.method, bq: versions, specPanelUsed: true, onScreenBillUsed: true, panel: panelState(panel), panelBill: panel?.bqVersion ?? null, estimate: facts ? { state: facts.state, behind: lodgementBehind(facts) } : null, scope });
      fail("sx5's readiness for 6.4", blocking(f));
    }
  }
}

// ------------------------------------------------------------------ increment 2: the scope matter (X-4)

/**
 * demo_sx15's finalised bill (version 1, finalised 26 September) tabled for scope approval as
 * SCOPE matter demo_d40 at the Technical Committee's sitting demo_mt11 (X-4), carried. Tabled
 * on 28 September by the Secretariat's holder, decided at the sitting on 30 September and
 * minuted on 1 October, the load day (X-10 a). The committee's quorum, voting rule and seats are
 * set with it, in demo.ts. Its History is written by the sitting trail, as tableScope and the
 * sitting acts write it. Returns the sitting, for the trail and the register snapshot.
 */
export async function loadScopeSitting(db: Db): Promise<string[]> {
  const mt = `${P}mt11`;
  await db.meeting.create({
    data: {
      id: mt, committeeId: `${P}c4`, reference: "DEMO/TC/1/2026", meetingDate: day("2026-09-30"), status: "MINUTED", minutedAt: day("2026-10-01"),
      agenda: "Scope of the FRP tank repair by its manufacturer (DEMO/SX/0015/2026).",
      minutes: "The Committee examined the manufacturer's scope of repair and its bill of quantities, version 1, and approved the scope as tabled.",
    },
  });
  await db.meetingAttendance.createMany({
    data: [
      { id: `${P}at40`, meetingId: mt, personId: `${P}p1`, attended: true },
      { id: `${P}at41`, meetingId: mt, personId: `${P}p2`, attended: true },
      { id: `${P}at42`, meetingId: mt, personId: `${P}p3`, attended: true },
    ],
  });
  await db.committeeDecision.create({
    data: {
      id: `${P}d40`, meetingId: mt, sequence: 1, domain: "scope_approval", matterKind: "SCOPE", matterRef: "DEMO/SX/0015/2026", bqVersionId: `${P}bqv4`,
      subject: scopeMatterSubject("FRP tank repair by its manufacturer", 1), act: "A", tabledByPersonId: `${P}p3`, tabledAt: day("2026-09-28"),
      outcome: "CARRIED", decisionDate: day("2026-09-30"), quorumRequired: 2, presentVoters: 2, recusedCount: 0, votingRule: "SIMPLE_MAJORITY", votingRuleProvenance: "ASSUMED",
    },
  });
  await db.vote.createMany({
    data: [
      { id: `${P}v40`, decisionId: `${P}d40`, personId: `${P}p1`, choice: "SETUJU", votedAt: day("2026-09-30"), recordedAt: day("2026-09-30") },
      { id: `${P}v41`, decisionId: `${P}d40`, personId: `${P}p2`, choice: "SETUJU", votedAt: day("2026-09-30"), recordedAt: day("2026-09-30") },
    ],
  });
  return [mt];
}

/// The bill sx15's version 1 was imported from (Q-3): the specialist's priced CSV, built by the
/// product's own export from the same lines, so the file and the bill agree to the sen.
export async function sx15BillCsv(): Promise<string> {
  const { bqToCsv } = await import("../src/lib/scope/csv");
  return bqToCsv({ versionNo: 1, sections: SX15_SECTIONS.map((s) => ({ number: s.number, title: s.title, items: s.items.map(line) })) }, { priced: true });
}
