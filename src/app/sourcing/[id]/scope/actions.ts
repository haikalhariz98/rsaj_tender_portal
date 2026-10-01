"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import type { FieldChange } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { parseSen, senToDecimalString, type Sen } from "@/lib/money";
import { ENTITY, bqExportAudit, bqFinalisedAudit, listValueLabel, panelAudit, type PanelAuditFacts, bqImportAudit, rateFromText, scopeTabledAudit, bqHeaderAudit, bqStatusAudit, estimateCreatedAudit, estimateEventAudit, estimateStateAudit, estimateVersionAudit, itemAudit, sectionAudit, verificationAudit, verificationClearedAudit } from "@/lib/scope/audit-view";
import { bqTotals, draftEditFaults, finaliseFaults, holdingOn, isQuantity, itemAmount, lineSizeFaults, qualificationSnapshot, reviseFaults, startBqFaults, totalsSnapshot } from "@/lib/scope/bq";
import { actionResult, lodgeFaults, retainFaults, startFault, versionFaults, voidFault } from "@/lib/scope/estimate";
import { writeEstimateVersion } from "@/lib/scope/estimate-store";
import { csvFaultText, ESTIMATE_STATE_LABEL, keyedMismatchText, PANEL_STATE_LABEL, scopeFaultText, type ScopeCode } from "@/lib/scope/labels";
import { lockBqRows, lockEstimateRow, lockLiveEstimateRows, lockPanelRow, withLockedExerciseScope, type LockedExercise } from "@/lib/scope/lock";
import { columnsInForce, editClearsVerifications, panelEditFault, panelFaults, panelState, standingVerifications, verifyFaults, verifyPanelFault } from "@/lib/scope/panel";
import { activePerson, estimateFactsOf, lineOf, linesOf, loadBqVersions, loadEstimates, loadHoldings, loadPanel, loadPanelColumns, loadQualifications, loadRateIssues, loadScopeMatters, loadScopePolicy, loadScopeRules } from "@/lib/scope/repo";
import { priceFromSchedule, type PricedFromSchedule } from "@/lib/scope/rates";
import { formatDate } from "@/lib/format";
import { BQ_ITEM_KINDS, BQ_SCOPED_BY, blocking, type BqItemKind, type Finding } from "@/lib/scope/types";
import { CLASSIFICATION_LABEL, documentFaultText, PURPOSE_LABEL } from "@/lib/documents/labels";
import { attachFault } from "@/lib/documents/attach";
import { attached, detached, filed } from "@/lib/documents/audit-view";
import { lockVersion } from "@/lib/documents/service";
import { bqVersionFacts } from "@/lib/documents/owner-facts";
import { blobStore, sha256Hex } from "@/lib/documents/store";
import { checkTabling, secretariatHoldersOn } from "@/lib/committee/tabling";
import { TABLING_FAULT_MESSAGE } from "@/lib/committee/labels";
import { sittingPermits } from "@/lib/committee/meeting";
import { lockSittingIn } from "@/lib/committee/sittings";
import { ACT_LABEL } from "@/lib/labels";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { bqCsvFilename, bqToCsv, decodeCsv, parseBqCsv } from "@/lib/scope/csv";
import { scopeCitationFault, scopeMatterSubject, SCOPE_DOMAIN } from "@/lib/scope/scope-matter";
import { backstopCode } from "@/lib/scope/unique-violation";
import { transactionTimedOut } from "@/lib/scope/tx-timeout";
import { FormReader } from "@/lib/validate";

/**
 * Writes for 6.2 increment 1: the bill of quantities, the specification panel and the
 * company estimate, on an exercise (plan §4).
 *
 * Every action is reachable by a direct POST, so each locks the exercise's requisition,
 * then the exercise, then the 6.2 rows it changes (`withLockedExerciseScope`, `lock.ts`),
 * re-reads what it judges inside that transaction, re-runs the pure rule on the locked
 * data, and writes with its audit rows in the same transaction. A refusal saves nothing
 * and names what blocks it, and where to fix it. Nobody is signed in: every person named is
 * "recorded on behalf of, not signed", and the audit is unattributed.
 *
 * The estimate's acts hand back codes only, rendered as fixed sentences: never the typed
 * figure, never the reason (OD-1, ADR 0012). Their audit rows read "Sealed (version N)".
 */

const GONE: FormState = { ok: false, message: scopeFaultText("EXERCISE_GONE") };
const RECORD_GONE: FormState = { ok: false, message: scopeFaultText("RECORD_GONE") };

class Refusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

const refuse = (fs: readonly Finding[]): FormState => ({ ok: false, message: `Nothing was saved: ${blocking(fs).map((f) => scopeFaultText(f)).join(" ")}` });
/// The estimate's refusals: codes only, as fixed sentences, never a figure, a reason or any finding data.
const refuseCodes = (codes: readonly string[]): FormState => ({ ok: false, message: `Nothing was saved: ${codes.map((c) => scopeFaultText(c as ScopeCode)).join(" ")}` });

async function audit(tx: Tx, orgId: string, entity: string, entityId: string, entityLabel: string, action: "CREATE" | "UPDATE" | "DELETE", changes: FieldChange[], reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(tx, { organisationId: orgId, entity, entityId, entityLabel, reason }, action, changes);
}

/// Every 6.2 row is labelled with its exercise's reference, so the exercise's History finds it.
const label = (l: LockedExercise, what: string) => `${l.ex.reference} · ${what}`;

async function inExercise(exerciseId: string, fn: (tx: Tx, l: LockedExercise) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedExerciseScope(exerciseId, fn);
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    // A backstop index refused what another act got in first (OD-2's one live estimate,
    // one draft bill). Any other unique violation is not a rule's refusal: rethrown.
    const backstop = backstopCode(e);
    if (backstop) return refuseCodes([backstop]);
    // The transaction ran out of time and rolled back: say so, never an error page.
    if (transactionTimedOut(e)) return { ok: false, message: scopeFaultText("TIMED_OUT") };
    throw e;
  }
  if (result?.ok) {
    revalidatePath(`/sourcing/${exerciseId}`);
    revalidatePath("/sourcing");
  }
  return result ?? GONE;
}

const today = (l: LockedExercise) => l.org.today;
const exerciseIdOf = (data: FormData) => String(data.get("exerciseId") ?? "");

// ------------------------------------------------------------------ bill of quantities

/// Start the exercise's first bill, optionally from a configured template's section headings.
export async function startBq(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const templateCode = String(data.get("templateCode") ?? "").trim() || null;
  return inExercise(exerciseId, async (tx, l) => {
    await lockBqRows(tx, exerciseId);
    const versions = await tx.bqVersion.findMany({ where: { exerciseId }, select: { status: true } });
    const faults = startBqFaults(versions, l.ex.status);
    if (faults.length) return refuse(faults);
    const template = templateCode ? await tx.bqTemplate.findFirst({ where: { organisationId: l.org.id, code: templateCode, retiredOn: null }, include: { sections: { orderBy: { sortOrder: "asc" } } } }) : null;
    if (templateCode && !template) return { ok: false, errors: { templateCode: "That template is not configured. Choose one from the list, or start without one." } };
    const v = await tx.bqVersion.create({ data: { organisationId: l.org.id, exerciseId, versionNo: 1, status: "DRAFT", templateCode: template?.code ?? null } });
    await audit(tx, l.org.id, ENTITY.bqVersion, v.id, label(l, "Bill of quantities v1"), "CREATE", bqStatusAudit(null, "DRAFT", { version: 1, template: template?.nameEn ?? null }));
    for (const s of template?.sections ?? []) {
      const row = await tx.bqSection.create({ data: { organisationId: l.org.id, versionId: v.id, number: s.number, title: s.titleEn, sortOrder: s.sortOrder } });
      await audit(tx, l.org.id, ENTITY.bqSection, row.id, label(l, `Bill of quantities v1 · section ${s.number}`), "CREATE", sectionAudit(null, { number: s.number, title: s.titleEn }));
    }
    return { ok: true };
  });
}

