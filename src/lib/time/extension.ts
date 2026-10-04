/**
 * The extension an EOT certificate grants (6.13 Part B run 1b: FR-EOT-003, 008, 009; OD-B6 A as ruled, BD-613-74;
 * ADR 0030). Pure.
 *
 * - OD-B6 A: the officer states the days granted. The reasons' computation is a check, shown as assumed: consecutive
 *   reasons are added, each concurrent group counts at its longest. A difference warns (GRANT_DIFFERS), never refuses.
 * - The new date for completion is the scope's previous date plus the granted days (calendar days). A whole-works
 *   extension moves the whole works' date (and every section with it); a section's moves only that section.
 * - The certificate is raised only for an entitled claim whose matter is approved, one live certificate a claim
 *   (BD-613-135), with the un-extended period stated where best endeavours were met in part (FR-EOT-003).
 * - Its issue refuses EOT_MOVED where the scope's date moved since it was raised (two certificates on one scope).
 * - FR-EOT-009: the verified policies whose cover ends before the new date are offered for the S.O.'s self-help.
 */

import { dayPlus } from "@/lib/dates";
import type { Sen } from "@/lib/money";

import type { BestEndeavours, Concurrency, Day, Finding, Scope } from "./types";

export interface ReasonRow {
  extensionDays: number;
  concurrency: Concurrency;
  group: string | null;
}

/// Consecutive reasons added; each concurrent group at its longest.
export function computedExtension(rows: readonly ReasonRow[]): number {
  const groups = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (r.concurrency === "CONSECUTIVE") total += r.extensionDays;
    else groups.set(r.group ?? "", Math.max(groups.get(r.group ?? "") ?? 0, r.extensionDays));
  }
  for (const g of groups.values()) total += g;
  return total;
}

export function grantedExtension(rows: readonly ReasonRow[], stated: number): { computed: number; granted: number; warnings: Finding[] } {
  const computed = computedExtension(rows);
  return { computed, granted: stated, warnings: computed === stated ? [] : [{ code: "GRANT_DIFFERS", level: "warn", data: { granted: stated, computed } }] };
}

/// The previous date plus the days granted, in calendar days.
export const newCompletion = (previous: Day, granted: number): Day => dayPlus(previous, granted);

/// The dates an extension reads and writes: the whole works' date for completion (extensions included) and each
/// section's own extension days on top of it.
export interface ExtensionDates {
  dateForCompletion: Day | null;
  extensionDays?: number;
  sections: readonly { ref: string; extensionDays: number }[];
}

/// The scope's date for completion: the whole works', or the section's (the whole works' plus its own extensions).
export function scopeDate(v: ExtensionDates, scope: Scope, sectionRef: string | null): Day | null {
  if (!v.dateForCompletion) return null;
  if (scope === "WHOLE") return v.dateForCompletion;
  const s = v.sections.find((x) => x.ref === sectionRef);
  return s ? dayPlus(v.dateForCompletion, s.extensionDays) : null;
}

/// The dates after an extension of `days` on the scope: the whole works' (every section moves with it), or the section's alone.
export function extendedDates<T extends ExtensionDates>(v: T, scope: Scope, sectionRef: string | null, days: number): T {
  if (scope === "WHOLE") return { ...v, dateForCompletion: v.dateForCompletion ? dayPlus(v.dateForCompletion, days) : null, extensionDays: (v.extensionDays ?? 0) + days };
  return { ...v, sections: v.sections.map((s) => (s.ref === sectionRef ? { ...s, extensionDays: s.extensionDays + days } : s)) };
}

export interface RaiseInput {
  entitled: boolean;
  matterApproved: boolean;
  /// A live (not void) EOT certificate of this claim, if any.
  live: { number: string | null } | null;
  grantedDays: number | null;
  bestEndeavours: BestEndeavours | null;
  unextendedNote: string;
  previousCompletion: Day | null;
}

export function raiseFaults(i: RaiseInput): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!i.entitled) f("NOT_DETERMINED");
  else if (!i.matterApproved) f("MATTER_NOT_APPROVED");
  if (i.live) f("EOT_CERTIFICATE_LIVE", { number: i.live.number });
  if (i.grantedDays == null || !Number.isInteger(i.grantedDays) || i.grantedDays <= 0) f("GRANTED_DAYS_REQUIRED");
  if (i.bestEndeavours === "PARTIAL" && !i.unextendedNote.trim()) f("UNEXTENDED_NOTE_REQUIRED");
  if (!i.previousCompletion) f("NO_DATE_FOR_COMPLETION");
  return out;
}

/// At issue: the scope's date on the latest version must still be the certificate's previous date.
export function issueMovedFaults(previous: Day, now: Day | null): Finding[] {
  return now === previous ? [] : [{ code: "EOT_MOVED", level: "block", data: { day: now } }];
}

export interface PolicyRow {
  id: string;
  kind: string;
  policyNo: string;
  periodEnd: Day;
  status: string;
  sumInsured: Sen;
}

/// FR-EOT-009: verified policies whose cover ends before the new date for completion (offered for self-help).
export function lapsedPolicies<P extends PolicyRow>(policies: readonly P[], newDate: Day): P[] {
  return policies.filter((p) => p.status === "VERIFIED" && p.periodEnd < newDate);
}
