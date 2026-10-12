"use server";

import type { FormState } from "@/components/record-editor";
import { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { dayToDate, instantAt, isClockTime, storedDay } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { manualFeeReceipt } from "@/lib/integration/fee-receipt";
import { addendaForNewPurchaser, addendumWindowFault, deliveryFaults, issueFaults, nextAddendumNumber, recipientsFor } from "@/lib/window/addendum";
import { addendumFields, deliveryFields, ENTITY, eventFields, partyFields, saleFields } from "@/lib/window/audit-view";
import { invitedSaleFault, windowEditFault } from "@/lib/window/edit";
import { eventFaults, heldFault, mandatoryPermittedFor } from "@/lib/window/events";
import { regKey } from "@/lib/window/invitees";
import { lockAddendumRows, lockSaleRows } from "@/lib/window/lock";
import { lockEnvelopeRows } from "@/lib/bids/lock";
import { closingDay, pathOf, phaseOf, renderAddendum } from "@/lib/window/judge";
import { isPublished } from "@/lib/window/phase";
import { windowFindingText } from "@/lib/window/labels";
import { eventFactsOf, type WindowData } from "@/lib/window/repo";
import { ATTESTABLE_CHECKS, isReceiptDuplicate, saleAnnotation, saleFaults, voidSaleFault } from "@/lib/window/sale";
import { CERT_SIGHTED, DELIVERY_METHODS, SITE_EVENT_KINDS, type CertSighted, type CheckState, type DeliveryMethod, type Finding, type PartySource, type SiteEventKind } from "@/lib/window/types";
import { FormReader } from "@/lib/validate";
import { supplierFaultText } from "@/lib/suppliers/labels";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import { linkPartyFaults } from "@/lib/suppliers/link";
import { lockSupplierRow } from "@/lib/suppliers/lock";
import { saleSupplier } from "@/lib/suppliers/sale";
import { registerAtSale } from "@/lib/suppliers/sale-hook";

import { markPurchasePaid, PurchaseBarred, PurchaseNotAwaiting } from "@/lib/portal/bids/purchase-paid";
import { activePerson, audit, CHANGED, exerciseIdOf, inWindow, label, NO_WINDOW, NO_ZONE, notes, refuse, Refusal, type LockedWindow } from "./shared";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import { beginAct } from "@/app/_auth/act";
import type { AuditActor } from "@/lib/auth/types";

/**
 * Writes for 6.5's registers (plan §4.4–4.6): the sale of the documents (FR-ADV-009–012), the
 * briefing and site visit with their attendance (FR-ADV-013) and the addenda with each copy's
 * delivery (FR-ADV-014). Each re-derives the window's phase now, under the locks, and re-runs its
 * rule on the locked rows (`shared.ts`).
 */

const TRI = ["yes", "no", "unset"] as const;
const tri = (v: (typeof TRI)[number] | null) => (v === "yes" ? true : v === "no" ? false : null);

/**
 * A receipt number taken by a sale on another exercise between the check and the commit reaches
 * the organisation's unique index (`isReceiptDuplicate`): the same refusal as the check, nothing saved.
 */
async function receiptGuarded(run: () => Promise<FormState>, refused: FormState): Promise<FormState> {
  try {
    return await run();
  } catch (e) {
    if (isReceiptDuplicate(e)) return refused;
    throw e;
  }
}

/// The party a register act names: an existing one by id, or one found or made by registration number.
async function partyFor(tx: Tx, actor: AuditActor, l: LockedWindow, d: WindowData, r: { partyId: string | null; name: string; registrationNo: string; address: string; phone: string; fax: string; email: string }, source: PartySource) {
  if (r.partyId) return d.parties.find((p) => p.id === r.partyId) ?? null;
  const known = d.parties.find((p) => regKey(p.registrationNo) === regKey(r.registrationNo));
  if (known) return known;
  const row = { source, name: r.name, registrationNo: r.registrationNo, address: r.address, phone: r.phone, fax: r.fax, email: r.email };
  const party = await tx.exerciseParty.create({ data: { organisationId: l.org.id, exerciseId: l.ex.id, ...row } });
  await audit(tx, actor, l.org.id, ENTITY.party, party.id, label(l, `Contractor ${r.name}`), "CREATE", diffFields(null, partyFields(row)));
  return party;
}

function readParty(r: FormReader) {
  const partyId = r.optionalText("partyId");
  const name = r.text("name", "Contractor", { required: !partyId, max: 240 });
  const registrationNo = r.text("registrationNo", "Registration number", { required: !partyId, max: 80 });
  return { partyId, name, registrationNo, address: r.text("address", "Address", { max: 1000 }), phone: r.text("phone", "Telephone", { max: 60 }), fax: r.text("fax", "Fax", { max: 60 }), email: r.text("email", "Email", { max: 200 }) };
}

// ------------------------------------------------------------------ sales

/**
 * Sell the documents (FR-ADV-009–012). The sale day is the organisation's today, stamped here; the
 * amount is the window's fee as it stands; the finance receipt number is consumed (or recorded
 * later, the sale then on the reconciliation list). Every issued addendum goes with the documents.
 *
 * 6.15a (FR-ADV-010, OD-5): for a party linked to the supplier register, the registration and
 * suspension checks are read from the register, the supplier row locked last, and its eligibility frozen
 * on the sale; a supplier not registered, suspended, blacklisted or cancelled is refused. A party not
 * linked keeps the officer's attestation ("not checked", OD-9), unless the policy requires the register
 * for a sale, which refuses it.
 */
export async function recordSale(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const party = readParty(r);
  const collectedBy = r.text("collectedBy", "Collected by", { max: 240 });
  const authority = r.choice("authoritySighted", "Proof of authority sighted", TRI);
  const cert = r.choice("restrictionCertSighted", "Status certificate", CERT_SIGHTED) as CertSighted | null;
  const certUntil = r.date("restrictionCertValidUntil", "Status certificate valid until");
  const registrationCheck = (r.choice("registrationCheck", "Registration", ATTESTABLE_CHECKS) ?? "NOT_CHECKED") as CheckState;
  const suspensionCheck = (r.choice("suspensionCheck", "Suspension", ATTESTABLE_CHECKS) ?? "NOT_CHECKED") as CheckState;
  const checkNote = r.text("checkNote", "Note on the checks", { max: 2000 });
  const paymentMethod = r.text("paymentMethod", "How the fee was paid", { max: 120 });
  const receiptNo = r.optionalText("financeReceiptNo");
  // 6.15a fix M-2: the register's supplier this contractor is, named on the sale (an explicit link, OD-9).
  const pickedSupplierId = r.optionalText("supplierId");
  // Residual 6: a supplier past the form's list is named by its register reference, looked up here.
  const supplierReference = r.optionalText("supplierReference");
  const linkReason = r.text("linkReason", "Why they are the same company", { max: 1000 });
  if (r.failed) return { ok: false, errors: r.errors };
  // The sale is the signed-in officer's own act (Phase 2b).
  const begun = await beginAct(actor, data, "DocumentSale.issuedBy", { personField: "issuedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return receiptGuarded(() => inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    // SR-10 (ruling 16, G3): an exercise sold online is bought through the supplier portal; the counter sale is offered only on an exercise pinned to the counter.
    if (l.ex.saleMode === "ONLINE") return { ok: false, message: "Not sold: the documents of this exercise are bought online through the supplier portal, not at the counter. Where a buyer paid at the finance counter, record the receipt against its online purchase." };
    await lockSaleRows(tx, w.id);
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { issuedByPersonId: windowFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const now = new Date();
    const phase = phaseOf(l.ex, w, now, l.org.timeZone).phase;
    const known = party.partyId ? d.parties.find((p) => p.id === party.partyId) ?? null : d.parties.find((p) => regKey(p.registrationNo) === regKey(party.registrationNo)) ?? null;
    if (party.partyId && !known) return { ok: false, message: "That contractor is not on this exercise." };
    const invited = invitedSaleFault(pathOf(d).path, !!known && w.letters.some((x) => x.partyId === known.id));
    if (invited) return refuse([invited], "Not sold:");
    // 6.15a fix M-2 (flagged against 6.5): a supplier named on the form links a party not yet linked (a first
    // sale has no party yet), judged as the link act judges it, and written below, in this transaction.
    const byReference = supplierReference ? await tx.supplier.findFirst({ where: { organisationId: l.org.id, reference: supplierReference }, select: { id: true } }) : null;
    if (supplierReference && !byReference) return { ok: false, errors: { supplierReference: "No supplier on the register has that reference." } };
    if (byReference && pickedSupplierId && byReference.id !== pickedSupplierId) return { ok: false, errors: { supplierReference: "That reference is not the supplier chosen above: name one." } };
    const chosenSupplierId = pickedSupplierId ?? byReference?.id ?? null;
    const choice = saleSupplier(known?.vendorId ?? null, chosenSupplierId);
    if (choice.kind === "REFUSED") return { ok: false, errors: { supplierId: supplierFaultText(choice.fault) } };
    let linkAtSale: { supplier: { id: string; reference: string; registeredName: string }; findings: Finding[] } | null = null;
    if (choice.kind === "LINK_AT_SALE") {
      if (!(await lockSupplierRow(tx, choice.vendorId))) return { ok: false, errors: { supplierId: supplierFaultText({ code: "SUPPLIER_REQUIRED", level: "block" }) } };
      const supplier = await tx.supplier.findFirst({ where: { id: choice.vendorId, organisationId: l.org.id }, select: { id: true, reference: true, registeredName: true, registrationNo: true, status: true } });
      const others = d.parties.filter((p) => p.id !== known?.id).map((p) => ({ name: p.name, vendorId: p.vendorId }));
      const lf = linkPartyFaults({ registrationNo: known?.registrationNo ?? party.registrationNo, vendorId: null }, supplier, linkReason, others);
      const reasonFault = lf.find((f) => f.code === "NUMBER_DIFFERS_REASON_REQUIRED");
      if (reasonFault) return { ok: false, errors: { linkReason: supplierFaultText(reasonFault) } };
      if (lf.some((f) => f.level === "block")) return { ok: false, errors: { supplierId: lf.filter((f) => f.level === "block").map((f) => supplierFaultText(f)).join(" ") } };
      linkAtSale = { supplier: supplier!, findings: lf };
    }
    // 6.15a: the register, read on the locked supplier row (taken last, after the exercise side).
    const register = await registerAtSale(tx, { id: l.org.id, timeZone: l.org.timeZone, today: l.org.today }, choice.vendorId, l.ex.id);
    const registerBlocks = register.check.findings.filter((f) => f.level === "block");
    if (registerBlocks.length) return { ok: false, message: registerBlocks.map((f) => supplierFaultText(f)).join(" ") };
    const regCheck = register.linked ? register.check.registrationCheck : registrationCheck;
    const suspCheck = register.linked ? register.check.suspensionCheck : suspensionCheck;
    const taken = receiptNo ? !!(await tx.documentSale.findFirst({ where: { organisationId: l.org.id, financeReceiptNo: receiptNo }, select: { id: true } })) : false;
    const fs: Finding[] = saleFaults({
      phase,
      soldOn: l.org.today,
      closingDay: closingDay(l.ex.closingAt, l.org.timeZone),
      restricted: l.ex.restrictedTender,
      certSighted: cert,
      certValidUntil: certUntil ? storedDay(certUntil) : null,
      authoritySighted: tri(authority),
      registrationCheck: regCheck,
      suspensionCheck: suspCheck,
      partyId: known?.id ?? null,
      alreadySold: !!known && w.sales.some((s) => s.partyId === known.id && !s.voidedAt),
      events: eventFactsOf(w),
      // A published window is judged by the answer it was published under (its policy snapshot).
      mandatoryPermitted: mandatoryPermittedFor(w, d.policy.mandatoryAttendancePermitted).permitted,
      receiptNo,
      receiptTaken: taken,
      feeSet: w.feeAmount != null,
      collectedBy,
      paymentMethod,
    });
    if (receiptNo) for (const rf of manualFeeReceipt.check({ number: receiptNo, recordedOn: l.org.today }, { pattern: null, today: l.org.today, taken: false })) fs.push({ code: rf, level: "block" });
    if (fs.some((f) => f.level === "block")) return refuse(fs, "Not sold:");
    const buyer = await partyFor(tx, toAuditActor(actor), l, d, party, "PURCHASER");
    if (!buyer) return { ok: false, message: "That contractor is not on this exercise." };
    if (linkAtSale) {
      // OD-9: the explicit link, audited as the link act audits it, recorded at the sale.
      await tx.exerciseParty.update({ where: { id: buyer.id, organisationId: actor.organisationId }, data: { vendorId: linkAtSale.supplier.id } });
      const differs = linkAtSale.findings.find((f) => f.code === "NUMBER_DIFFERS");
      await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.party, buyer.id, `${l.ex.reference} · Party ${buyer.name}`, "UPDATE",
        diffFields({ supplier: null }, { supplier: `${linkAtSale.supplier.reference} · ${linkAtSale.supplier.registeredName}`, numberDiffers: differs ? `${differs.data!.recorded} recorded, ${differs.data!.register} on the register` : null, linkReason: linkReason || null, linkedBy: `${person.name}, named on the sale`, recordedOnBehalf: "not signed" }), linkReason);
    }
    const soldOn = dayToDate(l.org.today);
    const annotation = saleAnnotation({ exerciseReference: l.ex.reference, purchaser: buyer.name, address: buyer.address, phone: buyer.phone, fax: buyer.fax, closingText: formatOrgDateTime(l.ex.closingAt, l.org.timeZone), issuedBy: person.name, recordedForSomeone: act.intent.mode === "RECORDED_ON_BEHALF", soldOnText: formatDate(l.org.today), receiptNo });
    const row = {
      partyId: buyer.id,
      soldOn,
      collectedBy,
      authoritySighted: true,
      restrictionCertSighted: l.ex.restrictedTender ? cert : null,
      restrictionCertValidUntil: l.ex.restrictedTender ? certUntil : null,
      registrationCheck: regCheck,
      suspensionCheck: suspCheck,
      checkNote,
      amount: w.feeAmount!,
      paymentMethod,
      financeReceiptNo: receiptNo,
      receiptRecordedOn: receiptNo ? soldOn : null,
      issuedByPersonId: person.id,
      // Residual 2: under the register, a sale with no supplier named says so (never "sold before the register").
      noSupplierNamed: !register.linked,
    };
    const sale = await tx.documentSale.create({ data: { organisationId: l.org.id, windowId: w.id, ...row, annotation: annotation as unknown as Prisma.InputJsonValue, ...(register.snapshot ? { eligibilitySnapshot: register.snapshot as unknown as Prisma.InputJsonValue } : {}) } });
    await act.write(tx, sale.id);
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.sale, sale.id, label(l, `Sale · ${buyer.name}`), "CREATE", diffFields(null, { ...saleFields({ ...row, partyName: buyer.name, issuedBy: person.name }), ...(register.snapshot ? { supplierRegister: `${register.snapshot.supplierReference}: ${register.snapshot.verdict === "ELIGIBLE" ? "eligible" : register.snapshot.verdict === "NOT_ELIGIBLE" ? "not eligible" : "not assessed"}, judged ${formatDate(register.snapshot.judgedOn)}` } : {}) }));
    // Every addendum issued so far goes with the documents (FR-ADV-014).
    for (const a of addendaForNewPurchaser(w.addenda)) {
      if (a.recipients.some((x) => x.partyId === buyer.id)) continue;
      const copy = await tx.addendumRecipient.create({ data: { organisationId: l.org.id, addendumId: a.id, partyId: buyer.id, withDocuments: true } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${a.number} · ${buyer.name}`), "CREATE", diffFields(null, { recipient: buyer.name, given: "with the documents" }));
    }
    const said = [notes(fs), ...register.check.findings.filter((f) => f.level !== "block").map((f) => supplierFaultText(f)), ...(linkAtSale ? [`Linked to ${linkAtSale.supplier.reference} · ${linkAtSale.supplier.registeredName} on the supplier register.`, ...linkAtSale.findings.filter((f) => f.level === "warn").map((f) => supplierFaultText(f))] : [])].filter(Boolean).join(" ");
    return { ok: true, message: `Sold to ${buyer.name}.${said ? ` ${said}` : ""}` };
  }), refuse([{ code: "RECEIPT_DUPLICATE", level: "block" }], "Not sold:"));
}

/// Void a sale recorded in error, with a reason; refused once the window has closed (X-11), and for a party holding a bid envelope (65-C2).
export async function voidSale(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const saleId = String(data.get("saleId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    const s = w?.sales.find((x) => x.id === saleId);
    if (!w || !s) return { ok: false, message: "That sale is not on this exercise." };
    await lockSaleRows(tx, w.id);
    // 65-C2: on the locked register, the purchaser must not hold a bid envelope.
    await lockEnvelopeRows(tx, l.ex.id);
    const holds = (await tx.bidEnvelope.count({ where: { exerciseId: l.ex.id, partyId: s.partyId, status: { not: "WITHDRAWN" }, kind: { not: "COMPANY_ESTIMATE" } } })) > 0;
    const f = voidSaleFault(s, phaseOf(l.ex, w, new Date(), l.org.timeZone).phase, reason, holds);
    if (f) return f.code === "REASON_REQUIRED" ? { ok: false, errors: { reason: windowFindingText(f) } } : refuse([f], "Not voided:");
    const moved = await tx.documentSale.updateMany({ where: { id: s.id, voidedAt: null }, data: { voidedAt: new Date(), voidReason: reason } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.sale, s.id, label(l, `Sale · ${s.party.name}`), "UPDATE", diffFields({ voided: "no" }, { voided: "yes" }), reason);
    return { ok: true };
  });
}

/// Record the finance receipt number of a sale that has none yet (OD-11: consumed, unique, never minted).
export async function recordReceipt(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const saleId = String(data.get("saleId") ?? "");
  const r = new FormReader(data);
  const number = r.text("financeReceiptNo", "Receipt number", { required: true, max: 80 });
  if (r.failed) return { ok: false, errors: r.errors };
  return receiptGuarded(() => inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const s = d.window?.sales.find((x) => x.id === saleId);
    if (!s || s.voidedAt) return { ok: false, message: "That sale is not live on this exercise." };
    if (s.financeReceiptNo) return { ok: false, message: "A receipt number is already recorded on this sale." };
    // SR-10 (ruling 17): a simulated payment is never a finance receipt, so no receipt number is recorded against it, whatever finance holds.
    if (s.paymentChannel === "SIMULATED") return { ok: false, message: "This sale was paid on the payment simulator. A simulated payment is not a finance receipt, so no receipt number can be recorded against it." };
    const taken = !!(await tx.documentSale.findFirst({ where: { organisationId: l.org.id, financeReceiptNo: number, NOT: { id: s.id } }, select: { id: true } }));
    const fs = manualFeeReceipt.check({ number, recordedOn: l.org.today }, { pattern: null, today: l.org.today, taken });
    if (fs.length) return { ok: false, errors: { financeReceiptNo: fs.map((code) => windowFindingText({ code, level: "block" })).join(" ") } };
    const on = dayToDate(l.org.today);
    await tx.documentSale.update({ where: { id: s.id, organisationId: actor.organisationId }, data: { financeReceiptNo: number, receiptRecordedOn: on } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.sale, s.id, label(l, `Sale · ${s.party.name}`), "UPDATE", diffFields({ financeReceipt: null }, { financeReceipt: number, receiptRecordedOn: formatDate(l.org.today), source: "typed by an officer from the finance receipt" }));
    return { ok: true };
  }), { ok: false, errors: { financeReceiptNo: windowFindingText({ code: "TAKEN", level: "block" }) } });
}

/**
 * Record the finance receipt of an online purchase that is awaiting payment (SR-10, ruling 17: the officer-recorded receipt stays as the second writer of "paid"). It is used where
 * online payment is not switched on (the simulator refuses in words and the buyer pays at the finance counter), or where a buyer paid at the counter all the same. The number is
 * typed from finance's receipt, never made up, checked against the configured format and refused if another sale holds it. The purchase is paid by `markPurchasePaid`, the one
 * writer of "paid", with the channel "finance receipt"; the documents are released as for any payment. The signed-in officer is the one who recorded it.
 */
export async function recordPurchaseReceipt(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const purchaseId = String(data.get("purchaseId") ?? "");
  const r = new FormReader(data);
  const number = r.text("financeReceiptNo", "Receipt number", { required: true, max: 80 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "DocumentSale.issuedBy", { personField: "issuedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return receiptGuarded(() => inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockSaleRows(tx, w.id);
    const person = await activePerson(tx, l.org.id, act.subjectPersonId);
    if (!person) return { ok: false, errors: { issuedByPersonId: windowFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const purchase = await tx.documentPurchase.findFirst({ where: { id: purchaseId, windowId: w.id, organisationId: l.org.id }, select: { id: true, supplierId: true, amount: true, state: true, buyerAccountId: true, supplier: { select: { registeredName: true } }, buyer: { select: { contact: { select: { name: true } } } } } });
    if (!purchase || purchase.state !== "AWAITING_PAYMENT") return { ok: false, message: "That purchase is not awaiting payment on this exercise." };
    // S1: the sale phase rule of the counter sale (`saleFaults`) and of the buyer's own payment (`settlePayment`): the documents are sold only while on sale, so a receipt is not recorded outside it either.
    const phase = phaseOf(l.ex, w, new Date(), l.org.timeZone).phase;
    if (phase === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }], "Not recorded:");
    if (phase !== "OPEN_FOR_PURCHASE") return refuse([{ code: "SALE_CLOSED", level: "block", data: { phase } }], "Not recorded:");
    const taken = !!(await tx.documentSale.findFirst({ where: { organisationId: l.org.id, financeReceiptNo: number }, select: { id: true } }));
    const fs = manualFeeReceipt.check({ number, recordedOn: l.org.today }, { pattern: null, today: l.org.today, taken });
    if (fs.length) return { ok: false, errors: { financeReceiptNo: fs.map((code) => windowFindingText({ code, level: "block" })).join(" ") } };
    try {
      const paid = await markPurchasePaid(tx, {
        org: { id: l.org.id, timeZone: l.org.timeZone, today: l.org.today },
        exercise: { id: l.ex.id, reference: l.ex.reference, title: l.ex.title, closes: l.ex.closingAt, restricted: l.ex.restrictedTender === true },
        window: { id: w.id },
        purchase: { id: purchase.id, supplierId: purchase.supplierId, amount: purchase.amount },
        buyer: { accountId: purchase.buyerAccountId, name: purchase.buyer.contact.name },
        now: new Date(),
        by: { channel: "FINANCE_RECEIPT", personId: person.id, personName: person.name, receiptNo: number },
        auditActor: toAuditActor(actor),
      });
      await act.write(tx, paid.saleId);
      return { ok: true, message: `Receipt recorded. The documents are released to ${paid.partyName}.` };
    } catch (e) {
      if (e instanceof PurchaseBarred) throw new Refusal({ ok: false, message: `Not recorded: ${e.words}` });
      if (e instanceof PurchaseNotAwaiting) throw new Refusal({ ok: false, message: "That purchase is no longer awaiting payment." });
      throw e;
    }
  }), { ok: false, errors: { financeReceiptNo: windowFindingText({ code: "TAKEN", level: "block" }) } });
}

// ------------------------------------------------------------------ briefings and site visits

/**
 * Schedule a briefing or site visit (FR-ADV-003 (e)/(f)), while the window is prepared. Its day,
 * time and place together; mandatory only where the policy permits it (OD-8), and then answered.
 */
export async function scheduleEvent(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const r = new FormReader(data);
  const kind = r.choice("kind", "Event", SITE_EVENT_KINDS, { required: true }) as SiteEventKind | null;
  const on = r.date("day", "Day", { required: true });
  const time = r.text("time", "Time", { required: true, max: 5 });
  const place = r.text("place", "Place", { required: true, max: 400 });
  const mandatory = r.choice("mandatory", "Attendance mandatory", TRI);
  const notesText = r.text("notes", "Notes", { max: 2000 });
  if (r.failed || !kind || !on) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    if (!d.window) return NO_WINDOW;
    const startsAt = instantAt(storedDay(on), time, l.org.timeZone);
    if (!l.org.timeZone) return NO_ZONE;
    if (!startsAt) return { ok: false, errors: { time: isClockTime(time) ? "That time does not occur on that day in the organisation's time zone (the clocks go forward). Give another time." : "Give the time on the 24-hour clock, such as 10:00." } };
    const ev = { kind, startsAt, place, mandatory: tri(mandatory), cancelled: false };
    const blocks = eventFaults(ev, d.policy.mandatoryAttendancePermitted, l.ex.closingAt).filter((f) => f.code === "MANDATORY_NOT_PERMITTED" || f.code === "EVENT_AFTER_CLOSING");
    if (blocks.length) return refuse(blocks, "Not scheduled:");
    const row = await tx.siteEvent.create({ data: { organisationId: l.org.id, windowId: d.window.id, kind, startsAt, place, mandatory: tri(mandatory), notes: notesText } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.event, row.id, label(l, `${kind === "BRIEFING" ? "Tender briefing" : "Site visit"}`), "CREATE", diffFields(null, eventFields({ ...row }, l.org.timeZone)));
    return { ok: true };
  });
}

/// Answer whether attendance at an event is mandatory, while the window is prepared (OD-8).
export async function setEventMandatory(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const mandatory = r.choice("mandatory", "Attendance mandatory", TRI, { required: true });
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const ef = windowEditFault(l.ex.status, l.ex.packKindSnapshot);
    if (ef) return refuse([ef]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e || e.cancelledAt) return { ok: false, message: "That event is not scheduled on this exercise." };
    const answer = tri(mandatory);
    if (answer === true && d.policy.mandatoryAttendancePermitted !== true) return refuse([{ code: "MANDATORY_NOT_PERMITTED", level: "block", data: { kind: e.kind, permitted: d.policy.mandatoryAttendancePermitted == null ? "not set" : "no" } }]);
    await tx.siteEvent.update({ where: { id: e.id, organisationId: actor.organisationId }, data: { mandatory: answer } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ mandatory: e.mandatory == null ? "Not answered" : e.mandatory ? "Yes" : "No" }, { mandatory: answer == null ? "Not answered" : answer ? "Yes" : "No" }));
    return { ok: true };
  });
}

/**
 * Cancel an event, with a reason. Before publication it simply comes off the notice; after, the
 * notice stated it, so the purchasers are told by an addendum (the screen says so).
 */
export async function cancelEvent(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (l.ex.status === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e || e.cancelledAt) return { ok: false, message: "That event is not scheduled on this exercise." };
    if (e.heldOn) return refuse([{ code: "ALREADY_HELD", level: "block" }]);
    await tx.siteEvent.update({ where: { id: e.id, organisationId: actor.organisationId }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ cancelled: "no" }, { cancelled: "yes" }), reason);
    const published = isPublished(l.ex.status);
    return { ok: true, message: published ? "Cancelled. The published notice stated it: tell the purchasers by an addendum." : "Cancelled." };
  });
}

/// Record an event held, on a day not before its start and not after today.
export async function markEventHeld(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const on = r.date("heldOn", "Held on", { required: true });
  if (r.failed || !on) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!isPublished(l.ex.status)) return refuse([{ code: "NOT_PUBLISHED", level: "block" }]);
    const e = d.window?.events.find((x) => x.id === eventId);
    if (!e) return { ok: false, message: "That event is not scheduled on this exercise." };
    const f = heldFault({ startsAt: e.startsAt, heldOn: e.heldOn ? storedDay(e.heldOn) : null, cancelled: e.cancelledAt != null }, storedDay(on), l.org.today, l.org.timeZone);
    if (f) return f.code === "HELD_BEFORE_START" || f.code === "HELD_IN_FUTURE" ? { ok: false, errors: { heldOn: windowFindingText(f) } } : refuse([f]);
    await tx.siteEvent.update({ where: { id: e.id, organisationId: actor.organisationId }, data: { heldOn: on } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.event, e.id, label(l, e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"), "UPDATE", diffFields({ heldOn: null }, { heldOn: formatDate(storedDay(on)) }));
    return { ok: true };
  });
}

/// Record a contractor's attendance at a held event, by the signed-in officer (Phase 2b).
export async function recordAttendance(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const eventId = String(data.get("eventId") ?? "");
  const r = new FormReader(data);
  const party = readParty(r);
  const representative = r.text("representative", "Representative", { required: true, max: 240 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "SiteEventAttendance.recordedBy", { personField: "recordedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  const personId = act.subjectPersonId;
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    const e = w?.events.find((x) => x.id === eventId);
    if (!w || !e) return { ok: false, message: "That event is not scheduled on this exercise." };
    if (e.cancelledAt) return refuse([{ code: "EVENT_CANCELLED", level: "block" }]);
    if (!e.heldOn) return { ok: false, message: "Record the event held first, then its attendance." };
    const phase = phaseOf(l.ex, w, new Date(), l.org.timeZone).phase;
    if (phase === "CANCELLED") return refuse([{ code: "EXERCISE_CANCELLED", level: "block" }]);
    const person = await activePerson(tx, l.org.id, personId);
    if (!person) return { ok: false, errors: { recordedByPersonId: windowFindingText({ code: "PERSON_REQUIRED", level: "block" }) } };
    const known = party.partyId ? d.parties.find((p) => p.id === party.partyId) ?? null : d.parties.find((p) => regKey(p.registrationNo) === regKey(party.registrationNo)) ?? null;
    if (party.partyId && !known) return { ok: false, message: "That contractor is not on this exercise." };
    if (known && e.attendance.some((a) => a.partyId === known.id)) return { ok: false, message: `${known.name} is already on this event's register.` };
    // On the invited path only the invitees attend (they alone may buy).
    if (pathOf(d).path === "INVITED" && (!known || known.source !== "PROPOSED_INVITEE")) return refuse([{ code: "NOT_INVITED", level: "block" }]);
    const attendee = await partyFor(tx, toAuditActor(actor), l, d, party, "ATTENDEE");
    if (!attendee) return { ok: false, message: "That contractor is not on this exercise." };
    const row = await tx.siteEventAttendance.create({ data: { organisationId: l.org.id, eventId: e.id, partyId: attendee.id, representative, recordedByPersonId: person.id } });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.attendance, row.id, label(l, `${e.kind === "BRIEFING" ? "Tender briefing" : "Site visit"} · ${attendee.name}`), "CREATE", diffFields(null, { contractor: attendee.name, representative, recordedBy: person.name }));
    await act.write(tx, row.id);
    return { ok: true };
  });
}

// ------------------------------------------------------------------ addenda (FR-ADV-014)

/// Draft an addendum during the window: its title and what it changes; the signed copy is attached to it.
export async function saveAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "") || null;
  const r = new FormReader(data);
  const title = r.text("title", "Title", { required: true, max: 240 });
  const whatChanged = r.text("whatChanged", "What it changes", { required: true, max: 8000 });
  const closingChangeId = r.optionalText("closingChangeId");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    if (!w) return NO_WINDOW;
    const wf = addendumWindowFault(phaseOf(l.ex, w, new Date(), l.org.timeZone).phase);
    if (wf) return refuse([wf], "Not saved:");
    if (closingChangeId && !w.closingChanges.some((c) => c.id === closingChangeId)) return { ok: false, errors: { closingChangeId: "That change is not on this exercise." } };
    const row = { title, whatChanged, closingChangeId };
    if (addendumId) {
      const a = w.addenda.find((x) => x.id === addendumId);
      if (!a || a.status !== "DRAFT") return refuse([{ code: "NOT_DRAFT", level: "block" }]);
      await tx.addendum.update({ where: { id: a.id, organisationId: actor.organisationId }, data: row });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${title}`), "UPDATE", diffFields({ title: a.title, whatChanged: a.whatChanged }, { title, whatChanged }));
    } else {
      const a = await tx.addendum.create({ data: { organisationId: l.org.id, windowId: w.id, ...row } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${title}`), "CREATE", diffFields(null, addendumFields({ ...a })));
    }
    return { ok: true };
  });
}

