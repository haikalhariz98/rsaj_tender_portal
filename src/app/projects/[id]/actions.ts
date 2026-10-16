"use server";

import { actStatusFault, actStatusText, type ContractAct } from "@/lib/contract/act-status";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { sulitWriteRefusal } from "@/lib/auth/sulit-store";
import { diffFields, snapshotFields, type FieldChange } from "@/lib/audit/diff";
import { custodyItemLabel, formationCheckLabel, reconciliationLabel } from "@/lib/audit/entity-labels";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { loadIssue } from "@/lib/authority/load";
import { methodKeyOf } from "@/lib/supervision/load";
import { assignmentToMove, resolveSo, soOnCorrectedDate, type SoResolution } from "@/lib/supervision/so";
import { applyTerm, AWARD_TERM_WORDS, AWARD_TERMS, awardCorrectionFaults, correctedColumns, TERM_FIELD, termSource, termText, type AwardTermColumns, type TermInput } from "@/lib/contract/award-correction";
import { applyEntered, baselineFaults, buildBaseline, changedFields, derive, ENTERED_GROUPS, enteredFaults, latestVersion, type BaselineValues, type EnteredGroup, type EnteredProvenance, type EnteredValues } from "@/lib/contract/baseline";
import { correctableFaults, groupChange } from "@/lib/contract/baseline-entry";
import { contractDateOf, dateCorrectionFaults } from "@/lib/contract/contract-date";
import { executedSnapshot, frozenSigningDays } from "@/lib/contract/executed-snapshot";
import { acknowledgeFaults, despatchFaults, issueFaults, nextCopyNo, recallFaults, reissueFaults, type CopyFacts } from "@/lib/contract/copies";
import { custodyState, movementFaults, registerFaults } from "@/lib/contract/custody";
import { refusalText } from "@/lib/contract/fault-text";
import { employerSigning, employerSigningRefusal, EMPLOYER_SIGNING_NOT_SET, officesWords } from "@/lib/contract/employer-signing";
import { amendmentFaults, arithmeticVariance, completeFaults, type RateFacts } from "@/lib/contract/formation";
import { baselineBlocks, currentBaseline, formationOf, reviewsOf, signingFacts } from "@/lib/contract/judge";
import { decideFaults, nextIteration, openReview, statusAfter, submitFaults } from "@/lib/contract/legal";
import { baselineInputsOf, baselineRows, contractGate, frozenInputsOf, inputsToJson, liveOf, loadContractConfig, preparationSettings, rowOf, sectionRows, valuesOf } from "@/lib/contract/load";
import { formationSnapshot, readFormationSnapshot, startFaults } from "@/lib/contract/preparation";
import { contractLabel, withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import { briefingFaults, contractorSignFaults, stampFaults } from "@/lib/contract/sign";
import { contractTransition, isExecuted } from "@/lib/contract/status";
import type { ContractStatus, Finding, FormationCheckKind, LadKind, Provenance } from "@/lib/contract/types";
import { confirmFaults, correctionFaults, draftFaults } from "@/lib/contract/versions";
import { dayOf, dayToDate, storedDay } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { maskIc } from "@/lib/award/mask";
import { loadRoster } from "@/lib/people/load";
import { officesHeldBy } from "@/lib/people/roster";
import { amountOf, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { stageRecordEdit } from "@/app/_auth/stage";
import { currentAmbient } from "@/lib/ambient/ambient-tx";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * Forming, executing and recording the contract (6.12, FR-CON-003–014).
 *
 * Every act is reachable by a direct POST, so each one reads the server's clock once on entry
 * (truncated to the second), then locks the requisition, the exercise, the award and the contract in
 * the canonical order (`withLockedContract`), then any domain row it changes, re-runs the pure rule on
 * the locked rows, writes, and audits in the same transaction. A refusal saves nothing and says what
 * refuses it. Who is signed in is asked first and named on every audit row, and every act is attributed in the same transaction (`beginAct`, Phase 2b): the signed-in person's own, or, from paper, recorded for another and not signed. A cancelled contract refuses
 * every act.
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const CHANGED: FormState = { ok: false, message: "The contract changed while this was being saved. Reload and try again." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: it is kept as it was." };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

interface Ctx {
  tx: Tx;
  actor: AuditActor;
  l: LoadedContract;
  /// The server's instant, read once on entry, to the second.
  now: Date;
  /// The organisation's day of that instant.
  today: string;
  label: string;
}

/// Lock, refuse a cancelled contract or an unset zone, then run the act.
async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, act: ContractAct, fn: (c: Ctx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  let awardId: string | undefined;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      awardId = l.award.id;
      // ADR 0031 (run 1a): the one act × status table, CANCELLED first (its words as before), under the contract's lock.
      const refused = actStatusFault(act, l.contract.status as ContractStatus);
      if (refused) return refused.code === "CONTRACT_CANCELLED" ? CANCELLED : { ok: false, message: actStatusText(refused) };
      const today = dayOf(now, l.org.timeZone);
      if (!today) return NO_ZONE;
      return fn({ tx, actor, l, now, today, label: contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } }) });
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath("/", "layout"); // GN-04 / AC-13
    if (awardId) revalidatePath(`/awards/${awardId}`);
  }
  return result ?? GONE;
}

async function audit(c: Ctx, entity: string, entityId: string, suffix: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId, entityLabel: suffix ? `${c.label} · ${suffix}` : c.label, reason }, action, changes);
}

const refuse = (lead: string, fs: readonly Finding[]): FormState => ({ ok: false, message: refusalText(lead, fs) });

