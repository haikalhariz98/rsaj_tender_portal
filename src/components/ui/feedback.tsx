import type { ReactNode } from "react";

import { Say } from "@/components/i18n/language-context";
import { AlertTriangle, CheckIcon, InfoIcon, XIcon } from "@/components/icons";

import type { Tone } from "./badge";
import { COMPONENT_WORDS } from "@/lib/i18n/catalogues/components";

import { cx } from "./cx";

/// Nothing to show: a title of six words or fewer and, where there is a next step, the action button (note 0005 §3.1).
/// `children` is kept for bodies not yet cut; a new use passes none.
export function EmptyState({
  title,
  children,
  icon,
  action,
  size = "md",
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center",
        size === "sm" ? "px-6 py-6" : "px-6 py-10",
        className,
      )}
    >
      {icon && (
        <span
          className={cx(
            "mb-3 grid place-items-center rounded-2xl bg-brand-50 text-brand-600",
            size === "sm" ? "size-10" : "size-14",
          )}
        >
          {icon}
        </span>
      )}
      <div className={cx("font-bold text-ink", size === "sm" ? "text-[14px]" : "text-[16px]")}>
        {title}
      </div>
      {children && (
        <div className="mt-1 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-3">{children}</div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CALLOUT: Record<Exclude<Tone, "brand">, { box: string; icon: ReactNode }> = {
  /// A statement of record that asks nothing of the reader: no alert role, no colour of concern.
  neutral: { box: "border-line bg-sunken text-ink-2 [&_.ico]:text-ink-3", icon: <InfoIcon size={18} /> },
  info: { box: "border-sky-200 bg-sky-50 text-sky-900 [&_.ico]:text-sky-600", icon: <InfoIcon size={18} /> },
  ok: { box: "border-emerald-200 bg-emerald-50 text-emerald-900 [&_.ico]:text-emerald-600", icon: <CheckIcon size={18} /> },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-900 [&_.ico]:text-amber-600", icon: <AlertTriangle size={18} /> },
  err: { box: "border-rose-200 bg-rose-50 text-rose-900 [&_.ico]:text-rose-600", icon: <XIcon size={18} /> },
};

/// A message that belongs to the screen rather than to one field. Reserved for `warn` (the user must act, or
/// the action has a consequence they cannot see) and `err` (something is wrong now), 15 words at most, title
/// included. A state belongs in a chip and an explanation in a popover (note 0005 §3.4); `ok` is the brief
/// notice after the user's own act.
export function Callout({
  tone = "info",
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: "neutral" | "info" | "ok" | "warn" | "err";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const c = CALLOUT[tone];
  return (
    <div
      role={tone === "err" || tone === "warn" ? "alert" : "note"}
      className={cx("flex flex-wrap gap-x-3 gap-y-2.5 rounded-xl border px-3.5 py-2.5 text-[13px]", c.box, className)}
    >
      <span className="ico mt-px shrink-0">{icon ?? c.icon}</span>
      <div className="min-w-[min(100%,16rem)] flex-1 basis-0 leading-relaxed">
        {title && <div className="font-bold">{title}</div>}
        {children && <div className={cx(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="ml-auto shrink-0 self-center max-sm:ml-8">{action}</div>}
    </div>
  );
}

/// A horizontal bar. `percent` null renders nothing filled and says so — an
/// unallocated code has not used none of its budget.
export function Meter({
  percent,
  threshold,
  tone,
  showValue = true,
  label,
  className,
}: {
  percent: number | null;
  threshold?: number | null;
  tone?: "brand" | "warn" | "err";
  showValue?: boolean;
  /// What is measured, for a screen reader (the bar alone says nothing). Absent: the meter is announced by its value only.
  label?: string;
  className?: string;
}) {
  if (percent == null) return <span className="text-[12px] text-ink-3"><Say words={COMPONENT_WORDS.notSet} /></span>;
  const over = threshold != null && percent >= threshold;
  const fill =
    tone === "err" ? "bg-rose-500" : tone === "warn" || over ? "bg-amber-500" : "bg-brand-500";
  /// Named: a meter with its true figure (an overspent code reads 140%, never a clamped 100). Unnamed: no role, the visible value is the content, and the bar is hidden from a screen reader.
  const shown = Math.round(Math.max(0, percent));
  const meterProps = label
    ? { role: "meter", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": Math.max(100, shown), "aria-valuenow": shown, "aria-valuetext": `${shown}%` }
    : {};
  return (
    <div {...meterProps} className={cx("flex min-w-0 items-center gap-2.5", className)}>
      <span aria-hidden="true" className="relative h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
        <span
          className={cx("absolute inset-y-0 left-0 rounded-full", fill)}
          style={{ width: `${Math.max(0, Math.min(percent, 100))}%` }}
        />
        {threshold != null && (
          <span
            className="absolute inset-y-0 w-0.5 bg-ink/40"
            style={{ left: `${Math.min(threshold, 100)}%` }}
          />
        )}
      </span>
      {showValue && (
        <span className="w-10 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-ink-2">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
