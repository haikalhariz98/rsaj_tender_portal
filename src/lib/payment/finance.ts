/**
 * Finance's payment of an issued payment certificate (6.13 Part A step 3: FR-PAY-019, INT-07 behind the façade:
 * the manual adapter records what Finance returns). Once per certificate, on or after the day it was issued, never
 * in the future, with Finance's batch number; the amount is the certificate's own figure as issued (the payment
 * recommended, or the advance), never keyed. Pure.
 */

import type { Sen } from "@/lib/money";

import type { Day, Finding } from "./types";

export function financeFaults(i: { issued: boolean; already: boolean; batchNo: string; paidOn: Day; issuedOn: Day | null; today: Day; amount: Sen | null }): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.issued) f("NOT_ISSUED");
  if (i.already) f("PAYMENT_ALREADY_RECORDED");
  if (!i.batchNo.trim()) f("BATCH_REQUIRED");
  if (i.paidOn > i.today) f("FUTURE_DATE", { day: i.paidOn });
  if (i.issuedOn && i.paidOn < i.issuedOn) f("PAID_BEFORE_ISSUE", { day: i.issuedOn });
  if (i.issued && i.amount == null) f("ROUTE_FIGURE_NOT_COMPUTED");
  return out;
}

/// The figure Finance pays on a certificate kind, from its issued figures (null: none).
export const PAID_FIGURE: Readonly<Record<string, string>> = { INTERIM_PAYMENT: "recommended", ADVANCE_PAYMENT: "advanceAmount" };
