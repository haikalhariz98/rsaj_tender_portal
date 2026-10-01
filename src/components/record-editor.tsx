"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { PlusIcon, SaveIcon } from "@/components/icons";
import { buttonClass, iconButtonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, FileInput, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { splitValues } from "@/lib/ui/select-logic";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";

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
      /// A disabled option is shown greyed with its reason in the label, not hidden:
      /// the officer sees it exists and why it cannot be chosen.
      options: { value: string; label: string; disabled?: boolean }[];
      /// Shown as the unchosen option. Never pre-selects anything.
      placeholder?: string;
      /// The unchosen option is shown but cannot be chosen: a value, once set, is not
      /// taken back to empty. Say why in `placeholder`, as a disabled option does.
      placeholderDisabled?: boolean;
      /// How a stored value that is no longer among the options reads. Without it the
      /// value itself is shown, which is right where the value is already a label and
      /// wrong where it is a code.
      orphanLabel?: string;
    }
  | { kind: "switch"; name: string; label: string; hint?: string }
  /// A file chosen from the officer's device, on the shared FileInput. It rides out in the
  /// form's data as a File: the action that reads it is a client function that sends it
  /// where a body of that size can go (never a Server Action, which caps a body at 1 MB).
  | { kind: "file"; name: string; label: string; required?: boolean; hint?: string; accept?: string }
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

