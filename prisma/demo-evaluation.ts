/**
 * Demo data for 6.8: evaluation (plan §6, as ruled: E-12, X-4, X-10). Invented throughout; every
 * configured value is ASSUMED and none is a customer's figure, word or source (X-10 d: no 60/40, 70/60,
 * ±15%, 3%/5% or 85.01 anywhere here). Every row passes the checks of its act, judged by the product's
 * own functions on the rows as they stand when it is written, through the context the actions read
 * (`loadEvaluationContext`); every act is dated relative to the load day and never after now (X-10 a, b).
 *
 * - Configuration (dated W(16), before any demo publication, so each publication pins a model):
 *   aspects demo_eva1–4 (the four FR-EVL-003 kinds, required on the traditional route); models
 *   demo_evm1 "Demo weighted tender model" (technical 70 / financial 30, pass marks 65 and 55, a
 *   composite pass mark of 60; factors 4.5% and 7%; a minimum-capital band set judged on the floor) and
 *   demo_evm2 "Demo phased quotation model" (technical, a shortlist of 2 to 3, the minimum capital at
 *   4% or 6% of the company estimate, the price within 12% of the estimate as a guide, aspects); each
 *   issued with `modelSnapshot`. The policy demo_evp1: the report series demo_n20 "DEMO/EVR", the
 *   report and Kertas Cadangan templates demo_dt20–21, two places, checked by the Head of Contract &
 *   Procurement, recommended by the Finance Director. Both contract bases evaluate on the traditional
 *   route; the open tender suggests demo_evm1, the quotations demo_evm2.
 * - demo_sx16 (the open tender, Opened by 6.7's demo with five bids carried): evaluated on the load day:
 *   the team, every score, the financial inputs, three stages submitted, the aspects, the composite,
 *   the recommendation of Contoh Bina (top-ranked; the bid the 6.6 extension's consent came from), the
 *   report issued (consent CHECKED), the Kertas Cadangan produced, checked and recommended by two
 *   people; the appointment tabled as demo_d43 at the Tender Board's sitting demo_mt14 (attendance
 *   demo_at64–67; demo_at60–63 were 6.6's), PENDING: the award waits for the Board.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { dayIn, dayToDate, instantAt, storedDay, todayIn } from "../src/lib/dates";
import { formatDate } from "../src/lib/format";
import { parseSen, senFromDecimal, senToDecimalString } from "../src/lib/money";
import { calendarOf } from "./demo-window";

type Db = PrismaClient;
const P = "demo_";
const demoRef = { startsWith: P };
type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE" | "DELETE"; at: Date; changes: object[]; reason: string; unattributed: boolean };
type Add = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason?: string) => void;

/// The demo's issued model for each pack kind: what the Window card's choice takes in 6.5's demo (E-12).
export const EVALUATION_MODEL_FOR = { TENDER: `${P}evm1`, QUOTATION: `${P}evm2` } as const;
export const EVALUATION_DEMO_IDS = { models: [`${P}evm1`, `${P}evm2`], policy: `${P}evp1`, sitting: `${P}mt14`, matter: `${P}d43`, attendance: [`${P}at64`, `${P}at65`, `${P}at66`, `${P}at67`], evaluations: [`${P}evl1`, `${P}evl2`], negotiationRoute: `${P}ai90` } as const;

const HOD_CP = { id: `${P}p3`, name: "Chen Wei Ling" };
const FD = { id: `${P}p2`, name: "Bala Krishnan" };
const IMPLEMENTING = [{ id: `${P}p15`, name: "Mohd Rizal Ahmad" }];
const PROCUREMENT = [{ id: `${P}p14`, name: "Kumar Selvam" }];
const SOURCE = "Demo evaluation guide (invented)";

function refuse(what: string, fs: readonly { code: string; level: string }[]) {
  const b = fs.filter((f) => f.level === "block");
  if (b.length) throw new Error(`Demo 6.8 ${what} refused: ${b.map((f) => f.code).join(", ")}`);
}
const fail = (what: string): never => {
  throw new Error(`Demo 6.8: ${what}.`);
};

// ------------------------------------------------------------------ configuration

type BandDef = { labelEn: string; lower?: string; lowerInclusive?: boolean; lowerIsFloor?: boolean; upper?: string; upperInclusive?: boolean; upperIsFloor?: boolean; outcome: "PASS" | "FAIL" | "NONE" };
type CritDef = { code: string; labelEn: string; order: number; parent?: string; maxMarks?: string; scale: "ENTERED_MARKS" | "PASS_FAIL" | "BANDED"; input?: "MIN_CAPITAL_RATIO" | "VARIANCE_VS_ESTIMATE"; bandSet?: string };
type StageDef = {
  code: string; order: number; labelEn: string; kind: "SCORED" | "SHORTLIST" | "FINANCIAL_TEST" | "COMMERCIAL" | "ASPECTS" | "COMPOSITE" | "RECOMMENDATION"; side: "IMPLEMENTING_DEPARTMENT" | "CONTRACT_PROCUREMENT";
  unlocksAfterOrder?: number; maxMarks?: string; passMark?: string; passInclusive?: boolean; mustPass?: boolean; compositeWeight?: string;
  shortlistRule?: "COUNT_RANGE"; shortlistMin?: number; shortlistMax?: number; capitalBase?: "TENDER_AMOUNT" | "COMPANY_ESTIMATE";
  criteria?: CritDef[]; factors?: { code: string; labelEn: string; factorPct: string }[];
};
type ModelDef = { id: string; code: string; nameEn: string; stages: StageDef[]; bandSets: { code: string; nameEn: string; bands: BandDef[] }[] };

const CAPITAL_BANDS = (name: string) => ({
  code: "capital",
  nameEn: name,
  bands: [
    { labelEn: "Below the minimum capital", upperIsFloor: true, upperInclusive: false, outcome: "FAIL" as const },
    { labelEn: "Meets the minimum capital", lowerIsFloor: true, lowerInclusive: true, outcome: "PASS" as const },
  ],
});

const MODELS: ModelDef[] = [
  {
    id: `${P}evm1`, code: "demo_weighted_tender", nameEn: "Demo weighted tender model",
    bandSets: [CAPITAL_BANDS("Minimum capital, judged on the factor chosen (demo)")],
    stages: [
      {
        code: "technical", order: 1, labelEn: "Technical", kind: "SCORED", side: "IMPLEMENTING_DEPARTMENT", maxMarks: "100", passMark: "65", passInclusive: true, mustPass: true, compositeWeight: "70",
        criteria: [
          { code: "method", order: 1, labelEn: "Method statement and programme", maxMarks: "40", scale: "ENTERED_MARKS" },
          { code: "experience", order: 2, labelEn: "Experience", maxMarks: "60", scale: "ENTERED_MARKS" },
          { code: "similar", order: 3, parent: "experience", labelEn: "Similar works completed", maxMarks: "35", scale: "ENTERED_MARKS" },
          { code: "staff", order: 4, parent: "experience", labelEn: "Key staff", maxMarks: "25", scale: "ENTERED_MARKS" },
        ],
      },
      {
        code: "financial", order: 2, labelEn: "Financial capacity", kind: "FINANCIAL_TEST", side: "CONTRACT_PROCUREMENT", unlocksAfterOrder: 1, maxMarks: "100", passMark: "55", passInclusive: true, mustPass: true, compositeWeight: "30", capitalBase: "TENDER_AMOUNT",
        criteria: [
          { code: "standing", order: 1, labelEn: "Financial standing", maxMarks: "100", scale: "ENTERED_MARKS" },
          { code: "capital", order: 2, labelEn: "Minimum capital", scale: "BANDED", input: "MIN_CAPITAL_RATIO", bandSet: "capital" },
        ],
        factors: [
          { code: "employer_materials", labelEn: "Materials supplied by the employer", factorPct: "4.5" },
          { code: "contractor_materials", labelEn: "Materials supplied by the contractor", factorPct: "7" },
        ],
      },
      { code: "aspects", order: 3, labelEn: "Aspects of the bid", kind: "ASPECTS", side: "IMPLEMENTING_DEPARTMENT", unlocksAfterOrder: 2 },
      { code: "composite", order: 4, labelEn: "Composite", kind: "COMPOSITE", side: "CONTRACT_PROCUREMENT", passMark: "60", passInclusive: true, mustPass: true },
      { code: "recommendation", order: 5, labelEn: "Recommendation", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT" },
    ],
  },
  {
    id: `${P}evm2`, code: "demo_phased_quotation", nameEn: "Demo phased quotation model",
    bandSets: [
      CAPITAL_BANDS("Minimum capital, judged on the factor chosen (demo)"),
      {
        code: "price", nameEn: "Price against the company estimate (demo guide)",
        bands: [
          { labelEn: "More than 12% below the estimate", upper: "-12", upperInclusive: false, outcome: "NONE" },
          { labelEn: "Within 12% of the estimate", lower: "-12", lowerInclusive: true, upper: "12", upperInclusive: true, outcome: "PASS" },
          { labelEn: "More than 12% above the estimate", lower: "12", lowerInclusive: false, outcome: "FAIL" },
        ],
      },
    ],
    stages: [
      {
        code: "technical", order: 1, labelEn: "Technical", kind: "SCORED", side: "IMPLEMENTING_DEPARTMENT", maxMarks: "50", passMark: "50", passInclusive: true, mustPass: true,
        criteria: [
          { code: "method", order: 1, labelEn: "Method and programme", maxMarks: "20", scale: "ENTERED_MARKS" },
          { code: "experience", order: 2, labelEn: "Similar works", maxMarks: "30", scale: "ENTERED_MARKS" },
        ],
      },
      { code: "shortlist", order: 2, labelEn: "Shortlist", kind: "SHORTLIST", side: "CONTRACT_PROCUREMENT", shortlistRule: "COUNT_RANGE", shortlistMin: 2, shortlistMax: 3 },
      {
        code: "financial", order: 3, labelEn: "Financial capacity", kind: "FINANCIAL_TEST", side: "CONTRACT_PROCUREMENT", unlocksAfterOrder: 2, passInclusive: true, mustPass: true, capitalBase: "COMPANY_ESTIMATE",
        criteria: [{ code: "capital", order: 1, labelEn: "Minimum capital", scale: "BANDED", input: "MIN_CAPITAL_RATIO", bandSet: "capital" }],
        factors: [
          { code: "employer_materials", labelEn: "Materials supplied by the employer", factorPct: "4" },
          { code: "contractor_materials", labelEn: "Materials supplied by the contractor", factorPct: "6" },
        ],
      },
      { code: "price", order: 4, labelEn: "Price against the estimate", kind: "COMMERCIAL", side: "CONTRACT_PROCUREMENT", mustPass: false, criteria: [{ code: "variance", order: 1, labelEn: "Variance from the company estimate", scale: "BANDED", input: "VARIANCE_VS_ESTIMATE", bandSet: "price" }] },
      { code: "aspects", order: 5, labelEn: "Aspects of the bid", kind: "ASPECTS", side: "IMPLEMENTING_DEPARTMENT" },
      { code: "recommendation", order: 6, labelEn: "Recommendation", kind: "RECOMMENDATION", side: "CONTRACT_PROCUREMENT" },
    ],
  },
];

const ASPECTS = [
  { id: `${P}eva1`, code: "demo_completeness", kind: "COMPLETENESS" as const, labelEn: "Completeness of the bid", labelMs: "Kelengkapan tawaran" },
  { id: `${P}eva2`, code: "demo_price", kind: "PRICE_VS_ESTIMATE" as const, labelEn: "Price against the company estimate", labelMs: "Harga berbanding anggaran syarikat" },
  { id: `${P}eva3`, code: "demo_period", kind: "COMPLETION_PERIOD" as const, labelEn: "Completion period offered", labelMs: "Tempoh siap yang ditawarkan" },
  { id: `${P}eva4`, code: "demo_capability", kind: "CAPABILITY" as const, labelEn: "Capability to carry out the works", labelMs: "Keupayaan melaksanakan kerja" },
];

const TEMPLATES = [
  {
    id: `${P}dt20`, code: "demo_evaluation_report", nameEn: "Demo evaluation report", formCode: "DEMO-F-301",
    bodyEn: [
      "{{organisation.name}}",
      "EVALUATION REPORT {{evaluation.reference}} for {{exercise.title}} ({{exercise.reference}}), evaluation version {{evaluation.version}}, dated {{evaluation.issuedOn}}.",
      "{{evaluation.bidCount}} bids were evaluated under {{evaluation.model}}.",
      "The committee is recommended to appoint {{recommendation.bidder}} ({{recommendation.registrationNo}}) at {{recommendation.price}}, to complete in {{recommendation.period}}. {{recommendation.justification}}",
      "Saving against the company estimate: {{saving.amount}} ({{saving.percent}}).",
      "(Invented demo text: not any organisation's real report.)",
    ].join("\n\n"),
  },
  {
    id: `${P}dt21`, code: "demo_proposal_paper", nameEn: "Demo Kertas Cadangan", formCode: "DEMO-F-302",
    bodyEn: [
      "{{organisation.name}}",
      "KERTAS CADANGAN: {{exercise.title}} ({{exercise.reference}}).",
      "On evaluation report {{evaluation.reference}}, the Board is asked to appoint {{recommendation.bidder}} at {{recommendation.price}}, completion in {{recommendation.period}}.",
      "Checked by the {{proposal.checkerOffice}}. Recommended by the {{proposal.recommenderOffice}}.",
      "(Invented demo text.)",
    ].join("\n\n"),
  },
];

/**
 * Load the evaluation's configuration (before any demo publication: each publication pins a model).
 * Each model is written as a draft row by row, checked with `modelFaults` and issued with its snapshot,
 * as Configuration › Evaluation models issues it.
 */