/// Void a draft addendum, with a reason. It never took a number.
export async function voidAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: windowFindingText({ code: "REASON_REQUIRED", level: "block" }) } };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockAddendumRows(tx, w.id);
    const a = w.addenda.find((x) => x.id === addendumId);
    if (!a || a.status !== "DRAFT") return refuse([{ code: "NOT_DRAFT", level: "block" }]);
    const moved = await tx.addendum.updateMany({ where: { id: a.id, status: "DRAFT" }, data: { status: "VOID", voidReason: reason } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendum, a.id, label(l, `Addendum (draft), ${a.title}`), "UPDATE", diffFields({ status: "Draft" }, { status: "Voided" }), reason);
    return { ok: true };
  });
}

/**
 * Issue an addendum (FR-ADV-014): under the window's lock and its addenda's, numbered one after the
 * last issued, its text frozen from the configured template, its recipients the register as it
 * stands (FR-ADV-012). Delivery is then recorded per recipient; nothing is sent.
 */
export async function issueAddendum(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const addendumId = String(data.get("addendumId") ?? "");
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    if (!l.org.today) return NO_ZONE;
    const w = d.window;
    if (!w) return NO_WINDOW;
    await lockAddendumRows(tx, w.id);
    const a = w.addenda.find((x) => x.id === addendumId);
    if (!a) return { ok: false, message: "That addendum is not on this exercise." };
    const number = nextAddendumNumber(w.addenda);
    const rendered = renderAddendum(d, l.ex, l.org.timeZone, { number, title: a.title, whatChanged: a.whatChanged, issuedOn: l.org.today });
    const recipients = recipientsFor(w.sales, w.letters.map((x) => ({ partyId: x.partyId })));
    const signedCopies = a.attachments.filter((x) => !x.detachedAt && !x.version.withdrawnAt).length;
    const fs = issueFaults({ status: a.status, phase: phaseOf(l.ex, w, new Date(), l.org.timeZone).phase, title: a.title, whatChanged: a.whatChanged, signedCopies, template: { state: rendered.state === "NO_LANGUAGE" ? "NO_TEXT" : rendered.state, missing: rendered.missing, unknown: rendered.unknown, stampMissing: rendered.stampMissing }, recipients: recipients.length, today: l.org.today });
    if (fs.some((f) => f.level === "block")) return refuse(fs, "Not issued:");
    const t = d.templates.addendum!;
    const issuedOn = dayToDate(l.org.today);
    const moved = await tx.addendum.updateMany({ where: { id: a.id, status: "DRAFT" }, data: { status: "ISSUED", number, issuedOn, renderedText: rendered.text!, templateCode: t.code, templateBodyVersion: t.bodyVersion, frozenAt: new Date() } });
    if (moved.count !== 1) throw new Refusal(CHANGED);
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendum, a.id, label(l, `Addendum ${number}, ${a.title}`), "UPDATE", diffFields({ status: "Draft", number: null }, { status: "Issued", number, issuedOn: formatDate(l.org.today), frozenFrom: `${t.nameEn}, text version ${t.bodyVersion}`, recipients: recipients.length }));
    for (const partyId of recipients) {
      const p = d.parties.find((x) => x.id === partyId)!;
      const copy = await tx.addendumRecipient.create({ data: { organisationId: l.org.id, addendumId: a.id, partyId } });
      await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${number} · ${p.name}`), "CREATE", diffFields(null, { recipient: p.name }));
    }
    return { ok: true, message: recipients.length ? `Addendum ${number} issued to ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}. Record each copy's delivery.` : `Addendum ${number} issued. ${windowFindingText({ code: "NO_RECIPIENTS", level: "info" })}` };
  });
}

