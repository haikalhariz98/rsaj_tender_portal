import { Callout } from "@/components/ui/feedback";
import type { HiddenAct } from "@/lib/supervision/authority";
import { hiddenNote } from "@/lib/supervision/labels";

/**
 * What a representative is told about the acts left off their screens (FR-SUP-004, Phase 3d). It stands at the top of every screen of the contract that hides something (Site, Payments,
 * Variations and a variation's own page), so that no reader has to guess whether an act is not offered to them or is not possible. Nothing where nothing is hidden.
 */
export function HiddenNote({ hidden }: { hidden: readonly HiddenAct[] }) {
  const note = hiddenNote(hidden);
  if (!note) return null;
  return (
    <Callout tone="info" title={note.title.en}>
      {note.body.en}
    </Callout>
  );
}

/// The body of a screen with the note above it where something is hidden.
export function WithHiddenNote({ hidden, children }: { hidden: readonly HiddenAct[]; children: React.ReactNode }) {
  if (hidden.length === 0) return <>{children}</>;
  return (
    <div className="flex flex-col gap-6">
      <HiddenNote hidden={hidden} />
      {children}
    </div>
  );
}
