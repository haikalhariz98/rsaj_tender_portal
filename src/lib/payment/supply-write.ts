/**
 * Recording Finance's payment of a supply claim (ADR 0045 D7; WV-13; FR-PAY-019, INT-07's manual adapter), as `finance-write.ts` records a certificate's. Server-only: runs
 * inside the contract the staff act locked (`withLockedContract`), then takes the claim's own row lock (`ProjectDocument`, the Project workspace's one lock, so a mark or a
 * version cannot slip in between), re-reads the claim and any payment, re-runs the pure rule (`supplyPaymentFaults`), writes the row, audits it with its after, and writes
 * the attribution, all in the one transaction. A refusal throws `SupplyPaymentRefused`, which rolls it all back.
 *
 * The claim's kind is read, never the contract type's route: a claim sent before the route changed stays payable (WV-9). Nothing is matched and no budget-ledger line is
 * written (AC-33), as with `FinancePayment`. A later finance-system feed writes the same row with a system actor (ADR 0045 D7, the façade).
 */

import type { Tx } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { ActWriter } from "@/lib/auth/act-writer";
import type { AuditActor } from "@/lib/auth/types";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";
import { loadDocumentFacts } from "@/lib/project-docs/facts";
import { documentState } from "@/lib/project-docs/state";

import { asCorrected, correctionFaults, CORRECTIONS } from "./correction";
import { supplyPaymentFaults, supplyRefusal } from "./supply";
import type { Day, Finding } from "./types";

export class SupplyPaymentRefused extends Error {
  constructor(readonly faults: readonly Finding[], lead = "Not recorded:") {
    super(supplyRefusal(lead, faults));
    this.name = "SupplyPaymentRefused";
  }
}

export interface SupplyPaymentCtx {
  tx: Tx;
  l: LoadedContract;
  actor: AuditActor;
  /// The server's instant, read once on entry, to the second.
  now: Date;
  /// The organisation's day of it.
  today: Day;
}