/// How a copy of an addendum went: recorded, never sent.
export async function recordAddendumDelivery(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const exerciseId = exerciseIdOf(data);
  const recipientId = String(data.get("recipientId") ?? "");
  const r = new FormReader(data);
  const method = r.choice("method", "Sent by", DELIVERY_METHODS) as DeliveryMethod | null;
  const consignmentRef = r.text("consignmentRef", "Consignment", { max: 120 });
  const sent = r.date("despatchedOn", "Sent on");
  const ack = r.date("acknowledgedOn", "Acknowledged on");
  if (r.failed) return { ok: false, errors: r.errors };
  return inWindow(actor, exerciseId, async (tx, l, d) => {
    const a = d.window?.addenda.find((x) => x.recipients.some((c) => c.id === recipientId));
    const copy = a?.recipients.find((c) => c.id === recipientId);
    if (!a || !copy) return { ok: false, message: "That copy is not on this exercise." };
    const fs = deliveryFaults({ method, despatchedOn: sent ? storedDay(sent) : null, acknowledgedOn: ack ? storedDay(ack) : null, withDocuments: copy.withDocuments }, l.org.today);
    if (fs.length) return refuse(fs, "Not recorded:");
    const after = { method, consignmentRef, despatchedOn: sent, acknowledgedOn: ack };
    await tx.addendumRecipient.update({ where: { id: copy.id, organisationId: actor.organisationId }, data: after });
    await audit(tx, toAuditActor(actor), l.org.id, ENTITY.addendumCopy, copy.id, label(l, `Addendum ${a.number} · ${copy.party.name}`), "UPDATE", diffFields(deliveryFields(copy), deliveryFields(after)));
    return { ok: true };
  });
}
