"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields, snapshotFields, type FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { loadIssue, loadOverrideMatrix } from "@/lib/authority/load";
import { postingRefusal } from "@/lib/budget/periods";
import { dayToDate, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { manualEntry, portalLedger, type BudgetCheckProvider } from "@/lib/integration/budget-check";
import { manualIntake } from "@/lib/integration/requisition-intake";
import { parseSen, senToDecimalString } from "@/lib/money";
import { NumberingError, issueReference } from "@/lib/numbering/issue";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { ageDay, approvalBudgetFault, approvalCommitment, intakeCommitment, isStale, overBudgetDisposition, type BudgetSnapshot } from "@/lib/requisition/budget";
import { committeeCitationFault, committeeStepFrom, type CitationFault } from "@/lib/requisition/committee-step";
import { endorsementEntryFault, endorsementFaults } from "@/lib/requisition/endorsement";
import { blocking, erpRefFaults, requisitionFaults, type DraftLine, type RequisitionDraft } from "@/lib/requisition/fields";
import { fundingGate } from "@/lib/requisition/funding";
import { deciderFaults, holdersFor, requesterHoldsApprover } from "@/lib/requisition/holders";
import { intakeFaults, type ExternalRequisition, type ReceivedStep } from "@/lib/requisition/intake";
import {
  DECIDER_FAULT_TEXT,
  endorsementFaultText,
  fieldFaultText,
  fundingFaultText,
  STATUS_LABEL,
  TIER_LABEL,
  transitionFaultText,
} from "@/lib/requisition/labels";
import {
  loadControls,
  loadLookups,
  loadPolicy,
  num,
  recordOf,
  requisitionOrg,
  withLockedRequisition,
  draftOf,
  linkMatchingMatters,
  type LoadedRequisition,
  type RequisitionRow,
} from "@/lib/requisition/repo";
import { resolveRequisitionRoute } from "@/lib/requisition/route";
import { assessSplitting, justifierFaults, splitApprovalFault, type JustifierFault, type SplitSubject } from "@/lib/requisition/splitting";
import { transitionFault, type TransitionContext } from "@/lib/requisition/status";
import type { OrgUnitKind, RequisitionStatus } from "@/lib/requisition/types";
import { ACT_LABEL } from "@/lib/labels";
import { FormReader } from "@/lib/validate";

/**
 * Writes for requisitions.
 *
 * Every action is reachable by a direct POST, so each one re-runs its checks: every
 * write to an existing requisition runs inside `withLockedRequisition`, which locks
 * the row and re-reads it in the write's own transaction, and the pure check runs on
 * that data before anything is written. The write and its audit row share the
 * transaction. A refusal saves nothing and names what blocks it. Nobody is signed in:
 * a decision records the Person the officer names, "recorded on behalf of, not
 * signed", and the audit stays unattributed.
 */

const NO_ORG: FormState = { ok: false, message: "No organisation is configured. Run npm run setup first." };
const GONE: FormState = { ok: false, message: "That requisition no longer exists." };
const NO_ZONE: FormState = {
  ok: false,
  message: "Set the organisation's time zone under Configuration, Organisation first. Today's date decides this act, and it is not assumed to be UTC.",
};

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;
const TIERS = ["COMPANY", "DIVISION", "DEPARTMENT", "SECTION"] as const;

function refresh(id?: string) {
  revalidatePath("/requisitions");
  if (id) revalidatePath(`/requisitions/${id}`);
}

async function audit(
  tx: Tx,
  orgId: string,
  entity: string,
  entityId: string,
  entityLabel: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  changes: FieldChange[],
  reason = "",
) {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

const labelOf = (r: { reference: string; title: string }) => `${r.reference} · ${r.title}`;

/// Run a write under the requisition's lock; a missing one reads as gone. A refusal
/// thrown after a write rolls the whole transaction back and is returned as the result.
async function inRequisition(id: string, fn: (tx: Tx, l: LoadedRequisition) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedRequisition(id, fn);
  } catch (e) {
    return caught(e);
  }
  if (result?.ok) refresh(id);
  return result ?? GONE;
}

/// Move a requisition from the status read under the lock, or report that it moved.
async function moveStatus(tx: Tx, l: LoadedRequisition, to: RequisitionStatus, extra: Prisma.RequisitionUpdateManyMutationInput = {}) {
  const moved = await tx.requisition.updateMany({ where: { id: l.req.id, status: l.req.status }, data: { status: to, ...extra } });
  return moved.count === 1;
}

const CHANGED: FormState = { ok: false, message: "The requisition changed while this was being saved. Reload and try again." };

/// As `moveStatus`, but a lost race rolls back everything written before it.
async function mustMove(tx: Tx, l: LoadedRequisition, to: RequisitionStatus, extra: Prisma.RequisitionUpdateManyMutationInput = {}) {
  if (!(await moveStatus(tx, l, to, extra))) throw new Refusal(CHANGED);
}

/// A refusal found after a write in the same transaction: thrown to roll it back.
class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}
function caught(e: unknown): FormState {
  if (e instanceof Refusal) return e.state;
  throw e;
}

// --------------------------------------------------------------------- drafts

/// The lines, posted as JSON by the form. Anything malformed reads as no lines.
function readLines(data: FormData): DraftLine[] {
  try {
    const raw = JSON.parse(String(data.get("lines") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
    return raw
      .map((l) => ({
        description: s(l?.description) ?? "",
        quantity: s(l?.quantity),
        unit: s(l?.unit),
        estimatedUnitPrice: s(l?.estimatedUnitPrice)?.replace(/,/g, "") ?? null,
        estimatedAmount: s(l?.estimatedAmount)?.replace(/,/g, "") ?? null,
      }))
      .filter((l) => l.description || l.estimatedAmount || l.quantity || l.estimatedUnitPrice);
  } catch {
    return [];
  }
}

function readDraft(r: FormReader, data: FormData): RequisitionDraft {
  return {
    title: r.text("title", "Title", { required: true, max: 240 }),
    justification: r.text("justification", "Justification", { max: 4000 }),
    needStatement: r.text("needStatement", "Need statement", { max: 4000 }),
    requestingUnitCode: r.optionalText("requestingUnitCode"),
    sectionUnitCode: r.optionalText("sectionUnitCode"),
    requestingPersonId: r.optionalText("requestingPersonId"),
    costCentreCode: r.optionalText("costCentreCode"),
    accountCode: r.optionalText("accountCode"),
    budgetCodeId: r.optionalText("budgetCodeId"),
    siteCode: r.optionalText("siteCode"),
    placeOfDelivery: r.text("placeOfDelivery", "Place of delivery", { max: 400 }),
    dateRequired: (() => {
      const d = r.date("dateRequired", "Date required", { required: true });
      return d ? storedDay(d) : null;
    })(),
    estimatedValue: r.money("estimatedValue", "Estimated value", { required: true }),
    fundingRouteCode: r.optionalText("fundingRouteCode"),
    contractTypeCode: r.optionalText("contractTypeCode"),
    lines: readLines(data),
  };
}

/// Field faults onto the form: one message per field, the lines' together.
function faultErrors(r: FormReader, faults: ReturnType<typeof requisitionFaults>) {
  const lines: string[] = [];
  for (const f of blocking(faults)) {
    const text = fieldFaultText(f);
    if (f.field === "lines" || f.field.startsWith("lines.")) lines.push(text);
    else if (!r.errors[f.field]) r.reject(f.field, text);
  }
  if (lines.length > 0) r.reject("lines", lines.join(" "));
}

function draftData(d: RequisitionDraft) {
  return {
    title: d.title,
    justification: d.justification,
    needStatement: d.needStatement,
    requestingUnitCode: d.requestingUnitCode ?? "",
    sectionUnitCode: d.sectionUnitCode,
    requestingPersonId: d.requestingPersonId!,
    costCentreCode: d.costCentreCode ?? "",
    accountCode: d.accountCode ?? "",
    budgetCodeId: d.budgetCodeId,
    siteCode: d.siteCode,
    placeOfDelivery: d.placeOfDelivery,
    dateRequired: dayToDate(d.dateRequired!),
    estimatedValue: senToDecimalString(parseSen(d.estimatedValue!)),
    fundingRouteCode: d.fundingRouteCode,
    contractTypeCode: d.contractTypeCode ?? null,
  };
}

const lineData = (lines: DraftLine[]) =>
  lines.map((l, i) => ({
    lineNo: i + 1,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit,
    estimatedUnitPrice: l.estimatedUnitPrice ? senToDecimalString(parseSen(l.estimatedUnitPrice)) : null,
    estimatedAmount: senToDecimalString(parseSen(l.estimatedAmount!)),
  }));

/// A money string that parses, or null. Line amounts are validated before this is used.
const safeLines = (lines: DraftLine[]) =>
  lines.every((l) => {
    try {
      if (l.estimatedAmount) parseSen(l.estimatedAmount);
      if (l.estimatedUnitPrice) parseSen(l.estimatedUnitPrice);
      return l.estimatedAmount != null && (l.quantity == null || /^\d+(\.\d{1,4})?$/.test(l.quantity));
    } catch {
      return false;
    }
  });

/**
 * Raise a requisition (FR-REQ-001). The reference is issued from the `requisition`
 * series in the same transaction as the row and its audit (OD-11). A draft may be
 * saved half-written; what it does give must be real. Redirects to the new record.
 */
export async function createRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  if (!org.today) return NO_ZONE;
  const today = org.today;

  const r = new FormReader(data);
  const draft = readDraft(r, data);
  if (!draft.requestingUnitCode) r.reject("requestingUnitCode", "Requesting department is required.");
  if (!draft.requestingPersonId) r.reject("requestingPersonId", "Requesting officer is required.");
  if (!safeLines(draft.lines)) r.reject("lines", "Every line needs an amount, and quantities must be numbers.");
  const { lookups, formats } = await loadLookups(org.id);
  faultErrors(r, requisitionFaults(draft, lookups, formats, dayToDate(today), { complete: false }));
  if (r.failed) return { ok: false, errors: r.errors, message: "Nothing was saved. Correct the fields marked below." };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const reference = await issueReference(tx, org.id, "requisition", dayToDate(today));
      const row = await tx.requisition.create({
        data: { organisationId: org.id, reference, origin: "PORTAL", raisedOn: dayToDate(today), ...draftData(draft), lines: { create: lineData(draft.lines) } },
      });
      await audit(tx, org.id, "Requisition", row.id, labelOf(row), "CREATE",
        diffFields(null, { reference, ...draftData(draft), lines: draft.lines.length, status: "DRAFT" }));
      return row.id;
    });
  } catch (e) {
    if (e instanceof NumberingError) {
      return {
        ok: false,
        message:
          e.fault === "SERIES_MISSING"
            ? "No numbering series for requisitions is configured, so no reference can be issued. Add the series keyed “requisition” under Configuration, Numbering."
            : "The requisitions numbering series is not valid. Correct it under Configuration, Numbering.",
      };
    }
    throw e;
  }
  refresh(id);
  redirect(`/requisitions/${id}`);
}

