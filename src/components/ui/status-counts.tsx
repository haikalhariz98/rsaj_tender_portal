import Link from "next/link";

import { Dot, type Tone } from "./badge";
import { cx } from "./cx";

export interface StatusCount {
  label: string;
  count: number;
  /// The filtered view of the list this chip stands for.
  href: string;
  tone?: Tone;
  /// The view being shown.
  active?: boolean;
  /// Not counted, and why (a set too large to judge): the chip shows a dash, never a number it does not have, and stays in the row.
  uncounted?: string;
}

/// Where a list stands, as chips of status and count that each open the filtered view ("3 Awaiting you"). A status with nothing in it is left
/// out, and with nothing anywhere the row is too: no "0 sent back". Replaces a counter subtitle under a title; `label` names the group for a
/// screen reader.
export function StatusCounts({ items, label, className }: { items: StatusCount[]; label: string; className?: string }) {
  // The view being shown stays, even at zero, so a reader on an empty view sees where they are; with nothing anywhere the row is still left out.
  const any = items.some((i) => i.count > 0 || i.uncounted);
  const shown = items.filter((i) => i.count > 0 || i.uncounted || (any && i.active));
  if (shown.length === 0) return null;
  return (
    <nav aria-label={label} className={cx("flex flex-wrap items-center gap-2", className)}>
      {shown.map((i) => (
        <Link
          key={i.label}
          href={i.href}
          aria-current={i.active ? "true" : undefined}
          title={i.uncounted}
          className={cx(
            "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium no-underline transition hover:no-underline",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
            i.active ? "border-brand-300 bg-brand-50 text-brand-800" : "border-line-2 bg-surface text-ink-2 hover:bg-sunken hover:text-ink",
          )}
        >
          <Dot tone={i.tone} />
          <span className="font-bold tabular-nums text-ink">{i.uncounted ? "—" : i.count}</span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
