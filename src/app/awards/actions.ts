"use server";

import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { boundaryOperatorFor, regimeFor } from "@/lib/authority/resolve";
import { appointmentRoute } from "@/lib/award/appointment";
import { closeRejected, loadDestinations, openSuccessor, recordChoice, snapshotOf } from "@/lib/approvals/rejection-store";
import { choiceFault, rejectionOutcome, rejectionSnapshot, REJECTION_KINDS, type RejectionKind } from "@/lib/authority/rejection";
import { CHOICE_FAULT_TEXT } from "@/lib/authority/rejection-labels";
import { APPOINTMENT_DOMAIN } from "@/lib/method/types";
import { awardAuditCreate, awardAuditPair } from "@/lib/award/audit-view";
import { termsUpdate } from "@/lib/award/terms";
import { BASELINE_FIELDS, baselineOf, baselineSnapshot, ladOnValueChange, prefill, REASON_COLUMN, reasonsOnSave, worksAppendixAmount, type AwardTerms, type BaselineField, type FrozenTender } from "@/lib/award/appendix-baseline";
import { percentAboveZero } from "@/lib/securities/money";
import { icNumberFault } from "@/lib/award/mask";
import { exerciseCitationFault } from "@/lib/award/citation";
import { despatchFaults } from "@/lib/award/distribution";
import { evaluateAward } from "@/lib/award/evaluate";
import { awardOpenRefusal, evaluationFindings, exerciseOpenForAward } from "@/lib/award/gate";
import { readWindowGate } from "@/lib/window/repo";
import { bidGate } from "@/lib/bids/repo";
import { awardeeBidderText, awardeePartyWrite, openingGateFaults } from "@/lib/opening/award-gate";
import { loadOpeningGate } from "@/lib/opening/gate-read";
import { recommendationDifferences } from "@/lib/evaluation/award-gate";
import { bundleFaults, tabledVersionFault } from "@/lib/evaluation/bundle";
import { evaluationFindingText } from "@/lib/evaluation/labels";
import { loadEvaluationGate, type EvaluationGate } from "@/lib/evaluation/gate-read";
import { openingFindingText } from "@/lib/opening/labels";
import { bidFindingText } from "@/lib/bids/labels";
import { awardValueFaults, instrumentFor } from "@/lib/award/instrument";
import { AWARD_STATUS_LABEL, awardFindingText, BOND_FAULT_TEXT, DESPATCH_FAULT_TEXT, INSURANCE_FAULT_TEXT, SIGNER_FAULT_TEXT, differsRefusal, tenderTermText } from "@/lib/award/labels";
import { renderedText } from "@/lib/award/merge";
import { awardFacts, dossierEvidenceOf, exerciseMatters, frozenTenderOf, loadAwardConfig, matterRecord, withLockedAward, withLockedExerciseForAward, latestRoute, type LoadedAward } from "@/lib/award/repo";
import { receivedOnFault } from "@/lib/award/routing";
import { approvedOnOf, checkSignatory } from "@/lib/award/signatory";
import { correctionScansMissing, instrumentReturned, returnReadsComplete, type ReturnRecord } from "@/lib/award/stage-two";
import { acceptOnCompleteReturn, returnRecordOf, returnScans } from "@/lib/award/return-acceptance";
import { RETURN_SCAN_LABEL } from "@/lib/award/labels";
import { evidenceSnapshot } from "@/lib/documents/evidence";
import { awardTransition, editable, LIVE_STATUSES } from "@/lib/award/status";
import type { AwardStatus, Finding, InstrumentKind } from "@/lib/award/types";
import { issueDayOf } from "@/lib/contract/issue-year";
import { dayToDate, storedDay } from "@/lib/dates";
import { manualCommitment } from "@/lib/integration/award-commitment";
import { ACT_LABEL } from "@/lib/labels";
import { approvedRouteOf, evaluationContext } from "@/lib/method/repo";
import { formatSen, parseSen, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { committeeStepFrom } from "@/lib/requisition/committee-step";
import { actingOffice } from "@/lib/authority/escalation";
import { committeeCitationWrite, personDecisionWrite } from "@/lib/authority/decided-step";
import { deciderFaults, holdersFor } from "@/lib/requisition/holders";
import { deciderFaultText } from "@/lib/requisition/labels";
import { bondFaults, bondRequiredUntil, checkedOnFault, requiredBond } from "@/lib/securities/bond";
import { applicableRequirements, countsAs, insuranceFaults, wcSumCheck } from "@/lib/securities/insurance";
import { completionDay } from "@/lib/securities/period";
import { supplierFaultText } from "@/lib/suppliers/labels";
import { awardVendorOnParty } from "@/lib/suppliers/link";
import { FormReader } from "@/lib/validate";
import { contractCancellable } from "@/lib/contract/status";
import type { ContractStatus } from "@/lib/contract/types";

/**
 * Writes for awards (6.11) and the registers on their contracts.
 *
 * Every action is reachable by a direct POST, so each re-runs its checks inside one
 * transaction that locks the requisition, the exercise and the award, and reads the
 * issue in force and the configuration there (`awardFacts` → `evaluateAward`). The
 * write and its audit rows share the transaction; a refusal saves nothing and names
 * what blocks it. Nobody is signed in: a decision or a signature records the Person the
 * officer names, "recorded on behalf of, not signed", and the audit stays unattributed.
 */

const GONE: FormState = { ok: false, message: "That award no longer exists." };
const CHANGED: FormState = { ok: false, message: "The award changed while this was being saved. Reload and try again." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration, Organisation first. Today's date decides this act, and it is not assumed to be UTC." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

const labelOf = (a: { reference: string; awardeeName: string }) => `${a.reference} · ${a.awardeeName}`;
const refuse = (fs: readonly Finding[], lead: string): FormState => ({ ok: false, message: `${lead} ${fs.map(awardFindingText).join(" ")}` });

function refresh(id?: string, exerciseId?: string) {
  revalidatePath("/awards");
  revalidatePath("/securities");
  if (id) revalidatePath(`/awards/${id}`);
  if (exerciseId) revalidatePath(`/sourcing/${exerciseId}`);
}

async function inAward(id: string, fn: (tx: Tx, l: LoadedAward) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  let exerciseId: string | undefined;
  try {
    result = await withLockedAward(id, (tx, l) => {
      exerciseId = l.ex.id;
      return fn(tx, l);
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    throw e;
  }
  if (result?.ok) refresh(id, exerciseId);
  return result ?? GONE;
}

/// Move the award from the status read under the lock, or roll the transaction back.
async function mustMove(tx: Tx, l: LoadedAward, to: AwardStatus, extra: Prisma.AwardUpdateManyMutationInput = {}) {
  const moved = await tx.award.updateMany({ where: { id: l.award.id, status: l.award.status }, data: { status: to, ...extra } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
}

const UNITS = ["DAYS", "WEEKS", "MONTHS"] as const;
const supplierWords = (v: { reference: string; registeredName: string }) => `${v.reference} · ${v.registeredName}`;
const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const triState = (r: FormReader, name: string, label: string) => {
  const v = r.choice(name, label, ["yes", "no"] as const);
  return v == null ? null : v === "yes";
};
/// A percentage to at most four places, as Decimal(9,4) wants it.
function percent(r: FormReader, name: string, label: string): string | null {
  const v = r.optionalText(name)?.replace(/%$/, "").trim() ?? null;
  if (!v) return null;
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(v) || Number(v) > 100) {
    r.reject(name, `${label} must be a percentage up to 100, to at most four decimal places.`);
    return null;
  }
  return v;
}

/// 64-C4: an award's terms as the tender baseline compares them.
const termsOf = (a: { ladAmount: { toString(): string } | null; ladUnit: string; dlpMonths: number | null; regulatedActivity: boolean | null }): AwardTerms => ({
  ladAmount: a.ladAmount == null ? null : senFromDecimal(a.ladAmount),
  ladUnit: a.ladUnit,
  dlpMonths: a.dlpMonths,
  regulatedActivity: a.regulatedActivity,
});
/// The tender's statement of a term, in words, for a refusal.
const tenderStates = (field: BaselineField, t: FrozenTender, value: Sen) => tenderTermText(field, baselineOf(t, value)) ?? "nothing";

// ------------------------------------------------------------------ 6.8: the recommendation (E-9)

type AwardFigures = { value: Sen; period: { value: number; unit: "DAYS" | "WEEKS" | "MONTHS" }; reasons: { value: string | null; period: string | null } };

/// The evaluation's refusal of an award's awardee, value or period, as field errors where a field can fix it; null: none.
// 68-C3: a differing value above the frozen quotation ceiling (or one that cannot be judged) is the value's to fix.
const FIELD: Record<string, string> = { AWARDEE_NOT_RECOMMENDED: "awardeePartyId", VALUE_DIFFERS_REASON_REQUIRED: "recValueDiffersReason", PERIOD_DIFFERS_REASON_REQUIRED: "recPeriodDiffersReason", VALUE_ABOVE_CEILING: "awardedValue", BOUNDARY_NOT_RECORDED: "awardedValue" };

/// `fieldsOnly`: a draft's edit asks only what its fields fix (the rest is asked at submission and issue).
function recommendationRefusal(e: EvaluationGate, awardeePartyId: string | null, award: AwardFigures, fieldsOnly = false): FormState | null {
  if (!e.gate.applies) return null;
  const all = evaluationFindings({ facts: e.gate, awardeePartyId, award });
  const fs = fieldsOnly ? all.filter((f) => FIELD[f.code]) : all;
  if (!fs.length) return null;
  const general = fs.filter((f) => !FIELD[f.code]);
  if (general.length) return refuse(general, "Nothing was saved:");
  return { ok: false, errors: Object.fromEntries(fs.map((f) => [FIELD[f.code], awardFindingText(f)])) };
}

/// The reasons written: each only where its figure differs from the recommendation (cleared where it no longer does).
function recordedReasons(e: EvaluationGate, value: Sen, period: AwardFigures["period"], reasons: AwardFigures["reasons"]) {
  const rec = e.gate.applies ? e.gate.issued : null;
  if (!rec) return {};
  const diffs = recommendationDifferences({ value, period }, rec);
  return { recValueDiffersReason: diffs.includes("value") ? reasons.value : null, recPeriodDiffersReason: diffs.includes("period") ? reasons.period : null };
}

// ------------------------------------------------------------------ opening

/**
 * Open an award on an exercise in preparation (spec §6.11). The instrument follows the
 * exercise's regime and the customer's policy; the reference is issued from the
 * `award` series in the same transaction. At most one live award per exercise.
 */
export async function createAward(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = String(data.get("exerciseId") ?? "");
  const r = new FormReader(data);
  const v = {
    awardeeName: r.text("awardeeName", "Awardee", { required: true, max: 240 }),
    awardeeRegistrationNo: r.text("awardeeRegistrationNo", "Registration number", { max: 120 }),
    awardeeAddress: r.text("awardeeAddress", "Address", { max: 1000 }),
    awardedValue: r.money("awardedValue", "Awarded value", { required: true }),
    completionPeriod: r.int("completionPeriod", "Completion period", { required: true, min: 1 }),
    completionUnit: r.choice("completionUnit", "Unit", UNITS, { required: true }),
    startDate: r.date("startDate", "Start date"),
  };
  const awardeePartyId = r.optionalText("awardeePartyId");
  const reasons = { value: r.optionalText("recValueDiffersReason"), period: r.optionalText("recPeriodDiffersReason") };
  if (r.failed || !v.awardedValue || !v.completionPeriod || !v.completionUnit) return { ok: false, errors: r.errors, message: "Nothing was saved. Correct the fields marked below." };

  let id: string | null = null;
  try {
    const result = await withLockedExerciseForAward(exerciseId, async (tx, l): Promise<FormState> => {
      const { org, ex, req } = l;
      if (!org.today) return NO_ZONE;
      // X-9 (6.5): an exercise with a tender or quotation pack needs its invitation window closed, with no change pending.
      const gate = await readWindowGate(ex, org.timeZone, tx);
      if (!exerciseOpenForAward(ex.status, ex.packKindSnapshot, gate)) return { ok: false, message: awardOpenRefusal(ex.packKindSnapshot, ex.status, gate) };
      const live = await tx.award.findFirst({ where: { exerciseId: ex.id, status: { in: [...LIVE_STATUSES] } }, select: { reference: true } });
      if (live) return { ok: false, message: `This exercise already has a live award, ${live.reference}. Cancel it first to open another.` };
      // 6.7 (C-7, C-8, flagged): the openings' checks, and the awardee a party carried to evaluation, compared as a party.
      const opening = await loadOpeningGate(ex.id, tx);
      const og = openingGateFaults(opening, opening.applies ? awardeePartyId : undefined);
      const naming = og.filter((f) => f.code === "AWARDEE_NOT_NAMED" || f.code === "AWARDEE_NOT_CARRIED");
      if (og.length > naming.length) return refuse(og.filter((f) => !naming.includes(f)), "No award was opened:");
      if (naming.length) return { ok: false, errors: { awardeePartyId: naming.map(openingFindingText).join(" ") } };
      // 6.8 (E-9, flagged): Evaluated, the report standing, the awardee the recommended tenderer; a value or
      // period that differs from the recommendation carries its reason.
      const evaluation = await loadEvaluationGate(ex.id, tx);
      const period = { value: v.completionPeriod!, unit: v.completionUnit! };
      const evf = recommendationRefusal(evaluation, awardeePartyId, { value: parseSen(v.awardedValue!), period, reasons });
      if (evf) return evf;
      const recorded = recordedReasons(evaluation, parseSen(v.awardedValue!), period, reasons);
      const config = await loadAwardConfig(org.id, tx);
      const instrument = instrumentFor(ex.regime, config.policy);
      if ("fault" in instrument) return refuse([{ code: instrument.fault, level: "block", data: { regime: instrument.regime } }], "No award was opened:");
      const { issue, cfg, ctx } = await evaluationContext(org, req, ex, tx);
      if (!issue || !ctx) return refuse([{ code: "NO_ISSUE_IN_FORCE", level: "block" }], "No award was opened:");
      const value = parseSen(v.awardedValue!);
      const method = cfg.config.methods.find((m) => m.code === ex.sourcingMethodCode) ?? null;
      // Resolved here for its rule alone (the value checks below); who can act, and the
      // requester-only check (FR-APR-008), are judged at submission.
      const route = appointmentRoute(ctx.funder, method, Number(senToDecimalString(value)), { absentRoleCodes: [], requesterHolds: () => false });
      const siblings = await tx.award.findMany({ where: { exercise: { requisitionId: req.id }, status: { in: [...LIVE_STATUSES] } }, select: { awardedValue: true } });
      const faults = awardValueFaults({
        value,
        estimate: senFromDecimal(ex.estimatedValue),
        exerciseRegime: ex.regime,
        exerciseRuleKey: ex.appointmentRuleKey,
        exerciseRuleLabel: null,
        freshRegime: regimeFor(Number(senToDecimalString(value)), ctx.funder.dal.policy),
        freshRuleKey: route.ruleKey,
        freshRuleLabel: route.ruleLabel,
        approvedValue: approvedRouteOf({ approvalInstances: req.approvalInstances })?.value ?? null,
        otherAwards: siblings.map((s) => senFromDecimal(s.awardedValue)),
      }).filter((f) => f.level === "block");
      if (faults.length) return { ok: false, errors: { awardedValue: faults.map(awardFindingText).join(" ") } };
      const reference = await issueReference(tx, org.id, "award", dayToDate(org.today));
      // 64-C4 (6.4 Q-1 B): on an exercise whose approved pack froze an Appendix, the terms open as the tender stated them.
      const tender = await frozenTenderOf(ex.id, org.timeZone, tx);
      const filled = tender ? prefill(baselineOf(tender, value)) : {};
      // 6.15a fix M-1 (flagged against 6.11): a new award takes its awardee party's register link, read with the exercise locked.
      const partyId = awardeePartyWrite(opening, awardeePartyId) ?? null;
      const party = partyId ? await tx.exerciseParty.findUnique({ where: { id: partyId }, select: { vendor: { select: { id: true, reference: true, registeredName: true } } } }) : null;
      const link = awardVendorOnParty(null, partyId, party?.vendor?.id ?? null);
      const row = await tx.award.create({
        data: {
          organisationId: org.id,
          reference,
          exerciseId: ex.id,
          instrumentKind: instrument.kind,
          // R-2: written only where the openings apply and the bidder was carried.
          awardeePartyId: awardeePartyWrite(opening, awardeePartyId) ?? null,
          vendorId: link.vendorId,
          awardeeName: v.awardeeName,
          awardeeRegistrationNo: v.awardeeRegistrationNo,
          awardeeAddress: v.awardeeAddress,
          awardedValue: senToDecimalString(value),
          completionPeriod: v.completionPeriod!,
          completionUnit: v.completionUnit!,
          startDate: v.startDate,
          ...recorded,
          ...(filled.ladAmount != null ? { ladAmount: senToDecimalString(filled.ladAmount), ladUnit: filled.ladUnit } : {}),
          ...(filled.dlpMonths != null ? { dlpMonths: filled.dlpMonths } : {}),
          ...(filled.regulatedActivity != null ? { regulatedActivity: filled.regulatedActivity } : {}),
        },
      });
      await audit(tx, org.id, "Award", row.id, labelOf(row), "CREATE", awardAuditCreate(row, { exercise: ex.reference, instrument: instrument.kind, ...(row.awardeePartyId ? { awardeeBidder: awardeeBidderText(opening.carried, row.awardeePartyId) } : {}), ...(party?.vendor ? { supplier: supplierWords(party.vendor), supplierLink: "Follows the awardee party's link" } : {}), ...(tender ? { termsFrom: `the tender Appendix, documents version ${tender.packVersion}` } : {}) }));
      id = row.id;
      return { ok: true };
    });
    if (!result) return { ok: false, message: "That exercise no longer exists." };
    if (!result.ok) return result;
  } catch (e) {
    if (e instanceof NumberingError) {
      return { ok: false, message: e.fault === "SERIES_MISSING" ? "No numbering series for awards is configured, so no reference can be issued. Add the series keyed “award” under Configuration, Numbering." : "The awards numbering series is not valid. Correct it under Configuration, Numbering." };
    }
    throw e;
  }
  refresh(id!, exerciseId);
  redirect(`/awards/${id}`);
}

/// The awardee, value and period: only while the award is a draft, because they are
/// what the appointment approves.
export async function updateAwardDetails(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    awardeeName: r.text("awardeeName", "Awardee", { required: true, max: 240 }),
    awardeeRegistrationNo: r.text("awardeeRegistrationNo", "Registration number", { max: 120 }),
    awardeeAddress: r.text("awardeeAddress", "Address", { max: 1000 }),
    awardedValue: r.money("awardedValue", "Awarded value", { required: true }),
    completionPeriod: r.int("completionPeriod", "Completion period", { required: true, min: 1 }),
    completionUnit: r.choice("completionUnit", "Unit", UNITS, { required: true }),
  };
  const partyPosted = data.has("awardeePartyId");
  const awardeePartyId = r.optionalText("awardeePartyId");
  const reasons = { value: r.optionalText("recValueDiffersReason"), period: r.optionalText("recPeriodDiffersReason") };
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    // 6.7 (C-7): on an exercise whose openings apply, the awardee is a party carried to evaluation.
    // R-2: the party is written only then; where the openings do not apply, a posted id is ignored.
    const opening = partyPosted ? await loadOpeningGate(l.ex.id, tx) : null;
    if (opening) {
      const naming = openingGateFaults(opening, opening.applies ? awardeePartyId : undefined).filter((f) => f.code === "AWARDEE_NOT_NAMED" || f.code === "AWARDEE_NOT_CARRIED");
      if (naming.length) return { ok: false, errors: { awardeePartyId: naming.map(openingFindingText).join(" ") } } as FormState;
    }
    const partyWrite = opening ? awardeePartyWrite(opening, awardeePartyId) : undefined;
    // Residual 7: a locked award says it is fixed before anything about its awardee's link.
    if (!editable(l.award.status as AwardStatus).details) return { ok: false, message: `The awardee, value and period are fixed once the award goes for approval. This one is ${AWARD_STATUS_LABEL[l.award.status as AwardStatus].toLowerCase()}.` };
    // 6.15a fix M-1 (flagged against 6.11): the awardee changed, the register link follows its party; an own link that disagrees is refused.
    const party = partyWrite ? await tx.exerciseParty.findUnique({ where: { id: partyWrite }, select: { vendor: { select: { id: true, reference: true, registeredName: true } } } }) : null;
    const link = partyWrite !== undefined ? awardVendorOnParty({ awardeePartyId: l.award.awardeePartyId, vendorId: l.award.vendorId }, partyWrite, party?.vendor?.id ?? null) : null;
    if (link?.fault) return { ok: false, errors: { awardeePartyId: supplierFaultText({ ...link.fault, data: { awardSupplier: l.award.vendor ? supplierWords(l.award.vendor) : null, partySupplier: party?.vendor ? supplierWords(party.vendor) : null } }) } };
    // 6.8 (E-9, flagged): the recommended tenderer, and each difference with its reason (the rest of the gate at submission).
    const evaluation = await loadEvaluationGate(l.ex.id, tx);
    const period = { value: v.completionPeriod!, unit: v.completionUnit! };
    const evf = recommendationRefusal(evaluation, partyWrite !== undefined ? partyWrite : l.award.awardeePartyId, { value: parseSen(v.awardedValue!), period, reasons }, true);
    if (evf) return evf;
    const recorded = recordedReasons(evaluation, parseSen(v.awardedValue!), period, reasons);
    // 64-C4: damages the tender states as a percentage, still as resolved against the old sum, follow the new one.
    const tender = await frozenTenderOf(l.ex.id, l.org.timeZone, tx);
    const lad = tender ? ladOnValueChange(tender, senFromDecimal(l.award.awardedValue), parseSen(v.awardedValue!), termsOf(l.award)) : null;
    const after = { ...v, awardedValue: senToDecimalString(parseSen(v.awardedValue!)), completionPeriod: v.completionPeriod!, completionUnit: v.completionUnit!, ...recorded, ...(lad != null ? { ladAmount: senToDecimalString(lad) } : {}), ...(partyWrite !== undefined ? { awardeePartyId: partyWrite } : {}), ...(link ? { vendorId: link.vendorId } : {}) };
    const { facts } = await awardFacts({ ...l, award: { ...l.award, awardedValue: after.awardedValue as never } }, tx);
    const ev = evaluateAward(facts);
    const blocks = ev.valueFaults.filter((f) => f.level === "block");
    if (blocks.length) return { ok: false, errors: { awardedValue: blocks.map(awardFindingText).join(" ") } };
    const moved = await tx.award.updateMany({ where: { id, status: "DRAFT", updatedAt: l.award.updatedAt }, data: after });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    // R-7: the bidder named reads by name in the trail, never as the party's id.
    const bidder = opening && partyWrite !== undefined && partyWrite !== l.award.awardeePartyId ? diffFields({ awardeeBidder: awardeeBidderText(opening.carried, l.award.awardeePartyId) }, { awardeeBidder: awardeeBidderText(opening.carried, partyWrite) }) : [];
    const relinked = link && link.vendorId !== l.award.vendorId ? diffFields({ supplier: l.award.vendor ? supplierWords(l.award.vendor) : null }, { supplier: party?.vendor ? supplierWords(party.vendor) : null, supplierLink: "Follows the awardee party's link" }) : [];
    await audit(tx, l.org.id, "Award", id, labelOf(l.award), "UPDATE", [...awardAuditPair(l.award, { ...l.award, ...after }), ...bidder, ...relinked], String(data.get("reason") ?? ""));
    return { ok: true };
  });
}

/// The letter's terms, the bond decision and the start date: until issue, each with its
/// provenance. None is defaulted (D4, B3, B8).
export async function updateAwardTerms(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const bondRequired = triState(r, "bondRequired", "Performance bond required");
  const v = {
    startDate: r.date("startDate", "Start date"),
    regulatedActivity: triState(r, "regulatedActivity", "Regulated activity"),
    bondRequired,
    bondNotRequiredReason: r.text("bondNotRequiredReason", "Why no bond is required", { max: 2000 }),
    bondBasis: r.choice("bondBasis", "Bond basis", ["CONTRACT_PRICE", "ANNUAL_VALUE", "STATED_AMOUNT"] as const),
    bondPercent: percent(r, "bondPercent", "Bond percentage"),
    bondBasisAmount: r.money("bondBasisAmount", "One-year value or stated amount"),
    bondValidityExtraMonths: r.int("bondValidityExtraMonths", "Months past completion", { min: 0 }),
    bondBasisProvenance: r.choice("bondBasisProvenance", "Where the basis came from", PROVENANCE),
    bondBasisNote: r.text("bondBasisNote", "Basis note", { max: 2000 }),
    ladAmount: r.money("ladAmount", "Liquidated damages"),
    ladUnit: r.text("ladUnit", "Per", { max: 60 }),
    retentionPercent: percent(r, "retentionPercent", "Retention"),
    retentionCapPercent: percent(r, "retentionCapPercent", "Retention limit"),
    dlpMonths: r.int("dlpMonths", "Defects liability period", { min: 0 }),
    termsProvenance: r.choice("termsProvenance", "Where the terms came from", PROVENANCE),
    wcBasis: r.choice("wcBasis", "Workmen's compensation basis", ["UNCOVERED_WAGES", "PERCENT_OF_CONTRACT"] as const),
  };
  if (bondRequired === false && !v.bondNotRequiredReason) r.reject("bondNotRequiredReason", "Say why no performance bond is required.");
  if (bondRequired && v.bondPercent != null && !percentAboveZero(v.bondPercent)) r.reject("bondPercent", "0% is not a bond: give the percentage, or answer that no bond is required and say why.");
  if (bondRequired === false && !v.bondBasisProvenance) r.reject("bondBasisProvenance", "Say where the decision that no bond is required came from.");
  if (bondRequired && v.bondBasis === "ANNUAL_VALUE" && v.bondBasisAmount && !v.bondBasisProvenance) r.reject("bondBasisProvenance", "An entered one-year value needs its provenance.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    if (!editable(l.award.status as AwardStatus).terms) return { ok: false, message: "The terms are fixed once the instrument is issued: they are in its text." };
    // Only what the form carried is written: a field it did not show keeps its stored value.
    const present = new Set([...data.keys()]);
    const after: Record<string, unknown> = termsUpdate(present, {
      ...v,
      bondBasisAmount: v.bondBasisAmount ? senToDecimalString(parseSen(v.bondBasisAmount)) : null,
      ladAmount: v.ladAmount ? senToDecimalString(parseSen(v.ladAmount)) : null,
    });
    // 64-C4 (6.4 Q-1 B): where the exercise froze a tender Appendix, a term stated otherwise needs its reason.
    const tender = await frozenTenderOf(l.ex.id, l.org.timeZone, tx);
    if (tender) {
      const value = senFromDecimal(l.award.awardedValue);
      const stated = termsOf({ ...l.award, ...(after as Partial<typeof l.award>) });
      const carried = new Set(BASELINE_FIELDS.filter((f) => (f === "lad" ? present.has("ladAmount") || present.has("ladUnit") : present.has(f === "dlp" ? "dlpMonths" : "regulatedActivity"))));
      const given = Object.fromEntries(BASELINE_FIELDS.map((f) => [f, String(data.get(REASON_COLUMN[f]) ?? "").slice(0, 2000)]));
      const stored = { lad: l.award.ladDiffersReason, dlp: l.award.dlpDiffersReason, regulated: l.award.regulatedDiffersReason };
      const { reasons, missing } = reasonsOnSave(baselineOf(tender, value), stated, carried, given, stored);
      if (missing.length) return { ok: false, errors: Object.fromEntries(missing.map((f) => [REASON_COLUMN[f], differsRefusal(f, tenderStates(f, tender, value))])) };
      for (const f of BASELINE_FIELDS) after[REASON_COLUMN[f]] = reasons[f];
    }
    const moved = await tx.award.updateMany({ where: { id, status: l.award.status, updatedAt: l.award.updatedAt }, data: after });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "Award", id, labelOf(l.award), "UPDATE", awardAuditPair(l.award, { ...l.award, ...after }), String(data.get("reason") ?? ""));
    return { ok: true };
  });
}