/**
 * Edit a draft. Endorsements already recorded endorsed the draft as it stood, so an
 * edit withdraws them, in the same transaction and on the record (a build decision).
 */
export async function editDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const draft = readDraft(r, data);
  if (!draft.requestingUnitCode) r.reject("requestingUnitCode", "Requesting department is required.");
  if (!draft.requestingPersonId) r.reject("requestingPersonId", "Requesting officer is required.");
  if (!safeLines(draft.lines)) r.reject("lines", "Every line needs an amount, and quantities must be numbers.");

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (l.req.status !== "DRAFT") return { ok: false, message: `Only a draft can be edited. This one is ${STATUS_LABEL[l.req.status].toLowerCase()}.` };
    if (!l.org.today) return NO_ZONE;
    const { lookups, formats } = await loadLookups(l.org.id, tx);
    faultErrors(r, requisitionFaults(draft, lookups, formats, dayToDate(l.org.today), { complete: false }));
    if (r.failed) return { ok: false, errors: r.errors };

    const before = l.req;
    const after = draftData(draft);
    await tx.requisitionLine.deleteMany({ where: { requisitionId: id } });
    await tx.requisition.update({ where: { id }, data: { ...after, lines: { create: lineData(draft.lines) } } });
    await audit(tx, l.org.id, "Requisition", id, labelOf(before), "UPDATE",
      diffFields(
        {
          ...before,
          estimatedValue: before.estimatedValue.toString(),
          lines: before.lines.length,
        },
        { ...after, lines: draft.lines.length },
      ));
    for (const e of before.endorsements) {
      await tx.requisitionEndorsement.delete({ where: { id: e.id } });
      await audit(tx, l.org.id, "RequisitionEndorsement", e.id, `${before.reference} · ${TIER_LABEL[e.tier as OrgUnitKind]}`, "DELETE",
        snapshotFields({ tier: e.tier, person: e.person.name, endorsedOn: e.endorsedOn }),
        "Withdrawn: the draft was edited after it was endorsed.");
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------- endorsement

/// The unit a requisition's endorsers and holders are found from: its section, else its department.
const unitOf = (req: RequisitionRow) => req.sectionUnitCode || req.requestingUnitCode;

/// Record one tier's endorsement (FR-REQ-003) on a draft.
export async function recordEndorsement(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const tier = r.choice("tier", "Tier", TIERS, { required: true });
  const personId = r.text("personId", "Endorsed by", { required: true });
  const on = r.date("endorsedOn", "Endorsed on", { required: true });
  const note = r.text("note", "Note", { max: 1000 });
  if (r.failed || !tier || !on) return { ok: false, errors: r.errors };

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (l.req.status !== "DRAFT") return { ok: false, message: "Endorsements are recorded while the requisition is a draft." };
    const policy = await loadPolicy(l.org.id, tx);
    if (!policy.endorsementTiers.includes(tier)) {
      return { ok: false, errors: { tier: policy.endorsementTiers.length === 0 ? endorsementFaultText({ code: "NOT_SET" }) : "The policy does not ask for this tier's endorsement." } };
    }
    if (l.req.endorsements.some((e) => e.tier === tier)) return { ok: false, errors: { tier: "This tier has already endorsed it." } };
    const { lookups } = await loadLookups(l.org.id, tx);
    const person = lookups.people.find((p) => p.id === personId);
    if (!person) return { ok: false, errors: { personId: "That person is not on file." } };
    if (!person.isActive) return { ok: false, errors: { personId: "That person is recorded as having left." } };
    const endorsedOn = storedDay(on);
    const fault = endorsementEntryFault({ tier, unitCode: "", personId, endorsedOn }, unitOf(l.req), policy.endorsementTiers, lookups.units, l.org.today, l.req.requestingPersonId);
    if (fault) {
      const text = endorsementFaultText(fault, () => person.name);
      return fault.code === "NOT_HEAD" || fault.code === "REQUESTER" ? { ok: false, errors: { personId: text } } : fault.code === "FUTURE_DATE" ? { ok: false, errors: { endorsedOn: text } } : { ok: false, message: text };
    }
    const unit = pathTo(lookups.units, unitOf(l.req), on).reverse().find((u) => u.kind === tier)!;
    const row = await tx.requisitionEndorsement.create({
      data: { requisitionId: id, tier, unitCode: unit.code, personId, endorsedOn: on, note },
    });
    await audit(tx, l.org.id, "RequisitionEndorsement", row.id, `${l.req.reference} · ${TIER_LABEL[tier]}`, "CREATE",
      diffFields(null, { tier, unit: unit.nameEn, person: person.name, endorsedOn: on, note }));
    return { ok: true };
  });
}

/// The context `transitionFault` needs to let a draft go, read from the locked row.
async function leaveDraftContext(tx: Tx, l: LoadedRequisition): Promise<TransitionContext> {
  const [policy, { lookups, formats }] = await Promise.all([loadPolicy(l.org.id, tx), loadLookups(l.org.id, tx)]);
  const on = l.org.today ? dayToDate(l.org.today) : new Date();
  const fields = blocking(requisitionFaults(draftOf(l.req), lookups, formats, on));
  const endorsements = endorsementFaults(
    unitOf(l.req),
    policy.endorsementTiers,
    l.req.endorsements.map((e) => ({ tier: e.tier as OrgUnitKind, unitCode: e.unitCode, personId: e.personId, endorsedOn: storedDay(e.endorsedOn) })),
    lookups.units,
    l.org.today,
  );
  return {
    today: l.org.today,
    fieldFaults: fields.length,
    tiersSet: policy.endorsementTiers.length > 0,
    endorsementFaults: endorsements.length,
  };
}

/// Draft to Endorsed: complete, and every tier endorsed by its head.
export async function markEndorsed(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const fault = transitionFault(l.req.status, "ENDORSED", await leaveDraftContext(tx, l));
    if (fault) return { ok: false, message: transitionFaultText(fault) };
    await mustMove(tx, l, "ENDORSED");
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: "ENDORSED" }));
    return { ok: true };
  });
}