/// Move the contract from the status read under the lock, or roll back.
async function moveTo(c: Ctx, to: ContractStatus, extra: Prisma.ContractUpdateManyMutationInput = {}) {
  const from = c.l.contract.status as ContractStatus;
  const t = contractTransition(from, to);
  if (t) throw new Refusal({ ok: false, message: "The contract cannot move there from where it stands." });
  const moved = await c.tx.contract.updateMany({ where: { id: c.l.contract.id, status: from }, data: { status: to, ...extra } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
}

async function personOf(c: Ctx, id: string | null) {
  if (!id) return null;
  return c.tx.person.findFirst({ where: { id, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
}

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const formationOpen = (s: string) => s === "IN_PREPARATION" || s === "RETURNED_FOR_AMENDMENT";
const NOT_OPEN: FormState = { ok: false, message: "The Contract Document changes only while it is being prepared or has come back from the legal office." };
const idOf = (data: FormData) => String(data.get("id") ?? "");

// ------------------------------------------------------------------ preparation

/**
 * Start preparing the contract: freeze what formation is judged under (ADR 0021 §5), copy the basis's
 * document parts into the assembly, open the basis's checks, and build the baseline's draft.
 */
export async function startPreparation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const { l, tx } = c;
    const cfg = await loadContractConfig(l.org.id, tx);
    // What is in force on the organisation's day: a row retired from a later day is still taken (R-6).
    const { basis, parts, recipients, office, legalOfficeKnown } = preparationSettings(cfg, l.ex.contractBasisCode, c.today);
    const p = cfg.policy;
    const faults = startFaults({
      status: l.contract.status as ContractStatus,
      awardStatus: l.award.status,
      today: c.today,
      basis: { code: l.ex.contractBasisCode, name: basis?.nameEn ?? null, requiresBq: basis?.requiresBq ?? null },
      parts: parts.length,
      policy: { legalOfficeCode: p?.legalOfficeCode ?? null, legalOfficeKnown, signatoryCond: p?.signatoryCond ?? null, controlledCopyStampEn: p?.controlledCopyStampEn ?? null },
      recipients: recipients.length,
    });
    if (faults.length) return refuse("Preparation not started:", faults);
    const snap = formationSnapshot({
      startedOn: c.today,
      policy: { legalOfficeCode: p!.legalOfficeCode!, legalOfficeLabel: office!.nameEn, frontLoadingRatio: p!.frontLoadingRatio == null ? null : p!.frontLoadingRatio.toString(), stampEn: p!.controlledCopyStampEn!, stampMs: p!.controlledCopyStampMs, signatoryCond: p!.signatoryCond!, provenance: (p!.provenance as Provenance | null) ?? null },
      basis: { code: basis!.code, name: basis!.nameEn, requiresBq: basis!.requiresBq! },
      recipients: recipients.map((r) => ({ id: r.id, name: r.nameEn, nameMs: r.nameMs, copyForm: r.copyForm, mandatory: r.mandatory, onlyWithConsultingEngineer: r.onlyWithConsultingEngineer, provenance: r.provenance as Provenance })),
    });
    await moveTo(c, "IN_PREPARATION", { preparationStartedAt: now, formationSnapshot: snap as unknown as Prisma.InputJsonValue });
    for (const part of parts) {
      await tx.contractAssemblyPart.create({ data: { organisationId: l.org.id, contractId: l.contract.id, partCode: part.code, labelSnapshot: part.labelEn, labelMsSnapshot: part.labelMs, printedNumber: part.printedNumber, sortOrder: part.sortOrder } });
    }
    for (const kind of snap.checks) {
      await tx.formationCheck.create({ data: { organisationId: l.org.id, contractId: l.contract.id, kind, ratioSnapshot: kind === "FRONT_LOADING" ? snap.policy.frontLoadingRatio : null } });
    }
    const inputs = await baselineInputsOf(l, tx);
    const draft = buildBaseline(inputs);
    const b = await tx.contractBaseline.create({ data: { organisationId: l.org.id, contractId: l.contract.id, ...rowOf(draft), entered: {}, snapshot: { inputs: inputsToJson(inputs), builtOn: c.today } } });
    for (const s of sectionRows(draft, l.org.id)) await tx.contractSection.create({ data: { ...s, baselineId: b.id } });
    await audit(c, "Contract", l.contract.id, "", "UPDATE", diffFields({ status: l.contract.status }, { status: "IN_PREPARATION", legalOffice: snap.policy.legalOfficeLabel, frontLoadingRatio: snap.policy.frontLoadingRatio ?? "not set: the officer's judgement", basis: snap.basis.name, parts: parts.length, checks: snap.checks.length, copyRecipients: recipients.length }));
    await audit(c, "ContractBaseline", b.id, "baseline draft", "CREATE", diffFields(null, { built: c.today, appendix: inputs.appendix ? `pack version ${inputs.appendix.packVersion}` : "none frozen", bill: inputs.bq ? `version ${inputs.bq.versionNo}` : "none pinned" }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ assembly

/// Mark a part cancelled by an accepted alternative proposal (stating what it cancels), or restore it.
export async function setAssemblyPart(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const partId = r.text("partId", "Part", { required: true });
  const state = r.choice("state", "State", ["READY", "CANCELLED_BY_ALTERNATIVE"] as const, { required: true });
  const statement = r.text("cancelledStatement", "What it cancels", { max: 4000 });
  if (state === "CANCELLED_BY_ALTERNATIVE" && !statement) r.reject("cancelledStatement", "State what the alternative proposal cancels.");
  if (r.failed || !state) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    if (!formationOpen(c.l.contract.status)) return NOT_OPEN;
    const part = c.l.contract.assemblyParts.find((p) => p.id === partId);
    if (!part) return { ok: false, message: "That part is not in this contract's assembly." };
    const after = { state, cancelledStatement: state === "READY" ? "" : statement };
    await c.tx.contractAssemblyPart.update({ where: { id: part.id, organisationId: actor.organisationId }, data: after });
    await audit(c, "ContractAssemblyPart", part.id, part.labelSnapshot, "UPDATE", diffFields({ state: part.state, cancelledStatement: part.cancelledStatement }, after));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ reconciliation

export async function recordReconciliation(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const comparison = r.choice("comparison", "Comparison", ["TENDER_DOCUMENT", "TENDER_TABLE_DOCUMENT", "DRAWINGS"] as const, { required: true });
  const outcome = r.choice("outcome", "Outcome", ["MATCHES", "AMENDED"] as const, { required: true });
  const checkedOn = r.date("checkedOn", "Checked on", { required: true });
  const note = r.text("note", "Note", { max: 4000 });
  if (r.failed || !comparison || !outcome || !checkedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ContractReconciliation.checkedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    if (!formationOpen(c.l.contract.status)) return NOT_OPEN;
    if (storedDay(checkedOn) > c.today) return { ok: false, errors: { checkedOn: "Not after today." } };
    const person = await personOf(c, personId);
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    // The tender-stage addenda as they stand: each is listed on the record (FR-CON-004).
    const addenda = await c.tx.addendum.findMany({ where: { window: { exerciseId: c.l.ex.id }, status: "ISSUED" }, orderBy: { number: "asc" }, select: { number: true, title: true, issuedOn: true } });
    const snapshot = addenda.map((a) => ({ number: a.number, title: a.title, issuedOn: day(a.issuedOn) }));
    const existing = c.l.contract.reconciliations.find((x) => x.comparison === comparison);
    if (existing && existing.amendments.length > 0 && outcome === "MATCHES") return { ok: false, errors: { outcome: "Amendments are recorded under this comparison, so it is not identical." } };
    const row = existing
      ? await c.tx.contractReconciliation.update({ where: { id: existing.id, organisationId: actor.organisationId }, data: { outcome, checkedByPersonId: person.id, checkedOn, note, addendaSnapshot: snapshot, recordedAt: now } })
      : await c.tx.contractReconciliation.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, comparison, outcome, checkedByPersonId: person.id, checkedOn, note, addendaSnapshot: snapshot, recordedAt: now } });
    await audit(c, "ContractReconciliation", row.id, reconciliationLabel(comparison), existing ? "UPDATE" : "CREATE", diffFields(existing ? { outcome: existing.outcome } : null, { outcome, checkedBy: person.name, checkedOn, addendaListed: snapshot.length }));
    await act.write(c.tx, row.id);
    return { ok: true };
  });
}

/// An amendment to recorded information, signed by the contractor's signatory (named) and by the preparing officer (signed in, or recorded from paper).
export async function addAmendment(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("SIGNATURE");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const reconciliationId = r.text("reconciliationId", "Comparison", { required: true });
  const description = r.text("description", "What it amends", { required: true, max: 4000 });
  const contractorSignatoryName = r.text("contractorSignatoryName", "Signed for the contractor by", { required: true, max: 240 });
  const contractorSignedOn = r.date("contractorSignedOn", "Contractor signed on", { required: true });
  r.date("officerSignedOn", "Officer signed on");
  if (r.failed || !contractorSignedOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "ReconciliationAmendment.officer", { personField: "officerPersonId", dateField: "officerSignedOn", document: { entity: "ContractReconciliation", id: reconciliationId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const officerPersonId = act.subjectPersonId;
  const officerSignedOn = dayToDate(act.day!);
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    if (!formationOpen(c.l.contract.status)) return NOT_OPEN;
    const rec = c.l.contract.reconciliations.find((x) => x.id === reconciliationId);
    if (!rec) return { ok: false, message: "Record the comparison first." };
    if (rec.outcome !== "AMENDED") return { ok: false, message: "That comparison is recorded as identical: record it as amended first." };
    const fs = amendmentFaults({ description, contractorSignatoryName, contractorSignedOn: storedDay(contractorSignedOn), officerSignedOn: storedDay(officerSignedOn) }, c.today);
    if (fs.length) return refuse("Not recorded:", fs);
    const officer = await personOf(c, officerPersonId);
    if (!officer) return { ok: false, errors: { officerPersonId: "Choose someone on record and active." } };
    // NFR-SIG-001 (the product owner's ruling of 2026-10-07): the capacity the employer's signature was made in. Which office signs is the customer's setting; unset, the amendment is still
    // recorded, with the offices the signer (the subject, never the officer keying a paper record) held on the day, and the screen says it is not set.
    const roster = await loadRoster(c.l.org.code, c.tx);
    const heldOn = officesHeldBy(roster, officer.id, officerSignedOn).map((o) => ({ code: o.code, name: o.nameEn }));
    const policy = await c.tx.contractPolicy.findUnique({ where: { organisationId: c.l.org.id }, select: { employerSigningRoleCode: true } });
    const capacity = employerSigning({ configuredCode: policy?.employerSigningRoleCode ?? null, held: heldOn });
    if (capacity.state === "NOT_HELD") {
      const named = await c.tx.authorityRole.findFirst({ where: { organisationId: c.l.org.id, code: capacity.configured }, select: { nameEn: true } });
      return { ok: false, message: employerSigningRefusal(capacity, named?.nameEn ?? null, officer.name).en };
    }
    const row = await c.tx.reconciliationAmendment.create({ data: { organisationId: c.l.org.id, reconciliationId: rec.id, description, contractorSignatoryName, contractorSignedOn, officerPersonId: officer.id, officerSignedOn, recordedAt: now } });
    await audit(c, "ReconciliationAmendment", row.id, "reconciliation amendment", "CREATE", diffFields(null, { description, contractorSignatory: contractorSignatoryName, contractorSignedOn, officer: officer.name, officerSignedOn, signedForTheEmployerAs: capacity.state === "HELD" ? officesWords(capacity.held.filter((o) => o.code === capacity.roleCode)) : `${EMPLOYER_SIGNING_NOT_SET}: held ${officesWords(capacity.held)}`, recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null }));
    await act.write(c.tx, row.id, { document: { entity: "ContractReconciliation", id: rec.id }, roleCode: capacity.roleCode ?? undefined });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the checks

function openCheck(c: Ctx, checkId: string) {
  const k = c.l.contract.checks.find((x) => x.id === checkId);
  if (!k) throw new Refusal({ ok: false, message: "That check is not on this contract." });
  if (!formationOpen(c.l.contract.status)) throw new Refusal(NOT_OPEN);
  if (k.completedOn) throw new Refusal({ ok: false, message: "The check is recorded complete: its lines no longer change." });
  return k;
}

/// An arithmetical correction line (item, tendered, corrected, reason).
export async function addCorrection(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const checkId = r.text("checkId", "Check", { required: true });
  const itemRef = r.text("itemRef", "Item", { required: true, max: 60 });
  const description = r.text("description", "Description", { max: 400 });
  const tendered = r.money("tendered", "As tendered", { required: true });
  const corrected = r.money("corrected", "Corrected", { required: true });
  const reason = r.text("reason", "Why", { required: true, max: 2000 });
  if (r.failed || !tendered || !corrected) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = openCheck(c, checkId);
    if (k.kind !== "ARITHMETIC") return { ok: false, message: "Corrections are recorded on the arithmetic check." };
    // Phase 3b: the priced working of a contract is SULIT; whoever may not read it may not add to it, and is told why (logged in this transaction).
    const closed = await sulitWriteRefusal(c.tx, actor, { scope: "contract", entity: "Contract", id: c.l.contract.id, label: c.l.contract.number }, ["tenderedLineAmount", "correctedLineAmount"]);
    if (closed) return { ok: false, message: `Nothing was saved: this is SULIT and is closed to you. ${closed}` };

    const row = await c.tx.arithmeticCorrection.create({ data: { organisationId: c.l.org.id, checkId: k.id, itemRef, description, tendered: senToDecimalString(parseSen(tendered)), corrected: senToDecimalString(parseSen(corrected)), reason, recordedAt: now } });
    // The priced figures are SULIT (6.8's correctedPrice precedent): kept under their registered keys, chipped in History, withheld from the export.
    await audit(c, "ArithmeticCorrection", row.id, `correction ${itemRef}`, "CREATE", diffFields(null, { itemRef, tenderedLineAmount: senToDecimalString(parseSen(tendered)), correctedLineAmount: senToDecimalString(parseSen(corrected)), reason }));
    return { ok: true };
  });
}

/// A tendered rate set against the estimate's (FR-CON-005 b). The estimate rate is SULIT.
export async function addRate(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const checkId = r.text("checkId", "Check", { required: true });
  const itemRef = r.text("itemRef", "Item", { required: true, max: 60 });
  const description = r.text("description", "Description", { max: 400 });
  const provisional = r.bool("provisional");
  const tenderedRate = r.money("tenderedRate", "Tendered rate", { required: true });
  const estimateRate = r.money("estimateRate", "Estimate rate", { required: true });
  if (r.failed || !tenderedRate || !estimateRate) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = openCheck(c, checkId);
    if (k.kind !== "FRONT_LOADING") return { ok: false, message: "Rates are compared on the front-loading check." };
    // Phase 3b: the priced working of a contract is SULIT; whoever may not read it may not add to it, and is told why (logged in this transaction).
    const closed = await sulitWriteRefusal(c.tx, actor, { scope: "contract", entity: "Contract", id: c.l.contract.id, label: c.l.contract.number }, ["estimateRate"]);
    if (closed) return { ok: false, message: `Nothing was saved: this is SULIT and is closed to you. ${closed}` };

    const row = await c.tx.rateComparison.create({ data: { organisationId: c.l.org.id, checkId: k.id, itemRef, description, provisional, tenderedRate: senToDecimalString(parseSen(tenderedRate)), estimateRate: senToDecimalString(parseSen(estimateRate)), recordedAt: now } });
    // The estimate rate is SULIT: it is kept out of the trail, which is exported.
    await audit(c, "RateComparison", row.id, `rate ${itemRef}`, "CREATE", diffFields(null, { itemRef, provisional, tenderedRate: senToDecimalString(parseSen(tenderedRate)) }));
    return { ok: true };
  });
}

/// Take a line off a check not yet complete (a mistake), with a reason; the trail keeps it.
export async function removeCheckLine(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const checkId = r.text("checkId", "Check", { required: true });
  const lineId = r.text("lineId", "Line", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = openCheck(c, checkId);
    const correction = k.corrections.find((x) => x.id === lineId);
    const rate = k.rates.find((x) => x.id === lineId);
    // Phase 3b (review): taking a line off changes the check's SULIT working (a correction's figures, the variance; a rate's comparison), so it is asked of the officer like adding one is.
    if (correction || rate) {
      const closed = await sulitWriteRefusal(c.tx, actor, { scope: "contract", entity: "Contract", id: c.l.contract.id, label: c.l.contract.number }, correction ? ["tenderedLineAmount", "correctedLineAmount"] : ["estimateRate"]);
      if (closed) return { ok: false, message: `Nothing was removed: this is SULIT and is closed to you. ${closed}` };
    }
    if (correction) {
      await c.tx.arithmeticCorrection.delete({ where: { id: correction.id, organisationId: actor.organisationId } });
      await audit(c, "ArithmeticCorrection", correction.id, `correction ${correction.itemRef}`, "DELETE", snapshotFields({ itemRef: correction.itemRef, tenderedLineAmount: correction.tendered.toString(), correctedLineAmount: correction.corrected.toString() }), reason);
    } else if (rate) {
      await c.tx.rateComparison.delete({ where: { id: rate.id, organisationId: actor.organisationId } });
      await audit(c, "RateComparison", rate.id, `rate ${rate.itemRef}`, "DELETE", snapshotFields({ itemRef: rate.itemRef, tenderedRate: rate.tenderedRate.toString() }), reason);
    } else return { ok: false, message: "That line is not on this check." };
    return { ok: true };
  });
}

export async function completeCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const checkId = r.text("checkId", "Check", { required: true });
  const on = r.date("completedOn", "Completed on", { required: true });
  const note = r.text("note", "Note", { max: 4000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "FormationCheck.completedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract.checks.find((x) => x.id === checkId);
    if (!k) return { ok: false, message: "That check is not on this contract." };
    if (!formationOpen(c.l.contract.status)) return NOT_OPEN;
    const form = formationOf(c.l.contract);
    const rates: RateFacts[] = k.rates.map((x) => ({ itemRef: x.itemRef, tenderedRate: senFromDecimal(x.tenderedRate), estimateRate: senFromDecimal(x.estimateRate), provisional: x.provisional }));
    const fs = completeFaults({ kind: k.kind as FormationCheckKind, applicable: form.applicable, completedOn: day(k.completedOn), on: storedDay(on), today: c.today, preparationOn: form.snap?.startedOn ?? c.today, note, rates, ratio: k.ratioSnapshot == null ? null : k.ratioSnapshot.toString() });
    if (fs.length) return refuse("Not recorded complete:", fs);
    const person = await personOf(c, personId);
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const done = await c.tx.formationCheck.updateMany({ where: { id: k.id, completedOn: null }, data: { completedByPersonId: person.id, completedOn: on, completedAt: now, note } });
    if (done.count !== 1) throw new Refusal(CHANGED);
    const variance = k.kind === "ARITHMETIC" ? arithmeticVariance(k.corrections.map((x) => ({ tendered: senFromDecimal(x.tendered), corrected: senFromDecimal(x.corrected) }))) : null;
    await audit(c, "FormationCheck", k.id, formationCheckLabel(k.kind as FormationCheckKind), "UPDATE", diffFields({ completedOn: null }, { completedOn: on, completedBy: person.name, lines: k.corrections.length + k.rates.length, arithmeticVarianceAmount: variance == null ? null : senToDecimalString(variance) }));
    await act.write(c.tx, k.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ legal review

/// Send the contract to the legal office: a new iteration pinning the documents live to send.
export async function submitLegal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "LegalReview.submittedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const form = formationOf(k);
    const docs = liveOf(k, "LEGAL_SUBMISSION");
    const reviews = reviewsOf(k);
    const fs = submitFaults({ status: k.status as ContractStatus, officeCode: form.snap?.policy.legalOfficeCode ?? null, submissionDocuments: docs.length, formationFaults: form.faults.length, reviews });
    if (fs.length) return refuse("Not sent:", fs);
    const person = await personOf(c, personId);
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const iteration = nextIteration(reviews);
    const pinned = docs.map((a) => ({ versionId: a.version.id, documentId: a.version.documentId, title: a.version.document.title, versionNo: a.version.versionNo, sha256: a.version.sha256 }));
    const row = await c.tx.legalReview.create({ data: { organisationId: c.l.org.id, contractId: k.id, iteration, officeCode: form.snap!.policy.legalOfficeCode, officeLabel: form.snap!.policy.legalOfficeLabel, submittedAt: now, submittedOn: dayToDate(c.today), submittedByPersonId: person.id, pinnedVersions: pinned } });
    await moveTo(c, "PENDING_LEGAL_ENDORSEMENT");
    await audit(c, "LegalReview", row.id, `legal review ${iteration}`, "CREATE", diffFields(null, { iteration, office: form.snap!.policy.legalOfficeLabel, sentBy: person.name, documents: pinned.map((p) => `${p.title} v${p.versionNo}`).join("; ") }));
    await act.write(c.tx, row.id);
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ status: k.status }, { status: "PENDING_LEGAL_ENDORSEMENT" }));
    return { ok: true };
  });
}

