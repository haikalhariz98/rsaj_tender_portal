/**
 * How the contract's History reads a stored value (AGENTS.md rule 5: codes never reach a screen; 6.12
 * review: and real values are never hidden as if they were codes).
 *
 * A value that is one of the stored codes the contract's trail can carry reads in words. Anything else is
 * what someone typed or what the act wrote in words, and is shown as it is: an LHDN stamping reference, an
 * item "PS", a recipient "JKR" are values, not codes. Only a value shaped like a code (capitals joined by
 * an underscore) that has no words is withheld as "—": it is a code, and a code is never shown.
 */

import { INSURANCE_KIND_LABEL, REGISTER_STATUS_LABEL, SECURITY_KIND_LABEL, WC_BASIS_LABEL } from "@/lib/award/labels";

import { CHECK_WORDS, COMPARISON_WORDS, CUSTODY_KIND_WORDS, DECISION_WORDS, DIRECTION_WORDS, OUTCOME_WORDS, PARTY_WORDS, PHASE_WORDS, PROVENANCE_WORDS, REASON_WORDS, SOURCE_WORDS, type Words } from "./labels";

const en = (m: Readonly<Record<string, Words>>) => Object.entries(m).map(([k, v]) => [k, v.en] as const);

/// Every stored code the contract's trail may carry, with its words.
export const HISTORY_CODE_WORDS: Readonly<Record<string, string>> = Object.fromEntries([
  ...[OUTCOME_WORDS, DECISION_WORDS, PARTY_WORDS, CHECK_WORDS, REASON_WORDS, DIRECTION_WORDS, CUSTODY_KIND_WORDS, PROVENANCE_WORDS, COMPARISON_WORDS, SOURCE_WORDS].flatMap(en),
  ...Object.entries({ ...INSURANCE_KIND_LABEL, ...SECURITY_KIND_LABEL, ...REGISTER_STATUS_LABEL, ...WC_BASIS_LABEL }),
  ...Object.entries({
    READY: "As tendered",
    CANCELLED_BY_ALTERNATIVE: "Cancelled by the accepted alternative",
    BY_HAND: "By hand",
    REGISTERED_POST: "Registered post",
    COLLECTION: "Collected",
    // Where the contract number came from (6.11's issue act writes it on the contract's first row).
    SERIES: "The contract type's series",
    INDENT_NUMBER: "The indent's own number",
    AMOUNT_PER_DAY: "An amount a day",
    PERCENT_OF_SUM_PER_DAY: "A percentage of the contract sum a day",
  }),
]);

const STATUS_WORDS: Readonly<Record<string, string>> = Object.fromEntries(en(PHASE_WORDS));

/**
 * The fields the contract's trail stores a code in (6.12 re-review): a value in one of these reads in words,
 * and a code with no words is withheld as "—", never shown raw. Every other field holds what someone typed
 * or what an act wrote in words, and is shown as it is (an LHDN reference, an item "PS"). `reason` is a code
 * only on a baseline version's row; elsewhere it is the officer's text.
 */
export const CODE_FIELDS: ReadonlySet<string> = new Set(["status", "state", "outcome", "decision", "party", "comparison", "kind", "direction", "method", "numberSource", "provenance", "ladKind", "now", "wcBasis", "substitutesFor"]);
const ENTITY_CODE_FIELDS: Readonly<Record<string, readonly string[]>> = { ContractBaseline: ["reason"] };

export const isCodeField = (field: string, entity?: string) => CODE_FIELDS.has(field) || (entity ? (ENTITY_CODE_FIELDS[entity] ?? []).includes(field) : false);

export function historyValue(field: string, value: string | null, formatDay: (d: string) => string, entity?: string): string {
  if (value == null || value === "") return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDay(value);
  if (value === "true" || value === "yes") return "Yes";
  if (value === "false" || value === "no") return "No";
  if (!isCodeField(field, entity)) return value;
  if (field === "status" && STATUS_WORDS[value]) return STATUS_WORDS[value];
  return HISTORY_CODE_WORDS[value] ?? STATUS_WORDS[value] ?? "—";
}
