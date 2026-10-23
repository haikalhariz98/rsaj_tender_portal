import { COMPONENT_WORDS as C } from "@/lib/i18n/catalogues/components";
import type { Language } from "@/lib/i18n/language";
import { say } from "@/lib/i18n/say";
import type { Words } from "@/lib/contract/labels";

/**
 * Where a configured fact came from. Working screens no longer show it (simplification plan 5.1, SP-18): the source is recorded
 * with the fact and read in its History. Only a fact nobody has sourced still shows, as plain "Not set" - a gap is never hidden.
 * A decision point says its source through `RuleInfo` instead.
 *
 * `lang` is optional and English by default; a converted screen passes the language it reads in (NFR-LNG-001, ADR 0040).
 */
const PROVENANCE: Record<string, Words> = { STATED: C.provStated, OBSERVED: C.provObserved, ASSUMED: C.provAssumed };

/// The word for a provenance, for text that cannot hold the chip (a list's search and CSV export).
export const provenanceLabel = (value: string | null | undefined, lang: Language = "en"): string => say((value ? PROVENANCE[value] : undefined) ?? C.provNotSet, lang);

export function ProvenanceBadge({ value, lang = "en" }: { value: string | null | undefined; lang?: Language }) {
  if (value && PROVENANCE[value]) return null;
  return <span className="text-[13px] text-ink-3">{say(C.provNotSet, lang)}</span>;
}