// ------------------------------------------------------------ the appointment

const routeLabel = (a: { reference: string }) => `${a.reference} · appointment route`;

/**
 * Send the award for the appointment's approval (FR-AWD-001; 6.3 BD-3). The route is
 * re-resolved now, for the awarded value, under the issue in force, with FR-APR-010's
 * escalation, and persisted with every rule it was judged under. The exercise's
 * classification is locked from here (FR-MTD-011).
 */
export async function submitAward(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  return inAward(id, async (tx, l) => {
    const t = awardTransition(l.award.status as AwardStatus, "PENDING_APPROVAL", { today: l.org.today });
    if (t === "TIME_ZONE_UNSET") return NO_ZONE;
    if (t) return { ok: false, message: "Only a draft award is sent for approval." };
    const r = await awardFacts(l, tx);
    const ev = evaluateAward(r.facts);
    const blocks = ev.submitFaults.filter((f) => f.level === "block");
    if (blocks.length || !ev.route?.ok || !r.issue) return refuse(blocks, "Not sent for approval:");
    const route = ev.route;
    const src = route.source === "OVERRIDE" && r.facts.funder?.override ? r.facts.funder.override : { id: r.issue.id, label: r.issue.label, matrix: r.issue.matrix };
    const rule = src.matrix.rules.find((x) => x.ruleKey === route.ruleKey)!;
    const roleLabel = (code: string) => src.matrix.roles[code]?.nameEn ?? r.issue!.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const on = dayToDate(l.org.today!);
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "EXERCISE",
        exerciseId: l.ex.id,
        awardId: l.award.id,
        domain: "appointment",
        value: l.award.awardedValue,
        authorityMatrixId: r.issue.id,
        matrixLabel: r.issue.label,
        ruleKey: rule.ruleKey,
        ruleLabel: rule.labelEn,
        ruleClause: rule.clause,
        boundaryValue: String(src.matrix.policy.boundaryValue),
        boundaryInclusive: src.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
        boundaryOperator: boundaryOperatorFor(rule, src.matrix.policy),
        fundingRouteCode: l.req.fundingRouteCode,
        fundingOverrideApplied: route.source === "OVERRIDE",
        overrideMatrixId: route.overrideIssue?.id ?? null,
        overrideMatrixLabel: route.overrideIssue?.label ?? null,
        checkedAgainstMatrix: true,
        warnings: route.warnings as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        openedAt: on,
        // Where a refusal would send it, as configured now (FR-APR-016, ruling CO-4).
        ...rejectionSnapshot(await loadDestinations(tx, l.org.id), APPOINTMENT_DOMAIN, on, new Date()),
        // The core routing behind the chain, as it stood (FR-APR-004, ruling C4).
        ...routeCoreFields(route.core, new Date()),
        steps: {
          create: route.chain.map((s, i) => ({
            sequence: i + 1,
            roleCode: s.roleCode,
            roleLabel: roleLabel(s.roleCode),
            act: s.act,
            committeeCode: s.committeeCode ?? null,
            nonDelegable: s.nonDelegable,
            sourceRuleKey: s.sourceRuleKey,
            chainOrigin: stepOrigin(s),
          })),
        },
      },
    });
    await audit(tx, l.org.id, "ApprovalInstance", instance.id, routeLabel(l.award), "CREATE",
      diffFields(null, { matrix: r.issue.label, rule: rule.labelEn, route: route.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), fundingOverrideApplied: route.source === "OVERRIDE", escalated: route.warnings.some((w) => w.code === "ABSENCE" || w.code === "SELF_APPROVAL") ? "yes" : null }));
    // FR-MTD-009: a direct appointment is sent on the dossier evidence attached now, and
    // the pins are kept: issue refuses if one of them is withdrawn since (scope ruling).
    const dossier = r.method?.requiresDossier ? evidenceSnapshot((await dossierEvidenceOf(l.ex.id, null, tx)).attachments, ["DOSSIER_EVIDENCE"], l.org.today!) : null;
    await mustMove(tx, l, "PENDING_APPROVAL", dossier ? { dossierEvidenceSnapshot: dossier as unknown as Prisma.InputJsonValue } : {});
    await audit(tx, l.org.id, "Award", id, labelOf(l.award), "UPDATE", diffFields({ status: l.award.status }, { status: "PENDING_APPROVAL", dossierEvidence: dossier ? dossier.pins.map((p) => `${p.title} (version ${p.versionNo})`).join("; ") : null }));
    // FR-MTD-011: the contract type is fixed from the award on; changed only by a controlled change.
    // The moment it was locked; shown as the organisation's day (formatOrgDay).
    if (!l.ex.classificationLockedAt) {
      const lockedAt = new Date();
      await tx.sourcingExercise.update({ where: { id: l.ex.id }, data: { classificationLockedAt: lockedAt } });
      await audit(tx, l.org.id, "SourcingExercise", l.ex.id, `${l.ex.reference} · ${l.ex.title}`, "UPDATE", diffFields({ classificationLockedAt: null }, { classificationLockedAt: on }), `Award ${l.award.reference} sent for approval.`);
    }
    return { ok: true };
  });
}