/// The legal office's decision on the open iteration: endorsed, or returned with comments.
export async function decideLegal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const decision = r.choice("decision", "Decision", ["ENDORSED", "RETURNED"] as const, { required: true });
  const decidedOn = r.date("decidedOn", "Decided on", { required: true });
  const comments = r.text("comments", "Comments", { max: 8000 });
  if (r.failed || !decision || !decidedOn) return { ok: false, errors: r.errors };
  // The legal office's decision is its reviewer's own, signed in, or recorded for them from the office's paper.
  const begun = await beginAct(actor, data, "LegalReview.reviewer", { personField: "reviewerPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const reviewerId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const reviews = reviewsOf(k);
    const open = openReview(reviews);
    if (k.status !== "PENDING_LEGAL_ENDORSEMENT") return { ok: false, message: "The contract is not with the legal office." };
    const commentsAttached = open ? k.attachments.some((a) => a.purpose === "LEGAL_COMMENTS" && isLive(a) && a.attachedAt >= open.submittedAt) : false;
    const fs = decideFaults({ open, decision, comments, commentsAttached, decidedOn: storedDay(decidedOn), today: c.today });
    if (fs.length) return refuse("Not recorded:", fs);
    const reviewer = await personOf(c, reviewerId);
    if (!reviewer) return { ok: false, errors: { reviewerPersonId: "Choose someone on record and active." } };
    const done = await c.tx.legalReview.updateMany({ where: { id: open!.id, decision: null }, data: { decision, decidedOn, decidedAt: now, reviewerPersonId: reviewer.id, comments } });
    if (done.count !== 1) throw new Refusal(CHANGED);
    const to = statusAfter(decision);
    await moveTo(c, to);
    await audit(c, "LegalReview", open!.id, `legal review ${open!.iteration}`, "UPDATE", diffFields({ decision: null }, { decision, decidedOn, decidedBy: reviewer.name, comments: comments || (commentsAttached ? "attached" : ""), recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null }));
    await act.write(c.tx, open!.id);
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ status: k.status }, { status: to }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ workmen's compensation (BD-20 carry)

/// The recorded check of uncovered wages on a verified WC policy. Recorded, not judged (D4).
export async function recordWcCheck(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const NOT_AFTER_TODAY: FormState = { ok: false, errors: { checkedOn: "Not after today." } };
  const NOT_BEFORE_VERIFIED: FormState = { ok: false, errors: { checkedOn: "Not before the policy was verified." } };
  const WHO: FormState = { ok: false, errors: { personId: "Choose someone on record and active." } };
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const policyId = r.text("policyId", "Policy", { required: true });
  const on = r.date("checkedOn", "Checked on", { required: true });
  const wages = r.money("declaredWages", "Declared uncovered wages", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !on || !wages) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "InsurancePolicy.wcCheckedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    if (isExecuted(k.status as ContractStatus)) return { ok: false, message: "The contract is executed: the check stands as recorded before signature." };
    if (c.l.award.wcBasis !== "UNCOVERED_WAGES") return { ok: false, message: "Workmen's compensation on this award is not on uncovered wages, so there is no wages check to record." };
    // The domain row last, after the contract (the canonical order).
    await c.tx.$queryRaw`SELECT id FROM "InsurancePolicy" WHERE id = ${policyId} FOR UPDATE`;
    const p = await c.tx.insurancePolicy.findFirst({ where: { id: policyId, contractId: k.id, contract: { organisationId: actor.organisationId } } });
    if (!p || p.kind !== "WORKMENS_COMPENSATION") return { ok: false, message: "That is not a workmen's compensation policy on this contract." };
    if (p.status !== "VERIFIED") return { ok: false, message: "Verify the policy on the award's Securities tab first." };
    if (p.wcCheckedOn) return { ok: false, message: "The wages check is already recorded on this policy." };
    if (storedDay(on) > c.today) return NOT_AFTER_TODAY;
    if (p.verifiedOn && storedDay(on) < storedDay(p.verifiedOn)) return NOT_BEFORE_VERIFIED;
    const person = await personOf(c, personId);
    if (!person) return WHO;
    const after = { wcCheckedOn: on, wcCheckedByPersonId: person.id, wcDeclaredUncoveredWages: senToDecimalString(parseSen(wages)), wcCheckNote: note, wcCheckRecordedAt: now };
    await c.tx.insurancePolicy.update({ where: { id: p.id, contract: { organisationId: actor.organisationId } }, data: after });
    await audit(c, "InsurancePolicy", p.id, "workmen's compensation wages check", "UPDATE", diffFields({ wcCheckedOn: null }, { wcCheckedOn: on, checkedBy: person.name, declaredUncoveredWages: after.wcDeclaredUncoveredWages, sumInsured: p.sumInsured.toString(), judged: "no: basis not set (D4)" }));
    await act.write(c.tx, p.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ signing

/// The contractor's signature and its witness (FR-CON-007): the contractor's own people, named and not signed in the portal (they have no account here).
export async function recordContractorSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const name = r.text("name", "Signatory's full name", { required: true, max: 240 });
  const ic = r.text("icNumber", "Signatory's identity-card number", { required: true, max: 20 });
  const capacity = r.text("capacity", "Capacity", { max: 240 });
  const signedOn = r.date("signedOn", "Signed on", { required: true });
  const witnessName = r.text("witnessName", "Witness's full name", { required: true, max: 240 });
  const witnessIc = r.text("witnessIcNumber", "Witness's identity-card number", { required: true, max: 20 });
  if (r.failed || !signedOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const gate = await contractGate(c.l, c.tx);
    const end = reviewsOf(k).filter((x) => x.decision === "ENDORSED").sort((a, b) => b.iteration - a.iteration)[0];
    const fs = contractorSignFaults({ status: k.status as ContractStatus, gate, resolutionLive: liveOf(k, "COMPANY_RESOLUTION").length > 0, alreadySigned: k.signatures.some((s) => s.party === "CONTRACTOR"), signatory: { name, icNumber: ic }, witness: { name: witnessName, icNumber: witnessIc }, signedOn: storedDay(signedOn), today: c.today, endorsedOn: end?.decidedOn ?? null });
    if (fs.length) return refuse("Not recorded:", fs);
    const s1 = await c.tx.contractSignature.create({ data: { organisationId: c.l.org.id, contractId: k.id, party: "CONTRACTOR", name, icNumber: ic, capacity, signedOn, recordedAt: now } });
    const s2 = await c.tx.contractSignature.create({ data: { organisationId: c.l.org.id, contractId: k.id, party: "WITNESS", name: witnessName, icNumber: witnessIc, signedOn, recordedAt: now } });
    // Identity-card numbers are masked in the trail (6.11 R20).
    await audit(c, "ContractSignature", s1.id, "contractor's signature", "CREATE", diffFields(null, { party: "CONTRACTOR", name, icNumber: maskIc(ic), capacity, signedOn, recordedOnBehalf: "not signed" }));
    await audit(c, "ContractSignature", s2.id, "witness", "CREATE", diffFields(null, { party: "WITNESS", name: witnessName, icNumber: maskIc(witnessIc), signedOn, recordedOnBehalf: "not signed" }));
    return { ok: true };
  });
}

/**
 * The RSAJ officer's signature: the act that executes the contract (FR-CON-009). `signFaults` is re-run
 * on the locked rows; the Contract Date is the organisation's day of this act's server stamp, never a
 * form field. Writes the signature with who the matrix resolved, the Contract Date, the executed
 * snapshot, the EXECUTED baseline version, and the status.
 */
export async function recordRsajSignature(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("SIGNATURE");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  if (r.failed) return { ok: false, errors: r.errors };
  // The employer's signature executes the contract (FR-CON-009): the signing officer signs in with the password asked again, naming the contract it executes; or the
  // paper they signed is recorded for them. The Contract Date is this act's server day either way (NFR-AUD-005), never a form field.
  const begun = await beginAct(actor, data, "ContractSignature.person", { personField: "personId", document: { entity: "Contract", id: idOf(data) } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const contractDate = contractDateOf(now, c.l.org.timeZone);
    if (!contractDate) return NO_ZONE;
    const s = await signingFacts(c.l, personId, contractDate, c.tx);
    if (s.faults.length) return refuse("Not signed:", s.faults);
    if (!s.person || !s.signatory?.ok) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const sig = s.signatory;
    const row = await c.tx.contractSignature.create({ data: { organisationId: c.l.org.id, contractId: k.id, party: "RSAJ", personId: s.person.id, name: s.person.name, signedOn: dayToDate(contractDate), recordedAt: now, roleCode: sig.roleCode, roleLabel: sig.roleLabel, ruleKey: sig.ruleKey, ruleLabel: sig.ruleLabel, delegationId: s.delegationId } });
    const snapshot = executedSnapshot({
      contractDate,
      readySince: s.readySince,
      // M-1: the days the contractor and the witness signed, so no correction moves the Contract Date before them.
      contractorSignedOn: s.inputs.contractorSignedOn,
      witnessSignedOn: day(k.signatures.find((x) => x.party === "WITNESS")?.signedOn),
      gate: s.gate.items,
      legal: reviewsOf(k).map((x) => ({ iteration: x.iteration, decision: x.decision, decidedOn: x.decidedOn, office: x.officeLabel })),
      signatory: { rule: sig.ruleLabel, clause: sig.clause, office: sig.roleLabel, delegated: !!s.delegationId },
      checks: k.checks.map((x) => ({ kind: x.kind, completedOn: day(x.completedOn) })),
      formation: readFormationSnapshot(k.formationSnapshot),
    });
    await moveTo(c, "EXECUTED", { contractDate: dayToDate(contractDate), contractDateRecordedAt: now, executedSnapshot: snapshot as unknown as Prisma.InputJsonValue });
    const prior = latestVersion(baselineRows(k).versions);
    const base = currentBaseline(k)!;
    const exec = { ...base, contractDate };
    await writeVersion(c, exec, "EXECUTED", "", { from: prior ? `version ${prior.version}` : "draft" });
    await audit(c, "ContractSignature", row.id, "signed for the employer", "CREATE", diffFields(null, { party: "RSAJ", signedBy: s.person.name, office: sig.roleLabel, rule: sig.ruleLabel, delegated: s.delegationId ? "yes" : "no", recordedOnBehalf: act.intent.mode === "RECORDED_ON_BEHALF" ? "not signed" : null }));
    await act.write(c.tx, row.id, { document: { entity: "Contract", id: k.id }, roleCode: sig.roleCode });
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ status: k.status, contractDate: null }, { status: "EXECUTED", contractDate, contractDateSource: "the day of the recorded signature act" }));
    // 6.13 Part A (FR-SUP-001, against accepted 6.12): the S.O. this signature resolved, effective from the Contract Date.
    if (s.so?.state === "RESOLVED" && s.soMatrix) {
      const so = await c.tx.contractSoAssignment.create({
        data: { organisationId: c.l.org.id, contractId: k.id, roleCode: s.so.roleCode, roleLabel: s.so.roleLabel, reason: "EXECUTION", matrixLabel: s.soMatrix.label, ruleKey: s.so.ruleKey, ruleLabel: s.so.ruleLabel, clause: s.so.clause, contractValue: k.contractSum, regime: c.l.ex.regime, warnings: s.so.notes.map((n) => n.messageEn) as Prisma.InputJsonValue, effectiveOn: dayToDate(contractDate), recordedAt: now },
      });
      await audit(c, "ContractSoAssignment", so.id, "Superintending Officer resolved", "CREATE", diffFields(null, { office: s.so.roleLabel, resolvedFrom: `${s.soMatrix.label}: ${s.so.ruleLabel} (${s.so.clause})`, resolvedBy: "the employer's signature", effectiveOn: contractDate, assumption: s.so.notes.map((n) => n.messageEn).join(" ") || null }));
    }
    return { ok: true };
  });
}

