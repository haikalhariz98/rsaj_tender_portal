import { diffFields } from "@/lib/audit/diff";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";
import { standingBarFinding } from "@/lib/portal/standing-gate";
import { writeAudit } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";

import { acknowledgeFaults } from "./acknowledge";
import { loadBidContext } from "./context-store";
import { lockExerciseSide } from "./lock";
import { auditActorOf } from "./signup-store";
import { BidRefused, type BidFinding } from "./types";
import { inOrder } from "@/lib/series";

/**
 * A supplier acknowledges an addendum it holds a copy of (FR-VND-013, Phase 4d). One transaction: the exercise and window locked, the exercise read as this supplier may see it, the rules judged on the locked
 * rows, the acknowledgement written (append-only: the database refuses a change or a removal) and the audit row beside it. The day is the organisation's, stamped by the server. It writes nothing of what an
 * officer records of a paper copy (`AddendumRecipient.despatchedOn`, `acknowledgedOn`).
 */

const refuse = (fs: readonly BidFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new BidRefused(fs, status);
};

export async function acknowledgeAddendum(actor: SupplierActor, i: { exerciseId: string; addendumId: string }, now: Date = new Date()): Promise<{ acknowledgementId: string; on: string }> {
  return db.$transaction(
    async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
      if (!ctx || !ctx.ex.window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      // Ruling on 1875(3): a supplier whose standing bars it may read, and does nothing else here.
      const bar = await portalStandingBarOf(tx, actor, "TRANSACT", now);
      if (bar) return refuse([standingBarFinding(bar)]);
      const addendum = await tx.addendum.findFirst({ where: { id: i.addendumId, organisationId: actor.organisationId, windowId: ctx.ex.window.id }, select: { id: true, number: true, title: true, status: true } });
      if (!addendum) return refuse([{ code: "ADDENDUM_NOT_FOUND", level: "block" }], 404);
      const [copy, already] = await inOrder(
        () => ctx.parties.length ? tx.addendumRecipient.findFirst({ where: { addendumId: addendum.id, organisationId: actor.organisationId, partyId: { in: ctx.parties.map((p) => p.id) } }, select: { id: true } }) : Promise.resolve(null),
        () => tx.addendumAcknowledgement.findUnique({ where: { addendumId_supplierId: { addendumId: addendum.id, supplierId: actor.supplierId } }, select: { acknowledgedOn: true } }));
      const faults = acknowledgeFaults({ addendum, phase: ctx.phase, holdsCopy: copy != null, alreadyAcknowledged: already != null });
      if (faults.some((f) => f.level === "block")) {
        // The day it was acknowledged goes with the refusal of a second one.
        return refuse(faults.map((f) => (f.code === "ALREADY_ACKNOWLEDGED" && already ? { ...f, data: { on: storedDay(already.acknowledgedOn) } } : f)));
      }
      const day = todayIn(now, ctx.org.timeZone);
      if (!day) return refuse([{ code: "WINDOW_NOT_DATED", level: "block" }]);
      const row = await tx.addendumAcknowledgement.create({ data: { organisationId: actor.organisationId, addendumId: addendum.id, supplierId: actor.supplierId, acknowledgedBySupplierAccountId: actor.accountId, acknowledgedOn: dayToDate(day), acknowledgedAt: now } });
      await writeAudit(
        tx,
        { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "AddendumAcknowledgement", entityId: row.id, entityLabel: `${ctx.ex.reference} · Addendum ${addendum.number ?? ""}, acknowledged by ${actor.supplierName}`.replace("Addendum ,", "Addendum,") },
        "CREATE",
        diffFields(null, { addendum: `${addendum.number != null ? `Addendum ${addendum.number}, ` : ""}${addendum.title}`, acknowledged: "Yes", madeBy: "the supplier's own portal account", delivery: "Not a record of delivery" }),
      );
      return { acknowledgementId: row.id, on: day };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
