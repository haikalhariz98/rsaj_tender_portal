import type { ReactNode } from "react";

import { AlertTriangle, CheckIcon, InfoIcon, XIcon } from "@/components/icons";

import type { Tone } from "./badge";
import { cx } from "./cx";

/// Nothing to show. Says what would be here and, where there is one, the way forward.
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
        size === "sm" ? "px-6 py-8" : "px-6 py-14",
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

/// A message that belongs to the screen rather than to one field: a gap in policy,
/// a rule that is assumed rather than stated, a warning before an action.
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
      className={cx("flex flex-wrap gap-x-3 gap-y-2.5 rounded-2xl border px-4 py-3.5 text-[13.5px]", c.box, className)}
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
  className,
}: {
  percent: number | null;
  threshold?: number | null;
  tone?: "brand" | "warn" | "err";
  showValue?: boolean;
  className?: string;
}) {
  if (percent == null) return <span className="text-[12px] text-ink-3">Not set</span>;
  const over = threshold != null && percent >= threshold;
  const fill =
    tone === "err" ? "bg-rose-500" : tone === "warn" || over ? "bg-amber-500" : "bg-brand-500";
  return (
    <div className={cx("flex min-w-0 items-center gap-2.5", className)}>
      <span className="relative h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
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