/// Write a numbered baseline version (never updated afterwards), with its sections.
async function writeVersion(c: Ctx, v: BaselineValues, reason: "CONFIRMED" | "EXECUTED" | "CORRECTION", correctionReason: string, extra: Record<string, unknown>, enteredOverride?: Record<string, unknown>, change?: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const { versions, draft } = baselineRows(c.l.contract);
  const prior = latestVersion(versions);
  // What was keyed, with its provenance: the version before carries it forward, else the draft.
  const carried = enteredOverride ?? ((prior?.entered ?? draft?.entered ?? {}) as Record<string, unknown>);
  const version = (prior?.version ?? 0) + 1;
  const inputs = frozenInputsOf(c.l.contract);
  const derived = inputs ? derive(v, inputs.interimPolicy) : v;
  const row = await c.tx.contractBaseline.create({
    data: { organisationId: c.l.org.id, contractId: c.l.contract.id, version, reason, correctionReason, recordedAt: c.now, recordedOn: dayToDate(c.today), ...rowOf(derived), entered: carried as Prisma.InputJsonValue, snapshot: { ...(draft?.snapshot as object), ...extra } as Prisma.InputJsonValue },
  });
  for (const s of sectionRows(derived, c.l.org.id)) await c.tx.contractSection.create({ data: { ...s, baselineId: row.id } });
  const prev = prior ? valuesOf(prior) : draft ? valuesOf(draft) : null;
  // S-3: a correction's group, before and after, is recorded in the version's own CREATE entry (never an UPDATE of a row just written).
  await audit(c, "ContractBaseline", row.id, `baseline version ${version}`, "CREATE", [...diffFields(null, { version, reason, changed: prev ? changedFields(prev, derived).join(", ") || "nothing" : "all" }), ...(change ? diffFields(change.before, change.after) : [])], correctionReason);
  return row;
}

