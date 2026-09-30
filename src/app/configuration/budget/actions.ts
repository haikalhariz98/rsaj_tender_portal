"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { snapshotFields } from "@/lib/audit/diff";
import { auditedCreate, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { allocationFor } from "@/lib/budget/availability";
import { loadBudget } from "@/lib/budget/load";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { checkPeriod, FormReader } from "@/lib/validate";
import { refusalToClose, refusalToReopen, type Period } from "@/lib/budget/periods";
import { figuresFor, transferFaults, type Movement } from "@/lib/budget/codes";
import { syncReadiness } from "@/lib/budget/finance";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";

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

// ---------------------------------------------------------------------- periods

/**
 * Open a period, or close it.
 *
 * Both are recorded as the moment the decision was taken rather than as a status
 * word, so the trail can say when a year stopped accepting postings and the screen
 * can tell a period nobody has opened from one somebody shut.
 */
/**
 * Open, close or reopen a period, with the reason for it.
 *
 * Closing decides what may still be posted into a month, and reopening undoes that
 * decision, so neither is a single click: each asks why, and the reason is kept.
 */
export async function changePeriod(_prev: FormState, data: FormData): Promise<FormState> {
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return setPeriodOpen(String(data.get("id") ?? ""), data.get("open") === "yes", reason);
}

export async function setPeriodOpen(periodId: string, open: boolean, reason = ""): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const before = await db.budgetPeriod.findFirst({
    where: { id: periodId, organisationId: orgId },
  });
  if (!before) return { ok: false, message: "That period no longer exists." };

  const now = new Date();
  const after = open
    ? { openedOn: before.openedOn ?? now, closedOn: null }
    : { openedOn: before.openedOn, closedOn: now };

  const refusal = open ? refusalToReopen(toPeriod(before)) : refusalToClose(toPeriod(before));
  if (refusal === "ALREADY_OPEN") return { ok: false, message: "That period is already open." };
  if (refusal === "ALREADY_CLOSED") return { ok: false, message: "That period is already closed." };
  if (refusal === "NEVER_OPENED") {
    return { ok: false, message: "That period was never opened, so there is nothing to close." };
  }

  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "BudgetPeriod",
      entityId: periodId,
      entityLabel: `${before.year} ${before.code} — ${before.nameEn}`,
      reason,
    },
    { openedOn: before.openedOn, closedOn: before.closedOn },
    after,
    (tx) => tx.budgetPeriod.update({ where: { id: periodId }, data: after }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/// Whether unspent allocation carries into the next year, for one year.
export async function setRollForward(year: number, on: boolean): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const before = await db.budgetYear.findUnique({
    where: { organisationId_year: { organisationId: orgId, year } },
  });

  const ctx = {
    organisationId: orgId,
    entity: "BudgetYear",
    entityLabel: String(year),
    reason: "",
  };

  if (!before) {
    const row = { organisationId: orgId, year, rollUnspentForward: on };
    await auditedCreate(ctx, row, (tx) => tx.budgetYear.create({ data: row }));
  } else {
    await auditedUpdate(
      { ...ctx, entityId: before.id },
      { rollUnspentForward: before.rollUnspentForward },
      { rollUnspentForward: on },
      (tx) =>
        tx.budgetYear.update({ where: { id: before.id }, data: { rollUnspentForward: on } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/// The stored row as the pure module wants it.
function toPeriod(row: {
  id: string;
  year: number;
  code: string;
  nameEn: string;
  nameMs: string | null;
  startsOn: Date;
  endsOn: Date;
  openedOn: Date | null;
  closedOn: Date | null;
  sortOrder: number;
}): Period {
  return row;
}

// ------------------------------------------------------------------ allocations

/// Revise an allocation up or down. A movement on the ledger, never an edit to a total.
export async function addRevision(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const budgetCodeId = r.text("budgetCodeId", "Budget code", { required: true });
  const direction = r.choice("direction", "Direction", ["up", "down"] as const, { required: true });
  const amountText = r.money("amount", "Amount", { required: true });
  const amount = amountText == null ? null : parseSen(amountText);
  const reference = r.text("reference", "Reference", { required: true, max: 60 });
  const description = r.optionalText("description");
  const occurredOn = r.date("occurredOn", "Dated", { required: true });

  if (amount != null && amount <= 0n) {
    r.reject("amount", "A revision of nothing is not a revision. Enter what is being moved.");
  }

  const parsed = r.finish({ budgetCodeId, amount, reference, occurredOn });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const code = await db.budgetCode.findFirst({
    where: { id: budgetCodeId, organisationId: orgId },
    select: { code: true, descriptionEn: true },
  });
  if (!code) return { ok: false, message: "That budget code no longer exists." };

  // Down is stored as a negative revision rather than as its own kind: the ledger
  // sums revisions, and a second kind would have to be remembered everywhere it does.
  // REVISION is the one signed kind (see the schema); `ledgerLines` reads the sign.
  const signed = direction === "down" ? `-${senToDecimalString(amount!)}` : senToDecimalString(amount!);

  const row = {
    budgetCodeId,
    kind: "REVISION" as const,
    reference,
    description: description ?? "",
    amount: signed,
    occurredOn: occurredOn!,
  };

  await auditedCreate(
    {
      organisationId: orgId,
      entity: "BudgetMovement",
      entityLabel: `${code.code} — revision ${reference}`,
      reason: description ?? "",
    },
    row,
    (tx) => tx.budgetMovement.create({ data: row }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Move allocation from one code to another.
 *
 * Two rows in one transaction, each naming the other. A transfer recorded on one side
 * only is money that vanished, and the pair is what lets either code's ledger answer
 * where it went.
 */
export async function transferBetweenCodes(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const fromId = r.text("fromCodeId", "From code", { required: true });
  const toId = r.text("toCodeId", "To code", { required: true });
  const amountText = r.money("amount", "Amount", { required: true });
  const amount = amountText == null ? null : parseSen(amountText);
  const reference = r.optionalText("reference");
  const occurredOn = r.date("occurredOn", "Dated", { required: true });

  const parsed = r.finish({ fromId, toId, amount, occurredOn });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const [from, to] = await Promise.all([
    db.budgetCode.findFirst({ where: { id: fromId, organisationId: orgId } }),
    db.budgetCode.findFirst({ where: { id: toId, organisationId: orgId } }),
  ]);
  if (!from || !to) return { ok: false, message: "One of those codes no longer exists." };

  const movements = await db.budgetMovement.findMany({ where: { budgetCodeId: fromId } });
  const available = figuresFor(
    movements.map((m) => ({
      id: m.id,
      budgetCodeId: m.budgetCodeId,
      kind: m.kind as Movement["kind"],
      reference: m.reference,
      description: m.description,
      amount: m.amount.toString(),
      occurredOn: m.occurredOn,
      releasedOn: m.releasedOn,
      releaseNote: m.releaseNote,
      counterpartCode: m.counterpartCode,
    })),
    fromId,
    new Date(),
  ).available;

  const faults = transferFaults(fromId, toId, amount!, available);
  if (faults.length) {
    const errors: Record<string, string> = {};
    for (const f of faults) {
      if (f === "SAME_CODE") errors.toCodeId = "Choose a different code to move it to.";
      if (f === "NOT_POSITIVE") errors.amount = "Enter what is being moved.";
      if (f === "MORE_THAN_AVAILABLE") {
        errors.amount = `${from.code} only has ${formatSen(available)} available. Revise it up first if the money is coming from somewhere else.`;
      }
    }
    return { ok: false, errors };
  }

  const decimal = senToDecimalString(amount!);
  const when = occurredOn!;

  await db.$transaction(async (tx) => {
    const out = await tx.budgetMovement.create({
      data: {
        budgetCodeId: fromId,
        kind: "TRANSFER_OUT",
        amount: decimal,
        occurredOn: when,
        reference: reference ?? "",
        counterpartCode: to.code,
      },
    });
    await tx.budgetMovement.create({
      data: {
        budgetCodeId: toId,
        kind: "TRANSFER_IN",
        amount: decimal,
        occurredOn: when,
        reference: reference ?? "",
        counterpartCode: from.code,
      },
    });
    await writeAudit(
      tx,
      {
        organisationId: orgId,
        entity: "BudgetMovement",
        // The pair is one act; the outgoing side identifies it.
        entityId: out.id,
        entityLabel: `${from.code} → ${to.code}`,
        reason: reference ?? "",
      },
      "CREATE",
      snapshotFields({ from: from.code, to: to.code, amount: decimal, reference: reference ?? "" }),
    );
  });

  revalidatePath(PATH);
  return { ok: true };
}

// ---------------------------------------------------------------------- controls

/**
 * Save the budget controls.
 *
 * Every field is nullable and an empty box clears it. A threshold nobody has set is
 * not a threshold of zero, and coercing a blank to a number here would invent the
 * customer's policy for them.
 */
export async function saveBudgetControls(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const percent = (name: string, label: string, max: number) => {
    const v = r.int(name, label, { min: 0 });
    if (v != null && v > max) r.reject(name, `${label} cannot be more than ${max}%.`);
    return v;
  };

  const minimum = r.money("minimumInterimCertificate", "Minimum interim certificate");

  const v = {
    availabilityCheck: r.optionalText("availabilityCheck"),
    warningThresholdPercent: percent("warningThresholdPercent", "Warning threshold", 100),
    overCommitmentTolerancePercent: percent(
      "overCommitmentTolerancePercent",
      "Over-commitment tolerance",
      100,
    ),
    // A switch posts nothing when off, so this one really is two states rather than
    // three — which is right: somebody has looked at the toggle either way.
    commitOnApproval: r.bool("commitOnApproval"),
    overrideRoleCodes: (r.optionalText("overrideRoleCodes") ?? "")
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean),
    advanceRecoupmentRatePercent: percent(
      "advanceRecoupmentRatePercent",
      "Advance recoupment rate",
      100,
    ),
    minimumInterimCertificate: minimum,
    paymentTargetDays: r.int("paymentTargetDays", "Payment target", { min: 0 }),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const before = await db.budgetSettings.findUnique({ where: { organisationId: orgId } });
  const ctx = {
    organisationId: orgId,
    entity: "BudgetSettings",
    entityLabel: "Budget controls",
    reason: "",
  };

  if (!before) {
    await auditedCreate(ctx, v, (tx) =>
      tx.budgetSettings.create({ data: { organisationId: orgId, ...v } }),
    );
  } else {
    await auditedUpdate({ ...ctx, entityId: before.id }, before, v, (tx) =>
      tx.budgetSettings.update({ where: { id: before.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Put every control back to not set.
 *
 * The sample calls this "Restore defaults". This product ships no defaults — a
 * threshold or a rate baked in here would be one customer's policy arriving as
 * software — so what it restores is the unset state, and it says so.
 */
export async function clearBudgetControls(): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const before = await db.budgetSettings.findUnique({ where: { organisationId: orgId } });
  if (!before) return { ok: true };

  const cleared = {
    availabilityCheck: null,
    warningThresholdPercent: null,
    overCommitmentTolerancePercent: null,
    commitOnApproval: null,
    overrideRoleCodes: [],
    advanceRecoupmentRatePercent: null,
    minimumInterimCertificate: null,
    paymentTargetDays: null,
  };

  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "BudgetSettings",
      entityId: before.id,
      entityLabel: "Budget controls",
      reason: "Cleared back to not set",
    },
    before,
    cleared,
    (tx) => tx.budgetSettings.update({ where: { id: before.id }, data: cleared }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

// --------------------------------------------------------- finance & operations

/// How and how often the portal reconciles with the customer's finance system.
export async function saveFinanceSettings(_prev: FormState, data: FormData): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const v = {
    direction: r.optionalText("direction"),
    schedule: r.optionalText("schedule"),
    varianceTolerance: r.money("varianceTolerance", "Variance tolerance"),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const before = await db.financeIntegration.findUnique({ where: { organisationId: orgId } });
  const ctx = {
    organisationId: orgId,
    entity: "FinanceIntegration",
    entityLabel: "Finance & Operations",
    reason: "",
  };

  if (!before) {
    await auditedCreate(ctx, v, (tx) =>
      tx.financeIntegration.create({ data: { organisationId: orgId, ...v } }),
    );
  } else {
    await auditedUpdate({ ...ctx, entityId: before.id }, before, v, (tx) =>
      tx.financeIntegration.update({ where: { id: before.id }, data: v }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Synchronise now.
 *
 * There is no adapter behind this yet, and it says so rather than stamping a time
 * that would mean nothing. The attempt is still recorded: a run that could not
 * happen is a fact about the integration, and the screen shows when it was last
 * tried as readily as when it last worked.
 */
export async function synchroniseNow(): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const settings = await db.financeIntegration.findUnique({ where: { organisationId: orgId } });
  const readiness = syncReadiness(settings?.direction);

  const problem =
    readiness === "NOT_CONFIGURED"
      ? "No direction is configured, so there is nothing to synchronise in or out."
      : "No finance system is connected to this deployment yet.";

  const startedAt = new Date();
  const row = {
    organisationId: orgId,
    startedAt,
    finishedAt: startedAt,
    direction: settings?.direction ?? "",
    recordsIn: 0,
    recordsOut: 0,
    problem,
  };

  await auditedCreate(
    {
      organisationId: orgId,
      entity: "FinanceSyncRun",
      entityLabel: "Synchronisation attempt",
      reason: problem,
    },
    row,
    (tx) => tx.financeSyncRun.create({ data: row }),
  );

  revalidatePath(PATH);
  return { ok: false, message: problem };
}

/**
 * Accept the portal's figure for one variance.
 *
 * Settles the row without deleting it. That the two systems once disagreed, and who
 * decided which side was right, is exactly what an audit asks about later.
 */
export async function acceptPortalFigure(varianceId: string): Promise<FormState> {
  const orgId = await organisationId();
  if (!orgId) return NO_ORG;

  const before = await db.financeVariance.findFirst({
    where: { id: varianceId, organisationId: orgId },
  });
  if (!before) return { ok: false, message: "That variance is no longer on record." };
  if (before.resolvedOn) return { ok: false, message: "That one has already been settled." };

  const resolvedOn = new Date();
  const after = { resolvedOn, resolvedNote: "The portal figure was accepted." };

  await auditedUpdate(
    {
      organisationId: orgId,
      entity: "FinanceVariance",
      entityId: varianceId,
      entityLabel: `${before.budgetCodeCode} — ${before.compares}`,
      reason: after.resolvedNote,
    },
    { resolvedOn: before.resolvedOn, resolvedNote: before.resolvedNote },
    after,
    (tx) => tx.financeVariance.update({ where: { id: varianceId }, data: after }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