/// Endorsed to Returned: the completeness return (FR-REQ-010), with reason, recipient and date.
export async function returnRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const reason = r.text("reason", "Reason", { max: 2000 });
  const to = r.optionalText("returnedToPersonId");
  const on = r.date("returnedOn", "Returned on");
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const returnedOn = on ? storedDay(on) : null;
    const fault = transitionFault(l.req.status, "RETURNED", { today: l.org.today, reason, returnedToPersonId: to, returnedOn });
    if (fault) {
      if (fault.code === "RETURN_DETAILS_REQUIRED") {
        const errors: Record<string, string> = {};
        if (fault.missing.includes("reason")) errors.reason = "Say what is incomplete.";
        if (fault.missing.includes("recipient")) errors.returnedToPersonId = "Name who it is returned to.";
        if (fault.missing.includes("date")) errors.returnedOn = "Give the date it was returned.";
        return { ok: false, errors };
      }
      if (fault.code === "FUTURE_DATE") return { ok: false, errors: { returnedOn: transitionFaultText(fault) } };
      return { ok: false, message: transitionFaultText(fault) };
    }
    const person = await tx.person.findFirst({ where: { id: to!, organisationId: l.org.id }, select: { name: true } });
    if (!person) return { ok: false, errors: { returnedToPersonId: "That person is not on file." } };
    const after = { status: "RETURNED" as const, returnedReason: reason, returnedToPersonId: to, returnedOn: on };
    await mustMove(tx, l, "RETURNED", after);
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE",
      diffFields({ status: l.req.status, returnedReason: l.req.returnedReason, returnedToPersonId: l.req.returnedToPersonId, returnedOn: l.req.returnedOn }, after), reason);
    return { ok: true };
  });
}

/// Returned, recalled or rejected, back to Draft.
export async function reopenDraft(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const fault = transitionFault(l.req.status, "DRAFT", { today: l.org.today });
    if (fault) return { ok: false, message: transitionFaultText(fault) };
    await mustMove(tx, l, "DRAFT");
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: "DRAFT" }), reason);
    return { ok: true };
  });
}

/// Withdrawn before approval (§7.3.1). Reason mandatory.
export async function cancelRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const fault = transitionFault(l.req.status, "CANCELLED", { today: l.org.today, reason });
    if (fault) return fault.code === "REASON_REQUIRED" ? { ok: false, errors: { reason: transitionFaultText(fault) } } : { ok: false, message: transitionFaultText(fault) };
    await mustMove(tx, l, "CANCELLED", { cancelReason: reason });
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status, cancelReason: l.req.cancelReason }, { status: "CANCELLED", cancelReason: reason }), reason);
    return { ok: true };
  });
}

/// Rejected to Closed. Reason mandatory.
export async function closeRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const fault = transitionFault(l.req.status, "CLOSED", { today: l.org.today });
    if (fault) return { ok: false, message: transitionFaultText(fault) };
    await mustMove(tx, l, "CLOSED");
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: "CLOSED" }), reason);
    return { ok: true };
  });
}

// --------------------------------------------------------- finance references

/// Save the finance system's numbers onto the locked row, refusing a clash or a malformed one.
async function saveErpRefs(tx: Tx, l: LoadedRequisition, proc: string | null, nm: string | null): Promise<Record<string, string> | null> {
  const { formats } = await loadLookups(l.org.id, tx);
  const errors: Record<string, string> = {};
  for (const f of erpRefFaults(proc, nm, formats)) {
    if (f.code === "NO_FORMAT") continue;
    errors[f.field] = f.code === "MALFORMED" ? `Does not match the configured format${f.example ? ` (for example ${f.example})` : ""}.` : "The configured format cannot be read. Correct it under Organisation, Code formats.";
  }
  for (const [field, value] of [["erpRequisitionNo", proc], ["erpNoteNo", nm]] as const) {
    if (!value || errors[field]) continue;
    const clash = await tx.requisition.findFirst({ where: { organisationId: l.org.id, [field]: value, NOT: { id: l.req.id } }, select: { reference: true } });
    if (clash) errors[field] = `Already recorded against ${clash.reference}. Each finance-system number belongs to one requisition.`;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Record the finance system's requisition and note numbers (FR-REQ-002). Consumed,
 * never minted. Changing one already recorded needs a reason.
 */
export async function recordErpRefs(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const proc = String(data.get("erpRequisitionNo") ?? "").trim() || null;
  const nm = String(data.get("erpNoteNo") ?? "").trim() || null;
  const reason = String(data.get("reason") ?? "").trim();
  if (!proc && !nm) return { ok: false, errors: { erpRequisitionNo: "Enter at least one number." } };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (["CANCELLED", "CLOSED"].includes(l.req.status)) return { ok: false, message: "A cancelled or closed requisition cannot change." };
    const replacing = (l.req.erpRequisitionNo && proc && proc !== l.req.erpRequisitionNo) || (l.req.erpNoteNo && nm && nm !== l.req.erpNoteNo);
    if (replacing && !reason) return { ok: false, errors: { reason: "Say why a number already recorded is being changed." } };
    const errors = await saveErpRefs(tx, l, proc, nm);
    if (errors) return { ok: false, errors };
    const after = { erpRequisitionNo: proc ?? l.req.erpRequisitionNo, erpNoteNo: nm ?? l.req.erpNoteNo, erpRefSource: "MANUAL" as const, erpRefRecordedAt: new Date() };
    await tx.requisition.update({ where: { id }, data: after });
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE",
      diffFields({ erpRequisitionNo: l.req.erpRequisitionNo, erpNoteNo: l.req.erpNoteNo }, { erpRequisitionNo: after.erpRequisitionNo, erpNoteNo: after.erpNoteNo }), reason);
    await linkMatchingMatters(tx, l.org.id, id);
    return { ok: true };
  });
}

/// Endorsed to Registered (OD-10): with the finance system's numbers where the policy requires them.
export async function registerRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const proc = String(data.get("erpRequisitionNo") ?? "").trim() || null;
  const nm = String(data.get("erpNoteNo") ?? "").trim() || null;
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const policy = await loadPolicy(l.org.id, tx);
    const nextProc = proc ?? l.req.erpRequisitionNo;
    const nextNm = nm ?? l.req.erpNoteNo;
    const fault = transitionFault(l.req.status, "REGISTERED", { today: l.org.today, erpReferenceRequired: policy.erpReferenceRequired, erpRequisitionNo: nextProc, erpNoteNo: nextNm });
    if (fault) {
      if (fault.code === "ERP_REFS_REQUIRED") {
        return { ok: false, errors: Object.fromEntries(fault.missing.map((m) => [m, "Required: the policy registers a requisition only with the finance system's numbers."])) };
      }
      return { ok: false, message: transitionFaultText(fault) };
    }
    if ((proc && proc !== l.req.erpRequisitionNo) || (nm && nm !== l.req.erpNoteNo)) {
      if ((l.req.erpRequisitionNo && proc && proc !== l.req.erpRequisitionNo) || (l.req.erpNoteNo && nm && nm !== l.req.erpNoteNo)) {
        return { ok: false, message: "A number is already recorded. Change it with “Record finance numbers”, which asks for a reason." };
      }
      const errors = await saveErpRefs(tx, l, proc, nm);
      if (errors) return { ok: false, errors };
    }
    const refs = nextProc !== l.req.erpRequisitionNo || nextNm !== l.req.erpNoteNo
      ? { erpRequisitionNo: nextProc, erpNoteNo: nextNm, erpRefSource: "MANUAL" as const, erpRefRecordedAt: new Date() }
      : {};
    await mustMove(tx, l, "REGISTERED", refs);
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE",
      diffFields({ status: l.req.status, erpRequisitionNo: l.req.erpRequisitionNo, erpNoteNo: l.req.erpNoteNo }, { status: "REGISTERED", erpRequisitionNo: nextProc, erpNoteNo: nextNm }));
    await linkMatchingMatters(tx, l.org.id, id);
    return { ok: true };
  });
}

// --------------------------------------------------------------- funding

/**
 * Change the funding route (FR-REQ-004). While the requisition is a draft this is an
 * edit; after that it is a controlled change with a reason, and never while an
 * approval is open (recall it first). The route's posture is re-read and stored.
 */
