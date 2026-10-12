import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { gatewayReading, offeredMethod, paymentSimulator, SIMULATED_LABEL, type PaymentChoice } from "@/lib/integration/payment-gateway";
import { formatMoney, parseSen } from "@/lib/money";
import { standingBarFinding } from "@/lib/portal/standing-gate";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";
import { ENTITY } from "@/lib/window/audit-view";
import { lockSaleRows } from "@/lib/window/lock";

import { blockingChecks } from "./checks";
import { loadBidContext } from "./context-store";
import { lockExerciseSide } from "./lock";
import { judgePurchase, onlinePurchaseChecks, type PurchaseFault } from "./purchase";
import { buyerCheckOf } from "./purchase-read";
import { markPurchasePaid, PurchaseBarred, PurchaseNotAwaiting } from "./purchase-paid";
import { loadSaleFacts } from "./sale-facts";
import { auditActorOf } from "./signup-store";
import { BidRefused, type BidFinding } from "./types";

/**
 * Buying the tender documents online, and paying for them on the payment simulator (SR-10, rulings 16 and 17 as amended). Each act is one transaction: the exercise and its
 * window locked, the exercise read as this supplier may see it, everything judged again on the locked rows. The supplier is the SESSION's and the clock the server's.
 *
 *  - `startPurchase`: "Buy documents". The pre-sale checks are judged (the counter's, with the officer's sighting replaced by a reading of the signed-in person's standing); a
 *    check that stops it is kept as a refused attempt, as a request is; otherwise a purchase is made, awaiting payment. It takes no payment and releases nothing.
 *  - `settlePayment`: the supplier chose a method and then "Pay successfully" or "Payment fails" on the simulated provider's page. Where the simulator is not switched on it refuses in
 *    words and the office records the payment instead. Each try is kept (a failure leaves the purchase awaiting payment, with the failure shown); a success pays it through
 *    `markPurchasePaid`, the one writer of "paid", and releases the documents.
 */

const TX = { timeout: 20_000, maxWait: 10_000 } as const;
const refuse = (fs: readonly BidFinding[], status: 404 | 409 | 422 = 422): never => {
  throw new BidRefused(fs, status);
};

export type StartOutcome =
  | { outcome: "MADE"; purchaseId: string }
  /// The purchase already stands and is awaiting payment: the same answer to a second press.
  | { outcome: "STANDS"; purchaseId: string }
  | { outcome: "REFUSED"; recorded: boolean; reasons: string[] };

