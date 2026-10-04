/**
 * The extension of the contract period (6.13 Part B run 1b: FR-EOT-011, 012, 013). Pure.
 *
 * Recorded with the four cumulative preconditions and the SPAN Act's compliance, each stored as answered; any one not
 * confirmed refuses the send (the SOP is silent on the fallback, so nothing is assumed). The contract type must offer
 * an extension of the contract period (`instrumentFaults(…, "PERIOD", …)`, carried). No value band is assumed (FR-EOT-012:
 * R7's RM0.01–RM50,000 band is never defaulted; the rows are the customer's). The agreement's issue refuses
 * PERIOD_MOVED where the contract period moved since it was raised.
 */

import type { Sen } from "@/lib/money";

import type { Day, Finding } from "./types";

export const PERIOD_PRECONDITIONS = ["priorAgreement", "termsRetained", "ratesRetained", "performanceSatisfactory", "spanConfirmed"] as const;
export type PeriodPrecondition = (typeof PERIOD_PRECONDITIONS)[number];

export function periodRecordFaults(i: { instrument: readonly Finding[]; currentExpiry: Day | null; newExpiry: Day | null; reason: string; financialImpact: Sen | null }): Finding[] {
  const out: Finding[] = [...i.instrument];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.currentExpiry) f("NO_DATE_FOR_COMPLETION");
  else if (!i.newExpiry || i.newExpiry <= i.currentExpiry) f("NEW_EXPIRY_NOT_LATER", { day: i.currentExpiry });
  if (!i.reason.trim()) f("PERIOD_REASON_REQUIRED");
  if (i.financialImpact != null && i.financialImpact < 0n) f("FINANCIAL_IMPACT_BELOW_NOTHING");
  return out;
}

export function periodSendFaults(i: Record<PeriodPrecondition, boolean>): Finding[] {
  return PERIOD_PRECONDITIONS.filter((p) => !i[p]).map((p) => ({ code: "PRECONDITION_NOT_MET", level: "block" as const, data: { precondition: p } }));
}

export function periodMovedFaults(current: Day, now: Day | null): Finding[] {
  return now === current ? [] : [{ code: "PERIOD_MOVED", level: "block", data: { day: now } }];
}
