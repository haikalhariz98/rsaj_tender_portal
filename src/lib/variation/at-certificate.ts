/**
 * What the certificate core asks the variation module about its certificates (6.13 Part A step 4; carry 614-C1 as
 * ruled, BD-613-8). Server-only: called by the core's own acts, inside their transaction, on the rows the core locked
 * (Requisition → Exercise → Award → Contract → Certificate); nothing here takes a lock.
 *
 * - Its approval of record (before a draft goes to signing): the application (VO-660) once its variation's latest
 *   prior approval route is approved; the order (VO-663) once its value is covered by the variation's approved routes
 *   (`orderApprovalFaults`). Every other kind: the core's own rule (null).
 * - At issue, under the contract's lock: the instruction is still approved (or exempt) and consented where it must be
 *   (FR-VAR-009, 015); the order is still covered; an adjustment of the contract sum still stands on the issued
 *   adjustments it was worked out from, and no variation route whose percentage was read over the revised sum waits
 *   for a decision (it would move under it).
 * - After an adjustment of the contract sum is issued: the S.O. is resolved again at the revised sum, where the
 *   switch says so (OD-A7 A).
 */

import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { loadIssue } from "@/lib/authority/load";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { baselineOn } from "@/lib/payment/load";
import { amountOf, senToDecimalString } from "@/lib/money";
import { supervisionRefusal } from "@/lib/supervision/labels";
import { loadSupervision, methodKeyOf } from "@/lib/supervision/load";
import { resolveSo, soOn } from "@/lib/supervision/so";
import { soAfterAdjustment } from "./so-after";

import { latestRoute } from "./application";
import { instructionIssueFaults } from "./instruction";
import { variationRefusal } from "./labels";
import { consentOf, factsOf, issuedAdjustments, loadAdjustments, loadVariations, orderNetOf } from "./load";
import { orderApprovalFaults } from "./order";
import type { Finding } from "./types";
import type { AuditActor } from "@/lib/auth/types";

const VARIATION_KINDS = ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] as const;

/// The variation of the certificate, by the record that holds it.
async function variationOf(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }) {
  const all = await loadVariations(l.contract.id, tx);
  if (cert.kind === "VARIATION_APPLICATION") return all.find((v) => v.applicationCertificateId === cert.id) ?? null;
  if (cert.kind === "SO_INSTRUCTION") return all.find((v) => v.instructions.some((i) => i.certificateId === cert.id)) ?? null;
  if (cert.kind === "VARIATION") return all.find((v) => v.orders.some((o) => o.certificateId === cert.id)) ?? null;
  return null;
}

/// The amount measured at agreed rates on an order's lines, as frozen with it.
const agreedTotalOf = (judgedUnder: unknown): bigint => {
  const j = judgedUnder as { agreedRateTotal?: string } | null;
  return j?.agreedRateTotal ? BigInt(j.agreedRateTotal) : 0n;
};

/**
 * Before a draft of these kinds goes to signing: why its approval of record does not stand, or [] where it does. Null:
 * not a kind the variation module answers for (the core's own rule applies).
 */
export async function approvalOfRecordFaults(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }): Promise<Finding[] | null> {
  if (cert.kind !== "VARIATION_APPLICATION" && cert.kind !== "VARIATION") return null;
  const v = await variationOf(tx, l, cert);
  if (!v) return [{ code: "MONEY_NEEDS_APPROVED_ROUTE", level: "block", data: { kind: cert.kind, route: null } }];
  const f = factsOf(v);
  if (cert.kind === "VARIATION_APPLICATION") {
    const r = latestRoute(f, "PRIOR");
    return r?.status === "APPROVED" ? [] : [{ code: "MONEY_NEEDS_APPROVED_ROUTE", level: "block", data: { kind: cert.kind, route: r?.status ?? null } }];
  }
  const o = v.orders.find((x) => x.certificateId === cert.id)!;
  return orderApprovalFaults({ v: f, net: orderNetOf(o), agreedRateTotal: agreedTotalOf(o.judgedUnder) });
}

/// At issue: the refusal's text, or null where it may issue.
export async function variationIssueRefusal(tx: Tx, l: LoadedContract, cert: { id: string; kind: string }): Promise<string | null> {
  if (!(VARIATION_KINDS as readonly string[]).includes(cert.kind)) return null;
  if (cert.kind === "SUM_ADJUSTMENT") return adjustmentIssueRefusal(tx, l, cert);
  const v = await variationOf(tx, l, cert);
  if (!v) return null;
  const f = factsOf(v);
  if (cert.kind === "SO_INSTRUCTION") {
    const fs = instructionIssueFaults({ v: f, funderConsentRequired: v.funderConsentRequired, consent: consentOf(v).state });
    return fs.length ? variationRefusal("Not issued:", fs) : null;
  }
  if (cert.kind === "VARIATION") {
    const o = v.orders.find((x) => x.certificateId === cert.id)!;
    const fs = orderApprovalFaults({ v: f, net: orderNetOf(o), agreedRateTotal: agreedTotalOf(o.judgedUnder) });
    return fs.length ? variationRefusal("Not issued:", fs) : null;
  }
  return null;
}

