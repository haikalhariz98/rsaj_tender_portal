/**
 * A contract's supply claims ("Delivery order and invoice", ADR 0045 D6, D7, D8), as the staff Payments tab and the contractor's portal list them: each claim's invoice
 * number (its title, WV-12), the day it was sent, its state (with the organisation, returned, verified, or paid), and Finance's payment where one is recorded, the
 * amount as `Sen`. Display strings are formatted here, never in a component.
 *
 * Every claim of the contract is read whatever its type's route now says (WV-9: a change never hides a claim already sent). A supply claim is the contractor's own
 * document, so the contractor sees all of it and the two sides read the same rows; the caller has already settled that the reader may see the contract (staff:
 * `caseVisibility`; the contractor: `inHeldContract` or `loadProjectContext`). Each screen links a row with its own route. Server-side.
 */

import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal, type Sen } from "@/lib/money";
import { supplyClaimState, supplyClaimWords, type SupplyClaimState } from "@/lib/payment/supply";

import type { LoadedContract } from "@/lib/contract/repo";

import { loadDocumentFactsMany } from "./facts";
import { documentState } from "./state";
import type { PaymentRoute } from "./types";

/// ADR 0045 D5 (WV-9): the contract type's payment route, read live in the act's transaction. No type, or the route unset: null (today's six kinds).
export async function paymentRouteOf(tx: Tx, l: Pick<LoadedContract, "org" | "ex">): Promise<PaymentRoute | null> {
  if (!l.ex.contractTypeCode) return null;
  const t = await tx.contractType.findFirst({ where: { organisationId: l.org.id, code: l.ex.contractTypeCode }, select: { paymentRoute: true } });
  return t?.paymentRoute ?? null;
}

export interface SupplyClaimRow {
  documentId: string;
  /// The claim's title, which is its invoice number.
  invoiceNo: string;
  /// The day its first version was sent, and in words.
  sentOn: string;
  sentText: string;
  state: SupplyClaimState;
  /// "With {organisation}", "Returned", "Verified", or "Paid {amount} on {day}, batch {no}".
  stateLabel: string;
  payment: { paidOn: string; paidText: string; batchNo: string; amount: Sen; amountText: string; note: string } | null;
  /// Verified and not yet paid: Finance's payment may be recorded now.
  payable: boolean;
}

/// Newest sent first.
export async function loadSupplyClaims(tx: Tx, c: { organisationId: string; orgName: string; contractId: string }): Promise<SupplyClaimRow[]> {
  const docs = await tx.projectDocument.findMany({
    where: { organisationId: c.organisationId, contractId: c.contractId, kind: "SUPPLY_CLAIM" },
    select: { id: true, title: true, supplyPayment: { select: { paidOn: true, batchNo: true, amount: true, note: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const facts = await loadDocumentFactsMany(tx, docs.map((d) => d.id));
  return docs.map((d) => {
    const f = facts.get(d.id)!;
    const p = d.supplyPayment;
    const payment = p ? { paidOn: storedDay(p.paidOn), batchNo: p.batchNo, amount: senFromDecimal(p.amount), note: p.note } : null;
    const state = supplyClaimState(documentState(f), payment !== null);
    // A kind is set only with a version, so a supply claim always has its first.
    const sentOn = f.versions[0]?.uploadedOn ?? "";
    return {
      documentId: d.id,
      invoiceNo: d.title,
      sentOn,
      sentText: formatDate(sentOn),
      state,
      stateLabel: supplyClaimWords(state, c.orgName, payment),
      payment: payment ? { ...payment, paidText: formatDate(payment.paidOn), amountText: formatMoney(payment.amount) } : null,
      payable: state === "VERIFIED",
    };
  });
}

/// The two figures above the staff list: claims waiting to be verified, and verified claims waiting for Finance's payment to be recorded.
export const supplyClaimCounts = (rows: readonly Pick<SupplyClaimRow, "state">[]): { toVerify: number; toRecordPayment: number } => ({
  toVerify: rows.filter((r) => r.state === "WITH_ORGANISATION").length,
  toRecordPayment: rows.filter((r) => r.state === "VERIFIED").length,
});
