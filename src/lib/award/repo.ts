/**
 * Awards and their configuration, loaded. Reads only; every rule is in the pure
 * modules beside this, and `evaluateAward` judges what this reads.
 *
 * `withLockedAward` is how every write to an award reads: it locks the requisition,
 * then the exercise (the order 6.3's writes take them in), then the award, and re-reads
 * all three inside the write's own transaction — so the sum of the requisition's awards,
 * the route and the gate are judged on the rows the write changes.
 */

import { bidGate } from "@/lib/bids/repo";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { loadEvaluationGate } from "@/lib/evaluation/gate-read";
import type { Tx } from "@/lib/audit/record";
import type { DecisionRecord } from "@/lib/committee/record";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { readConditionsSnapshot } from "@/lib/tender-docs/conditions";
import { evidenceCount, isEvidenceSnapshot } from "@/lib/documents/evidence";
import { attachmentFacts } from "@/lib/documents/repo";
import { db } from "@/lib/db";
import { nameRoutesOf } from "@/lib/method/approval";
import { approvedRouteOf, evaluationContext, exerciseOrg, loadExercise, type ExerciseOrg, type LoadedExercise } from "@/lib/method/repo";
import { isBandSnapshot } from "@/lib/method/snapshot";
import { parseSen, senFromDecimal } from "@/lib/money";
import { ORGANISATION_CODE, ORGANISATION_NAME } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { ableToAct, holdersFor } from "@/lib/requisition/holders";
import { recordOf, type DecisionRow } from "@/lib/requisition/repo";
import { windowGate } from "@/lib/window/gate";
import type { ApprovalStatus, RequisitionStatus, StepDecision } from "@/lib/requisition/types";
import type { LiabilityBand } from "@/lib/securities/liability";
import { Prisma } from "@/generated/prisma/client";
import { alertingUpTo, longExpiredBefore } from "@/lib/securities/expiry";
import { applicableRequirements, type Requirement } from "@/lib/securities/insurance";

import type { FrozenTender } from "./appendix-baseline";
import { absentOffices } from "./appointment";
import { expiredIfReceivedBefore } from "./indent";
import type { Recipient } from "./distribution";
import type { AwardFacts, RouteStepFact, TemplateRow } from "./evaluate";
import { LIVE_STATUSES } from "./status";
import { UNSET_AWARD_POLICY, type AwardPolicy, type AwardStatus, type DocumentLanguage, type InstrumentKind, type PeriodUnit, type Provenance } from "./types";
import type { Variant } from "./variant";

const dec = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const senOrNull = (v: { toString(): string } | null | undefined) => (v == null ? null : parseSen(v.toString()));
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

const decisionInclude = { meeting: { include: { committee: { select: { code: true, nameEn: true } } } }, votes: { include: { person: { select: { name: true } } } } };

export const awardInclude = {
  // 6.15a (OD-9): the register's supplier the award is linked to, and any blacklisting asked for from it.
  vendor: { select: { id: true, reference: true, registeredName: true } },
  standingRequests: { select: { id: true, kind: true, event: { select: { id: true } } } },
  documents: { orderBy: [{ kind: "asc" as const }, { version: "desc" as const }] },
  distributions: { orderBy: { sortOrder: "asc" as const } },
  awardReturn: { include: { receivedBy: { select: { id: true, name: true } } } },
  conditions: { orderBy: { requiredBy: "asc" as const } },
  contract: {
    include: {
      securities: { include: { issuer: { select: { id: true, name: true } }, verifiedBy: { select: { name: true } } }, orderBy: { lodgedOn: "asc" as const } },
      policies: { include: { issuer: { select: { id: true, name: true } }, verifiedBy: { select: { name: true } } }, orderBy: { lodgedOn: "asc" as const } },
      ownershipEvents: { orderBy: { on: "asc" as const } },
    },
  },
  approvalInstances: {
    orderBy: [{ openedAt: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }],
    include: {
      rejectionChosenBy: { select: { name: true } },
      steps: {
        orderBy: { sequence: "asc" as const },
        include: { committeeDecision: { include: decisionInclude }, declaredBy: { select: { name: true } }, delegation: { select: { id: true, fromPerson: { select: { name: true } } } } },
      },
    },
  },
  signatoryPerson: { select: { id: true, name: true } },
  variant: { select: { id: true, nameEn: true } },
  // Return scans (OD-5), live and past; "attached" is `isLive`.
  attachments: { select: { id: true, purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } }, orderBy: { attachedAt: "asc" as const } },
};