/// Correct the Contract Date to an earlier day (OD-1 A): audited, with a reason; a CORRECTION version carries it.
export async function correctContractDate(prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  // Phase 5a (ADR 0034 D15): a correction is proposed by one officer and applied by a second person who holds the permission to decide corrections. Asked of by a person, this
  // act proposes; the machinery that rehearses the proposal and applies it runs this very act (`currentAmbient()`), and then it corrects.
  if (!currentAmbient()) {
    const staged = await stageRecordEdit("projects.correctContractDate", prev, data);
    return staged;
  }
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const proposed = r.date("contractDate", "Contract Date", { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed || !proposed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const frozen = frozenSigningDays(k.executedSnapshot);
    // A snapshot frozen before M-1 lacks the signature days: the signature rows, never edited once recorded, give them.
    const signedDay = (party: string, f: string | null | undefined) => (f !== undefined ? f : day(k.signatures.find((x) => x.party === party)?.signedOn));
    const current = day(k.contractDate);
    const fs = dateCorrectionFaults({ executed: isExecuted(k.status as ContractStatus), current, proposed: storedDay(proposed), readySince: frozen.readySince, reason, signed: { contractor: signedDay("CONTRACTOR", frozen.contractorSignedOn), witness: signedDay("WITNESS", frozen.witnessSignedOn) } });
    if (fs.length) return refuse("Not corrected:", fs);
    // 6.13 Part A review 1: the S.O. assignment that took effect on the Contract Date moves with it, in this transaction.
    // Residual review: resolved again on the new date, on the matrix in force that day, at the value it was resolved
    // at; refused before anything is written where that gives no S.O. or another office.
    const newDay = storedDay(proposed);
    const assignments = await c.tx.contractSoAssignment.findMany({ where: { contractId: k.id }, select: { id: true, reason: true, effectiveOn: true, roleCode: true, roleLabel: true, matrixLabel: true, ruleKey: true, ruleLabel: true, clause: true, contractValue: true, warnings: true } });
    const moving = assignmentToMove(assignments.map((a) => ({ ...a, effectiveOn: storedDay(a.effectiveOn) })), current, newDay);
    let again: Extract<SoResolution, { state: "RESOLVED" }> | null = null;
    let againMatrix: string | null = null;
    if (moving) {
      const issue = await loadIssue(actor.organisationCode, dayToDate(newDay), undefined, null, c.tx);
      const res = issue ? resolveSo(issue.matrix, { contractValue: amountOf(moving.contractValue), method: await methodKeyOf(c.l, c.tx), contractTypeCode: c.l.ex.contractTypeCode }) : null;
      const judged = soOnCorrectedDate(moving, res, issue?.label ?? null, newDay);
      if (!judged.ok) return refuse("Not corrected:", judged.faults);
      again = judged.resolution;
      againMatrix = issue!.label;
    }
    await c.tx.contract.update({ where: { id: k.id, organisationId: actor.organisationId }, data: { contractDate: proposed, contractDateCorrectedFrom: k.contractDateCorrectedFrom ?? k.contractDate, contractDateCorrectionReason: reason } });
    const base = currentBaseline(k)!;
    await writeVersion(c, { ...base, contractDate: newDay }, "CORRECTION", reason, { correctedField: "contractDate" });
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ contractDate: current }, { contractDate: proposed, correctedFrom: day(k.contractDateCorrectedFrom ?? k.contractDate) }), reason);
    if (moving && again && againMatrix) {
      const notes = again.notes.map((n) => n.messageEn);
      await c.tx.contractSoAssignment.update({ where: { id: moving.id, organisationId: actor.organisationId }, data: { effectiveOn: proposed, matrixLabel: againMatrix, ruleKey: again.ruleKey, ruleLabel: again.ruleLabel, clause: again.clause, warnings: notes as Prisma.InputJsonValue } });
      await audit(
        c,
        "ContractSoAssignment",
        moving.id,
        "Superintending Officer resolved",
        "UPDATE",
        diffFields(
          { effectiveOn: moving.effectiveOn, resolvedFrom: `${moving.matrixLabel}: ${moving.ruleLabel} (${moving.clause})`, assumption: (Array.isArray(moving.warnings) ? moving.warnings.map(String).join(" ") : "") || null },
          { effectiveOn: newDay, resolvedFrom: `${againMatrix}: ${again.ruleLabel} (${again.clause})`, assumption: notes.join(" ") || null, movedWith: "the corrected Contract Date", resolvedAgainOn: `the matrix in force on ${newDay}, at ${senToDecimalString(senFromDecimal(moving.contractValue))}: the same office, ${again.roleLabel}` },
        ),
        reason,
      );
    }
    return { ok: true };
  });
}

