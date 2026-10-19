/**
 * What each readiness-gate item's detail says (FR-CON-008), in one place: the award's Conditions tab and
 * the contract's record show the same gate in the same words (6.12).
 */

import { formatMoney } from "@/lib/money";

import { GATE_LABEL, GATE_STATE_LABEL, INSURANCE_KIND_LABEL } from "./labels";

export { GATE_LABEL, GATE_STATE_LABEL };

/**
 * What an item's state judges, said under it whatever its state (6.12 review S-3): a "Met" that judges less
 * than its label suggests overstates itself. 64-C4-b (6.13 Part A step 0, as ruled): sums insured are now
 * compared, so S-3's "not compared" sentence has left; the note says what governs each comparison.
 */
export const GATE_ITEM_NOTE: Readonly<Partial<Record<keyof typeof GATE_LABEL, string>>> = {
  INSURANCE: "Each policy's sum insured is compared with the award's figure or the Appendix minimum.",
};

const SOURCE_WORDS: Readonly<Record<string, string>> = { AWARD: "the award's figure", APPENDIX: "the tender Appendix's minimum" };
const kindName = (k: string) => (INSURANCE_KIND_LABEL as Readonly<Record<string, string>>)[k] ?? "A required policy";

/// 64-C4-b: one sum finding in words ("SHORT:<kind>:<governing>:<source>:<insured>" or "SUM_NOT_STATED:<kind>").
export function sumDetailText(d: string): string | null {
  const [tag, kind, a, src, b] = d.split(":");
  if (tag === "SHORT" && a && b && /^-?\d+$/.test(a) && /^-?\d+$/.test(b)) return `${kindName(kind)}: the verified policy insures ${formatMoney(BigInt(b))}, below ${formatMoney(BigInt(a))} (${SOURCE_WORDS[src] ?? "the governing sum"}).`;
  if (tag === "SUM_NOT_STATED") return `${kindName(kind)}: neither the award nor a tender Appendix states a sum insured${kind === "CAR" || kind === "EAR" ? " for the works it insures" : ""}, so it is not compared.`;
  return null;
}

export function gateDetailText(item: { key: string; detail: readonly string[] }, bondNotRequiredReason: string): string {
  const DETAIL: Record<string, string> = {
    BOND_NOT_DECIDED: "Whether a bond is required is not decided.",
    REASON_NOT_RECORDED: "No bond is required, but the reason is not recorded.",
    NOT_REQUIRED: `No bond required: ${bondNotRequiredReason}`,
    BASIS_NOT_SET: "The bond's basis is not set.",
    NOT_VERIFIED: "No verified performance bond covers the required amount.",
    REQUIREMENTS_NOT_SET: "No insurance requirements configured.",
    WC_NOT_CHECKED: "Workmen's compensation: met once the wages check is recorded under Before signing › Securities.",
    WC_RECORDED_NOT_JUDGED: "Uncovered-wages check is recorded on the contract. Not judged.",
    WC_BASIS_NOT_SET: "How workmen's compensation is calculated is not set on the award.",
  };
  if (item.key !== "INSURANCE") return item.detail.map((d) => DETAIL[d] ?? "").join(" ");
  // Insurance detail: what is not lodged at all, and what is lodged but not verified.
  const of = (p: string) => item.detail.filter((d) => d.startsWith(p)).map((d) => d.slice(p.length));
  const notLodged = of("NOT_LODGED:");
  const lodged = of("LODGED:");
  const sums = item.detail.filter((d) => d.startsWith("SHORT:") || d.startsWith("SUM_NOT_STATED:")).map(sumDetailText);
  return [notLodged.length ? `Not lodged: ${notLodged.join(", ")}.` : null, lodged.length ? `Lodged, not verified: ${lodged.join(", ")}.` : null, ...sums, ...item.detail.filter((d) => !d.includes(":")).map((d) => DETAIL[d] ?? null)].filter(Boolean).join(" ");
}