async function adjustmentIssueRefusal(tx: Tx, l: LoadedContract, cert: { id: string }): Promise<string | null> {
  const rows = await loadAdjustments(l.contract.id, tx);
  const self = rows.find((a) => a.certificateId === cert.id);
  if (!self) return null;
  const fs: Finding[] = [];
  // The issued adjustments it was worked out on must still be the issued set (none issued since).
  const read = ((self.judgedUnder as { priorRead?: string[] } | null)?.priorRead ?? []).slice().sort();
  const now = issuedAdjustments(rows).map((a) => a.id).sort();
  if (read.join() !== now.join()) fs.push({ code: "PRIOR_ADJUSTMENTS_MOVED", level: "block" });
  // A variation route waiting whose percentage was read over the revised sum would move under this one.
  const pending = await tx.variationApproval.findMany({ where: { variation: { contractId: l.contract.id }, approvalInstance: { status: "PENDING" } }, select: { reading: true, variation: { select: { reference: true } } } });
  for (const p of pending) if ((p.reading as { base?: string } | null)?.base === "REVISED") fs.push({ code: "VARIATION_ROUTE_ON_BASE", level: "block", data: { variation: p.variation.reference ? `Variation ${p.variation.reference}` : null } });
  return fs.length ? variationRefusal("Not issued:", fs) : null;
}

/**
 * After an adjustment of the contract sum is issued (the last signature, under the contract's lock): the S.O. resolved
 * again at the revised sum where the switch is on (OD-A7 A); a refusal rolls the issue back, naming the matrix.
 */
export async function afterCertificateIssue(tx: Tx, actor: AuditActor, l: LoadedContract, cert: { id: string; kind: string }, now: Date, today: string): Promise<string | null> {
  if (cert.kind !== "SUM_ADJUSTMENT") return null;
  const policy = await tx.postAwardPolicy.findUnique({ where: { organisationId: l.org.id }, select: { soReResolve: true } });
  if (policy?.soReResolve !== true) return null;
  const rows = await loadAdjustments(l.contract.id, tx);
  const baseline = baselineOn(l, today);
  if (!baseline) return null;
  const revised = issuedAdjustments(rows).reduce((a, x) => a + x.net, baseline.values.contractSum);
  const s = await loadSupervision(l.contract.id, tx);
  const current = soOn(s.soAssignments.map((x) => ({ ...x, effectiveOn: storedDay(x.effectiveOn) })), today);
  const issue = await loadIssue(l.org.code, dayToDate(today), undefined, null, tx);
  const res = issue ? resolveSo(issue.matrix, { contractValue: amountOf(senToDecimalString(revised)), method: await methodKeyOf(l, tx), contractTypeCode: l.ex.contractTypeCode }) : null;
  const after = soAfterAdjustment(true, current, res, issue?.label ?? null);
  if (after.state === "REFUSE") return supervisionRefusal("Not issued:", after.faults);
  if (after.state !== "MOVE" || !issue) return null;
  const r = after.resolution;
  const row = await tx.contractSoAssignment.create({
    data: { organisationId: l.org.id, contractId: l.contract.id, roleCode: r.roleCode, roleLabel: r.roleLabel, reason: "RE_RESOLVED", matrixLabel: issue.label, ruleKey: r.ruleKey, ruleLabel: r.ruleLabel, clause: r.clause, contractValue: senToDecimalString(revised), regime: l.ex.regime, warnings: r.notes.map((n) => n.messageEn) as Prisma.InputJsonValue, effectiveOn: dayToDate(today), recordedAt: now },
  });
  await writeAudit(tx, { actor, organisationId: l.org.id, entity: "ContractSoAssignment", entityId: row.id, entityLabel: `Contract ${l.contract.number} · ${l.award.awardeeName} · Superintending Officer resolved again`, reason: "The revised contract sum crossed a band." }, "CREATE",
    diffFields({ office: current?.roleLabel ?? null }, { office: r.roleLabel, resolvedFrom: `${issue.label}: ${r.ruleLabel} (${r.clause})`, revisedContractSum: senToDecimalString(revised), effectiveOn: today }));
  return null;
}
