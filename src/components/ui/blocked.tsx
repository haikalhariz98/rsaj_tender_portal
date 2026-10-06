"use client";

import { useActGate } from "@/components/act-gate";

import { Button } from "./button";

/**
 * A control the rules say cannot be used yet, with the reason beside it (on a phone, under it). The one
 * shared copy (6.15a fix S-4): a screen's own copy without the width limits pushed a page sideways at 390
 * inside a card header's actions.
 */
export function Blocked({ label, reason: own, primary, destructive, noteId, ariaLabel }: { label: string; reason: string; primary?: boolean; destructive?: boolean; noteId?: string; /** A name that tells this control apart from others with the same label. */ ariaLabel?: string }) {
  // Review S1: inside a contract section whose act family the state refuses, the table's words come first (ActGate).
  const reason = useActGate() ?? own;
  const variant = destructive ? "destructive" : primary ? "primary" : "secondary";
  // In a page header the reason is stated once, under the action row (PageHeader's
  // `actionsNote`), and the button points at it rather than carrying its own copy.
  if (noteId) {
    return (
      <Button size="sm" variant={variant} disabled title={reason} aria-describedby={noteId} aria-label={ariaLabel}>
        {label}
      </Button>
    );
  }
  return (
    // On a phone the reason goes under the button: beside it, it is squeezed into a few words a line.
    <span className="inline-flex max-w-full flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <Button size="sm" variant={variant} disabled title={reason} aria-label={ariaLabel}>
        {label}
      </Button>
      <span className="max-w-full text-[12px] leading-tight text-ink-3 sm:max-w-64">{reason}</span>
    </span>
  );
}

