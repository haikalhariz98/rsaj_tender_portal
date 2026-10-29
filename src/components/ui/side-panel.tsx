"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";

import { ConfirmDialog } from "./confirm-dialog";
import { sidePanelClass, type DrawerSize } from "./drawer";

/// What a panel offers what is inside it: a way to say there are unsaved words (`Composer` does), and a way to close that asks first when there are.
const PanelContext = createContext<{ setDirty: (dirty: boolean) => void; requestClose: () => void } | null>(null);

/// For a child of a `SidePanel`: report unsaved words, so closing the panel asks first. Does nothing outside a panel.
export function useReportDirty(): (dirty: boolean) => void {
  return useContext(PanelContext)?.setDirty ?? noop;
}
const noop = () => {};

/// For a child of a `SidePanel`: the close that asks first when there is an unsaved comment. Wire a `DrawerHeader`'s `onClose` to it; falls back to `fallback` outside a panel.
export function useRequestClose(fallback: () => void): () => void {
  return useContext(PanelContext)?.requestClose ?? fallback;
}

/**
 * The non-modal side panel (the Work item's panel, 0008 §5.4): no scrim, so the list or board beside it stays usable. Escape closes it only when focus is
 * inside it (and not while a menu or list inside has its own use for Escape); closing returns focus to what opened it, and opening puts focus on its heading
 * unless it is already inside. An unsaved comment inside (see `useReportDirty`) makes a close ask first. Pair with `DrawerHeader`.
 */
export function SidePanel({ label, onClose, size, className, children }: { label: string; onClose: () => void; size?: DrawerSize; className?: string; children: ReactNode }) {
  const say = useSay();
  const root = useRef<HTMLElement>(null);
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const requestClose = useCallback(() => (dirty ? setAsking(true) : onClose()), [dirty, onClose]);
  const context = useMemo(() => ({ setDirty, requestClose }), [requestClose]);
  useEffect(() => {
    const panel = root.current;
    const heading = panel?.querySelector<HTMLElement>("h1,h2,h3");
    if (heading && panel && !panel.contains(document.activeElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    return () => {
      const here = document.activeElement;
      // Only take focus back when it would otherwise be lost: the user has not moved on to another control.
      if (opener?.isConnected && (!here || here === document.body || panel?.contains(here))) opener.focus();
    };
  }, [opener]);
  return (
    <PanelContext.Provider value={context}>
      <aside
        ref={root}
        role="complementary"
        aria-label={label}
        className={sidePanelClass(size, className)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented || asking) return;
          if ((e.target as HTMLElement).closest("details[open],[role=listbox],[aria-expanded=true]")) return;
          requestClose();
        }}
      >
        {children}
      </aside>
      {asking && (
        <ConfirmDialog
          destructive
          question={say(WORDS.discardComment)}
          words={say(WORDS.discardCommentWords)}
          confirmLabel={say(WORDS.discard)}
          cancelLabel={say(WORDS.keepWriting)}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onClose();
          }}
        />
      )}
    </PanelContext.Provider>
  );
}
