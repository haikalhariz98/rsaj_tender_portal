/**
 * Matters the matrix has no limit for: the rules marked as gaps. Said by name, so a
 * reader is not left to hunt through the rules for which one the warning means.
 *
 * Pure.
 */

import { matterLabel } from "@/lib/labels";

import type { Rule } from "./types";

export interface GapMatter {
  ruleKey: string;
  /// "Payment · Small instruments", never a code.
  label: string;
}

export function gapMatters(rules: readonly Pick<Rule, "ruleKey" | "domain" | "labelEn" | "isGap">[]): GapMatter[] {
  return rules
    .filter((r) => r.isGap)
    .map((r) => {
      const matter = matterLabel(r.domain);
      // "Variation order" under "Variation" says the same twice.
      const own = r.labelEn && !r.labelEn.toLowerCase().includes(matter.toLowerCase()) ? ` · ${r.labelEn}` : "";
      return { ruleKey: r.ruleKey, label: r.labelEn && !own ? r.labelEn : `${matter}${own}` };
    });
}

export function gapTitle(gaps: readonly GapMatter[]): string {
  return `${gaps.length} ${gaps.length === 1 ? "matter has" : "matters have"} no limit set for it`;
}