/// A committee matter as the routing sheet may cite it: only through `decisionRecord()`,
/// built by the one builder the requisition's committee steps use.
export function matterRecord(d: DecisionRow): { record: DecisionRecord | null; minuted: boolean } {
  return { minuted: d.meeting.status === "MINUTED", record: recordOf(d) };
}

export async function loadAward(id: string, client: Tx = db) {
  const org = await exerciseOrg(client);
  if (!org) return null;
  const award = await client.award.findFirst({ where: { id, organisationId: org.id }, include: awardInclude });
  if (!award) return null;
  const l = await loadExercise(award.exerciseId, client);
  if (!l) return null;
  return { org, award, ex: l.ex, req: l.req, l };
}

export type LoadedAward = NonNullable<Awaited<ReturnType<typeof loadAward>>>;
export type AwardRow = LoadedAward["award"];

/// Lock the requisition, the exercise and the award, in that order, and re-read them.
export async function withLockedAward<T>(awardId: string, fn: (tx: Tx, l: LoadedAward) => Promise<T>): Promise<T | null> {
  const found = await db.award.findUnique({ where: { id: awardId }, select: { exerciseId: true, exercise: { select: { requisitionId: true } } } });
  if (!found) return null;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${found.exercise.requisitionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${found.exerciseId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Award" WHERE id = ${awardId} FOR UPDATE`;
      const l = await loadAward(awardId, tx);
      if (!l || l.ex.id !== found.exerciseId) return null;
      return fn(tx, l);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/// Lock an exercise's requisition and the exercise, for opening an award on it.
export async function withLockedExerciseForAward<T>(exerciseId: string, fn: (tx: Tx, l: LoadedExercise) => Promise<T>): Promise<T | null> {
  const ex = await db.sourcingExercise.findUnique({ where: { id: exerciseId }, select: { requisitionId: true } });
  if (!ex) return null;
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${ex.requisitionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} FOR UPDATE`;
      const l = await loadExercise(exerciseId, tx);
      if (!l) return null;
      return fn(tx, l);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

export async function loadAwardPolicy(organisationId: string, client: Tx = db): Promise<AwardPolicy & { id: string | null; notes: string }> {
  const p = await client.awardPolicy.findUnique({ where: { organisationId } });
  if (!p) return { ...UNSET_AWARD_POLICY, id: null, notes: "" };
  return {
    id: p.id,
    notes: p.notes,
    tenderInstrument: p.tenderInstrument as InstrumentKind | null,
    quotationInstrument: p.quotationInstrument as InstrumentKind | null,
    indentValidityDays: p.indentValidityDays,
    commencementGraceDays: p.commencementGraceDays,
    acceptanceReturnDays: p.acceptanceReturnDays,
    preContractUnitCode: p.preContractUnitCode,
    postContractUnitCode: p.postContractUnitCode,
    quotationContractKey: p.quotationContractKey,
    regulatedActivityLabel: p.regulatedActivityLabel,
    loaTemplateId: p.loaTemplateId,
    declarationTemplateId: p.declarationTemplateId,
    coveringMemoTemplateId: p.coveringMemoTemplateId,
    provenance: p.provenance as Provenance | null,
  };
}

/// The customer's award configuration: recipients, variants, templates, conditions,
/// insurance requirements, liability bands, issuers and the expiry offsets.
export async function loadAwardConfig(organisationId: string, client: Tx = db) {
  const where = { organisationId };
  const order = [{ sortOrder: "asc" as const }, { code: "asc" as const }];
  const [policy, recipients, variants, templates, conditionKinds, requirements, bands, issuers, expiring, indentFormat, expiredRule, units] = await Promise.all([
    loadAwardPolicy(organisationId, client),
    client.distributionRecipient.findMany({ where, orderBy: order }),
    client.appointmentLetterVariant.findMany({ where, orderBy: order }),
    client.documentTemplate.findMany({ where, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    client.conditionPrecedentKind.findMany({ where, orderBy: order }),
    client.insuranceRequirement.findMany({ where, orderBy: order }),
    client.liabilityBand.findMany({ where, orderBy: order }),
    client.approvedIssuer.findMany({ where, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    client.notificationRule.findFirst({ where: { organisationId, eventKey: "security.expiring", isActive: true } }),
    client.codeFormat.findFirst({ where: { organisationId, key: "erp_indent_no" } }),
    client.notificationRule.findFirst({ where: { organisationId, eventKey: "award.indent.expired", isActive: true } }),
    client.orgUnit.findMany({ where, select: { code: true, nameEn: true } }),
  ]);
  const unitNames = new Map(units.map((u) => [u.code, u.nameEn]));
  return {
    policy,
    recipientRows: recipients,
    recipients: recipients.map((r): Recipient => ({ id: r.id, instrumentKind: r.instrumentKind as InstrumentKind, nameEn: r.nameEn, mandatory: r.mandatory, onlyWhenRegulated: r.onlyWhenRegulated, sortOrder: r.sortOrder, retiredOn: r.retiredOn })),
    variantRows: variants,
    variants: variants.map((v): Variant => ({ id: v.id, code: v.code, nameEn: v.nameEn, templateId: v.templateId, contractTypeCodes: v.contractTypeCodes, termsBandKey: v.termsBandKey, nonCommencement: v.nonCommencement, retiredOn: v.retiredOn })),
    templateRows: templates,
    templates: templates.map((t): TemplateRow => ({ id: t.id, code: t.code, nameEn: t.nameEn, formCode: t.formCode, revisionDate: t.revisionDate, bodyMs: t.bodyMs, bodyEn: t.bodyEn, primaryLanguage: t.primaryLanguage as DocumentLanguage | null, bodyVersion: t.bodyVersion })),
    conditionKinds,
    requirementRows: requirements,
    requirements: requirements.map((r): Requirement => ({ code: r.code, nameEn: r.nameEn, kind: r.kind, contractTypeCode: r.contractTypeCode, required: r.required, percent: dec(r.percent), tailMonths: r.tailMonths, tailDays: r.tailDays, retiredOn: r.retiredOn })),
    bandRows: bands,
    bands: bands.map((b): LiabilityBand => ({ code: b.code, minValue: senOrNull(b.minValue), maxValue: senOrNull(b.maxValue), limit: parseSen(b.limitAmount.toString()), retiredOn: b.retiredOn })),
    issuers,
    expiryOffsets: expiring?.reminderOffsetDays ?? [],
    expiryRule: expiring,
    indentExpiredRule: expiredRule,
    indentFormat,
    /// A section's name for a configured code; codes never reach a screen.
    unitName: (code: string | null) => (code ? (unitNames.get(code) ?? "A section no longer configured") : null),
  };
}

export type AwardConfig = Awaited<ReturnType<typeof loadAwardConfig>>;

/// The award's own step facts, with each committee step's cited decision read through `decisionRecord()`.
export function routeSteps(inst: AwardRow["approvalInstances"][number]): RouteStepFact[] {
  return inst.steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    roleCode: s.roleCode,
    roleLabel: s.roleLabel,
    act: s.act,
    committeeCode: s.committeeCode,
    decision: s.decision as StepDecision,
    decidedByName: s.decidedByName,
    decidedOn: s.decidedOn,
    receivedOn: s.receivedOn,
    cited: s.committeeDecision ? matterRecord(s.committeeDecision) : null,
  }));
}

/**
 * 64-C4 (6.4 Q-1 B): the exercise's frozen tender, as the award compares with it: the
 * Appendix of its latest approved pack, and the regulated-activity answer frozen with that
 * pack (its conditions snapshot; never the exercise's live column). Null where no approved
 * pack froze an Appendix — a Phase 1 exercise, or one whose documents were never approved —
 * and the award behaves as before.
 */
export async function frozenTenderOf(exerciseId: string, timeZone: string | null, client: Tx = db): Promise<FrozenTender | null> {
  const pack = await client.tenderPack.findFirst({
    where: { exerciseId, status: "APPROVED", frozenAt: { not: null }, appendix: { isNot: null } },
    orderBy: { versionNo: "desc" },
    select: FROZEN_PACK_SELECT,
  });
  return pack ? frozenTenderFrom(pack, timeZone) : null;
}

const FROZEN_PACK_SELECT = { exerciseId: true, versionNo: true, frozenAt: true, conditionsSnapshot: true, appendix: true } as const;
type FrozenPackRow = { versionNo: number; frozenAt: Date | null; conditionsSnapshot: Prisma.JsonValue; appendix: Prisma.ConditionsAppendixGetPayload<object> | null };

function frozenTenderFrom(pack: FrozenPackRow, timeZone: string | null): FrozenTender | null {
  const a = pack.appendix;
  if (!a) return null;
  return {
    packVersion: pack.versionNo,
    // 68-C5 residual 4: the organisation's day the pack froze; with no zone, none (never UTC's day).
    frozenOn: pack.frozenAt ? dayOf(pack.frozenAt, timeZone) : null,
    appendix: {
      ladKind: a.ladKind,
      ladAmount: senOrNull(a.ladAmount),
      ladPct: dec(a.ladPct),
      dlpApplies: a.dlpApplies,
      dlpMonths: a.dlpMonths,
      tplMinimum: senOrNull(a.tplMinimum),
      wcMinimum: senOrNull(a.wcMinimum),
      worksInsuranceUpliftKind: a.worksInsuranceUpliftKind,
      worksInsuranceUpliftAmount: senOrNull(a.worksInsuranceUpliftAmount),
      worksInsuranceUpliftPct: dec(a.worksInsuranceUpliftPct),
      insuranceExcess: senOrNull(a.insuranceExcess),
      sectionalCompletion: a.sectionalCompletion,
    },
    regulated: readConditionsSnapshot(pack.conditionsSnapshot)?.permit.regulated ?? null,
  };
}

/// 64-C4-b: the frozen tender of many exercises at once (the contracts list's gates), by exercise id: each
/// exercise's latest approved pack that froze an Appendix, as `frozenTenderOf` reads one.
export async function frozenTendersOf(exerciseIds: readonly string[], timeZone: string | null, client: Tx = db): Promise<Map<string, FrozenTender>> {
  const out = new Map<string, FrozenTender>();
  if (exerciseIds.length === 0) return out;
  const packs = await client.tenderPack.findMany({
    where: { exerciseId: { in: [...exerciseIds] }, status: "APPROVED", frozenAt: { not: null }, appendix: { isNot: null } },
    orderBy: [{ exerciseId: "asc" }, { versionNo: "desc" }],
    select: FROZEN_PACK_SELECT,
  });
  for (const p of packs) {
    if (out.has(p.exerciseId)) continue;
    const t = frozenTenderFrom(p, timeZone);
    if (t) out.set(p.exerciseId, t);
  }
  return out;
}

/// The award's latest appointment route.
export const latestRoute = (award: AwardRow) => award.approvalInstances.find((i) => i.domain === "appointment") ?? null;

/**
 * Everything `evaluateAward` reads, loaded on one day under one issue — inside the
 * write's transaction when there is one.
 */
export async function awardFacts(l: LoadedAward, client: Tx = db) {
  const { org, award, ex, req } = l;
  const on = org.today ? dayToDate(org.today) : new Date();
  const [{ issue, cfg, ctx }, config, siblings, roster, delegations, units, contractType] = await Promise.all([
    evaluationContext(org, req, ex, client),
    loadAwardConfig(org.id, client),
    client.award.findMany({ where: { exercise: { requisitionId: req.id }, status: { in: [...LIVE_STATUSES] }, NOT: { id: award.id } }, select: { awardedValue: true } }),
    loadRoster(ORGANISATION_CODE, client),
    loadDelegations(ORGANISATION_CODE, client),
    client.orgUnit.findMany({ where: { organisationId: org.id } }),
    ex.contractTypeCode ? client.contractType.findFirst({ where: { organisationId: org.id, code: ex.contractTypeCode } }) : Promise.resolve(null),
  ]);
  const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
  // 6.5 (X-9): the window's phase now and any pending change, for the gate.
  const exerciseWindow = windowGate(ex, await client.exerciseWindow.findUnique({ where: { exerciseId: ex.id }, select: { purchaseFromDay: true, purchaseCloseDay: true } }), new Date(), org.timeZone);
  // 6.6 (X-9): late admission and the bids' validity, only for an exercise published through 6.5.
  const bidsNow = await bidGate(ex.id, client);
  // 6.7 (X-9, C-7, C-8): the openings' checks, and the party the award names.
  const openingNow = await loadOpeningGate(ex.id, client);
  // 6.8 (E-9): the evaluation's gate and the recommendation.
  const evaluationNow = await loadEvaluationGate(ex.id, client);
  const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, on).reverse().map((u) => u.code);
  const holdersOf = (code: string) => holdersFor(code, unitPath, roster, delegations, org.today ?? storedDay(on));
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const officeCodes = issue ? Object.keys(issue.matrix.roles).filter((c) => !issue.matrix.roles[c].isCommittee) : [];
  const bands = isBandSnapshot(ex.bandSnapshot) ? ex.bandSnapshot : null;
  const route = latestRoute(award);
  const reqRoute = req.approvalInstances.find((i) => i.domain === "requisition") ?? null;
  const reqSteps = reqRoute ? await client.approvalStep.findMany({ where: { instanceId: reqRoute.id }, select: { sequence: true, roleLabel: true, decision: true } }) : [];
  const approved = approvedRouteOf({ approvalInstances: req.approvalInstances.filter((i) => i.domain === "requisition") });
  const dossierEvidence = await dossierEvidenceOf(ex.id, award.dossierEvidenceSnapshot, client);
  const tender = await frozenTenderOf(ex.id, org.timeZone, client);

  const facts: AwardFacts = {
    today: org.today,
    organisationName: ORGANISATION_NAME,
    award: {
      status: award.status as AwardStatus,
      reference: award.reference,
      instrumentKind: award.instrumentKind as InstrumentKind,
      value: senFromDecimal(award.awardedValue),
      awardeeName: award.awardeeName,
      awardeeRegistrationNo: award.awardeeRegistrationNo,
      awardeeAddress: award.awardeeAddress,
      completionPeriod: award.completionPeriod,
      completionUnit: award.completionUnit as PeriodUnit,
      startDate: day(award.startDate),
      commencedOn: day(award.commencedOn),
      regulatedActivity: award.regulatedActivity,
      bondRequired: award.bondRequired,
      bondNotRequiredReason: award.bondNotRequiredReason,
      bondBasis: award.bondBasis,
      bondPercent: dec(award.bondPercent),
      bondBasisAmount: senOrNull(award.bondBasisAmount),
      bondValidityExtraMonths: award.bondValidityExtraMonths,
      ladAmount: senOrNull(award.ladAmount),
      ladUnit: award.ladUnit,
      retentionPercent: dec(award.retentionPercent),
      retentionCapPercent: dec(award.retentionCapPercent),
      dlpMonths: award.dlpMonths,
      erpCommitmentNo: award.erpCommitmentNo,
      erpCommitmentKind: award.erpCommitmentKind,
      wcBasis: award.wcBasis,
      indentReceivedOn: day(award.indentReceivedOn),
      signatoryName: award.signatoryName,
      issuedOn: day(award.issuedAt),
      contractNumber: award.contract?.number ?? null,
      appendixReasons: { lad: award.ladDiffersReason, dlp: award.dlpDiffersReason, regulated: award.regulatedDiffersReason },
    },
    tender,
    exercise: {
      reference: ex.reference,
      title: ex.title,
      status: ex.status,
      packKindSnapshot: ex.packKindSnapshot,
      window: exerciseWindow,
      bids: bidsNow.published ? { lateFault: bidsNow.lateFault, validityFault: bidsNow.validityFault } : null,
      opening: openingNow.applies ? { facts: openingNow, awardeePartyId: award.awardeePartyId } : null,
      // 6.8 (E-9, flagged): stated always (null where none applies), with the award's figures and reasons.
      evaluation: evaluationNow.gate.applies ? { facts: evaluationNow.gate, awardeePartyId: award.awardeePartyId, award: { value: senFromDecimal(award.awardedValue), period: { value: award.completionPeriod, unit: award.completionUnit as PeriodUnit }, reasons: { value: award.recValueDiffersReason, period: award.recPeriodDiffersReason } } } : null,
      regime: ex.regime,
      appointmentRuleKey: ex.appointmentRuleKey,
      appointmentRuleLabel: bands?.appointment.ruleLabel ?? null,
      termsBandKey: ex.termsBandKey,
      termsState: ex.termsState,
      terms: bands ? { retentionApplies: bands.terms.retentionApplies, defectsLiabilityApplies: bands.terms.defectsLiabilityApplies } : null,
      contractTypeCode: ex.contractTypeCode,
      estimate: senFromDecimal(ex.estimatedValue),
      justificationReasonCode: ex.justificationReasonCode,
      dossierReference: ex.dossierReference,
    },
    requisition: {
      reference: req.reference,
      status: req.status as RequisitionStatus,
      sourcingPermitted: req.sourcingPermitted,
      approvedValue: approved?.value ?? null,
      route: reqRoute ? { status: reqRoute.status as ApprovalStatus, steps: reqSteps.map((s) => ({ ...s, decision: s.decision as StepDecision })) } : null,
    },
    otherAwards: siblings.map((s) => senFromDecimal(s.awardedValue)),
    policy: config.policy,
    funder: ctx?.funder ?? null,
    method,
    nameRoutes: nameRoutesOf(ex.approvalInstances).map((i) => ({ status: i.status as ApprovalStatus, openedAt: i.openedAt, createdAt: i.createdAt, id: i.id })),
    routePeople: {
      absentRoleCodes: org.today ? absentOffices(officeCodes, holdersOf, available) : [],
      requesterHolds: (code) => holdersOf(code).holderIds.includes(req.requestingPersonId),
      requesterId: req.requestingPersonId,
      ableToAct: (code) => ableToAct(holdersOf(code), req.requestingPersonId, senFromDecimal(award.awardedValue), available),
    },
    appointment: route ? { status: route.status as ApprovalStatus, openedAt: route.openedAt, steps: routeSteps(route) } : null,
    recipients: config.recipients,
    variants: config.variants,
    templates: config.templates,
    indentPattern: config.indentFormat?.pattern ?? null,
    contractSeriesKey: contractType?.contractSeriesKey ?? null,
    wcRequired: applicableRequirements(config.requirements, ex.contractTypeCode).some((r) => r.kind === "WORKMENS_COMPENSATION"),
    dossierEvidence,
  };
  return { facts, issue, cfg, config, method, roster, delegations, unitPath, holdersOf, contractType, org: org as ExerciseOrg };
}

export type AwardFactsResult = Awaited<ReturnType<typeof awardFacts>>;

/**
 * The exercise's dossier evidence as the document store counts it, and — for the pins
 * the award was sent for approval on — which versions have been withdrawn since.
 */
export async function dossierEvidenceOf(exerciseId: string, snapshot: unknown, client: Tx = db) {
  const attachments = await attachmentFacts({ kind: "exercise", id: exerciseId }, client, ["DOSSIER_EVIDENCE"]);
  const pinned = isEvidenceSnapshot(snapshot) ? snapshot.pins.map((p) => p.versionId) : [];
  const withdrawn = pinned.length ? await client.documentVersion.findMany({ where: { id: { in: pinned }, withdrawnAt: { not: null } }, select: { id: true } }) : [];
  return { count: evidenceCount(attachments, "DOSSIER_EVIDENCE"), snapshot, withdrawnVersionIds: withdrawn.map((w) => w.id), attachments };
}

/// The exercise's committee matters, for citing on a committee step.
export async function exerciseMatters(exerciseId: string, client: Tx = db) {
  return client.committeeDecision.findMany({ where: { exerciseId }, include: decisionInclude, orderBy: { tabledAt: "desc" } });
}

export const AWARDS_PAGE = 100;

/**
 * The latest page of awards, and the header's counts taken in the database so they
 * cover every award, not the page: awaiting approval, approved and not issued, issued
 * and awaiting their return, and indents expired before work commenced.
 */
export async function listAwards() {
  const org = await exerciseOrg();
  if (!org) return { org: null, rows: [], total: 0, policy: null, counts: { pending: 0, ready: 0, awaitingReturn: 0, expired: 0 } };
  const where = { organisationId: org.id };
  const policy = await loadAwardPolicy(org.id);
  const before = org.today ? expiredIfReceivedBefore(policy.indentValidityDays, org.today) : null;
  const [rows, total, pending, ready, awaitingReturn, expired] = await Promise.all([
    db.award.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { reference: "desc" }],
      take: AWARDS_PAGE,
      include: {
        exercise: { select: { id: true, reference: true, title: true, regime: true } },
        contract: { select: { number: true, securities: { select: { status: true, kind: true } }, policies: { select: { status: true } } } },
        awardReturn: true,
        attachments: { select: { purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
        approvalInstances: { select: { status: true, domain: true, openedAt: true, createdAt: true }, orderBy: { openedAt: "desc" } },
      },
    }),
    db.award.count({ where }),
    db.award.count({ where: { ...where, status: "PENDING_APPROVAL" } }),
    db.award.count({ where: { ...where, status: "APPROVED" } }),
    // Issued and not accepted: acceptance comes in the same act as the completing return (BD-12).
    db.award.count({ where: { ...where, status: "ISSUED" } }),
    before
      ? // The badge's own rule (indentExpiryRaised): any award not cancelled, not commenced.
        db.award.count({ where: { ...where, instrumentKind: "WORK_INDENT", status: { not: "CANCELLED" }, commencedOn: null, indentReceivedOn: { lt: dayToDate(before) } } })
      : Promise.resolve(0),
  ]);
  return { org, rows, total, policy, counts: { pending, ready, awaitingReturn, expired } };
}

export const HISTORY_PAGE = 200;

/// The award's trail and everything under it, newest first. The IC number is masked in
/// the rows themselves (build decision BD-9), so nothing here needs to mask it.
export async function awardHistory(l: LoadedAward) {
  const a = l.award;
  const ids = [
    a.id,
    ...a.documents.map((x) => x.id),
    ...a.distributions.map((x) => x.id),
    ...(a.awardReturn ? [a.awardReturn.id] : []),
    ...a.conditions.map((x) => x.id),
    ...(a.contract ? [a.contract.id, ...a.contract.securities.map((x) => x.id), ...a.contract.policies.map((x) => x.id), ...a.contract.ownershipEvents.map((x) => x.id)] : []),
    ...a.approvalInstances.flatMap((i) => [i.id, ...i.steps.map((s) => s.id)]),
  ];
  const where = { organisationId: l.org.id, OR: [{ entityId: { in: ids } }, { entityLabel: { startsWith: `${a.reference} ·` } }] };
  const [rows, total] = await Promise.all([db.auditEntry.findMany({ where, orderBy: { at: "desc" }, take: HISTORY_PAGE }), db.auditEntry.count({ where })]);
  return {
    total,
    entries: rows.map((e) => ({ id: e.id, entity: e.entity, entityLabel: e.entityLabel, action: e.action, at: e.at, reason: e.reason, changes: (e.changes ?? []) as unknown as { field: string; before: string | null; after: string | null }[] })),
  };
}

export const REGISTER_PAGE = 50;
export type RegisterView = "all" | "expiring" | "unverified";

/**
 * The register across contracts, paged in the database: securities and policies as one
 * list, live rows first, then those long expired, then rejected — soonest to expire
 * first within each (`registerRank`). The views and the header's counts are the same
 * database conditions, so a view always holds what its count says.
 */
export async function listRegister(page = 0, view: RegisterView = "all") {
  const org = await exerciseOrg();
  const empty = { org: null, securities: [], policies: [], order: [] as { kind: "S" | "P"; id: string }[], config: null, total: 0, page: 0, counts: { all: 0, unverified: 0, expiring: 0 } };
  if (!org) return empty;
  const config = await loadAwardConfig(org.id);
  const today = org.today;
  // Without the organisation's day nothing is "expiring": the count and the view agree on none.
  const upTo = today ? dayToDate(alertingUpTo(config.expiryOffsets, today)) : null;
  const cutoff = dayToDate(longExpiredBefore(config.expiryOffsets, today ?? "9999-12-31"));
  const secView = view === "unverified" ? Prisma.sql`AND s.status = 'LODGED'` : view === "expiring" ? (upTo ? Prisma.sql`AND s.status <> 'REJECTED' AND (s."expiresOn" IS NULL OR s."expiresOn" <= ${upTo})` : Prisma.sql`AND FALSE`) : Prisma.empty;
  const polView = view === "unverified" ? Prisma.sql`AND p.status = 'LODGED'` : view === "expiring" ? (upTo ? Prisma.sql`AND p.status <> 'REJECTED' AND p."periodEnd" <= ${upTo}` : Prisma.sql`AND FALSE`) : Prisma.empty;
  const rows = Prisma.sql`
    SELECT 'S' AS kind, s.id, CASE WHEN s.status = 'REJECTED' THEN 2 WHEN s."expiresOn" IS NOT NULL AND s."expiresOn" < ${cutoff} THEN 1 ELSE 0 END AS rank, s."expiresOn" AS ends
      FROM "SecurityInstrument" s JOIN "Contract" c ON c.id = s."contractId" WHERE c."organisationId" = ${org.id} ${secView}
    UNION ALL
    SELECT 'P' AS kind, p.id, CASE WHEN p.status = 'REJECTED' THEN 2 WHEN p."periodEnd" < ${cutoff} THEN 1 ELSE 0 END AS rank, p."periodEnd" AS ends
      FROM "InsurancePolicy" p JOIN "Contract" c ON c.id = p."contractId" WHERE c."organisationId" = ${org.id} ${polView}`;
  const count = async (v: RegisterView) => {
    const sv = v === "unverified" ? Prisma.sql`AND s.status = 'LODGED'` : v === "expiring" ? (upTo ? Prisma.sql`AND s.status <> 'REJECTED' AND (s."expiresOn" IS NULL OR s."expiresOn" <= ${upTo})` : Prisma.sql`AND FALSE`) : Prisma.empty;
    const pv = v === "unverified" ? Prisma.sql`AND p.status = 'LODGED'` : v === "expiring" ? (upTo ? Prisma.sql`AND p.status <> 'REJECTED' AND p."periodEnd" <= ${upTo}` : Prisma.sql`AND FALSE`) : Prisma.empty;
    const r = await db.$queryRaw<{ n: bigint }[]>`
      SELECT (SELECT count(*) FROM "SecurityInstrument" s JOIN "Contract" c ON c.id = s."contractId" WHERE c."organisationId" = ${org.id} ${sv})
           + (SELECT count(*) FROM "InsurancePolicy" p JOIN "Contract" c ON c.id = p."contractId" WHERE c."organisationId" = ${org.id} ${pv}) AS n`;
    return Number(r[0]?.n ?? 0);
  };
  const [all, unverified, expiring] = await Promise.all([count("all"), count("unverified"), count("expiring")]);
  const total = view === "all" ? all : view === "unverified" ? unverified : expiring;
  const last = Math.max(0, Math.ceil(total / REGISTER_PAGE) - 1);
  const p = Math.min(Math.max(0, page), last);
  const order = await db.$queryRaw<{ kind: "S" | "P"; id: string }[]>`
    SELECT kind, id FROM (${rows}) r ORDER BY rank, ends ASC NULLS FIRST, id LIMIT ${REGISTER_PAGE} OFFSET ${p * REGISTER_PAGE}`;
  const include = { issuer: { select: { name: true, retiredOn: true } }, contract: { select: { number: true, status: true, award: { select: { id: true, reference: true, awardeeName: true } } } } } as const;
  const [securities, policies] = await Promise.all([
    db.securityInstrument.findMany({ where: { id: { in: order.filter((o) => o.kind === "S").map((o) => o.id) } }, include }),
    db.insurancePolicy.findMany({ where: { id: { in: order.filter((o) => o.kind === "P").map((o) => o.id) } }, include }),
  ]);
  return { org, securities, policies, order, config, total, page: p, counts: { all, unverified, expiring } };
}