/// The draft's lock and re-read: the version must be this exercise's, and a draft.
async function lockedDraft(tx: Tx, l: LockedExercise, versionId: string) {
  await lockBqRows(tx, l.ex.id);
  const v = await tx.bqVersion.findFirst({ where: { id: versionId, exerciseId: l.ex.id }, include: { preparer: { select: { name: true } } } });
  if (!v) throw new Refusal(RECORD_GONE);
  const faults = draftEditFaults(v, l.ex.status);
  if (faults.length) throw new Refusal(refuse(faults));
  return v;
}

const triState = (v: string | null): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

/// The draft's header: who scoped it, the scope statement, the standard, the preparer, and OD-7.
export async function saveBqHeader(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const scopedBy = r.choice("scopedBy", "Scoped by", BQ_SCOPED_BY);
  const scopeStatement = r.text("scopeStatement", "Scope statement", { max: 8000 });
  const followsStandard = triState(r.choice("followsStandard", "Follows the standard", ["yes", "no", "unanswered"] as const));
  const departuresText = r.text("departuresText", "Departures", { max: 8000 });
  const preparerPersonId = r.optionalText("preparerPersonId");
  const provisionalExcludedFromFirm = triState(r.choice("provisionalExcludedFromFirm", "Provisional quantities in the firm value", ["yes", "no", "unstated"] as const));
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, versionId);
    const preparer = preparerPersonId ? await activePerson(l.org.id, preparerPersonId, tx) : null;
    if (preparerPersonId && !preparer) return { ok: false, errors: { preparerPersonId: scopeFaultText("PERSON_UNKNOWN") } };
    const after = { scopedBy, scopeStatement, followsStandard, departuresText, preparerPersonId: preparer?.id ?? null, provisionalExcludedFromFirm };
    await tx.bqVersion.update({ where: { id: v.id }, data: after });
    await audit(tx, l.org.id, ENTITY.bqVersion, v.id, label(l, `Bill of quantities v${v.versionNo}`), "UPDATE",
      bqHeaderAudit({ ...v, preparerName: v.preparer?.name ?? null }, { ...after, preparerName: preparer?.name ?? null }));
    return { ok: true };
  });
}

/// Add or edit a section of the draft.
export async function saveBqSection(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const sectionId = String(data.get("sectionId") ?? "") || null;
  const number = r.text("number", "Section number", { required: true, max: 20 });
  const title = r.text("title", "Section title", { required: true, max: 300 });
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, versionId);
    const before = sectionId ? await tx.bqSection.findFirst({ where: { id: sectionId, versionId: v.id } }) : null;
    if (sectionId && !before) return RECORD_GONE;
    const row = before
      ? await tx.bqSection.update({ where: { id: before.id }, data: { number, title, sortOrder } })
      : await tx.bqSection.create({ data: { organisationId: l.org.id, versionId: v.id, number, title, sortOrder } });
    await audit(tx, l.org.id, ENTITY.bqSection, row.id, label(l, `Bill of quantities v${v.versionNo} · section ${number}`), before ? "UPDATE" : "CREATE", sectionAudit(before ? { number: before.number, title: before.title } : null, { number, title }));
    return { ok: true };
  });
}

/// Where a schedule-priced line's rate came from, in words for its audit row; null for a rate entered.
function fromText(x: { scheduleLabelSnapshot: string | null; scheduleIssueSnapshot: string | null; scheduleEffectiveFromSnapshot: Date | string | null; rateItemCode: string | null } | null) {
  return x?.scheduleLabelSnapshot && x.scheduleIssueSnapshot && x.scheduleEffectiveFromSnapshot && x.rateItemCode
    ? rateFromText({ label: x.scheduleLabelSnapshot, issue: x.scheduleIssueSnapshot, effectiveFrom: typeof x.scheduleEffectiveFromSnapshot === "string" ? x.scheduleEffectiveFromSnapshot : storedDay(x.scheduleEffectiveFromSnapshot), itemCode: x.rateItemCode }, formatDate)
    : null;
}

/// Remove a section of the draft, with its lines. A finalised version is never changed.
export async function removeBqSection(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const sectionId = String(data.get("sectionId") ?? "");
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, versionId);
    const s = await tx.bqSection.findFirst({ where: { id: sectionId, versionId: v.id }, include: { items: true } });
    if (!s) return RECORD_GONE;
    for (const i of s.items) {
      await tx.bqItem.delete({ where: { id: i.id } });
      await audit(tx, l.org.id, ENTITY.bqItem, i.id, label(l, `Bill of quantities v${v.versionNo} · ${i.itemRef || i.description}`), "DELETE", itemAudit(null, lineOf(i)));
    }
    await tx.bqSection.delete({ where: { id: s.id } });
    await audit(tx, l.org.id, ENTITY.bqSection, s.id, label(l, `Bill of quantities v${v.versionNo} · section ${s.number}`), "DELETE", sectionAudit(null, { number: s.number, title: s.title }));
    return { ok: true };
  });
}

