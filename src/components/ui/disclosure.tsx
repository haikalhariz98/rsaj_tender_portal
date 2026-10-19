import type { ReactNode } from "react";

import { ChevronDown } from "@/components/icons";

import { cx } from "./cx";

/// The one collapsible part of a card (note 0005 R12). Native `details`/`summary`: keyboard-operable with no script,
/// and the closed content stays in the page, so a text snapshot still sees it. It holds content (records, lists, finished
/// fields), never explanation. `summary` is the one line shown beside the title while the part is closed.
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  boxed = false,
  className,
  children,
  ...rest
}: {
  title: ReactNode;
  /// One line: a state, a count, at most one fact. Shown while closed.
  summary?: ReactNode;
  defaultOpen?: boolean;
  /// A bordered box, for a part inside a card body.
  boxed?: boolean;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details open={defaultOpen} className={cx("group/disc min-w-0 text-[13.5px]", boxed && "rounded-xl border border-line px-4 py-3", className)} {...rest}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-3 rounded-lg font-semibold text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 break-words">{title}</span>
        {summary && <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] font-normal text-ink-3 group-open/disc:hidden">{summary}</span>}
        <ChevronDown size={16} className="shrink-0 text-ink-3 transition-transform group-open/disc:rotate-180" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
