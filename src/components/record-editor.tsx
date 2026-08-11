"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { AlertTriangle, PlusIcon, SaveIcon, XIcon } from "@/components/icons";

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
      /// How a stored value that is no longer among the options reads. Without it the
      /// value itself is shown, which is right where the value is already a label and
      /// wrong where it is a code.
      orphanLabel?: string;
    }
  | { kind: "switch"; name: string; label: string; hint?: string }
  /// Several values at once, shown as removable tags.
  | {
      kind: "tokens";
      name: string;
      label: string;
      hint?: string;
      placeholder?: string;
      options: { value: string; label: string }[];
    }
  /// Shown, never edited. A value the record implies rather than stores.
  | { kind: "readonly"; name: string; label: string; hint?: string; text: string }
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
  icon,
  fields,
  columns = 1,
  identity,
  sections,
  action,
  values,
  trigger,
  submitLabel = "Save",
  destructive,
  reason: reasonAsked,
  size = "md",
}: {
  title: string;
  description?: string;
  /// Shown left of the title, as the prototype's drawer head has it.
  icon?: ReactNode;
  fields: Field[];
  /// Two lays the inputs out in the prototype's `.grid.g2`; one keeps the stack.
  columns?: 1 | 2;
  /// Rendered above the fields — the avatar and email row on a person.
  identity?: ReactNode;
  /// Rendered below the fields. Read-only sections the record implies rather than
  /// sets: what a role grants, who is covering. Composed by the caller so it can
  /// match the sample's markup exactly instead of through an abstraction.
  sections?: ReactNode;
  action: SaveAction;
  /// Current values, when editing. Absent means a new record and empty inputs.
  values?: Record<string, string | boolean | null>;
  trigger: { label: string; className?: string; icon?: boolean; iconOnly?: ReactNode };
  submitLabel?: string;
  /// Requires a reason before the button enables, and turns the button red. For an
  /// act that takes something away.
  destructive?: { reasonLabel: string };
  /// Requires a reason without the act being destructive.
  reason?: { label: string };
  /// Drawer width. The form opens from the right, as the prototype does.
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLElement>(null);
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

  // Nobody is signed in, so where a reason is asked for it is the only account of
  // why the change was made, whichever direction the change goes.
  const asksReason = destructive ? { label: destructive.reasonLabel } : reasonAsked;
  const blocked = asksReason != null && reason.trim().length === 0;

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={trigger.className ?? (trigger.iconOnly ? "iconbtn iconbtn--sm" : "btn btn--sm")}
        aria-label={trigger.iconOnly ? trigger.label : undefined}
        title={trigger.iconOnly ? trigger.label : undefined}
        onClick={() => {
          setState(EMPTY_FORM_STATE);
          setOpen(true);
        }}
      >
        {trigger.icon && <PlusIcon size={15} />}
        {trigger.iconOnly ?? trigger.label}
      </button>

      {open && (
        <div
          className="scrim scrim--right"
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            className={`drawer${size === "md" ? "" : ` drawer--${size}`}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={dialog}
          >
            {/* The drawer is the flex column that .ov__body scrolls inside, but the
                form sits between them — so it has to carry the column too. Without
                this the body has no height to scroll within and long forms are cut
                off with no scrollbar. */}
            <form
              action={submit}
              style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0 }}
            >
              <div className="ov__head">
                {icon}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="h2 trunc">{title}</div>
                  </div>
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
                <div className={columns === 2 ? "stack stack--lg" : "stack stack--md"}>
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

                  {identity}
                  {identity && <div className="divider" />}

                  {/* Hidden inputs carry no layout, so they stay outside the grid —
                      inside it each one would take a cell and offset the pairs. */}
                  {fields
                    .filter((f) => f.kind === "hidden")
                    .map((field) => (
                      <input
                        key={field.name}
                        type="hidden"
                        name={field.name}
                        value={String(values?.[field.name] ?? "")}
                      />
                    ))}

                  <FieldSet columns={columns}>
                    {fields
                      .filter((f) => f.kind !== "hidden")
                      .map((field) =>
                        field.kind === "note" ? (
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
                  </FieldSet>

                  {sections}

                  {asksReason && (
                    <label className="field">
                      <span className="field__lbl">
                        {asksReason.label} <span className="field__req">*</span>
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
                <div className="spacer" />
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${destructive ? "btn--danger" : "btn--primary"}`}
                  disabled={pending || blocked}
                >
                  {!destructive && <SaveIcon size={15} />}
                  {pending ? "Saving…" : submitLabel}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * Several values at once, as the sample's token field has them: chosen ones sit as
 * removable tags inside the box, and what is left drops down below it.
 *
 * The values ride out on one hidden input, newline-separated — a comma can appear in
 * a customer's own code, a newline cannot — because a server action
 * reading a form has no way to tell an absent multi-value from an empty one — and
 * "nothing was delegated" and "the whole role was" are different acts here.
 */
function TokensInput({
  field,
  value,
}: {
  field: Extract<Field, { kind: "tokens" }>;
  value: string;
}) {
  const [chosen, setChosen] = useState<string[]>(() =>
    value ? value.split("\n").filter(Boolean) : [],
  );
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const labelOf = (v: string) => field.options.find((o) => o.value === v)?.label ?? v;
  const needle = typed.trim().toLowerCase();
  const available = field.options.filter(
    (o) => !chosen.includes(o.value) && (!needle || o.label.toLowerCase().includes(needle)),
  );

  return (
    <div className="combo">
      <input type="hidden" name={field.name} value={chosen.join("\n")} />
      <div className="tokens" role="group" onClick={() => setOpen(true)}>
        {chosen.map((v) => (
          <span key={v} className="tag">
            {labelOf(v)}
            <button
              type="button"
              className="tag__x"
              aria-label={`Remove ${labelOf(v)}`}
              onClick={(e) => {
                e.stopPropagation();
                setChosen((c) => c.filter((x) => x !== v));
              }}
            >
              <XIcon size={11} />
            </button>
          </span>
        ))}
        <input
          className="grow"
          style={{
            border: 0,
            outline: "none",
            minWidth: 90,
            height: 26,
            fontSize: "13.5px",
            background: "transparent",
          }}
          placeholder={chosen.length ? "" : (field.placeholder ?? "Select…")}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
      </div>
      {open && (
        <div className="combo__menu">
          {available.length === 0 ? (
            <div className="combo__empty">Nothing left to choose</div>
          ) : (
            available.map((o) => (
              <button
                key={o.value}
                type="button"
                className="combo__opt"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setChosen((c) => [...c, o.value]);
                  setTyped("");
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The inputs, laid out.
 *
 * One column stays a Fragment rather than a wrapper: the fields are direct children
 * of `.stack`, and a div between them would swallow its gap.
 */
function FieldSet({ columns, children }: { columns: 1 | 2; children: ReactNode }) {
  if (columns === 1) return <>{children}</>;
  return (
    <div className="grid g2" style={{ gap: 14 }}>
      {children}
    </div>
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
      {field.label}
      {required && (
        <span className="field__req" aria-hidden="true">
          *
        </span>
      )}
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
    // The sample's toggle: a track and knob, not a tick box.
    return (
      <label className="switch">
        <input type="checkbox" role="switch" name={field.name} defaultChecked={value === true} />
        <span className="switch__track">
          <span className="switch__knob" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="check__txt">{field.label}</span>
          {hint && <span className="check__hint">{hint}</span>}
        </span>
      </label>
    );
  }

  if (field.kind === "readonly") {
    return (
      <div className="field">
        {label}
        <span className="sm" style={{ paddingTop: 6 }}>
          {field.text}
        </span>
        {foot}
      </div>
    );
  }

  if (field.kind === "tokens") {
    return (
      <div className="field">
        {label}
        <TokensInput field={field} value={(value as string) ?? ""} />
        {foot}
      </div>
    );
  }

  if (field.kind === "select") {
    const current = (value as string) ?? "";
    // A stored value the options no longer offer would leave the select on its
    // placeholder, and saving an untouched form would then clear it. Carrying it as
    // its own option means the form can put back what it found.
    const orphaned = current !== "" && !field.options.some((o) => o.value === current);

    return (
      <label className="field">
        {label}
        <select className="select" name={field.name} defaultValue={current}>
          <option value="">{field.placeholder ?? "Not set"}</option>
          {orphaned && <option value={current}>{field.orphanLabel ?? current}</option>}
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
