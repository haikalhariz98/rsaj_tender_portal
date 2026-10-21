"use client";

import { useEffect, useState } from "react";

import { DocumentTextIcon } from "@/components/icons";

import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "./drawer";

/**
 * A link that opens a text in the shared drawer, read-only (ADR 0041, REG-4): the terms and conditions and the Personal Data Notice on the registration's last step. What the drawer shows is
 * exactly the text it is given, as the server filled and hashed it, so what is read is what is agreed. Focus, Tab and Escape follow the one dialog rule (`dialog-focus.ts`).
 */
export function TextDrawerLink({ label, title, text }: { label: string; title: string; text: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-brand-600 underline-offset-2 hover:underline focus-visible:underline">
        {label}
      </button>
      {open && (
        <div className={DRAWER_SCRIM} onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <aside role="dialog" aria-modal="true" aria-label={title} className={drawerPanelClass("md")}>
            <DrawerHeader icon={<DocumentTextIcon size={17} />} title={title} onClose={() => setOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{text}</p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