/// Where a refused appointment can go: back to Draft to be reworked, back to an earlier
/// step on a successor route, or the award ends (Cancelled, under BD-17's rules).
const AWARD_SUPPORTS: readonly RejectionKind[] = ["RETURN_TO_ORIGINATOR", "RETURN_TO_STEP", "TERMINATE"];

/**
 * Close the route when its last step is done. When a step refuses, the destination
 * snapshotted at open — or, on a committee step, the committee's own not-carried
 * outcome — says where the award goes (FR-APR-016); where nothing applies the award
 * waits, still pending approval, for the officer's choice (ruling CO-5).
 */
async function afterStep(tx: Tx, l: LoadedAward, instId: string, decision: "DONE" | "REJECTED", stepId: string, reason: string, committee: { kind: "LOOP" | "TERMINAL" } | null = null) {
  const inst = l.award.approvalInstances.find((i) => i.id === instId)!;
  if (decision === "REJECTED") {
    const step = inst.steps.find((s) => s.id === stepId)!;
    const outcome = rejectionOutcome({ snapshot: snapshotOf(inst), committee, steps: inst.steps, rejectingSeq: step.sequence, supports: AWARD_SUPPORTS });
    await closeRejected(tx, { organisationId: l.org.id, routeLabel: routeLabel(l.award) }, inst, outcome, reason);
    if ("apply" in outcome) await sendAwardRejected(tx, l, inst.id, outcome.apply, outcome.returnToSeq ?? null, reason);
    return;
  }
  if (!inst.steps.every((s) => s.id === stepId || s.decision === "DONE")) return;
  await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "APPROVED", closedAt: new Date() } });
  await audit(tx, l.org.id, "ApprovalInstance", inst.id, routeLabel(l.award), "UPDATE", diffFields({ status: inst.status }, { status: "APPROVED" }), reason);
  await mustMove(tx, l, "APPROVED");
  await audit(tx, l.org.id, "Award", l.award.id, labelOf(l.award), "UPDATE", diffFields({ status: l.award.status }, { status: "APPROVED" }));
}