export async function recordSupplyPayment(c: SupplyPaymentCtx, i: { documentId: string; paidOn: Day; batchNo: string; amount: Sen | null; note: string; act: ActWriter }): Promise<{ paymentId: string }> {
  const org = c.l.org.id;
  // The claim's lock names its contract and organisation: a crafted id locks no row of another (PW-50).
  await c.tx.$queryRaw`SELECT id FROM "ProjectDocument" WHERE id = ${i.documentId} AND "contractId" = ${c.l.contract.id} AND "organisationId" = ${org} FOR UPDATE`;
  const doc = await c.tx.projectDocument.findFirst({ where: { id: i.documentId, contractId: c.l.contract.id, organisationId: org }, select: { id: true, title: true, kind: true } });
  if (!doc || doc.kind !== "SUPPLY_CLAIM") throw new SupplyPaymentRefused([{ code: "NOT_A_SUPPLY_CLAIM", level: "block" }]);
  const reading = documentState(await loadDocumentFacts(c.tx, doc.id));
  // Verified: the latest version marked Taken up (it reads "Verified" on this kind); its day is the mark's.
  const verified = reading.state === "TAKEN_UP" && reading.latest ? await c.tx.projectDocumentDecision.findFirst({ where: { versionId: reading.latest.id, approverId: null, outcome: "TAKEN_UP" }, select: { versionId: true, decidedOn: true } }) : null;
  const already = await c.tx.supplyInvoicePayment.findUnique({ where: { documentId: doc.id }, select: { id: true } });
  const fs = supplyPaymentFaults({ verifiedOn: verified ? storedDay(verified.decidedOn) : null, already: !!already, batchNo: i.batchNo, paidOn: i.paidOn, today: c.today, amount: i.amount });
  if (fs.length) throw new SupplyPaymentRefused(fs);
  const person = await c.tx.person.findFirst({ where: { id: i.act.subjectPersonId, organisationId: org, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new SupplyPaymentRefused([{ code: "PERSON_REQUIRED", level: "block" }]);
  const amount = senToDecimalString(i.amount!);
  const row = await c.tx.supplyInvoicePayment.create({
    data: { organisationId: org, contractId: c.l.contract.id, documentId: doc.id, versionId: verified!.versionId, paidOn: dayToDate(i.paidOn), batchNo: i.batchNo.trim(), amount, personId: person.id, note: i.note.trim(), recordedAt: c.now },
    select: { id: true },
  });
  const label = `${contractLabel({ number: c.l.contract.number, award: { awardeeName: c.l.award.awardeeName } })} · ${doc.title} · paid by Finance`;
  await writeAudit(c.tx, { actor: c.actor, organisationId: org, entity: "SupplyInvoicePayment", entityId: row.id, entityLabel: label, reason: "" }, "CREATE", diffFields(null, { invoice: doc.title, batchNo: i.batchNo.trim(), paidOn: i.paidOn, amountPaid: amount, recordedFor: person.name, note: i.note.trim() || null }));
  await i.act.write(c.tx, row.id);
  return { paymentId: row.id };
}

/**
 * Phase 0.3 item 12: correct Finance's payment of a supply claim — a new `PaymentCorrection` row, never an edit — under the same locks and rule as recording it
 * (`supplyPaymentFaults`, re-run as if none were recorded, against the version the payment names) plus a reason and a change. Audited on the payment itself, with its
 * before and after and the reason. Its day, reference and amount, as typed from Finance's remittance.
 */
export async function correctSupplyPayment(c: SupplyPaymentCtx, i: { documentId: string; paidOn: Day; batchNo: string; amount: Sen | null; reason: string }): Promise<void> {
  const org = c.l.org.id;
  await c.tx.$queryRaw`SELECT id FROM "ProjectDocument" WHERE id = ${i.documentId} AND "contractId" = ${c.l.contract.id} AND "organisationId" = ${org} FOR UPDATE`;
  const doc = await c.tx.projectDocument.findFirst({ where: { id: i.documentId, contractId: c.l.contract.id, organisationId: org }, select: { id: true, title: true, kind: true } });
  if (!doc || doc.kind !== "SUPPLY_CLAIM") throw new SupplyPaymentRefused([{ code: "NOT_A_SUPPLY_CLAIM", level: "block" }]);
  const p = await c.tx.supplyInvoicePayment.findUnique({ where: { documentId: doc.id }, select: { id: true, versionId: true, paidOn: true, batchNo: true, amount: true, ...CORRECTIONS, _count: { select: { corrections: true } } } });
  const now = p ? asCorrected(p) : null;
  const before = now ? { paidOn: storedDay(now.paidOn), batchNo: now.batchNo, amount: senFromDecimal(now.amount) } : { paidOn: "", batchNo: "", amount: 0n };
  // The day the version it paid was verified: a correction never moves the payment before it.
  const verified = p ? await c.tx.projectDocumentDecision.findFirst({ where: { versionId: p.versionId, approverId: null, outcome: "TAKEN_UP" }, select: { decidedOn: true } }) : null;
  const fs = [
    ...correctionFaults({ recorded: !!p, reason: i.reason, before, after: { paidOn: i.paidOn, batchNo: i.batchNo, amount: i.amount ?? -1n } }),
    ...(p ? supplyPaymentFaults({ verifiedOn: verified ? storedDay(verified.decidedOn) : null, already: false, batchNo: i.batchNo, paidOn: i.paidOn, today: c.today, amount: i.amount }) : []),
  ];
  if (fs.length) throw new SupplyPaymentRefused(fs, "Not corrected:");
  const amount = senToDecimalString(i.amount!);
  await c.tx.paymentCorrection.create({
    data: { organisationId: org, supplyInvoicePaymentId: p!.id, sequence: p!._count.corrections + 1, paidOn: dayToDate(i.paidOn), batchNo: i.batchNo.trim(), amount, reason: i.reason.trim(), recordedAt: c.now },
  });
  const label = `${contractLabel({ number: c.l.contract.number, award: { awardeeName: c.l.award.awardeeName } })} · ${doc.title} · paid by Finance`;
  await writeAudit(c.tx, { actor: c.actor, organisationId: org, entity: "SupplyInvoicePayment", entityId: p!.id, entityLabel: label, reason: i.reason.trim() }, "UPDATE",
    diffFields({ batchNo: before.batchNo, paidOn: before.paidOn, amountPaid: senToDecimalString(before.amount) }, { batchNo: i.batchNo.trim(), paidOn: i.paidOn, amountPaid: amount }));
}
