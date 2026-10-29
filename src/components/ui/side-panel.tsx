"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { sidePanelClass, type DrawerSize } from "./drawer";

/**
 * The non-modal side panel (the Work item's panel, 0008 §5.4): no scrim, so the list or board beside it stays usable. Escape closes it only when focus is
 * inside it (and not while a menu or list inside has its own use for Escape); closing returns focus to what opened it. Pair with `DrawerHeader`.
 */
export function SidePanel({ label, onClose, size, className, children }: { label: string; onClose: () => void; size?: DrawerSize; className?: string; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = root.current;
    return () => {
      const here = document.activeElement;
      // Only take focus back when it would otherwise be lost: the user has not moved on to another control.
      if (opener?.isConnected && (!here || here === document.body || panel?.contains(here))) opener.focus();
    };
  }, []);
  return (
    <aside
      ref={root}
      role="complementary"
      aria-label={label}
      className={sidePanelClass(size, className)}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if ((e.target as HTMLElement).closest("details[open],[role=listbox],[aria-expanded=true]")) return;
        onClose();
      }}
    >
      {children}
    </aside>
  );
}