/// Add or edit a line of the draft. Its amount is worked out here, from the quantity and the rate, never typed.
export async function saveBqItem(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const itemId = String(data.get("itemId") ?? "") || null;
  const sectionId = r.text("sectionId", "Section", { required: true });
  const itemRef = r.text("itemRef", "Item", { max: 40 });
  const description = r.text("description", "Description", { required: true, max: 4000 });
  const unit = r.text("unit", "Unit", { max: 40 });
  const kind = r.choice("kind", "Kind", BQ_ITEM_KINDS, { required: true }) as BqItemKind | null;
  const quantityRaw = r.optionalText("quantity");
  if (quantityRaw && !isQuantity(quantityRaw)) r.reject("quantity", scopeFaultText("QUANTITY_INVALID"));
  const rateRaw = r.money("rate", "Rate");
  // FR-EST-004: "<issue id>|<item code>" of an issue in force today, or empty for a rate entered.
  const scheduleItem = r.optionalText("scheduleItem");
  const provisional = r.bool("provisional") && kind === "MEASURED";
  const sortOrder = r.int("sortOrder", "Order") ?? 0;
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  const quantity = quantityRaw ? quantityRaw.replace(/,/g, "") : null;
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, versionId);
    const section = await tx.bqSection.findFirst({ where: { id: sectionId, versionId: v.id } });
    if (!section) return { ok: false, errors: { sectionId: scopeFaultText("SECTION_REQUIRED") } };
    const before = itemId ? await tx.bqItem.findFirst({ where: { id: itemId, section: { versionId: v.id } } }) : null;
    if (itemId && !before) return RECORD_GONE;
    // A rate from a schedule is taken from the issue in force on the organisation's day,
    // read in this transaction, and kept with what the issue said (priceFromSchedule).
    let priced: PricedFromSchedule | null = null;
    if (scheduleItem === "keep") {
      // An edit that leaves a schedule-priced line's rate as it was priced: what the issue said then stands.
      if (before?.rateSource !== "SCHEDULE" || !before.rateScheduleId || !before.rateItemCode || before.rate == null) return { ok: false, errors: { scheduleItem: scopeFaultText("CHANGED") } };
      priced = { rate: parseSen(before.rate.toString()), rateScheduleId: before.rateScheduleId, rateItemCode: before.rateItemCode, scheduleLabelSnapshot: before.scheduleLabelSnapshot ?? "", scheduleIssueSnapshot: before.scheduleIssueSnapshot ?? "", scheduleEffectiveFromSnapshot: before.scheduleEffectiveFromSnapshot ? storedDay(before.scheduleEffectiveFromSnapshot) : "" };
    } else if (scheduleItem) {
      const [issueId, code] = scheduleItem.split("|");
      const issues = await loadRateIssues(l.org.id, tx);
      const chosen = issues.find((i) => i.id === issueId);
      if (!chosen || !code) return { ok: false, errors: { scheduleItem: scopeFaultText("RECORD_GONE") } };
      const p = priceFromSchedule(issues, chosen.label, code, today(l));
      if (!p.ok) return { ok: false, errors: { scheduleItem: scopeFaultText(p.fault) } };
      // The issue in force moved on since the form was opened: say so rather than price from another issue.
      if (p.priced.rateScheduleId !== chosen.id) return { ok: false, errors: { scheduleItem: scopeFaultText("CHANGED") } };
      priced = p.priced;
    }
    const rate: Sen | null = priced ? priced.rate : rateRaw == null ? null : parseSen(rateRaw);
    // Each figure, and quantity × rate, must fit its column; refused by name, never an overflow.
    const size = lineSizeFaults(quantity, rate);
    if (size.length) return { ok: false, errors: Object.fromEntries(size.map((f) => [f.field === "rate" ? (priced ? "scheduleItem" : "rate") : "quantity", scopeFaultText(f)])) };
    const amount = itemAmount(quantity, rate);
    const row = {
      sectionId: section.id, itemRef, description, unit, kind, provisional, sortOrder,
      quantity, rate: rate == null ? null : senToDecimalString(rate), amount: amount == null ? null : senToDecimalString(amount),
      ...(priced
        ? { rateSource: "SCHEDULE" as const, rateScheduleId: priced.rateScheduleId, rateItemCode: priced.rateItemCode, scheduleLabelSnapshot: priced.scheduleLabelSnapshot, scheduleIssueSnapshot: priced.scheduleIssueSnapshot, scheduleEffectiveFromSnapshot: dayToDate(priced.scheduleEffectiveFromSnapshot) }
        : { rateSource: "ENTERED" as const, rateScheduleId: null, rateItemCode: null, scheduleLabelSnapshot: null, scheduleIssueSnapshot: null, scheduleEffectiveFromSnapshot: null }),
    };
    const saved = before ? await tx.bqItem.update({ where: { id: before.id }, data: row }) : await tx.bqItem.create({ data: { organisationId: l.org.id, ...row } });
    await audit(tx, l.org.id, ENTITY.bqItem, saved.id, label(l, `Bill of quantities v${v.versionNo} · ${itemRef || description}`), before ? "UPDATE" : "CREATE",
      itemAudit(before ? { ...lineOf(before), rateFrom: fromText(before) } : null, { itemRef, description, unit, kind, quantity, rate, provisional, rateFrom: fromText(priced) }));
    return { ok: true };
  });
}

export async function removeBqItem(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const itemId = String(data.get("itemId") ?? "");
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, versionId);
    const i = await tx.bqItem.findFirst({ where: { id: itemId, section: { versionId: v.id } } });
    if (!i) return RECORD_GONE;
    await tx.bqItem.delete({ where: { id: i.id } });
    await audit(tx, l.org.id, ENTITY.bqItem, i.id, label(l, `Bill of quantities v${v.versionNo} · ${i.itemRef || i.description}`), "DELETE", itemAudit(null, lineOf(i)));
    return { ok: true };
  });
}

/**
 * Finalise the draft (FR-EST-001, 003): judged on the locked version with the policy, the
 * preparer's qualifications and the organisation's day read in the transaction; frozen with
 * its totals, the standard's label and the preparer's qualification as they stood; the
 * version it revises is superseded in the same act.
 */
export async function finaliseBq(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  return inExercise(exerciseId, async (tx, l) => {
    await lockBqRows(tx, exerciseId);
    const versions = await loadBqVersions(exerciseId, tx);
    const v = versions.find((x) => x.id === versionId);
    if (!v) return RECORD_GONE;
    const policy = await loadScopePolicy(l.org.id, tx);
    const qualifications = await loadQualifications(l.org.id, tx);
    const holdings = v.preparerPersonId ? await loadHoldings(l.org.id, tx, [v.preparerPersonId]) : [];
    const lines = linesOf(v);
    const faults = finaliseFaults({ status: v.status, scopedBy: v.scopedBy, followsStandard: v.followsStandard, departuresText: v.departuresText, preparerPersonId: v.preparerPersonId, lines, sectionNumbers: v.sections.map((s) => s.number) }, { policy, holdings, qualifications, today: today(l), exerciseStatus: l.ex.status });
    if (blocking(faults).length) return refuse(faults);
    const day = today(l)!;
    const code = policy.bqPreparerQualificationCode!;
    const holding = holdingOn(holdings, v.preparerPersonId!, code, day, qualifications)!;
    const computed = bqTotals(lines, v.provisionalExcludedFromFirm);
    const totals = totalsSnapshot(computed);
    const qualification = qualificationSnapshot(holding, qualifications.find((q) => q.code === code), day);
    for (const prev of versions.filter((x) => x.status === "FINALISED")) {
      await tx.bqVersion.update({ where: { id: prev.id }, data: { status: "SUPERSEDED" } });
      await audit(tx, l.org.id, ENTITY.bqVersion, prev.id, label(l, `Bill of quantities v${prev.versionNo}`), "UPDATE", bqStatusAudit("FINALISED", "SUPERSEDED", { supersededBy: `version ${v.versionNo}` }));
    }
    await tx.bqVersion.update({
      where: { id: v.id },
      data: { status: "FINALISED", finalisedAt: new Date(), totalsSnapshot: totals, standardLabelSnapshot: policy.measurementStandardLabel, preparerQualificationSnapshot: qualification },
    });
    await audit(tx, l.org.id, ENTITY.bqVersion, v.id, label(l, `Bill of quantities v${v.versionNo}`), "UPDATE",
      bqFinalisedAudit(computed, { standard: policy.measurementStandardLabel, preparerQualification: qualification.name }));
    return { ok: true };
  });
}

/// Start a revision: a new draft copied from the latest finalised version, with the reason.
export async function startBqRevision(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const reason = String(data.get("reason") ?? "").trim();
  return inExercise(exerciseId, async (tx, l) => {
    await lockBqRows(tx, exerciseId);
    const versions = await loadBqVersions(exerciseId, tx);
    const faults = reviseFaults(versions, l.ex.status, reason);
    if (faults.length) return faults.some((f) => f.code === "REASON_REQUIRED") && faults.length === 1 ? { ok: false, errors: { reason: scopeFaultText("REASON_REQUIRED") } } : refuse(faults);
    const from = versions.find((x) => x.status === "FINALISED")!;
    const versionNo = Math.max(...versions.map((x) => x.versionNo)) + 1;
    const v = await tx.bqVersion.create({
      data: {
        organisationId: l.org.id, exerciseId, versionNo, status: "DRAFT", templateCode: from.templateCode, scopedBy: from.scopedBy, scopeStatement: from.scopeStatement,
        followsStandard: from.followsStandard, departuresText: from.departuresText, preparerPersonId: from.preparerPersonId, provisionalExcludedFromFirm: from.provisionalExcludedFromFirm, revisionReason: reason,
      },
    });
    await audit(tx, l.org.id, ENTITY.bqVersion, v.id, label(l, `Bill of quantities v${versionNo}`), "CREATE", bqStatusAudit(null, "DRAFT", { version: versionNo, revises: `version ${from.versionNo}`, lines: from.sections.reduce((n, s) => n + s.items.length, 0) }), reason);
    // Every section and line copied is its own row, each audited as created (as startBq and saveBqItem do).
    for (const s of from.sections) {
      const ns = await tx.bqSection.create({ data: { organisationId: l.org.id, versionId: v.id, number: s.number, title: s.title, sortOrder: s.sortOrder } });
      await audit(tx, l.org.id, ENTITY.bqSection, ns.id, label(l, `Bill of quantities v${versionNo} · section ${s.number}`), "CREATE", sectionAudit(null, { number: s.number, title: s.title }));
      for (const i of s.items) {
        const ni = await tx.bqItem.create({
          data: {
            organisationId: l.org.id, sectionId: ns.id, itemRef: i.itemRef, description: i.description, unit: i.unit, kind: i.kind, quantity: i.quantity, rate: i.rate, amount: i.amount, provisional: i.provisional, rateSource: i.rateSource, sortOrder: i.sortOrder,
            // A line priced from a schedule keeps what the issue said, into the revision too (FR-EST-004).
            rateScheduleId: i.rateScheduleId, rateItemCode: i.rateItemCode, scheduleLabelSnapshot: i.scheduleLabelSnapshot, scheduleIssueSnapshot: i.scheduleIssueSnapshot, scheduleEffectiveFromSnapshot: i.scheduleEffectiveFromSnapshot,
          },
        });
        await audit(tx, l.org.id, ENTITY.bqItem, ni.id, label(l, `Bill of quantities v${versionNo} · ${i.itemRef || i.description}`), "CREATE", itemAudit(null, { ...lineOf(i), rateFrom: fromText(i) }));
      }
    }
    return { ok: true };
  });
}

