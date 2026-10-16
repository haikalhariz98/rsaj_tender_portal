"use client";

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
  tone?: keyof typeof PRESSED;
  /// This choice alone is unavailable, with the reason on hover (SR-14: Present on a part no file was received for).
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
}: {
  options: readonly ToggleOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  disabled?: boolean;
  /// What is being chosen, for a screen reader ("Attendance of Gopal Nair").
  label: string;
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex shrink-0 rounded-full border border-line-2 bg-surface p-0.5">
      {options.map((o) => {
        const pressed = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            className={cx(
              "h-7 rounded-full px-3 text-[12.5px] font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              "disabled:cursor-not-allowed",
              pressed ? PRESSED[o.tone ?? "brand"] : "text-ink-2 enabled:hover:bg-ink/5 enabled:hover:text-ink disabled:opacity-45",
            )}
            aria-pressed={pressed}
            disabled={disabled || o.disabled}
            title={o.disabled ? o.reason : undefined}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}
