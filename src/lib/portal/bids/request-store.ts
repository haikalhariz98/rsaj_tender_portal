import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { Prisma } from "@/generated/prisma/client";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";

import { blockingChecks, judgeRequest, type PreSaleCheck } from "./checks";
import { loadBidContext } from "./context-store";
import { lockExerciseSide } from "./lock";
import { loadSaleFacts } from "./sale-facts";
import { auditActorOf } from "./signup-store";
import { BidRefused, type BidFinding } from "./types";

/**
 * A supplier asks for the tender documents, or withdraws the request (FR-VND-012, FR-ADV-010, Phase 4d). One transaction: the exercise and window locked, the exercise read as this supplier may see it, the
 * pre-sale checks judged on the locked rows (the register's reading of this supplier now, the officer's attendance register, the sale that stands), then:
 *  - something the supplier can put right (no collector named, a request that stands, documents already bought) is refused and nothing is written;
 *  - a check that stops it is kept as a refused attempt with the checks, so the refusal and its reason are on record (FR-ADV-010) - unless the only thing in the way is that the sale is not open, which
 *    is no refusal of this supplier and is not recorded;
 *  - otherwise the request is written and waits for an officer, who records the sale as they do for a counter purchase. A request starts no sale and takes no payment (online payment is INT-10, not built).
 * The supplier is the SESSION's and the clock the server's.
 */

const refuse = (fs: readonly BidFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new BidRefused(fs, status);
};

export type RequestOutcome =
  | { outcome: "MADE"; requestId: string; checks: PreSaleCheck[] }
  /// The checks stopped it. `recorded`: it was kept as a refused attempt.
  | { outcome: "REFUSED"; requestId: string | null; recorded: boolean; checks: PreSaleCheck[] };

export async function requestDocuments(actor: SupplierActor, i: { exerciseId: string; collectorName: string }, now: Date = new Date()): Promise<RequestOutcome> {
  return db.$transaction(
    async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
      if (!ctx || !ctx.ex.window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const facts = await loadSaleFacts(tx, actor, ctx);
      const judged = judgeRequest({ checks: facts.checks, collectorName: i.collectorName, standing: facts.standing != null, alreadyBought: facts.sale != null });
      if (judged.outcome === "FAULTS") return refuse(judged.faults);

      const collectorName = i.collectorName.trim();
      const label = `${ctx.ex.reference} · Request for the documents by ${actor.supplierName}`;
      const audit = { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "DocumentRequest" };
      const checks = facts.checks as unknown as Prisma.InputJsonValue;

      if (judged.outcome === "REFUSED") {
        const blocks = blockingChecks(facts.checks);
        // Only the sale being closed: nobody is refused anything, so there is nothing to keep.
        if (blocks.every((c) => c.key === "ON_SALE")) return { outcome: "REFUSED", requestId: null, recorded: false, checks: facts.checks };
        // The same refusal again (same checks) is not kept twice.
        if (facts.refused && JSON.stringify(facts.refused.checks) === JSON.stringify(facts.checks)) return { outcome: "REFUSED", requestId: facts.refused.id, recorded: true, checks: facts.checks };
        const row = await tx.documentRequest.create({ data: { organisationId: actor.organisationId, windowId: ctx.ex.window.id, supplierId: actor.supplierId, collectorName, requestedBySupplierAccountId: actor.accountId, requestedAt: now, checks, refusedAt: now } });
        await writeAudit(tx, { ...audit, entityId: row.id, entityLabel: label }, "CREATE", diffFields(null, { request: "Refused by the pre-sale checks", reasons: blocks.map((c) => c.detail).join(" "), madeBy: "the supplier's own portal account" }), );
        return { outcome: "REFUSED", requestId: row.id, recorded: true, checks: facts.checks };
      }

      const row = await tx.documentRequest.create({ data: { organisationId: actor.organisationId, windowId: ctx.ex.window.id, supplierId: actor.supplierId, collectorName, requestedBySupplierAccountId: actor.accountId, requestedAt: now, checks } });
      await writeAudit(tx, { ...audit, entityId: row.id, entityLabel: label }, "CREATE", diffFields(null, { request: "Asked for the documents", collector: collectorName, madeBy: "the supplier's own portal account", payment: "Not taken online" }));
      return { outcome: "MADE", requestId: row.id, checks: facts.checks };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export async function withdrawRequest(actor: SupplierActor, i: { exerciseId: string }, now: Date = new Date()): Promise<{ requestId: string }> {
  return db.$transaction(
    async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
      if (!ctx || !ctx.ex.window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const standing = await tx.documentRequest.findFirst({ where: { windowId: ctx.ex.window.id, organisationId: actor.organisationId, supplierId: actor.supplierId, refusedAt: null, endedAt: null }, select: { id: true } });
      if (!standing) return refuse([{ code: "NO_REQUEST", level: "block" }]);
      await tx.documentRequest.update({ where: { id: standing.id, organisationId: actor.organisationId }, data: { endedAt: now, endedBySupplierAccountId: actor.accountId } });
      await writeAudit(tx, { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: "DocumentRequest", entityId: standing.id, entityLabel: `${ctx.ex.reference} · Request for the documents by ${actor.supplierName}` }, "UPDATE", diffFields({ request: "Asked for the documents" }, { request: "Withdrawn by the supplier" }));
      return { requestId: standing.id };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}
