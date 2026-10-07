"use client";

import { useId, useState } from "react";
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
  trailing,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: ControlSize;
  mono?: boolean;
  numeric?: boolean;
  /// Drawn inside the box on the left — a search glass, say.
  icon?: ReactNode;
  /// Something to press at the right edge, inside the box — a show/hide eye, say. It is the caller's own control, so it is not pointer-transparent.
  trailing?: ReactNode;
}) {
  const ctx = useFieldContext();
  const input = (
    <input
      className={inputClass(
        size,
        cx(mono && "font-mono text-[13px]", numeric && "text-right tabular-nums", icon && "pl-9", trailing && "pr-11", className),
      )}
      {...props}
      {...fieldAria(ctx, props)}
    />
  );
  if (!icon && !trailing) return input;
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4">{icon}</span>}
      {input}
      {trailing && <span className="absolute top-1/2 right-1.5 -translate-y-1/2">{trailing}</span>}
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

/// A file picker drawn as a control: a "Choose file" pill and the chosen name, in the same
/// box as every other input. The native input stays in the page (visually hidden, still
/// focusable and named by its Field), so the form submits the file as it always did.
export function FileInput({
  className,
  onChange,
  chooseLabel = "Choose file",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "value" | "defaultValue"> & {
  id: string;
  chooseLabel?: string;
}) {
  const ctx = useFieldContext();
  const [name, setName] = useState<string | null>(null);
  return (
    <div className={cx("relative", className)}>
      <input
        type="file"
        className="peer sr-only"
        {...props}
        {...fieldAria(ctx, props)}
        onChange={(e) => {
          setName(e.currentTarget.files?.[0]?.name ?? null);
          onChange?.(e);
        }}
      />
      <label
        htmlFor={props.id}
        className={cx(
          CONTROL,
          "flex h-10 cursor-pointer items-center gap-3 px-2 text-[14px]",
          "peer-focus-visible:border-brand-500 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/15",
          "peer-disabled:cursor-not-allowed peer-disabled:bg-sunken peer-disabled:text-ink-3",
          "peer-aria-invalid:border-rose-400",
        )}
      >
        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-brand-800">{chooseLabel}</span>
        <span className={cx("min-w-0 truncate", name ? "text-ink" : "text-ink-4")}>{name ?? "No file chosen"}</span>
      </label>
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
    <FieldProvider value={{ labelId, describedBy, invalid: !!error, required }}>
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