/// Send a refused appointment where its rejection says.
async function sendAwardRejected(tx: Tx, l: LoadedAward, instId: string, kind: RejectionKind, returnToSeq: number | null, reason: string) {
  const a = l.award;
  if (kind === "RETURN_TO_ORIGINATOR") {
    await mustMove(tx, l, "DRAFT");
    await audit(tx, l.org.id, "Award", a.id, labelOf(a), "UPDATE", diffFields({ status: a.status }, { status: "DRAFT" }), `The appointment was refused: ${reason}`);
  } else if (kind === "TERMINATE") {
    const t = awardTransition(a.status as AwardStatus, "CANCELLED", { today: l.org.today, reason });
    if (t) throw new Refusal({ ok: false, message: "The award cannot be cancelled from where it stands." });
    await mustMove(tx, l, "CANCELLED", { cancelReason: `The appointment was refused: ${reason}` });
    await audit(tx, l.org.id, "Award", a.id, labelOf(a), "UPDATE", diffFields({ status: a.status }, { status: "CANCELLED" }), `The appointment was refused and the award ends: ${reason}`);
  } else {
    // The award stays pending approval; the route continues from the earlier step.
    await openSuccessor(tx, { organisationId: l.org.id, routeLabel: routeLabel(a) }, instId, returnToSeq!, dayToDate(l.org.today!));
  }
}

/**
 * Where a refused appointment goes, chosen by the officer where the refusal decided
 * nothing (FR-APR-016, ruling CO-5): recorded as their choice on behalf of a named Person.
 */
export async function chooseAwardRejection(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const kind = r.choice("kind", "Where it goes", REJECTION_KINDS);
  const seq = r.int("returnToSeq", "Step", { min: 1 });
  const personId = r.optionalText("personId");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    if (!l.org.today) return NO_ZONE;
    const inst = latestRoute(l.award);
    if (l.award.status !== "PENDING_APPROVAL") return { ok: false, message: "This award is not waiting for where a refusal sends it." };
    const rejecting = inst?.steps.find((s) => s.decision === "REJECTED") ?? null;
    const fault = choiceFault(
      { status: inst?.status ?? "", applied: (inst?.rejectionApplied as RejectionKind | null) ?? null, offered: (inst?.rejectionChoices as RejectionKind[] | undefined) ?? [], steps: inst?.steps ?? [], rejectingSeq: rejecting?.sequence ?? null },
      { kind, returnToSeq: seq, personId, reason },
    );
    if (fault) {
      const field = { NOT_OFFERED: "kind", STEP_REQUIRED: "returnToSeq", STEP_NOT_EARLIER: "returnToSeq", PERSON_REQUIRED: "personId", REASON_REQUIRED: "reason" } as Record<string, string>;
      return field[fault] ? { ok: false, errors: { [field[fault]]: CHOICE_FAULT_TEXT[fault] } } : { ok: false, message: CHOICE_FAULT_TEXT[fault] };
    }
    const person = await tx.person.findFirst({ where: { id: personId!, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    await recordChoice(tx, { organisationId: l.org.id, routeLabel: routeLabel(l.award) }, inst!.id, kind!, person.id, person.name, reason);
    await sendAwardRejected(tx, l, inst!.id, kind!, kind === "RETURN_TO_STEP" ? seq : null, reason);
    return { ok: true };
  });
}

/**
 * A named Person's decision on a person step of the appointment route, recorded on
 * their behalf: 6.1's holder, delegation, self-approval and date checks. The day the
 * matter reached them is optional (FR-CTE-014). A committee step is refused here: it is
 * discharged by its committee's decision.
 */
export async function decideAppointmentStep(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const stepId = String(data.get("stepId") ?? "");
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const received = r.date("receivedOn", "Received on");
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is refused.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l): Promise<FormState> => {
    const inst = latestRoute(l.award);
    if (l.award.status !== "PENDING_APPROVAL" || !inst || inst.status !== "PENDING") return { ok: false, message: "No approval is open on this award." };
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "That step is not on the open route." };
    const f = await awardFacts(l, tx);
    const decidedOn = storedDay(on);
    const person = f.roster.people.find((p) => p.id === personId) ?? null;
    const check = deciderFaults(step, {
      today: l.org.today,
      // Judged on the office acting for the step, where it was escalated (FR-APR-009/010).
      holders: actingOffice(step) ? holdersFor(actingOffice(step)!, f.unitPath, f.roster, f.delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
      person,
      requesterId: l.req.requestingPersonId,
      endorserIds: [],
      otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
      earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
      decidedOn,
      openedOn: storedDay(inst.openedAt),
      value: senFromDecimal(l.award.awardedValue),
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((x) => deciderFaultText(x, person?.name ?? null));
      if (check.faults[0] === "COMMITTEE_STEP") return { ok: false, message: "A committee's step is discharged by citing its decision, not by a person." };
      return ["TIME_ZONE_UNSET", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
    }
    const rf = receivedOnFault(received ? storedDay(received) : null, decidedOn, l.org.today!, storedDay(inst.openedAt));
    if (rf) return { ok: false, errors: { receivedOn: ({ RECEIVED_AFTER_DECISION: "The day received cannot be after the decision.", RECEIVED_IN_FUTURE: "The day received cannot be after today.", RECEIVED_BEFORE_ROUTE: "The day received cannot be before the award went for approval." } as const)[rf] } };
    const after = personDecisionWrite({ decision, person: { id: person!.id, name: person!.name }, decidedOn: on, receivedOn: received, delegationId: check.delegationId, reason, recordedAt: new Date() });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.award.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision, receivedOn: null }, { decision, decidedBy: person!.name, decidedOn: on, receivedOn: received, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);
    await afterStep(tx, l, inst.id, decision, step.id, reason);
    return { ok: true };
  });
}

/**
 * Discharge a committee step from the committee's decision (6.3 BD-3): only a matter
 * tabled against this award's exercise, before the step's committee, for its act and
 * value, and only what `decisionRecord()` says of it. Carried discharges it; not
 * carried refuses the route and returns the award to Draft; deferred leaves it waiting.
 */
