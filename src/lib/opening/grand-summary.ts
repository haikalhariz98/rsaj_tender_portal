/**
 * The Grand Summary (FR-OPN-010), after finalising only: each offer qualified (its verdict PASS) or
 * not, and the lowest qualifying offer marked. A tie is never broken: every offer at the lowest price
 * is marked, in listing order. A rejected offer is never the lowest, however low. The words are the
 * customer's (`OpeningPolicy` labels); unset renders the product's English words, never a borrowed
 * one. Frozen with the schedule. Prices compared in sen, never as floats. Pure.
 */

import { senToDecimalString, type Sen } from "@/lib/money";

import type { Finding, OpeningVerdict } from "./types";

export interface SummaryLabels {
  qualified: string | null;
  notQualified: string | null;
  lowest: string | null;
}

export const PRODUCT_SUMMARY_LABELS = { qualified: "Qualified", notQualified: "Not qualified", lowest: "Lowest qualifying offer" } as const;

export interface SummaryRow {
  listingNo: number;
  bidderName: string;
  openingPrice: string;
  qualified: boolean;
  lowest: boolean;
  label: string;
}

export interface GrandSummary {
  rows: SummaryRow[];
  labels: { qualified: string; notQualified: string; lowest: string };
}

export function grandSummary(i: { finalised: boolean; bids: readonly { listingNo: number; bidderName: string; price: Sen; verdict: OpeningVerdict | null }[]; labels: SummaryLabels }): { summary: GrandSummary } | { fault: Finding<"NOT_FINALISED"> } {
  if (!i.finalised) return { fault: { code: "NOT_FINALISED", level: "block" } };
  const labels = { qualified: i.labels.qualified ?? PRODUCT_SUMMARY_LABELS.qualified, notQualified: i.labels.notQualified ?? PRODUCT_SUMMARY_LABELS.notQualified, lowest: i.labels.lowest ?? PRODUCT_SUMMARY_LABELS.lowest };
  const passed = i.bids.filter((b) => b.verdict === "PASS");
  const low = passed.reduce<Sen | null>((m, b) => (m == null || b.price < m ? b.price : m), null);
  const rows = [...i.bids]
    .sort((a, b) => a.listingNo - b.listingNo)
    .map((b) => {
      const qualified = b.verdict === "PASS";
      const lowest = qualified && low != null && b.price === low;
      return { listingNo: b.listingNo, bidderName: b.bidderName, openingPrice: senToDecimalString(b.price), qualified, lowest, label: lowest ? labels.lowest : qualified ? labels.qualified : labels.notQualified };
    });
  return { summary: { rows, labels } };
}

/// A frozen Grand Summary as read back (defensive); null where none is frozen.
export function summaryFromSnapshot(raw: unknown): GrandSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Partial<GrandSummary>;
  return Array.isArray(s.rows) && s.labels ? (s as GrandSummary) : null;
}
