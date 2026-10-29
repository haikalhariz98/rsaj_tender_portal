"use server";

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { toSecond } from "@/lib/bids/lateness";
import { closureFaults, survivingOf } from "@/lib/closeout/closure";
import { finalAccountOf, finalBasisMoved, RAISE_KEYS, type FinalJudged } from "@/lib/closeout/final-account";
import { declarationTakenUp, finalInputOf, finalSplitFor, financePaidOf, keyedOf, loadFinal, loadRequirements, type FinalRow } from "@/lib/closeout/final-load";
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
import { fitsMoneyColumn, formatMoney, parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";
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
 * - `addFinalDeduction` / `removeFinalDeduction`, `recordFinalPartyDue` (ruling 4 of the stage C review: what each live nominated party or assignee
 *   is due, a total, FR-FIN-011), `recordPackEntry`, `linkDeclaration`, `confirmFinalPayments` (Finance's FR-FIN-004): only while the certificate is
 *   a draft whose route is not open; a keyed line or due recomputes the certificate's figures and the payment's split, and is refused
 *   FINAL_BASIS_MOVED where what the raise read has moved since (S2 of the review). Lock order: the contract (`inContract`), then the FinalAccount
 *   row (`lockDraftFinal`), then its lines; the FINAL certificate is written only through the core's `refigureDraft`, which takes no lock of its own.
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
  const pre = await c.tx.finalAccount.findMany({ where: { contractId: c.l.contract.id, certificate: { status: { not: "VOID" } } }, select: { id: true, certificateId: true }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] });
  const live = pre.at(-1);
  if (!live) throw new ActRefusal({ ok: false, message: "Raise the final account first." });
  // The contract's lock serialises every act on its certificates; the domain row is locked after it.
  await c.tx.$queryRaw`SELECT id FROM "FinalAccount" WHERE id = ${live.id} FOR UPDATE`;
  const fa = (await loadFinal(c.l.contract.id, c.tx))!;
  const route = await c.tx.approvalInstance.findFirst({ where: { certificateId: fa.certificateId }, orderBy: { openedAt: "desc" }, select: { status: true } });
  if (fa.certificate.status !== "DRAFT" || route?.status === "PENDING" || route?.status === "APPROVED") refuse("Not recorded:", [{ code: "FINAL_SENT", level: "block" }]);
  return fa;
}