// ------------------------------------------------------------------ specification panel

/**
 * Save the panel's facts (creating it on first save). Editing a panel that has standing
 * verifications, or is verified, clears them (kept, marked cleared, each audited) and
 * returns it to a draft: they attested facts that have changed.
 */
export async function savePanel(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const contractKindCode = r.optionalText("contractKindCode");
  const contractKindOther = r.text("contractKindOther", "Contract kind, specified", { max: 300 });
  const projectStatusCode = r.optionalText("projectStatusCode");
  const projectStatusOther = r.text("projectStatusOther", "Project status, specified", { max: 300 });
  const currentRevisionNo = r.optionalText("currentRevisionNo");
  const currentRevisionOn = r.date("currentRevisionOn", "Current revision date");
  const revisedRevisionNo = r.optionalText("revisedRevisionNo");
  const revisedRevisionOn = r.date("revisedRevisionOn", "Revised revision date");
  const completionPeriodText = r.text("completionPeriodText", "Completion period", { max: 300 });
  const bqVersionId = r.optionalText("bqVersionId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(exerciseId, async (tx, l) => {
    const fault = panelEditFault(l.ex.status);
    if (fault.length) return refuse(fault);
    const existing = await tx.specificationPanel.findUnique({ where: { exerciseId }, select: { id: true } });
    if (existing) await lockPanelRow(tx, existing.id);
    const before = await loadPanel(exerciseId, tx);
    const policy = await loadScopePolicy(l.org.id, tx);
    // A listed code must be a value of the configured list.
    const listed = async (taxonomyCode: string | null, code: string | null, field: string) => {
      if (!code) return null;
      const ok = taxonomyCode ? await tx.taxonomyValue.findFirst({ where: { code, taxonomy: { organisationId: l.org.id, code: taxonomyCode } }, select: { id: true } }) : null;
      if (!ok) throw new Refusal({ ok: false, errors: { [field]: "That is not on the configured list. Choose one from it, or specify it in words." } });
      return code;
    };
    const kind = await listed(policy.panelContractKindTaxonomyCode, contractKindCode, "contractKindCode");
    const status = await listed(policy.panelProjectStatusTaxonomyCode, projectStatusCode, "projectStatusCode");
    const bq = bqVersionId ? await tx.bqVersion.findFirst({ where: { id: bqVersionId, exerciseId }, select: { id: true, versionNo: true } }) : null;
    if (bqVersionId && !bq) return { ok: false, errors: { bqVersionId: "That bill is not this exercise's." } };
    const after = {
      contractKindCode: kind, contractKindOther, projectStatusCode: status, projectStatusOther, currentRevisionNo, currentRevisionOn, revisedRevisionNo, revisedRevisionOn, completionPeriodText, bqVersionId: bq?.id ?? null,
    };
    const panelLabel = label(l, "Specification panel");
    // The trail records a listed value by its name on the configured list, never its code.
    const listValues = async (taxonomyCode: string | null) =>
      taxonomyCode ? tx.taxonomyValue.findMany({ where: { taxonomy: { organisationId: l.org.id, code: taxonomyCode } }, select: { code: true, nameEn: true } }) : [];
    const kinds = await listValues(policy.panelContractKindTaxonomyCode);
    const statuses = await listValues(policy.panelProjectStatusTaxonomyCode);
    const facts = (p: Omit<PanelAuditFacts, "contractKind" | "projectStatus"> & { contractKindCode: string | null; projectStatusCode: string | null }): PanelAuditFacts => ({
      ...p, contractKind: listValueLabel(kinds, p.contractKindCode), projectStatus: listValueLabel(statuses, p.projectStatusCode),
    });
    const afterFacts = facts({ ...after, bqVersionNo: bq?.versionNo ?? null });
    if (!before) {
      const p = await tx.specificationPanel.create({ data: { organisationId: l.org.id, exerciseId, ...after } });
      await audit(tx, l.org.id, ENTITY.panel, p.id, panelLabel, "CREATE", panelAudit(null, afterFacts));
      return { ok: true };
    }
    const clears = editClearsVerifications({ status: before.status, verifications: before.verifications });
    const changes = panelAudit(facts({ ...before, bqVersionNo: before.bqVersion?.versionNo ?? null }), afterFacts);
    if (changes.length === 0) return { ok: true };
    await tx.specificationPanel.update({ where: { id: before.id }, data: { ...after, ...(clears ? { status: "DRAFT", verifiedAt: null, verifiedSnapshot: Prisma.DbNull } : {}) } });
    await audit(tx, l.org.id, ENTITY.panel, before.id, panelLabel, "UPDATE", [...changes, ...(before.status === "VERIFIED" ? [{ field: "status", before: "Verified", after: "Draft" }] : [])]);
    if (clears) {
      const now = new Date();
      for (const v of standingVerifications(before.verifications) as typeof before.verifications) {
        await tx.specPanelVerification.update({ where: { id: v.id }, data: { clearedAt: now } });
        await audit(tx, l.org.id, ENTITY.verification, v.id, label(l, `Specification panel · ${v.columnLabelSnapshot}`), "UPDATE", verificationClearedAudit({ column: v.columnLabelSnapshot, personName: v.person.name }));
      }
    }
    return { ok: true };
  });
}

/// Record one column's verification: attested on behalf of the person named, on a day not after today.
export async function recordPanelVerification(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const columnCode = r.text("columnCode", "Column", { required: true });
  const personId = r.optionalText("personId");
  const verifiedOn = r.date("verifiedOn", "Verified on");
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  return inExercise(exerciseId, async (tx, l) => {
    const existing = await tx.specificationPanel.findUnique({ where: { exerciseId }, select: { id: true } });
    if (!existing) return { ok: false, message: "Save the panel's details first." };
    await lockPanelRow(tx, existing.id);
    const p = (await loadPanel(exerciseId, tx))!;
    const columns = await loadPanelColumns(l.org.id, tx);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return { ok: false, errors: { personId: scopeFaultText("PERSON_UNKNOWN") } };
    const faults = verifyFaults({ columnCode, personId: person?.id ?? null, verifiedOn: verifiedOn ? storedDay(verifiedOn) : null }, p, { columns, today: today(l), exerciseStatus: l.ex.status });
    if (faults.length) return refuse(faults);
    const column = columnsInForce(columns, today(l)).find((c) => c.code === columnCode)!;
    const row = await tx.specPanelVerification.create({ data: { organisationId: l.org.id, panelId: p.id, columnCode, columnLabelSnapshot: column.labelEn, personId: person!.id, verifiedOn: verifiedOn!, note } });
    await audit(tx, l.org.id, ENTITY.verification, row.id, label(l, `Specification panel · ${column.labelEn}`), "CREATE", verificationAudit({ column: column.labelEn, personName: person!.name, verifiedOn: storedDay(verifiedOn!), note }));
    return { ok: true };
  });
}

