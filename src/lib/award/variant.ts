/**
 * Which appointment-letter variant (FR-AWD-007): the one for the exercise's contract
 * type and its 6.3 terms band (OQ-05, D12) — never the approval band. A variant naming a
 * type and a band beats one that names either alone, which beats one that names
 * neither; two equally specific is ambiguous and refused, never picked by row order.
 * An exercise whose terms band is not set cannot be given a variant at all.
 */

export interface Variant {
  id: string;
  code: string;
  nameEn: string;
  templateId: string;
  /// Empty: any type.
  contractTypeCodes: string[];
  /// Null: any band.
  termsBandKey: string | null;
  nonCommencement: "CANCEL_AND_BLACKLIST" | "WARNING_LETTER" | null;
  retiredOn: Date | null;
}

export type VariantResult = { state: "SELECTED"; variant: Variant } | { state: "NONE" } | { state: "AMBIGUOUS"; codes: string[] } | { state: "TERMS_NOT_SET" };

export function selectVariant(variants: readonly Variant[], contractTypeCode: string | null, terms: { state: string | null; bandKey: string | null }, on?: Date): VariantResult {
  if (terms.state !== "APPLIES" || !terms.bandKey) return { state: "TERMS_NOT_SET" };
  const live = variants.filter((v) => v.retiredOn == null || (on != null && v.retiredOn > on));
  const fits = live.filter(
    (v) => (v.contractTypeCodes.length === 0 || (contractTypeCode != null && v.contractTypeCodes.includes(contractTypeCode))) && (v.termsBandKey == null || v.termsBandKey === terms.bandKey),
  );
  if (fits.length === 0) return { state: "NONE" };
  const score = (v: Variant) => (v.contractTypeCodes.length > 0 ? 2 : 0) + (v.termsBandKey != null ? 1 : 0);
  const best = Math.max(...fits.map(score));
  const top = fits.filter((v) => score(v) === best);
  return top.length === 1 ? { state: "SELECTED", variant: top[0] } : { state: "AMBIGUOUS", codes: top.map((v) => v.code) };
}

/// Which of the letter's terms the band asks for. Null in the band is not decided.
export function termsAsked(band: { retentionApplies: boolean | null; defectsLiabilityApplies: boolean | null } | null) {
  return { retention: band?.retentionApplies ?? null, dlp: band?.defectsLiabilityApplies ?? null };
}
