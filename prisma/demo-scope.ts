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
 *   finalised. Its scope matter (demo_d40 at demo_mt11, Technical Committee) needs
 *   MatterKind.SCOPE and arrives with increment 2 (BD-62-9).
 * - demo_sx2, sx4 and sx7 keep no bill, panel or estimate: the empty states.
 *
 * Estimate versions are written with their figures (the demo's own client has no omit) and
 * nothing here prints them; their audit rows read "Sealed (version N)" (ADR 0012).
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { estimateCreatedAudit, estimateEventAudit, estimateStateAudit, estimateVersionAudit, bqStatusAudit, itemAudit, verificationAudit, ENTITY, SCOPE_ENTITIES } from "../src/lib/scope/audit-view";
import { bqTotals, itemAmount, totalsSnapshot } from "../src/lib/scope/bq";
import { parseSen, senToDecimalString } from "../src/lib/money";
import type { BqItemKind, BqLine } from "../src/lib/scope/types";

type Db = PrismaClient;
const P = "demo_";
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}:00.000Z`);
const demoRef = { startsWith: P };

export { SCOPE_ENTITIES };

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
      id: `${P}sx15`, organisationId, reference: "DEMO/SX/0015/2026", requisitionId: `${P}rq14`, title: "FRP tank repair by its manufacturer", estimatedValue: "18000.00",
      sourcingMethodCode: "specialist", contractBasisCode: "bq", createdAt: day("2026-09-24"),
      methodReason: "The sectional tank's maker alone holds its panel moulds and repair warranty.",
      justificationReasonCode: "continuity", justificationText: "Repairs by anyone else void the tank's warranty; the maker inspected and scoped the repair on site on 22 September 2026.",
    },
  });
  await db.exerciseScopePart.create({ data: { id: `${P}sx15p1`, exerciseId: `${P}sx15`, deliverableKind: "MEASURED_CONSTRUCTION", amount: "18000.00", description: "FRP panel repair and resealing", sortOrder: 1 } });
  await db.numberingSeries.update({ where: { id: `${P}n5` }, data: { nextSerial: 16 } });
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
      ["2.1", "Remove and dispose of spent filter media", "m3", "64.5", "210.00"],
      ["2.2", "Supply and place graded filter media", "m3", "64.5", "1840.00"],
      ["2.3", "Replace underdrain headers", "nr", "24", "3275.50"],
      ["2.4", "Make good filter bed concrete", "m2", "18", "412.25", "MEASURED", true],
    ],
  },
  { id: `${P}bqs3`, number: "3", title: "Sums", items: [["3.1", "Valve actuators, nominated supply", "sum", "1", "32000.00", "PRIME_COST_SUM"], ["3.2", "Contingencies", "sum", "1", "15000.00", "PROVISIONAL_SUM"]] },
];

const SX5_V1: DemoBq["sections"] = [
  { id: `${P}bqs4`, number: "1", title: "Preliminaries", items: [["1.1", "Access, scaffolding and protection of the tank", "item", "1", "9800.00"]] },
  {
    id: `${P}bqs5`, number: "2", title: "Roof and fittings", items: [
      ["2.1", "Strip and dispose of roof sheeting", "m2", "420", "18.50"],
      ["2.2", "New roof sheeting with insulation", "m2", "420", "142.75"],
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
      ["1.1", "Repair damaged FRP panels", "m2", "12", "960.00"],
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

const PREPARER = { id: `${P}p11`, name: "Nurul Izzah Kamal" };
const CUSTODIAN = { id: `${P}p3`, name: "Chen Wei Ling" };

export async function loadScope(db: Db, organisationId: string) {
  const audit: { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean }[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE", when: Date, changes: object[], reason = "") =>
    audit.push({ id: `${P}scau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, unattributed: true });

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
  await db.contractBasis.update({ where: { id: `${P}cb1` }, data: { requiresBq: true, requiresBqProvenance: "ASSUMED" } });
  await db.contractBasis.update({ where: { id: `${P}cb2` }, data: { requiresBq: false, requiresBqProvenance: "ASSUMED" } });

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
      for (const [ii, it] of s.items.entries()) {
        const l = line(it);
        const amount = itemAmount(l.quantity, l.rate);
        const id = `${s.id}i${ii + 1}`;
        await db.bqItem.create({ data: { id, organisationId, sectionId: s.id, itemRef: l.itemRef, description: l.description, unit: l.unit, kind: l.kind, quantity: l.quantity, rate: senToDecimalString(l.rate!), amount: amount == null ? null : senToDecimalString(amount), provisional: l.provisional, sortOrder: ii + 1 } });
        if (!b.revisionReason) entry(ENTITY.bqItem, id, `${b.reference} · Bill of quantities v${b.versionNo} · ${l.itemRef}`, "CREATE", created, itemAudit(null, l));
      }
    }
    if (finalised) entry(ENTITY.bqVersion, b.id, vLabel, "UPDATE", at(`${b.finalisedOn}T15:00`), bqStatusAudit("DRAFT", "FINALISED", { total: totals!.total, buildersWorks: totals!.buildersWorks, firmValue: totals!.firmValue ?? "Not stated", standard: DEMO_SCOPE_POLICY.measurementStandardLabel, preparerQualification: "Qualified quantity measurer" }));
  }

  // ---------------------------------------------------------------- panels
  const verifiers = [{ code: "prepared", label: "Prepared by", person: PREPARER }, { code: "checked", label: "Checked by", person: CUSTODIAN }, { code: "approved", label: "Approved for issue by", person: { id: `${P}p7`, name: "Gopal Nair" } }];
  const panels = [
    { id: `${P}spp1`, exerciseId: `${P}sx1`, reference: "DEMO/SX/0001/2026", bq: `${P}bqv1`, bqNo: 1, verified: "2026-09-14", columns: 3, scan: { versionId: `${P}doc7v1`, title: "Signed specification panel form, DEMO/SX/0001/2026" } },
    { id: `${P}spp5`, exerciseId: `${P}sx5`, reference: "DEMO/SX/0005/2026", bq: `${P}bqv2`, bqNo: 1, verified: "2026-09-22", columns: 3, scan: { versionId: `${P}doc8v1`, title: "Signed specification panel form, DEMO/SX/0005/2026" } },
    { id: `${P}spp3`, exerciseId: `${P}sx3`, reference: "DEMO/SX/0003/2026", bq: null, bqNo: null, verified: null, columns: 2, scan: null },
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
    const event = async (kind: "PREPARED" | "AMENDED" | "LODGED" | "RETAINED" | "VOIDED", when: Date, x: { person?: { id: string; name: string } | null; capacity?: string; versionNo?: number; copyNo?: number; note?: string } = {}) => {
      const id = `${P}esev${++ev}`;
      await db.estimateEvent.create({ data: { id, organisationId, estimateId: e.id, kind, personId: x.person?.id ?? null, capacity: x.capacity ?? "", note: x.note ?? "", versionNo: x.versionNo ?? null, copyNo: x.copyNo ?? null, at: when } });
      entry(ENTITY.estimateEvent, id, `${label} · ${kind.toLowerCase().replace("voided", "voided")}`, "CREATE", when, estimateEventAudit({ kind, personName: x.person?.name ?? null, capacity: x.capacity, versionNo: x.versionNo, copyNo: x.copyNo, place: kind === "RETAINED" ? x.note : undefined, reason: kind === "VOIDED" ? x.note : undefined }), kind === "VOIDED" ? x.note ?? "" : "");
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
  const { versionFaults } = await import("../src/lib/scope/estimate");
  const repo = await import("../src/lib/scope/repo");
  const { exerciseOrg } = await import("../src/lib/method/repo");
  const { panelState } = await import("../src/lib/scope/panel");
  const { lodgementBehind } = await import("../src/lib/scope/estimate");
  const { blocking } = await import("../src/lib/scope/types");
  const { db: lib } = await import("../src/lib/db");
  const org = (await exerciseOrg())!;
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
      fail(`bill ${exerciseId} v${v.versionNo}`, finaliseFaults({ status: "DRAFT", scopedBy: v.scopedBy, followsStandard: v.followsStandard, departuresText: v.departuresText, preparerPersonId: v.preparerPersonId, lines: repo.linesOf(v) }, { policy, holdings, qualifications, today: on, exerciseStatus: ex.status }));
    }
    const panel = await repo.loadPanel(exerciseId);
    const rules = await repo.loadScopeRules(org.id, ex);
    if (panel?.status === "VERIFIED") {
      fail(`panel ${exerciseId}`, panelFaults({ ...panel, bq: panel.bqVersion }, { columns, policy, today: panel.verifiedAt!.toISOString().slice(0, 10), exerciseStatus: ex.status, bqRequired: rules.basis?.requiresBq ?? null }));
    }
    const estimates = await repo.loadEstimates(exerciseId);
    for (const e of estimates) {
      for (const v of e.versions) {
        fail(`estimate ${e.id} v${v.versionNo}`, versionFaults({ value: 1n, personId: v.preparerPersonId, reason: v.versionNo === 1 ? "" : "sealed" }, v.versionNo === 1 ? null : { state: "DRAFT", preparerPersonId: e.preparerPersonId }, { closingAt: null, timeZone: org.timeZone, exerciseStatus: ex.status, now: v.createdAt }));
      }
    }
    if (exerciseId === `${P}sx5`) {
      // X-10 c: 6.4 builds its pack v1 on sx5, so its scope must be ready but for scope approval.
      const live = estimates.find((x) => x.state !== "VOID");
      const facts = live ? repo.estimateFactsOf(live) : null;
      const f = packFaults({ basis: rules.basis, method: rules.method, bq: versions, panel: panelState(panel), estimate: facts ? { state: facts.state, behind: lodgementBehind(facts) } : null });
      fail("sx5's readiness for 6.4", blocking(f));
    }
  }
}

