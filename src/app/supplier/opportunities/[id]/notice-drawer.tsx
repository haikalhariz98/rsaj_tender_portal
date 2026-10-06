"use client";

import { useEffect, useId, useState } from "react";

import { FileIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";

/**
 * The published notice, read in a drawer: the advertisement as it was frozen when it was published.
 * The text is passed in whole by the server; nothing is fetched when it opens.
 */
export function NoticeDrawer({ title, subtitle, buttonLabel, text, empty }: { title: string; subtitle: string; buttonLabel: string; text: string | null; empty: string }) {
  const [open, setOpen] = useState(false);
  const heading = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button variant="primary" icon={<FileIcon size={16} />} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {buttonLabel}
      </Button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-labelledby={heading} className={drawerPanelClass("lg")}>
            <span id={heading} className="sr-only">
              {title}
            </span>
            <DrawerHeader icon={<FileIcon size={17} />} title={title} subtitle={subtitle} onClose={() => setOpen(false)} />
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {text ? <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{text}</p> : <p className="text-[13.5px] text-ink-3">{empty}</p>}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
