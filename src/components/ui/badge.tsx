import type { HTMLAttributes, ReactNode } from "react";

import { LockIcon } from "@/components/icons";
import { grantedWords, type Sulit } from "@/lib/auth/sulit-access";
import { SULIT_VALUE_WORDS } from "@/lib/sulit-fields";

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
  info: "bg-sky-100 text-sky-700",
};

const DOT: Record<Tone, string> = {
  neutral: "bg-ink-4",
  brand: "bg-brand-500",
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  err: "bg-rose-500",
  info: "bg-sky-500",
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
  wrap = true,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  outline?: boolean;
  size?: "sm" | "md";
  /// A status is never cut with an ellipsis: a label wider than its cell wraps onto a
  /// second line. Pass `wrap={false}` only where one line is a hard requirement.
  wrap?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full font-semibold",
        wrap
          ? "min-h-6 py-0.5 text-left leading-4 break-words"
          : cx("truncate whitespace-nowrap", size === "sm" ? "h-6" : "h-7"),
        size === "sm" ? "px-2.5 text-[12px]" : "px-3 text-[13px]",
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
  wrap = true,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode; wrap?: boolean }) {
  const ring: Record<Tone, string> = {
    neutral: "border-line-2 bg-surface text-ink-2",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    err: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-700",
  };
  return (
    <span
      className={cx(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium",
        !wrap && "whitespace-nowrap",
        ring[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <span className={wrap ? "min-w-0 break-words" : "truncate"}>{children}</span>
    </span>
  );
}

/// The mark for a SULIT value or column: a small lock to the eye, the whole sentence in the tooltip and to a screen reader. By default the
/// sentence is the general one (`SULIT_VALUE_WORDS`); a value a loader has judged (`Sulit<T>`) says why it is shown instead, so the mark never implies a protection
/// that is not there, nor denies one that is.
export function SulitLock({ size = 13, className, label = SULIT_VALUE_WORDS }: { size?: number; className?: string; label?: string }) {
  return (
    <span title={label} className={cx("inline-flex shrink-0 items-center text-ink-3", className)}>
      <LockIcon size={size} strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/// The tag on a card or section whose content is SULIT: it says the figures are shown only to the people entitled to them and that every reading is logged. It
/// promises nothing about who the reader is: the figures themselves are drawn, or withheld with the reason, one by one.
export function SulitTag({ className }: { className?: string }) {
  const words = "SULIT. Shown only to the people entitled to it, and every reading is logged.";
  return (
    <span title={words} className={cx("inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[12.5px] font-medium text-rose-700", className)}>
      <LockIcon size={12} strokeWidth={2} />
      <span>SULIT</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/// What stands where a SULIT value is withheld from the reader: the lock and "SULIT · withheld", with the reason in words as the tooltip and to a
/// screen reader. Never the value, never a placeholder shaped like one.
export function SulitWithheld({ words, className }: { words: string; className?: string }) {
  return (
    <span title={words} className={cx("inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap text-ink-3", className)}>
      <LockIcon size={13} strokeWidth={2} />
      <span>SULIT · withheld</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/**
 * A value the organisation treats as SULIT, as a loader judged it for the reader (`Sulit<ReactNode>`, ADR 0034 D14): the value with a lock whose tooltip says why the
 * reader may see it, or "SULIT · withheld" with the reason. A withheld answer carries no value, so there is nothing to leak. There is no form that draws a value nothing has
 * judged: a screen that has a figure to show asks the rule first (Phase 3b retired the older form).
 */
export function SulitValue({ of: s }: { of: Sulit<ReactNode> }) {
  if (s.state === "WITHHELD") return <SulitWithheld words={s.words.en} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{s.value}</span>
      <SulitLock label={`SULIT. ${grantedWords(s.basis).en}`} />
    </span>
  );
}
