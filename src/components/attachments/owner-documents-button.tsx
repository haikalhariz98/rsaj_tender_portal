"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { loadOwnerPanel } from "@/app/documents/actions";
import { FileIcon } from "@/components/icons";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/feedback";
import type { OwnerRef } from "@/lib/documents/repo";
import type { PanelOptions, PanelView } from "@/lib/documents/views";

import { AttachmentPanel } from "./attachment-panel";

/**
 * A record's documents in a drawer, for a screen that lists records but has no tab of
 * its own for them (a delegation in Users & roles). Loaded when opened. The panel inside
 * is the shared one: the same decisions, the same reasons.
 */
export function OwnerDocumentsButton({ owner, label, options, iconOnly = false, triggerLabel, title = "Signed recommendation", subtitle = "The absent holder's signed recommendation to re-delegate." }: {
  /// The button's word where it is not "Documents" (a tender document line's "Upload" and "Replace", SR-11). The drawer it opens is the same.
  triggerLabel?: string;
  /// What the panel is headed and described as; the defaults are the delegation's.
  title?: string;
  subtitle?: string; owner: OwnerRef; label: string; options?: PanelOptions; /// For a table row: the icon alone, named by `Documents of …`, so the row needs no room for the word.
  iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<PanelView | null | undefined>(undefined);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        ref={opener}
        className={iconOnly ? iconButtonClass("sm") : buttonClass("ghost", "sm")}
        aria-label={triggerLabel ? `${triggerLabel} ${label}` : `Documents of ${label}`}
        title={iconOnly ? `Documents of ${label}` : undefined}
        onClick={async () => {
          setOpen(true);
          setView(undefined);
          setView(await loadOwnerPanel(owner, options));
        }}
      >
        {!triggerLabel && <FileIcon size={15} />}
        {!iconOnly && (triggerLabel ?? "Documents")}
      </button>
      {open &&
        createPortal(
          <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && close()} onSubmit={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <aside role="dialog" aria-modal="true" aria-label={`Documents of ${label}`} className={drawerPanelClass("xl")}>
              <DrawerHeader icon={<FileIcon size={17} />} title="Documents" subtitle={label} onClose={close} />
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-sunken/50 px-6 py-5">
                {view === undefined ? (
                  <p className="text-[13px] text-ink-3">Loading…</p>
                ) : view === null ? (
                  <EmptyState size="sm" title="Its documents cannot be shown">
                    The record no longer exists. Reload the page.
                  </EmptyState>
                ) : (
                  <AttachmentPanel {...view} onChanged={async () => setView(await loadOwnerPanel(owner, options))} title={title} subtitle={subtitle} />
                )}
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