export async function configureEvaluationDemo(db: Db, organisationId: string) {
  const { aspectConfigOf, contentOf } = await import("../src/lib/evaluation/config");
  const { loadModel } = await import("../src/lib/evaluation/config-read");
  const { modelFaults, modelSnapshot } = await import("../src/lib/evaluation/model");
  const { ROUTE_LABEL } = await import("../src/lib/evaluation/labels");
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const at = instantAt(W(16), "10:00", tz)!;
  const later = (m: number) => new Date(at.getTime() + m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}evcau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, unattributed: true });

  // ---- aspects (FR-EVL-003), required on the traditional route
  for (const [i, a] of ASPECTS.entries()) {
    await db.evaluationAspect.create({ data: { ...a, organisationId, requiredOnRoute: "TRADITIONAL", provenance: "ASSUMED", governingSource: SOURCE, sortOrder: i + 1 } });
    entry("EvaluationAspect", a.id, `Evaluation aspect ${a.labelEn}`, "CREATE", later(i), diffFields(null, { aspect: a.labelEn, nameMs: a.labelMs, requiredOn: ROUTE_LABEL.TRADITIONAL, provenance: "ASSUMED", source: SOURCE }));
  }

  // ---- the models, drafted row by row, then issued
  for (const [mi, m] of MODELS.entries()) {
    const when = later(10 + mi * 10);
    await db.evaluationModel.create({ data: { id: m.id, organisationId, code: m.code, version: 1, nameEn: m.nameEn, route: "TRADITIONAL", provenance: "ASSUMED", governingSource: SOURCE, notes: "Invented for the demo: every weight, pass mark, factor and band is ASSUMED." } });
    entry("EvaluationModel", m.id, `Evaluation model ${m.nameEn}, version 1`, "CREATE", when, diffFields(null, { name: m.nameEn, route: ROUTE_LABEL.TRADITIONAL, provenance: "ASSUMED", source: SOURCE, version: 1, status: "Draft" }));
    for (const [si, s] of m.bandSets.entries()) {
      const sid = `${m.id}_bs${si + 1}`;
      await db.evaluationBandSet.create({ data: { id: sid, organisationId, modelId: m.id, code: s.code, nameEn: s.nameEn, provenance: "ASSUMED", governingSource: SOURCE } });
      for (const [bi, b] of s.bands.entries()) {
        await db.evaluationBand.create({ data: { id: `${sid}_b${bi + 1}`, organisationId, setId: sid, labelEn: b.labelEn, lower: b.lower ?? null, lowerInclusive: b.lowerInclusive ?? false, lowerIsFloor: b.lowerIsFloor ?? false, upper: b.upper ?? null, upperInclusive: b.upperInclusive ?? false, upperIsFloor: b.upperIsFloor ?? false, outcome: b.outcome, sortOrder: bi + 1 } });
      }
      entry("EvaluationModel", m.id, `Evaluation model ${m.nameEn}, version 1 · ${s.nameEn}`, "CREATE", when, diffFields(null, { bandSet: s.nameEn, bands: s.bands.map((b) => b.labelEn).join("; "), provenance: "ASSUMED" }));
    }
    for (const s of m.stages) {
      const sid = `${m.id}_st${s.order}`;
      await db.evaluationStage.create({
        data: {
          id: sid, organisationId, modelId: m.id, order: s.order, code: s.code, labelEn: s.labelEn, kind: s.kind, side: s.side, unlocksAfterOrder: s.unlocksAfterOrder ?? null,
          maxMarks: s.maxMarks ?? null, passMark: s.passMark ?? null, passInclusive: s.passInclusive ?? null, mustPass: s.mustPass ?? null, compositeWeight: s.compositeWeight ?? null,
          shortlistRule: s.shortlistRule ?? null, shortlistMin: s.shortlistMin ?? null, shortlistMax: s.shortlistMax ?? null, capitalBase: s.capitalBase ?? null, provenance: "ASSUMED", governingSource: SOURCE,
        },
      });
      const ids = new Map<string, string>();
      for (const c of [...(s.criteria ?? [])].sort((a, b) => Number(!!a.parent) - Number(!!b.parent))) {
        const cid = `${sid}_c${c.order}`;
        await db.evaluationCriterion.create({ data: { id: cid, organisationId, stageId: sid, parentId: c.parent ? ids.get(c.parent)! : null, order: c.order, code: c.code, labelEn: c.labelEn, maxMarks: c.maxMarks ?? null, scale: c.scale, computedInput: c.input ?? "NONE", bandSetCode: c.bandSet ?? null, provenance: "ASSUMED", governingSource: SOURCE } });
        ids.set(c.code, cid);
      }
      for (const [fi, f] of (s.factors ?? []).entries()) await db.evaluationFactorOption.create({ data: { id: `${sid}_f${fi + 1}`, organisationId, stageId: sid, code: f.code, labelEn: f.labelEn, factorPct: f.factorPct, provenance: "ASSUMED", governingSource: SOURCE } });
      entry("EvaluationModel", m.id, `Evaluation model ${m.nameEn}, version 1 · ${s.labelEn}`, "CREATE", when, diffFields(null, { stage: s.labelEn, order: s.order, maxMarks: s.maxMarks ?? null, passMark: s.passMark ?? null, weight: s.compositeWeight ?? null, criteria: (s.criteria ?? []).map((c) => c.labelEn).join("; ") || null, factors: (s.factors ?? []).map((f) => `${f.labelEn} ${f.factorPct}%`).join("; ") || null, provenance: "ASSUMED" }));
    }
    // Issue, as issueModel does: checked, then frozen.
    const issuedAt = new Date(when.getTime() + 5 * 60_000);
    const row = (await loadModel(organisationId, m.id, db as never))!;
    const aspects = aspectConfigOf(await db.evaluationAspect.findMany({ where: { organisationId } }), issuedAt);
    const content = contentOf(row);
    refuse(`issuing ${m.nameEn}`, modelFaults(content, aspects));
    const snapshot = modelSnapshot(m.id, content, aspects, issuedAt);
    await db.evaluationModel.update({ where: { id: m.id }, data: { status: "ISSUED", issuedAt, contentSnapshot: snapshot as object } });
    entry("EvaluationModel", m.id, `Evaluation model ${m.nameEn}, version 1`, "UPDATE", issuedAt, diffFields({ status: "Draft" }, { status: "Issued", stages: content.stages.length, bandSets: content.bandSets.length, aspects: snapshot.aspects.length }));
  }

  // ---- each contract basis's route, each method's usual model
  for (const b of await db.contractBasis.findMany({ where: { organisationId, id: demoRef }, select: { id: true, nameEn: true } })) {
    await db.contractBasis.update({ where: { id: b.id }, data: { evaluationRoute: "TRADITIONAL", evaluationRouteProvenance: "ASSUMED" } });
    entry("ContractBasis", b.id, `Contract basis ${b.nameEn}`, "UPDATE", later(40), diffFields({ evaluationRoute: null, evaluationRouteFrom: null }, { evaluationRoute: ROUTE_LABEL.TRADITIONAL, evaluationRouteFrom: "ASSUMED" }));
  }
  for (const m of await db.sourcingMethod.findMany({ where: { organisationId, documentPackKind: { in: ["TENDER", "QUOTATION"] } }, select: { id: true, nameEn: true, documentPackKind: true } })) {
    const model = MODELS.find((x) => x.id === EVALUATION_MODEL_FOR[m.documentPackKind as "TENDER" | "QUOTATION"])!;
    await db.sourcingMethod.update({ where: { id: m.id }, data: { defaultEvaluationModelCode: model.code } });
    entry("SourcingMethod", m.id, `Method ${m.nameEn}`, "UPDATE", later(41), diffFields({ suggestedEvaluationModel: null }, { suggestedEvaluationModel: model.nameEn }));
  }

  // ---- the report's series and the two templates, then the policy
  await db.numberingSeries.create({ data: { id: `${P}n20`, organisationId, key: "evaluation_report", nameEn: "Evaluation reports", pattern: "DEMO/EVR/{SERIAL}/{YEAR}", padding: 3, resetOn: "CALENDAR_YEAR", nextSerial: 1, serialPeriod: L.slice(0, 4), provenance: "ASSUMED" } });
  entry("NumberingSeries", `${P}n20`, "Numbering · Evaluation reports", "CREATE", later(42), diffFields(null, { name: "Evaluation reports", pattern: "DEMO/EVR/{SERIAL}/{YEAR}", provenance: "ASSUMED" }));
  await db.documentTemplate.createMany({ data: TEMPLATES.map((t, i) => ({ ...t, organisationId, documentClassId: `${P}dc1`, revisionDate: dayToDate("2026-06-01"), bodyVersion: 1, primaryLanguage: "EN" as const, provenance: "ASSUMED" as const, sortOrder: 20 + i, notes: "Invented demo text." })) });
  for (const t of TEMPLATES) entry("DocumentTemplate", t.id, t.nameEn, "CREATE", later(43), diffFields(null, { code: t.code, nameEn: t.nameEn, formCode: t.formCode, textVersion: 1, whereItComesFrom: "Assumed" }));
  if (!(await db.evaluationPolicy.findUnique({ where: { organisationId } }))) {
    await db.evaluationPolicy.create({ data: { id: `${P}evp1`, organisationId, reportSeriesKey: "evaluation_report", scoreDecimals: 2, scoreDecimalsProvenance: "ASSUMED", checkerRoleCode: "HOD_CP", recommenderRoleCode: "FD", reportTemplateId: `${P}dt20`, proposalTemplateId: `${P}dt21`, governingSource: SOURCE, notes: "Invented for the demo." } });
    entry("EvaluationPolicy", `${P}evp1`, "Evaluation policy", "CREATE", later(44), diffFields(null, { reportSeries: "Evaluation reports", scoreDecimals: 2, scoreDecimalsFrom: "ASSUMED", checker: "Head of Contract & Procurement", recommender: "Finance Director", reportTemplate: TEMPLATES[0].nameEn, proposalTemplate: TEMPLATES[1].nameEn, source: SOURCE }));
  }
  await db.auditEntry.createMany({ data: trail as never });
}

// ------------------------------------------------------------------ the evaluation's acts, as the actions judge them

type Ctx = Awaited<ReturnType<typeof import("../src/lib/evaluation/repo")["loadEvaluationContext"]>>;

class EvaluationActs {
  constructor(
    private readonly db: Db,
    private readonly org: string,
    private readonly tz: string,
    private readonly entry: Add,
  ) {}

  /// The exercise and its evaluation context, read as the actions read them (without their locks: nothing else writes during the load).
  async ctx(exerciseId: string) {
    const { loadExercise } = await import("../src/lib/method/repo");
    const { loadEvaluationContext } = await import("../src/lib/evaluation/repo");
    const l = (await loadExercise(exerciseId)) ?? fail(`${exerciseId} is not loaded`);
    const c = await loadEvaluationContext(l, this.db as never);
    return { l, c, label: (version: number, what?: string) => `${l.ex.reference} · Evaluation, version ${version}${what ? ` · ${what}` : ""}` };
  }

