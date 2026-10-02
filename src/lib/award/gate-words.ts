/**
 * What each readiness-gate item's detail says (FR-CON-008), in one place: the award's Conditions tab and
 * the contract's record show the same gate in the same words (6.12).
 */

import { GATE_LABEL, GATE_STATE_LABEL } from "./labels";

export { GATE_LABEL, GATE_STATE_LABEL };

/**
 * What an item's state does not yet cover, said under it whatever its state (6.12 review S-3): a "Met" that
 * judges less than its label suggests overstates itself. Until the award's own insurance terms are built
 * (carry 64-C4-b), a policy is judged lodged and verified, never its sum insured against a minimum.
 */
export const GATE_ITEM_NOTE: Readonly<Partial<Record<keyof typeof GATE_LABEL, string>>> = {
  INSURANCE: "Sums insured are not yet compared with the tender Appendix's minimums or the award's own insurance terms: each policy is judged lodged and verified only.",
};

export function gateDetailText(item: { key: string; detail: readonly string[] }, bondNotRequiredReason: string): string {
  const DETAIL: Record<string, string> = {
    BOND_NOT_DECIDED: "Whether a bond is required is not decided.",
    REASON_NOT_RECORDED: "No bond is required, but the reason is not recorded.",
    NOT_REQUIRED: `No bond required: ${bondNotRequiredReason}`,
    BASIS_NOT_SET: "The bond's basis is not set.",
    NOT_VERIFIED: "No verified performance bond covers the required amount.",
    REQUIREMENTS_NOT_SET: "No insurance requirements are configured, so what must be verified is not known.",
    WC_NOT_CHECKED: "Workmen's compensation is calculated on uncovered wages, so its sum cannot be checked: it counts as met only once the check of the declared wages is recorded, on the contract's Securities tab.",
    WC_RECORDED_NOT_JUDGED: "Workmen's compensation on uncovered wages: the check of the declared wages is recorded on the contract. Recorded, not judged: basis not set (D4).",
    WC_BASIS_NOT_SET: "How workmen's compensation is calculated is not set on the award.",
  };
  if (item.key !== "INSURANCE") return item.detail.map((d) => DETAIL[d] ?? "").join(" ");
  // Insurance detail: what is not lodged at all, and what is lodged but not verified.
  const of = (p: string) => item.detail.filter((d) => d.startsWith(p)).map((d) => d.slice(p.length));
  const notLodged = of("NOT_LODGED:");
  const lodged = of("LODGED:");
  return [notLodged.length ? `Not lodged: ${notLodged.join(", ")}.` : null, lodged.length ? `Lodged, not verified: ${lodged.join(", ")}.` : null, ...item.detail.filter((d) => !d.includes(":")).map((d) => DETAIL[d] ?? null)].filter(Boolean).join(" ");
}