/**
 * Mark the panel VERIFIED (Q-1): judged on the locked panel, its standing verifications,
 * the columns and the limit in force, the bill it names and the live SULIT scans of its
 * signed form, all read in the transaction; frozen with what it was verified on.
 */
export async function markPanelVerified(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  return inExercise(exerciseId, async (tx, l) => {
    const existing = await tx.specificationPanel.findUnique({ where: { exerciseId }, select: { id: true } });
    if (!existing) return { ok: false, message: "Save the panel's details first." };
    await lockPanelRow(tx, existing.id);
    const p = (await loadPanel(exerciseId, tx))!;
    // BD-62-26: a draft, or a verified panel whose scan has gone, may be verified (again); one standing verified may not.
    const state = panelState({ status: p.status, liveScanVersionIds: p.liveScanVersionIds, verifiedSnapshot: p.verifiedSnapshot });
    const stateFault = verifyPanelFault(state);
    if (stateFault) return refuse([stateFault]);
    const columns = await loadPanelColumns(l.org.id, tx);
    const policy = await loadScopePolicy(l.org.id, tx);
    const rules = await loadScopeRules(l.org.id, l.ex, tx);
    const faults = panelFaults(
      { status: p.status, contractKindCode: p.contractKindCode, contractKindOther: p.contractKindOther, projectStatusCode: p.projectStatusCode, projectStatusOther: p.projectStatusOther, bq: p.bqVersion, verifications: p.verifications, liveSulitScans: p.liveSulitScans },
      { columns, policy, today: today(l), exerciseStatus: l.ex.status, bqRequired: rules.basis?.requiresBq ?? null },
    );
    if (blocking(faults).length) return refuse(faults);
    const scans = await tx.documentAttachment.findMany({ where: { specificationPanelId: p.id, purpose: "SPEC_PANEL_FORM", detachedAt: null, version: { withdrawnAt: null, document: { classificationSnapshot: "SULIT" } } }, select: { versionId: true, version: { select: { versionNo: true, document: { select: { title: true } } } } } });
    const standing = standingVerifications(p.verifications) as typeof p.verifications;
    const snapshot = {
      columns: columnsInForce(columns, today(l)).map((c) => ({ code: c.code, label: c.labelEn })),
      verifications: standing.map((v) => ({ column: v.columnLabelSnapshot, person: v.person.name, verifiedOn: storedDay(v.verifiedOn) })),
      signatoryLimit: policy.panelSignatoryLimit,
      signatoryLimitProvenance: policy.panelSignatoryLimitProvenance,
      scans: scans.map((s) => ({ versionId: s.versionId, title: s.version.document.title, versionNo: s.version.versionNo })),
      bqVersionNo: p.bqVersion?.versionNo ?? null,
    };
    // Verifying again rewrites the snapshot with the scans live now; the trail keeps what it was verified on before.
    const prior = state === "SCAN_GONE" ? (p.verifiedSnapshot as { verifications?: { column: string; person: string }[]; scans?: { title: string; versionNo: number }[] } | null) : null;
    const verifiersText = (vs: readonly { column: string; person: string }[]) => vs.map((v) => `${v.column}: ${v.person}`).join("; ") + " (recorded on behalf of, not signed)";
    const scansText = (ss: readonly { title: string; versionNo: number }[]) => ss.map((s) => `${s.title}, version ${s.versionNo} (${CLASSIFICATION_LABEL.SULIT})`).join("; ");
    await tx.specificationPanel.update({ where: { id: p.id }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedSnapshot: snapshot } });
    await audit(tx, l.org.id, ENTITY.panel, p.id, label(l, "Specification panel"), "UPDATE", [
      { field: "status", before: PANEL_STATE_LABEL[state], after: PANEL_STATE_LABEL.VERIFIED },
      { field: "verifiedBy", before: prior?.verifications ? verifiersText(prior.verifications) : null, after: verifiersText(snapshot.verifications) },
      { field: "signedForm", before: prior?.scans ? scansText(prior.scans) : null, after: scansText(snapshot.scans) },
    ], state === "SCAN_GONE" ? "Verified again: the scan it was verified on is no longer live." : "");
    const warns = faults.filter((f) => f.level === "warn").map((f) => scopeFaultText(f));
    return { ok: true, message: warns.join(" ") || undefined };
  });
}

// ------------------------------------------------------------------ company estimate (sealed)

/// The typed figure, in sen, or null. Never echoed back: the form shows a fixed sentence.
function readValue(data: FormData): Sen | null {
  const raw = String(data.get("value") ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return parseSen(raw);
}

/// The organisation's day at save, never typed. Null while no zone is set (versionFaults refuses then).
const preparedOnOf = (l: LockedExercise) => {
  const d = todayIn(new Date(), l.org.timeZone);
  return d ? dayToDate(d) : null;
};

/**
 * Prepare a fresh estimate: version 1 by its preparer (FR-EST-006). Refused while an
 * estimate not void exists (OD-2): the lib on the locked rows, and the partial unique index
 * behind it. 6.2 passes no closing (X-1).
 */
export async function prepareEstimate(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const personId = String(data.get("personId") ?? "").trim() || null;
  const value = readValue(data);
  return inExercise(exerciseId, async (tx, l) => {
    await lockLiveEstimateRows(tx, exerciseId);
    const estimates = await tx.companyEstimate.findMany({ where: { exerciseId }, select: { state: true } });
    const live = startFault(estimates);
    if (live) return refuseCodes([live.code]);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return refuseCodes(["PERSON_UNKNOWN"]);
    const result = actionResult(versionFaults({ value, personId: person?.id ?? null, reason: "" }, null, { closingAt: null, timeZone: l.org.timeZone, exerciseStatus: l.ex.status, now: new Date() }));
    if (!result.ok) return refuseCodes(result.codes);
    const preparedOn = preparedOnOf(l)!;
    const bq = await tx.bqVersion.findFirst({ where: { exerciseId, status: "FINALISED" }, select: { id: true } });
    const est = await tx.companyEstimate.create({ data: { organisationId: l.org.id, exerciseId, preparerPersonId: person!.id, classification: "SULIT", state: "DRAFT", currentVersionNo: 1 } });
    const v = await writeEstimateVersion(tx, { organisationId: l.org.id, estimateId: est.id, versionNo: 1, value: value!, reason: "", preparedOn, preparerPersonId: person!.id, bqVersionId: bq?.id ?? null });
    const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: est.id, kind: "PREPARED", personId: person!.id, capacity: "Preparer", versionNo: 1 } });
    await audit(tx, l.org.id, ENTITY.estimate, est.id, label(l, "Company estimate"), "CREATE", estimateCreatedAudit({ preparerName: person!.name, classification: CLASSIFICATION_LABEL.SULIT }));
    await audit(tx, l.org.id, ENTITY.estimateVersion, v.id, label(l, "Company estimate · version 1"), "CREATE", estimateVersionAudit({ versionNo: 1, preparerName: person!.name, preparedOn: storedDay(preparedOn) }));
    await audit(tx, l.org.id, ENTITY.estimateEvent, ev.id, label(l, "Company estimate · prepared"), "CREATE", estimateEventAudit({ kind: "PREPARED", personName: person!.name, capacity: "Preparer", versionNo: 1 }));
    return { ok: true };
  });
}