  async start(exerciseId: string, id: string, i: { by: { id: string; name: string }; appointedOn: string; at: Date }) {
    const { startFaults } = await import("../src/lib/evaluation/start");
    const { teamFaults } = await import("../src/lib/evaluation/team");
    const { ceilingExclusion } = await import("../src/lib/evaluation/ceiling");
    const { ceilingOf } = await import("../src/lib/evaluation/repo");
    const { exclusionReason } = await import("../src/lib/evaluation/versions");
    const { EVALUATION_ENTITY, startFields, teamFields } = await import("../src/lib/evaluation/audit-view");
    const { moveExercise } = await import("../src/lib/method/move");
    const { l, c, label } = await this.ctx(exerciseId);
    const ceiling = ceilingOf(l.ex);
    const boundaryMissing = ceiling.regime === "quotation" && (ceiling.boundary == null || ceiling.operator == null);
    refuse(`starting ${l.ex.reference}'s evaluation`, startFaults({ status: l.ex.status, throughWindow: c.throughWindow, pinned: c.model != null, openings: c.openingGate, decimals: c.policy?.scoreDecimals ?? null, boundaryMissing, carried: c.carried.length, started: c.evaluations.length > 0, timeZone: this.tz, personActive: true }));
    const people = await this.db.person.findMany({ where: { id: { in: [...IMPLEMENTING, ...PROCUREMENT].map((p) => p.id) } }, select: { id: true, name: true, isActive: true, orgUnitCode: true } });
    const picks = [...IMPLEMENTING.map((p) => ({ p, side: "IMPLEMENTING_DEPARTMENT" as const })), ...PROCUREMENT.map((p) => ({ p, side: "CONTRACT_PROCUREMENT" as const }))].map(({ p, side }) => {
      const x = people.find((q) => q.id === p.id)!;
      return { personId: p.id, name: x.name, side, active: x.isActive, unitCode: x.orgUnitCode };
    });
    refuse("the team", teamFaults(picks, l.req.requestingUnitCode, c.unitPath));
    const decimals = c.policy!.scoreDecimals!;
    await this.db.evaluation.create({ data: { id, organisationId: this.org, exerciseId, version: 1, state: "OPEN", trigger: "START", startedAt: i.at, startedByPersonId: i.by.id, policySnapshot: { scoreDecimals: decimals, scoreDecimalsProvenance: c.policy!.scoreDecimalsProvenance ?? null } } });
    for (const [k, p] of picks.entries()) {
      const mid = `${id}_tm${k + 1}`;
      await this.db.evaluationTeamMember.create({ data: { id: mid, organisationId: this.org, evaluationId: id, personId: p.personId, side: p.side, orgUnitCodeSnapshot: p.unitCode, appointedOn: dayToDate(i.appointedOn), recordedAt: i.at } });
      this.entry(EVALUATION_ENTITY.team, mid, label(1, "Team"), "CREATE", i.at, diffFields(null, teamFields({ name: p.name, side: p.side, unit: p.unitCode, on: i.appointedOn })));
    }
    let excluded = 0;
    for (const b of c.carried) {
      const reason = exclusionReason(ceilingExclusion(parseSen(b.priceAsRead.toString()), ceiling));
      if (reason) excluded++;
      const bid = `${id}_bd${b.listingNo}`;
      await this.db.evaluationBidder.create({ data: { id: bid, organisationId: this.org, evaluationId: id, openedBidId: b.id, excludedReason: reason, ceilingSnapshot: { regime: ceiling.regime, boundary: ceiling.boundary != null ? senToDecimalString(ceiling.boundary) : null, operator: ceiling.operator } } });
      if (reason) this.entry(EVALUATION_ENTITY.bidder, bid, label(1, `Bid No. ${b.listingNo}`), "CREATE", i.at, diffFields(null, { bid: `No. ${b.listingNo}`, excluded: reason }));
    }
    this.entry(EVALUATION_ENTITY.evaluation, id, label(1), "CREATE", i.at, diffFields(null, startFields({ version: 1, trigger: "START", model: `${c.model!.nameEn}, version ${c.model!.version}`, at: i.at, by: i.by.name, bidders: c.carried.length, excluded, decimals }, this.tz)));
    await moveExercise(this.db as never, l.ex, "UNDER_EVALUATION", { today: dayIn(i.at, this.tz), via: "EVALUATION_STARTED", startFaults: 0 });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", i.at, diffFields({ status: l.ex.status }, { status: "UNDER_EVALUATION" }));
  }

  private bidder(c: Ctx, listingNo: number) {
    return c.facts!.bidders.find((b) => b.listingNo === listingNo) ?? fail(`bid No. ${listingNo} is not in the evaluation`);
  }