/// Show a field only while another select of the same form holds one of the given
/// values — the bond's reason while "no bond", its percentage while "a bond". A hidden
/// field still submits what it holds; the action decides what a value means.
export type ShowWhen = { name: string; in: readonly string[] };

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
  cancelLabel = "Cancel",
  showWhen,
  destructive,
  reason: reasonAsked,
  size = "md",
  defaultOpen = false,
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
  trigger: { label: string; className?: string; icon?: boolean; iconOnly?: ReactNode; /// A longer name for a screen reader where the visible label is short and repeated down a list.
    ariaLabel?: string };
  submitLabel?: string;
  /// The footer's dismiss button. A destructive act says what dismissing keeps ("Keep the award").
  cancelLabel?: string;
  /// Per field name, when it is shown (see `ShowWhen`).
  showWhen?: Record<string, ShowWhen>;
  /// Requires a reason before the button enables, and turns the button red. For an
  /// act that takes something away.
  destructive?: { reasonLabel: string };
  /// Requires a reason without the act being destructive.
  reason?: { label: string };
  /// Drawer width. The form opens from the right, as the prototype does.
  size?: "sm" | "md" | "lg" | "xl";
  /// Opens on arrival — for a link from another record that asks for this act with
  /// its fields filled in (an award's committee step tabling its matter).
  defaultOpen?: boolean;
}) {
  const [open, setOpenState] = useState(defaultOpen);
  // Closing forgets what the officer chose in the selects that drive `showWhen`: the
  // form reopens from the stored values.
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) setLive({});
  };
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // The selects that decide which fields show, as the officer changes them.
  const [live, setLive] = useState<Record<string, string>>({});
  const current = (name: string) => live[name] ?? String(values?.[name] ?? "");
  const shown = (name: string) => {
    const w = showWhen?.[name];
    return !w || w.in.includes(current(w.name));
  };

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
    dialog.current?.querySelector<HTMLElement>("input:not([tabindex='-1']),[role=combobox],textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Nobody is signed in, so where a reason is asked for it is the only account of
  // why the change was made, whichever direction the change goes.
  const asksReason = destructive ? { label: destructive.reasonLabel } : reasonAsked;
  const blocked = asksReason != null && reason.trim().length === 0;
  const placed = new Set(fields.filter((f) => f.kind !== "hidden" && "name" in f).map((f) => (f as { name: string }).name));
  if (asksReason) placed.add("reason");
  const unplaced = Object.entries(state.errors ?? {})
    .filter(([k]) => !placed.has(k))
    .map(([, v]) => v);

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={
          trigger.className ?? (trigger.iconOnly ? iconButtonClass("sm") : buttonClass("secondary", "sm"))
        }
        aria-label={trigger.iconOnly ? trigger.label : trigger.ariaLabel}
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
          className={DRAWER_SCRIM}
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            className={drawerPanelClass(size)}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={dialog}
          >
            {/* The form is the flex column the body scrolls inside; without it the body
                has no height to scroll within and long forms are cut off. */}
            <form
              onSubmit={(e) => submit(formDataOf(e))}
              onChange={(e) => {
                const t = e.target as unknown as HTMLSelectElement;
                if (showWhen && t.name && Object.values(showWhen).some((w) => w.name === t.name)) setLive((x) => ({ ...x, [t.name]: t.value }));
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <DrawerHeader
                icon={icon}
                title={title}
                subtitle={description}
                onClose={() => setOpen(false)}
              />

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-5">
                  {state.message && <Callout tone="err">{state.message}</Callout>}
                  {/* A refusal on a field this form does not show is still shown: never
                      a save that fails with nothing said (6.3 re-review). */}
                  {unplaced.length > 0 && <Callout tone="err">{unplaced.join(" ")}</Callout>}

                  {identity}
                  {identity && <hr className="border-line" />}

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

                  {/* One column is a stack, not a one-column grid: a wide field's col-span would
                      otherwise conjure a second, content-sized column beside it. */}
                  <div className={columns === 2 ? "grid gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>
                    {fields
                      .filter((f) => f.kind !== "hidden")
                      .map((field) =>
                        field.kind === "note" ? (
                          <p
                            key={field.text}
                            className="rounded-xl bg-sunken px-3.5 py-2.5 text-[13px] text-ink-2 sm:col-span-2"
                          >
                            {field.text}
                          </p>
                        ) : (
                          // `contents` keeps the field in the form's grid exactly as it would sit
                          // unwrapped. A hidden field's fieldset is disabled: it is not submitted and
                          // not required, so the action leaves its stored value alone.
                          <fieldset key={field.name} disabled={!shown(field.name)} className={shown(field.name) ? "contents" : "hidden"}>
                            <FieldInput field={field} value={values?.[field.name] ?? null} error={state.errors?.[field.name]} />
                          </fieldset>
                        ),
                      )}
                  </div>

                  {sections}

                  {asksReason && (
                    <Field
                      label={asksReason.label}
                      required
                      htmlFor="record-reason"
                      hint="Recorded in the audit trail. Nobody is signed in, so this is the only account of why the change was made."
                      error={state.errors?.reason}
                    >
                      <Textarea
                        id="record-reason"
                        name="reason"
                        rows={2}
                        className="min-h-16"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </Field>
                  )}
                </div>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
                <button type="button" className={buttonClass("ghost", "md")} onClick={() => setOpen(false)}>
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  className={buttonClass(destructive ? "danger" : "primary", "md")}
                  disabled={pending || blocked}
                >
                  {!destructive && <SaveIcon size={15} />}
                  {pending ? "Saving…" : submitLabel}
                </button>
              </footer>
            </form>
          </aside>
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
  const id = `field-${field.name}`;

  if (field.kind === "switch") {
    return (
      <div className="sm:col-span-2">
        <Switch name={field.name} defaultChecked={value === true} label={field.label} description={hint} />
        {error && <p className="mt-1.5 text-[12.5px] font-medium text-rose-600">{error}</p>}
      </div>
    );
  }

  if (field.kind === "file") {
    return (
      <Field label={field.label} required={required} htmlFor={id} hint={hint} error={error} className="sm:col-span-2">
        <FileInput id={id} name={field.name} accept={field.accept} aria-invalid={error ? true : undefined} />
      </Field>
    );
  }

  if (field.kind === "readonly") {
    return (
      <Field label={field.label} hint={hint} error={error}>
        <div className="flex h-10 items-center rounded-control bg-sunken px-3.5 text-[14px] text-ink-2">
          {field.text}
        </div>
      </Field>
    );
  }

  if (field.kind === "tokens") {
    // Several values at once, on the shared Select: the chosen ones ride out as ONE
    // newline-joined field (splitValues reads it back) - a comma can appear in a
    // customer's own code, a newline cannot, and a server action reading a form cannot
    // tell an absent multi-value from an empty one.
    return (
      <Field label={field.label} required={required} htmlFor={id} hint={hint} error={error}>
        <Select
          multiple
          id={id}
          name={field.name}
          placeholder={field.placeholder ?? "Select…"}
          defaultValue={splitValues(value as string)}
          aria-invalid={error ? true : undefined}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === "select") {
    const current = (value as string) ?? "";
    // A stored value the options no longer offer would leave the select on its
    // placeholder, and saving an untouched form would then clear it. Carrying it as
    // its own option means the form can put back what it found.
    const orphaned = current !== "" && !field.options.some((o) => o.value === current);

    return (
      <Field label={field.label} required={required} htmlFor={id} hint={hint} error={error}>
        <Select id={id} name={field.name} defaultValue={current} aria-invalid={error ? true : undefined}>
          <option value="" disabled={field.placeholderDisabled && current !== ""}>{field.placeholder ?? "Not set"}</option>
          {orphaned && <option value={current}>{field.orphanLabel ?? current}</option>}
          {field.options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === "textarea") {
    return (
      <Field label={field.label} htmlFor={id} hint={hint} error={error} className="sm:col-span-2">
        <Textarea
          id={id}
          name={field.name}
          rows={3}
          placeholder={field.placeholder}
          defaultValue={(value as string) ?? ""}
          aria-invalid={error ? true : undefined}
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} required={required} htmlFor={id} hint={hint} error={error}>
      {field.kind === "money" ? (
        <AffixInput
          id={id}
          prefix="RM"
          name={field.name}
          inputMode="decimal"
          defaultValue={(value as string) ?? ""}
          aria-invalid={error ? true : undefined}
          className="[&_input]:text-right"
        />
      ) : (
        <Input
          id={id}
          type={field.kind === "date" ? "date" : "text"}
          name={field.name}
          mono={field.kind === "text" && field.mono}
          numeric={field.kind === "number"}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          placeholder={"placeholder" in field ? field.placeholder : undefined}
          defaultValue={(value as string) ?? ""}
          aria-invalid={error ? true : undefined}
        />
      )}
    </Field>
  );
}