/// The live estimate's lock and re-read, as the rules see it (never its figure).
async function lockedEstimate(tx: Tx, l: LockedExercise, estimateId: string) {
  await lockEstimateRow(tx, estimateId);
  const e = (await loadEstimates(l.ex.id, tx)).find((x) => x.id === estimateId);
  if (!e) throw new Refusal(RECORD_GONE);
  return { row: e, facts: estimateFactsOf(e) };
}

/**
 * Amend: the next version by the same preparer, with the reason (FR-EST-009). The reason is
 * sealed with the figure: stored by the store, never in the audit row's reason.
 */
export async function amendEstimate(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const estimateId = String(data.get("estimateId") ?? "");
  const personId = String(data.get("personId") ?? "").trim() || null;
  const reason = String(data.get("reason") ?? "");
  const value = readValue(data);
  return inExercise(exerciseId, async (tx, l) => {
    const { row, facts } = await lockedEstimate(tx, l, estimateId);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return refuseCodes(["PERSON_UNKNOWN"]);
    const result = actionResult(versionFaults({ value, personId: person?.id ?? null, reason }, facts, { closingAt: null, timeZone: l.org.timeZone, exerciseStatus: l.ex.status, now: new Date() }));
    if (!result.ok) return refuseCodes(result.codes);
    const versionNo = facts.currentVersionNo + 1;
    const preparedOn = preparedOnOf(l)!;
    const bq = await tx.bqVersion.findFirst({ where: { exerciseId, status: "FINALISED" }, select: { id: true } });
    const v = await writeEstimateVersion(tx, { organisationId: l.org.id, estimateId: row.id, versionNo, value: value!, reason, preparedOn, preparerPersonId: person!.id, bqVersionId: bq?.id ?? null });
    await tx.companyEstimate.update({ where: { id: row.id }, data: { currentVersionNo: versionNo } });
    const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: row.id, kind: "AMENDED", personId: person!.id, capacity: "Preparer", versionNo } });
    await audit(tx, l.org.id, ENTITY.estimateVersion, v.id, label(l, `Company estimate · version ${versionNo}`), "CREATE", estimateVersionAudit({ versionNo, preparerName: person!.name, preparedOn: storedDay(preparedOn) }));
    await audit(tx, l.org.id, ENTITY.estimateEvent, ev.id, label(l, "Company estimate · amended"), "CREATE", estimateEventAudit({ kind: "AMENDED", personName: person!.name, capacity: "Preparer", versionNo }));
    return { ok: true };
  });
}

/// Lodge the current version into the sealed set (FR-EST-010): copy 1, with who lodged it.
export async function lodgeEstimate(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const estimateId = String(data.get("estimateId") ?? "");
  const personId = String(data.get("personId") ?? "").trim() || null;
  const capacity = String(data.get("capacity") ?? "").trim().slice(0, 200);
  return inExercise(exerciseId, async (tx, l) => {
    const { row, facts } = await lockedEstimate(tx, l, estimateId);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return refuseCodes(["PERSON_UNKNOWN"]);
    const result = actionResult(lodgeFaults(facts, { personId: person?.id ?? null }, l.ex.status));
    if (!result.ok) return refuseCodes(result.codes);
    await tx.companyEstimate.update({ where: { id: row.id }, data: { state: "LODGED", lodgedAt: new Date() } });
    const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: row.id, kind: "LODGED", personId: person!.id, capacity, versionNo: facts.currentVersionNo, copyNo: 1 } });
    if (facts.state !== "LODGED") await audit(tx, l.org.id, ENTITY.estimate, row.id, label(l, "Company estimate"), "UPDATE", estimateStateAudit(ESTIMATE_STATE_LABEL[facts.state], ESTIMATE_STATE_LABEL.LODGED));
    await audit(tx, l.org.id, ENTITY.estimateEvent, ev.id, label(l, "Company estimate · lodged"), "CREATE", estimateEventAudit({ kind: "LODGED", personName: person!.name, capacity, versionNo: facts.currentVersionNo, copyNo: 1 }));
    return { ok: true };
  });
}

/// Record the second copy, retained, and where it is kept (FR-EST-007).
export async function recordRetainedCopy(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const estimateId = String(data.get("estimateId") ?? "");
  const personId = String(data.get("personId") ?? "").trim() || null;
  const capacity = String(data.get("capacity") ?? "").trim().slice(0, 200);
  const place = String(data.get("place") ?? "").trim().slice(0, 300);
  return inExercise(exerciseId, async (tx, l) => {
    const { row, facts } = await lockedEstimate(tx, l, estimateId);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return refuseCodes(["PERSON_UNKNOWN"]);
    const result = actionResult(retainFaults(facts, { personId: person?.id ?? null, place }));
    if (!result.ok) return refuseCodes(result.codes);
    await tx.companyEstimate.update({ where: { id: row.id }, data: { retainedPlace: place } });
    const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: row.id, kind: "RETAINED", personId: person!.id, capacity, note: place, versionNo: facts.lodgedVersionNo, copyNo: 2 } });
    await audit(tx, l.org.id, ENTITY.estimateEvent, ev.id, label(l, "Company estimate · copy retained"), "CREATE", estimateEventAudit({ kind: "RETAINED", personName: person!.name, capacity, versionNo: facts.lodgedVersionNo, copyNo: 2, place }));
    return { ok: true };
  });
}

/**
 * Void the estimate before lodgement (OD-2): the preparer cannot continue. The reason is
 * why, audited; it carries no figure. The versions are kept; a new officer prepares afresh.
 */
