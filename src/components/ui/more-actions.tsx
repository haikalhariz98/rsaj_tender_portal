"use client";

import Link from "next/link";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { useSay } from "@/components/i18n/language-context";
import { MoreIcon } from "@/components/icons";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { iconButtonClass } from "./button";
import { cx } from "./cx";

/// The "…" menu of a `PageHeader`: the secondary and the destructive actions, so the header keeps one or two primary buttons. Native
/// `details`/`summary` (keyboard-operable with no script, as `Disclosure` is); the small effect only closes it on Escape, returning focus
/// to the button, and on a click outside. Items are `MoreItem`s, or a form holding one (an action that posts).
export function MoreActions({ children, label }: { children: ReactNode; label?: string }) {
  const say = useSay();
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !root.current?.open) return;
      root.current.open = false;
      root.current.querySelector("summary")?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (root.current?.open && !root.current.contains(e.target as Node)) root.current.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);
  const name = label ?? say(COMPONENT_WORDS.moreActions);
  return (
    <details ref={root} className="relative">
      <summary
        aria-label={name}
        title={name}
        className={cx(iconButtonClass("md", true), "cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden")}
      >
        <MoreIcon size={18} />
      </summary>
      <div className="absolute right-0 z-30 mt-2 flex min-w-52 flex-col rounded-2xl border border-line bg-surface p-1.5 shadow-pop">{children}</div>
    </details>
  );
}

const ITEM = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] font-medium no-underline transition hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-45";
const TONE = { normal: "text-ink-2 hover:bg-ink/5 hover:text-ink", danger: "text-rose-700 hover:bg-rose-50" } as const;

/// One entry of the menu: a link with `href`, otherwise a button. `danger` marks a destructive one.
export function MoreItem({ href, danger, icon, children, ...button }: { href?: string; danger?: boolean; icon?: ReactNode; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const className = cx(ITEM, TONE[danger ? "danger" : "normal"]);
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
