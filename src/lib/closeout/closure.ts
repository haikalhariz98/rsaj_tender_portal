/**
 * The close (Phase 2 close-out stage C; plan closeout-plan.md CO-10, §4.7; FR-FIN-014; rulings 4, 16, 17, 19). Pure.
 *
 * An audited act with no route of its own: the approvals behind it are the certificates' routes. It is allowed when nothing below refuses:
 * the final certificate issued and paid, no certificate or route still open, no defect open, no retention held, every security returned but
 * the design guarantee bond (which survives the close) and the rejected ones, and the contractor performance report verified (checked again
 * here after the final's send, ruling 17: close refuses, it does not warn). A supply contract does not close in Phase 2 (ruling 19).
 */

import type { Sen } from "@/lib/money";
import { addMonths } from "@/lib/securities/period";

import type { Finding } from "./types";

export interface ClosureFacts {
  supply: boolean;
  /// The FINAL certificate is issued, and Finance's payment of it is recorded.
  finalIssued: boolean;
  finalPaid: boolean;
  /// Certificates in DRAFT, IN_ROUTING or SIGNING, and matters whose route is pending or not yet sent, named.
  certificatesInProgress: readonly string[];
  mattersOpen: readonly string[];
  defectsOpen: number;
  /// Retention still held: what the latest interim holds less what was released and what the final paid (zero: none).
  retentionHeld: Sen;
  /// Securities held and not returned, named, other than the design guarantee bond (which survives) and the rejected ones.
  securitiesHeld: readonly string[];
  /// Stage D's `performanceNotFiled` (null: filed).
  performance: Finding | null;
}

export function closureFaults(f: ClosureFacts): Finding[] {
  if (f.supply) return [{ code: "SUPPLY_NOT_BUILT", level: "block" }];
  const out: Finding[] = [];
  const b = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!f.finalIssued || !f.finalPaid) b("FINAL_NOT_PAID", { issued: f.finalIssued ? "yes" : "no" });
  if (f.certificatesInProgress.length) b("CERTIFICATES_IN_PROGRESS", { items: f.certificatesInProgress.join("; ") });
  if (f.mattersOpen.length) b("MATTERS_OPEN", { items: f.mattersOpen.join("; ") });
  if (f.defectsOpen > 0) b("DEFECTS_OPEN", { n: f.defectsOpen });
  if (f.retentionHeld > 0n) b("RETENTION_HELD", { amount: f.retentionHeld.toString() });
  if (f.securitiesHeld.length) b("SECURITY_NOT_RETURNED", { items: f.securitiesHeld.join("; ") });
  if (f.performance) out.push(f.performance);
  return out;
}

/// What survives the close (FR-CMP-017): each design guarantee bond held, with the day it may be released (practical completion plus the
/// configured years, SK009 §7.8), or null where the years are not set ("Not set", never assumed).
export interface Surviving {
  label: string;
  releaseOn: string | null;
}

export const survivingOf = (bonds: readonly string[], completionDate: string | null, years: number | null): Surviving[] =>
  bonds.map((label) => ({ label, releaseOn: completionDate && years != null ? addMonths(completionDate, years * 12) : null }));