export async function citeAppointmentDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const stepId = String(data.get("stepId") ?? "");
  const decisionId = String(data.get("committeeDecisionId") ?? "");
  if (!decisionId) return { ok: false, errors: { committeeDecisionId: "Choose the committee's decision." } };
  return inAward(id, async (tx, l) => {
    const inst = latestRoute(l.award);
    if (l.award.status !== "PENDING_APPROVAL" || !inst || inst.status !== "PENDING") return { ok: false, message: "No approval is open on this award." };
    if (!l.org.today) return NO_ZONE;
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step || !step.committeeCode) return { ok: false, message: "That is not a committee step on the open route." };
    if (step.decision !== "PENDING") return { ok: false, message: "This step is already decided." };
    if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) return { ok: false, message: "Steps are decided in order: the step before this one is not done." };
    const matter = (await exerciseMatters(l.ex.id, tx)).find((m) => m.id === decisionId);
    if (!matter) return { ok: false, errors: { committeeDecisionId: "That matter was not tabled against this exercise." } };
    const cited = await tx.approvalStep.findMany({ where: { committeeDecisionId: matter.id }, select: { id: true } });
    const { record, minuted } = matterRecord(matter);
    const fault = exerciseCitationFault(
      { id: matter.id, exerciseId: matter.exerciseId, matterKind: matter.matterKind, domain: matter.domain, act: matter.act, amount: matter.amount?.toString() ?? null, committeeCode: matter.meeting.committee.code, decidedOn: matter.decisionDate ? storedDay(matter.decisionDate) : null },
      step,
      { exerciseId: l.ex.id, value: l.award.awardedValue.toString(), routeOpenedOn: storedDay(inst.openedAt) },
      cited.length ? [matter.id] : [],
    );
    const TEXT = {
      NOT_THIS_EXERCISE: "That matter was not tabled against this exercise.",
      NOT_AN_APPOINTMENT_MATTER: "That matter is not an appointment tabled as an exercise matter.",
      OTHER_COMMITTEE: "That matter was before another committee.",
      OTHER_ACT: "That matter was tabled for a different act from the one this step asks.",
      OTHER_AMOUNT: "That matter was tabled at a different amount from the awarded value.",
      ALREADY_CITED: "That decision already discharges another step: one decision discharges one step.",
      DECIDED_BEFORE_ROUTE: "The committee decided that matter before this award went for approval.",
    } as const;
    if (fault) return { ok: false, errors: { committeeDecisionId: TEXT[fault] } };
    // 6.6 (OD-6, flagged): no appointment decision is cited while a late envelope waits for the committee's decision on admission.
    const bids = await bidGate(l.ex.id, tx);
    if (bids.lateFault) return { ok: false, errors: { committeeDecisionId: bidFindingText(bids.lateFault) } };
    // 6.8 (E-8, flagged): nor while the evaluation's bundle does not stand (its report issued and standing, the Kertas Cadangan checked and recommended).
    // One read (6.8 re-review 1): the version judged is the one whose bundle was checked.
    const gate = await loadEvaluationGate(l.ex.id, tx);
    const bundle = bundleFaults(gate.bundle);
    if (bundle.length) return { ok: false, errors: { committeeDecisionId: bundle.map(evaluationFindingText).join(" ") } };
    // 6.8 fix M-3: and only a decision on the version in force, the one the matter was tabled on.
    const tabledOn = tabledVersionFault({ applies: gate.bundle.applies, tabledOn: matter.evaluationVersion ?? null, inForce: gate.version });
    if (tabledOn) return { ok: false, errors: { committeeDecisionId: evaluationFindingText(tabledOn) } };
    const s = committeeStepFrom(record);
    if (s.decision === "PENDING") return { ok: false, errors: { committeeDecisionId: record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet." } };
    const after = committeeCitationWrite({ decision: s.decision, committeeName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: new Date() });
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
    if (done.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.award.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn, minuted: minuted ? "yes" : "no" }));
    await afterStep(tx, l, inst.id, s.decision === "DONE" ? "DONE" : "REJECTED", step.id, s.decision === "REJECTED" ? `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}` : "", record?.notApproved ?? null);
    return { ok: true };
  });
}

// ------------------------------------------------------------- the commitment

/**
 * The finance system's commitment number (INT-05): an indent's IN number before issue,
 * or a purchase order after. Consumed, never minted; checked against its format.
 */
