import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { dayIn } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { gatewayReading, SIMULATED_LABEL } from "@/lib/integration/payment-gateway";
import { formatMoney, parseSen } from "@/lib/money";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";

import { blockingChecks, type PreSaleCheck } from "./checks";
import type { BidContext } from "./context-store";
import { buyerStandingCheck, judgePurchase, onlinePurchaseChecks, PAID_CHANNEL_WORDS, type PaidChannel, type PurchaseState } from "./purchase";
import { loadSaleFacts } from "./sale-facts";

/**
 * What the signed-in supplier sees of buying the documents online (SR-10): whether it can buy and why not, where its purchase stands, how it was paid, and what a failed try said. Reads only,
 * in the caller's client; every read names the session's supplier and organisation. The organisation's own name is said where online payment is not connected (ruling 17).
 */

export interface OnlineView {
  /// The pre-sale checks as they apply online, in words.
  checks: PreSaleCheck[];
  fee: string | null;
  state: "NOT_BOUGHT" | PurchaseState;
  canBuy: boolean;
  /// Why it cannot be bought now, in words (the first thing in the way), or null.
  whyNot: string | null;
  /// The purchase, once made.
  purchase: {
    startedOn: string;
    paid: null | { on: string; channel: PaidChannel; channelWords: string; method: string | null; reference: string | null; amount: string };
    /// The last failed try, while the purchase is still awaiting payment.
    lastFailure: null | { method: string; text: string };
  } | null;
  /// Whether it can be paid online now, the methods offered, and where it cannot why, with the words to show the buyer.
  payment: { available: boolean; methods: readonly string[]; words: string; organisation: string };
}

/// The buyer's standing as the checks read it: the account, the contact on the supplier record, and the supplier's standing on the register.
export type BuyerActor = Pick<SupplierActor, "supplierId" | "organisationId" | "accountId" | "displayName">;

export async function buyerCheckOf(tx: Tx, actor: BuyerActor, now: Date): Promise<PreSaleCheck> {
  const [account, bar] = await Promise.all([
    tx.supplierAccount.findFirst({ where: { id: actor.accountId, organisationId: actor.organisationId, supplierId: actor.supplierId }, select: { status: true, contact: { select: { retiredOn: true } } } }),
    portalStandingBarOf(tx, actor, "TRANSACT", now),
  ]);
  return buyerStandingCheck({ name: actor.displayName, accountActive: account?.status === "ACTIVE", contactCurrent: !!account && account.contact.retiredOn == null, bar });
}

export async function loadOnlineView(tx: Tx, actor: BuyerActor, ctx: BidContext): Promise<OnlineView | null> {
  const window = ctx.ex.window;
  if (!window || ctx.ex.saleMode !== "ONLINE") return null;
  const [facts, buyer, policy, purchase] = await Promise.all([
    loadSaleFacts(tx, actor, ctx),
    buyerCheckOf(tx, actor, ctx.now),
    tx.windowPolicy.findUnique({ where: { organisationId: actor.organisationId }, select: { electronicDocumentRelease: true, paymentSimulatorOn: true, simulatedPaymentMethods: true } }),
    tx.documentPurchase.findUnique({
      where: { windowId_supplierId: { windowId: window.id, supplierId: actor.supplierId } },
      select: { organisationId: true, state: true, createdAt: true, paidAt: true, paidChannel: true, paidMethod: true, paidReference: true, amount: true, attempts: { orderBy: { attemptNo: "desc" }, take: 1, select: { outcome: true, method: true, failureText: true } } },
    }),
  ]);
  const mine = purchase && purchase.organisationId === actor.organisationId ? purchase : null;
  const checks = onlinePurchaseChecks(facts.checks, buyer);
  const reading = gatewayReading({ simulatorOn: policy?.paymentSimulatorOn ?? null, methods: policy?.simulatedPaymentMethods ?? [] });
  const judged = judgePurchase({ saleMode: ctx.ex.saleMode, releaseOnline: policy?.electronicDocumentRelease ?? null, feeSet: window.feeAmount != null, checks, alreadyBought: facts.sale != null || mine?.state === "PAID", purchaseStands: false });
  const state: OnlineView["state"] = mine ? mine.state : "NOT_BOUGHT";
  const first = judged.outcome === "FAULTS" ? judged.faults[0] : judged.outcome === "REFUSED" ? "REFUSED" : null;
  const whyNot =
    state !== "NOT_BOUGHT"
      ? null
      : first === "REFUSED"
        ? (blockingChecks(checks)[0]?.detail ?? "The documents cannot be sold to your company at the moment.")
        : first
          ? ({ NOT_SOLD_ONLINE: "The documents of this exercise are not sold online.", RELEASE_NOT_ONLINE: "The organisation has not set that documents are released online, so they cannot be bought here. Ask the procurement office.", FEE_NOT_SET: "The fee for the documents is not set, so they cannot be bought yet. Tell the procurement office.", WINDOW_NOT_DATED: "The dates of the sale cannot be read, so nothing can be bought yet. Tell the procurement office.", ALREADY_BOUGHT: "The documents have already been bought for your company.", PURCHASE_STANDS: "You have already started buying these documents." } as const)[first]
          : null;
  const lastFail = mine?.attempts[0]?.outcome === "FAILED" ? mine.attempts[0] : null;
  return {
    checks,
    fee: window.feeAmount != null ? formatMoney(parseSen(window.feeAmount.toString())) : null,
    state,
    canBuy: state === "NOT_BOUGHT" && judged.outcome === "MAKE",
    whyNot,
    purchase: mine
      ? {
          startedOn: formatDate(dayIn(mine.createdAt, ctx.org.timeZone)),
          paid: mine.state === "PAID" && mine.paidAt && mine.paidChannel ? { on: formatDate(dayIn(mine.paidAt, ctx.org.timeZone)), channel: mine.paidChannel, channelWords: PAID_CHANNEL_WORDS[mine.paidChannel], method: mine.paidMethod, reference: mine.paidChannel === "SIMULATED" ? mine.paidReference : null, amount: formatMoney(parseSen(mine.amount.toString())) } : null,
          lastFailure: mine.state === "AWAITING_PAYMENT" && lastFail ? { method: lastFail.method, text: lastFail.failureText } : null,
        }
      : null,
    payment: { available: reading.available, methods: reading.available ? reading.methods : [], words: reading.available ? SIMULATED_LABEL : reading.words, organisation: ctx.org.name },
  };
}
