import { COMPONENT_WORDS as C } from "@/lib/i18n/catalogues/components";
import type { Language } from "@/lib/i18n/language";
import { say } from "@/lib/i18n/say";
import type { Words } from "@/lib/contract/labels";

import { Badge, type Tone } from "./badge";

/**
 * Where a configured fact came from. One badge and one vocabulary everywhere: a
 * written rule, an observed habit and an assumption must never render alike, and a
 * fact nobody has sourced is "Not set" — not any of the three.
 *
 * `lang` is optional and English by default; a converted screen passes the language it reads in (NFR-LNG-001, ADR 0040).
 */
const PROVENANCE: Record<string, { label: Words; tone: Tone; hint: Words }> = {
  STATED: { label: C.provStated, tone: "ok", hint: C.provStatedHint },
  OBSERVED: { label: C.provObserved, tone: "info", hint: C.provObservedHint },
  ASSUMED: { label: C.provAssumed, tone: "warn", hint: C.provAssumedHint },
};

/// The badge's word for a provenance, for text that cannot hold the badge (a list's search and CSV export).
export const provenanceLabel = (value: string | null | undefined, lang: Language = "en"): string => say((value ? PROVENANCE[value]?.label : undefined) ?? C.provNotSet, lang);

export function ProvenanceBadge({ value, lang = "en" }: { value: string | null | undefined; lang?: Language }) {
  const p = value ? PROVENANCE[value] : undefined;
  if (!p) {
    return (
      <Badge outline title={say(C.provNotSetHint, lang)}>
        {say(C.provNotSet, lang)}
      </Badge>
    );
  }
  return (
    <Badge tone={p.tone} title={say(p.hint, lang)}>
      {say(p.label, lang)}
    </Badge>
  );
}
