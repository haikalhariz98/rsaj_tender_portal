import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { cx } from "./cx";

const CONTROL =
  "w-full min-w-0 rounded-control border border-line-2 bg-surface text-ink shadow-[0_1px_2px_rgb(19_33_27/0.04)] " +
  "placeholder:text-ink-4 transition outline-none " +
  "hover:border-ink-4 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 " +
  "aria-invalid:border-rose-400 aria-invalid:focus:ring-rose-500/15";

const HEIGHT = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-3.5 text-[14px]" } as const;

export function inputClass(size: keyof typeof HEIGHT = "md", extra?: string) {
  return cx(CONTROL, HEIGHT[size], extra);
}

export function Input({
  size = "md",
  mono,
  numeric,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  size?: keyof typeof HEIGHT;
  mono?: boolean;
  numeric?: boolean;
}) {
  return (
    <input
      className={inputClass(
        size,
        cx(mono && "font-mono text-[13px]", numeric && "text-right tabular-nums", className),
      )}
      {...props}
    />
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
  size?: keyof typeof HEIGHT;
}) {
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
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 text-[13px] font-semibold text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select({
  size = "md",
  className,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: keyof typeof HEIGHT }) {
  return (
    <select
      className={inputClass(
        size,
        cx(
          "cursor-pointer appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2366756d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")] bg-[position:right_0.75rem_center] bg-no-repeat pr-9",
          className,
        ),
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(CONTROL, "min-h-24 px-3.5 py-2.5 text-[14px] leading-relaxed", className)}
      {...props}
    />
  );
}

/// Label, control, and the hint or error under it.
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
  inline,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  /// Label beside the control rather than above it.
  inline?: boolean;
}) {
  return (
    <div
      className={cx(
        "min-w-0",
        inline ? "grid items-center gap-3 sm:grid-cols-[200px_1fr]" : "flex flex-col gap-1.5",
        className,
      )}
    >
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink-2">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="min-w-0">
        {children}
        {error ? (
          <p className="mt-1.5 text-[12.5px] font-medium text-rose-600">{error}</p>
        ) : hint ? (
          <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>
        ) : null}
      </div>
    </div>
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
