import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { SIMULATED_LABEL } from "@/lib/integration/payment-gateway";
import { readRegister, registerAtSale } from "@/lib/suppliers/sale-hook";
import { supplierFaultText } from "@/lib/suppliers/labels";
import { ENTITY, saleFields } from "@/lib/window/audit-view";
import { releaseAnnotation } from "@/lib/window/sale";

import { PAID_CHANNEL_WORDS } from "./purchase";

/**
 * THE writer of "paid" (SR-10, ruling 17 as amended). A purchase becomes PAID here and nowhere else, and this is called from exactly two places: the payment simulator's
 * settlement (`purchase-store.ts`, channel SIMULATED) and an officer recording the finance receipt (`recordPurchaseReceipt`, channel FINANCE_RECEIPT). A source scan
 * (`purchase-writers.test.ts`) holds that: no other file writes `state: "PAID"` on a purchase, and nothing the simulator does can write a finance receipt number.
 *
 * In the caller's transaction, with the exercise side locked: the purchase goes from awaiting payment to paid (one row moves, or nothing is written), the buyer's party on
 * the exercise is found or made, the supplier register is read on the locked supplier row (taken last, as `recordSale` takes it) and a sale is made that every reader of a sale
 * already reads, so the invited count, the addenda, the opening's purchase check and the register see an online purchase as they see a counter one. The sale of a simulated payment
 * carries the channel SIMULATED and its simulated reference, never a receipt number; the sale of an officer's receipt carries the receipt number and the officer.
 */

export class PurchaseNotAwaiting extends Error {
  constructor() {
    super("The purchase is no longer awaiting payment.");
  }
}

export class PurchaseBarred extends Error {
  constructor(readonly words: string) {
    super(words);
  }
}

export type PaidBy =
  | { channel: "SIMULATED"; method: string; reference: string }
  | { channel: "FINANCE_RECEIPT"; personId: string; personName: string; receiptNo: string };

export interface PaidInput {
  org: { id: string; timeZone: string | null; today: string };
  exercise: { id: string; reference: string; title: string; closes: Date | null };
  window: { id: string };
  purchase: { id: string; supplierId: string; amount: { toString(): string } };
  buyer: { accountId: string; name: string };
  now: Date;
  by: PaidBy;
  /// Who the trail names: the supplier's account for a simulated payment, the officer for a recorded receipt.
  auditActor: AuditActor;
}