  async score(exerciseId: string, listingNo: number, stageCode: string, criterionCode: string, value: { marks: string } | { passed: boolean }, by: { id: string; name: string }, at: Date) {
    const { scoreFaults } = await import("../src/lib/evaluation/stages");
    const { stageOf } = await import("../src/lib/evaluation/model");
    const { fixedToDecimalString, parseFixed } = await import("../src/lib/evaluation/fixed");
    const { EVALUATION_ENTITY, scoreFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const f = c.facts!;
    const s = stageOf(f.model, stageCode) ?? fail(`no stage ${stageCode}`);
    const b = this.bidder(c, listingNo);
    const v = "marks" in value ? { marks: parseFixed(value.marks) } : value;
    refuse(`scoring bid No. ${listingNo} on ${s.labelEn}`, scoreFaults(f, s, criterionCode, b, by.id, v));
    const id = `${c.current!.id}_sc${listingNo}_${stageCode}_${criterionCode}`;
    await this.db.evaluationScore.create({ data: { id, organisationId: this.org, bidderId: b.id, stageCode, criterionCode, marks: "marks" in v ? fixedToDecimalString(v.marks) : null, passed: "passed" in v ? v.passed : null, note: "", scoredByPersonId: by.id, recordedAt: at } });
    this.entry(EVALUATION_ENTITY.score, id, label(c.current!.version, `${s.labelEn} · bid No. ${listingNo}`), "CREATE", at, diffFields(null, scoreFields({ criterion: s.criteria.find((x) => x.code === criterionCode)!.labelEn, marks: "marks" in v ? v.marks : null, passed: "passed" in v ? v.passed : null, note: "", by: by.name })));
  }

  async inputs(exerciseId: string, listingNo: number, i: { factor: string; balances: [string, string, string] }, by: { id: string; name: string }, at: Date) {
    const { personFaults } = await import("../src/lib/evaluation/team");
    const { isSubmitted, runningFaults } = await import("../src/lib/evaluation/stages");
    const { EVALUATION_ENTITY, inputFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const f = c.facts!;
    const b = this.bidder(c, listingNo);
    const capital = f.model.stages.filter((s) => s.criteria.some((x) => x.computedInput === "MIN_CAPITAL_RATIO"));
    if (capital.some((s) => isSubmitted(f, s.code))) fail("the capital inputs are frozen");
    const factor = capital.flatMap((s) => s.factors).find((x) => x.code === i.factor) ?? fail(`no factor ${i.factor}`);
    for (const s of capital) refuse(`bid No. ${listingNo}'s inputs`, [...runningFaults(f, s, b), ...personFaults(s.side, by.id, f.team, f.submissions)]);
    await this.db.evaluationBidder.update({ where: { id: b.id }, data: { factorOptionCode: i.factor, balanceMonth1: i.balances[0], balanceMonth2: i.balances[1], balanceMonth3: i.balances[2], inputsRecordedAt: at, inputsRecordedByPersonId: by.id } });
    this.entry(EVALUATION_ENTITY.bidder, b.id, label(c.current!.version, `Bid No. ${listingNo}`), "UPDATE", at, diffFields(inputFields({ factor: null, balances: [null, null, null], cpr: null, by: by.name }), inputFields({ factor: factor.labelEn, balances: i.balances.map(parseSen), cpr: null, by: by.name })));
  }

  async submit(exerciseId: string, stageCode: string, by: { id: string; name: string }, at: Date) {
    const { stageOf } = await import("../src/lib/evaluation/model");
    const { resultRows, submitStage } = await import("../src/lib/evaluation/stages");
    const { fixedToDecimalString } = await import("../src/lib/evaluation/fixed");
    const { EVALUATION_ENTITY } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const s = stageOf(c.facts!.model, stageCode) ?? fail(`no stage ${stageCode}`);
    const notes = new Map<string, string>();
    const r = submitStage(c.facts!, s, by.id, notes);
    refuse(`submitting ${s.labelEn}`, r.faults);
    const sid = `${e.id}_sub_${stageCode}`;
    await this.db.stageSubmission.create({ data: { id: sid, organisationId: this.org, evaluationId: e.id, stageCode: s.code, side: s.side, submittedByPersonId: by.id, submittedAt: at } });
    for (const row of resultRows(s, r.results, notes)) {
      await this.db.stageResult.create({ data: { organisationId: this.org, evaluationId: e.id, bidderId: row.bidderId, stageCode: s.code, percent: row.percent != null ? fixedToDecimalString(row.percent) : null, shown: row.shown != null ? fixedToDecimalString(row.shown) : null, passed: row.passed, bandLabel: row.bandLabel, outOfRunning: row.outOfRunning, detail: row.detail as object } });
    }
    const out = r.results.filter((x) => x.outOfRunning).length;
    this.entry(EVALUATION_ENTITY.submission, sid, label(e.version, s.labelEn), "CREATE", at, diffFields(null, { stage: s.labelEn, submittedBy: `${by.name} (recorded on their behalf, not signed)`, bidsJudged: r.results.length, outOfTheRunning: out || null }));
  }

  async shortlist(exerciseId: string, stageCode: string, chosen: number[], by: { id: string; name: string }, at: Date) {
    const { stageOf } = await import("../src/lib/evaluation/model");
    const { inRunningAt, isSubmitted } = await import("../src/lib/evaluation/stages");
    const { personFaults } = await import("../src/lib/evaluation/team");
    const { shortlistFaults } = await import("../src/lib/evaluation/shortlist");
    const { evaluatedPrice } = await import("../src/lib/evaluation/facts");
    const { EVALUATION_ENTITY } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const f = c.facts!;
    const e = c.current!;
    const s = stageOf(f.model, stageCode)!;
    const ids = chosen.map((n) => this.bidder(c, n).id);
    const fs = [...personFaults(s.side, by.id, f.team, f.submissions)];
    for (const x of f.model.stages.filter((x) => x.order < s.order)) if (!isSubmitted(f, x.code)) fs.push({ code: "EARLIER_NOT_SUBMITTED", level: "block" } as never);
    const eligible = inRunningAt(f, s).map((b) => ({ id: b.id, price: evaluatedPrice(b) }));
    fs.push(...(shortlistFaults({ rule: s.shortlistRule, min: s.shortlistMin, max: s.shortlistMax, officeCode: s.shortlistOfficeCode, eligible, chosen: ids, deciderHoldsOffice: false }) as never[]));
    refuse(`the shortlist`, fs);
    const sid = `${e.id}_sub_${stageCode}`;
    await this.db.stageSubmission.create({ data: { id: sid, organisationId: this.org, evaluationId: e.id, stageCode: s.code, side: s.side, submittedByPersonId: by.id, submittedAt: at } });
    for (const b of eligible) {
      const on = ids.includes(b.id);
      await this.db.evaluationBidder.update({ where: { id: b.id }, data: { shortlisted: on, shortlistedAt: at, shortlistedByPersonId: by.id } });
      await this.db.stageResult.create({ data: { organisationId: this.org, evaluationId: e.id, bidderId: b.id, stageCode: s.code, passed: on, outOfRunning: !on } });
    }
    this.entry(EVALUATION_ENTITY.submission, sid, label(e.version, s.labelEn), "CREATE", at, diffFields(null, { stage: s.labelEn, shortlisted: chosen.map((n) => `No. ${n}`).join(", "), recordedBy: `${by.name} (recorded on their behalf, not signed)` }));
  }

  async aspect(exerciseId: string, listingNo: number, aspectCode: string, verdict: "SATISFACTORY" | "NOT_SATISFACTORY", narrative: string, by: { id: string; name: string }, at: Date) {
    const { assessFaults } = await import("../src/lib/evaluation/aspects");
    const { isSubmitted, runningAt } = await import("../src/lib/evaluation/stages");
    const { personFaults } = await import("../src/lib/evaluation/team");
    const { EVALUATION_ENTITY, aspectFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const f = c.facts!;
    const b = this.bidder(c, listingNo);
    const stage = f.model.stages.find((s) => s.kind === "ASPECTS")!;
    const a = f.model.aspects.find((x) => x.code === aspectCode) ?? fail(`no aspect ${aspectCode}`);
    refuse(`assessing ${a.labelEn}`, [...assessFaults({ aspectInModel: true, verdict, narrative }), ...personFaults(stage.side, by.id, f.team, f.submissions)]);
    if (isSubmitted(f, stage.code) || runningAt(f, stage, b).state !== "IN") fail(`bid No. ${listingNo} cannot be assessed`);
    const id = `${c.current!.id}_as${listingNo}_${aspectCode}`;
    await this.db.aspectAssessment.create({ data: { id, organisationId: this.org, bidderId: b.id, aspectCode, verdict, narrative, assessedByPersonId: by.id, recordedAt: at } });
    this.entry(EVALUATION_ENTITY.aspect, id, label(c.current!.version, `Aspects · bid No. ${listingNo}`), "CREATE", at, diffFields(null, aspectFields({ aspect: a.labelEn, kind: a.kind, verdict, narrative, by: by.name })));
  }

  async recommend(exerciseId: string, listingNo: number, by: { id: string; name: string }, at: Date) {
    const { recommendationFaults } = await import("../src/lib/evaluation/recommend");
    const { recommendedPriceOf } = await import("../src/lib/evaluation/facts");
    const { periodWords } = await import("../src/lib/evaluation/report");
    const { EVALUATION_ENTITY, recommendationFields } = await import("../src/lib/evaluation/audit-view");
    const { ceilingOf } = await import("../src/lib/evaluation/repo");
    const { l, c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const b = this.bidder(c, listingNo);
    const rf = recommendationFaults(c.facts!, { bidderId: b.id, justification: "", personActive: true, alreadyFormed: e.recommendation != null, meetingsOpen: e.meetings.filter((m) => !m.closedAt).length, negotiationsPending: e.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length, ceiling: ceilingOf(l.ex) });
    refuse("forming the recommendation", rf.faults);
    const price = recommendedPriceOf(b);
    const id = `${e.id}_rec`;
    await this.db.recommendation.create({ data: { id, organisationId: this.org, evaluationId: e.id, bidderId: b.id, price: senToDecimalString(price), completionPeriod: b.period?.value ?? null, completionUnit: b.period?.unit ?? null, topRanked: rf.topRanked, justification: "", formedByPersonId: by.id, formedAt: at } });
    this.entry(EVALUATION_ENTITY.recommendation, id, label(e.version, "Recommendation"), "CREATE", at, diffFields(null, recommendationFields({ bidder: `No. ${b.listingNo}, ${b.bidderName}`, price, period: periodWords(b.period), topRanked: rf.topRanked, justification: "", by: by.name })));
  }

  async issue(exerciseId: string, by: { id: string; name: string }, at: Date) {
    const { consentCheck } = await import("../src/lib/evaluation/consent");
    const { recommendedPriceOf } = await import("../src/lib/evaluation/facts");
    const { renderEvaluationInstrument } = await import("../src/lib/evaluation/instrument");
    const { incompleteStages } = await import("../src/lib/evaluation/recommend");
    const { buildReport, reportFaults, reportFields, reportStale } = await import("../src/lib/evaluation/report");
    const { ceilingOf } = await import("../src/lib/evaluation/repo");
    const { EVALUATION_ENTITY } = await import("../src/lib/evaluation/audit-view");
    const { issueReference } = await import("../src/lib/numbering/issue");
    const { moveExercise } = await import("../src/lib/method/move");
    const { isLive } = await import("../src/lib/documents/evidence");
    const { l, c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const f = c.facts!;
    const rec = e.recommendation ?? fail("no recommendation");
    const rb = f.bidders.find((b) => b.id === rec.bidderId)!;
    const consent = consentCheck(c.extensions.map((x) => ({ id: x.id, consentPartyId: x.consentPartyId, consentPartyName: x.consentParty.name, applied: x.appliedAt != null, toExpiry: storedDay(x.toExpiry) })), rb.partyId);
    const org = await this.db.organisation.findUniqueOrThrow({ where: { id: this.org }, select: { name: true, nameMs: true } });
    const t = c.policy!.reportTemplate!;
    const template = { id: t.id, code: t.code, nameEn: t.nameEn, bodyEn: t.bodyEn, bodyMs: t.bodyMs, primaryLanguage: t.primaryLanguage, bodyVersion: t.bodyVersion };
    const today = dayIn(at, this.tz);
    const base = { facts: f, exercise: { reference: l.ex.reference, title: l.ex.title }, version: e.version, issuedOn: formatDate(today) };
    const recommendation = { bidderId: rec.bidderId, price: recommendedPriceOf(rb), period: rb.period, topRanked: rec.topRanked, justification: rec.justification, formedBy: rec.formedBy.name, formedOn: formatDate(dayIn(rec.formedAt, this.tz)) };
    const trial = renderEvaluationInstrument("REPORT", template, () => reportFields({ ...base, reference: "(allocated on issue)", recommendation }, org.name));
    refuse("issuing the report", reportFaults({ stagesIncomplete: incompleteStages(f), recommended: true, openMeetings: e.meetings.filter((m) => !m.closedAt).length, pendingNegotiations: e.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length, seriesKey: c.policy!.reportSeriesKey, template: trial, admittedUnopened: c.admittedUnopened, supplementaryInProgress: c.supplementaryInProgress, consent: consent.faults, stale: reportStale(e.bidders.map((b) => b.openedBidId), c.carried.map((b) => b.id)), personActive: true, ceiling: { price: senFromDecimal(rec.price), snapshot: ceilingOf(l.ex) }, today }));
    const reference = await this.db.$transaction((tx) => issueReference(tx, this.org, c.policy!.reportSeriesKey!, dayToDate(today)));
    const rendered = renderEvaluationInstrument("REPORT", template, () => reportFields({ ...base, reference, recommendation }, org.name));
    if (rendered.state !== "OK" || rendered.missing.length || rendered.unknown.length) fail("the report's text did not render whole");
    const snapshot = buildReport({
      ...base, recommendation, reference, issuedBy: by.name,
      details: new Map(e.results.map((x) => [`${x.bidderId}/${x.stageCode}`, x.detail])),
      schedule: c.latestSchedule, siteVisits: c.siteVisits,
      drawings: e.attachments.filter((a) => a.purpose === "REPORT_DRAWINGS" && isLive(a)).map((a) => ({ title: a.version.document.title, versionNo: a.version.versionNo })),
      meetings: [], consent: consent.rows.map((x) => ({ consentPartyName: x.consentPartyName, toExpiry: formatDate(x.toExpiry), outcome: x.outcome === "CHECKED" ? "Checked: from the recommended tenderer" : "Not from the recommended tenderer" })),
      annexLabels: c.policy!.annexLabels ?? null,
      text: { language: rendered.language!, body: rendered.text!, template: { code: t.code, name: t.nameEn, bodyVersion: t.bodyVersion } },
    });
    await this.db.evaluation.update({ where: { id: e.id }, data: { state: "ISSUED", issuedAt: at, issuedByPersonId: by.id, reportReference: reference, reportSnapshot: snapshot as object, consentCheckSnapshot: consent.rows as object } });
    this.entry(EVALUATION_ENTITY.evaluation, e.id, label(e.version), "UPDATE", at, diffFields({ state: "In progress", report: null }, { state: "Report issued", report: reference, issuedBy: `${by.name} (recorded on their behalf, not signed)`, template: `${t.nameEn}, text version ${t.bodyVersion}`, consentChecked: consent.rows.length ? `${consent.rows.length} extension(s), from the recommended tenderer` : null }));
    await moveExercise(this.db as never, l.ex, "EVALUATED", { today, via: "REPORT_ISSUED", reportFaults: 0 });
    this.entry("SourcingExercise", exerciseId, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", at, diffFields({ status: l.ex.status }, { status: "EVALUATED" }));
    return reference;
  }

  async paper(exerciseId: string, by: { id: string; name: string }, at: Date) {
    const { recommendedPriceOf } = await import("../src/lib/evaluation/facts");
    const { renderEvaluationInstrument } = await import("../src/lib/evaluation/instrument");
    const { renderFaults } = await import("../src/lib/evaluation/proposal");
    const { reportFields } = await import("../src/lib/evaluation/report");
    const { EVALUATION_ENTITY } = await import("../src/lib/evaluation/audit-view");
    const { l, c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const f = c.facts!;
    const rec = e.recommendation!;
    const rb = f.bidders.find((b) => b.id === rec.bidderId)!;
    const t = c.policy!.proposalTemplate!;
    const template = { id: t.id, code: t.code, nameEn: t.nameEn, bodyEn: t.bodyEn, bodyMs: t.bodyMs, primaryLanguage: t.primaryLanguage, bodyVersion: t.bodyVersion };
    const office = (code: string | null | undefined) => (code ? (c.roster.offices.find((o) => o.code === code)?.nameEn ?? "") : "");
    const org = await this.db.organisation.findUniqueOrThrow({ where: { id: this.org }, select: { name: true } });
    const rendered = renderEvaluationInstrument("PROPOSAL", template, () => reportFields({ facts: f, exercise: { reference: l.ex.reference, title: l.ex.title }, version: e.version, reference: e.reportReference!, issuedOn: formatDate(dayIn(e.issuedAt!, this.tz)), recommendation: { bidderId: rec.bidderId, price: recommendedPriceOf(rb), period: rb.period, topRanked: rec.topRanked, justification: rec.justification } }, org.name, { "proposal.checkerOffice": office(c.policy!.checkerRoleCode), "proposal.recommenderOffice": office(c.policy!.recommenderRoleCode) }));
    refuse("producing the Kertas Cadangan", renderFaults({ rendered: e.proposalPaper != null, checkerRoleCode: c.policy!.checkerRoleCode, recommenderRoleCode: c.policy!.recommenderRoleCode, template: rendered, personActive: true }));
    const id = `${e.id}_kc`;
    await this.db.proposalPaper.create({ data: { id, organisationId: this.org, evaluationId: e.id, templateId: t.id, templateCode: t.code, templateBodyVersion: t.bodyVersion, language: rendered.language!, renderedText: rendered.text!, frozenAt: at, renderedByPersonId: by.id, checkerRoleCode: c.policy!.checkerRoleCode!, recommenderRoleCode: c.policy!.recommenderRoleCode! } });
    this.entry(EVALUATION_ENTITY.proposal, id, label(e.version, "Kertas Cadangan"), "CREATE", at, diffFields(null, { produced: `${t.nameEn}, text version ${t.bodyVersion}`, language: "English", checkedBy: office(c.policy!.checkerRoleCode), recommendedBy: office(c.policy!.recommenderRoleCode), producedBy: `${by.name} (recorded on their behalf, not signed)` }));
  }

  async sign(exerciseId: string, role: "CHECKER" | "RECOMMENDER", who: { id: string; name: string }, at: Date) {
    const { signerFaults } = await import("../src/lib/evaluation/proposal");
    const { EVALUATION_ENTITY, signerFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const p = e.proposalPaper!;
    const roleCode = role === "CHECKER" ? p.checkerRoleCode : p.recommenderRoleCode;
    const day = dayIn(at, this.tz);
    refuse(`recording the ${role.toLowerCase()}`, signerFaults({ rendered: true, already: role === "CHECKER" ? !!p.checkedByPersonId : !!p.recommendedByPersonId, personId: who.id, personActive: true, otherSignerId: (role === "CHECKER" ? p.recommendedByPersonId : p.checkedByPersonId) ?? null, holdsOffice: c.holdsOffice(who.id, roleCode, dayToDate(day)), day, today: day, paperDay: dayIn(p.frozenAt, this.tz) }));
    await this.db.proposalPaper.update({ where: { id: p.id }, data: role === "CHECKER" ? { checkedByPersonId: who.id, checkedOn: dayToDate(day), checkedRecordedAt: at } : { recommendedByPersonId: who.id, recommendedOn: dayToDate(day), recommendedRecordedAt: at } });
    const office = c.roster.offices.find((o) => o.code === roleCode)?.nameEn ?? "";
    this.entry(EVALUATION_ENTITY.proposal, p.id, label(e.version, "Kertas Cadangan"), "UPDATE", at, diffFields(null, signerFields({ role, name: who.name, office, day })));
  }

  /// A scan attached to one of the evaluation's owners, as attachDocument judges it (the owner open, the purpose its own).
  async attach(exerciseId: string, owner: { evaluationId?: string; evaluationMeetingId?: string; evaluationBidderId?: string }, docId: string, purpose: "SIGNED_REPORT" | "SIGNED_PROPOSAL_PAPER" | "TENDERER_CONFIRMATION" | "MEETING_MINUTES", title: string, at: Date) {
    const { demoPdf, writeDemoDocs } = await import("./demo-documents");
    const { l, c, label } = await this.ctx(exerciseId);
    const when = at.toISOString().slice(0, 16);
    const full = `${title}, ${l.ex.reference}`;
    const e = await writeDemoDocs(this.db, this.org, [{
      id: docId, title: full, classId: `${P}dc2`, className: "Certificates", classification: "SULIT", createdAt: when,
      versions: [{ id: `${docId}v1`, n: 1, bytes: demoPdf([`${full} (demo, SULIT)`, "Signed on paper.", "Listed, never opened in the portal before sign-in."]), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: dayIn(at, this.tz), storedAt: when }],
      attachments: [{ id: `${docId}a1`, purpose, owner, ownerLabel: label(c.current!.version, title), versionId: `${docId}v1`, at: when }],
    }], `${P}${docId.slice(P.length)}au`, HOD_CP);
    await e.flush();
  }

  async meeting(exerciseId: string, id: string, listingNo: number, kind: "CLARIFICATION" | "NEGOTIATION", i: { place: string; heldOn: string }, by: { id: string; name: string }, at: Date) {
    const { meetingEligible, openMeetingFaults } = await import("../src/lib/evaluation/meetings");
    const { finalRunning } = await import("../src/lib/evaluation/stages");
    const { EVALUATION_ENTITY, meetingFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const b = this.bidder(c, listingNo);
    const request = e.negotiations.filter((x) => x.bidderId === b.id).at(-1) ?? null;
    refuse(`recording the meeting with bid No. ${listingNo}`, openMeetingFaults({ kind, bidderInRunning: meetingEligible(kind, !b.excludedReason && finalRunning(c.facts!).some((x) => x.id === b.id)), route: request ? { status: request.approvalInstance.status } : null, openAlready: e.meetings.some((m) => m.bidderId === b.id && m.kind === kind && !m.closedAt), heldOn: i.heldOn, startedOn: dayIn(e.startedAt, this.tz), today: dayIn(at, this.tz), place: i.place, personActive: true }));
    if (e.recommendation) fail("a meeting after the recommendation");
    const round = e.meetings.filter((m) => m.bidderId === b.id && m.kind === kind).length + 1;
    await this.db.evaluationMeeting.create({ data: { id, organisationId: this.org, evaluationId: e.id, bidderId: b.id, kind, round, heldOn: dayToDate(i.heldOn), place: i.place, openedByPersonId: by.id, openedAt: at } });
    this.entry(EVALUATION_ENTITY.meeting, id, label(e.version, `${kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${listingNo}, round ${round}`), "CREATE", at, diffFields(null, meetingFields({ kind, round, heldOn: i.heldOn, place: i.place, by: by.name })));
  }

  async closeMeeting(exerciseId: string, id: string, minutes: string, by: { id: string; name: string }, at: Date) {
    const { closeMeetingFaults } = await import("../src/lib/evaluation/meetings");
    const { isLive } = await import("../src/lib/documents/evidence");
    const { EVALUATION_ENTITY, closeFields } = await import("../src/lib/evaluation/audit-view");
    const { ceilingOf } = await import("../src/lib/evaluation/repo");
    const { l, c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const m = e.meetings.find((x) => x.id === id) ?? fail(`no meeting ${id}`);
    refuse("closing the meeting", closeMeetingFaults({ kind: m.kind, closed: m.closedAt != null, minutes, liveConfirmations: m.attachments.filter((a) => a.purpose === "TENDERER_CONFIRMATION" && isLive(a)).length, priceBefore: null, priceAfter: null, personActive: true, ceiling: ceilingOf(l.ex) }));
    await this.db.evaluationMeeting.update({ where: { id }, data: { minutes, closedAt: at, closedByPersonId: by.id } });
    const listing = c.facts!.bidders.find((b) => b.id === m.bidderId)!.listingNo;
    this.entry(EVALUATION_ENTITY.meeting, id, label(e.version, `${m.kind === "CLARIFICATION" ? "Clarification" : "Negotiation"} with bid No. ${listing}, round ${m.round}`), "UPDATE", at, diffFields({ closed: null }, closeFields({ minutes, priceBefore: null, priceAfter: null, by: by.name, at }, this.tz)));
  }

  /// requestNegotiation: the engine's route on the `negotiation` domain, resolved now from the demo's matrix rule.
  async negotiation(exerciseId: string, id: string, routeId: string, listingNo: number, reason: string, by: { id: string; name: string }, at: Date) {
    const { negotiationRequestFaults } = await import("../src/lib/evaluation/meetings");
    const { negotiationRouteForRequester } = await import("../src/lib/evaluation/route");
    const { finalRunning } = await import("../src/lib/evaluation/stages");
    const { NEGOTIATION_DOMAIN } = await import("../src/lib/evaluation/types");
    const { EVALUATION_ENTITY } = await import("../src/lib/evaluation/audit-view");
    const { evaluationContext } = await import("../src/lib/method/repo");
    const { exerciseRouteMatter, requesterHolding } = await import("../src/lib/method/approval");
    const { loadDelegations, loadRoster } = await import("../src/lib/people/load");
    const { ORGANISATION_CODE } = await import("../src/lib/org");
    const { pathTo } = await import("../src/lib/organisation/structure");
    const { holdersFor } = await import("../src/lib/requisition/holders");
    const { boundaryOperatorFor } = await import("../src/lib/authority/resolve");
    const { routeCoreFields, stepOrigin } = await import("../src/lib/authority/core-routing");
    const { windowChangeRejectionSnapshot } = await import("../src/lib/window/edit");
    const { ACT_LABEL } = await import("../src/lib/labels");
    const { l, c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const b = this.bidder(c, listingNo);
    const today = dayIn(at, this.tz);
    const { issue, ctx, cfg } = await evaluationContext(l.org, l.req, l.ex);
    if (!issue || !ctx) fail("no approval matrix is in force");
    const method = cfg.config.methods.find((m) => m.code === l.ex.sourcingMethodCode)!;
    const value = parseSen(l.ex.estimatedValue.toString());
    const roster = await loadRoster(ORGANISATION_CODE);
    const delegations = await loadDelegations(ORGANISATION_CODE);
    const units = await this.db.orgUnit.findMany({ where: { organisationId: this.org } });
    const unitPath = pathTo(units as never, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(today)).reverse().map((u) => u.code);
    const res = negotiationRouteForRequester(ctx!.funder, method, Number(senToDecimalString(value)), requesterHolding((code) => holdersFor(code, unitPath, roster, delegations, today), l.req.requestingPersonId, value, (pid) => roster.people.some((p) => p.id === pid && p.isActive && p.isAvailable)));
    refuse("asking for the negotiation", negotiationRequestFaults({ bidderInRunning: !b.excludedReason && finalRunning(c.facts!).some((x) => x.id === b.id), reason, pending: e.negotiations.some((x) => x.bidderId === b.id && x.approvalInstance.status === "PENDING"), routeState: res.routeState, personActive: true, today }));
    if (res.refusal || res.warnings.some((w) => w.level === "err")) fail(`the negotiation's route is refused (${res.refusal ?? res.warnings.map((w) => w.messageEn).join(" ")})`);
    const rule = issue!.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
    const roleLabel = (code: string) => issue!.matrix.roles[code]?.nameEn ?? "";
    await this.db.approvalInstance.create({
      data: {
        id: routeId, organisationId: this.org, matterKind: "EXERCISE", exerciseId, domain: NEGOTIATION_DOMAIN, value: l.ex.estimatedValue, authorityMatrixId: issue!.id, matrixLabel: issue!.label,
        ruleKey: rule.ruleKey, ruleLabel: rule.labelEn, ruleClause: rule.clause, boundaryValue: String(issue!.matrix.policy.boundaryValue), boundaryInclusive: issue!.matrix.policy.boundaryInclusive, ruleFollowsBoundarySwitch: rule.followsBoundarySwitch, boundaryOperator: boundaryOperatorFor(rule, issue!.matrix.policy),
        fundingRouteCode: l.req.fundingRouteCode, fundingOverrideApplied: false, checkedAgainstMatrix: true, warnings: res.warnings as never, status: "PENDING", openedAt: dayToDate(today), createdAt: at,
        ...windowChangeRejectionSnapshot(at), ...routeCoreFields(res.core, at),
        steps: { create: res.chain.map((s, i) => ({ id: `${routeId}_s${i + 1}`, sequence: i + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
      },
    });
    await this.db.negotiationRequest.create({ data: { id, organisationId: this.org, evaluationId: e.id, bidderId: b.id, reason, approvalInstanceId: routeId, requestedByPersonId: by.id, requestedAt: at } });
    this.entry("ApprovalInstance", routeId, `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`, "CREATE", at, diffFields(null, { matter: `Negotiation with bid No. ${listingNo}`, matrix: issue!.label, rule: rule.labelEn, route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: "not held; may be asked again" }));
    this.entry(EVALUATION_ENTITY.negotiation, id, label(e.version, `Negotiation with bid No. ${listingNo}`), "CREATE", at, diffFields(null, { negotiationWith: `Bid No. ${listingNo}`, why: reason, askedBy: `${by.name} (recorded on their behalf, not signed)` }), reason);
  }

  /// recordNegotiationDecision: a named Person's decision on the route's step, judged by 6.1's checks.
  async decideNegotiation(exerciseId: string, routeId: string, decision: "DONE" | "REJECTED", person: { id: string; name: string }, on: string, reason: string, at: Date) {
    const { closeRejected } = await import("../src/lib/approvals/rejection-store");
    const { personDecisionWrite } = await import("../src/lib/authority/decided-step");
    const { actingOffice } = await import("../src/lib/authority/escalation");
    const { NEGOTIATION_REFUSED_DECIDED_BY } = await import("../src/lib/evaluation/route");
    const { NEGOTIATION_DOMAIN } = await import("../src/lib/evaluation/types");
    const { exerciseRouteMatter } = await import("../src/lib/method/approval");
    const { loadDelegations, loadRoster } = await import("../src/lib/people/load");
    const { ORGANISATION_CODE } = await import("../src/lib/org");
    const { pathTo } = await import("../src/lib/organisation/structure");
    const { deciderFaults, holdersFor } = await import("../src/lib/requisition/holders");
    const { l } = await this.ctx(exerciseId);
    const full = await this.db.approvalInstance.findUniqueOrThrow({ where: { id: routeId }, include: { steps: { orderBy: { sequence: "asc" } } } });
    const step = full.steps.find((s) => s.decision === "PENDING") ?? fail("no step to decide");
    const roster = await loadRoster(ORGANISATION_CODE);
    const delegations = await loadDelegations(ORGANISATION_CODE);
    const units = await this.db.orgUnit.findMany({ where: { organisationId: this.org } });
    const unitPath = pathTo(units as never, l.req.sectionUnitCode || l.req.requestingUnitCode, dayToDate(on)).reverse().map((u) => u.code);
    const p = await this.db.person.findUniqueOrThrow({ where: { id: person.id }, select: { id: true, name: true, isActive: true } });
    const check = deciderFaults(step, { today: dayIn(at, this.tz), holders: actingOffice(step) ? holdersFor(actingOffice(step)!, unitPath, roster, delegations, on) : { scope: null, holderIds: [], delegates: [] }, declaredConflictIds: [], person: p, requesterId: l.req.requestingPersonId, endorserIds: [], otherDeciderIds: [], earlierDone: true, decidedOn: on, openedOn: storedDay(full.openedAt), value: parseSen(l.ex.estimatedValue.toString()) });
    if (check.faults.length) fail(`the negotiation's decision is refused (${check.faults.join(", ")})`);
    await this.db.approvalStep.update({ where: { id: step.id }, data: personDecisionWrite({ decision, person: { id: p.id, name: p.name }, decidedOn: dayToDate(on), delegationId: check.delegationId, reason, recordedAt: at }) });
    this.entry("ApprovalStep", step.id, `${l.ex.reference} · ${step.roleLabel}`, "UPDATE", at, diffFields({ decision: step.decision }, { decision, decidedBy: p.name, decidedOn: dayToDate(on), recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);
    const routeLabel = `${l.ex.reference} · ${exerciseRouteMatter(NEGOTIATION_DOMAIN).auditNoun}`;
    if (decision === "REJECTED") await closeRejected(this.db as never, { organisationId: this.org, routeLabel }, full as never, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, reason, NEGOTIATION_REFUSED_DECIDED_BY);
  }
}

// ------------------------------------------------------------------ the load

export interface EvaluationDemoHooks {
  /// demo.ts's determination of draft exercises (bands, snapshot, trail), as a save writes it.
  determine(ids: string[]): Promise<void>;
}

/**
 * Load 6.8's demo on the exercises the earlier demos opened, and on its own quotation demo_sx21 (67-C3:
 * 6.7's claim, carried here), taken through 6.2, 6.4, 6.5, 6.6 and 6.7 by their own acts. Returns the
 * sitting it adds (in progress, not minuted: demo.ts gives it no minuted trail).
 */
export async function loadEvaluationDemo(db: Db, organisationId: string, hooks: EvaluationDemoHooks): Promise<{ sittings: string[] }> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const { W } = calendarOf(L);
  const T = (d: string, hhmm: string) => instantAt(d, hhmm, tz)!;
  const now = new Date();
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}evau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, unattributed: true });
  const acts = new EvaluationActs(db, organisationId, tz, entry);
  let doc = 110;
  const nextDoc = () => `${P}doc${doc++}`;

  // ================================================================ sx21: a quotation to its opening (67-C3)
  await loadQuotation(db, organisationId, tz, W, T, hooks, nextDoc);

  // ================================================================ sx16: evaluated, tabled
  const sx16 = `${P}sx16`;
  const [impl] = IMPLEMENTING;
  const [proc] = PROCUREMENT;
  // The closing as the exercise's own loader reads it (X-2: the demo never selects the column itself).
  const close16 = (await acts.ctx(sx16)).l.ex.closingAt ?? fail("sx16 has no closing");
  if (ago(146) <= close16) fail("sx16 closed too close to now to be evaluated before the award");
  await acts.start(sx16, `${P}evl1`, { by: proc, appointedOn: L, at: ago(145) });
  // Technical: marks out of 40, and the two criteria of the 60-mark group (35 and 25).
  const tech: [number, string, string, string][] = [
    [1, "34", "30", "21"],
    [2, "30", "28", "20"],
    [3, "28", "25", "18"],
    [4, "26", "22", "15"],
    [5, "32", "29", "19"],
  ];
  let k = 0;
  for (const [bid, method, similar, staff] of tech) {
    await acts.score(sx16, bid, "technical", "method", { marks: method }, impl, ago(144 - k++ * 0.1));
    await acts.score(sx16, bid, "technical", "similar", { marks: similar }, impl, ago(144 - k++ * 0.1));
    await acts.score(sx16, bid, "technical", "staff", { marks: staff }, impl, ago(144 - k++ * 0.1));
  }
  await acts.submit(sx16, "technical", impl, ago(140));
  // Financial: the standing marks, then each bid's factor and three monthly balances.
  const fin: [number, string, string, [string, string, string]][] = [
    [1, "72", "contractor_materials", ["51200.00", "49800.00", "53300.00"]],
    [2, "80", "employer_materials", ["35000.00", "33500.00", "36200.00"]],
    [3, "60", "contractor_materials", ["48000.00", "47500.00", "49100.00"]],
    [5, "50", "employer_materials", ["30000.00", "29000.00", "31000.00"]],
  ];
  k = 0;
  for (const [bid, marks, factor, balances] of fin) {
    await acts.score(sx16, bid, "financial", "standing", { marks }, proc, ago(138 - k * 0.5));
    await acts.inputs(sx16, bid, { factor, balances }, proc, ago(138 - k * 0.5 - 0.2));
    k++;
  }
  await acts.submit(sx16, "financial", proc, ago(134));
  // The aspects of the three bids still in the running.
  const verdicts: [number, [("SATISFACTORY" | "NOT_SATISFACTORY"), string][]][] = [
    [1, [["SATISFACTORY", "Every item on the checklist was found with the bid at the opening."], ["SATISFACTORY", "About 3% below the company estimate: a reasonable price for the scope."], ["SATISFACTORY", "Twelve months, as the documents ask."], ["SATISFACTORY", "Two similar inlet mains completed in the last three years; the site agent is named."]]],
    [2, [["NOT_SATISFACTORY", "The registration background form was absent at the opening and was not supplied after."], ["SATISFACTORY", "About 4% above the company estimate."], ["NOT_SATISFACTORY", "Fourteen months: two longer than the documents ask."], ["SATISFACTORY", "Capable: similar works completed for another authority."]]],
    [3, [["SATISFACTORY", "Every item on the checklist was found with the bid at the opening."], ["SATISFACTORY", "About 6% above the company estimate."], ["SATISFACTORY", "Twelve months, as the documents ask."], ["SATISFACTORY", "Capable, with a smaller team than the others."]]],
  ];
  k = 0;
  for (const [bid, vs] of verdicts) {
    for (const [i, [v, narrative]] of vs.entries()) await acts.aspect(sx16, bid, ASPECTS[i].code, v, narrative, impl, ago(132 - k++ * 0.2));
  }
  await acts.submit(sx16, "aspects", impl, ago(128));
  await acts.submit(sx16, "composite", proc, ago(126));
  await acts.recommend(sx16, 1, proc, ago(124));
  await acts.issue(sx16, proc, ago(122));
  await acts.paper(sx16, proc, ago(120));
  await acts.sign(sx16, "CHECKER", HOD_CP, ago(118));
  await acts.sign(sx16, "RECOMMENDER", FD, ago(116));
  await acts.attach(sx16, { evaluationId: `${P}evl1` }, nextDoc(), "SIGNED_REPORT", "Signed evaluation report", ago(114));
  await acts.attach(sx16, { evaluationId: `${P}evl1` }, nextDoc(), "SIGNED_PROPOSAL_PAPER", "Signed Kertas Cadangan", ago(113));
  const sittings = await tableAppointment(db, organisationId, tz, entry, { sx: sx16, on: L, at: ago(100) });

  // ================================================================ sx21: under evaluation
  const sx21 = QUOTATION;
  const d3 = W(3);
  const d2 = W(2);
  const d1 = W(1);
  await acts.start(sx21, `${P}evl2`, { by: proc, appointedOn: d3, at: T(d3, "10:00") });
  await acts.score(sx21, 1, "technical", "method", { marks: "16" }, impl, T(d3, "11:00"));
  await acts.score(sx21, 1, "technical", "experience", { marks: "24" }, impl, T(d3, "11:05"));
  await acts.score(sx21, 2, "technical", "method", { marks: "14" }, impl, T(d3, "11:10"));
  await acts.score(sx21, 2, "technical", "experience", { marks: "21" }, impl, T(d3, "11:15"));
  await acts.submit(sx21, "technical", impl, T(d3, "15:00"));
  await acts.shortlist(sx21, "shortlist", [1, 2], proc, T(d2, "10:00"));
  // A clarification with bid No. 2, held, its confirmation attached, closed on its minutes.
  const meeting = `${P}evmt1`;
  await acts.meeting(sx21, meeting, 2, "CLARIFICATION", { place: "Northern Region office, 12 Depot Road", heldOn: d2 }, proc, T(d2, "11:30"));
  await acts.attach(sx21, { evaluationMeetingId: meeting }, nextDoc(), "TENDERER_CONFIRMATION", "Tenderer's written confirmation of the clarification", T(d2, "16:00"));
  await acts.closeMeeting(sx21, meeting, "The tenderer confirmed in writing that its rate for the roof membrane includes the edge flashings and the access scaffold; nothing else changed.", proc, T(d1, "10:00"));
  // The financial capacity in progress: bid No. 1's factor and balances recorded, bid No. 2's not yet.
  await acts.inputs(sx21, 1, { factor: "contractor_materials", balances: ["21000.00", "19800.00", "22400.00"] }, proc, T(d2, "14:00"));
  // A negotiation asked for with bid No. 1, refused on its route: no negotiation is held (the block shows).
  await acts.negotiation(sx21, `${P}evng1`, EVALUATION_DEMO_IDS.negotiationRoute, 1, "Its price is the lowest in the running; the Northern Region asks whether the roof membrane's rate can come down.", proc, T(d1, "11:00"));
  await acts.decideNegotiation(sx21, EVALUATION_DEMO_IDS.negotiationRoute, "REJECTED", { id: `${P}p7`, name: "Gopal Nair" }, d1, "The price is within the estimate: no negotiation is needed.", T(d1, "15:00"));

  if (trail.some((e) => e.at > now)) fail("an act is dated after now (X-10 a)");
  await db.auditEntry.createMany({ data: trail as never });
  return { sittings };
}

// ------------------------------------------------------------------ demo_sx21: a quotation to its opening (67-C3, 6.7's claim)

export const QUOTATION = `${P}sx21`;
const SX = (n: number) => `DEMO/SX/${String(n).padStart(4, "0")}/2026`;
const REQ = (n: number) => `DEMO/REQ/${String(n).padStart(4, "0")}/2026`;
const QUOTATION_COMMITTEE = { id: `${P}c7`, code: "QUOTE_OPENING", nameEn: "Quotation Opening Committee" };
const Q_CHAIR = { id: `${P}p15`, name: "Mohd Rizal Ahmad" };
const Q_MEMBER = { id: `${P}p16`, name: "Azlan Shah Demo" };
const CLERK = { id: `${P}p4`, name: "Daniel Anak Jelani" };

/**
 * demo_sx21 "Service reservoir roof repairs, Demo Hill", an open quotation of RM280,000 (rq40, route
 * demo_ai74), taken by the earlier modules' own acts: 6.2's panel and estimate, 6.4's documents (route
 * demo_ai75), 6.5's window (published with demo_evm2 pinned), three sets sold, 6.6's three envelopes and
 * the box locked, and 6.7's opening demo_op4 by the Quotation Opening Committee demo_c7 (a panel of two
 * from outside Contract & Procurement; the open quotation's bids eliminated for an incomplete offer,
 * ELIMINATE, ASSUMED) — three bids read, all complete and carried; one priced above the quotation ceiling.
 */
async function loadQuotation(db: Db, organisationId: string, tz: string, W: (k: number) => string, T: (d: string, t: string) => Date, hooks: EvaluationDemoHooks, nextDoc: () => string) {
  const { BIG, CHANNELS, COMPLETE_APPENDIX, FIRMS, QUOTATION_FEE_BASIS, quotationWindow, scopeReady, Acts } = await import("./demo-window");
  const { answer, conditionsFor, confirm, decide, enterAppendix, markAllReady, moveIntoPreparation, startPack, submit } = await import("./demo-tender-docs");
  const { answers, Receipts } = await import("./demo-bids");
  const { OpeningActs } = await import("./demo-opening");
  const { demoPdf, writeDemoDocs } = await import("./demo-documents");
  const { committeePanelFaults, methodOpeningFaults, personUnitFault } = await import("../src/lib/opening/config");
  const { ACT_LABEL } = await import("../src/lib/labels");
  const L = todayIn(new Date(), tz)!;
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}evqau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, unattributed: true });
  const iso = (at: Date) => at.toISOString().slice(0, 16);
  const docs = async (ds: Parameters<typeof writeDemoDocs>[2]) => {
    if (!ds.length) return;
    const e = await writeDemoDocs(db, organisationId, ds, `${P}evqdoc${ds[0].id.slice(P.length)}au`, HOD_CP);
    await e.flush();
  };

  // ---- configuration, dated W(16): the committee, its second member, the method's rules, the negotiation's rule
  const cfgAt = T(W(16), "11:00");
  const units = (await db.orgUnit.findMany({ where: { organisationId }, select: { code: true } })).map((u) => u.code);
  if (personUnitFault("NTH", units)) fail("the Northern Region is not configured");
  await db.person.create({ data: { id: Q_MEMBER.id, organisationId, staffNo: "D016", name: Q_MEMBER.name, email: "azlan.shah@demo.invalid", jobTitle: "Engineer, Northern Region", jobTitleMs: "Jurutera, Wilayah Utara", orgUnitCode: "NTH", department: "Northern Region" } });
  entry("Person", Q_MEMBER.id, Q_MEMBER.name, "CREATE", cfgAt, diffFields(null, { name: Q_MEMBER.name, jobTitle: "Engineer, Northern Region", orgUnitCode: "NTH" }));
  const panel = { panelSize: 2, panelSizeProvenance: "ASSUMED" as const, panelExclusionRule: true, panelExcludesUnitCode: "CP", panelExclusionProvenance: "ASSUMED" as const };
  refuse("the quotation committee's opening panel", committeePanelFaults(panel, { units }, "Invented for the demo.", true));
  await db.committee.create({ data: { id: QUOTATION_COMMITTEE.id, organisationId, code: QUOTATION_COMMITTEE.code, nameEn: QUOTATION_COMMITTEE.nameEn, nameMs: "Jawatankuasa Pembuka Sebut Harga", mandate: "Opens the quotations received and records the schedule.", governingSource: "Demo policy 7 (invented)", action: "RECOMMENDS", compositionProvenance: "ASSUMED", secretariatRoleCode: "HOD_CP", ...panel, notes: "Panel size and independence rule invented for the demo (ASSUMED)." } });
  await db.committeeMember.createMany({ data: [{ id: `${P}m63`, committeeId: QUOTATION_COMMITTEE.id, personId: Q_CHAIR.id, position: "CHAIRMAN", provenance: "ASSUMED", effectiveFrom: dayToDate(W(30)) }, { id: `${P}m64`, committeeId: QUOTATION_COMMITTEE.id, personId: Q_MEMBER.id, position: "MEMBER", provenance: "ASSUMED", effectiveFrom: dayToDate(W(30)) }] });
  entry("Committee", QUOTATION_COMMITTEE.id, QUOTATION_COMMITTEE.nameEn, "CREATE", cfgAt, diffFields(null, { name: QUOTATION_COMMITTEE.nameEn, seats: `${Q_CHAIR.name} (chairman), ${Q_MEMBER.name}`, openingPanelMembers: 2, openingPanelExcludes: "Contract & Procurement", from: "Assumed" }));
  const committees = (await db.committee.findMany({ where: { organisationId, retiredOn: null }, select: { code: true } })).map((c) => c.code);
  const method = await db.sourcingMethod.findFirstOrThrow({ where: { organisationId, code: "open_quotation" }, select: { id: true, nameEn: true } });
  const rule = { committeeCode: QUOTATION_COMMITTEE.code, committeeProvenance: "ASSUMED" as const, unpurchased: null, unpurchasedProvenance: null };
  refuse("the open quotation's opening rules", methodOpeningFaults(rule as never, { committees }));
  await db.sourcingMethod.update({ where: { id: method.id }, data: { openingCommitteeCode: rule.committeeCode, openingCommitteeProvenance: "ASSUMED", lateAdmissionCommitteeCode: "QUOTE_CTTE", lateAdmissionProvenance: "ASSUMED", completenessEliminates: true, completenessProvenance: "ASSUMED" } });
  entry("SourcingMethod", method.id, method.nameEn, "UPDATE", cfgAt, diffFields({ openingCommittee: null, lateAdmissionCommittee: null, anIncompleteBid: null }, { openingCommittee: QUOTATION_COMMITTEE.nameEn, lateAdmissionCommittee: "Quotation Committee", anIncompleteBid: "Eliminated", from: "Assumed" }), "Invented for the demo.");
  await db.authorityRule.create({ data: { id: `${P}rule45`, authorityMatrixId: `${P}mx1`, ruleKey: "demo.negotiation.quotation", domain: "negotiation", method: "quotation", labelEn: "Negotiation with a quotation's bidder", approverCode: "DIV_HEAD", clause: "DEMO 6.4", sortOrder: 45, generateCoreChain: false, coreChainReason: "One office approves a negotiation: nothing to generate (demo)." } });
  entry("AuthorityRule", `${P}rule45`, "Negotiation with a quotation's bidder", "CREATE", cfgAt, diffFields(null, { rule: "Negotiation with a quotation's bidder", approver: "Head of Division", act: ACT_LABEL.A ?? "Approve", clause: "DEMO 6.4" }));

  // ---- the requisition, approved (demo_rq40, route demo_ai74)
  const rq = `${P}rq40`;
  const value = "280000.00";
  const title = "Service reservoir roof repairs, Demo Hill";
  {
    const raised = W(26);
    const endorsed = W(25);
    const checked = W(24);
    const steps = BIG.chain.map((_, i) => W(23 - i));
    const approvedOn = steps[steps.length - 1];
    const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: `${P}bcode9` } });
    const original = movements.filter((m) => m.kind === "ORIGINAL").reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    const balance = original - movements.filter((m) => m.kind === "COMMITMENT" && !m.releasedOn).reduce((a, m) => a + parseSen(m.amount.toString()), 0n);
    if (balance < parseSen(value)) fail("the budget code has no room for sx21's requisition");
    const fmt = (x: bigint) => senToDecimalString(x);
    await db.requisition.create({
      data: {
        id: rq, organisationId, reference: REQ(42), origin: "PORTAL", erpRequisitionNo: "XR2026000342", erpNoteNo: "RN/2026/0342", erpRefSource: "MANUAL", erpRefRecordedAt: dayToDate(raised),
        requestingUnitCode: "NTH", sectionUnitCode: "NTH-MNT", requestingPersonId: `${P}p11`, title, justification: "The service reservoir's roof membrane has failed over the north bay and rainwater reaches the stored water.", needStatement: "Renew the roof membrane and its flashings.",
        costCentreCode: "CC-200", accountCode: "7400400", budgetCodeId: `${P}bcode9`, siteCode: "NTH-WKS", placeOfDelivery: "Northern network", dateRequired: dayToDate(W(-120)),
        estimatedValue: value, raisedOn: dayToDate(raised), fundingRouteCode: "capex", fundingSupersedesAuthority: false, sourcingPermitted: true, fundingPosture: "PROCURES", status: "APPROVED", commitmentMovementId: `${P}bm61`,
        lines: { create: [{ id: `${rq}l1`, lineNo: 1, description: title, estimatedAmount: value }] },
      },
    });
    await db.requisitionEndorsement.createMany({ data: [{ id: `${P}en40a`, requisitionId: rq, tier: "SECTION", unitCode: "NTH-MNT", personId: `${P}p10`, endorsedOn: dayToDate(endorsed) }, { id: `${P}en40b`, requisitionId: rq, tier: "DEPARTMENT", unitCode: "NTH", personId: `${P}p9`, endorsedOn: dayToDate(endorsed) }] });
    await db.requisitionBudgetCheck.create({ data: { id: `${P}bk40`, requisitionId: rq, checkedAt: dayToDate(checked), asAt: dayToDate(checked), source: "PORTAL_LEDGER", budgetCodeId: `${P}bcode9`, budgetCodeCode: "CAP26-050", requestedAmount: value, actualBudget: fmt(original), balanceAsAt: fmt(balance), approvedAccount: fmt(original - balance), approvedAccountProvenance: "ASSUMED", projectedBalance: fmt(balance - parseSen(value)), verdict: "WITHIN" } });
    await db.requisitionSplitCheck.create({ data: { id: `${P}sp40`, requisitionId: rq, checkedAt: dayToDate(checked), state: "CLEAR", windowDays: 45, matchOn: ["unit", "accountCode"], aggregateAcrossYear: false, policyProvenance: "ASSUMED", relatedRequisitionIds: [], relatedReferences: [] } });
    await db.budgetMovement.create({ data: { id: `${P}bm61`, budgetCodeId: `${P}bcode9`, kind: "COMMITMENT", amount: value, occurredOn: dayToDate(approvedOn), reference: REQ(42), description: title } });
    await db.approvalInstance.create({
      data: {
        id: `${P}ai74`, organisationId, matterKind: "REQUISITION", requisitionId: rq, domain: "requisition", value, authorityMatrixId: `${P}mx1`, matrixLabel: "Demo limits, issue 1", ruleKey: BIG.key, ruleLabel: BIG.label, ruleClause: BIG.clause,
        boundaryValue: "300000", boundaryInclusive: true, ruleFollowsBoundarySwitch: false, boundaryOperator: null, fundingRouteCode: "capex", budgetCheckId: `${P}bk40`, budgetVerdict: "WITHIN", availabilityCheck: "blocking", splitCheckId: `${P}sp40`, splitState: "CLEAR",
        checkedAgainstMatrix: true, status: "APPROVED", openedAt: dayToDate(checked), closedAt: T(approvedOn, "16:00"), commitOnApproval: true, routeCommitsBudget: true, createdAt: T(checked, "10:00"),
        steps: { create: BIG.chain.map(([roleCode, roleLabel, act, pid, name], i) => ({ id: `${P}rs40_${i + 1}`, sequence: i + 1, roleCode, roleLabel, act, nonDelegable: act === "MR", sourceRuleKey: BIG.key, decision: "DONE" as const, decidedByPersonId: `${P}${pid}`, decidedByName: name, decidedOn: dayToDate(steps[i]), recordedAt: T(steps[i], "11:00") })) },
      },
    });
    const label = `${REQ(42)} · ${title}`;
    entry("Requisition", rq, label, "CREATE", T(raised, "09:00"), diffFields(null, { reference: REQ(42), title, requestingUnitCode: "NTH", estimatedValue: value, status: "DRAFT" }));
    entry("Requisition", rq, label, "UPDATE", T(endorsed, "10:00"), diffFields({ status: "DRAFT" }, { status: "ENDORSED" }));
    entry("ApprovalInstance", `${P}ai74`, `${REQ(42)} · approval route`, "CREATE", T(checked, "10:00"), diffFields(null, { matrix: "Demo limits, issue 1", rule: BIG.label, route: BIG.chain.map(([, roleLabel, act]) => `${roleLabel} (${ACT_LABEL[act]?.toLowerCase() ?? "acts"})`).join(" → ") }));
    BIG.chain.forEach(([, roleLabel, , , name], i) => entry("ApprovalStep", `${P}rs40_${i + 1}`, `${REQ(42)} · ${roleLabel}`, "UPDATE", T(steps[i], "11:00"), diffFields({ decision: "PENDING" }, { decision: "DONE", decidedBy: name, decidedOn: dayToDate(steps[i]), recordedOnBehalf: "not signed" })));
    entry("Requisition", rq, label, "UPDATE", T(approvedOn, "16:00"), diffFields({ status: "PENDING_APPROVAL" }, { status: "APPROVED" }));
    await db.numberingSeries.update({ where: { id: `${P}n1` }, data: { nextSerial: 43 } });
  }

  // ---- the exercise, 6.2 and 6.4 by their own acts
  const sx = QUOTATION;
  const ref = SX(21);
  await db.sourcingExercise.create({ data: { id: sx, organisationId, reference: ref, requisitionId: rq, title, estimatedValue: value, sourcingMethodCode: "open_quotation", methodReason: "", status: "DRAFT", contractBasisCode: "ds", createdAt: T(W(22), "10:00") } });
  await db.exerciseScopePart.create({ data: { id: `${sx}p1`, exerciseId: sx, deliverableKind: "MEASURED_CONSTRUCTION", amount: value, description: title, sortOrder: 1 } });
  await db.numberingSeries.update({ where: { id: `${P}n5` }, data: { nextSerial: 22 } });
  await hooks.determine([sx]);
  const on = W(20);
  await scopeReady(db, organisationId, tz, sx, ref, 21, on, T, nextDoc, docs as never, entry, value);
  await moveIntoPreparation(db, organisationId, sx, on, { report: "works" }, entry);
  const pack = `${P}tpk21`;
  const packOn = W(19);
  await startPack(db, organisationId, { id: pack, exerciseId: sx, versionNo: 1, at: T(packOn, "08:30") }, entry);
  const parts = await db.tenderPackPart.findMany({ where: { packId: pack, source: "UPLOAD" }, orderBy: { sortOrder: "asc" } });
  await docs(parts.map((p, i) => {
    const did = nextDoc();
    const t = `${p.labelSnapshot}, ${ref}`;
    const at = iso(T(packOn, `08:${String(40 + i).padStart(2, "0")}`));
    return { id: did, title: t, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: at, versions: [{ id: `${did}v1`, n: 1, bytes: demoPdf([t, "Quotation document part (demo)."]), mediaType: "application/pdf", filename: `${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: packOn, storedAt: at }], attachments: [{ id: `${did}a1`, purpose: "TENDER_PART" as const, owner: { tenderPackPartId: p.id }, ownerLabel: `${ref} · Tender pack v1 · part ${p.printedNumber}, ${p.labelSnapshot}`, versionId: `${did}v1`, at }] };
  }));
  await enterAppendix(db, organisationId, pack, ref, COMPLETE_APPENDIX, T(packOn, "09:00"), entry);
  await conditionsFor(db, organisationId, sx, ref, [{ body: "demo_companies", group: 1 }, { body: "demo_contractors", qualifiers: "grade D2, category civil works", group: 2 }], T(packOn, "09:10"), entry);
  await answer(db, organisationId, sx, ref, { restrictedTender: false, regulatedActivity: true, regulatorPermitCode: "class_1" }, T(packOn, "09:20"), entry);
  await confirm(db, organisationId, pack, ref, "NO_AMBIGUITY", `${P}p4`, packOn, T(packOn, "09:30"), entry, L);
  await confirm(db, organisationId, pack, ref, "DRAWINGS_COORDINATED", `${P}p10`, packOn, T(packOn, "09:35"), entry, L);
  await markAllReady(db, organisationId, pack, ref, T(packOn, "10:00"), entry);
  const dates = { startOn: W(17), closingDay: W(5) };
  await submit(db, organisationId, { packId: pack, routeId: `${P}ai75`, at: T(packOn, "11:00"), startOn: dates.startOn, closingDay: dates.closingDay, closingTime: "15:00" }, entry);
  await decide(db, organisationId, { packId: pack, decision: "DONE", personId: `${P}p3`, decidedOn: W(18), at: T(W(18), "09:00"), reason: "", dates: { ...dates, closingTime: "15:00" } }, entry);

  // ---- 6.5: the window, published (demo_evm2 chosen and pinned), three sets sold
  const acts = new Acts(db, organisationId, tz, entry);
  await acts.saveWindow(sx, `${P}win21`, quotationWindow(W(17), W(8)), T(W(17), "09:30"));
  await acts.feeLines(sx, 21, QUOTATION_FEE_BASIS, T(W(17), "09:40"));
  await answers(db, organisationId, entry, sx, ref, { days: 90, provenance: "ASSUMED", alternativesPermitted: false, reason: "" }, T(W(17), "09:45"));
  for (const [i, c] of CHANNELS.entries()) await acts.publication(sx, `${P}pub21_${i + 1}`, c.id, W(17), c.reference(21), T(W(17), `10:0${i}`));
  await acts.publish(sx, T(W(17), "11:00"));
  const firms = [{ id: `${P}pty15`, ...FIRMS.teladan }, { id: `${P}pty16`, ...FIRMS.sampel }, { id: `${P}pty17`, ...FIRMS.rekaan }];
  for (const [i, f] of firms.entries()) await acts.sale(sx, `${P}sale${10 + i}`, { party: f, receiptNo: `FR/26/0044${10 + i}`, collectedBy: "Demo representative", paymentMethod: "Bank draft" }, T(W(15 - i), "10:00"));

  // ---- 6.6: three envelopes in time, the box locked at the closing
  const { loadExercise } = await import("../src/lib/method/repo");
  const close = (await loadExercise(sx))?.ex.closingAt ?? fail("sx21 has no closing");
  if (dayIn(close, tz) !== W(5)) fail("sx21 does not close on its closing day");
  const marks = `Quotation ${ref}, Service reservoir roof repairs, closing ${formatDate(W(5))} 3.00 pm`;
  const r = new Receipts(db, organisationId, tz, entry, sx, ref);
  for (const [i, id] of [`${P}env11`, `${P}env12`, `${P}env13`].entries()) await r.receive(id, { kind: "BID", channel: "COUNTER", markings: marks, by: CLERK, at: T(W(7 - i), "10:30") });
  await r.lock(`${P}box3`, HOD_CP, new Date(close.getTime() + 4 * 60_000), "Locked at the closing by the Head of Contract & Procurement.");

  // ---- 6.7: the opening by the Quotation Opening Committee, the same afternoon
  const op = new OpeningActs(db, organisationId, tz, entry);
  const day = W(5);
  const op4 = `${P}op4`;
  const sec = (at: Date, s: number) => new Date(at.getTime() + s * 1000);
  await op.start(sx, op4, { panel: [Q_CHAIR, Q_MEMBER], by: Q_CHAIR, at: T(day, "15:10") });
  await op.authorise(sx, op4, Q_CHAIR, T(day, "15:11"));
  await op.authorise(sx, op4, Q_MEMBER, sec(T(day, "15:11"), 30));
  const offers: [string, string, string, number][] = [[`${P}env11`, `${P}pty15`, "268400.00", 10], [`${P}env12`, `${P}pty16`, "279950.00", 12], [`${P}env13`, `${P}pty17`, "312600.00", 9]];
  for (const [i, [env, party, price, months]] of offers.entries()) {
    const at = T(day, `15:${String(13 + i * 4).padStart(2, "0")}`);
    const bid = `${P}ob${6 + i}`;
    await op.open(sx, op4, { id: bid, envelopeId: env, bidder: { partyId: party }, price, months, validityDays: 90, cls: "Grade D2", status: "Active", at });
    await op.initial(sx, bid, Q_CHAIR, sec(at, 60));
    await op.initial(sx, bid, Q_MEMBER, sec(at, 75));
    await op.answers(sx, bid, [], sec(at, 120));
    await op.verdict(sx, bid, "PASS", "", Q_CHAIR, sec(at, 150));
  }
  await op.signature(sx, op4, Q_CHAIR, day, T(day, "15:35"));
  await op.signature(sx, op4, Q_MEMBER, day, sec(T(day, "15:35"), 30));
  await op.details(sx, op4, 1, "The box was opened at 3.11 pm on the panel's two authorisations. Three quotations in time were opened, each complete, and read aloud. The estimate's paper copy was not in the box.", T(day, "15:37"));
  await op.finalise(sx, op4, Q_CHAIR, { notInBox: true }, T(day, "15:40"));
  await op.scan(sx, op4, nextDoc(), "Signed schedule of quotations", T(day, "15:50"));
  await op.explain(sx, op4, HOD_CP, "The estimate's copy was kept by the Head of Contract & Procurement when it was lodged, not placed in the box. Invented for the demo.", T(day, "15:55"));

  if (trail.some((e) => e.at > new Date())) fail("an act on sx21 is dated after now (X-10 a)");
  await db.auditEntry.createMany({ data: trail as never });
}

/**
 * The appointment on sx16 tabled at the Tender Board's sitting in progress (demo_mt14, attendance
 * demo_at64–67), as tableMatter judges it — the 6.10 tabling check and the evaluation's bundle (E-8) —
 * PENDING: the Board has not decided it.
 */
async function tableAppointment(db: Db, organisationId: string, tz: string, entry: Add, i: { sx: string; on: string; at: Date }): Promise<string[]> {
  const { checkTabling, secretariatHoldersOn } = await import("../src/lib/committee/tabling");
  const { loadRoster } = await import("../src/lib/people/load");
  const { ORGANISATION_CODE } = await import("../src/lib/org");
  const { bundleFaults } = await import("../src/lib/evaluation/bundle");
  const { loadEvaluationGate } = await import("../src/lib/evaluation/gate-read");
  const { APPOINTMENT_DOMAIN } = await import("../src/lib/method/types");
  const committee = await db.committee.findUniqueOrThrow({ where: { id: `${P}c1` }, select: { code: true, nameEn: true, secretariatRoleCode: true } });
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: i.sx }, select: { reference: true, title: true, estimatedValue: true } });
  const gate = await loadEvaluationGate(i.sx, db as never);
  refuse("tabling the appointment", bundleFaults(gate.bundle));
  const roster = await loadRoster(ORGANISATION_CODE);
  const tabling = checkTabling({ secretariatRoleCode: committee.secretariatRoleCode, tabledByPersonId: HOD_CP.id, holderIdsOnDate: secretariatHoldersOn(roster, committee.secretariatRoleCode, i.on).map((h) => h.id), tablingDay: i.on });
  if (!tabling.ok) fail(`the appointment could not be tabled (${tabling.fault})`);
  const mt = `${P}mt14`;
  await db.meeting.create({ data: { id: mt, committeeId: `${P}c1`, reference: "DEMO/SIT/5B/2026", meetingDate: dayToDate(i.on), status: "IN_PROGRESS", agenda: `Appointment: ${ex.title} (${ex.reference}), on evaluation report and Kertas Cadangan.` } });
  await db.meetingAttendance.createMany({ data: [{ id: `${P}at64`, meetingId: mt, personId: `${P}p1`, attended: true }, { id: `${P}at65`, meetingId: mt, personId: `${P}p2`, attended: true }, { id: `${P}at66`, meetingId: mt, personId: `${P}p3`, attended: true }, { id: `${P}at67`, meetingId: mt, personId: `${P}p7`, attended: true }] });
  const subject = `Appointment for ${ex.title}`;
  await db.committeeDecision.create({ data: { id: `${P}d43`, meetingId: mt, sequence: 1, domain: APPOINTMENT_DOMAIN, matterKind: "EXERCISE", matterRef: ex.reference, exerciseId: i.sx, subject, act: "A", amount: "612450.30", tabledByPersonId: HOD_CP.id, tabledAt: dayToDate(i.on), evaluationVersion: gate.version } });
  entry("Meeting", mt, `DEMO/SIT/5B/2026 · ${committee.nameEn}`, "CREATE", new Date(i.at.getTime() - 60_000), diffFields(null, { committee: committee.nameEn, reference: "DEMO/SIT/5B/2026", date: formatDate(i.on), status: "In progress" }));
  entry("CommitteeDecision", `${P}d43`, subject, "CREATE", i.at, diffFields(null, { subject, domain: APPOINTMENT_DOMAIN, matterKind: "EXERCISE", matterRef: ex.reference, act: "A", linkedExercise: ex.reference, tabledOnEvaluationVersion: gate.version, tabledBy: HOD_CP.name, tabledAt: formatDate(i.on) }));
  void tz;
  return [mt];
}

// ------------------------------------------------------------------ the read-back (X-10 b)

export async function checkEvaluationDemo(db: Db) {
  const { evaluationTabView } = await import("../src/lib/evaluation/read");
  const { loadEvaluationGate } = await import("../src/lib/evaluation/gate-read");
  const { evaluationGateFaults } = await import("../src/lib/evaluation/award-gate");
  const v = (await evaluationTabView(`${P}sx16`)) ?? fail("sx16 did not load");
  const cur = v.current ?? fail("sx16 has no evaluation");
  if (cur.state !== "Report issued") fail("sx16's report is not issued");
  if (cur.recommendation.ranked[0]?.listingNo !== 1) fail("sx16's top-ranked bid is not No. 1");
  const g = await loadEvaluationGate(`${P}sx16`);
  if (evaluationGateFaults(g.gate, `${P}pty2`).length) fail("sx16's award gate holds back the recommended tenderer");
  if (!evaluationGateFaults(g.gate, `${P}pty3`).some((f) => f.code === "AWARDEE_NOT_RECOMMENDED")) fail("another tenderer could be awarded on sx16");
  const ex = await db.sourcingExercise.findUniqueOrThrow({ where: { id: `${P}sx16` }, select: { status: true } });
  if (ex.status !== "EVALUATED") fail("sx16 is not Evaluated");
  const consent = await db.evaluation.findUniqueOrThrow({ where: { id: `${P}evl1` }, select: { consentCheckSnapshot: true } });
  if (!JSON.stringify(consent.consentCheckSnapshot).includes("CHECKED")) fail("sx16's extension consent was not checked against the recommendation");
  const pinned = await db.sourcingExercise.count({ where: { id: demoRef, evaluationModelPinnedAt: { not: null } } });
  const published = await db.exerciseWindow.count({ where: { exerciseId: demoRef, publishedAt: { not: null } } });
  if (pinned !== published) fail(`${published} demo exercises are published but ${pinned} pinned a model`);
  // sx21: the quotation (67-C3) mid-evaluation: open, two shortlisted, a clarification closed, a negotiation refused.
  const q = (await evaluationTabView(QUOTATION)) ?? fail("sx21 did not load");
  const qc = q.current ?? fail("sx21 has no evaluation");
  if (qc.state === "Report issued") fail("sx21's report should not be issued");
  if (qc.meetings.length !== 1 || !qc.meetings[0].closed || qc.meetings[0].confirmations !== 1) fail("sx21's clarification is not closed with its confirmation");
  if (qc.negotiations.length !== 1 || qc.negotiations[0].status !== "REJECTED") fail("sx21's negotiation request is not refused");
  const qx = await db.sourcingExercise.findUniqueOrThrow({ where: { id: QUOTATION }, select: { status: true } });
  if (qx.status !== "UNDER_EVALUATION") fail("sx21 is not Under evaluation");
  const shortlisted = await db.evaluationBidder.count({ where: { evaluationId: `${P}evl2`, shortlisted: true } });
  if (shortlisted !== 2) fail(`sx21 shortlists ${shortlisted} bids, not 2`);
}

// ------------------------------------------------------------------ the wipe

/**
 * Remove 6.8's demo: every evaluation on a demo exercise (or one removed with the demo) with its rows,
 * then the configuration the demo loaded. Before the openings (a bidder names an opened bid) and the
 * routes (a negotiation names its route). The documents attached to the evaluation's owners went with
 * the document wipe first.
 */
export async function wipeEvaluationDemo(db: Db, organisationId: string, exerciseIds: readonly string[]) {
  const onEx = { OR: [{ exerciseId: demoRef }, { exerciseId: { in: [...exerciseIds] } }] };
  const evs = await db.evaluation.findMany({ where: onEx, select: { id: true } });
  const ids = evs.map((e) => e.id);
  const byEv = { evaluationId: { in: ids } };
  const bidders = (await db.evaluationBidder.findMany({ where: byEv, select: { id: true } })).map((b) => b.id);
  await db.committeeDecision.updateMany({ where: { evaluationBidderId: { in: bidders } }, data: { evaluationBidderId: null } });
  await db.proposalPaper.deleteMany({ where: byEv });
  await db.recommendation.deleteMany({ where: byEv });
  await db.tendererCommunication.deleteMany({ where: byEv });
  await db.evaluationMeeting.deleteMany({ where: byEv });
  const negotiationRoutes = (await db.negotiationRequest.findMany({ where: byEv, select: { approvalInstanceId: true } })).map((x) => x.approvalInstanceId);
  await db.negotiationRequest.deleteMany({ where: byEv });
  await db.approvalStep.deleteMany({ where: { instanceId: { in: negotiationRoutes } } });
  await db.approvalInstance.deleteMany({ where: { id: { in: negotiationRoutes } } });
  await db.stageResult.deleteMany({ where: byEv });
  await db.stageSubmission.deleteMany({ where: byEv });
  await db.aspectAssessment.updateMany({ where: { bidderId: { in: bidders } }, data: { supersedesId: null } });
  await db.aspectAssessment.deleteMany({ where: { bidderId: { in: bidders } } });
  await db.evaluationScore.updateMany({ where: { bidderId: { in: bidders } }, data: { supersedesId: null, carriedFromScoreId: null } });
  await db.evaluationScore.deleteMany({ where: { bidderId: { in: bidders } } });
  await db.evaluationBidder.updateMany({ where: byEv, data: { carriedFromId: null } });
  await db.evaluationBidder.deleteMany({ where: byEv });
  await db.evaluationTeamMember.deleteMany({ where: byEv });
  // Deleted outright, never unlinked first: a LOOP version's decision (and a supplementary one's opening) is
  // tied to its trigger by a CHECK, and the decision and the opening go after, with the committees and openings.
  await db.evaluation.deleteMany({ where: { id: { in: ids } } });
  // The configuration: exercises no longer name a demo model; the policy before its templates.
  await db.sourcingExercise.updateMany({ where: { evaluationModelId: demoRef }, data: { evaluationModelId: null } });
  await db.evaluationPolicy.deleteMany({ where: { id: demoRef } });
  await db.evaluationModel.deleteMany({ where: { id: demoRef } });
  await db.evaluationAspect.deleteMany({ where: { id: demoRef } });
  await db.auditEntry.deleteMany({ where: { organisationId, entity: { in: ["Evaluation", "EvaluationTeamMember", "EvaluationBidder", "EvaluationScore", "StageSubmission", "AspectAssessment", "NegotiationRequest", "EvaluationMeeting", "TendererCommunication", "Recommendation", "ProposalPaper"] }, entityId: { in: [...ids, ...bidders] } } });
  await db.auditEntry.deleteMany({ where: { organisationId, id: { startsWith: `${P}ev` } } });
}