/// Stamping at LHDN (FR-CON-011): "fully executed" only with the day and the reference.
export async function recordStamping(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const stampedOn = r.date("stampedOn", "Stamped on", { required: true });
  const reference = r.text("stampingRef", "Stamping reference", { required: true, max: 120 });
  if (r.failed || !stampedOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FORMATION", async (c) => {
    const k = c.l.contract;
    const fs = stampFaults({ status: k.status as ContractStatus, stampedOn: storedDay(stampedOn), reference, contractDate: day(k.contractDate), today: c.today });
    if (fs.length) return refuse("Not recorded:", fs);
    await moveTo(c, "STAMPED", { stampedOn, stampingRef: reference, stampedAt: now });
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ status: k.status }, { status: "STAMPED", stampedOn, stampingRef: reference }));
    return { ok: true };
  });
}

/// The Integrity Pact Stage Three briefing (FR-CON-010).
export async function recordBriefing(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const heldOn = r.date("heldOn", "Held on", { required: true });
  const participantIds = data.getAll("participantIds").map(String).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const attendees = r.text("contractorAttendees", "The contractor's attendees", { max: 2000 }).split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const note = r.text("note", "Note", { max: 4000 });
  if (r.failed || !heldOn) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const k = c.l.contract;
    const people = participantIds.length ? await c.tx.person.findMany({ where: { id: { in: participantIds }, organisationId: c.l.org.id }, select: { id: true, name: true } }) : [];
    const fs = briefingFaults({ status: k.status as ContractStatus, exists: !!k.briefing, participants: people.length, attendees: attendees.length, heldOn: storedDay(heldOn), today: c.today });
    if (fs.length) return refuse("Not recorded:", fs);
    const row = await c.tx.integrityBriefing.create({ data: { organisationId: c.l.org.id, contractId: k.id, heldOn, participantIds: people.map((p) => p.id), participantNames: people.map((p) => p.name), contractorAttendees: attendees, note, recordedAt: now } });
    await audit(c, "IntegrityBriefing", row.id, "integrity briefing", "CREATE", diffFields(null, { heldOn, participants: people.map((p) => p.name).join(", "), contractorAttendees: attendees.join(", ") }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ controlled copies

export async function answerConsultingEngineer(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const v = r.choice("consultingEngineer", "Consulting engineer", ["yes", "no"] as const, { required: true });
  if (r.failed || !v) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const k = c.l.contract;
    if (k.copies.length > 0) return { ok: false, message: "Copies have been issued on the answer as it stands; it no longer changes." };
    const after = v === "yes";
    await c.tx.contract.update({ where: { id: k.id, organisationId: actor.organisationId }, data: { consultingEngineer: after } });
    await audit(c, "Contract", k.id, "", "UPDATE", diffFields({ consultingEngineer: k.consultingEngineer }, { consultingEngineer: after }));
    return { ok: true };
  });
}

const copyFacts = (x: LoadedContract["contract"]["copies"][number], all: LoadedContract["contract"]["copies"]): CopyFacts => ({ id: x.id, copyNo: x.copyNo, recipientId: x.recipientId, despatchedOn: day(x.despatchedOn), acknowledgedOn: day(x.acknowledgedOn), recalledOn: day(x.recalledOn), reissuedAs: all.find((y) => y.reissueOfId === x.id)?.id ?? null });
const METHODS = ["REGISTERED_POST", "COLLECTION", "BY_HAND"] as const;

async function issue(c: Ctx, recipientId: string, addressedTo: string, method: (typeof METHODS)[number] | null, despatchedOn: Date | null, reissueOf: { id: string; copyNo: number } | null) {
  const k = c.l.contract;
  const snap = readFormationSnapshot(k.formationSnapshot);
  const recipients = snap?.recipients ?? [];
  const all = k.copies.map((x) => copyFacts(x, k.copies));
  const fs = issueFaults({ status: k.status as ContractStatus, stampText: snap?.policy.stampEn ?? null, consultingEngineer: k.consultingEngineer, recipientId, recipients, copies: all, despatchedOn: despatchedOn ? storedDay(despatchedOn) : null, contractDate: day(k.contractDate), today: c.today });
  if (fs.length) throw new Refusal(refuse("Not issued:", fs));
  const rec = recipients.find((x) => x.id === recipientId)!;
  const copyNo = nextCopyNo(k.copies);
  const stampText = [snap!.policy.stampEn, snap!.policy.stampMs].filter(Boolean).join(" / ");
  const row = await c.tx.issuedCopy.create({ data: { organisationId: c.l.org.id, contractId: k.id, copyNo, recipientId: rec.id, recipientName: rec.name, copyForm: rec.copyForm, addressedTo, stampText, method, despatchedOn, recordedAt: c.now, reissueOfId: reissueOf?.id ?? null } });
  await audit(c, "IssuedCopy", row.id, `controlled copy ${copyNo}`, "CREATE", diffFields(null, { copyNo, recipient: rec.name, addressedTo, stamp: stampText, method, despatchedOn, reissueOf: reissueOf ? `copy ${reissueOf.copyNo}` : null }));
}

export async function issueCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const recipientId = r.text("recipientId", "Recipient", { required: true });
  const addressedTo = r.text("addressedTo", "Addressed to", { required: true, max: 400 });
  const method = r.choice("method", "How it went", METHODS);
  const despatchedOn = r.date("despatchedOn", "Despatched on");
  if (despatchedOn && !method) r.reject("method", "Say how it went.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    await issue(c, recipientId, addressedTo, method, despatchedOn, null);
    return { ok: true };
  });
}

async function onCopy(c: Ctx, copyId: string) {
  await c.tx.$queryRaw`SELECT id FROM "IssuedCopy" WHERE id = ${copyId} FOR UPDATE`;
  const k = c.l.contract;
  const x = k.copies.find((y) => y.id === copyId);
  if (!x) throw new Refusal({ ok: false, message: "That copy is not on this contract." });
  return { row: x, facts: copyFacts(x, k.copies) };
}

export async function despatchCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const method = r.choice("method", "How it went", METHODS, { required: true });
  const on = r.date("despatchedOn", "Despatched on", { required: true });
  if (r.failed || !on || !method) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const { row, facts } = await onCopy(c, copyId);
    const fs = despatchFaults(facts, storedDay(on), c.today, day(c.l.contract.contractDate));
    if (fs.length) return refuse("Not recorded:", fs);
    await c.tx.issuedCopy.update({ where: { id: row.id, organisationId: actor.organisationId }, data: { method, despatchedOn: on } });
    await audit(c, "IssuedCopy", row.id, `controlled copy ${row.copyNo}`, "UPDATE", diffFields({ despatchedOn: null }, { method, despatchedOn: on }));
    return { ok: true };
  });
}

export async function acknowledgeCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const on = r.date("acknowledgedOn", "Acknowledged on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const { row, facts } = await onCopy(c, copyId);
    const fs = acknowledgeFaults(facts, storedDay(on), c.today);
    if (fs.length) return refuse("Not recorded:", fs);
    await c.tx.issuedCopy.update({ where: { id: row.id, organisationId: actor.organisationId }, data: { acknowledgedOn: on } });
    await audit(c, "IssuedCopy", row.id, `controlled copy ${row.copyNo}`, "UPDATE", diffFields({ acknowledgedOn: null }, { acknowledgedOn: on }));
    return { ok: true };
  });
}

export async function recallCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const on = r.date("recalledOn", "Recalled on", { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const { row, facts } = await onCopy(c, copyId);
    const fs = recallFaults(facts, storedDay(on), c.today, reason);
    if (fs.length) return refuse("Not recalled:", fs);
    await c.tx.issuedCopy.update({ where: { id: row.id, organisationId: actor.organisationId }, data: { recalledOn: on, recallReason: reason } });
    await audit(c, "IssuedCopy", row.id, `controlled copy ${row.copyNo}`, "UPDATE", diffFields({ recalledOn: null }, { recalledOn: on }), reason);
    return { ok: true };
  });
}

/// Reissue a recalled copy: the next number, linked to the one it replaces.
export async function reissueCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const copyId = r.text("copyId", "Copy", { required: true });
  const addressedTo = r.text("addressedTo", "Addressed to", { required: true, max: 400 });
  const method = r.choice("method", "How it went", METHODS);
  const despatchedOn = r.date("despatchedOn", "Despatched on");
  if (despatchedOn && !method) r.reject("method", "Say how it went.");
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "COPIES_AND_CUSTODY", async (c) => {
    const { row, facts } = await onCopy(c, copyId);
    const fs = reissueFaults(facts);
    if (fs.length) return refuse("Not reissued:", fs);
    if (!row.recipientId) return { ok: false, message: "That copy names no recipient on the list." };
    await issue(c, row.recipientId, addressedTo, method, despatchedOn, { id: row.id, copyNo: row.copyNo });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ custody

export async function registerOriginal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  // The drawer offers each original as "KIND:id" (the contract's own as "CONTRACT:").
  const [kindRaw, refRaw] = String(data.get("original") ?? "").split(":");
  const kind = (["CONTRACT", "SECURITY", "POLICY"] as const).find((k) => k === kindRaw) ?? null;
  if (!kind) r.reject("original", "Choose the original.");
  const refId = refRaw?.trim() || null;
  const location = r.text("location", "Held at", { required: true, max: 400 });
  const custodianId = r.text("custodianPersonId", "Custodian", { required: true });
  if (kind && kind !== "CONTRACT" && !refId) r.reject("original", "Choose the bond or policy.");
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "ORIGINALS", async (c) => {
    const k = c.l.contract;
    const onContract = kind === "CONTRACT" ? true : kind === "SECURITY" ? k.securities.some((s) => s.id === refId) : k.policies.some((p) => p.id === refId);
    const registered = k.custodyItems.some((i) => (kind === "CONTRACT" ? i.kind === "CONTRACT" : kind === "SECURITY" ? i.securityId === refId : i.policyId === refId));
    const fs = registerFaults({ kind, executed: isExecuted(k.status as ContractStatus), location, onContract, registered });
    if (fs.length) return refuse("Not registered:", fs);
    const custodian = await personOf(c, custodianId);
    if (!custodian) return { ok: false, errors: { custodianPersonId: "Choose someone on record and active." } };
    const row = await c.tx.custodyItem.create({ data: { organisationId: c.l.org.id, contractId: k.id, kind, securityId: kind === "SECURITY" ? refId : null, policyId: kind === "POLICY" ? refId : null, location, custodianPersonId: custodian.id, recordedAt: now } });
    await audit(c, "CustodyItem", row.id, custodyItemLabel(kind), "CREATE", diffFields(null, { kind, location, custodian: custodian.name }));
    return { ok: true };
  });
}