export async function recordCommitment(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const number = r.text("erpCommitmentNo", "Number", { required: true, max: 60 });
  const kind = r.choice("erpCommitmentKind", "Kind", ["INDENT", "PURCHASE_ORDER"] as const, { required: true });
  const received = r.date("receivedOn", "Received on", { required: true });
  if (r.failed || !kind || !received) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const a = l.award;
    if (!l.org.today) return NO_ZONE;
    if (!["APPROVED", "ISSUED", "ACCEPTED"].includes(a.status)) return { ok: false, message: "The commitment number is recorded once the appointment is approved." };
    if (a.erpCommitmentNo) return { ok: false, message: "A commitment number is already recorded on this award." };
    if (a.instrumentKind === "WORK_INDENT" && kind !== "INDENT") return { ok: false, errors: { erpCommitmentKind: "An indent award's commitment is its indent." } };
    const config = await loadAwardConfig(l.org.id, tx);
    const taken = !!(await tx.award.findFirst({ where: { organisationId: l.org.id, erpCommitmentNo: number, NOT: { id } }, select: { id: true } }));
    const faults = manualCommitment.check({ number, kind, receivedOn: storedDay(received) }, { pattern: kind === "INDENT" ? (config.indentFormat?.pattern ?? null) : null, today: l.org.today, taken });
    if (faults.length) {
      const T = { NUMBER_REQUIRED: "Give the number.", FORMAT: `The number does not match the finance system's format${config.indentFormat?.example ? ` (for example ${config.indentFormat.example})` : ""}.`, FUTURE_DATE: "The day received cannot be after today.", TAKEN: "That number is already recorded on another award." };
      return { ok: false, errors: { erpCommitmentNo: faults.map((x) => T[x]).join(" ") } };
    }
    const after = { erpCommitmentNo: number, erpCommitmentKind: kind, commitmentRecordedOn: dayToDate(l.org.today), indentReceivedOn: kind === "INDENT" ? received : null };
    await tx.award.update({ where: { id }, data: after });
    await audit(tx, l.org.id, "Award", id, labelOf(a), "UPDATE", diffFields({ erpCommitmentNo: null }, { ...after, source: "typed by an officer" }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------- the issue

/**
 * Issue the instrument (FR-AWD-001–007, FR-CON-001/002, FR-REQ-016; ADRs 0007, 0008).
 * One transaction: the gate re-run on the locked rows, the signing Person checked, the
 * contract number drawn and the contract shell created with its registers, the case's
 * ownership moved, the distribution list drawn, every document frozen, and the award
 * issued — each audited. Anything the gate or the signatory check finds refuses all of it.
 */
export async function issueAward(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const personId = r.text("signatoryPersonId", "Signed by", { required: true });
  const signed = r.date("signedOn", "Signed on", { required: true });
  if (r.failed || !signed) return { ok: false, errors: r.errors };
  try {
    // The issue act's own instant: its organisation's day is the issue day the contract number is dated by (issueDayOf).
    const issueActAt = new Date();
    return await inAward(id, async (tx, l) => {
      const a = l.award;
      if (!l.org.today) return NO_ZONE;
      const f = await awardFacts(l, tx);
      const pre = evaluateAward(f.facts);
      if (pre.issueFaults.length) return refuse(pre.issueFaults, "Not issued:");
      const sig = pre.signatory!;
      if (!sig.ok) return refuse([{ code: sig.fault, level: "block" }], "Not issued:");
      const today = issueDayOf(issueActAt, l.org.timeZone);
      if (!today) return NO_ZONE;
      const signedOn = storedDay(signed);
      const person = f.roster.people.find((p) => p.id === personId) ?? null;
      const route = latestRoute(a)!;
      const check = checkSignatory(sig, person, holdersFor(sig.roleCode, f.unitPath, f.roster, f.delegations, signedOn), { today, signedOn, approvedOn: approvedOnOf(route), value: senFromDecimal(a.awardedValue) });
      if (check.faults.length) return { ok: false, errors: { signatoryPersonId: check.faults.map((x) => (x === "FUTURE_DATE" || x === "BEFORE_APPROVAL" || x === "NO_TIME_ZONE" ? SIGNER_FAULT_TEXT[x] : `${person?.name ?? "That person"} ${SIGNER_FAULT_TEXT[x]}`)).join(" ") } };

      // The contract number (FR-CON-002): the series, or the indent's own number.
      const src = pre.contractNumber;
      if ("fault" in src) return refuse([{ code: src.fault, level: "block" }], "Not issued:");
      const on = dayToDate(today);
      const number = src.source === "SERIES" ? await issueReference(tx, l.org.id, src.seriesKey, on) : src.number;
      // From here a refusal throws, so the transaction rolls back and the number drawn is not consumed.
      if (await tx.contract.findFirst({ where: { organisationId: l.org.id, number }, select: { id: true } })) throw new Refusal({ ok: false, message: `Contract number ${number} is already allocated to another contract.` });

      // The documents, rendered with the values only the issue fills, and frozen.
      const ev = evaluateAward(f.facts, { contractNumber: number, issueDate: today, signatoryName: person!.name });
      const bad = ev.documents.filter((d) => d.state !== "OK" || d.missing.length || d.unknown.length);
      if (bad.length || ev.issueFaults.length) throw new Refusal(refuse(issueFaultsOf(ev), "Not issued:"));
      const contract = await tx.contract.create({ data: { organisationId: l.org.id, number, numberSource: src.source, seriesKey: src.source === "SERIES" ? src.seriesKey : null, numberedOn: on, awardId: a.id, contractSum: a.awardedValue } });
      await audit(tx, l.org.id, "Contract", contract.id, `${a.reference} · contract ${number}`, "CREATE", diffFields(null, { number, numberSource: src.source, numberedOn: on, contractSum: senToDecimalString(senFromDecimal(a.awardedValue)), yearReading: "issue date, assumed" }));
      const policy = f.config.policy;
      const handover = await tx.caseOwnershipEvent.create({ data: { contractId: contract.id, fromUnitCode: policy.preContractUnitCode, toUnitCode: policy.postContractUnitCode, on, note: policy.preContractUnitCode && policy.postContractUnitCode ? "" : "Sections not set: the handover is recorded without them." } });
      await audit(tx, l.org.id, "CaseOwnershipEvent", handover.id, `${a.reference} · case handed over`, "CREATE", diffFields(null, { from: f.config.unitName(policy.preContractUnitCode), to: f.config.unitName(policy.postContractUnitCode), on }));
      if ("rows" in ev.distribution) {
        for (const row of ev.distribution.rows) {
          const d = await tx.awardDistribution.create({ data: { awardId: a.id, ...row } });
          await audit(tx, l.org.id, "AwardDistribution", d.id, `${a.reference} · copy to ${row.recipientName}`, "CREATE", diffFields(null, { recipient: row.recipientName, mandatory: row.mandatory, awardee: row.isAwardee }));
        }
      }
      const frozenAt = new Date();
      for (const d of ev.documents) {
        const t = d.template!;
        const doc = await tx.awardDocument.create({
          data: {
            awardId: a.id, kind: d.kind, templateId: t.id, templateCode: t.code, templateName: t.nameEn, templateFormCode: t.formCode, templateRevisionDate: t.revisionDate, templateBodyVersion: t.bodyVersion,
            language: d.language!, version: 1, fields: d.fields as Prisma.InputJsonValue, renderedText: renderedText(d.rendered!), frozenAt,
          },
        });
        await audit(tx, l.org.id, "AwardDocument", doc.id, `${a.reference} · ${t.nameEn}`, "CREATE", diffFields(null, { template: t.nameEn, formCode: t.formCode, textVersion: t.bodyVersion, language: d.language, frozen: "yes" }));
      }
      const ret = await tx.awardReturn.create({ data: { awardId: a.id } });
      await audit(tx, l.org.id, "AwardReturn", ret.id, `${a.reference} · return`, "CREATE", diffFields(null, { opened: "yes" }));

      const variant = ev.variant?.state === "SELECTED" ? ev.variant.variant : null;
      const snapshot = {
        v: 1,
        issuedOn: today,
        instrument: a.instrumentKind,
        regime: l.ex.regime,
        boundaryOperator: l.ex.boundaryOperator,
        policy: { ...policy, id: undefined, notes: undefined },
        signatory: { rule: sig.ruleLabel, clause: sig.clause, office: sig.roleLabel, recommenders: sig.recommenders.map((x) => x.roleLabel), delegable: sig.delegable },
        variant: variant ? { name: variant.nameEn, nonCommencement: variant.nonCommencement } : null,
        terms: f.facts.exercise.terms,
        bond: { required: a.bondRequired, basis: a.bondBasis, percent: a.bondPercent?.toString() ?? null, amount: ev.requiredBond.state === "SET" ? senToDecimalString(ev.requiredBond.amount) : null, basisProvenance: a.bondBasisProvenance, until: ev.bondUntil },
        contractNumber: { number, source: src.source, yearReading: "ASSUMED" },
        indent: ev.indent && "expiresOn" in ev.indent ? { expiresOn: ev.indent.expiresOn, validityDays: policy.indentValidityDays, reading: "ASSUMED" } : null,
        recipients: "rows" in ev.distribution ? ev.distribution.rows.map((x) => x.recipientName) : [],
        // 64-C4: the tender baseline the terms were judged against, and each difference with its reason.
        ...(ev.appendix ? { tenderAppendix: baselineSnapshot(ev.appendix.baseline, ev.appendix.differences) } : {}),
      };
      const after = {
        issuedAt: on, signatoryRoleCode: sig.roleCode, signatoryRoleLabel: sig.roleLabel, signatoryRuleKey: sig.ruleKey, signatoryRuleLabel: sig.ruleLabel,
        signatoryPersonId: person!.id, signatoryName: person!.name, signedOn: signed, signatoryDelegationId: check.delegationId, variantId: variant?.id ?? null, variantName: variant?.nameEn ?? null,
      };
      await mustMove(tx, l, "ISSUED", { ...after, issueSnapshot: snapshot as unknown as Prisma.InputJsonValue });
      await audit(tx, l.org.id, "Award", a.id, labelOf(a), "UPDATE",
        diffFields({ status: a.status }, { status: "ISSUED", issuedAt: on, signedBy: person!.name, signedOn: signed, signatoryOffice: sig.roleLabel, recordedOnBehalf: "not signed", contractNumber: number, underDelegation: check.delegationId ? "yes" : null }));
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof NumberingError) return { ok: false, message: `The contract numbering series is ${e.fault === "SERIES_MISSING" ? "not configured" : "not valid"}. Set it under Configuration, Numbering.` };
    throw e;
  }
}

const issueFaultsOf = (ev: ReturnType<typeof evaluateAward>) => ev.issueFaults.length ? ev.issueFaults : [{ code: "TEMPLATE_INCOMPLETE", level: "block" as const }];

// --------------------------------------------------------------- after issue

/// One copy's despatch and acknowledgement (FR-AWD-004/005).
export async function recordDespatch(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const rowId = String(data.get("distributionId") ?? "");
  const r = new FormReader(data);
  const method = r.choice("method", "How it went", ["REGISTERED_POST", "COLLECTION", "BY_HAND"] as const, { required: true });
  const consignmentRef = r.text("consignmentRef", "Consignment reference", { max: 60 });
  const despatchedOn = r.date("despatchedOn", "Despatched or collected on", { required: true });
  const acknowledgedOn = r.date("acknowledgedOn", "Acknowledged on");
  const note = r.text("note", "Note", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const a = l.award;
    if (!l.org.today) return NO_ZONE;
    if (!["ISSUED", "ACCEPTED"].includes(a.status) || !a.issuedAt) return { ok: false, message: "Copies are sent once the instrument is issued." };
    const row = a.distributions.find((d) => d.id === rowId);
    if (!row) return { ok: false, message: "That copy is not on this award's distribution list." };
    const faults = despatchFaults({ method, consignmentRef, despatchedOn: despatchedOn ? storedDay(despatchedOn) : null, acknowledgedOn: acknowledgedOn ? storedDay(acknowledgedOn) : null }, { today: l.org.today, issuedOn: storedDay(a.issuedAt) });
    if (faults.length) {
      const field = (x: string) => (x === "CONSIGNMENT_REQUIRED" ? "consignmentRef" : x === "ACK_BEFORE_DESPATCH" ? "acknowledgedOn" : x === "METHOD_REQUIRED" ? "method" : "despatchedOn");
      const errors: Record<string, string> = {};
      for (const x of faults) errors[field(x)] = [errors[field(x)], DESPATCH_FAULT_TEXT[x]].filter(Boolean).join(" ");
      return { ok: false, errors };
    }
    const after = { method, consignmentRef, despatchedOn, acknowledgedOn, note };
    await tx.awardDistribution.update({ where: { id: row.id }, data: after });
    await audit(tx, l.org.id, "AwardDistribution", row.id, `${a.reference} · copy to ${row.recipientName}`, "UPDATE", diffFields({ method: row.method, consignmentRef: row.consignmentRef, despatchedOn: row.despatchedOn, acknowledgedOn: row.acknowledgedOn, note: row.note }, after));
    return { ok: true };
  });
}

/**
 * What came back (FR-AWD-003, FR-AWD-008). The day each document was received and who
 * received it; the acceptance page's fields. The IC number enters the trail masked. The
 * return that completes the instrument moves the award to Accepted, in the same act.
 */
export async function recordReturn(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const d = (n: string, label: string) => r.date(n, label);
  const yesNo = (n: string, label: string) => triState(r, n, label);
  const v = {
    signedLetterReceivedOn: d("signedLetterReceivedOn", "Signed letter received"),
    declarationReceivedOn: d("declarationReceivedOn", "Declaration received"),
    authorisationReceivedOn: d("authorisationReceivedOn", "Letter of authorisation received"),
    receivedByPersonId: r.optionalText("receivedByPersonId"),
    whereHeld: r.text("whereHeld", "Where the originals are held", { max: 400 }),
    signatoryName: r.text("signatoryName", "Contractor's signatory", { max: 240 }),
    icNumber: r.text("icNumber", "Identity card number", { max: 40 }),
    occupation: r.text("occupation", "Occupation", { max: 240 }),
    address: r.text("address", "Address", { max: 1000 }),
    capacity: r.text("capacity", "Capacity", { max: 240 }),
    contractorSigned: yesNo("contractorSigned", "Contractor signed"),
    stampAffixed: yesNo("stampAffixed", "Stamp affixed"),
    witnessName: r.text("witnessName", "Witness", { max: 240 }),
    witnessSigned: yesNo("witnessSigned", "Witness signed"),
  };
  if (icNumberFault(v.icNumber)) r.reject("icNumber", "An identity card number is twelve digits, with or without the hyphens: 900101-14-5678.");
  const correction = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const a = l.award;
    if (!l.org.today) return NO_ZONE;
    // An accepted award's return may be corrected, with a reason, but never left incomplete.
    const correcting = a.status === "ACCEPTED";
    if (!(a.status === "ISSUED" || correcting) || !a.awardReturn || !a.issuedAt) return { ok: false, message: "The return is recorded once the instrument is issued." };
    if (correcting && !correction) return { ok: false, errors: { reason: "Say why the return is corrected." } };
    const issued = storedDay(a.issuedAt);
    const errors: Record<string, string> = {};
    for (const k of ["signedLetterReceivedOn", "declarationReceivedOn", "authorisationReceivedOn"] as const) {
      const x = v[k];
      if (x && storedDay(x) > l.org.today) errors[k] = "Not after today.";
      else if (x && storedDay(x) < issued) errors[k] = "Not before the instrument was issued.";
    }
    let receivedBy: { id: string; name: string } | null = null;
    if (v.receivedByPersonId) {
      receivedBy = await tx.person.findFirst({ where: { id: v.receivedByPersonId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
      if (!receivedBy) errors.receivedByPersonId = "Choose someone on record and active.";
    }
    if (Object.keys(errors).length) return { ok: false, errors };
    const before = a.awardReturn;
    const kind = a.instrumentKind as InstrumentKind;
    const rec: ReturnRecord = {
      ...v,
      signedLetterReceivedOn: v.signedLetterReceivedOn ? storedDay(v.signedLetterReceivedOn) : null,
      declarationReceivedOn: v.declarationReceivedOn ? storedDay(v.declarationReceivedOn) : null,
      authorisationReceivedOn: v.authorisationReceivedOn ? storedDay(v.authorisationReceivedOn) : null,
    };
    // OD-5: an item counts toward completeness only with its scan attached, for every
    // award not accepted before scans were required; a correction (BD-24) needs a scan
    // only for the item it corrects.
    const { attached } = await returnScans(a.id, kind, tx);
    if (correcting) {
      const unscanned = correctionScansMissing(kind, returnRecordOf(before), rec, attached);
      if (unscanned.length) return { ok: false, message: `Not corrected: attach ${unscanned.map((x) => RETURN_SCAN_LABEL[x]).join(", ")} first. A corrected item counts only with its scan.` };
      // Accepted awards are not re-judged on their scans: the paper return must stay complete.
      const complete = returnReadsComplete(a.status, kind, rec, attached);
      if (!complete) return { ok: false, message: "Not corrected: the award was accepted on a complete return, and this would leave it incomplete." };
    }
    await tx.awardReturn.update({ where: { id: before.id }, data: v });
    const view = (x: Record<string, unknown>) => ({ ...x, receivedByPersonId: undefined, receivedBy: x.receivedByPersonId ? (x.receivedByPersonId === receivedBy?.id ? receivedBy?.name : before.receivedBy?.name) : null });
    await audit(tx, l.org.id, "AwardReturn", before.id, `${a.reference} · return`, "UPDATE", awardAuditPair(view(before), view({ ...before, ...v })), correcting ? `Corrected: ${correction}` : "");
    // The return that completes the instrument, every item with its scan, accepts it in the same act (BD-12).
    const accepted = correcting ? null : await acceptOnCompleteReturn(tx, l, rec);
    return { ok: true, message: accepted ?? undefined };
  });
}

/// The day work commenced (FR-AWD-009).
export async function recordCommencement(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const on = r.date("commencedOn", "Commenced on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const a = l.award;
    if (!l.org.today) return NO_ZONE;
    if (!["ISSUED", "ACCEPTED"].includes(a.status)) return { ok: false, message: "Commencement is recorded once the instrument is issued." };
    if (storedDay(on) > l.org.today) return { ok: false, errors: { commencedOn: "Not after today." } };
    if (a.issuedAt && storedDay(on) < storedDay(a.issuedAt)) return { ok: false, errors: { commencedOn: "Not before the instrument was issued." } };
    await tx.award.update({ where: { id }, data: { commencedOn: on } });
    await audit(tx, l.org.id, "Award", id, labelOf(a), "UPDATE", diffFields({ commencedOn: a.commencedOn }, { commencedOn: on }));
    return { ok: true };
  });
}

/**
 * Cancel an award, with a reason (FR-AWD-009). An open route is withdrawn. An issued
 * award's contract is cancelled with it: its number stays allocated as a recorded gap
 * and its registers are kept, read-only (ADR 0007). Where work never commenced and the
 * variant's consequence is cancellation, blacklisting is recorded as recommended — the
 * vendor master that would act on it is 6.15.
 */
export async function cancelAward(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inAward(id, async (tx, l) => {
    const a = l.award;
    const f = await awardFacts(l, tx);
    const ev = evaluateAward(f.facts);
    const returned = instrumentReturned(a.instrumentKind as InstrumentKind, a.awardReturn);
    const t = awardTransition(a.status as AwardStatus, "CANCELLED", { today: l.org.today, reason, returned, commenced: !!a.commencedOn });
    if (t === "CANCEL_REASON_REQUIRED") return { ok: false, errors: { reason: "A reason is required." } };
    if (t === "TIME_ZONE_UNSET") return NO_ZONE;
    const T = { ALREADY_RETURNED: "The instrument has come back signed: it is a contract document now, and cancelling it is not an act the portal takes. Termination arrives with the post-award modules.", ALREADY_COMMENCED: "Work has commenced under this award: it is not cancelled here. Termination arrives with the post-award modules.", ACCEPTED_NOT_CANCELLED: "An accepted award is not cancelled here: termination arrives with the post-award modules.", TERMINAL: "This award is already cancelled.", NOT_ALLOWED: "This award cannot be cancelled from where it stands." } as Record<string, string>;
    if (t) return { ok: false, message: T[t] ?? "Not cancelled." };
    // 6.12: an executed contract is ended by termination, never by cancelling its award (BD-17).
    if (a.contract && !contractCancellable(a.contract.status as ContractStatus)) return { ok: false, message: "The contract is executed: it is not cancelled with its award. Termination arrives with the post-award modules." };
    const consequence = ev.commencement?.state === "LATE" ? ev.consequence : null;
    await mustMove(tx, l, "CANCELLED", { cancelReason: reason, cancelConsequence: consequence });
    await audit(tx, l.org.id, "Award", id, labelOf(a), "UPDATE", diffFields({ status: a.status }, { status: "CANCELLED", consequence: consequence === "CANCEL_AND_BLACKLIST" ? "blacklisting recommended" : consequence === "WARNING_LETTER" ? "warning letter" : null }), reason);
    const open = a.approvalInstances.filter((i) => i.status === "PENDING");
    for (const inst of open) {
      const warning = { code: "WITHDRAWN_ON_CANCEL", level: "info", messageEn: `Withdrawn: the award was cancelled — ${reason}` };
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), warning] as unknown as Prisma.InputJsonValue } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, routeLabel(a), "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), `The award was cancelled: ${reason}`);
    }
    if (a.contract && a.contract.status !== "CANCELLED") {
      await tx.contract.update({ where: { id: a.contract.id }, data: { status: "CANCELLED", cancelReason: reason } });
      await audit(tx, l.org.id, "Contract", a.contract.id, `${a.reference} · contract ${a.contract.number}`, "UPDATE", diffFields({ status: a.contract.status }, { status: "CANCELLED", numberKept: "yes, as a gap" }), reason);
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------- conditions

export async function addCondition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const kindId = r.text("kindId", "Condition", { required: true });
  const reference = r.text("reference", "Reference", { max: 120 });
  const requiredBy = r.date("requiredBy", "Required by");
  const note = r.text("note", "Note", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    if (l.award.status === "CANCELLED") return { ok: false, message: "A cancelled award is kept as it was." };
    const kind = await tx.conditionPrecedentKind.findFirst({ where: { id: kindId, organisationId: l.org.id, retiredOn: null } });
    if (!kind) return { ok: false, errors: { kindId: "Choose a condition on the list." } };
    const row = await tx.awardCondition.create({ data: { awardId: l.award.id, kindId: kind.id, kindName: kind.nameEn, excludesEot: kind.excludesEotReason, reference, requiredBy, note } });
    await audit(tx, l.org.id, "AwardCondition", row.id, `${l.award.reference} · ${kind.nameEn}`, "CREATE", diffFields(null, { condition: kind.nameEn, reference, requiredBy, excludesEot: kind.excludesEotReason, note }));
    return { ok: true };
  });
}

export async function satisfyCondition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const conditionId = String(data.get("conditionId") ?? "");
  const r = new FormReader(data);
  const on = r.date("satisfiedOn", "Met on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    if (!l.org.today) return NO_ZONE;
    const c = l.award.conditions.find((x) => x.id === conditionId);
    if (!c) return { ok: false, message: "That condition is not on this award." };
    if (storedDay(on) > l.org.today) return { ok: false, errors: { satisfiedOn: "Not after today." } };
    await tx.awardCondition.update({ where: { id: c.id }, data: { satisfiedOn: on } });
    await audit(tx, l.org.id, "AwardCondition", c.id, `${l.award.reference} · ${c.kindName}`, "UPDATE", diffFields({ satisfiedOn: c.satisfiedOn }, { satisfiedOn: on }));
    return { ok: true };
  });
}