export async function voidEstimate(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const estimateId = String(data.get("estimateId") ?? "");
  const reason = String(data.get("reason") ?? "").trim().slice(0, 2000);
  const personId = String(data.get("personId") ?? "").trim() || null;
  return inExercise(exerciseId, async (tx, l) => {
    const { row, facts } = await lockedEstimate(tx, l, estimateId);
    const person = await activePerson(l.org.id, personId, tx);
    if (personId && !person) return refuseCodes(["PERSON_UNKNOWN"]);
    const faults = voidFault(facts, reason);
    if (faults.length) return faults.length === 1 && faults[0].code === "REASON_REQUIRED" ? { ok: false, errors: { reason: scopeFaultText("REASON_REQUIRED") } } : refuseCodes(faults.map((f) => f.code));
    await tx.companyEstimate.update({ where: { id: row.id }, data: { state: "VOID", voidedAt: new Date(), voidReason: reason } });
    const ev = await tx.estimateEvent.create({ data: { organisationId: l.org.id, estimateId: row.id, kind: "VOIDED", personId: person?.id ?? null, note: reason, versionNo: facts.currentVersionNo } });
    await audit(tx, l.org.id, ENTITY.estimate, row.id, label(l, "Company estimate"), "UPDATE", estimateStateAudit(ESTIMATE_STATE_LABEL[facts.state], ESTIMATE_STATE_LABEL.VOID), reason);
    await audit(tx, l.org.id, ENTITY.estimateEvent, ev.id, label(l, "Company estimate · voided"), "CREATE", estimateEventAudit({ kind: "VOIDED", personName: person?.name ?? null, versionNo: facts.currentVersionNo, reason }), reason);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ increment 2: scope approval (OD-9, FR-REQ-014)

const ACTS = ["P", "JP", "R", "JR", "MR", "MJR", "A", "MA"] as const;

/**
 * Table the finalised bill's scope at a sitting of the committee the method names, as a
 * SCOPE matter that names the version by its typed key. Locks the exercise (requisition,
 * exercise, its bill versions) and then the sitting (`lockSittingIn`): no act takes them
 * the other way round. On the locked rows it re-runs `scopeCitationFault` (which version,
 * which committee, once per version) and `checkTabling` (a Secretariat holder on the
 * tabling day, attested). The committee's act is the officer's choice, as on the sitting's
 * own drawer. The matter is decided at the sitting like any other; scope approval is read
 * from that decision (`scopeApproval`), never stored beside it.
 */
export async function tableScope(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const exerciseId = exerciseIdOf(data);
  const versionId = String(data.get("versionId") ?? "");
  const meetingId = r.text("meetingId", "Sitting", { required: true });
  const act = r.choice("act", "The committee's act", ACTS, { required: true });
  const tabledByPersonId = r.optionalText("tabledByPersonId");
  if (r.failed || !act) return { ok: false, errors: r.errors };
  const roster = await loadRoster(ORGANISATION_CODE);
  const result = await inExercise(exerciseId, async (tx, l) => {
    await lockBqRows(tx, exerciseId);
    const version = await tx.bqVersion.findFirst({ where: { id: versionId, organisationId: l.org.id }, select: { id: true, exerciseId: true, status: true, versionNo: true } });
    if (!version) return RECORD_GONE;
    const s = await lockSittingIn(tx, meetingId, roster);
    if (!s) return { ok: false, errors: { meetingId: scopeFaultText("SITTING_GONE") } };
    const rules = await loadScopeRules(l.org.id, l.ex, tx);
    const matters = (await loadScopeMatters(exerciseId, tx)).filter((m) => m.bqVersionId === version.id);
    const faults = scopeCitationFault({
      exercise: { id: l.ex.id, status: l.ex.status },
      rule: rules.method,
      version,
      sitting: { committeeCode: s.meeting.committee.code, frozen: !sittingPermits(s.meeting.status, "TABLE") },
      matters,
    });
    if (blocking(faults).length) return refuse(faults);
    const code = s.meeting.committee.secretariatRoleCode;
    const tabling = checkTabling({ secretariatRoleCode: code, tabledByPersonId, holderIdsOnDate: secretariatHoldersOn(s.roster, code, s.today).map((h) => h.id), tablingDay: s.today });
    if (!tabling.ok) {
      return tabling.fault === "NOT_TABLED" || tabling.fault === "NOT_SECRETARIAT_HOLDER"
        ? { ok: false, errors: { tabledByPersonId: TABLING_FAULT_MESSAGE[tabling.fault] } }
        : { ok: false, message: `Nothing was saved: ${TABLING_FAULT_MESSAGE[tabling.fault]}` };
    }
    const subject = scopeMatterSubject(l.ex.reference, version.versionNo);
    const tabledAt = dayToDate(s.today!);
    const sequence = s.meeting.decisions.reduce((n, d) => Math.max(n, d.sequence), 0) + 1;
    const row = await tx.committeeDecision.create({
      data: { meetingId: s.meeting.id, subject, domain: SCOPE_DOMAIN, matterKind: "SCOPE", matterRef: l.ex.reference, bqVersionId: version.id, act, tabledByPersonId, tabledAt, sequence },
    });
    await audit(tx, l.org.id, "CommitteeDecision", row.id, label(l, `Scope matter, bill version ${version.versionNo}`), "CREATE",
      scopeTabledAudit({ subject, versionNo: version.versionNo, sitting: s.meeting.reference, committee: s.meeting.committee.nameEn, act: ACT_LABEL[act] ?? act, tabledBy: tabledByPersonId ? (s.names[tabledByPersonId] ?? null) : null, tabledOn: s.today! }));
    return { ok: true, message: `Tabled at ${s.meeting.reference}. It is decided there, at the sitting.` };
  });
  if (result.ok) {
    revalidatePath("/committees");
    revalidatePath(`/committees/${meetingId}`);
  }
  return result;
}

// ------------------------------------------------------------------ increment 2: CSV (OD-5, Q-3)

/**
 * Import a bill from the CSV the officer uploaded (Q-3). The file reached the portal
 * through the document store's upload Route Handler (a Server Action caps a body at 1 MB),
 * as a received document of the class the officer chose; this act takes its version id.
 * Under the exercise's lock, then the draft's, then the document's: the stored bytes are
 * read through the store façade and their fingerprint checked, decoded and parsed again
 * here (`parseBqCsv`, the same rule the drawer previewed with), and only a file with no
 * blocking finding is imported. The lines, the file's attachment to the version (purpose
 * BQ_IMPORT_SOURCE, by this act only) and every audit row are written in one transaction.
 * A draft that already has lines is replaced only when the officer says so, each removed
 * line audited. A refused import leaves the file in Received, not filed.
 */
export async function importBqCsv(_prev: FormState, data: FormData): Promise<FormState> {
  const exerciseId = exerciseIdOf(data);
  const bqVersionId = String(data.get("bqVersionId") ?? "");
  const documentVersionId = String(data.get("versionId") ?? "");
  const replace = data.get("replace") === "on" || data.get("replace") === "true";
  const s = blobStore();
  if ("fault" in s) return { ok: false, message: `Nothing was saved: ${documentFaultText({ code: s.fault, level: "block" })}` };
  return inExercise(exerciseId, async (tx, l) => {
    const v = await lockedDraft(tx, l, bqVersionId).catch((e) => {
      if (e instanceof Refusal && e.state === RECORD_GONE) throw new Refusal({ ok: false, message: scopeFaultText("NO_DRAFT") });
      throw e;
    });
    const doc = await lockVersion(tx, documentVersionId, l.org.id);
    if (!doc) return { ok: false, message: documentFaultText({ code: "VERSION_UNKNOWN", level: "block" }) };
    const stored = await tx.documentVersion.findUniqueOrThrow({ where: { id: doc.id }, select: { mediaType: true, originalFilename: true, document: { select: { id: true, title: true, status: true, classificationSnapshot: true, documentClass: { select: { classification: true } } } } } });
    if (stored.mediaType !== "text/csv") return { ok: false, message: scopeFaultText("FILE_NOT_CSV") };
    const bytes = await s.store.get(l.org.id, doc.sha256);
    if (!bytes || sha256Hex(bytes) !== doc.sha256) return { ok: false, message: scopeFaultText("FILE_UNREADABLE") };
    const decoded = decodeCsv(bytes);
    if ("fault" in decoded) return { ok: false, message: `${scopeFaultText("FILE_REFUSED")} ${csvFaultText(decoded.fault)}` };
    const parsed = parseBqCsv(decoded.text);
    const blocks = parsed.faults.filter((f) => f.level === "block");
    if (blocks.length) return { ok: false, message: `${scopeFaultText("FILE_REFUSED")} ${blocks.slice(0, 8).map(csvFaultText).join(" ")}${blocks.length > 8 ? ` And ${blocks.length - 8} more.` : ""}` };
    const existing = await tx.bqSection.findMany({ where: { versionId: v.id }, include: { items: true } });
    const existingLines = existing.reduce((n, x) => n + x.items.length, 0);
    if (existingLines > 0 && !replace) return { ok: false, errors: { replace: scopeFaultText("DRAFT_NOT_EMPTY") } };
    const already = await tx.documentAttachment.findFirst({ where: { bqVersionId: v.id, purpose: "BQ_IMPORT_SOURCE", detachedAt: null, version: { documentId: doc.documentId } }, select: { id: true } });
    const owner = bqVersionFacts({ status: v.status, exercise: { status: l.ex.status } });
    const attachFaults = attachFault({ purpose: "BQ_IMPORT_SOURCE", owner, version: doc, documentClass: stored.document.documentClass, documentClassification: stored.document.classificationSnapshot, alreadyAttached: !!already && !replace, byOwnerAct: true });
    if (blocking(attachFaults).length) return { ok: false, message: `Nothing was saved: ${blocking(attachFaults).map(documentFaultText).join(" ")}` };

    const vLabel = `Bill of quantities v${v.versionNo}`;
    if (replace) {
      // The files the replaced lines came from are no longer what the draft holds: taken off, with why, kept in the trail.
      const earlier = await tx.documentAttachment.findMany({ where: { bqVersionId: v.id, purpose: "BQ_IMPORT_SOURCE", detachedAt: null }, include: { version: { select: { versionNo: true, document: { select: { title: true } } } } } });
      for (const e of earlier) {
        const why = `Replaced: the draft's lines were imported again, from ${stored.originalFilename}.`;
        await tx.documentAttachment.update({ where: { id: e.id }, data: { detachedAt: new Date(), detachReason: why } });
        await writeAudit(tx, { organisationId: l.org.id, entity: "DocumentAttachment", entityId: e.id, entityLabel: `${label(l, vLabel)} · ${PURPOSE_LABEL.BQ_IMPORT_SOURCE}`, reason: why }, "UPDATE",
          detached({ purpose: "BQ_IMPORT_SOURCE", title: e.version.document.title, versionNo: e.version.versionNo, reason: why }));
      }
      for (const sec of existing) {
        for (const i of sec.items) {
          await tx.bqItem.delete({ where: { id: i.id } });
          await audit(tx, l.org.id, ENTITY.bqItem, i.id, label(l, `${vLabel} · ${i.itemRef || i.description}`), "DELETE", itemAudit(null, lineOf(i)));
        }
        await tx.bqSection.delete({ where: { id: sec.id } });
        await audit(tx, l.org.id, ENTITY.bqSection, sec.id, label(l, `${vLabel} · section ${sec.number}`), "DELETE", sectionAudit(null, { number: sec.number, title: sec.title }));
      }
    } else {
      // A draft with no lines may still hold empty sections (a template's headings): the
      // file's sections take their place, so none is doubled. Each removal is audited.
      const why = `Replaced by the sections of the imported file, ${stored.originalFilename}.`;
      for (const sec of existing) {
        await tx.bqSection.delete({ where: { id: sec.id } });
        await audit(tx, l.org.id, ENTITY.bqSection, sec.id, label(l, `${vLabel} · section ${sec.number}`), "DELETE", sectionAudit(null, { number: sec.number, title: sec.title }), why);
      }
    }
    let order = 0;
    for (const [si, sec] of parsed.sections.entries()) {
      const row = await tx.bqSection.create({ data: { organisationId: l.org.id, versionId: v.id, number: sec.number, title: sec.title, sortOrder: si + 1 } });
      await audit(tx, l.org.id, ENTITY.bqSection, row.id, label(l, `${vLabel} · section ${sec.number}`), "CREATE", sectionAudit(null, { number: sec.number, title: sec.title }));
      for (const i of sec.items) {
        const amount = itemAmount(i.quantity, i.rate);
        const item = await tx.bqItem.create({
          data: {
            organisationId: l.org.id, sectionId: row.id, itemRef: i.itemRef, description: i.description, unit: i.unit, kind: i.kind, provisional: i.provisional, sortOrder: ++order, rateSource: "ENTERED",
            quantity: i.quantity, rate: i.rate == null ? null : senToDecimalString(i.rate), amount: amount == null ? null : senToDecimalString(amount),
          },
        });
        await audit(tx, l.org.id, ENTITY.bqItem, item.id, label(l, `${vLabel} · ${i.itemRef || i.description}`), "CREATE", itemAudit(null, i));
      }
    }
    const attachment = await tx.documentAttachment.create({ data: { organisationId: l.org.id, purpose: "BQ_IMPORT_SOURCE", versionId: doc.id, bqVersionId: v.id } });
    const ownerLabel = label(l, vLabel);
    await writeAudit(tx, { organisationId: l.org.id, entity: "DocumentAttachment", entityId: attachment.id, entityLabel: `${ownerLabel} · ${PURPOSE_LABEL.BQ_IMPORT_SOURCE}` }, "CREATE",
      attached({ purpose: "BQ_IMPORT_SOURCE", title: stored.document.title, versionNo: doc.versionNo, sha256: doc.sha256, owner: ownerLabel }));
    if (stored.document.status === "STAGED") {
      await tx.document.update({ where: { id: stored.document.id }, data: { status: "FILED", filedAt: new Date() } });
      await writeAudit(tx, { organisationId: l.org.id, entity: "Document", entityId: stored.document.id, entityLabel: `Document · ${stored.document.title}` }, "UPDATE", filed());
    }
    await audit(tx, l.org.id, ENTITY.bqVersion, v.id, label(l, vLabel), "UPDATE",
      bqImportAudit({ file: stored.originalFilename, documentTitle: stored.document.title, versionNo: doc.versionNo, sha256: doc.sha256, sections: parsed.sections.length, lines: parsed.lineCount, replacedLines: replace ? existingLines : 0, mismatches: parsed.keyedMismatches.length, priced: parsed.priced }));
    revalidatePath("/configuration/documents");
    const warns = [...parsed.faults.filter((f) => f.level !== "block").map(csvFaultText), ...parsed.keyedMismatches.slice(0, 5).map(keyedMismatchText)];
    return { ok: true, message: [`Imported ${parsed.lineCount} ${parsed.lineCount === 1 ? "line" : "lines"} in ${parsed.sections.length} ${parsed.sections.length === 1 ? "section" : "sections"}; the file is kept with version ${v.versionNo}.`, ...warns].join(" ") };
  });
}

export interface BqExportResult {
  ok: boolean;
  message?: string;
  file?: string;
  fileName?: string;
  sha256?: string;
  /// This request's own id, so the browser saves each audited export once (`exportToSave`).
  exportId?: string;
}

/**
 * Export a version of the bill as CSV, priced or unpriced (OD-5, OD-8). Built here, on the
 * server, from the version's sections and lines only — the select below names nothing
 * else, so no company-estimate figure and no exercise value can reach the file (the SULIT
 * guard) — and recorded, with the file's digest, in the same transaction. The file comes
 * back to the browser to save, as the audit trail's export does.
 */
export async function exportBqCsv(_prev: BqExportResult, data: FormData): Promise<BqExportResult> {
  const exerciseId = exerciseIdOf(data);
  const bqVersionId = String(data.get("bqVersionId") ?? "");
  const priced = data.get("priced") === "yes";
  let out: BqExportResult = { ok: false };
  const result = await inExercise(exerciseId, async (tx, l) => {
    const v = await tx.bqVersion.findFirst({
      where: { id: bqVersionId, exerciseId },
      select: {
        id: true, versionNo: true,
        sections: { orderBy: [{ sortOrder: "asc" }, { number: "asc" }], select: { number: true, title: true, items: { orderBy: [{ sortOrder: "asc" }, { itemRef: "asc" }], select: { itemRef: true, description: true, unit: true, kind: true, quantity: true, rate: true, provisional: true } } } },
      },
    });
    if (!v) return RECORD_GONE;
    const frozen = { versionNo: v.versionNo, sections: v.sections.map((s) => ({ number: s.number, title: s.title, items: s.items.map(lineOf) })) };
    const file = bqToCsv(frozen, { priced });
    const fileName = bqCsvFilename(l.ex.reference, v.versionNo, priced);
    const sha256 = sha256Hex(new TextEncoder().encode(file));
    const lines = frozen.sections.reduce((n, s) => n + s.items.length, 0);
    await audit(tx, l.org.id, ENTITY.bqExport, v.id, label(l, `Bill of quantities v${v.versionNo} · CSV export`), "CREATE", bqExportAudit({ versionNo: v.versionNo, priced, fileName, sha256, lines }));
    out = { ok: true, file, fileName, sha256, exportId: randomUUID() };
    return { ok: true };
  });
  return result.ok ? out : { ok: false, message: result.message };
}