export async function markPurchasePaid(tx: Tx, i: PaidInput): Promise<{ saleId: string; partyName: string }> {
  const { org, exercise, purchase, by } = i;
  const label = `${exercise.reference} · Online purchase`;

  // The supplier row is locked last, and the register read on it: a suspension recorded meanwhile cannot slip past the payment.
  const register = await registerAtSale(tx, { id: org.id, timeZone: org.timeZone, today: org.today }, purchase.supplierId, exercise.id);
  const blocks = register.check.findings.filter((f) => f.level === "block");
  if (blocks.length) throw new PurchaseBarred(blocks.map((f) => supplierFaultText(f)).join(" "));

  const moved = await tx.documentPurchase.updateMany({
    where: { id: purchase.id, organisationId: org.id, state: "AWAITING_PAYMENT" },
    data:
      by.channel === "SIMULATED"
        ? { state: "PAID", paidAt: i.now, paidChannel: "SIMULATED", paidMethod: by.method, paidReference: by.reference }
        : { state: "PAID", paidAt: i.now, paidChannel: "FINANCE_RECEIPT", receiptRecordedByPersonId: by.personId },
  });
  if (moved.count !== 1) throw new PurchaseNotAwaiting();

  const supplier = await tx.supplier.findFirstOrThrow({ where: { id: purchase.supplierId, organisationId: org.id }, select: { reference: true, registeredName: true, registrationNo: true, registeredAddress: true, companyEmail: true } });
  const known = await tx.exerciseParty.findFirst({ where: { exerciseId: exercise.id, organisationId: org.id, vendorId: purchase.supplierId }, orderBy: { createdAt: "asc" } });
  const party =
    known ??
    (await tx.exerciseParty.create({ data: { organisationId: org.id, exerciseId: exercise.id, source: "PURCHASER", name: supplier.registeredName, registrationNo: supplier.registrationNo, address: supplier.registeredAddress, email: supplier.companyEmail, vendorId: purchase.supplierId } }));
  if (!known) {
    await writeAudit(tx, { actor: i.auditActor, organisationId: org.id, entity: ENTITY.party, entityId: party.id, entityLabel: `${exercise.reference} · Party ${party.name}` }, "CREATE", diffFields(null, { party: party.name, registrationNo: party.registrationNo, cameAs: "Bought the documents online", supplier: `${supplier.reference} · ${supplier.registeredName}` }));
  }

  const simulated = by.channel === "SIMULATED";
  const payment = simulated ? SIMULATED_LABEL : PAID_CHANNEL_WORDS.FINANCE_RECEIPT;
  const annotation = releaseAnnotation({
    exerciseReference: exercise.reference,
    purchaser: party.name,
    address: party.address,
    phone: party.phone,
    fax: party.fax,
    closingText: formatOrgDateTime(exercise.closes, org.timeZone),
    release: { buyer: i.buyer.name, releasedAtText: formatOrgDateTime(i.now, org.timeZone), payment, reference: simulated ? by.reference : by.receiptNo },
  });
  const soldOn = dayToDate(org.today);
  const row = {
    partyId: party.id,
    soldOn,
    collectedBy: i.buyer.name,
    // No officer sights a letter of authority online: the check is the reading of the signed-in person's standing, kept with the purchase.
    authoritySighted: false,
    restrictionCertSighted: null,
    restrictionCertValidUntil: null,
    registrationCheck: register.check.registrationCheck,
    suspensionCheck: register.check.suspensionCheck,
    checkNote: "",
    amount: purchase.amount.toString(),
    paymentMethod: simulated ? `${SIMULATED_LABEL}: ${by.method}` : "Finance receipt",
    noSupplierNamed: false,
    paymentChannel: simulated ? ("SIMULATED" as const) : ("COUNTER" as const),
    simulatedReference: simulated ? by.reference : null,
    financeReceiptNo: simulated ? null : by.receiptNo,
    receiptRecordedOn: simulated ? null : soldOn,
    issuedByPersonId: simulated ? null : by.personId,
    purchaseId: purchase.id,
  };
  const sale = await tx.documentSale.create({
    data: { organisationId: org.id, windowId: i.window.id, ...row, annotation: annotation as unknown as Prisma.InputJsonValue, ...(register.snapshot ? { eligibilitySnapshot: register.snapshot as unknown as Prisma.InputJsonValue } : {}) },
  });
  await writeAudit(tx, { actor: i.auditActor, organisationId: org.id, entity: ENTITY.sale, entityId: sale.id, entityLabel: `${exercise.reference} · Sale · ${party.name}` }, "CREATE", diffFields(null, {
    ...saleFields({ ...row, partyName: party.name, issuedBy: simulated ? "Nobody: released online" : by.personName }),
    howPaid: payment,
    reference: simulated ? by.reference : null,
    releasedTo: i.buyer.name,
  }));
  await writeAudit(tx, { actor: i.auditActor, organisationId: org.id, entity: ENTITY.purchase, entityId: purchase.id, entityLabel: label }, "UPDATE", diffFields({ state: "Awaiting payment" }, {
    state: "Paid",
    howPaid: payment,
    ...(simulated ? { method: by.method, reference: by.reference, note: "No money moved: a demonstration. Not a finance receipt." } : { financeReceipt: by.receiptNo, recordedBy: by.personName }),
    paidOn: formatDate(org.today),
  }));

  // Every addendum issued so far goes with the documents (FR-ADV-014), as at the counter.
  const issued = await tx.addendum.findMany({ where: { windowId: i.window.id, organisationId: org.id, status: "ISSUED" }, select: { id: true, number: true, recipients: { select: { partyId: true } } } });
  for (const a of issued) {
    if (a.recipients.some((x) => x.partyId === party.id)) continue;
    const copy = await tx.addendumRecipient.create({ data: { organisationId: org.id, addendumId: a.id, partyId: party.id, withDocuments: true } });
    await writeAudit(tx, { actor: i.auditActor, organisationId: org.id, entity: ENTITY.addendumCopy, entityId: copy.id, entityLabel: `${exercise.reference} · Addendum ${a.number} · ${party.name}` }, "CREATE", diffFields(null, { recipient: party.name, given: "with the documents" }));
  }
  return { saleId: sale.id, partyName: party.name };
}

/// The register's reading before a payment is taken, without the lock: a buyer barred meanwhile is told so before any attempt is recorded.
export async function registerBars(tx: Tx, org: { id: string; timeZone: string | null; today: string }, supplierId: string, exerciseId: string): Promise<string | null> {
  const r = await readRegister(tx, org, supplierId, exerciseId);
  const blocks = r.check.findings.filter((f) => f.level === "block");
  return blocks.length ? blocks.map((f) => supplierFaultText(f)).join(" ") : null;
}
