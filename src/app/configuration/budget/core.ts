import { revalidatePath } from "next/cache";
import { END_DAY_LABEL } from "@/lib/effective-text";

import type { FormState } from "@/components/record-editor";
import { snapshotFields } from "@/lib/audit/diff";
import { auditedCreate, auditedUpdate, writeAudit } from "@/lib/audit/record";
import { organisationDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { checkPeriod, FormReader } from "@/lib/validate";
import { postingRefusal, refusalToClose, refusalToReopen, type Period } from "@/lib/budget/periods";
import { figuresFor, transferFaults, type Movement } from "@/lib/budget/codes";
import { syncReadiness } from "@/lib/budget/finance";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";
import type { AuditActor } from "@/lib/auth/types";
import type { OrgScope } from "@/lib/org-scope";

const PATH = "/configuration/budget";

async function organisationId(scope: OrgScope): Promise<string | null> {
  const org = await db.organisation.findUnique({
    where: { id: scope.organisationId },
    select: { id: true },
  });
  return org?.id ?? null;
}

const NO_ORG: FormState = {
  ok: false,
  message: "No organisation is configured. Run npm run setup before adding records.",
};

/// A refusal found inside a transaction: thrown to roll it back, answered as the form's state.
class Refused extends Error {
  constructor(readonly state: FormState) {
    super("refused");
  }
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
  const effectiveTo = r.date("effectiveTo", END_DAY_LABEL);
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
    actor: toAuditActor(actor),
    organisationId: orgId,
    entity: "BudgetCode",
    entityLabel: `${code} — ${v.descriptionEn}`,
    reason: String(data.get("reason") ?? ""),
  };

  if (!current) {
    const row = { organisationId: orgId, code, ...v };
    await auditedCreate(ctx, row, (tx) => tx.budgetCode.create({ data: row }));
  } else {
    const before = await db.budgetCode.findUnique({ where: { id: current.id, organisationId: actor.organisationId } });
    if (!before) return { ok: false, message: "That budget code no longer exists." };
    await auditedUpdate({ ...ctx, entityId: current.id }, before, v, (tx) =>
      tx.budgetCode.update({ where: { id: current.id, organisationId: actor.organisationId }, data: v }),
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
  const actor = await requireStaff();
  const reason = String(data.get("reason") ?? "").trim();
  if (!reason) return { ok: false, errors: { reason: "A reason is required." } };
  return setPeriodOpen(actor, toAuditActor(actor), String(data.get("id") ?? ""), data.get("open") === "yes", reason);
}

async function setPeriodOpen(scope: OrgScope, by: AuditActor, periodId: string, open: boolean, reason: string): Promise<FormState> {
  const orgId = await organisationId(scope);
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
      actor: by,
      organisationId: orgId,
      entity: "BudgetPeriod",
      entityId: periodId,
      entityLabel: `${before.year} ${before.code} — ${before.nameEn}`,
      reason,
    },
    { openedOn: before.openedOn, closedOn: before.closedOn },
    after,
    (tx) => tx.budgetPeriod.update({ where: { id: periodId, organisationId: scope.organisationId }, data: after }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

/// Whether unspent allocation carries into the next year, for one year.
export async function setRollForward(year: number, on: boolean): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const before = await db.budgetYear.findUnique({
    where: { organisationId_year: { organisationId: orgId, year } },
  });

  const ctx = {
    actor: toAuditActor(actor),
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
        tx.budgetYear.update({ where: { id: before.id, organisationId: actor.organisationId }, data: { rollUnspentForward: on } }),
    );
  }

  revalidatePath(PATH);
  return { ok: true };
}

/// The stored row as the pure module wants it.
/// The message when a movement falls in a closed period, or null. Read from the
/// periods as they stand, so a period closed a minute ago already refuses.
async function closedPeriodMessage(orgId: string, on: Date): Promise<string | null> {
  const periods = await db.budgetPeriod.findMany({ where: { organisationId: orgId } });
  const closed = postingRefusal(periods.map(toPeriod), on);
  return closed
    ? `${closed.nameEn} ${closed.year} is closed, so nothing dated in it can be posted. Reopen it first, or date this in an open period.`
    : null;
}

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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
  if (occurredOn) {
    const closed = await closedPeriodMessage(orgId, occurredOn);
    if (closed) r.reject("occurredOn", closed);
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
      actor: toAuditActor(actor),
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const fromId = r.text("fromCodeId", "From code", { required: true });
  const toId = r.text("toCodeId", "To code", { required: true });
  const amountText = r.money("amount", "Amount", { required: true });
  const amount = amountText == null ? null : parseSen(amountText);
  const reference = r.optionalText("reference");
  const occurredOn = r.date("occurredOn", "Dated", { required: true });
  if (occurredOn) {
    const closed = await closedPeriodMessage(orgId, occurredOn);
    if (closed) r.reject("occurredOn", closed);
  }

  const parsed = r.finish({ fromId, toId, amount, occurredOn });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const [from, to] = await Promise.all([
    db.budgetCode.findFirst({ where: { id: fromId, organisationId: orgId } }),
    db.budgetCode.findFirst({ where: { id: toId, organisationId: orgId } }),
  ]);
  if (!from || !to) return { ok: false, message: "One of those codes no longer exists." };

  const decimal = senToDecimalString(amount!);
  const when = occurredOn!;

  // Judged on the locked source, inside the transaction that writes it: a transfer or a commitment that took the
  // money while this one waited is counted here, so two transfers cannot both spend the same balance.
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BudgetCode" WHERE id = ${fromId} AND "organisationId" = ${orgId} FOR UPDATE`;
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { timeZone: true } });
      // What is available is judged on the organisation's day, never the UTC one, and not as at a day still to come.
      const today = organisationDay(new Date(), org.timeZone);
      if (!today) throw new Refused({ ok: false, message: "The organisation's time zone is not set, so no day can be recorded. Set it under Configuration, Organisation." });
      if (when > today) throw new Refused({ ok: false, errors: { occurredOn: "A transfer cannot be dated after today." } });

      const movements = await tx.budgetMovement.findMany({ where: { budgetCodeId: fromId } });
      const available = figuresFor(
        movements.map((m) => ({ ...m, kind: m.kind as Movement["kind"], amount: m.amount.toString() })),
        fromId,
        today,
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
        throw new Refused({ ok: false, errors });
      }

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
          actor: toAuditActor(actor),
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
  } catch (e) {
    if (e instanceof Refused) return e.state;
    throw e;
  }

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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const r = new FormReader(data);
  const percent = (name: string, label: string, max: number) => {
    const v = r.int(name, label, { min: 0 });
    if (v != null && v > max) r.reject(name, `${label} cannot be more than ${max}%.`);
    return v;
  };

  const v = {
    availabilityCheck: r.optionalText("availabilityCheck"),
    warningThresholdPercent: percent("warningThresholdPercent", "Warning threshold", 100),
    // A switch posts nothing when off, so this one really is two states rather than
    // three — which is right: somebody has looked at the toggle either way.
    commitOnApproval: r.bool("commitOnApproval"),
  };

  const parsed = r.finish(v);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const before = await db.budgetSettings.findUnique({ where: { organisationId: orgId } });
  const ctx = {
    actor: toAuditActor(actor),
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
      tx.budgetSettings.update({ where: { id: before.id, organisationId: actor.organisationId }, data: v }),
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
  if (!orgId) return NO_ORG;

  const before = await db.budgetSettings.findUnique({ where: { organisationId: orgId } });
  if (!before) return { ok: true };

  const cleared = {
    availabilityCheck: null,
    warningThresholdPercent: null,
    commitOnApproval: null,
  };

  await auditedUpdate(
    {
      actor: toAuditActor(actor),
      organisationId: orgId,
      entity: "BudgetSettings",
      entityId: before.id,
      entityLabel: "Budget controls",
      reason: "Cleared back to not set",
    },
    before,
    cleared,
    (tx) => tx.budgetSettings.update({ where: { id: before.id, organisationId: actor.organisationId }, data: cleared }),
  );

  revalidatePath(PATH);
  return { ok: true };
}

// --------------------------------------------------------- finance & operations

/// How and how often the portal reconciles with the customer's finance system.
export async function saveFinanceSettings(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
    actor: toAuditActor(actor),
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
      tx.financeIntegration.update({ where: { id: before.id, organisationId: actor.organisationId }, data: v }),
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
      actor: toAuditActor(actor),
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
  const actor = await requireStaff();
  const orgId = await organisationId(actor);
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
      actor: toAuditActor(actor),
      organisationId: orgId,
      entity: "FinanceVariance",
      entityId: varianceId,
      entityLabel: `${before.budgetCodeCode} — ${before.compares}`,
      reason: after.resolvedNote,
    },
    { resolvedOn: before.resolvedOn, resolvedNote: before.resolvedNote },
    after,
    (tx) => tx.financeVariance.update({ where: { id: varianceId, organisationId: actor.organisationId }, data: after }),
  );

  revalidatePath(PATH);
  return { ok: true };
}
