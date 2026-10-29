"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { closureFaults, survivingOf } from "@/lib/closeout/closure";
import { finalAccountOf } from "@/lib/closeout/final-account";
import { declarationTakenUp, finalInputOf, financePaidOf, keyedOf, loadFinal, loadRequirements, type FinalRow } from "@/lib/closeout/final-load";
import { closureFactsOf, finalBaselineOf, finalRaiseCheckOf, finalSnapshotOf } from "@/lib/closeout/final-write";
import { writeStatus } from "@/lib/closeout/at-issue";
import { closeoutRefusal } from "@/lib/closeout/labels";
import { loadCloseout } from "@/lib/closeout/load";
import { KEYED_FINAL_KINDS, type FinalBasis, type Finding, type KeyedFinalKind } from "@/lib/closeout/types";
import { FINAL_LINE_WORDS } from "@/lib/closeout/final-words";
import { refusalText } from "@/lib/certificate/fault-text";
import { noFormFault } from "@/lib/certificate/form-needs";
import { openCertificate, refigureDraft } from "@/lib/certificate/write";
import { actStatusFault, type ContractAct } from "@/lib/contract/act-status";
import { contractLabel, withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayToDate, storedDay } from "@/lib/dates";
import { manualCloseout } from "@/lib/integration/closeout";
import { actCtx, type ActCtx, ActRefusal, afterAct, fieldError, lockUnappliedWaivers, NO_ZONE_STATE, personNamed, recordedFor, tableRefusal, thrownState } from "@/lib/matter/act";
import { formatMoney, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
import { ladFaultWords } from "@/lib/lad/labels";
import { loadPayment } from "@/lib/payment/load";
import { paymentFaultText } from "@/lib/payment/labels";
import { capacityText } from "@/lib/supervision/authority";
import { FormReader } from "@/lib/validate";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

/**
 * The final account and the close (Phase 2 close-out stage C; plan closeout-plan.md §4.6, §4.7; ADR 0047). Every act reads the server's clock once
 * on entry, runs in `inContract` (the contract's chain locked in the canonical order, its family's row of the act × status table asked, CANCELLED
 * first, an unset time zone refused), locks the FINAL certificate and then its final account after the contract, re-reads them on the locked
 * transaction, runs the pure rule again, writes, and audits before and after in the same transaction. A refusal throws, so nothing is half-written.
 *
 * - `raiseFinalAccount` (FINAL_ACCOUNT): the FINAL certificate raised as a draft through the 6.14 engine with its computed figures, and the approved
 *   waivers it applies marked applied on it (as an interim's raise does).
 * - `addFinalDeduction` / `removeFinalDeduction`, `recordPackEntry`, `linkDeclaration`, `confirmFinalPayments` (Finance's FR-FIN-004): only while
 *   the certificate is a draft whose route is not open; a keyed line recomputes the certificate's figures.
 * - Sending it is the certificate page's own act (refused by `finalRouteFaults` in `submitForApproval`); its issue is `KIND_ISSUE_HOOK.FINAL`; Finance's
 *   payment of it is the certificate page's own act (which writes the retention balance under FINAL_PAYMENT).
 * - `closeContract` (CLOSE): no route (ruling 16); refused by `closureFaults`; writes `ContractClosure` and CLOSED, then asks Finance to close the
 *   commitment through the manual adapter (INT-08).
 */

async function inContract(scope: OrgScope, actor: AuditActor, id: string, now: Date, family: ContractAct, fn: (c: ActCtx) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  try {
    result = await withLockedContract(scope.organisationId, id, async (tx, l) => {
      const refused = actStatusFault(family, l.contract.status as ContractStatus);
      if (refused) return tableRefusal(refused);
      const c = actCtx(tx, l, now, actor);
      return c ? fn(c) : NO_ZONE_STATE;
    });
  } catch (e) {
    return thrownState(e);
  }
  return afterAct(id, result);
}

const idOf = (data: FormData) => String(data.get("id") ?? "");
const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new ActRefusal({ ok: false, message: closeoutRefusal(lead, fs) });
};
const audit = (c: ActCtx, entity: string, id: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") =>
  action === "UPDATE" && changes.length === 0 ? Promise.resolve() : writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity, entityId: id, entityLabel: label, reason }, action, changes);