export async function changeFunding(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const code = r.text("fundingRouteCode", "Funding route", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (["CANCELLED", "CLOSED", "FULFILLED"].includes(l.req.status)) return { ok: false, message: "This requisition can no longer change." };
    if (l.req.status === "PENDING_APPROVAL") return { ok: false, message: "An approval is open on the current route. Recall it first, then change the funding route." };
    if (code === l.req.fundingRouteCode) return { ok: false, errors: { fundingRouteCode: "That is already the funding route." } };
    const { lookups } = await loadLookups(l.org.id, tx);
    const route = lookups.fundingRoutes.find((x) => x.code === code) ?? null;
    const on = l.org.today ? dayToDate(l.org.today) : new Date();
    const gate = fundingGate(route, { externalAuthorityRef: l.req.externalAuthorityRef }, on);
    const hard = gate.faults.filter((f) => f.code !== "EXTERNAL_REF_MISSING");
    if (hard.length > 0) return { ok: false, errors: { fundingRouteCode: fundingFaultText(hard[0]) } };
    // Before submission the snapshot is taken at submission; after, it is re-taken now.
    const snapshot = l.req.fundingSupersedesAuthority != null
      ? { fundingSupersedesAuthority: gate.supersedesAuthority, sourcingPermitted: gate.sourcingPermitted, fundingPosture: gate.posture }
      : {};
    const after = { fundingRouteCode: code, ...snapshot };
    await tx.requisition.update({ where: { id }, data: after });
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE",
      diffFields({ fundingRouteCode: l.req.fundingRouteCode, sourcingPermitted: l.req.sourcingPermitted }, after), reason);
    return { ok: true };
  });
}

/// Record the external body's authority where the funding route requires one (FR-REQ-005).
export async function recordExternalAuthority(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const ref = r.text("externalAuthorityRef", "Reference", { required: true, max: 200 });
  const reason = String(data.get("reason") ?? "").trim();
  if (r.failed) return { ok: false, errors: r.errors };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (["CANCELLED", "CLOSED"].includes(l.req.status)) return { ok: false, message: "A cancelled or closed requisition cannot change." };
    if (l.req.externalAuthorityRef && !reason) return { ok: false, errors: { reason: "Say why the recorded reference is being changed." } };
    await tx.requisition.update({ where: { id }, data: { externalAuthorityRef: ref } });
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ externalAuthorityRef: l.req.externalAuthorityRef }, { externalAuthorityRef: ref }), reason);
    return { ok: true };
  });
}

// ---------------------------------------------------------------- budget

const CHECKABLE: RequisitionStatus[] = ["REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET"];
const SOURCE_NOT_SET =
  "Where the budget check comes from is not set, so no check can be run. Set the budget check source in Configuration, Requisition controls.";

/// Write one check snapshot. Returns its row.
async function writeCheck(tx: Tx, l: LoadedRequisition, s: BudgetSnapshot & { budgetCodeCode: string | null }, asAt: Date) {
  const dec = (v: bigint | null) => (v == null ? null : senToDecimalString(v));
  const row = await tx.requisitionBudgetCheck.create({
    data: {
      requisitionId: l.req.id,
      asAt,
      source: s.source,
      budgetCodeId: l.req.budgetCodeId,
      budgetCodeCode: s.budgetCodeCode,
      requestedAmount: senToDecimalString(s.requested),
      actualBudget: dec(s.actualBudget),
      balanceAsAt: dec(s.balanceAsAt),
      approvedAccount: dec(s.approvedAccount),
      approvedAccountProvenance: s.approvedAccountProvenance,
      projectedBalance: dec(s.projectedBalance),
      verdict: s.verdict,
      outcome: s.warnings.join(" "),
    },
  });
  await audit(tx, l.org.id, "RequisitionBudgetCheck", row.id, `${l.req.reference} · budget check`, "CREATE",
    diffFields(null, { source: s.source, asAt, budgetCode: s.budgetCodeCode, verdict: s.verdict, balanceAsAt: dec(s.balanceAsAt), requestedAmount: senToDecimalString(s.requested) }));
  return row;
}

/// The cost centre's unit, for the owner warning.
async function costCentreUnit(tx: Tx, l: LoadedRequisition, on: Date) {
  const cc = await tx.costCentre.findFirst({
    where: { organisationId: l.org.id, code: l.req.costCentreCode, effectiveFrom: { lte: on }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: on } }] },
    select: { orgUnitCode: true },
  });
  return cc?.orgUnitCode ?? null;
}

/**
 * Run the budget check (FR-REQ-007) from the configured source: the portal ledger, or
 * figures typed from the finance system and stored as typed. Unset runs nothing.
 */
export async function checkBudget(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const typed = {
    actualBudget: r.money("actualBudget", "Actual budget"),
    balanceAsAt: r.money("balanceAsAt", "Balance as at"),
    approvedAccount: r.money("approvedAccount", "Approved account"),
    projectedBalance: r.money("projectedBalance", "Projected balance"),
    asAt: r.date("asAt", "As at"),
  };
  if (r.failed) return { ok: false, errors: r.errors };

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    if (!CHECKABLE.includes(l.req.status)) return { ok: false, message: "A budget check runs once the requisition is registered, and before it is submitted." };
    if (!l.org.today) return NO_ZONE;
    const controls = await loadControls(l.org.id, tx);
    if (!controls.budgetCheckSource) return { ok: false, message: SOURCE_NOT_SET };
    const today = dayToDate(l.org.today);
    let provider: BudgetCheckProvider = portalLedger;
    let asAt = today;
    if (controls.budgetCheckSource === "MANUAL_ERP_ENTRY") {
      const errors: Record<string, string> = {};
      if (!typed.balanceAsAt) errors.balanceAsAt = "The balance as at the date is required: the verdict is read from it.";
      if (!typed.asAt) errors.asAt = "Give the date the finance system's figures are as at.";
      else if (storedDay(typed.asAt) > l.org.today) errors.asAt = "The figures cannot be as at a date after today.";
      if (Object.keys(errors).length > 0) return { ok: false, errors };
      asAt = typed.asAt!;
      const sen = (v: string | null) => (v == null ? null : parseSen(v));
      provider = manualEntry({
        actualBudget: sen(typed.actualBudget),
        balanceAsAt: parseSen(typed.balanceAsAt!),
        approvedAccount: sen(typed.approvedAccount),
        projectedBalance: sen(typed.projectedBalance),
        budgetCodeCode: l.req.budgetCode?.code ?? null,
      });
    }
    const snapshot = await provider.check(tx, {
      budgetCodeId: l.req.budgetCodeId,
      accountCode: l.req.accountCode,
      costCentreUnitCode: await costCentreUnit(tx, l, today),
      requested: parseSen(l.req.estimatedValue.toString()),
      on: today,
    });
    await writeCheck(tx, l, snapshot, asAt);
    const to: RequisitionStatus = snapshot.verdict === "EXCEEDS" ? "OVER_BUDGET" : "BUDGET_CHECKED";
    if (to !== l.req.status) {
      await mustMove(tx, l, to);
      await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: to }));
    }
    return { ok: true };
  });
}

// ---------------------------------------------------------------- submission

/// The requisitions this one is compared with for splitting, as the pure check reads them.
async function splitSubjects(tx: Tx, orgId: string) {
  const rows = await tx.requisition.findMany({
    where: { organisationId: orgId },
    select: { id: true, reference: true, status: true, raisedOn: true, estimatedValue: true, requestingUnitCode: true, costCentreCode: true, accountCode: true, budgetCodeId: true, contractTypeCode: true },
  });
  return rows.map(
    (r): SplitSubject => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      raisedOn: storedDay(r.raisedOn),
      value: num(r.estimatedValue)!,
      keys: { unit: r.requestingUnitCode || null, costCentre: r.costCentreCode || null, accountCode: r.accountCode || null, budgetCode: r.budgetCodeId, contractType: r.contractTypeCode },
    }),
  );
}

/**
 * Submit for approval (FR-REQ-004–009, 015): re-check the budget where the last check
 * is stale, decide the over-budget disposition, run the splitting check, resolve the
 * route, and open the approval instance with every rule it was judged under. All of
 * it is computed on the locked row first and written only if nothing refuses.
 */
