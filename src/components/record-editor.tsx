"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { AlertTriangle, PlusIcon, XIcon } from "@/components/icons";

/**
 * The form chrome around every configuration record.
 *
 * Fields are described as data rather than passed as rendered nodes, so a server
 * component can declare them and the action that saves them in one place. Adding a
 * field kind here is how a new input type arrives.
 *
 * No field carries a default value. A pre-filled threshold or a pre-selected method
 * would be a customer's policy choice shipped as software; `placeholder` shows the
 * shape without proposing an answer.
 */
export type Field =
  | {
      kind: "text";
      name: string;
      label: string;
      required?: boolean;
      hint?: string;
      placeholder?: string;
      mono?: boolean;
    }
  | { kind: "textarea"; name: string; label: string; hint?: string; placeholder?: string }
  | {
      kind: "number";
      name: string;
      label: string;
      required?: boolean;
      hint?: string;
      min?: number;
      placeholder?: string;
    }
  | { kind: "money"; name: string; label: string; required?: boolean; hint?: string }
  | { kind: "date"; name: string; label: string; required?: boolean; hint?: string }
  | {
      kind: "select";
      name: string;
      label: string;
      required?: boolean;
      hint?: string;
      options: { value: string; label: string }[];
      /// Shown as the unchosen option. Never pre-selects anything.
      placeholder?: string;
    }
  | { kind: "switch"; name: string; label: string; hint?: string }
  /// Carried through the form without being shown — a row id, a record type.
  | { kind: "hidden"; name: string }
  | { kind: "note"; text: string };

export interface FormState {
  ok: boolean;
  errors?: Record<string, string>;
  message?: string;
}

export const EMPTY_FORM_STATE: FormState = { ok: false };

export type SaveAction = (prev: FormState, data: FormData) => Promise<FormState>;

export function RecordEditor({
  title,
  description,
  fields,
  action,
  values,
  trigger,
  submitLabel = "Save",
  destructive,
  size = "",
}: {
  title: string;
  description?: string;
  fields: Field[];
  action: SaveAction;
  /// Current values, when editing. Absent means a new record and empty inputs.
  values?: Record<string, string | boolean | null>;
  trigger: { label: string; className?: string; icon?: boolean };
  submitLabel?: string;
  /// Requires a reason before the button enables. Used for deletion.
  destructive?: { reasonLabel: string };
  size?: "" | " modal--sm" | " modal--lg";
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // A save that succeeded closes the form; one that failed stays open holding its
  // errors, because reopening a cleared form loses what the officer typed. Decided
  // here on the submit rather than in an effect watching the result — an effect that
  // closes the dialog re-renders it once more first.
  const submit = (data: FormData) => {
    startTransition(async () => {
      const result = await action(EMPTY_FORM_STATE, data);
      setState(result);
      if (result.ok) {
        setOpen(false);
        setReason("");
        opener.current?.focus();
      }
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const blocked = destructive != null && reason.trim().length === 0;

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={trigger.className ?? "btn btn--sm"}
        onClick={() => {
          setState(EMPTY_FORM_STATE);
          setOpen(true);
        }}
      >
        {trigger.icon && <PlusIcon size={15} />}
        {trigger.label}
      </button>

      {open && (
        <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div
            className={`modal${size}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={dialog}
          >
            <form action={submit}>
              <div className="ov__head">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="h2 trunc">{title}</div>
                  {description && (
                    <div className="sm muted" style={{ marginTop: 2 }}>
                      {description}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <XIcon size={17} />
                </button>
              </div>

              <div className="ov__body">
                <div className="stack stack--md">
                  {state.message && (
                    <div className="callout callout--err">
                      <span className="callout__ico">
                        <AlertTriangle size={17} />
                      </span>
                      <div className="grow">
                        <span className="sm">{state.message}</span>
                      </div>
                    </div>
                  )}

                  {fields.map((field) =>
                    field.kind === "hidden" ? (
                      <input
                        key={field.name}
                        type="hidden"
                        name={field.name}
                        value={String(values?.[field.name] ?? "")}
                      />
                    ) : field.kind === "note" ? (
                      <p key={field.text} className="sm muted" style={{ margin: 0 }}>
                        {field.text}
                      </p>
                    ) : (
                      <FieldInput
                        key={field.name}
                        field={field}
                        value={values?.[field.name] ?? null}
                        error={state.errors?.[field.name]}
                      />
                    ),
                  )}

                  {destructive && (
                    <label className="field">
                      <span className="field__lbl">
                        {destructive.reasonLabel} <span className="field__req">*</span>
                      </span>
                      <textarea
                        className="textarea"
                        name="reason"
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <span className="field__hint">
                        Recorded in the audit trail. Nobody is signed in, so this is the only
                        account of why the change was made.
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="ov__foot">
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${destructive ? "btn--danger" : "btn--primary"}`}
                  disabled={pending || blocked}
                >
                  {pending ? "Saving…" : submitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function FieldInput({
  field,
  value,
  error,
}: {
  field: Exclude<Field, { kind: "note" } | { kind: "hidden" }>;
  value: string | boolean | null;
  error?: string;
}) {
  const required = "required" in field && field.required;
  const hint = "hint" in field ? field.hint : undefined;

  const label = (
    <span className="field__lbl">
      {field.label} {required && <span className="field__req">*</span>}
    </span>
  );

  const foot = (
    <>
      {error ? (
        <span className="field__err">
          <AlertTriangle size={13} />
          {error}
        </span>
      ) : (
        hint && <span className="field__hint">{hint}</span>
      )}
    </>
  );

  if (field.kind === "switch") {
    return (
      <label className="check">
        <input type="checkbox" name={field.name} defaultChecked={value === true} />
        <span className="check__txt">
          {field.label}
          {hint && <span className="check__hint">{hint}</span>}
        </span>
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="field">
        {label}
        <select className="select" name={field.name} defaultValue={(value as string) ?? ""}>
          <option value="">{field.placeholder ?? "Not set"}</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {foot}
      </label>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className="field">
        {label}
        <textarea
          className="textarea"
          name={field.name}
          rows={3}
          placeholder={field.placeholder}
          defaultValue={(value as string) ?? ""}
        />
        {foot}
      </label>
    );
  }

  const type = field.kind === "date" ? "date" : "text";
  const cls =
    field.kind === "number" || field.kind === "money"
      ? "input input--num"
      : field.kind === "text" && field.mono
        ? "input input--mono"
        : "input";

  return (
    <label className="field">
      {label}
      {field.kind === "money" ? (
        <div className="inputwrap inputwrap--pre">
          <span className="inputwrap__pre">RM</span>
          <input
            className={cls}
            name={field.name}
            inputMode="decimal"
            defaultValue={(value as string) ?? ""}
          />
        </div>
      ) : (
        <input
          className={cls}
          type={type}
          name={field.name}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          placeholder={"placeholder" in field ? field.placeholder : undefined}
          defaultValue={(value as string) ?? ""}
        />
      )}
      {foot}
    </label>
  );
}