/// Recompute the account with its keyed lines and the parties' dues, and write its figures and split to the draft certificate and the account.
/// S2 (code review of close-out stage C): what the raise read is read again first, and a moved basis or a damages chain that no longer reads refuses
/// here, as the issue would, rather than refiguring on it. The split's part of `judgedUnder` is written again (ruling 4).
async function recompute(c: ActCtx, fa: FinalRow, keyed: ReturnType<typeof keyedOf>, partyLines: readonly { partyId: string; due: { toString(): string } }[] = fa.partyLines) {
  const baseline = finalBaselineOf(c.l);
  if (!baseline) throw new ActRefusal({ ok: false, message: "Not recorded: no baseline version is in force." });
  const p = await loadPayment(c.l.contract.id, c.tx);
  const r = finalInputOf(p, baseline, fa.previousBasis as FinalBasis, keyed, await completionOf(c), fa.certificateId);
  if (r.unreadable.length) refuse("Not recorded:", r.unreadable);
  const judged = fa.judgedUnder as unknown as FinalJudged;
  const moved = finalBasisMoved(judged, r.judged, RAISE_KEYS);
  if (moved.length) refuse("Not recorded:", moved);
  if (r.ladFaults.length) throw new ActRefusal({ ok: false, message: `Not recorded: ${r.ladFaults.map((f) => ladFaultWords(f)?.en ?? paymentFaultText(f)).join(" ")}` });
  const a = finalAccountOf(r.input);
  if (a.faults.length) refuse("Not recorded:", a.faults);
  const split = await finalSplitFor(c.tx, c.l.org.id, p, { partyLines }, a.recommended);
  const before = senFromDecimal(fa.recommended);
  if (!(await refigureDraft(c, fa.certificateId, finalSnapshotOf(c.today, a, split), `${c.label} · final certificate (draft)`, `payment recommended ${formatMoney(a.recommended)}`, `payment recommended ${formatMoney(before)}`))) refuse("Not recorded:", [{ code: "FINAL_SENT", level: "block" }]);
  await c.tx.finalAccount.update({ where: { id: fa.id, organisationId: c.l.org.id }, data: { recommended: money(a.recommended), judgedUnder: json({ ...judged, ...split.judged }) } });
  // S3: the account's own figure, before and after, in its own trail.
  await audit(c, "FinalAccount", fa.id, `${c.label} · final account`, "UPDATE", diffFields({ paymentRecommended: formatMoney(before) }, { paymentRecommended: formatMoney(a.recommended) }));
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
    const { faults: pre, r, p, basis } = await finalRaiseCheckOf(c.tx, c.l);
    if (pre.length) refuse("Not raised:", pre);
    if (!r) throw new ActRefusal({ ok: false, message: "Not raised: no baseline version is in force." });
    // The damages chain as an interim reads it (its own words).
    if (r.ladFaults.length) throw new ActRefusal({ ok: false, message: `Not raised: ${r.ladFaults.map((f) => ladFaultWords(f)?.en ?? paymentFaultText(f)).join(" ")}` });
    const a = finalAccountOf(r.input);
    if (a.faults.length) refuse("Not raised:", a.faults);
    // Ruling 4: the split as it stands at the raise (no party's due is recorded yet), frozen with what it was judged under.
    const split = await finalSplitFor(c.tx, c.l.org.id, p, null, a.recommended);
    const form = await c.tx.certificateKindSetting.findUnique({ where: { organisationId_kind: { organisationId: c.l.org.id, kind: "FINAL" } }, select: { templateId: true, routingTypeId: true } });
    if (!form?.templateId) throw new ActRefusal({ ok: false, message: refusalText("Not raised:", [noFormFault("FINAL")]) });
    const certId = await openCertificate(c.tx, toAuditActor(actor), c.l, { kind: "FINAL", templateId: form.templateId, routingTypeId: form.routingTypeId, sectionId: null, computed: finalSnapshotOf(c.today, a, split) }, c.now, c.today);
    const fa = await c.tx.finalAccount.create({
      data: {
        organisationId: c.l.org.id, certificateId: certId, contractId: c.l.contract.id, finalSum: money(a.finalSum), recommended: money(a.recommended), previousBasis: basis!, judgedUnder: json({ ...r.judged, ...split.judged }), personId: who.person.id, recordedAt: c.now,
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
  // S4 (code review of close-out stage C): as FormReader.money, a figure too large for the Decimal(18, 2) column is refused by name, never an overflow.
  else if (!fitsMoneyColumn(parseSen(raw))) r.errors.amount = "Amount is too large to record: at most 16 digits before the decimal point.";
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

// ------------------------------------------------------------------ FR-FIN-011: what each party is due (ruling 4, while a draft)

export async function recordFinalPartyDue(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const partyId = r.text("partyId", "Party", { required: true });
  const due = r.money("due", "Due on the final account", { required: true });
  if (r.failed || due == null) return { ok: false, errors: r.errors };
  return inContract(actor, toAuditActor(actor), idOf(data), now, "FINAL_ACCOUNT", async (c) => {
    const fa = await lockDraftFinal(c);
    // A live party of this contract (ADR 0025: totals only, as printed).
    const party = await c.tx.contractParty.findFirst({ where: { id: partyId, contractId: c.l.contract.id, organisationId: c.l.org.id, retiredOn: null }, select: { id: true, name: true } });
    if (!party) fieldError("partyId", "Choose a nominated party or assignee of this contract.");
    const before = fa.partyLines.find((x) => x.partyId === partyId) ?? null;
    await recompute(c, fa, keyedOf(fa), [...fa.partyLines.filter((x) => x.partyId !== partyId), { partyId, due }]);
    const row = await c.tx.finalPartyLine.upsert({ where: { finalAccountId_partyId: { finalAccountId: fa.id, partyId } }, update: { due, recordedAt: c.now }, create: { organisationId: c.l.org.id, finalAccountId: fa.id, partyId, due, recordedAt: c.now } });
    await audit(c, "FinalPartyLine", row.id, `${c.label} · final account · ${party!.name}`, before ? "UPDATE" : "CREATE", diffFields(before ? { dueOnTheFinalAccount: formatMoney(senFromDecimal(before.due)) } : null, { dueOnTheFinalAccount: formatMoney(parseSen(due)) }));
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
    if (before) {
      await c.tx.finalPackEntry.deleteMany({ where: { id: before.id, finalAccountId: fa.id } });
      // The replaced entry's own trail ends with its removal, under its own id (review of close-out stage C).
      await audit(c, "FinalPackEntry", before.id, `${c.label} · final account pack`, "DELETE", diffFields({ item: requirement!.labelEn, document: before.projectDocument?.title ?? null, notApplicable: before.notApplicableReason || null }, { item: null, document: null, notApplicable: null }), "Replaced by a new entry.");
    }
    const row = await c.tx.finalPackEntry.create({ data: { organisationId: c.l.org.id, finalAccountId: fa.id, requirementId, projectDocumentId: doc?.id ?? null, notApplicableReason: doc ? "" : reason.trim(), personId: who.id, recordedAt: c.now } });
    await audit(c, "FinalPackEntry", row.id, `${c.label} · final account pack`, "CREATE", diffFields(before ? { document: before.projectDocument?.title ?? null, notApplicable: before.notApplicableReason || null } : null, { item: requirement!.labelEn, document: doc?.title ?? null, notApplicable: doc ? null : reason.trim(), recordedFor: who.name }));
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