export async function submitRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const invoked = data.get("invokeOverBudget") != null;

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const req = l.req;
    const fault = transitionFault(req.status, "PENDING_APPROVAL", { today: l.org.today });
    if (fault) return { ok: false, message: transitionFaultText(fault) };
    const todayStr = l.org.today!;
    const today = dayToDate(todayStr);
    const [policy, controls, { lookups, formats }] = await Promise.all([loadPolicy(l.org.id, tx), loadControls(l.org.id, tx), loadLookups(l.org.id, tx)]);
    // Configuration read inside the same locked transaction as the write (code review, item 8).
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE, tx), await loadDelegations(ORGANISATION_CODE, tx)];

    const fields = blocking(requisitionFaults(draftOf(req), lookups, formats, today));
    if (fields.length > 0) return { ok: false, message: `This requisition cannot be submitted: ${fields.map(fieldFaultText).join(" ")}` };
    const route = lookups.fundingRoutes.find((x) => x.code === req.fundingRouteCode) ?? null;
    const gate = fundingGate(route, { externalAuthorityRef: req.externalAuthorityRef }, today);
    if (gate.faults.length > 0) return { ok: false, message: gate.faults.map(fundingFaultText).join(" ") };

    // The budget: the latest check, re-run where it has gone stale (FR-REQ-007).
    const last = req.budgetChecks[0] ?? null;
    if (!last) return { ok: false, message: "Run the budget check before submitting." };
    let check: BudgetSnapshot & { budgetCodeCode: string | null } | null = null;
    let verdict = last.verdict;
    // A check ages from the day its figures are as at (ruling on hand-entered checks).
    if (isStale(ageDay(last), policy.budgetRecheckDays, todayStr)) {
      if (controls.budgetCheckSource !== "PORTAL_LEDGER") {
        return {
          ok: false,
          message: controls.budgetCheckSource
            ? `The last budget check is older than the ${policy.budgetRecheckDays}-day re-check window, and its figures are entered by hand. Enter a fresh check from the finance system first.`
            : SOURCE_NOT_SET,
        };
      }
      check = await portalLedger.check(tx, {
        budgetCodeId: req.budgetCodeId,
        accountCode: req.accountCode,
        costCentreUnitCode: await costCentreUnit(tx, l, today),
        requested: parseSen(req.estimatedValue.toString()),
        on: today,
      });
      verdict = check.verdict;
    }
    const disposition = overBudgetDisposition(verdict, controls.availabilityCheck, invoked);
    if (!disposition.proceed) {
      const stale = check ? "The last check had gone stale and was re-run now: " : "";
      const text = {
        NO_BUDGET: "there is no budget on the budget code to check against, so it cannot be submitted.",
        AMBIGUOUS: "the account code is not the budget code's account, so which budget line applies is unclear.",
        INSUFFICIENT_FUNDS: "it is over budget, and the availability check is set to block. Invoke the over-budget route to send it to the over-budget approvers.",
        INVOCATION_REQUIRED: "it is over budget, and the availability check is not set, so it does not proceed on its own. Invoke the over-budget route to send it to the over-budget approvers.",
      }[disposition.fault];
      return { ok: false, message: `${stale}${text.charAt(0).toUpperCase()}${text.slice(1)}` };
    }

    // The route (FR-REQ-006/008/009), under the organisation's issue in force today.
    const dal = await loadIssue(ORGANISATION_CODE, today, undefined, null, tx);
    if (!dal) return { ok: false, message: "No approval matrix is in force, so the requisition cannot be routed." };
    const override = gate.supersedesAuthority && req.fundingRouteCode ? await loadOverrideMatrix(ORGANISATION_CODE, req.fundingRouteCode, today, tx) : null;
    const value = num(req.estimatedValue)!;
    const q = { value, overBudget: disposition.cond === "over_budget", fundingRouteCode: req.fundingRouteCode, fundingSupersedesAuthority: gate.supersedesAuthority === true };
    let resolved = resolveRequisitionRoute(dal.matrix, override, q);
    // Nobody approves their own requisition: where the requester holds the approving
    // office, the engine's self-approval rule escalates it.
    const unitPath = pathTo(lookups.units, unitOf(req), today).reverse().map((u) => u.code);
    if (resolved.resolution.approverCode && requesterHoldsApprover(resolved.resolution.approverCode, req.requestingPersonId, unitPath, roster, delegations, todayStr)) {
      resolved = resolveRequisitionRoute(dal.matrix, override, { ...q, actorRoleCode: resolved.resolution.approverCode });
    }
    if (resolved.faults.length > 0) return { ok: false, message: resolved.faults.map((f) => f.messageEn).join(" ") };

    // Splitting (FR-REQ-015): NOT_SET is stored and shown, never cleared (OD-7).
    const others = await splitSubjects(tx, l.org.id);
    const me = others.find((o) => o.id === req.id)!;
    const company = lookups.units.find((u) => u.kind === "COMPANY" && u.effectiveFrom <= today && (u.effectiveTo == null || u.effectiveTo > today));
    const split = assessSplitting(me, others, {
      windowDays: policy.splittingWindowDays,
      matchOn: policy.splittingMatchOn,
      aggregateAcrossYear: policy.splittingAggregateAcrossYear,
      financialYearStart: company?.financialYearStart ?? null,
    }, dal.matrix);

    // Nothing refused: write.
    const checkRow = check ? await writeCheck(tx, l, check, today) : last;
    const splitRow = await tx.requisitionSplitCheck.create({
      data: {
        requisitionId: req.id,
        state: split.state,
        windowDays: policy.splittingWindowDays,
        matchOn: policy.splittingMatchOn,
        aggregateAcrossYear: policy.splittingAggregateAcrossYear,
        policyProvenance: policy.provenance,
        relatedRequisitionIds: split.related.map((x) => x.id),
        relatedReferences: split.related.map((x) => x.reference),
        combinedValue: split.combinedValue == null ? null : String(split.combinedValue),
        crossesBand: split.crossesBand,
        notSetReasons: split.notSet,
      },
    });
    const issue = resolved.source === "OVERRIDE" && override ? override : dal;
    const rule = resolved.resolution.rule!;
    const roleLabel = (code: string) => issue.matrix.roles[code]?.nameEn ?? dal.matrix.roles[code]?.nameEn ?? "An office no longer configured";
    const warnings = [
      ...resolved.warnings,
      ...(disposition.controlNotSet
        ? [{ code: "CONTROL_NOT_SET", level: "warn", messageEn: "Over budget with the availability check not set: the over-budget route was invoked by the officer.", messageMs: "Melebihi bajet dan kawalan semakan belum ditetapkan: laluan melebihi bajet digunakan oleh pegawai." }]
        : []),
      ...(disposition.autoRouted
        ? [{ code: "OVER_BUDGET", level: "warn", messageEn: "Over budget: routed to the over-budget approvers automatically, as the availability check is set to warn.", messageMs: "Melebihi bajet: dihalakan kepada pelulus melebihi bajet secara automatik kerana semakan ditetapkan untuk memberi amaran." }]
        : []),
      ...(check ? [{ code: "BUDGET_RECHECKED", level: "info", messageEn: "The last budget check had gone stale and was re-run on submission.", messageMs: "Semakan bajet terakhir telah lapuk dan dijalankan semula semasa penghantaran." }] : []),
      ...(check?.warnings ?? []).map((w) => ({ code: w, level: "warn", messageEn: "The cost centre's unit is not the budget code's owning unit.", messageMs: "Unit pusat kos bukan unit pemilik kod bajet." })),
    ];
    const instance = await tx.approvalInstance.create({
      data: {
        organisationId: l.org.id,
        matterKind: "REQUISITION",
        requisitionId: req.id,
        domain: "requisition",
        cond: disposition.cond,
        value: req.estimatedValue,
        authorityMatrixId: dal.id,
        matrixLabel: dal.label,
        ruleKey: rule.ruleKey,
        ruleLabel: rule.labelEn,
        ruleClause: rule.clause,
        boundaryValue: String(issue.matrix.policy.boundaryValue),
        boundaryInclusive: issue.matrix.policy.boundaryInclusive,
        ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
        boundaryOperator: resolved.resolution.boundaryOperator,
        fundingRouteCode: req.fundingRouteCode,
        fundingOverrideApplied: resolved.fundingOverrideApplied,
        overrideMatrixId: resolved.overrideIssue?.id ?? null,
        overrideMatrixLabel: resolved.overrideIssue?.label ?? null,
        budgetCheckId: checkRow.id,
        budgetVerdict: verdict,
        availabilityCheck: controls.availabilityCheck,
        overBudgetInvoked: invoked && disposition.cond === "over_budget" && !disposition.autoRouted,
        splitCheckId: splitRow.id,
        splitState: split.state,
        checkedAgainstMatrix: true,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        status: "PENDING",
        openedAt: today,
        steps: {
          create: resolved.resolution.chain.map((s, i) => ({
            sequence: i + 1,
            roleCode: s.roleCode,
            roleLabel: roleLabel(s.roleCode),
            act: s.act,
            committeeCode: s.committeeCode ?? null,
            nonDelegable: s.nonDelegable,
            sourceRuleKey: s.sourceRuleKey,
          })),
        },
      },
    });
    const after = {
      status: "PENDING_APPROVAL" as const,
      fundingSupersedesAuthority: gate.supersedesAuthority,
      sourcingPermitted: gate.sourcingPermitted,
      fundingPosture: gate.posture,
    };
    await mustMove(tx, l, "PENDING_APPROVAL", after);
    await audit(tx, l.org.id, "ApprovalInstance", instance.id, `${req.reference} · approval route`, "CREATE",
      diffFields(null, {
        matrix: dal.label,
        rule: rule.labelEn,
        route: resolved.resolution.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "),
        overBudget: disposition.cond === "over_budget",
        fundingOverrideApplied: resolved.fundingOverrideApplied,
        splitState: split.state,
      }));
    await audit(tx, l.org.id, "Requisition", id, labelOf(req), "UPDATE", diffFields({ status: req.status, sourcingPermitted: req.sourcingPermitted }, after));
    return { ok: true };
  });
}

