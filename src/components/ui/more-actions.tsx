"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

import { useSay } from "@/components/i18n/language-context";
import { MoreIcon } from "@/components/icons";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { iconButtonClass } from "./button";
import { cx } from "./cx";
import { moreItemClass } from "./more-item-class";

/// The "…" menu of a `PageHeader`: the secondary and the destructive actions, so the header keeps one or two primary buttons. Native
/// `details`/`summary` (keyboard-operable with no script, as `Disclosure` is); the small effect only closes it on Escape, returning focus
/// to the button, and on a click outside. Items are `MoreItem`s, or a form holding one (an action that posts).
/// `compact`: the small button a card carries (the Board's "Move to"). `closeOnPick`: the menu closes when an item is pressed; leave it off where an item opens
/// a dialog that is rendered inside the menu, which closing would unmount.
export function MoreActions({ children, label, compact, closeOnPick }: { children: ReactNode; label?: string; compact?: boolean; closeOnPick?: boolean }) {
  const say = useSay();
  const root = useRef<HTMLDetailsElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = (refocus: boolean) => {
    if (!root.current) return;
    root.current.open = false;
    if (refocus) root.current.querySelector("summary")?.focus();
  };
  // The panel is drawn in the top layer, placed from the button, so a scroller around the menu (the Board's) cannot clip it.
  const place = useCallback(() => {
    const summary = root.current?.querySelector("summary");
    const p = pop.current;
    if (!summary || !p) return;
    const r = summary.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    p.style.right = `${Math.max(8, vw - r.right)}px`;
    p.style.left = "auto";
    if (p.offsetHeight > vh - r.bottom - 12 && r.top > vh - r.bottom) {
      p.style.top = "auto";
      p.style.bottom = `${vh - r.top + 8}px`;
    } else {
      p.style.bottom = "auto";
      p.style.top = `${r.bottom + 8}px`;
    }
  }, []);
  useLayoutEffect(() => {
    const p = pop.current;
    if (!p) return;
    try {
      if (open) p.showPopover?.();
      else p.hidePopover?.();
    } catch {
      /* already in that state */
    }
    if (open) place();
  }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);
  const name = label ?? say(COMPONENT_WORDS.moreActions);
  return (
    <details ref={root} className="relative" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary
        aria-label={name}
        title={name}
        className={cx(iconButtonClass(compact ? "sm" : "md", !compact, compact ? "size-7" : undefined), "cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden")}
      >
        <MoreIcon size={compact ? 16 : 18} />
      </summary>
      <div
        ref={pop}
        popover="manual"
        style={{ position: "fixed", inset: "auto", margin: 0 }}
        className="z-30 flex min-w-52 flex-col rounded-2xl border border-line bg-surface p-1.5 text-left text-ink shadow-pop"
        onClick={
          closeOnPick
            ? (e) => {
                // A link navigates; a button leaves the page where it is, so focus goes back to the menu's button.
                const hit = (e.target as HTMLElement).closest("button,a");
                if (hit) close(hit.tagName === "BUTTON");
              }
            : undefined
        }
      >
        {children}
      </div>
    </details>
  );
}

/// One entry of the menu: a link with `href`, otherwise a button. `danger` marks a destructive one.
export function MoreItem({ href, danger, icon, children, ...button }: { href?: string; danger?: boolean; icon?: ReactNode; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const className = moreItemClass(danger);
  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...button} className={className}>
      {icon}
      {children}
    </button>
  );
}
