"use client";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { InfoIcon } from "@/components/icons";

import { iconButtonClass } from "./button";
import { cx } from "./cx";

const OPEN_DELAY = 150;
const CLOSE_DELAY = 200;

/// The information button after a cut subtitle. It reveals the full text on hover (the
/// popover stays open while the pointer is over it), on keyboard focus, and on tap or
/// click, which pins it until a second tap, an outside tap or Escape.
///
/// The full text is in the page as screen-reader-only text rendered here, so the popover is
/// hidden from assistive technology: it is heard once, and callers add no copy of their own.
export function MoreText({
  text,
  title,
  variant = "plain",
  label,
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
  const say = useSay();
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const pinned = useRef(false);
  const keyboard = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const root = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);

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
    // Flip to the button's right edge when the popover would run past the window's right side.
    if (p && b && p.right > window.innerWidth - 8 && b.right - p.width >= 8) setAlignRight(true);
    return () => {
      setAbove(false);
      setAlignRight(false);
    };
  }, [open]);

  // Outside tap or click closes a pinned popover; Escape closes whatever is open.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("pointerdown", outside);
    // Capture phase, and stopped: Escape closes this popover first, not the drawer around it.
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key, true);
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
    <span ref={root} className="relative -my-1 inline-block align-middle" onPointerEnter={hoverIn} onPointerLeave={hoverOut}>
      <button
        type="button"
        aria-label={label ?? say(COMPONENT_WORDS.showFullDescription)}
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
      <span className="sr-only">
        {title ? `${title}. ` : ""}
        {text}
      </span>
      {open && (
        <span
          ref={pop}
          aria-hidden="true"
          className={cx(
            "absolute z-30 block w-max max-w-[min(36rem,calc(100vw-2rem))] p-3 text-left text-[13.5px] leading-snug font-normal tracking-normal shadow-pop",
            variant === "note" ? "rounded-xl bg-ink p-4 text-white" : "rounded-2xl border border-line bg-surface text-ink-2",
            alignRight ? "right-0" : "left-0",
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
      {lead} <MoreText text={more} />
    </>
  );
}
