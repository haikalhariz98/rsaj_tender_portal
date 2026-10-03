/**
 * Recording Finance's payment of an issued certificate (6.13 Part A step 3: FR-PAY-019). Server-only: runs inside the
 * certificate page's act on the rows `withLockedCertificate` locked; re-runs the rule, writes and audits in the same
 * transaction. Nobody is signed in: the officer named is recorded on their behalf.
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { certificateLabel } from "@/lib/certificate/repo";
import { CertificateRefusal, type CertCtx } from "@/lib/certificate/write";
import { dayToDate } from "@/lib/dates";
import { parseSen, senToDecimalString } from "@/lib/money";

import { financeFaults, PAID_FIGURE } from "./finance";
import { paymentRefusal } from "./labels";

export async function recordFinancePayment(c: CertCtx, i: { batchNo: string; paidOn: string; personId: string; note: string }) {
  const cert = c.l.cert;
  const snap = cert.issueSnapshot as { issuedOn?: string; figures?: { lines?: { key: string; value: string | null }[]; totals?: { key: string; value: string | null }[] } } | null;
  const key = PAID_FIGURE[cert.kind];
  const v = key ? ([...(snap?.figures?.totals ?? []), ...(snap?.figures?.lines ?? [])].find((x) => x.key === key)?.value ?? null) : null;
  const existing = await c.tx.financePayment.findUnique({ where: { certificateId: cert.id }, select: { id: true } });
  const fs = financeFaults({ issued: cert.status === "ISSUED", already: !!existing, batchNo: i.batchNo, paidOn: i.paidOn, issuedOn: snap?.issuedOn ?? null, today: c.today, amount: v == null ? null : parseSen(v) });
  if (!key) fs.unshift({ code: "KIND_HAS_NO_ROUTE", level: "block" });
  if (fs.length) throw new CertificateRefusal(paymentRefusal("Not recorded:", fs));
  const person = await c.tx.person.findFirst({ where: { id: i.personId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  if (!person) throw new CertificateRefusal("Not recorded.", { personId: "Choose someone on record and active." });
  const amount = senToDecimalString(parseSen(v!));
  const row = await c.tx.financePayment.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, batchNo: i.batchNo.trim(), paidOn: dayToDate(i.paidOn), amount, personId: person.id, note: i.note.trim(), recordedAt: c.now } });
  await writeAudit(c.tx, { organisationId: c.l.org.id, entity: "FinancePayment", entityId: row.id, entityLabel: `${certificateLabel(c.l, cert)} · paid by Finance`, reason: "" }, "CREATE",
    diffFields(null, { batchNo: i.batchNo.trim(), paidOn: i.paidOn, amountPaid: amount, recordedFor: person.name, recordedOnBehalf: "not signed", note: i.note.trim() || null }));
}
