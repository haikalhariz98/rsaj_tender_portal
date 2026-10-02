/**
 * What a keyed or corrected baseline group was and became, for the trail (6.12 review R-2, R-3; the audit
 * before/after rule): the group's values in words before and after, with where each came from, so the
 * History and the audit export show the change itself and not only that something was entered.
 *
 * And which groups a correction may change (R-3, BD-612-23): only one nothing else states. A value the
 * Letter of Acceptance, the frozen tender Appendix or the bill states, or one a recorded rule derives, is
 * kept as stated (ADR 0021: the award over the Appendix over the bill); a correction keyed over it would
 * put an officer's figure above the award's.
 */

import { formatMoney, type Sen } from "@/lib/money";
import { formatPct } from "@/lib/tender-docs/percent";

import { enterFault, sourceOf, type BaselineInputs, type BaselineValues, type EnteredGroup } from "./baseline";
import { SOURCE_WORDS } from "./labels";
import type { BaselineSource, Finding } from "./types";

const rm = (s: Sen | null) => (s == null ? null : formatMoney(s));
const NOT_SET = "not set";

/// One group's values, in words; "not set" where nothing states them (never 0).
export function groupText(v: BaselineValues, group: EnteredGroup): string {
  switch (group) {
    case "lad":
      if (v.ladKind == null) return NOT_SET;
      return v.ladKind === "AMOUNT_PER_DAY" ? `${rm(v.ladAmount) ?? NOT_SET} ${v.ladUnit || "(no unit)"}` : `${v.ladPct ? formatPct(v.ladPct) : NOT_SET} of the contract sum a day`;
    case "dlp":
      return v.dlpApplies == null ? NOT_SET : v.dlpApplies ? (v.dlpMonths != null ? `${v.dlpMonths} months` : "applies, months not set") : "none";
    case "retention":
      return v.retentionApplies == null ? NOT_SET : v.retentionApplies ? `${v.retentionPercent ? formatPct(v.retentionPercent) : NOT_SET}, capped at ${v.retentionCapPercent ? formatPct(v.retentionCapPercent) : NOT_SET}` : "does not apply";
    case "sums":
      return v.pcSums == null || v.provisionalSums == null ? NOT_SET : `prime cost ${rm(v.pcSums)}, provisional ${rm(v.provisionalSums)}`;
    case "firstInterim":
      return rm(v.firstInterimMinimum) ?? NOT_SET;
    case "subsequentInterim":
      return rm(v.subsequentInterimMinimum) ?? NOT_SET;
    case "honourDays":
      return v.honourCertificateDays == null ? NOT_SET : `${v.honourCertificateDays} days`;
    case "sectional":
      if (v.sectionalCompletion == null) return NOT_SET;
      if (!v.sectionalCompletion) return "does not apply";
      return v.sections.length ? v.sections.map((s) => `${s.ref}. ${s.description}: ${s.ladDaily != null ? `${rm(s.ladDaily)} a day` : s.ladAmount != null ? `${rm(s.ladAmount)} a day` : "damages not stated"}`).join("; ") : "applies, no section stated";
    case "unfixedMaterials":
      return v.unfixedMaterialsPct ? formatPct(v.unfixedMaterialsPct) : NOT_SET;
    case "onCost":
      return v.onCostPct ? formatPct(v.onCostPct) : NOT_SET;
    case "designWork":
      return rm(v.designWorkValue) ?? NOT_SET;
  }
}

/// Where a group's value came from, as stored on the baseline.
export function groupSource(v: BaselineValues, group: EnteredGroup): BaselineSource | null {
  switch (group) {
    case "lad":
      return v.ladSource;
    case "dlp":
      return v.dlpSource;
    case "retention":
      return v.retentionSource;
    case "sums":
      return v.sumsSource;
    case "firstInterim":
      return v.firstInterimSource;
    case "subsequentInterim":
      return v.subsequentInterimSource;
    case "honourDays":
      return v.honourSource;
    case "sectional":
      return v.sectionalSource;
    case "unfixedMaterials":
      return v.unfixedMaterialsPct ? "ENTERED" : null;
    case "onCost":
      return v.onCostPct ? "ENTERED" : null;
    case "designWork":
      return v.designWorkValue != null ? "ENTERED" : null;
  }
}

const sourceText = (s: BaselineSource | null) => (s ? SOURCE_WORDS[s].en : "Not set");

/**
 * The trail's before and after for one group: its value, where it came from and the provenance the officer
 * chose (the earlier one where it was keyed before). Keys are the group's own key, so the History names the
 * field ("Liquidated damages"), and fixed words for the rest.
 */
export function groupChange(group: EnteredGroup, before: BaselineValues, after: BaselineValues, provenance: { before: string | null; after: string }) {
  return {
    before: { [group]: groupText(before, group), source: sourceText(groupSource(before, group)), provenance: provenance.before },
    after: { [group]: groupText(after, group), source: sourceText(groupSource(after, group)), provenance: provenance.after },
  };
}

export type CorrectableFault = "STATED_NOT_CORRECTED";

/**
 * Whether a versioned baseline's group may be corrected by an officer (R-3, BD-612-23): refused, naming the
 * record that states it, where the frozen inputs state or derive it. A group entered at baseline because
 * nothing stated it may be corrected, with its reason and provenance.
 */
export function correctableFaults(group: EnteredGroup, inputs: BaselineInputs): Finding<CorrectableFault>[] {
  const stated = enterFault(group, inputs);
  if (!stated) return [];
  return [{ code: "STATED_NOT_CORRECTED", level: "block", data: { group, source: stated === "DERIVED_BY_POLICY" ? "DERIVED" : sourceOf(group, inputs) } }];
}