const json = (v: unknown) => v as Prisma.InputJsonValue;
const money = (v: bigint) => senToDecimalString(v);

/// The CPC's completion date: the final account's damages are charged to it (the window closes there).
async function completionOf(c: ActCtx): Promise<string> {
  const rows = await loadCloseout(c.l.contract.id, c.tx);
  if (rows.cpc?.certificate.status !== "ISSUED") refuse("Not recorded:", [{ code: "CPC_NOT_ISSUED", level: "block" }]);
  return storedDay(rows.cpc!.completionDate);
}

/// The live final account, its certificate locked, then the account; refused unless the certificate is a draft whose route is not open.
async function lockDraftFinal(c: ActCtx): Promise<FinalRow> {
  const pre = await c.tx.finalAccount.findMany({ where: { contractId: c.l.contract.id, certificate: { status: { not: "VOID" } } }, select: { id: true, certificateId: true } });
  const live = pre.at(-1);
  if (!live) throw new ActRefusal({ ok: false, message: "Raise the final account first." });
  // The contract's lock serialises every act on its certificates; the domain row is locked after it.
  await c.tx.$queryRaw`SELECT id FROM "FinalAccount" WHERE id = ${live.id} FOR UPDATE`;
  const fa = (await loadFinal(c.l.contract.id, c.tx))!;
  const route = await c.tx.approvalInstance.findFirst({ where: { certificateId: fa.certificateId }, orderBy: { openedAt: "desc" }, select: { status: true } });
  if (fa.certificate.status !== "DRAFT" || route?.status === "PENDING" || route?.status === "APPROVED") refuse("Not recorded:", [{ code: "FINAL_SENT", level: "block" }]);
  return fa;
}

/// Recompute the account with its keyed lines and write its figures to the draft certificate and the account.
async function recompute(c: ActCtx, fa: FinalRow, keyed: ReturnType<typeof keyedOf>) {
  const baseline = finalBaselineOf(c.l);
  if (!baseline) throw new ActRefusal({ ok: false, message: "Not recorded: no baseline version is in force." });
  const r = finalInputOf(await loadPayment(c.l.contract.id, c.tx), baseline, fa.previousBasis as FinalBasis, keyed, await completionOf(c), fa.certificateId);
  const a = finalAccountOf(r.input);
  if (a.faults.length) refuse("Not recorded:", a.faults);
  if (!(await refigureDraft(c, fa.certificateId, finalSnapshotOf(c.today, a), `${c.label} · final certificate (draft)`, `payment recommended ${formatMoney(a.recommended)}`))) refuse("Not recorded:", [{ code: "FINAL_SENT", level: "block" }]);
  await c.tx.finalAccount.update({ where: { id: fa.id, organisationId: c.l.org.id }, data: { recommended: money(a.recommended) } });
  return a;
}

// ------------------------------------------------------------------ FR-FIN-001, 003, 005–006, 011: the raise