// ------------------------------------------------------------ the registers

const CHECKED_ON_TEXT = { FUTURE: "Not after today.", BEFORE_LODGED: "Not before the day it was lodged." } as const;

const registerOpen = (l: LoadedAward) => (l.award.contract && l.award.contract.status !== "CANCELLED" ? l.award.contract : null);

/// Lodge a bond or guarantee on the award's contract (FR-AWD-012). Verified separately.
export async function lodgeSecurity(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const v = {
    kind: r.choice("kind", "Kind", ["PERFORMANCE_BOND", "ADVANCE_PAYMENT_GUARANTEE", "DESIGN_GUARANTEE_BOND", "RETENTION_BOND"] as const, { required: true }),
    form: r.choice("form", "Form", ["BANK_GUARANTEE", "INSURANCE_GUARANTEE", "CASH", "BANKERS_DRAFT"] as const, { required: true }),
    issuerId: r.optionalText("issuerId"),
    issuerNameAsWritten: r.text("issuerNameAsWritten", "Issuer as written", { max: 240 }),
    instrumentRef: r.text("instrumentRef", "Instrument reference", { max: 120 }),
    value: r.money("value", "Value", { required: true }),
    effectiveFrom: r.date("effectiveFrom", "Effective from", { required: true }),
    expiresOn: r.date("expiresOn", "Expires on"),
    lodgedOn: r.date("lodgedOn", "Lodged on", { required: true }),
  };
  if (r.failed || !v.kind || !v.form || !v.value || !v.effectiveFrom || !v.lodgedOn) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const c = registerOpen(l);
    if (!c) return { ok: false, message: "Securities are lodged on the contract, which exists once the instrument is issued; a cancelled contract's register is kept read-only." };
    if (!l.org.today) return NO_ZONE;
    if (storedDay(v.lodgedOn!) > l.org.today) return { ok: false, errors: { lodgedOn: "Not after today." } };
    if (v.expiresOn && v.expiresOn < v.effectiveFrom!) return { ok: false, errors: { expiresOn: "It cannot expire before it takes effect." } };
    if (v.issuerId && !(await tx.approvedIssuer.findFirst({ where: { id: v.issuerId, organisationId: l.org.id } }))) return { ok: false, errors: { issuerId: "That issuer is not on the list." } };
    const row = await tx.securityInstrument.create({ data: { contractId: c.id, ...v, kind: v.kind!, form: v.form!, value: senToDecimalString(parseSen(v.value!)), effectiveFrom: v.effectiveFrom!, lodgedOn: v.lodgedOn! } });
    await audit(tx, l.org.id, "SecurityInstrument", row.id, `${l.award.reference} · ${v.kind!.toLowerCase().replace(/_/g, " ")}`, "CREATE", awardAuditCreate(row, { contract: c.number }));
    return { ok: true };
  });
}

