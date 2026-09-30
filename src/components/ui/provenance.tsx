import { Badge, type Tone } from "./badge";

/**
 * Where a configured fact came from. One badge and one vocabulary everywhere: a
 * written rule, an observed habit and an assumption must never render alike, and a
 * fact nobody has sourced is "Not set" — not any of the three.
 */
const PROVENANCE: Record<string, { label: string; tone: Tone; hint: string }> = {
  STATED: { label: "Stated", tone: "ok", hint: "Written in a governing document" },
  OBSERVED: { label: "Observed", tone: "info", hint: "Seen in practice, not written down" },
  ASSUMED: { label: "Assumed", tone: "warn", hint: "A working default, awaiting sign-off" },
};

export function ProvenanceBadge({ value }: { value: string | null | undefined }) {
  const p = value ? PROVENANCE[value] : undefined;
  if (!p) {
    return (
      <Badge outline title="Nobody has said where this came from">
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
