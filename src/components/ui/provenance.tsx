import { COMPONENT_WORDS as C } from "@/lib/i18n/catalogues/components";
import type { Language } from "@/lib/i18n/language";
import { say } from "@/lib/i18n/say";
import type { Words } from "@/lib/contract/labels";

import type { Tone } from "./badge";
import { InfoChip } from "./info-chip";

/**
 * Where a configured fact came from. One chip and one vocabulary everywhere: a
 * written rule, an observed habit and an assumption must never render alike, and a
 * fact nobody has sourced is "Not set" — not any of the three. The detail sits in a
 * popover beside the chip (note 0005 §3.3), never in a native title a keyboard cannot reach.
 *
 * `lang` is optional and English by default; a converted screen passes the language it reads in (NFR-LNG-001, ADR 0040).
 */
const PROVENANCE: Record<string, { label: Words; tone: Tone; hint: Words }> = {
  STATED: { label: C.provStated, tone: "ok", hint: C.provStatedHint },
  OBSERVED: { label: C.provObserved, tone: "info", hint: C.provObservedHint },
  ASSUMED: { label: C.provAssumed, tone: "warn", hint: C.provAssumedHint },
};

/// The chip's word for a provenance, for text that cannot hold the chip (a list's search and CSV export).
export const provenanceLabel = (value: string | null | undefined, lang: Language = "en"): string => say((value ? PROVENANCE[value]?.label : undefined) ?? C.provNotSet, lang);

export function ProvenanceBadge({ value, lang = "en" }: { value: string | null | undefined; lang?: Language }) {
  const p = value ? PROVENANCE[value] : undefined;
  if (!p) {
    return (
      <InfoChip outline detail={say(C.provNotSetHint, lang)}>
        {say(C.provNotSet, lang)}
      </InfoChip>
    );
  }
  return (
    <InfoChip tone={p.tone} detail={say(p.hint, lang)}>
      {say(p.label, lang)}
    </InfoChip>
  );
}
