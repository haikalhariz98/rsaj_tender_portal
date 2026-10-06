import type { ITXClientDenyList } from "@prisma/client/runtime/client";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import type { AuditActor } from "@/lib/auth/types";

import { actorColumns } from "./actor";
import { diffFields, snapshotFields, type FieldChange } from "./diff";

/**
 * Writing a change and recording it are one act.
 *
 * Every mutation runs inside a transaction with its audit row, so a change can never
 * exist without a record of it. `actorPersonId` stays null until sign-in exists and
 * `unattributed` says so on the row itself — a null that means "nobody was recorded"
 * must not be mistaken later for a null that means the record was lost.
 */

/// The application client inside a transaction. Derived from `db` itself, not from
/// `Prisma.TransactionClient`, so it carries the client's global omit (the sealed estimate
/// figure, ADR 0012): a query through a Tx can no more read it than one through `db`.
export type Tx = Omit<typeof db, ITXClientDenyList>;

export interface AuditContext {
  organisationId: string;
  entity: string;
  entityId: string;
  /// How the row read at the time. A deleted row is still legible in the trail.
  entityLabel: string;
  reason?: string;
  /// Who acted. Optional until Phase 1b makes every caller give one.
  actor?: AuditActor;
}

export async function writeAudit(
  tx: Tx,
  ctx: AuditContext,
  action: "CREATE" | "UPDATE" | "DELETE",
  changes: FieldChange[],
): Promise<void> {
  await tx.auditEntry.create({
    data: {
      organisationId: ctx.organisationId,
      entity: ctx.entity,
      entityId: ctx.entityId,
      entityLabel: ctx.entityLabel,
      action,
      changes: changes as unknown as Prisma.InputJsonValue,
      reason: ctx.reason ?? "",
      ...actorColumns(ctx.actor),
    },
  });
}

/// Create a row and record it. `after` is what a reader should see recorded, which is
/// not always the whole row — a generated id tells nobody anything.
export async function auditedCreate<T>(
  ctx: Omit<AuditContext, "entityId">,
  after: Record<string, unknown>,
  create: (tx: Tx) => Promise<T & { id: string }>,
): Promise<T & { id: string }> {
  return db.$transaction(async (tx) => {
    const row = await create(tx);
    await writeAudit(tx, { ...ctx, entityId: row.id }, "CREATE", diffFields(null, after));
    return row;
  });
}

/**
 * Update a row and record what moved.
 *
 * A submission that changes nothing writes no audit row. A trail padded with empty
 * entries is one nobody reads.
 */
export async function auditedUpdate<T>(
  ctx: AuditContext,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  update: (tx: Tx) => Promise<T>,
): Promise<{ row: T; changed: boolean }> {
  const changes = diffFields(before, after);
  return db.$transaction(async (tx) => {
    const row = await update(tx);
    if (changes.length > 0) await writeAudit(tx, ctx, "UPDATE", changes);
    return { row, changed: changes.length > 0 };
  });
}

/**
 * Create or replace a row and record it, as one act.
 *
 * For a write whose target may or may not exist yet — a member's vote on a matter is
 * one row however often it is re-entered. `before` is null when there is no row, and
 * the entry is then a creation; otherwise it records what moved. The write and its
 * audit row share the transaction, and the write callback may itself read inside it.
 */
export async function auditedUpsert<T extends { id: string }>(
  ctx: Omit<AuditContext, "entityId">,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  write: (tx: Tx) => Promise<T>,
): Promise<T> {
  const changes = diffFields(before, after);
  return db.$transaction(async (tx) => {
    const row = await write(tx);
    if (before == null || changes.length > 0) {
      await writeAudit(tx, { ...ctx, entityId: row.id }, before == null ? "CREATE" : "UPDATE", changes);
    }
    return row;
  });
}

/// Delete a row, keeping the whole of it in the trail.
export async function auditedDelete(
  ctx: AuditContext,
  before: Record<string, unknown>,
  remove: (tx: Tx) => Promise<unknown>,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await remove(tx);
    await writeAudit(tx, ctx, "DELETE", snapshotFields(before));
  });
}

export interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  entityLabel: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  changes: FieldChange[];
  reason: string;
  unattributed: boolean;
  actorName: string | null;
  at: Date;
}

/// The trail for one row, or for the whole organisation when no entity is given.
export async function loadAudit(
  organisationCode: string,
  opts: { entity?: string; entityId?: string; take?: number; entities?: readonly string[]; labelPrefix?: string } = {},
): Promise<AuditRow[]> {
  const organisation = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!organisation) return [];

  const entries = await db.auditEntry.findMany({
    where: {
      organisationId: organisation.id,
      ...(opts.entity ? { entity: opts.entity } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
      ...(opts.entities ? { entity: { in: [...opts.entities] } } : {}),
      ...(opts.labelPrefix ? { entityLabel: { startsWith: opts.labelPrefix } } : {}),
    },
    orderBy: { at: "desc" },
    take: opts.take ?? 50,
    include: { actorPerson: { select: { name: true } } },
  });

  return entries.map((e) => ({
    id: e.id,
    entity: e.entity,
    entityId: e.entityId,
    entityLabel: e.entityLabel,
    action: e.action as AuditRow["action"],
    changes: (e.changes ?? []) as unknown as FieldChange[],
    reason: e.reason,
    unattributed: e.unattributed,
    actorName: e.actorPerson?.name ?? null,
    at: e.at,
  }));
}
