"use client";

import type { ReactNode } from "react";

import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CONFIRM_SCRIM, confirmPanelClass, DrawerHeader } from "@/components/ui/drawer";
import { Callout } from "@/components/ui/feedback";

/**
 * The dialog that asks for something and then shows a one-time code, once (ADR 0034 D6). One component for every place that can make a code, so none of them
 * says "shown once" differently: the code is returned to the one form that asked and kept nowhere else (not in the address, not in the page behind, not in the
 * trail: only its hash is stored). Closing the dialog is the end of it. To hand it over, read it out or write it down, then close.
 *
 * Until there is a code, `children` is shown: the form that asks. The dialog does not close by a click beside it once the code is on screen.
 */
export function CodeDialog({
  label,
  title,
  subtitle,
  shown,
  onClose,
  children,
}: {
  /// What a screen reader calls the dialog.
  label: string;
  title: string;
  subtitle: string;
  shown: { code: string; validUntil: string; notice?: string | null } | null;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={CONFIRM_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && !shown && onClose()}>
      <aside className={confirmPanelClass()} role="dialog" aria-modal="true" aria-label={label}>
        <DrawerHeader title={title} subtitle={subtitle} onClose={onClose} />
        {shown ? (
          <div className="flex flex-col gap-4 px-6 py-5">
            <Callout tone="ok" title="Shown once">
              Read it out or write it down now. It cannot be shown again, and it is not kept anywhere you can read it back. Valid until {shown.validUntil}; it works once.
            </Callout>
            <p className="rounded-xl border border-line bg-sunken px-4 py-3 text-center font-mono text-[20px] font-bold tracking-wider break-all text-ink select-all" aria-label="The code">
              {shown.code}
            </p>
            {shown.notice && <Callout tone="warn">{shown.notice}</Callout>}
            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={onClose}>
                <XIcon size={15} /> I have it, close
              </Button>
            </div>
          </div>
        ) : (
          children
        )}
      </aside>
    </div>
  );
}
