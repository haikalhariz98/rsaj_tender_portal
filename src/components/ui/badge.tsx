import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

/// Tones share their names with the old design system's modifiers (ok, warn, err,
/// info, brand), so data that carries a tone — `Cell.tone` — maps across unchanged.
export type Tone = "neutral" | "brand" | "ok" | "warn" | "err" | "info";

const SOFT: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-ink-2",
  brand: "bg-brand-100 text-brand-800",
  ok: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  err: "bg-rose-100 text-rose-700",
  info: "bg-indigo-100 text-indigo-700",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-4",
  brand: "bg-brand-500",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  err: "bg-rose-500",
  info: "bg-indigo-500",
};

export function dotClass(tone: Tone = "neutral"): string {
  return DOT[tone];
}

/// A small rounded status label. `dot` prefixes a coloured dot; `outline` swaps the
/// fill for a hairline border (for counts and overflow such as "+3").
export function Badge({
  tone = "neutral",
  dot,
  outline,
  size = "sm",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  outline?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 truncate rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "h-6 px-2.5 text-[12px]" : "h-7 px-3 text-[13px]",
        outline ? "border border-line-2 bg-surface text-ink-2" : SOFT[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cx("size-1.5 shrink-0 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

/// A dot on its own, for timelines and legends.
export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", DOT[tone], className)} />;
}

/// A chip is a badge with a border that reads as a tag or a selectable value.
export function Chip({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  const ring: Record<Tone, string> = {
    neutral: "border-line-2 bg-surface text-ink-2",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    err: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium whitespace-nowrap",
        ring[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
