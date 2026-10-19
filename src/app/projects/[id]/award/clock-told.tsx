import { Badge } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import type { ClockChips } from "@/lib/inbox/clock-plan";

/// Who is told about a late clock, as a fact and chips (note 0005 R16): the callout says what happened, these say who hears of it.
export function ClockTold({ told, children }: { told: ClockChips | undefined; children?: React.ReactNode }) {
  if (!told) return <>{children}</>;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      {told.fact && <span>{told.fact}</span>}
      {told.chips.map((c) => (c.detail ? <InfoChip key={c.key} tone={c.tone} detail={c.detail}>{c.label}</InfoChip> : <Badge key={c.key} tone={c.tone}>{c.label}</Badge>))}
      {children}
    </span>
  );
}
