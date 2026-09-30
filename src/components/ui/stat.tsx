import Link from "next/link";
import type { ReactNode } from "react";

import type { Tone } from "./badge";
import { cx } from "./cx";

const ICON_TILE: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-ink-2",
  brand: "bg-brand-100 text-brand-700",
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  err: "bg-rose-100 text-rose-700",
  info: "bg-indigo-100 text-indigo-700",
};

/// A headline figure. `value` null means the figure does not exist yet (the module
/// is not built, or nothing is set) and renders as a quiet dash rather than a nought.
export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "brand",
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode | null;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
        {icon && (
          <span className={cx("grid size-9 shrink-0 place-items-center rounded-xl", ICON_TILE[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div
        className={cx(
          "mt-2 truncate text-[30px] leading-none font-bold tracking-[-0.02em] tabular-nums",
          value == null ? "text-ink-4" : "text-ink",
        )}
      >
        {value ?? "—"}
      </div>
      {hint && <div className="mt-2.5 line-clamp-2 text-[12.5px] text-ink-3">{hint}</div>}
    </>
  );
  const cls = cx(
    "block min-w-0 rounded-card border border-line/70 bg-surface p-5 shadow-card",
    href && "transition hover:-translate-y-0.5 hover:no-underline hover:shadow-pop",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/// A label and its value, in rows or columns — the record's facts.
export function KeyValues({
  items,
  columns = 1,
  className,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cx(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] font-semibold text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 text-[14px] break-words text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
