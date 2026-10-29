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

/// The figure Finance pays on a certificate kind, from its issued figures (null: none). Phase 2 close-out stage C: the final certificate's
/// payment recommended (plan §4.6), so Use of proceeds' "certified" counts the final payment too.
export const PAID_FIGURE: Readonly<Record<string, string>> = { INTERIM_PAYMENT: "recommended", ADVANCE_PAYMENT: "advanceAmount", FINAL: "recommended" };

/// A figure frozen in an issue snapshot, by key, from its lines or its totals (null: not there).
export function snapshotFigure(issueSnapshot: unknown, key: string): string | null {
  const f = (issueSnapshot as { figures?: { lines?: { key: string; value: string | null }[]; totals?: { key: string; value: string | null }[] } } | null)?.figures;
  return [...(f?.lines ?? []), ...(f?.totals ?? [])].find((x) => x.key === key)?.value ?? null;
}

/// The figure Finance pays on a certificate, as frozen with its issue (null: the kind has none, or it was not frozen). The one reading of PAID_FIGURE.
export function paidFigureOf(kind: string, issueSnapshot: unknown): string | null {
  const key = PAID_FIGURE[kind];
  return key ? snapshotFigure(issueSnapshot, key) : null;
}