// ------------------------------------------------------------------ wipe

/**
 * Remove 6.2's rows on the demo's exercises and on the exercises removed with it, whatever
 * their ids (recorded through the screens on a demo exercise, they belong to it), with their
 * audit entries; then the demo's configuration, and the policy's demo values where they still
 * hold them. Runs after the documents (a panel's scan pins it) and before the exercises.
 * Holdings that name a demo person go too: their person goes (listed by the wipe first).
 */
export async function wipeScope(db: Db, organisationId: string, exerciseIds: readonly string[]) {
  const onEx = { OR: [{ exerciseId: demoRef }, { exerciseId: { in: [...exerciseIds] } }] };
  const versions = await db.bqVersion.findMany({ where: onEx, select: { id: true, sections: { select: { id: true, items: { select: { id: true } } } } } });
  const panels = await db.specificationPanel.findMany({ where: onEx, select: { id: true, verifications: { select: { id: true } } } });
  const estimates = await db.companyEstimate.findMany({ where: onEx, select: { id: true, versions: { select: { id: true } }, events: { select: { id: true } } } });
  const ids = [
    ...versions.flatMap((v) => [v.id, ...v.sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)])]),
    ...panels.flatMap((p) => [p.id, ...p.verifications.map((v) => v.id)]),
    ...estimates.flatMap((e) => [e.id, ...e.versions.map((v) => v.id), ...e.events.map((v) => v.id)]),
  ];
  const estimateIds = estimates.map((e) => e.id);
  await db.estimateEvent.deleteMany({ where: { estimateId: { in: estimateIds } } });
  await db.companyEstimateVersion.deleteMany({ where: { estimateId: { in: estimateIds } } });
  await db.companyEstimate.deleteMany({ where: { id: { in: estimateIds } } });
  await db.specPanelVerification.deleteMany({ where: { panelId: { in: panels.map((p) => p.id) } } });
  await db.specificationPanel.deleteMany({ where: { id: { in: panels.map((p) => p.id) } } });
  const versionIds = versions.map((v) => v.id);
  await db.bqItem.deleteMany({ where: { section: { versionId: { in: versionIds } } } });
  await db.bqSection.deleteMany({ where: { versionId: { in: versionIds } } });
  await db.bqVersion.deleteMany({ where: { id: { in: versionIds } } });
  if (ids.length) await db.auditEntry.deleteMany({ where: { organisationId, entityId: { in: ids } } });

  // Configuration the demo created.
  const holdings = await db.personQualification.findMany({ where: { organisationId, OR: [{ id: demoRef }, { personId: demoRef }] }, select: { id: true } });
  await db.personQualification.deleteMany({ where: { id: { in: holdings.map((h) => h.id) } } });
  if (holdings.length) await db.auditEntry.deleteMany({ where: { organisationId, entityId: { in: holdings.map((h) => h.id) } } });
  await db.specPanelColumn.deleteMany({ where: { id: demoRef } });
  await db.bqTemplateSection.deleteMany({ where: { OR: [{ id: demoRef }, { templateId: demoRef }] } });
  await db.bqTemplate.deleteMany({ where: { id: demoRef } });
  await db.qualification.deleteMany({ where: { id: demoRef } });
  const policy = await db.scopePolicy.findUnique({ where: { organisationId } });
  if (policy) {
    const row = policy as Record<string, unknown>;
    const demoGroups = DEMO_SCOPE_POLICY_GROUPS.filter((g) => groupIs(row, g, (have, want) => have === want));
    const cleared = Object.fromEntries(demoGroups.flatMap((g) => Object.keys(g)).map((f) => [f, null]));
    const left = Object.entries(row).filter(([f, v]) => !["id", "organisationId", "notes", "updatedAt"].includes(f) && !(f in cleared) && v != null);
    if (policy.id === DEMO_POLICY_ID && left.length === 0) await db.scopePolicy.delete({ where: { id: policy.id } });
    else {
      if (Object.keys(cleared).length) await db.scopePolicy.update({ where: { id: policy.id }, data: cleared });
      // A demo row someone has since given real values keeps them, under an id that is not the demo's.
      if (policy.id === DEMO_POLICY_ID) {
        const kept = `scope_policy_${Date.now().toString(36)}`;
        await db.scopePolicy.update({ where: { id: policy.id }, data: { id: kept } });
        await db.auditEntry.updateMany({ where: { entity: "ScopePolicy", entityId: policy.id }, data: { entityId: kept } });
        console.log("The scope policy was changed after the demo loaded, so it was kept.");
      }
    }
  }
}

/// Holdings recorded through the screens for demo people (not demo data): listed by the wipe, removed with --remove-dependents.
export async function screenHoldingsOnDemo(db: Db, organisationId: string) {
  return db.personQualification.findMany({ where: { organisationId, NOT: { id: demoRef }, personId: demoRef }, select: { id: true, person: { select: { name: true } }, qualificationCode: true } });
}