export async function raiseFinalAccount(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const begun = await beginAct(actor, data, "FinalAccount.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const who = await recordedFor(c, act, { soOnly: true }, c.today);
    // As an interim's raise takes them (design note 6.13B §1): every waiver not yet applied, its matter then the waiver.
    await lockUnappliedWaivers(c.tx, c.l.contract.id);
    const { faults: pre, r, basis } = await finalRaiseCheckOf(c.tx, c.l);
    if (pre.length) refuse("Not raised:", pre);
    if (!r) throw new ActRefusal({ ok: false, message: "Not raised: no baseline version is in force." });
    // The damages chain as an interim reads it (its own words).
    if (r.ladFaults.length) throw new ActRefusal({ ok: false, message: `Not raised: ${r.ladFaults.map((f) => ladFaultWords(f)?.en ?? paymentFaultText(f)).join(" ")}` });
    const a = finalAccountOf(r.input);
    if (a.faults.length) refuse("Not raised:", a.faults);
    const form = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind: "FINAL" } }, select: { templateId: true, routingTypeId: true } });
    if (!form?.templateId) throw new ActRefusal({ ok: false, message: refusalText("Not raised:", [noFormFault("FINAL")]) });
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "FINAL", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed: finalSnapshotOf(c.today, a) }, c.now, c.today);
    const fa = await c.tx.finalAccount.create({
      data: {
        organisationId: c.l.org.id, certificateId: certId, contractId: c.l.contract.id, finalSum: money(a.finalSum), recommended: money(a.recommended), previousBasis: basis!, judgedUnder: json(r.judged), personId: who.person.id, recordedAt: c.now,
        finalLines: { create: a.lines.map((x) => ({ organisationId: c.l.org.id, block: x.block, kind: x.kind, amount: money(x.amount), label: x.label, sourceIds: json(x.sourceIds), keyed: false, recordedAt: c.now })) },
      },
    });
    // Each waiver applied is applied once, on this certificate (FR-LAD-009, the spec's I77).
    for (const w of r.applied) {
      const done = await c.tx.ladWaiver.updateMany({ where: { id: w.id, organisationId: c.l.org.id, appliedOnCertificateId: null }, data: { appliedOnCertificateId: certId, appliedAt: c.now } });
      if (done.count !== 1) throw new ActRefusal({ ok: false, message: "Not raised: a waiver changed while this was being saved. Reload and try again." });
      await audit(c, "LadWaiver", w.id, `${c.label} · waiver ${w.label}`, "UPDATE", diffFields({ applied: null }, { applied: "on the final account", amountWaived: formatMoney(w.amount) }));
    }
    await audit(c, "FinalAccount", fa.id, `${c.label} · final account`, "CREATE", diffFields(null, { finalContractSum: formatMoney(a.finalSum), less: formatMoney(a.less), deduct: formatMoney(a.deduct), paymentRecommended: formatMoney(a.recommended), previousPayments: basis === "AS_PAID" ? "as paid" : "before their deductions", raisedFor: who.person.name }));
    await act.write(c.tx, fa.id, { roleCode: who.soRoleCode });
    return { ok: true };
  });
}

// ------------------------------------------------------------------ the keyed deductions (while a draft)

const SIGNED_AMOUNT = /^-?\d+(\.\d{1,2})?$/;

export async function addFinalDeduction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const kind = r.choice("kind", "Deduction", KEYED_FINAL_KINDS, { required: true }) as KeyedFinalKind | null;
  const label = r.text("label", "Description", { max: 200 });
  const raw = String(data.get("amount") ?? "").replace(/,/g, "").trim();
  if (!raw) r.errors.amount = "Amount is required.";
  else if (!SIGNED_AMOUNT.test(raw) || (kind !== "LAD_ROUNDING" && raw.startsWith("-"))) r.errors.amount = kind === "LAD_ROUNDING" ? "A rounding is an amount, to two decimal places, with a minus where it is taken off." : "Amount must be an amount, to at most two decimal places.";
  if (kind === "OTHER" && !label.trim()) r.errors.label = "Say what the other deduction is.";
  if (r.failed || Object.keys(r.errors).length || !kind) return { ok: false, errors: r.errors };
  const amount = parseSen(raw);
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    const text = label.trim() || FINAL_LINE_WORDS[kind];
    await recompute(c, fa, [...keyedOf(fa), { kind, label: text, amount }]);
    const row = await c.tx.finalAccountLine.create({ data: { organisationId: c.l.org.id, finalAccountId: fa.id, block: "DEDUCT", kind, amount: money(amount), label: text, sourceIds: json([]), keyed: true, recordedAt: c.now } });
    await audit(c, "FinalAccountLine", row.id, `${c.label} · final account`, "CREATE", diffFields(null, { deduction: text, amount: formatMoney(amount) }));
    return { ok: true };
  });
}

