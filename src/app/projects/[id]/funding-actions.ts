"use server";

import { revalidatePath } from "next/cache";

import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { contractLabel, withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayToDate } from "@/lib/dates";
import { SPLIT_FAULT_TEXT } from "@/lib/funding/labels";
import { bpToPercent, percentToBp, sameShares, splitFaults } from "@/lib/funding/split";
import { contractFunding, fundingText, sourcesOf, splitLockedOn } from "@/lib/funding/store";
import { FormReader } from "@/lib/validate";

/**
 * A contract's funding split (SF-05, FS-7) and its impact figures (SF-04, FS-12), on the project overview: the table's
 * FUNDING row is asked first under the lock (open from the number on, so a wrong source is corrected before execution). Each is a record act (`staffForAct("TRANSACTION")`, so
 * an administrator account is refused), under the contract's lock, by anyone who sees the case's contract stages; it writes no Person column, so the audit row
 * names the actor. Each save is one audit row with its before and after in words and its reason. The rules are `splitFaults`; this file restates none.
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };

function done(contractId: string): FormState {
  revalidatePath(`/projects/${contractId}`);
  return { ok: true };
}

export async function recordFundingSplit(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", { required: true, max: 100 });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  const ids = data.getAll("sourceId").map(String);
  const pcts = data.getAll("sharePct").map((v) => String(v).trim());
  // A row left wholly empty is no row.
  const rows = ids.map((sourceId, i) => ({ sourceId: sourceId.trim(), pct: pcts[i] ?? "" })).filter((x) => x.sourceId || x.pct);
  if (r.failed) return { ok: false, errors: r.errors };
  const result = await withLockedContract(actor.organisationId, contractId, async (tx, l): Promise<FormState> => {
    // The act x status table first, under the lock: the funding row (open from the number through termination).
    const shut = actStatusFault("FUNDING", l.contract.status as ContractStatus);
    if (shut) return { ok: false, message: actStatusText(shut) };
    const today = dayOf(new Date(), l.org.timeZone);
    if (!today) return { ok: false, message: "Time zone not set. An administrator sets it under Configuration › Organisation." };
    const sources = await sourcesOf(tx, l.org.id);
    const requisition = await tx.requisition.findFirst({ where: { id: l.ex.requisitionId, organisationId: l.org.id }, select: { projectCategoryCode: true } });
    const locked = await splitLockedOn(tx, l.org.id, contractId);
    const faults = splitFaults({ rows, sources, categoryCode: requisition?.projectCategoryCode ?? null, locked, on: dayToDate(today) });
    if (faults.length > 0) return { ok: false, message: faults.map((f) => SPLIT_FAULT_TEXT[f]).join(" ") };
    const current = await contractFunding(tx, l.org.id, contractId);
    // A recorded split saved again unchanged is no change. The requisition's source recorded as 100% is one: it fixes the source on the contract (FS-5).
    if (current.state === "SPLIT" && sameShares(current.shares, rows.map((x) => ({ sourceId: x.sourceId, bp: percentToBp(x.pct)! })))) return { ok: false, message: "Nothing differs from the split as it stands." };
    const names = new Map(sources.map((s) => [s.id, s.label]));
    const before = fundingText(current, names);
    const now = new Date();
    await tx.fundingAllocation.deleteMany({ where: { organisationId: l.org.id, contractId } });
    await tx.fundingAllocation.createMany({ data: rows.map((x) => ({ organisationId: l.org.id, contractId, fundingSourceId: x.sourceId, sharePct: bpToPercent(percentToBp(x.pct)!), recordedAt: now })) });
    const after = fundingText(await contractFunding(tx, l.org.id, contractId), names);
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: l.org.id, entity: "Contract", entityId: contractId, entityLabel: contractLabel({ number: l.contract.number, award: l.award }), reason }, "UPDATE", diffFields({ funding: before }, { funding: after }));
    return done(contractId);
  });
  return result ?? GONE;
}

/// A figure: zero or more, to at most 4 decimals (Decimal(18,4)).
const FIGURE = /^\d{1,14}(\.\d{1,4})?$/;

export async function recordImpact(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const r = new FormReader(data);
  const contractId = r.text("contractId", "Contract", { required: true, max: 100 });
  const reason = r.text("reason", "Reason", { required: true, max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const result = await withLockedContract(actor.organisationId, contractId, async (tx, l): Promise<FormState> => {
    // The act x status table first, under the lock: the funding row (open from the number through termination).
    const shut = actStatusFault("FUNDING", l.contract.status as ContractStatus);
    if (shut) return { ok: false, message: actStatusText(shut) };
    const measures = await tx.impactMeasure.findMany({ where: { organisationId: l.org.id }, select: { id: true, nameEn: true, unit: true } });
    const stored = await tx.projectImpact.findMany({ where: { organisationId: l.org.id, contractId }, select: { measureId: true, value: true } });
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const errors: Record<string, string> = {};
    const writes: { measureId: string; value: string | null }[] = [];
    for (const m of measures) {
      const posted = data.get(`value_${m.id}`);
      if (posted == null) continue;
      const text = String(posted).replace(/,/g, "").trim();
      if (text && !FIGURE.test(text)) {
        errors[`value_${m.id}`] = "A figure of zero or more, to at most 4 decimals.";
        continue;
      }
      const kept = stored.find((s) => s.measureId === m.id)?.value ?? null;
      const was = kept?.toString() ?? null;
      const now = text || null;
      // Compared as decimals ("4.50" is 4.5), never through a float.
      if (now == null ? was == null : kept != null && kept.equals(now)) continue;
      before[m.nameEn] = was == null ? null : `${was} ${m.unit}`;
      after[m.nameEn] = now == null ? null : `${now} ${m.unit}`;
      writes.push({ measureId: m.id, value: now });
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    if (writes.length === 0) return { ok: false, message: "Nothing differs from the figures as they stand." };
    for (const w of writes) {
      // Replaced whole, as the split is: the audit row keeps what it was.
      await tx.projectImpact.deleteMany({ where: { organisationId: l.org.id, contractId, measureId: w.measureId } });
      if (w.value != null) await tx.projectImpact.create({ data: { organisationId: l.org.id, contractId, measureId: w.measureId, value: w.value } });
    }
    await writeAudit(tx, { actor: toAuditActor(actor), organisationId: l.org.id, entity: "Contract", entityId: contractId, entityLabel: contractLabel({ number: l.contract.number, award: l.award }), reason }, "UPDATE", diffFields(before, after));
    return done(contractId);
  });
  return result ?? GONE;
}