// ---------------------------------------------------------------- decisions

const openInstance = (l: LoadedRequisition) => l.req.approvalInstances.find((i) => i.status === "PENDING") ?? null;

/**
 * Whether the final decision may approve, and what approval will write. Run on the
 * locked data BEFORE the final step is recorded.
 *
 * - A flagged split without a justification refuses.
 * - A commitment is written only where the budget settings commit on approval and the
 *   funding route commits the organisation's budget (ruling BD-13).
 * - Where it will be written, the ledger is re-checked under the budget code's lock
 *   (ruling Q2). No longer fitting, the approval is refused and the requisition goes
 *   back for a fresh check: the check is stored, the route is closed, and it becomes
 *   Over budget, to be resubmitted on the over-budget route. A requisition already on
 *   the over-budget route is exempt. These writes are kept: "return" is an outcome.
 */
type Gate =
  | { kind: "refuse"; state: FormState }
  | { kind: "return"; state: FormState }
  | { kind: "ok"; commit: ReturnType<typeof approvalCommitment>; routeCommits: boolean | null; commitOnApproval: boolean | null };

async function approvalGate(tx: Tx, l: LoadedRequisition, instanceId: string): Promise<Gate> {
  const req = l.req;
  const today = dayToDate(l.org.today!);
  const inst = req.approvalInstances.find((i) => i.id === instanceId)!;
  const split = req.splitChecks.find((c) => c.id === inst.splitCheckId) ?? null;
  if (splitApprovalFault(split)) {
    return { kind: "refuse", state: { ok: false, message: "This requisition was flagged as a possible split. Record a justification for the flag before the final approval." } };
  }
  const controls = await loadControls(l.org.id, tx);
  const route = req.fundingRouteCode
    ? await tx.fundingRoute.findFirst({ where: { organisationId: l.org.id, code: req.fundingRouteCode }, select: { approvalCommitsBudget: true } })
    : null;
  const routeCommits = route?.approvalCommitsBudget ?? null;
  const commit = approvalCommitment(controls.commitOnApproval, routeCommits);
  if (commit !== "WRITE") return { kind: "ok", commit, routeCommits, commitOnApproval: controls.commitOnApproval };

  if (!req.budgetCodeId) return { kind: "refuse", state: { ok: false, message: "Approval commits the budget, and this requisition names no budget code." } };
  const periods = await tx.budgetPeriod.findMany({ where: { organisationId: l.org.id } });
  const closed = postingRefusal(periods, today);
  if (closed) {
    return {
      kind: "refuse",
      state: { ok: false, message: `Approval commits the budget today, and the budget period ${closed.nameEn} ${closed.year} is closed. Reopen the period, or approve once the next one is open.` },
    };
  }
  // Under the code's lock (taken by the provider), so a commitment landing at the same
  // moment is either counted here or waits.
  const fresh = await portalLedger.check(tx, {
    budgetCodeId: req.budgetCodeId,
    accountCode: req.accountCode,
    costCentreUnitCode: await costCentreUnit(tx, l, today),
    requested: parseSen(req.estimatedValue.toString()),
    on: today,
  });
  if (approvalBudgetFault(fresh, inst.cond)) {
    await writeCheck(tx, l, fresh, today);
    const returned = {
      code: "RETURNED_AT_APPROVAL",
      level: "err",
      messageEn: "Returned at approval: re-checked under the budget code's lock, the budget no longer covered it. A fresh check was recorded; it goes back on the over-budget route.",
      messageMs: "Dikembalikan semasa kelulusan: bajet tidak lagi mencukupi. Semakan baharu direkodkan; ia dihantar semula melalui laluan melebihi bajet.",
    };
    await tx.approvalInstance.update({
      where: { id: inst.id },
      data: { status: "RECALLED", closedAt: new Date(), warnings: [...((inst.warnings as object[]) ?? []), returned] as unknown as Prisma.InputJsonValue },
    });
    await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${req.reference} · approval route`, "UPDATE",
      diffFields({ status: inst.status }, { status: "RECALLED" }), "Returned at approval: the budget no longer covers it.");
    await mustMove(tx, l, "OVER_BUDGET");
    await audit(tx, l.org.id, "Requisition", req.id, labelOf(req), "UPDATE", diffFields({ status: req.status }, { status: "OVER_BUDGET" }),
      "Returned at approval: the budget no longer covers it.");
    return {
      kind: "return",
      state: {
        ok: false,
        message:
          "Not approved: re-checked at approval, the budget code no longer covers this requisition — another commitment has used the balance since it was submitted. The fresh check is recorded and the requisition is back to Over budget; submit it again on the over-budget route.",
      },
    };
  }
  return { kind: "ok", commit, routeCommits, commitOnApproval: controls.commitOnApproval };
}

/// Close an approved route: the commitment where the gate says so, and the status.
async function approve(tx: Tx, l: LoadedRequisition, instanceId: string, gate: Extract<Gate, { kind: "ok" }>) {
  const req = l.req;
  const today = dayToDate(l.org.today!);
  let commitmentMovementId: string | null = null;
  if (gate.commit === "WRITE") {
    const movement = await tx.budgetMovement.create({
      data: { budgetCodeId: req.budgetCodeId!, kind: "COMMITMENT", reference: req.reference, description: req.title, amount: req.estimatedValue, occurredOn: today },
    });
    commitmentMovementId = movement.id;
    await audit(tx, l.org.id, "BudgetMovement", movement.id, `${req.budgetCode?.code ?? "Budget code"} · commitment for ${req.reference}`, "CREATE",
      diffFields(null, { kind: "COMMITMENT", budgetCode: req.budgetCode?.code, reference: req.reference, amount: req.estimatedValue.toString(), occurredOn: today }));
  }
  await tx.approvalInstance.update({
    where: { id: instanceId },
    data: { status: "APPROVED", closedAt: new Date(), commitOnApproval: gate.commitOnApproval, routeCommitsBudget: gate.routeCommits },
  });
  await audit(tx, l.org.id, "ApprovalInstance", instanceId, `${req.reference} · approval route`, "UPDATE",
    diffFields({ status: "PENDING" }, { status: "APPROVED", commitment: gate.commit === "WRITE" ? "written" : "not written" }));
  await mustMove(tx, l, "APPROVED", { commitmentMovementId });
  await audit(tx, l.org.id, "Requisition", req.id, labelOf(req), "UPDATE",
    diffFields({ status: req.status }, { status: "APPROVED" }));
}

/**
 * Record a Person's decision on a step (OD-12): recorded on behalf of, not signed. The
 * holder, delegation, self-approval and conflict checks apply to that Person, and no
 * decision is dated after today. The last step done approves the requisition.
 */
export async function recordDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const stepId = String(data.get("stepId") ?? "");
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["DONE", "REJECTED"] as const, { required: true });
  const personId = r.text("personId", "Decided by", { required: true });
  const on = r.date("decidedOn", "Decided on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (decision === "REJECTED" && !reason) r.reject("reason", "Say why it is rejected.");
  if (r.failed || !decision || !on) return { ok: false, errors: r.errors };

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const inst = openInstance(l);
    if (l.req.status !== "PENDING_APPROVAL" || !inst) return { ok: false, message: "No approval is open on this requisition." };
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step) return { ok: false, message: "That step is not on the open route." };
    // Read inside the locked transaction (code review, item 8).
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE, tx), await loadDelegations(ORGANISATION_CODE, tx)];
    const decidedOn = storedDay(on);
    const { lookups } = await loadLookups(l.org.id, tx);
    const person = lookups.people.find((p) => p.id === personId) ?? null;
    const unitPath = pathTo(lookups.units, unitOf(l.req), on).reverse().map((u) => u.code);
    const check = deciderFaults(step, {
      today: l.org.today,
      holders: step.roleCode ? holdersFor(step.roleCode, unitPath, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
      person,
      requesterId: l.req.requestingPersonId,
      endorserIds: [],
      endorsements: l.req.endorsements.map((e) => ({ personId: e.personId, unitCode: e.unitCode })),
      otherDeciderIds: inst.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
      earlierDone: inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
      decidedOn,
      openedOn: storedDay(inst.openedAt),
      value: parseSen(l.req.estimatedValue.toString()),
    });
    if (check.faults.length > 0) {
      const texts = check.faults.map((f) => DECIDER_FAULT_TEXT[f]);
      const field = check.faults.some((f) => ["FUTURE_DATE", "BEFORE_SUBMISSION"].includes(f)) && check.faults.length === 1 ? "decidedOn" : "personId";
      return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0])
        ? { ok: false, message: texts.join(" ") }
        : { ok: false, errors: { [field]: texts.join(" ") } };
    }
    // The last step done approves: the gate runs before the step is recorded.
    const final = decision === "DONE" && inst.steps.every((s) => s.id === step.id || s.decision === "DONE");
    const gate = final ? await approvalGate(tx, l, inst.id) : null;
    if (gate?.kind === "refuse") return gate.state;
    if (gate?.kind === "return") {
      refresh(id);
      return gate.state;
    }
    const after = { decision, decidedByPersonId: personId, decidedByName: person!.name, decidedOn: on, delegationId: check.delegationId, reason, recordedAt: new Date() };
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING" }, data: after });
    if (done.count !== 1) return CHANGED;
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.req.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision, decidedBy: person!.name, decidedOn: on, recordedOnBehalf: "not signed", underDelegation: check.delegationId ? "yes" : null }), reason);

    if (decision === "REJECTED") {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "REJECTED", closedAt: new Date() } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${l.req.reference} · approval route`, "UPDATE", diffFields({ status: inst.status }, { status: "REJECTED" }), reason);
      await mustMove(tx, l, "REJECTED");
      await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: "REJECTED" }), reason);
      return { ok: true };
    }
    if (gate?.kind === "ok") await approve(tx, l, inst.id, gate);
    return { ok: true };
  });
}

