"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { InfoIcon } from "@/components/icons";

import { iconButtonClass } from "./button";
import { cx } from "./cx";

const OPEN_DELAY = 150;
const CLOSE_DELAY = 200;

/// The information button after a cut subtitle. It reveals the full text on hover (the
/// popover stays open while the pointer is over it), on keyboard focus, and on tap or
/// click, which pins it until a second tap, an outside tap or Escape.
///
/// The full text is also in the page as screen-reader-only text (see PageHeader), so the
/// popover is hidden from assistive technology: it is heard once, not twice.
export function MoreText({
  text,
  title,
  variant = "plain",
  label = "Show the full description",
}: {
  text: string;
  /// A bold first line in the popover (the `note` variant).
  title?: string;
  /// `note`: a dark message box beside a page's title, for what a screen covers and what it does
  /// not (founder, 2026-10-05). `plain`: the white popover after a cut subtitle.
  variant?: "plain" | "note";
  /// The button's accessible name.
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const pinned = useRef(false);
  const keyboard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const id = useId();

  const clear = () => clearTimeout(timer.current);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpen(false);
  }, []);

  // Flip above the button when the popover would run off the bottom of the window.
  useLayoutEffect(() => {
    if (!open) return;
    const p = pop.current?.getBoundingClientRect();
    const b = root.current?.getBoundingClientRect();
    if (p && b && p.bottom > window.innerHeight - 8 && b.top > p.height + 16) setAbove(true);
    return () => setAbove(false);
  }, [open]);

  // Outside tap or click closes a pinned popover; Escape closes whatever is open.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const hoverIn = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    timer.current = setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const hoverOut = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    if (pinned.current || keyboard.current) return;
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  };

  return (
    <span ref={root} className={cx("-my-1 inline-block align-middle", variant === "note" && "relative")} onPointerEnter={hoverIn} onPointerLeave={hoverOut}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className={cx(
          iconButtonClass("sm", false, "size-6 hover:text-brand-700 focus-visible:text-brand-700"),
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
          // A 44px hit area around the 24px visible button.
          "before:absolute before:-inset-2.5 before:content-['']",
        )}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) {
            keyboard.current = true;
            clear();
            setOpen(true);
          }
        }}
        onBlur={() => {
          keyboard.current = false;
          if (!pinned.current) close();
        }}
        onClick={() => {
          clear();
          if (open && pinned.current) close();
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
      >
        <InfoIcon size={16} />
      </button>
      {open && (
        <span
          ref={pop}
          id={id}
          aria-hidden="true"
          className={cx(
            "absolute left-0 z-30 block w-max max-w-[min(36rem,calc(100vw-2rem))] p-3 text-left text-[13.5px] leading-snug font-normal tracking-normal shadow-pop",
            variant === "note" ? "rounded-xl bg-ink p-4 text-white" : "rounded-2xl border border-line bg-surface text-ink-2",
            above ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {title && <span className="mb-1 block font-semibold">{title}</span>}
          {text}
        </span>
      )}
    </span>
  );
}

/// A short line with the rest behind the information button: the lead to the eye, the detail in
/// the popover, and both read once by a screen reader (the popover is hidden from it; see MoreText).
/// For a card or section subtitle whose detail is worth keeping but too long to show (founder,
/// 2026-10-04: "sub header too long").
export function LeadWithMore({ lead, more }: { lead: string; more: string }) {
  return (
    <>
      {lead} <span className="sr-only">{more}</span>
      <MoreText text={more} />
    </>
  );
}