export async function startPurchase(actor: SupplierActor, i: { exerciseId: string }, now: Date = new Date()): Promise<StartOutcome> {
  return db.$transaction(async (tx) => {
    if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
    if (!ctx || !ctx.ex.window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
    if (!ctx.org.today) return refuse([{ code: "WINDOW_NOT_DATED", level: "block" }]);
    const window = ctx.ex.window;

    const standing = await tx.documentPurchase.findUnique({ where: { windowId_supplierId: { windowId: window.id, supplierId: actor.supplierId } }, select: { id: true, state: true } });
    if (standing?.state === "AWAITING_PAYMENT") return { outcome: "STANDS", purchaseId: standing.id };

    const facts = await loadSaleFacts(tx, actor, ctx);
    const [buyer, policy] = await Promise.all([buyerCheckOf(tx, actor, now), tx.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { electronicDocumentRelease: true } })]);
    const checks = onlinePurchaseChecks(facts.checks, buyer);
    const judged = judgePurchase({ saleMode: ctx.ex.saleMode, releaseOnline: policy?.electronicDocumentRelease ?? null, feeSet: window.feeAmount != null, checks, alreadyBought: facts.sale != null || standing?.state === "PAID", purchaseStands: false });
    if (judged.outcome === "FAULTS") return refuse(judged.faults.map((code: PurchaseFault): BidFinding => ({ code, level: "block" })));

    const audit = { actor: auditActorOf(actor), organisationId: actor.organisationId };
    const label = `${ctx.ex.reference} · Online purchase by ${actor.supplierName}`;
    const stored = checks as unknown as Prisma.InputJsonValue;
    if (judged.outcome === "REFUSED") {
      const blocks = blockingChecks(checks);
      // Only the sale being closed: nobody is refused anything, so there is nothing to keep.
      if (blocks.every((c) => c.key === "ON_SALE")) return { outcome: "REFUSED", recorded: false, reasons: blocks.map((c) => c.detail) };
      // The same refusal again (same checks) is not kept twice.
      if (facts.refused && JSON.stringify(facts.refused.checks) === JSON.stringify(checks)) return { outcome: "REFUSED", recorded: true, reasons: blocks.map((c) => c.detail) };
      const row = await tx.documentRequest.create({ data: { organisationId: actor.organisationId, windowId: window.id, supplierId: actor.supplierId, collectorName: actor.displayName, requestedBySupplierAccountId: actor.accountId, requestedAt: now, checks: stored, refusedAt: now } });
      await writeAudit(tx, { ...audit, entity: ENTITY.documentRequest, entityId: row.id, entityLabel: `${ctx.ex.reference} · Request for the documents by ${actor.supplierName}` }, "CREATE", diffFields(null, { request: "Refused by the pre-sale checks, buying online", reasons: blocks.map((c) => c.detail).join(" "), madeBy: "the supplier's own portal account" }));
      return { outcome: "REFUSED", recorded: true, reasons: blocks.map((c) => c.detail) };
    }

    // One purchase per supplier and window; a paid one was caught above as "already bought", so only a first purchase reaches here.
    const made = await tx.documentPurchase.create({ data: { organisationId: actor.organisationId, windowId: window.id, supplierId: actor.supplierId, buyerAccountId: actor.accountId, createdAt: now, amount: window.feeAmount!.toString(), checks: stored } });
    await writeAudit(tx, { ...audit, entity: ENTITY.purchase, entityId: made.id, entityLabel: label }, "CREATE", diffFields(null, { purchase: "Started buying the documents online", state: "Awaiting payment", fee: formatMoney(parseSen(window.feeAmount!.toString())), boughtBy: actor.displayName, madeBy: "the supplier's own portal account" }));
    return { outcome: "MADE", purchaseId: made.id };
  }, TX);
}

export type SettleOutcome =
  | { outcome: "PAID"; reference: string; method: string; already: boolean }
  | { outcome: "FAILED"; reference: string; method: string; failureText: string };

/**
 * The buyer's answer on the simulated provider's page. The method is one the organisation offers; the choice is "PAY" or "FAIL". A purchase already paid answers as it was paid, without a
 * second payment (a double press changes nothing). Where the simulator is not switched on, or the switch was turned off while the buyer was on the page, it refuses in words.
 */
