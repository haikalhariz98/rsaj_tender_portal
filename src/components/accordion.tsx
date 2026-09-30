"use client";

import { useId, useState, type ReactNode } from "react";

import { ChevronDown } from "@/components/icons";
import { cx } from "@/components/ui/cx";

/**
 * A collapsible group. Used to hold each decision type's rules, so 92 rows across
 * 29 types can sit on one screen without any of them being hidden behind a filter.
 */
export function Accordion({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex w-full min-w-0 items-center gap-3 px-5 py-3.5 text-left transition hover:bg-sunken",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
          open && "border-b border-line",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink" title={title}>
          {title}
        </span>
        {meta && <span className="shrink-0 text-[12.5px] text-ink-3">{meta}</span>}
        <ChevronDown
          size={16}
          className={cx("shrink-0 text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={bodyId} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
