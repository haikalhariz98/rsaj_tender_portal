"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { CONTROL, NOTCH_LABEL, NOTCH_WRAP, inputClass, type ControlSize } from "./control";
import { cx } from "./cx";
import { FieldProvider, fieldAria, useFieldContext } from "./field-context";

export { inputClass };
export { Option, Select } from "./select";

export function Input({
  size = "md",
  mono,
  numeric,
  icon,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize;
  mono?: boolean;
  numeric?: boolean;
  /// Drawn inside the box on the left — a search glass, say.
  icon?: ReactNode;
}) {
  const ctx = useFieldContext();
  const input = (
    <input
      className={inputClass(
        size,
        cx(mono && "font-mono text-[13px]", numeric && "text-right tabular-nums", icon && "pl-9", className),
      )}
      {...props}
      {...fieldAria(ctx, props)}
    />
  );
  if (!icon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4">{icon}</span>
      {input}
    </div>
  );
}

/// An input with fixed text before or after it — "RM", "days", "%".
export function AffixInput({
  prefix,
  suffix,
  size = "md",
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> & {
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: ControlSize;
}) {
  const ctx = useFieldContext();
  return (
    <div className={cx("relative flex items-center", className)}>
      {prefix && (
        <span className="pointer-events-none absolute left-3.5 text-[13px] font-semibold text-ink-3">
          {prefix}
        </span>
      )}
      <input
        className={inputClass(size, cx(prefix && "pl-11", suffix && "pr-14", "tabular-nums"))}
        {...props}
        {...fieldAria(ctx, props)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 text-[13px] font-semibold text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ctx = useFieldContext();
  return (
    <textarea
      className={cx(CONTROL, "min-h-24 px-3.5 py-2.5 text-[14px] leading-relaxed", className)}
      {...props}
      {...fieldAria(ctx, props)}
    />
  );
}

/// A control with its label notched into the top border, and the hint or error under it.
/// Every Input, Textarea, AffixInput and Select goes through this, so every form reads
/// the same. The label names the control (for/id, and aria-labelledby through context);
/// the hint and error describe it.
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const base = useId();
  const labelId = `${base}-label`;
  const hintId = hint ? `${base}-hint` : undefined;
  const errorId = error ? `${base}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldProvider value={{ labelId, describedBy, invalid: !!error }}>
      {/* The notch hangs 8px above the box; the top padding keeps it clear of whatever is above. */}
      <div className={cx("min-w-0 pt-2", className)}>
        <div className={NOTCH_WRAP}>
          <label id={labelId} htmlFor={htmlFor} className={NOTCH_LABEL}>
            {label}
            {required && (
              <span className="ml-0.5 text-rose-600" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {children}
        </div>
        {/* Both, when both exist: the hint says what the field is for, and a refused
            value is easier to correct with that still in view. */}
        {hint && (
          <p id={hintId} className="mt-1.5 text-[12.5px] text-ink-3">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1 text-[12.5px] font-medium text-rose-600">
            {error}
          </p>
        )}
      </div>
    </FieldProvider>
  );
}

/// A checkbox with its label. Rounded, brand-coloured when on.
export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className={cx("inline-flex cursor-pointer items-start gap-2.5", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4.5 shrink-0 cursor-pointer rounded-md accent-brand-600 disabled:cursor-not-allowed"
        {...props}
      />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[14px] text-ink">{label}</span>}
          {description && <span className="block text-[12.5px] text-ink-3">{description}</span>}
        </span>
      )}
    </label>
  );
}

/// An on/off switch. A checkbox underneath, so forms and screen readers treat it as one.
export function Switch({
  label,
  description,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className={cx("inline-flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span className="h-5.5 w-10 rounded-full bg-ink/15 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/25 peer-disabled:opacity-50" />
        <span className="absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white shadow transition peer-checked:translate-x-4.5" />
      </span>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[14px] text-ink">{label}</span>}
          {description && <span className="block text-[12.5px] text-ink-3">{description}</span>}
        </span>
      )}
    </label>
  );
}