export async function settlePayment(actor: SupplierActor, i: { exerciseId: string; method: string; choice: PaymentChoice }, now: Date = new Date()): Promise<SettleOutcome> {
  try {
    return await db.$transaction(async (tx) => {
      if (!(await lockExerciseSide(tx, actor.organisationId, i.exerciseId))) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      const ctx = await loadBidContext(tx, actor, i.exerciseId, now);
      if (!ctx || !ctx.ex.window) return refuse([{ code: "NOT_FOUND", level: "block" }], 404);
      if (!ctx.org.today) return refuse([{ code: "WINDOW_NOT_DATED", level: "block" }]);
      const window = ctx.ex.window;
      const purchase = await tx.documentPurchase.findUnique({ where: { windowId_supplierId: { windowId: window.id, supplierId: actor.supplierId } } });
      if (!purchase || purchase.organisationId !== actor.organisationId) return refuse([{ code: "NO_PURCHASE", level: "block" }], 404);
      if (purchase.state === "PAID") {
        // Idempotent: the payment that stands is the answer.
        return { outcome: "PAID", reference: purchase.paidReference ?? "", method: purchase.paidMethod ?? "", already: true };
      }
      // Read inside the lock: the switch turned off meanwhile refuses here.
      const policy = await tx.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { paymentSimulatorOn: true, simulatedPaymentMethods: true, electronicDocumentRelease: true } });
      const reading = gatewayReading({ simulatorOn: policy?.paymentSimulatorOn ?? null, methods: policy?.simulatedPaymentMethods ?? [] });
      if (!reading.available) return refuse([{ code: "PAYMENT_UNAVAILABLE", level: "block", data: { words: reading.words } }]);
      if (policy?.electronicDocumentRelease !== true) return refuse([{ code: "RELEASE_NOT_ONLINE", level: "block" }]);
      if (ctx.ex.saleMode !== "ONLINE") return refuse([{ code: "NOT_SOLD_ONLINE", level: "block" }]);
      const method = offeredMethod(reading.methods, i.method);
      if (!method) return refuse([{ code: "METHOD_NOT_OFFERED", level: "block" }]);
      // The documents are on sale now: a payment after the last day of sale is not taken.
      if (ctx.phase !== "OPEN_FOR_PURCHASE") return refuse([{ code: "NOT_ON_SALE", level: "block" }]);
      const bar = await portalStandingBarOf(tx, actor, "TRANSACT", now);
      if (bar) return refuse([standingBarFinding(bar)]);

      await lockSaleRows(tx, window.id);
      const attemptNo = (await tx.paymentAttempt.count({ where: { purchaseId: purchase.id } })) + 1;
      const settled = paymentSimulator.settle({ purchaseId: purchase.id, attemptNo, method }, i.choice);
      const audit = { actor: auditActorOf(actor), organisationId: actor.organisationId, entity: ENTITY.purchase, entityId: purchase.id, entityLabel: `${ctx.ex.reference} · Online purchase by ${actor.supplierName}` };

      if (settled.outcome === "FAILED") {
        await tx.paymentAttempt.create({ data: { organisationId: actor.organisationId, purchaseId: purchase.id, attemptNo, method, outcome: "FAILED", reference: settled.reference, failureText: settled.failureText, attemptedAt: now, byAccountId: actor.accountId } });
        await writeAudit(tx, audit, "UPDATE", diffFields({ attempt: null }, { attempt: `${SIMULATED_LABEL} failed`, method, reference: settled.reference, stillAwaitingPayment: "yes", note: "No money moved: a demonstration." }));
        return { outcome: "FAILED", reference: settled.reference, method, failureText: settled.failureText };
      }

      // A buyer barred by the register since it began is told so before an attempt is kept (the paying act reads the register again on the locked supplier row).
      await tx.paymentAttempt.create({ data: { organisationId: actor.organisationId, purchaseId: purchase.id, attemptNo, method, outcome: "PAID", reference: settled.reference, attemptedAt: now, byAccountId: actor.accountId } });
      await markPurchasePaid(tx, {
        org: { id: ctx.org.id, timeZone: ctx.org.timeZone, today: ctx.org.today },
        exercise: { id: ctx.ex.id, reference: ctx.ex.reference, title: ctx.ex.title, closes: ctx.ex.closingAt },
        window: { id: window.id },
        purchase: { id: purchase.id, supplierId: actor.supplierId, amount: purchase.amount },
        buyer: { accountId: actor.accountId, name: actor.displayName },
        now,
        by: { channel: "SIMULATED", method, reference: settled.reference },
        auditActor: auditActorOf(actor),
      });
      return { outcome: "PAID", reference: settled.reference, method, already: false };
    }, TX);
  } catch (e) {
    // Nothing was written (the transaction rolled back): say why in words.
    if (e instanceof PurchaseBarred) throw new BidRefused([{ code: "PAYMENT_BARRED", level: "block", data: { words: e.words } }]);
    if (e instanceof PurchaseNotAwaiting) throw new BidRefused([{ code: "ALREADY_PAID", level: "block" }], 409);
    throw e;
  }
}

/// The date a paid purchase is shown with.
export const paidOnText = (day: string) => formatDate(day);