/**
 * Discharge a committee step from the committee's decision (FR-REQ-012): only a
 * matter tabled against this requisition, before the step's committee, and only what
 * `decisionRecord()` says of it.
 */
export async function citeCommitteeDecision(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const stepId = String(data.get("stepId") ?? "");
  const decisionId = String(data.get("committeeDecisionId") ?? "");
  if (!decisionId) return { ok: false, errors: { committeeDecisionId: "Choose the committee's decision." } };

  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const inst = openInstance(l);
    if (l.req.status !== "PENDING_APPROVAL" || !inst) return { ok: false, message: "No approval is open on this requisition." };
    if (!l.org.today) return NO_ZONE;
    const step = inst.steps.find((s) => s.id === stepId);
    if (!step || !step.committeeCode) return { ok: false, message: "That is not a committee step on the open route." };
    if (step.decision !== "PENDING") return { ok: false, message: "This step is already decided." };
    if (!inst.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE")) {
      return { ok: false, message: DECIDER_FAULT_TEXT.OUT_OF_ORDER };
    }
    const matter = l.req.committeeDecisions.find((d) => d.id === decisionId);
    if (!matter) return { ok: false, errors: { committeeDecisionId: "That matter was not tabled against this requisition." } };
    // One decision discharges one step: any step anywhere already citing it counts.
    const cited = await tx.approvalStep.findMany({ where: { committeeDecisionId: matter.id }, select: { id: true } });
    const fault = committeeCitationFault(
      { ...matter, amount: matter.amount?.toString() ?? null, committeeCode: matter.meeting.committee.code },
      step,
      { id: l.req.id, estimatedValue: l.req.estimatedValue.toString() },
      cited.length > 0 ? [matter.id] : [],
    );
    if (fault) return { ok: false, errors: { committeeDecisionId: CITATION_TEXT[fault] } };
    const record = recordOf(matter);
    const s = committeeStepFrom(record);
    if (s.decision === "PENDING") return { ok: false, errors: { committeeDecisionId: record ? "The committee deferred the matter. Cite it once it is decided." : "The committee has not decided the matter yet." } };
    if (s.decidedOn && storedDay(s.decidedOn) < storedDay(inst.openedAt)) {
      return { ok: false, errors: { committeeDecisionId: "The committee decided that matter before this route was opened." } };
    }
    const final = s.decision === "DONE" && inst.steps.every((x) => x.id === step.id || x.decision === "DONE");
    const gate = final ? await approvalGate(tx, l, inst.id) : null;
    if (gate?.kind === "refuse") return gate.state;
    if (gate?.kind === "return") {
      refresh(id);
      return gate.state;
    }
    const after = { decision: s.decision, decidedByName: s.citation!.committee, decidedOn: s.decidedOn, committeeDecisionId: matter.id, recordedAt: new Date() };
    const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING" }, data: after });
    if (done.count !== 1) return CHANGED;
    await audit(tx, l.org.id, "ApprovalStep", step.id, `${l.req.reference} · ${step.roleLabel}`, "UPDATE",
      diffFields({ decision: step.decision }, { decision: s.decision, committee: s.citation!.committee, sitting: s.citation!.meetingReference, decidedOn: s.decidedOn }));

    if (s.decision === "REJECTED") {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "REJECTED", closedAt: new Date() } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${l.req.reference} · approval route`, "UPDATE", diffFields({ status: inst.status }, { status: "REJECTED" }));
      // The not-approved outcome says where it goes: a loop to Draft, or closed. Where
      // the decision recorded none, it stays Rejected for the officer to decide.
      const to: RequisitionStatus = s.requisitionGoesTo ?? "REJECTED";
      await mustMove(tx, l, to);
      await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: to }),
        `Not carried by ${s.citation!.committee} at ${s.citation!.meetingReference}`);
      return { ok: true };
    }
    if (gate?.kind === "ok") await approve(tx, l, inst.id, gate);
    return { ok: true };
  });
}

/// Pending approval to Recalled, before the first decision (FR-APR-017).
export async function recallRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const inst = openInstance(l);
    const fault = transitionFault(l.req.status, "RECALLED", { today: l.org.today, anyStepDone: inst?.steps.some((s) => s.decision !== "PENDING") ?? false });
    if (fault) return { ok: false, message: transitionFaultText(fault) };
    if (inst) {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: "RECALLED", closedAt: new Date() } });
      await audit(tx, l.org.id, "ApprovalInstance", inst.id, `${l.req.reference} · approval route`, "UPDATE", diffFields({ status: inst.status }, { status: "RECALLED" }), reason);
    }
    await mustMove(tx, l, "RECALLED");
    await audit(tx, l.org.id, "Requisition", id, labelOf(l.req), "UPDATE", diffFields({ status: l.req.status }, { status: "RECALLED" }), reason);
    return { ok: true };
  });
}

/**
 * Justify a flagged split (FR-REQ-015, OD-8): the justification, who gave it and when.
 * Required before the final approval of a flagged requisition.
 */
export async function justifySplit(_prev: FormState, data: FormData): Promise<FormState> {
  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);
  const justification = r.text("overrideJustification", "Justification", { required: true, max: 4000 });
  const personId = r.text("personId", "Justified by", { required: true });
  const on = r.date("overriddenOn", "On", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inRequisition(id, async (tx, l): Promise<FormState> => {
    const inst = openInstance(l);
    const check = inst ? l.req.splitChecks.find((c) => c.id === inst.splitCheckId) : null;
    if (!check || check.state !== "FLAGGED") return { ok: false, message: "There is no open flag to justify." };
    if (check.overrideJustification) return { ok: false, message: "This flag has already been justified." };
    // Ruling Q3: a holder of the justifying office the policy names, never the requester
    // or an endorser. Unset blocks.
    const policy = await loadPolicy(l.org.id, tx);
    if (!policy.splitJustifyingRoleCode) return { ok: false, message: JUSTIFIER_TEXT.OFFICE_NOT_SET };
    const { lookups } = await loadLookups(l.org.id, tx);
    const person = lookups.people.find((p) => p.id === personId) ?? null;
    const [roster, delegations] = [await loadRoster(ORGANISATION_CODE, tx), await loadDelegations(ORGANISATION_CODE, tx)];
    const day = storedDay(on);
    const unitPath = pathTo(lookups.units, unitOf(l.req), on).reverse().map((u) => u.code);
    const holders = holdersFor(policy.splitJustifyingRoleCode, unitPath, roster, delegations, day);
    const faults = justifierFaults({
      roleCode: policy.splitJustifyingRoleCode,
      person,
      requesterId: l.req.requestingPersonId,
      endorserIds: l.req.endorsements.map((e) => e.personId),
      holderIds: [...holders.holderIds, ...holders.delegates.map((d) => d.personId)],
      on: day,
      today: l.org.today,
    });
    if (faults.length > 0) {
      const text = faults.map((f) => JUSTIFIER_TEXT[f]).join(" ");
      return faults.includes("FUTURE_DATE") && faults.length === 1 ? { ok: false, errors: { overriddenOn: text } } : faults[0] === "TIME_ZONE_UNSET" ? NO_ZONE : { ok: false, errors: { personId: text } };
    }
    const after = { overrideJustification: justification, overriddenByPersonId: personId, overriddenOn: on, overriddenAt: new Date() };
    await tx.requisitionSplitCheck.update({ where: { id: check.id }, data: after });
    await audit(tx, l.org.id, "RequisitionSplitCheck", check.id, `${l.req.reference} · possible split`, "UPDATE",
      diffFields({ overrideJustification: null }, { overrideJustification: justification, justifiedBy: person!.name, recordedOnBehalf: "not signed", overriddenOn: on }), justification);
    return { ok: true };
  });
}

const JUSTIFIER_TEXT: Record<JustifierFault, string> = {
  OFFICE_NOT_SET: "The office that may justify a possible split is not set, so no flag can be justified. Set it in Configuration, Requisition controls.",
  TIME_ZONE_UNSET: "Set the organisation's time zone first.",
  REQUESTER: "The requesting officer cannot justify a flag on their own requisition.",
  ENDORSER: "Someone who endorsed this requisition cannot justify its flag.",
  NOT_HOLDER: "That person does not hold the office that may justify a possible split, for this requisition's department, on that date.",
  INACTIVE: "That person is recorded as having left.",
  FUTURE_DATE: "The date cannot be after today.",
};

// ---------------------------------------------------------------- intake

function readTrail(data: FormData): ReceivedStep[] {
  try {
    const raw = JSON.parse(String(data.get("trail") ?? "[]"));
    if (!Array.isArray(raw)) return [];
    const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    return raw
      .map((x) => ({
        roleLabel: s(x?.roleLabel),
        // An act not chosen stays empty and is refused, never read as an approval.
        act: ((ACTS as readonly string[]).includes(s(x?.act)) ? s(x?.act) : "") as ReceivedStep["act"],
        actorName: s(x?.actorName),
        actorPersonId: s(x?.actorPersonId) || null,
        decidedOn: /^\d{4}-\d{2}-\d{2}$/.test(s(x?.decidedOn)) ? s(x?.decidedOn) : "",
      }))
      .filter((x) => x.roleLabel || x.actorName || x.decidedOn);
  } catch {
    return [];
  }
}

const CITATION_TEXT: Record<CitationFault, string> = {
  NOT_THIS_REQUISITION: "That matter was not tabled against this requisition.",
  NOT_A_REQUISITION_MATTER: "That matter was not tabled as a requisition matter.",
  OTHER_COMMITTEE: "That matter was decided by a different committee from the one this step names.",
  OTHER_ACT: "The committee was asked for a different act from the one this step needs.",
  OTHER_AMOUNT: "The matter was tabled for a different amount from this requisition's value.",
  ALREADY_CITED: "That decision already discharges another step. One decision discharges one step.",
};

const INTAKE_TEXT: Record<string, string> = {
  REQUIRED: "Required.",
  FUTURE_DATE: "Cannot be after today.",
  NOT_AN_AMOUNT: "Must be an amount, to at most two decimal places.",
  TRAIL_REQUIRED: "Enter the approval trail as the finance system shows it.",
  NOT_APPROVED: "A received requisition arrives approved: the last step on the trail must be an approval.",
  MALFORMED: "Does not match the configured format.",
  BAD_PATTERN: "The configured format cannot be read.",
};

/**
 * Receive a requisition typed in from the finance system (INT-01, ADR 0003). It
 * arrives approved; its figures and trail are stored as typed and never re-routed.
 * No budget commitment is written: the finance system holds its own (a build decision).
 */
export async function receiveRequisition(_prev: FormState, data: FormData): Promise<FormState> {
  const org = await requisitionOrg();
  if (!org) return NO_ORG;
  const r = new FormReader(data);
  const draft = readDraft(r, data);
  const s = (k: string) => String(data.get(k) ?? "").trim();
  const payload: ExternalRequisition = {
    ...draft,
    erpRequisitionNo: s("erpRequisitionNo"),
    erpNoteNo: s("erpNoteNo"),
    budget: {
      asAt: s("budgetAsAt"),
      actualBudget: s("actualBudget").replace(/,/g, "") || null,
      balanceAsAt: s("balanceAsAt").replace(/,/g, ""),
      approvedAccount: s("approvedAccount").replace(/,/g, "") || null,
      projectedBalance: s("projectedBalance").replace(/,/g, "") || null,
    },
    trail: readTrail(data),
  };
  if (!safeLines(draft.lines)) r.reject("lines", "Every line needs an amount, and quantities must be numbers.");
  if (!org.today) return NO_ZONE;
  const { lookups, formats } = await loadLookups(org.id);
  const lineMsgs: string[] = [];
  for (const f of intakeFaults(payload, lookups, formats, dayToDate(org.today), org.today)) {
    const key = f.field === "budget.asAt" ? "budgetAsAt" : f.field.startsWith("budget.") ? f.field.slice(7) : f.field.startsWith("trail") ? "trail" : f.field.startsWith("lines") ? "lines" : f.field;
    const text = INTAKE_TEXT[f.message] ?? fieldFaultText({ field: f.field, code: f.message } as never);
    if (key === "lines") lineMsgs.push(text);
    else if (!r.errors[key]) r.reject(key, text);
  }
  if (lineMsgs.length > 0 && !r.errors.lines) r.reject("lines", [...new Set(lineMsgs)].join(" "));
  for (const [field, value] of [["erpRequisitionNo", payload.erpRequisitionNo], ["erpNoteNo", payload.erpNoteNo]] as const) {
    if (!value || r.errors[field]) continue;
    const clash = await db.requisition.findFirst({ where: { organisationId: org.id, [field]: value }, select: { reference: true } });
    if (clash) r.reject(field, `Already recorded against ${clash.reference}.`);
  }
  if (r.failed) return { ok: false, errors: r.errors, message: "Nothing was saved. Correct the fields marked below." };

  const route = lookups.fundingRoutes.find((x) => x.code === payload.fundingRouteCode) ?? null;
  const gate = fundingGate(route, { externalAuthorityRef: null }, dayToDate(org.today));
  // Ruling BD-10: on the portal ledger, a received commitment is posted, or refused.
  const controls = await loadControls(org.id);
  const routeRow = route ? await db.fundingRoute.findFirst({ where: { organisationId: org.id, code: route.code }, select: { approvalCommitsBudget: true } }) : null;
  const commitment = intakeCommitment(controls.budgetCheckSource, routeRow?.approvalCommitsBudget ?? null, !!payload.budgetCodeId);
  if (commitment === "ROUTE_NOT_SET") {
    return { ok: false, errors: { fundingRouteCode: "Whether approval on this funding route commits the organisation's budget is not set, so the commitment cannot be posted to the portal ledger. Set it on the route under Reference data." } };
  }
  if (commitment === "NO_BUDGET_CODE") {
    return { ok: false, errors: { budgetCodeId: "The portal ledger is the budget source, so the commitment this approval made must be posted against a budget code. Choose it." } };
  }
  if (commitment === "POST") {
    const periods = await db.budgetPeriod.findMany({ where: { organisationId: org.id } });
    const closed = postingRefusal(periods, dayToDate(org.today));
    if (closed) return { ok: false, message: `The commitment would be posted today, and the budget period ${closed.nameEn} ${closed.year} is closed.` };
  }
  let result;
  try {
    result = await manualIntake.receive(
      { organisationId: org.id, today: org.today, postCommitment: commitment === "POST", funding: gate.posture ? { supersedesAuthority: gate.supersedesAuthority === true, sourcingPermitted: gate.sourcingPermitted === true, posture: gate.posture } : null },
      payload,
    );
  } catch (e) {
    if (e instanceof NumberingError) {
      return { ok: false, message: "No valid numbering series for requisitions is configured. Add the series keyed “requisition” under Configuration, Numbering." };
    }
    throw e;
  }
  if (!result.ok) return { ok: false, message: result.message };
  refresh(result.id);
  redirect(`/requisitions/${result.id}`);
}
