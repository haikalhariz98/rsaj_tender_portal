"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { auditedCreate, auditedUpdate } from "@/lib/audit/record";
import { allocationFor } from "@/lib/budget/availability";
import { loadBudget } from "@/lib/budget/load";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";

const PROVENANCE = ["STATED", "OBSERVED", "ASSUMED"] as const;
const PATH = "/configuration/budget";

async function organisationId(): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

export async function saveAllocation(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const costCentreCode = r.text("costCentreCode", "Cost centre", { required: true });
  const accountCodeCode = r.text("accountCodeCode", "Account code", { required: true });
  const amount = r.money("amount", "Amount", { required: true });
  const effectiveFrom = r.date("effectiveFrom", "In force from", { required: true });
  const effectiveTo = r.date("effectiveTo", "In force to");
  checkPeriod(r, effectiveFrom, effectiveTo);

  // Two allocations in force for one pair make the balance unanswerable, so the
  // second is refused rather than saved and flagged.
  if (costCentreCode && accountCodeCode && effectiveFrom && !r.failed) {
    const { allocations } = await loadBudget(ORGANISATION_CODE);
    const others = allocations.filter((a) => a.id !== id);
    const clash = allocationFor(others, costCentreCode, accountCodeCode, effectiveFrom);
    if (clash.allocation || clash.ambiguous) {
      r.reject(
        "effectiveFrom",
        "An allocation already covers this cost centre and account code on that date. End it first, or start this one later.",
      );
    }
  }

  const v = {
    costCentreCode,
    accountCodeCode,
    periodLabel: r.text("periodLabel", "Period", { required: true, max: 60 }),
    amount: amount ?? "0",
    provenance: r.choice("provenance", "Provenance", PROVENANCE, { required: true }),
    notes: r.text("notes", "Notes", { max: 2000 }),
    sortOrder: r.int("sortOrder", "Order", { min: 0 }) ?? 0,
    effectiveFrom: effectiveFrom ?? new Date(),
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "BudgetAllocation",
    entityLabel: `${v.costCentreCode} / ${v.accountCodeCode} — ${v.periodLabel}`,
    reason: String(data.get("reason") ?? ""),
  };
  const write = { ...v, provenance: v.provenance! };

  if (!id) {
    await auditedCreate(ctx, v, (tx) =>
      tx.budgetAllocation.create({ data: { organisationId: orgId, ...write } }),
    );
  } else {
    const before = await db.budgetAllocation.findUnique({ where: { id } });
    if (!before) return { ok: false, message: "That allocation no longer exists." };
    await auditedUpdate({ ...ctx, entityId: id }, { ...before, amount: before.amount.toString() }, v, (tx) =>
      tx.budgetAllocation.update({ where: { id }, data: write }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

export async function saveCommitment(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const allocationId = r.text("allocationId", "Allocation", { required: true });
  const reference = r.text("reference", "Reference", { required: true, max: 120 });
  const amount = r.money("amount", "Amount", { required: true });
  const committedOn = r.date("committedOn", "Committed on", { required: true });

  const parsed = r.finish({
    allocationId,
    reference,
    description: r.text("description", "Description", { max: 400 }),
    amount: amount ?? "0",
    committedOn: committedOn ?? new Date(),
  });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const allocation = await db.budgetAllocation.findFirst({
    where: { id: allocationId, organisationId: orgId },
    select: { costCentreCode: true, accountCodeCode: true },
  });
  if (!allocation) return { ok: false, message: "That allocation no longer exists." };

  await auditedCreate(
    {
      organisationId: orgId,
      entity: "BudgetCommitment",
      entityLabel: `${reference} against ${allocation.costCentreCode}`,
      reason: String(data.get("reason") ?? ""),
    },
    parsed.value,
    (tx) => tx.budgetCommitment.create({ data: parsed.value }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Releasing a commitment frees the money and keeps the record.
 *
 * The commitment is part of how the balance moved. Deleting it would make the trail
 * show a balance nobody can reconstruct.
 */
export async function releaseCommitment(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const before = await db.budgetCommitment.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "That commitment no longer exists." };
  if (before.releasedOn) return { ok: false, message: "That commitment is already released." };

  const releasedOn = new Date();
  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "BudgetCommitment",
      entityId: id,
      entityLabel: before.reference,
      reason,
    },
    { releasedOn: null },
    { releasedOn, releaseNote: reason },
    (tx) => tx.budgetCommitment.update({ where: { id }, data: { releasedOn, releaseNote: reason } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/// Ending an allocation closes its period; the row stays so a past check still reads.
export async function endAllocation(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };

  const before = await db.budgetAllocation.findUnique({ where: { id } });
  if (!before) return { ok: false, message: "That allocation no longer exists." };
  if (before.effectiveTo) return { ok: false, message: "That allocation has already ended." };

  const effectiveTo = new Date();
  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "BudgetAllocation",
      entityId: id,
      entityLabel: `${before.costCentreCode} / ${before.accountCodeCode}`,
      reason,
    },
    { effectiveTo: null },
    { effectiveTo },
    (tx) => tx.budgetAllocation.update({ where: { id }, data: { effectiveTo } }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

// ------------------------------------------------------------------ budget codes

/**
 * Save a budget code.
 *
 * The money is not here. What a code is worth is its movement ledger, and a form
 * that could set an allocation directly would be a second place for the same figure
 * to live — the two would disagree the first time a revision was recorded.
 */
export async function saveBudgetCode(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const id = String(data.get("id") ?? "");
  const r = new FormReader(data);

  const existing = await db.budgetCode.findMany({
    where: { organisationId: orgId },
    select: { id: true, code: true },
  });
  const current = id ? existing.find((c) => c.id === id) : undefined;
  if (id && !current) return { ok: false, message: "That budget code no longer exists." };

  // Set once. Finance posts against it, and a code that changes underneath a posted
  // transaction is a reconciliation nobody can complete.
  const code = current
    ? current.code
    : r.code("code", "Code", { taken: existing.map((c) => c.code) });

  const effectiveFrom = r.date("effectiveFrom", "Active period", { required: true });
  const effectiveTo = r.date("effectiveTo", "Active period end");
  checkPeriod(r, effectiveFrom, effectiveTo);

  const v = {
    descriptionEn: r.text("descriptionEn", "Description (EN)", { required: true, max: 200 }),
    descriptionMs: r.optionalText("descriptionMs"),
    type: r.optionalText("type") ?? "",
    owningUnitCode: r.optionalText("owningUnitCode"),
    accountCode: r.text("accountCode", "Account code", { required: true }),
    holderPersonId: r.optionalText("holderPersonId"),
    isActive: r.bool("isActive"),
    effectiveFrom: effectiveFrom!,
    effectiveTo,
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const ctx = {
    organisationId: orgId,
    entity: "BudgetCode",
    entityLabel: `${code} — ${v.descriptionEn}`,
    reason: String(data.get("reason") ?? ""),
  };

  if (!current) {
    const row = { organisationId: orgId, code, ...v };
    await auditedCreate(ctx, row, (tx) => tx.budgetCode.create({ data: row }));
  } else {
    const before = await db.budgetCode.findUnique({ where: { id: current.id } });
    if (!before) return { ok: false, message: "That budget code no longer exists." };
    await auditedUpdate({ ...ctx, entityId: current.id }, before, v, (tx) =>
      tx.budgetCode.update({ where: { id: current.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}
