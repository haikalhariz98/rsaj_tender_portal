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
import { parseSen, senToDecimalString } from "../src/lib/money";
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
    const { isSubmitted } = await import("../src/lib/evaluation/stages");
    const { EVALUATION_ENTITY, inputFields } = await import("../src/lib/evaluation/audit-view");
    const { c, label } = await this.ctx(exerciseId);
    const f = c.facts!;
    const b = this.bidder(c, listingNo);
    const capital = f.model.stages.filter((s) => s.criteria.some((x) => x.computedInput === "MIN_CAPITAL_RATIO"));
    if (capital.some((s) => isSubmitted(f, s.code))) fail("the capital inputs are frozen");
    const factor = capital.flatMap((s) => s.factors).find((x) => x.code === i.factor) ?? fail(`no factor ${i.factor}`);
    for (const s of capital) refuse(`bid No. ${listingNo}'s inputs`, personFaults(s.side, by.id, f.team, f.submissions));
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
    const { c, label } = await this.ctx(exerciseId);
    const e = c.current!;
    const b = this.bidder(c, listingNo);
    const rf = recommendationFaults(c.facts!, { bidderId: b.id, justification: "", personActive: true, alreadyFormed: e.recommendation != null, meetingsOpen: e.meetings.filter((m) => !m.closedAt).length });
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
    refuse("issuing the report", reportFaults({ stagesIncomplete: incompleteStages(f), recommended: true, openMeetings: e.meetings.filter((m) => !m.closedAt).length, pendingNegotiations: e.negotiations.filter((n) => n.approvalInstance.status === "PENDING").length, seriesKey: c.policy!.reportSeriesKey, template: trial, admittedUnopened: c.admittedUnopened, supplementaryInProgress: c.supplementaryInProgress, consent: consent.faults, stale: reportStale(e.bidders.map((b) => b.openedBidId), c.carried.map((b) => b.id)), personActive: true, today }));
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
}

// ------------------------------------------------------------------ the load

/**
 * Load 6.8's demo on the exercises the earlier demos opened. Returns the sitting it adds, for demo.ts
 * to give its trail (it is in progress, not minuted).
 */
export async function loadEvaluationDemo(db: Db, organisationId: string): Promise<{ sittings: string[] }> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone ?? fail("the organisation's time zone is not set");
  const L = todayIn(new Date(), tz)!;
  const now = new Date();
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);
  const trail: Entry[] = [];
  let n = 0;
  const entry: Add = (entity, entityId, entityLabel, action, when, changes, reason = "") => trail.push({ id: `${P}evau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, unattributed: true });
  const acts = new EvaluationActs(db, organisationId, tz, entry);

  // ================================================================ sx16: evaluated, tabled
  const sx16 = `${P}sx16`;
  const [impl] = IMPLEMENTING;
  const [proc] = PROCUREMENT;
  const close16 = (await db.sourcingExercise.findUniqueOrThrow({ where: { id: sx16 }, select: { closingAt: true } })).closingAt!;
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
  const sittings = await tableAppointment(db, organisationId, tz, entry, { sx: sx16, on: L, at: ago(100) });

  if (trail.some((e) => e.at > now)) fail("an act is dated after now (X-10 a)");
  await db.auditEntry.createMany({ data: trail as never });
  return { sittings };
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
  refuse("tabling the appointment", bundleFaults((await loadEvaluationGate(i.sx, db as never)).bundle));
  const roster = await loadRoster(ORGANISATION_CODE);
  const tabling = checkTabling({ secretariatRoleCode: committee.secretariatRoleCode, tabledByPersonId: HOD_CP.id, holderIdsOnDate: secretariatHoldersOn(roster, committee.secretariatRoleCode, i.on).map((h) => h.id), tablingDay: i.on });
  if (!tabling.ok) fail(`the appointment could not be tabled (${tabling.fault})`);
  const mt = `${P}mt14`;
  await db.meeting.create({ data: { id: mt, committeeId: `${P}c1`, reference: "DEMO/SIT/5B/2026", meetingDate: dayToDate(i.on), status: "IN_PROGRESS", agenda: `Appointment: ${ex.title} (${ex.reference}), on evaluation report and Kertas Cadangan.` } });
  await db.meetingAttendance.createMany({ data: [{ id: `${P}at64`, meetingId: mt, personId: `${P}p1`, attended: true }, { id: `${P}at65`, meetingId: mt, personId: `${P}p2`, attended: true }, { id: `${P}at66`, meetingId: mt, personId: `${P}p3`, attended: true }, { id: `${P}at67`, meetingId: mt, personId: `${P}p7`, attended: true }] });
  const subject = `Appointment for ${ex.title}`;
  await db.committeeDecision.create({ data: { id: `${P}d43`, meetingId: mt, sequence: 1, domain: APPOINTMENT_DOMAIN, matterKind: "EXERCISE", matterRef: ex.reference, exerciseId: i.sx, subject, act: "A", amount: "612450.30", tabledByPersonId: HOD_CP.id, tabledAt: dayToDate(i.on) } });
  entry("Meeting", mt, `DEMO/SIT/5B/2026 · ${committee.nameEn}`, "CREATE", new Date(i.at.getTime() - 60_000), diffFields(null, { committee: committee.nameEn, reference: "DEMO/SIT/5B/2026", date: formatDate(i.on), status: "In progress" }));
  entry("CommitteeDecision", `${P}d43`, subject, "CREATE", i.at, diffFields(null, { subject, domain: APPOINTMENT_DOMAIN, matterKind: "EXERCISE", matterRef: ex.reference, act: "A", linkedExercise: ex.reference, tabledBy: HOD_CP.name, tabledAt: formatDate(i.on) }));
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
  await db.evaluation.updateMany({ where: { id: { in: ids } }, data: { loopDecisionId: null } });
  await db.evaluation.deleteMany({ where: { id: { in: ids } } });
  // The configuration: exercises no longer name a demo model; the policy before its templates.
  await db.sourcingExercise.updateMany({ where: { evaluationModelId: demoRef }, data: { evaluationModelId: null } });
  await db.evaluationPolicy.deleteMany({ where: { id: demoRef } });
  await db.evaluationModel.deleteMany({ where: { id: demoRef } });
  await db.evaluationAspect.deleteMany({ where: { id: demoRef } });
  await db.auditEntry.deleteMany({ where: { organisationId, entity: { in: ["Evaluation", "EvaluationTeamMember", "EvaluationBidder", "EvaluationScore", "StageSubmission", "AspectAssessment", "NegotiationRequest", "EvaluationMeeting", "TendererCommunication", "Recommendation", "ProposalPaper"] }, entityId: { in: [...ids, ...bidders] } } });
  await db.auditEntry.deleteMany({ where: { organisationId, id: { startsWith: `${P}ev` } } });
}
