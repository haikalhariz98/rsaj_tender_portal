"use client";

import { useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";
import { NOT_SCANNED_LABEL, progressPercent, progressText, uploadOutcome, type UploadAnswer, type UploadPhase } from "@/lib/ui/upload-logic";

import { Chip } from "./badge";
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
        cx(mono && "font-mono text-[16px] sm:text-[13px]", numeric && "text-right tabular-nums", icon && "pl-9", trailing && "pr-11", className),
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

/// An upload mode (Phase 4b): the file is posted, as multipart, to a route handler as soon as it is chosen, and the control shows how far it has got, the refusal in the server's own words,
/// and, once it is stored, "Not scanned" (nothing scans a file yet). `fields` is read when the upload starts, so the page can say which version of its draft it is showing; the token rides
/// in `x-form-token`. The answer is handed to `onDone` on success, and to `onRefused` with its words and whether the page is out of date.
export interface FileUpload {
  url: string;
  token: string | null;
  fields?: () => Record<string, string>;
  onDone: (answer: UploadAnswer, file: File) => void;
  onRefused?: (message: string, stale: boolean) => void;
}

/// A file picker drawn as a control: a "Choose file" pill and the chosen name, in the same
/// box as every other input. The native input stays in the page (visually hidden, still
/// focusable and named by its Field), so the form submits the file as it always did.

export function FileInput({
  className,
  onChange,
  chooseLabel,
  upload,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "value" | "defaultValue"> & {
  id: string;
  chooseLabel?: string;
  upload?: FileUpload;
}) {
  const ctx = useFieldContext();
  const say = useSay();
  const [name, setName] = useState<string | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [loaded, setLoaded] = useState<[number, number]>([0, 0]);
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function send(file: File) {
    if (!upload) return;
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(upload.fields?.() ?? {})) form.append(k, v);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", upload.url);
    if (upload.token) xhr.setRequestHeader("x-form-token", upload.token);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => setLoaded([e.loaded, e.lengthComputable ? e.total : 0]);
    xhr.onload = () => {
      const body = (xhr.response ?? null) as UploadAnswer | null;
      const outcome = uploadOutcome(xhr.status, body);
      setPhase(outcome.phase);
      setSaid(outcome.message);
      if (input.current) input.current.value = "";
      if (outcome.phase === "done" && body) upload.onDone(body, file);
      else upload.onRefused?.(outcome.message, outcome.stale);
    };
    xhr.onerror = () => {
      const outcome = uploadOutcome(0, null);
      setPhase("refused");
      setSaid(outcome.message);
      upload.onRefused?.(outcome.message, false);
    };
    setPhase("uploading");
    setSaid("");
    setLoaded([0, file.size]);
    xhr.send(form);
  }

  const busy = phase === "uploading";
  return (
    <div className={cx("relative", className)}>
      <input
        ref={input}
        type="file"
        className="peer sr-only"
        {...props}
        disabled={props.disabled || busy}
        {...fieldAria(ctx, props)}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          setName(file?.name ?? null);
          onChange?.(e);
          if (upload && file) send(file);
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
        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-brand-800">{chooseLabel ?? say(WORDS.chooseFile)}</span>
        <span className={cx("min-w-0 truncate", name ? "text-ink" : "text-ink-4")}>{name ?? say(WORDS.noFileChosen)}</span>
      </label>
      {upload && busy && (
        <div className="mt-1.5">
          <div
            role="progressbar"
            aria-label={say(WORDS.uploadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent(loaded[0], loaded[1])}
            className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"
          >
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${progressPercent(loaded[0], loaded[1])}%` }} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-3" aria-live="polite">
            {progressText(loaded[0], loaded[1])}
          </p>
        </div>
      )}
      {upload && phase === "done" && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2" aria-live="polite">
          <span>{say(WORDS.uploaded)}</span>
          <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
        </p>
      )}
      {upload && phase === "refused" && (
        <p role="alert" className="mt-1.5 text-[12.5px] font-medium text-rose-700">
          {said}
        </p>
      )}
    </div>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ctx = useFieldContext();
  return (
    <textarea
      className={cx(CONTROL, "min-h-24 px-3.5 py-2.5 text-[16px] leading-relaxed sm:text-[14px]", className)}
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
