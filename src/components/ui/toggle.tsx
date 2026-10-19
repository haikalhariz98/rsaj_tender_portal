"use client";

import { useId } from "react";

import { cx } from "./cx";

const PRESSED = {
  ok: "bg-emerald-600 text-white",
  err: "bg-rose-600 text-white",
  neutral: "bg-ink-2 text-white",
  brand: "bg-brand-600 text-white",
} as const;

export type ToggleOption<V extends string> = {
  value: V;
  label: string;
  /// A fuller name when `label` is short ("N/A"): the accessible name and the hover text.
  name?: string;
  tone?: keyof typeof PRESSED;
  /// This choice alone is unavailable, with the reason on hover and focus (SR-14: Present on a part no file was received for).
  disabled?: boolean;
  reason?: string;
};

/// Two or three choices side by side in one pill, one pressed: a vote, an attendance. Acting on
/// a press is the caller's (`onChange`); the pill only shows which is pressed.
export function Toggle<V extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
  compact,
}: {
  options: readonly ToggleOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  disabled?: boolean;
  /// What is being chosen, for a screen reader ("Attendance of Gopal Nair").
  label: string;
  /// Tighter buttons, for a toggle in a narrow table column.
  compact?: boolean;
}) {
  const base = useId();
  return (
    <span role="group" aria-label={label} className="inline-flex shrink-0 rounded-full border border-line-2 bg-surface p-0.5">
      {options.map((o) => {
        const pressed = value === o.value;
        // One choice unavailable: it stays focusable (aria-disabled, not disabled) so its reason
        // can be reached by keyboard, and the reason is its accessible description.
        const unavailable = !disabled && !!o.disabled;
        const reasonId = `${base}-${o.value}`;
        return (
          <span key={o.value} className="group relative inline-flex">
            <button
              type="button"
              className={cx(
                "h-7 rounded-full text-[12.5px] font-semibold transition",
                compact ? "px-2" : "px-3",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                "disabled:cursor-not-allowed",
                unavailable && "cursor-not-allowed",
                pressed ? PRESSED[o.tone ?? "brand"] : cx("text-ink-2", !unavailable && "enabled:hover:bg-ink/5 enabled:hover:text-ink", (disabled || unavailable) && "opacity-45"),
              )}
              aria-pressed={pressed}
              disabled={disabled}
              aria-disabled={unavailable || undefined}
              aria-describedby={unavailable && o.reason ? reasonId : undefined}
              title={o.disabled ? undefined : o.name}
              aria-label={o.name}
              onClick={() => {
                if (!unavailable) onChange(o.value);
              }}
            >
              {o.label}
            </button>
            {unavailable && o.reason && (
              <span
                id={reasonId}
                role="tooltip"
                className="pointer-events-none absolute top-full left-0 z-30 mt-2 hidden w-max max-w-64 rounded-xl border border-line bg-surface p-2.5 text-left text-[12.5px] leading-snug font-normal text-ink-2 shadow-pop group-focus-within:block group-hover:block"
              >
                {o.reason}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
