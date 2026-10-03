import { PROVENANCE_HINT, PROVENANCE_NOT_SET_HINT } from "@/lib/labels";

import { Badge, type Tone } from "./badge";

/**
 * Where a configured fact came from. One badge and one vocabulary everywhere: a
 * written rule, an observed habit and an assumption must never render alike, and a
 * fact nobody has sourced is "Not set" — not any of the three.
 */
const PROVENANCE: Record<string, { label: string; tone: Tone; hint: string }> = {
  STATED: { label: "Stated", tone: "ok", hint: PROVENANCE_HINT.STATED },
  OBSERVED: { label: "Observed", tone: "info", hint: PROVENANCE_HINT.OBSERVED },
  ASSUMED: { label: "Assumed", tone: "warn", hint: PROVENANCE_HINT.ASSUMED },
};

/// The badge's word for a provenance, for text that cannot hold the badge (a list's search and CSV export).
export const provenanceLabel = (value: string | null | undefined): string => (value ? PROVENANCE[value]?.label : undefined) ?? "Not set";

export function ProvenanceBadge({ value }: { value: string | null | undefined }) {
  const p = value ? PROVENANCE[value] : undefined;
  if (!p) {
    return (
      <Badge outline title={PROVENANCE_NOT_SET_HINT}>
        Not set
      </Badge>
    );
  }
  return (
    <Badge tone={p.tone} title={p.hint}>
      {p.label}
    </Badge>
  );
}