/// Verify or reject a lodged security. Verification snapshots what it was judged against.
export async function reviewSecurity(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const securityId = String(data.get("securityId") ?? "");
  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["VERIFIED", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Checked by", { required: true });
  const on = r.date("on", "Checked on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (outcome === "REJECTED" && !reason) r.reject("reason", "Say why it is rejected.");
  if (r.failed || !outcome || !on) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const c = registerOpen(l);
    const s = c?.securities.find((x) => x.id === securityId);
    if (!c || !s) return { ok: false, message: "That security is not on this award's open contract." };
    if (s.status !== "LODGED") return { ok: false, message: "It has already been checked." };
    if (!l.org.today) return NO_ZONE;
    const when = checkedOnFault(storedDay(on), storedDay(s.lodgedOn), l.org.today);
    if (when) return { ok: false, errors: { on: CHECKED_ON_TEXT[when] } };
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const a = l.award;
    const config = await loadAwardConfig(l.org.id, tx);
    const req = requiredBond({ basis: a.bondBasis, percent: a.bondPercent?.toString() ?? null, basisAmount: a.bondBasisAmount ? parseSen(a.bondBasisAmount.toString()) : null, contractPrice: senFromDecimal(a.awardedValue) });
    const completion = a.startDate ? completionDay(storedDay(a.startDate), a.completionPeriod, a.completionUnit) : null;
    if (outcome === "VERIFIED") {
      const faults = s.kind === "PERFORMANCE_BOND"
        ? bondFaults({ issuerId: s.issuerId, lodgedOn: storedDay(s.lodgedOn), expiresOn: s.expiresOn ? storedDay(s.expiresOn) : null, value: senFromDecimal(s.value) }, req, config.issuers, completion, a.bondValidityExtraMonths)
        : bondFaults({ issuerId: s.issuerId, lodgedOn: storedDay(s.lodgedOn), expiresOn: s.expiresOn ? storedDay(s.expiresOn) : null, value: senFromDecimal(s.value) }, { state: "SET", amount: 0n, basis: "STATED_AMOUNT" }, config.issuers, completion ?? "0000-01-01", 0).filter((x) => x !== "EXPIRES_TOO_EARLY");
      if (faults.length) return { ok: false, message: `Not verified: ${faults.map((x) => BOND_FAULT_TEXT[x]).join(" ")}` };
    }
    const after = outcome === "VERIFIED"
      ? { status: "VERIFIED" as const, verifiedOn: on, verifiedByPersonId: person.id, requiredValue: req.state === "SET" ? senToDecimalString(req.amount) : null, basis: a.bondBasis, basisPercent: a.bondPercent, basisAmount: a.bondBasisAmount, basisProvenance: a.bondBasisProvenance, requiredUntil: completion && a.bondValidityExtraMonths != null ? dayToDate(bondRequiredUntil(completion, a.bondValidityExtraMonths)!) : null }
      : { status: "REJECTED" as const, verifiedOn: on, verifiedByPersonId: person.id, rejectedReason: reason };
    await tx.securityInstrument.update({ where: { id: s.id }, data: after });
    await audit(tx, l.org.id, "SecurityInstrument", s.id, `${a.reference} · ${s.kind.toLowerCase().replace(/_/g, " ")}`, "UPDATE", diffFields({ status: s.status }, { status: after.status, checkedBy: person.name, checkedOn: on, recordedOnBehalf: "not signed", requiredValue: "requiredValue" in after ? after.requiredValue : undefined }), reason);
    return { ok: true };
  });
}

/// Lodge an insurance policy on the award's contract (FR-AWD-013).
export async function lodgePolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const KINDS = ["WORKS", "PUBLIC_LIABILITY", "WORKMENS_COMPENSATION", "CAR", "EAR"] as const;
  const v = {
    kind: r.choice("kind", "Kind", KINDS, { required: true }),
    substitutesFor: r.choice("substitutesFor", "Stands in for", KINDS),
    issuerId: r.optionalText("issuerId"),
    issuerNameAsWritten: r.text("issuerNameAsWritten", "Insurer as written", { max: 240 }),
    policyNo: r.text("policyNo", "Policy number", { max: 120 }),
    sumInsured: r.money("sumInsured", "Sum insured", { required: true }),
    appendixAmount: r.money("appendixAmount", "Appendix amount"),
    requiredLimit: r.money("requiredLimit", "Limit to meet"),
    raisedJustification: r.text("raisedJustification", "Why the limit is raised", { max: 2000 }),
    periodStart: r.date("periodStart", "Period from", { required: true }),
    periodEnd: r.date("periodEnd", "Period to", { required: true }),
    premiumReceiptRef: r.text("premiumReceiptRef", "Premium receipt", { max: 120 }),
    perkesoRegistrationNo: r.text("perkesoRegistrationNo", "Social security registration", { max: 120 }),
    lodgedOn: r.date("lodgedOn", "Lodged on", { required: true }),
  };
  if (r.failed || !v.kind || !v.sumInsured || !v.periodStart || !v.periodEnd || !v.lodgedOn) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const c = registerOpen(l);
    if (!c) return { ok: false, message: "Policies are lodged on the contract, which exists once the instrument is issued; a cancelled contract's register is kept read-only." };
    if (!l.org.today) return NO_ZONE;
    if (v.periodEnd! < v.periodStart!) return { ok: false, errors: { periodEnd: "The period cannot end before it starts." } };
    if (storedDay(v.lodgedOn!) > l.org.today) return { ok: false, errors: { lodgedOn: "Not after today." } };
    const money = (x: string | null) => (x ? senToDecimalString(parseSen(x)) : null);
    // 64-C4: a policy covering the works states the frozen Appendix's uplift at the awarded sum, never another figure.
    const tender = await frozenTenderOf(l.ex.id, l.org.timeZone, tx);
    const coversWorks = v.kind === "WORKS" || v.kind === "CAR" || v.kind === "EAR";
    const stated = worksAppendixAmount(coversWorks, v.appendixAmount ? parseSen(v.appendixAmount) : null, tender ? baselineOf(tender, senFromDecimal(l.award.awardedValue)) : null);
    if ("fault" in stated) return { ok: false, errors: { appendixAmount: `The tender Appendix states ${formatSen(stated.appendix)} at the awarded sum. Leave it empty to take that figure.` } };
    const row = await tx.insurancePolicy.create({ data: { contractId: c.id, ...v, kind: v.kind!, sumInsured: money(v.sumInsured)!, appendixAmount: stated.amount == null ? null : senToDecimalString(stated.amount), requiredLimit: money(v.requiredLimit), periodStart: v.periodStart!, periodEnd: v.periodEnd!, lodgedOn: v.lodgedOn! } });
    await audit(tx, l.org.id, "InsurancePolicy", row.id, `${l.award.reference} · ${v.kind!.toLowerCase().replace(/_/g, " ")} policy`, "CREATE", awardAuditCreate(row, { contract: c.number }));
    return { ok: true };
  });
}

/// Verify or reject a lodged policy against its requirement, the bands and the period.
export async function reviewPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const policyId = String(data.get("policyId") ?? "");
  const r = new FormReader(data);
  const outcome = r.choice("outcome", "Outcome", ["VERIFIED", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Checked by", { required: true });
  const on = r.date("on", "Checked on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (outcome === "REJECTED" && !reason) r.reject("reason", "Say why it is rejected.");
  if (r.failed || !outcome || !on) return { ok: false, errors: r.errors };
  return inAward(id, async (tx, l) => {
    const c = registerOpen(l);
    const p = c?.policies.find((x) => x.id === policyId);
    if (!c || !p) return { ok: false, message: "That policy is not on this award's open contract." };
    if (p.status !== "LODGED") return { ok: false, message: "It has already been checked." };
    if (!l.org.today) return NO_ZONE;
    const when = checkedOnFault(storedDay(on), storedDay(p.lodgedOn), l.org.today);
    if (when) return { ok: false, errors: { on: CHECKED_ON_TEXT[when] } };
    const person = await tx.person.findFirst({ where: { id: personId, organisationId: l.org.id, isActive: true }, select: { id: true, name: true } });
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const a = l.award;
    const config = await loadAwardConfig(l.org.id, tx);
    const reqs = applicableRequirements(config.requirements, l.ex.contractTypeCode, on);
    const counts = countsAs(p);
    const requirement = reqs.find((x) => x.kind === counts) ?? null;
    if (outcome === "VERIFIED") {
      const faults = insuranceFaults(
        { kind: p.kind, substitutesFor: p.substitutesFor, issuerId: p.issuerId, lodgedOn: storedDay(p.lodgedOn), sumInsured: senFromDecimal(p.sumInsured), appendixAmount: p.appendixAmount ? senFromDecimal(p.appendixAmount) : null, requiredLimit: p.requiredLimit ? senFromDecimal(p.requiredLimit) : null, raisedJustification: p.raisedJustification, periodEnd: storedDay(p.periodEnd) },
        { requirement, contractPrice: senFromDecimal(a.awardedValue), bands: config.bands, wcBasis: a.wcBasis, issuers: config.issuers, start: a.startDate ? storedDay(a.startDate) : null, completion: { n: a.completionPeriod, unit: a.completionUnit }, dlpMonths: a.dlpMonths, on: dayToDate(storedDay(on)) },
      );
      if (faults.length) return { ok: false, message: `Not verified: ${faults.map((x) => INSURANCE_FAULT_TEXT[x]).join(" ")}` };
    }
    const after = outcome === "VERIFIED"
      ? { status: "VERIFIED" as const, verifiedOn: on, verifiedByPersonId: person.id, requirementSnapshot: (requirement ? { name: requirement.nameEn, tailMonths: requirement.tailMonths, tailDays: requirement.tailDays, percent: requirement.percent, dlpMonths: a.dlpMonths, wcBasis: a.wcBasis, sumChecked: p.kind === "WORKMENS_COMPENSATION" ? wcSumCheck(a.wcBasis) === "CHECKED" : true } : null) as Prisma.InputJsonValue }
      : { status: "REJECTED" as const, verifiedOn: on, verifiedByPersonId: person.id, rejectedReason: reason };
    await tx.insurancePolicy.update({ where: { id: p.id }, data: after });
    await audit(tx, l.org.id, "InsurancePolicy", p.id, `${a.reference} · ${p.kind.toLowerCase().replace(/_/g, " ")} policy`, "UPDATE", diffFields({ status: p.status }, { status: after.status, checkedBy: person.name, checkedOn: on, recordedOnBehalf: "not signed" }), reason);
    return { ok: true };
  });
}

