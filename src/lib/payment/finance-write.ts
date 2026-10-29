/**
 * Recording Finance's payment of an issued certificate (6.13 Part A step 3: FR-PAY-019). Server-only: runs inside the
 * certificate page's act on the rows `withLockedCertificate` locked; re-runs the rule, writes and audits in the same
 * transaction. The signed-in officer is named on every audit row, and attributed in the same transaction (Phase 2b).
 */

import { diffFields } from "@/lib/audit/diff";
import type { ActWriter } from "@/lib/auth/act-writer";
import { writeAudit } from "@/lib/audit/record";
import { afterFinalPayment } from "@/lib/closeout/final-write";
import { certificateLabel } from "@/lib/certificate/repo";
import { CertificateRefusal, type CertCtx } from "@/lib/certificate/write";
import { dayToDate, storedDay } from "@/lib/dates";
import { parseSen, senFromDecimal, senToDecimalString } from "@/lib/money";

import { asCorrected, correctionFaults, CORRECTIONS } from "./correction";
import { financeFaults, PAID_FIGURE, paidFigureOf } from "./finance";
import { paymentRefusal } from "./labels";

export async function recordFinancePayment(c: CertCtx, i: { batchNo: string; paidOn: string; act: ActWriter; note: string }) {
  const cert = c.l.cert;
  const snap = cert.issueSnapshot as { issuedOn?: string } | null;
  const key = PAID_FIGURE[cert.kind];
  const v = paidFigureOf(cert.kind, cert.issueSnapshot);
  const existing = await c.tx.financePayment.findUnique({ where: { certificateId: cert.id }, select: { id: true } });
  const fs = financeFaults({ issued: cert.status === "ISSUED", already: !!existing, batchNo: i.batchNo, paidOn: i.paidOn, issuedOn: snap?.issuedOn ?? null, today: c.today, amount: v == null ? null : parseSen(v) });
  if (!key) fs.unshift({ code: "KIND_HAS_NO_ROUTE", level: "block" });
  if (fs.length) throw new CertificateRefusal(paymentRefusal("Not recorded:", fs));
  const person = await c.tx.person.findFirst({ where: { id: i.act.subjectPersonId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new CertificateRefusal("Not recorded.", { personId: "Choose someone on record and active." });
  const amount = senToDecimalString(parseSen(v!));
  const row = await c.tx.financePayment.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, batchNo: i.batchNo.trim(), paidOn: dayToDate(i.paidOn), amount, personId: person.id, note: i.note.trim(), recordedAt: c.now } });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "FinancePayment", entityId: row.id, entityLabel: `${certificateLabel(c.l, cert)} · paid by Finance`, reason: "" }, "CREATE",
    diffFields(null, { batchNo: i.batchNo.trim(), paidOn: i.paidOn, amountPaid: amount, recordedFor: person.name, note: i.note.trim() || null }));
  await i.act.write(c.tx, row.id);
  // Close-out stage C (CO-6, flagged): the FINAL's payment writes the retention balance where its event is the final payment, in this transaction.
  if (cert.kind === "FINAL") await afterFinalPayment(c, i.paidOn, person.id);
}

/**
 * Phase 0.3 item 12: correct Finance's payment of this certificate — a new `PaymentCorrection` row, never an edit — on the same lock and rule as recording it
 * (`financeFaults`, re-run as if none were recorded) plus a reason and a change. The amount is the certificate's own figure, never keyed, so it is carried over.
 * Audited on the payment itself, with its before and after and the reason.
 */
export async function correctFinancePayment(c: CertCtx, i: { batchNo: string; paidOn: string; reason: string }) {
  const cert = c.l.cert;
  const snap = cert.issueSnapshot as { issuedOn?: string } | null;
  const p = await c.tx.financePayment.findUnique({ where: { certificateId: cert.id }, select: { id: true, paidOn: true, batchNo: true, amount: true, ...CORRECTIONS, _count: { select: { corrections: true } } } });
  const now = p ? asCorrected(p) : null;
  const before = now ? { paidOn: storedDay(now.paidOn), batchNo: now.batchNo, amount: senFromDecimal(now.amount) } : { paidOn: "", batchNo: "", amount: 0n };
  const after = { paidOn: i.paidOn, batchNo: i.batchNo.trim(), amount: before.amount };
  const fs = [
    ...correctionFaults({ recorded: !!p, reason: i.reason, before, after }),
    ...(p ? financeFaults({ issued: cert.status === "ISSUED", already: false, batchNo: i.batchNo, paidOn: i.paidOn, issuedOn: snap?.issuedOn ?? null, today: c.today, amount: before.amount }) : []),
  ];
  if (fs.length) throw new CertificateRefusal(paymentRefusal("Not corrected:", fs));
  await c.tx.paymentCorrection.create({
    data: { organisationId: c.l.org.id, financePaymentId: p!.id, sequence: p!._count.corrections + 1, paidOn: dayToDate(after.paidOn), batchNo: after.batchNo, amount: senToDecimalString(after.amount), reason: i.reason.trim(), recordedAt: c.now },
  });
  await writeAudit(c.tx, { actor: c.actor, organisationId: c.l.org.id, entity: "FinancePayment", entityId: p!.id, entityLabel: `${certificateLabel(c.l, cert)} · paid by Finance`, reason: i.reason.trim() }, "UPDATE",
    diffFields({ batchNo: before.batchNo, paidOn: before.paidOn }, { batchNo: after.batchNo, paidOn: after.paidOn }));
}
