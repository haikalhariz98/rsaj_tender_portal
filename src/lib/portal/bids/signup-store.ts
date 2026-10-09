import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor, SupplierActor } from "@/lib/auth/types";
import { formatOrgDateTime } from "@/lib/format";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { SITE_EVENT_KIND_LABEL } from "@/lib/window/labels";

import { isInvited, loadBidContext, type BidContext } from "./context-store";
import { lockExerciseSide } from "./lock";
import { signUpFaults, withdrawFaults } from "./signup";
import { BidRefused, type BidFinding } from "./types";

/**
 * A supplier signs up for a briefing or a site visit, or withdraws (FR-VND-013, Phase 4d). One transaction: the exercise and its window locked, the exercise read as this supplier may see it, the
 * rules judged on the locked rows, the row written and the audit row beside it. The supplier is the SESSION's and the clock is the server's: nothing in the request names either. A sign-up is not attendance
 * and writes nothing the officer's register reads.
 */

export const auditActorOf = (a: SupplierActor): AuditActor => ({ kind: "SUPPLIER", supplierAccountId: a.accountId, sessionId: a.sessionId, sourceAddress: a.sourceAddress });

const TX = { timeout: 20_000, maxWait: 10_000 } as const;
const refuse = (fs: readonly BidFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new BidRefused(fs, status);
};

async function eventOf(tx: Tx, actor: SupplierActor, ctx: BidContext, eventId: string) {
  const window = ctx.ex.window;
  if (!window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
  const event = await tx.siteEvent.findFirst({ where: { id: eventId, organisationId: actor.organisationId, windowId: window.id }, select: { id: true, kind: true, startsAt: true, place: true, heldOn: true, cancelledAt: true } });
  if (!event) return refuse([{ code: "EVENT_NOT_FOUND", level: "block" }], 404);
  return event;
}

export async function signUp(actor: SupplierActor, i: { exerciseId: string; eventId: string; representative: string }, now: Date = new Date()): Promise<{ registrationId: string }> {
  return db.$transaction(async (tx) => {
    if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
    if (!ctx) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const event = await eventOf(tx, actor, ctx, i.eventId);
    const existing = await tx.siteEventRegistration.findUnique({ where: { eventId_supplierId: { eventId: event.id, supplierId: actor.supplierId } } });
    const faults = signUpFaults({
      event: { startsAt: event.startsAt, cancelled: event.cancelledAt != null, heldOn: event.heldOn ? storedDay(event.heldOn) : null },
      phase: ctx.phase,
      path: ctx.path,
      invited: isInvited(ctx),
      representative: i.representative,
      existing: existing ? { endedAt: existing.endedAt } : null,
      now,
    });
    if (faults.some((f) => f.level === "block")) return refuse(faults);

    const representative = i.representative.trim();
    const what = SITE_EVENT_KIND_LABEL[event.kind];
    const data = { representative, registeredBySupplierAccountId: actor.accountId, registeredAt: now, endedAt: null, endedBySupplierAccountId: null };
    const row = existing
      ? await tx.siteEventRegistration.update({ where: { id: existing.id, organisationId: actor.organisationId }, data })
      : await tx.siteEventRegistration.create({ data: { organisationId: actor.organisationId, eventId: event.id, supplierId: actor.supplierId, ...data } });
    await writeAudit(
      tx,
      { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "SiteEventRegistration", entityId: row.id, entityLabel: `${ctx.ex.reference} · ${what}, sign-up by ${actor.supplierName}` },
      existing ? "UPDATE" : "CREATE",
      diffFields(existing ? { representative: existing.representative, signedUp: "No" } : null, { event: `${what}, ${formatOrgDateTime(event.startsAt, ctx.org.timeZone)}`, representative, signedUp: "Yes", madeBy: "the supplier's own portal account" }),
    );
    return { registrationId: row.id };
  }, TX);
}

export async function withdrawSignUp(actor: SupplierActor, i: { exerciseId: string; eventId: string }, now: Date = new Date()): Promise<{ registrationId: string }> {
  return db.$transaction(async (tx) => {
    if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
    if (!ctx) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const event = await eventOf(tx, actor, ctx, i.eventId);
    const existing = await tx.siteEventRegistration.findUnique({ where: { eventId_supplierId: { eventId: event.id, supplierId: actor.supplierId } } });
    const faults = withdrawFaults({ event: { startsAt: event.startsAt, cancelled: event.cancelledAt != null, heldOn: event.heldOn ? storedDay(event.heldOn) : null }, phase: ctx.phase, existing: existing ? { endedAt: existing.endedAt } : null, now });
    if (faults.some((f) => f.level === "block")) return refuse(faults);
    const row = await tx.siteEventRegistration.update({ where: { id: existing!.id, organisationId: actor.organisationId }, data: { endedAt: now, endedBySupplierAccountId: actor.accountId } });
    const what = SITE_EVENT_KIND_LABEL[event.kind];
    await writeAudit(
      tx,
      { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "SiteEventRegistration", entityId: row.id, entityLabel: `${ctx.ex.reference} · ${what}, sign-up by ${actor.supplierName}` },
      "UPDATE",
      diffFields({ signedUp: "Yes" }, { signedUp: "No", madeBy: "the supplier's own portal account" }),
    );
    return { registrationId: row.id };
  }, TX);
}