export async function moveOriginal(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const itemId = r.text("itemId", "Original", { required: true });
  const direction = r.choice("direction", "Movement", ["OUT", "IN"] as const, { required: true });
  const on = r.date("on", "On", { required: true });
  const purpose = r.text("purpose", "Purpose", { max: 400 });
  if (r.failed || !direction || !on) return { ok: false, errors: r.errors };
  // Taken or returned by the person who has it: signed in, or recorded for them from the custody ledger.
  const begun = await beginAct(actor, data, "CustodyMovement.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "ORIGINALS", async (c) => {
    // The domain row last, after the contract.
    await c.tx.$queryRaw`SELECT id FROM "CustodyItem" WHERE id = ${itemId} FOR UPDATE`;
    const item = c.l.contract.custodyItems.find((i) => i.id === itemId);
    if (!item) return { ok: false, message: "That original is not in this contract's custody register." };
    const moves = await c.tx.custodyMovement.findMany({ where: { itemId: item.id }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }], include: { person: { select: { name: true } } } });
    const facts = moves.map((m) => ({ direction: m.direction, personId: m.personId, personName: m.person.name, on: storedDay(m.on) }));
    const fs = movementFaults(facts, direction, storedDay(on), c.today);
    if (fs.length) return refuse("Not recorded:", fs);
    const person = await personOf(c, personId);
    if (!person) return { ok: false, errors: { personId: "Choose someone on record and active." } };
    const row = await c.tx.custodyMovement.create({ data: { organisationId: c.l.org.id, itemId: item.id, direction, personId: person.id, on, purpose, recordedAt: now } });
    const after = custodyState([...facts, { direction, personId: person.id, personName: person.name, on: storedDay(on) }]);
    await audit(c, "CustodyMovement", row.id, `original ${direction === "OUT" ? "checked out" : "checked in"}`, "CREATE", diffFields(null, { direction, person: person.name, on, purpose, now: after.state }));
    await act.write(c.tx, row.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the baseline

/// Read one group's keyed value from the form; null where the form does not carry it.
function readGroup(r: FormReader, group: EnteredGroup): EnteredValues | null {
  const pct = (name: string, label: string) => {
    const v = r.optionalText(name)?.replace(/%$/, "").trim() ?? null;
    if (!v) return null;
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(v)) {
      r.reject(name, `${label} must be a percentage to at most four places.`);
      return null;
    }
    return v;
  };
  const yes = (name: string, label: string) => {
    const v = r.choice(name, label, ["yes", "no"] as const, { required: true });
    return v == null ? null : v === "yes";
  };
  switch (group) {
    case "lad": {
      const kind = r.choice("ladKind", "Stated as", ["AMOUNT_PER_DAY", "PERCENT_OF_SUM_PER_DAY"] as const, { required: true }) as LadKind | null;
      const amount = kind === "AMOUNT_PER_DAY" ? r.money("ladAmount", "Amount a day", { required: true }) : null;
      const ladPct = kind === "PERCENT_OF_SUM_PER_DAY" ? r.optionalText("ladPct")?.trim() ?? null : null;
      if (kind === "PERCENT_OF_SUM_PER_DAY" && (!ladPct || !/^\d{1,3}(\.\d{1,6})?$/.test(ladPct))) r.reject("ladPct", "Give the percentage of the contract sum a day, to at most six places.");
      return kind ? { lad: { kind, amount: amount ? parseSen(amount) : null, pct: ladPct } } : null;
    }
    case "dlp": {
      const applies = yes("dlpApplies", "Applies");
      const months = applies ? r.int("dlpMonths", "Months", { required: true, min: 1 }) : null;
      return applies == null ? null : { dlp: { applies, months } };
    }
    case "retention": {
      const applies = yes("retentionApplies", "Applies");
      return applies == null ? null : { retention: { applies, percent: applies ? pct("retentionPercent", "Retention") : null, cap: applies ? pct("retentionCapPercent", "Cap") : null } };
    }
    case "sums": {
      const pc = r.money("pcSums", "Prime cost sums", { required: true });
      const ps = r.money("provisionalSums", "Provisional sums", { required: true });
      return pc && ps ? { sums: { pc: parseSen(pc), ps: parseSen(ps) } } : null;
    }
    case "firstInterim":
    case "subsequentInterim":
    case "designWork": {
      const v = r.money("amount", "Amount", { required: true });
      return v ? { [group]: parseSen(v) } : null;
    }
    case "honourDays": {
      const v = r.int("days", "Days", { required: true, min: 1 });
      return v == null ? null : { honourDays: v };
    }
    case "unfixedMaterials":
    case "onCost": {
      const v = pct("percent", "Percentage");
      if (!v) r.reject("percent", "Give the percentage.");
      return v ? { [group]: v } : null;
    }
    case "sectional": {
      const applies = yes("sectionalApplies", "Applies");
      if (applies == null) return null;
      const lines = (r.optionalText("sections") ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
      const sections = lines.map((line, n) => {
        const [ref, description, amount] = line.split("|").map((x) => x.trim());
        const a = amount?.replace(/^RM/i, "").replace(/,/g, "");
        if (!ref || !description || !a || !/^\d+(\.\d{1,2})?$/.test(a)) r.reject("sections", `Line ${n + 1}: write it as "reference | description | amount a day".`);
        return { ref: ref ?? String(n + 1), description: description ?? "", ladKind: "AMOUNT_PER_DAY" as const, ladAmount: a && /^\d+(\.\d{1,2})?$/.test(a) ? parseSen(a) : null, ladPct: null };
      });
      return { sectional: { applies, sections: applies ? sections : [] } };
    }
  }
}

const enteredJson = (e: unknown) => JSON.parse(JSON.stringify(e, (_, v) => (typeof v === "bigint" ? `sen:${v.toString()}` : v)));

/// Key one group on the draft, where nothing else states it (OD-5 A), with the provenance the officer chose.
export async function saveBaselineEntry(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const group = r.choice("group", "Value", ENTERED_GROUPS, { required: true });
  const provenance = r.choice("provenance", "Where it came from", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  const entered = group ? readGroup(r, group) : null;
  if (r.failed || !group || !entered || !provenance) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "BASELINE", async (c) => {
    const k = c.l.contract;
    const { draft, versions } = baselineRows(k);
    const df = draftFaults({ status: k.status as ContractStatus, versions: versions.length });
    if (df.length) return refuse("Not saved:", df);
    const inputs = frozenInputsOf(k);
    if (!draft || !inputs) return { ok: false, message: "The baseline's draft is not on record: it is built when preparation starts." };
    const prov: EnteredProvenance = { [group]: { provenance, note } };
    const fs = enteredFaults(inputs, entered, prov);
    if (fs.length) return refuse("Not saved:", fs);
    const stored = { ...((draft.entered ?? {}) as Record<string, unknown>), [group]: { value: enteredJson(entered[group]), provenance, note } };
    const all = Object.fromEntries(Object.entries(stored).map(([g, v]) => [g, (v as { value: unknown }).value])) as Record<string, unknown>;
    const values = buildBaseline(inputs, JSON.parse(JSON.stringify(all), (_, x) => (typeof x === "string" && x.startsWith("sen:") ? BigInt(x.slice(4)) : x)) as EnteredValues);
    const before = valuesOf(draft);
    await c.tx.contractSection.deleteMany({ where: { baselineId: draft.id } });
    await c.tx.contractBaseline.update({ where: { id: draft.id, organisationId: actor.organisationId }, data: { ...rowOf(values), entered: stored as Prisma.InputJsonValue } });
    for (const s of sectionRows(values, c.l.org.id)) await c.tx.contractSection.create({ data: { ...s, baselineId: draft.id } });
    // R-2: the group's values before and after, where each came from and the provenance chosen, in the same transaction.
    const was = ((draft.entered ?? {}) as Record<string, { provenance?: string } | undefined>)[group]?.provenance ?? null;
    const change = groupChange(group, before, values, { before: was, after: provenance });
    await audit(c, "ContractBaseline", draft.id, "baseline draft", "UPDATE", diffFields(change.before, { ...change.after, changed: changedFields(before, values).join(", ") }), note);
    return { ok: true };
  });
}

/// Confirm the baseline before the first valuation (OD-2 A): version 1, CONFIRMED.
export async function confirmBaseline(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  return inContract(actor, toAuditActor(actor), idOf(data), now, "BASELINE", async (c) => {
    const k = c.l.contract;
    const { draft, versions } = baselineRows(k);
    const gate = await contractGate(c.l, c.tx);
    const bl = baselineBlocks(k);
    const fs = confirmFaults({ status: k.status as ContractStatus, hasDraft: !!draft, versions: versions.length, gateReady: gate.ready, baselineBlocks: bl.blocks });
    if (fs.length) return refuse("Not confirmed:", fs);
    await writeVersion(c, valuesOf(draft!), "CONFIRMED", "", { from: "draft", gate: gate.items });
    return { ok: true };
  });
}

/// Correct a versioned baseline: a CORRECTION version with the group keyed, a reason and its provenance.
export async function correctBaseline(prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  // Phase 5a (ADR 0034 D15): a correction is proposed by one officer and applied by a second person who holds the permission to decide corrections. Asked of by a person, this
  // act proposes; the machinery that rehearses the proposal and applies it runs this very act (`currentAmbient()`), and then it corrects.
  if (!currentAmbient()) {
    const staged = await stageRecordEdit("projects.correctBaseline", prev, data);
    return staged;
  }
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const group = r.choice("group", "Value", ENTERED_GROUPS, { required: true });
  const provenance = r.choice("provenance", "Where it came from", ["STATED", "OBSERVED", "ASSUMED"] as const, { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  const entered = group ? readGroup(r, group) : null;
  if (r.failed || !group || !entered || !provenance) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "BASELINE", async (c) => {
    const k = c.l.contract;
    const { versions } = baselineRows(k);
    const latest = latestVersion(versions);
    const inputs = frozenInputsOf(k);
    // R-3 (BD-612-23): a value the award, the Appendix or the bill states, or a recorded rule derives, is kept as stated.
    const stated = inputs ? correctableFaults(group, inputs) : [];
    if (stated.length) return refuse("Not corrected:", stated);
    const before = latest ? valuesOf(latest) : null;
    const after = before && inputs ? derive(applyEntered(before, entered), inputs.interimPolicy) : null;
    const changed = before && after ? changedFields(before, after).length : 0;
    const blocks = after ? baselineFaults(after, { defectsLiabilityApplies: inputs!.type.defectsLiabilityApplies }, inputs!.band, inputs!.award).filter((f) => f.level === "block").length : 0;
    const fs = correctionFaults({ status: k.status as ContractStatus, versions: versions.length, reason, changed, baselineBlocks: blocks });
    if (fs.length) return refuse("Not corrected:", fs);
    const prior = (latest!.entered ?? {}) as Record<string, { provenance?: string } | undefined>;
    const stored = { ...prior, [group]: { value: enteredJson(entered[group]), provenance, note: reason } };
    // R-2/R-3: the corrected group's values before and after, in the new version's own entry (S-3).
    const change = groupChange(group, before!, after!, { before: prior[group]?.provenance ?? null, after: provenance });
    await writeVersion(c, after!, "CORRECTION", reason, { correctedField: group }, stored, change);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ 612-C1: the award's recorded terms

/**
 * Correct a term of the award as recorded, after issue, where it was recorded wrongly from the signed letter
 * (612-C1, ADR 0021 Amendment 1): under the award's lock and then the contract's (Award → Contract), with a
 * reason; the award's term is corrected and a CORRECTION version written whose source stays the Letter of
 * Acceptance, shown "corrected from …". The issued letter, earlier versions and the certificates pinned to them
 * are never touched. A second person decides it (Phase 5a). A change to the terms themselves is a
 * variation, not this.
 */
export async function correctAwardTerm(prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  // Phase 5a (ADR 0034 D15): a correction is proposed by one officer and applied by a second person who holds the permission to decide corrections. Asked of by a person, this
  // act proposes; the machinery that rehearses the proposal and applies it runs this very act (`currentAmbient()`), and then it corrects.
  if (!currentAmbient()) {
    const staged = await stageRecordEdit("projects.correctAwardTerm", prev, data);
    return staged;
  }
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const term = r.choice("term", "Term", AWARD_TERMS, { required: true });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  let input: TermInput | null = null;
  if (term === "LAD") {
    const amount = r.money("ladAmount", "Liquidated damages a day", { required: true });
    input = amount ? { term, amount: parseSen(amount) } : null;
  } else if (term === "DLP") {
    const months = r.int("dlpMonths", "Defects liability period, months (0 for none)", { required: true, min: 0 });
    input = months == null ? null : { term, months };
  } else if (term === "RETENTION") {
    const pctOf = (name: string, label: string) => {
      const v = r.optionalText(name)?.replace(/%$/, "").trim() ?? "";
      if (!/^\d{1,3}(\.\d{1,4})?$/.test(v)) r.reject(name, `${label}: a percentage to at most four places.`);
      return v;
    };
    const percent = pctOf("retentionPercent", "Retention");
    const cap = pctOf("retentionCapPercent", "Cap");
    input = { term, percent, cap };
  } else if (term === "COMPLETION") {
    const n = r.int("completionPeriod", "Completion period", { required: true, min: 1 });
    const unit = r.choice("completionUnit", "Unit", ["DAYS", "WEEKS", "MONTHS"] as const, { required: true });
    input = n != null && unit ? { term, period: n, unit } : null;
  }
  if (r.failed || !term || !input) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "BASELINE", async (c) => {
    const k = c.l.contract;
    const a = c.l.award;
    const { versions } = baselineRows(k);
    const latest = latestVersion(versions);
    const inputs = frozenInputsOf(k);
    const before = latest ? valuesOf(latest) : null;
    const after = before && inputs ? derive(applyTerm(before, input!), inputs.interimPolicy) : null;
    const blocks = after ? baselineFaults(after, { defectsLiabilityApplies: inputs!.type.defectsLiabilityApplies }, inputs!.band, inputs!.award).filter((f) => f.level === "block").length : 0;
    const cols: AwardTermColumns = { ladAmount: a.ladAmount?.toString() ?? null, ladUnit: a.ladUnit, dlpMonths: a.dlpMonths, retentionPercent: a.retentionPercent?.toString() ?? null, retentionCapPercent: a.retentionCapPercent?.toString() ?? null, completionPeriod: a.completionPeriod, completionUnit: a.completionUnit as AwardTermColumns["completionUnit"] };
    const next = correctedColumns(cols, input!, senToDecimalString);
    const sen = (v: string) => parseSen(v);
    const fromText = termText(term, cols, sen);
    const toText = termText(term, next, sen);
    const fs = awardCorrectionFaults({ awardStatus: a.status, awardIssued: a.issuedAt != null, versions: versions.length, source: before ? termSource(term, before) : null, term, input: input!, reason, changed: fromText !== toText || (before != null && after != null && changedFields(before, after).length > 0), blocks });
    if (fs.length) return refuse("Not corrected:", fs);
    // The award row is already locked (inContract takes Award before Contract); written only if unchanged since read.
    const moved = await c.tx.award.updateMany({ where: { id: a.id, updatedAt: a.updatedAt }, data: { ladAmount: next.ladAmount, ladUnit: next.ladUnit, dlpMonths: next.dlpMonths, retentionPercent: next.retentionPercent, retentionCapPercent: next.retentionCapPercent, completionPeriod: next.completionPeriod, completionUnit: next.completionUnit } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    const words = AWARD_TERM_WORDS[term].en;
    const version = await writeVersion(c, after!, "CORRECTION", reason, { correctedField: TERM_FIELD[term], awardCorrection: { term, from: fromText, to: toText } }, undefined, { before: { [TERM_FIELD[term]]: fromText, source: "the Letter of Acceptance, as recorded" }, after: { [TERM_FIELD[term]]: toText, source: "the Letter of Acceptance, corrected after issue" } });
    const row = await c.tx.awardTermCorrection.create({ data: { organisationId: c.l.org.id, awardId: a.id, contractId: k.id, term, before: { ...cols }, after: { ...next }, beforeText: fromText, afterText: toText, reason, baselineId: version.id, recordedAt: now, recordedOn: dayToDate(c.today) } });
    await writeAudit(c.tx, { actor: toAuditActor(actor), organisationId: c.l.org.id, entity: "Award", entityId: a.id, entityLabel: `${a.reference} · ${a.awardeeName}`, reason }, "UPDATE", diffFields({ [TERM_FIELD[term]]: fromText }, { [TERM_FIELD[term]]: toText, correctedAfterIssue: "yes", issuedLetter: "unchanged" }));
    await audit(c, "AwardTermCorrection", row.id, `the award's recorded terms corrected after issue · ${words}`, "CREATE", diffFields(null, { term: words, correctedFrom: fromText, correctedTo: toText, baselineVersion: `version ${version.version}`, issuedLetter: "unchanged" }), reason);
    return { ok: true };
  });
}