export async function removeFinalDeduction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const lineId = String(data.get("lineId") ?? "");
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    const line = fa.finalLines.find((x) => x.id === lineId && x.keyed);
    if (!line) throw new ActRefusal({ ok: false, message: "That deduction is not on the final account." });
    await c.tx.finalAccountLine.deleteMany({ where: { id: line.id, finalAccountId: fa.id, keyed: true } });
    await recompute(c, fa, keyedOf({ finalLines: fa.finalLines.filter((x) => x.id !== line.id) }));
    await audit(c, "FinalAccountLine", line.id, `${c.label} · final account`, "DELETE", diffFields({ deduction: line.label, amount: formatMoney(senFromDecimal(line.amount)) }, { deduction: null, amount: null }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-FIN-008: the pack

export async function recordPackEntry(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const requirementId = r.text("requirementId", "Document", { required: true });
  const documentId = r.optionalText("projectDocumentId");
  const reason = r.text("notApplicableReason", "Why it does not apply", { max: 2000 });
  if (!documentId && !reason.trim()) r.errors.projectDocumentId = "Choose the document, or say why it does not apply.";
  if (documentId && reason.trim()) r.errors.notApplicableReason = "Choose a document or give a reason, not both.";
  if (r.failed || Object.keys(r.errors).length) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "FinalPackEntry.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    const who = await personNamed(c, act.subjectPersonId);
    const requirement = (await loadRequirements(c.l.org.id, c.today, c.tx)).find((x) => x.id === requirementId);
    if (!requirement) fieldError("requirementId", "Choose a close-out document in force.");
    const doc = documentId ? await c.tx.projectDocument.findFirst({ where: { id: documentId, contractId: c.l.contract.id, organisationId: c.l.org.id }, select: { id: true, title: true } }) : null;
    if (documentId && !doc) fieldError("projectDocumentId", "That document is not on this contract.");
    const before = fa.packEntries.find((e) => e.requirementId === requirementId) ?? null;
    if (before) await c.tx.finalPackEntry.deleteMany({ where: { id: before.id, finalAccountId: fa.id } });
    const row = await c.tx.finalPackEntry.create({ data: { organisationId: c.l.org.id, finalAccountId: fa.id, requirementId, projectDocumentId: doc?.id ?? null, notApplicableReason: doc ? "" : reason.trim(), personId: who.id, recordedAt: c.now } });
    await audit(c, "FinalPackEntry", row.id, `${c.label} · final account pack`, before ? "UPDATE" : "CREATE", diffFields(before ? { document: before.projectDocument?.title ?? null, notApplicable: before.notApplicableReason || null } : null, { item: requirement!.labelEn, document: doc?.title ?? null, notApplicable: doc ? null : reason.trim(), recordedFor: who.name }));
    await act.write(c.tx, row.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-FIN-007: the statutory declaration

export async function linkDeclaration(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const documentId = r.text("documentId", "Statutory declaration", { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    if (!(await declarationTakenUp(c.tx, c.l.contract.id, documentId))) fieldError("documentId", "Choose a statutory declaration of this contract that is taken up.");
    const doc = await c.tx.projectDocument.findFirstOrThrow({ where: { id: documentId, organisationId: c.l.org.id }, select: { title: true } });
    await c.tx.finalAccount.update({ where: { id: fa.id, organisationId: c.l.org.id }, data: { declarationDocumentId: documentId } });
    await audit(c, "FinalAccount", fa.id, `${c.label} · final account`, "UPDATE", diffFields({ statutoryDeclaration: fa.declarationDocument?.title ?? null }, { statutoryDeclaration: doc.title }));
    return { ok: true };
  });
}

// ------------------------------------------------------------------ FR-FIN-004: Finance's confirmation

export async function confirmFinalPayments(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const total = r.money("total", "Total paid", { required: true });
  if (r.failed || total == null) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "FinalAccount.financeConfirmedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    const who = await personNamed(c, act.subjectPersonId);
    const computed = financePaidOf(await loadPayment(c.l.contract.id, c.tx));
    await c.tx.finalAccount.update({ where: { id: fa.id, organisationId: c.l.org.id }, data: { financeConfirmedTotal: total, financeConfirmedByPersonId: who.id, financeConfirmedAt: c.now } });
    await audit(c, "FinalAccount", fa.id, `${c.label} · final account`, "UPDATE", diffFields({ financeConfirmed: fa.financeConfirmedTotal ? formatMoney(senFromDecimal(fa.financeConfirmedTotal)) : null }, { financeConfirmed: formatMoney(parseSen(total)), recordedPaymentsAddTo: formatMoney(computed), confirmedFor: who.name }));
    await act.write(c.tx, fa.id);
    return { ok: true, message: parseSen(total) === computed ? undefined : closeoutRefusal("Recorded.", [{ code: "FINANCE_TOTAL_DIFFERS", level: "block", data: { confirmed: parseSen(total).toString(), computed: computed.toString() } }]) };
  });
}

// ------------------------------------------------------------------ FR-FIN-014: the close (CO-10)

export async function closeContract(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const begun = await beginAct(actor, data, "ContractClosure.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inContract(actor, toAuditActor(actor), idOf(data), now, "CLOSE", async (c) => {
    const who = await recordedFor(c, act, { principalOrSo: true }, c.today);
    const { facts, dgb } = await closureFactsOf(c.tx, c.l);
    const fs = closureFaults(facts);
    if (fs.length) refuse("Not closed:", fs);
    const [rows, policy] = await Promise.all([loadCloseout(c.l.contract.id, c.tx), c.tx.postAwardPolicy.findUnique({ where: { organisationId: c.l.org.id }, select: { designBondYears: true } })]);
    const surviving = survivingOf(dgb, rows.cpc ? storedDay(rows.cpc.completionDate) : null, policy?.designBondYears ?? null);
    const fa = rows.final!;
    const preconditions = { finalCertificate: fa.certificate.number, paid: true, defectsOpen: 0, retentionHeld: "0.00", securitiesHeld: [], performance: "verified", checkedOn: c.today };
    const row = await c.tx.contractClosure.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, closedOn: dayToDate(c.today), preconditions: json(preconditions), surviving: json(surviving), personId: who.person.id, recordedAt: c.now } });
    // CLOSED, through the one status writer (contractTransition with the writer STATUS_WRITTEN_BY names), audited there.
    const moved = await writeStatus(c.tx, c.actor, c.l, "CLOSED", "CLOSE");
    if (moved) throw new ActRefusal({ ok: false, message: moved.replace("Not issued:", "Not closed:") });
    const label = contractLabel({ number: c.l.contract.number, award: { awardeeName: c.l.award.awardeeName } });
    await audit(c, "ContractClosure", row.id, label, "CREATE", diffFields(null, { closedOn: c.today, finalCertificate: fa.certificate.number ?? null, survives: surviving.map((s) => `${s.label}, released ${s.releaseOn ?? "Not set"}`).join("; ") || null, recordedFor: `${who.person.name}, ${capacityText(who.capacity, who.soLabel)}` }));
    await act.write(c.tx, row.id, { roleCode: who.soRoleCode });
    // INT-08 (CO-11): the finance system's hand-off, manual while no adapter exists.
    await manualCloseout.closeRequested({ contractNumber: c.l.contract.number, what: `Ask Finance to close commitment ${c.l.contract.number} and capitalise the asset` });
    return { ok: true };
  });
}
