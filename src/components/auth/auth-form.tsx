"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { EMPTY_FORM_STATE, type FormState, type SaveAction } from "@/components/record-editor";
import { ArrowRight, EyeIcon, EyeOffIcon, LockIcon, SpinnerIcon, UserIcon } from "@/components/icons";
import { Button, IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { AUTH_WORDS } from "@/lib/auth/words";

import { withoutError } from "./form-errors";

/**
 * The form of the sign-in screens and the account page: a few text or password fields, one button, the action's answer.
 *
 * Fields are data, as in RecordEditor, so a server component declares them beside the action that reads them. Nothing is pre-filled. A
 * refused attempt keeps what was typed, except a password, which is cleared (a wrong one is not worth leaving on the screen). Where the
 * action answers with `href` the form goes there; otherwise a success message is shown and the form is emptied.
 *
 * What a field was refused for is said until the field is changed, and not a moment longer: any `input` event on it clears that one answer, and a browser's
 * autofill fires the same event, so a name filled in after a refusal does not sit beside "needed". What is posted is always read from the fields themselves at
 * the moment of submitting (never from a copy held here), so a value a browser filled in is the value sent.
 *
 * While an attempt is in flight the fields are read-only and the button is `aria-disabled`, never `disabled`: a disabled control gives up focus, and the
 * keyboard user who pressed Enter would find it back at the top of the page. When a refusal lands, focus goes to the first field it names (in the order the
 * fields are declared), or to the message when it names none. The form says `method="post"`, so a submit before the page's script has run can never put
 * what was typed into the address.
 *
 * A password field may carry a show/hide button (`reveal`). It never submits, never moves focus, is never remembered, and goes back to hidden on
 * every submit (its name stays "Show password" and `aria-pressed` says which way it is, as a toggle button's does; only the hover tip switches); and because a shown password is a text input, the clearing after an answer goes by the declared password fields, not by input type.
 */

const FIELD_ICON = { person: UserIcon, lock: LockIcon } as const;

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete?: string;
  hint?: string;
  mono?: boolean;
  autoFocus?: boolean;
  /// A small picture inside the box, on the left.
  icon?: keyof typeof FIELD_ICON;
  /// A password field only: a button inside the box that shows or hides what is typed.
  reveal?: boolean;
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  footer,
  submitArrow,
}: {
  action: SaveAction;
  fields: AuthField[];
  submitLabel: string;
  /// No longer shown: the button keeps its own label while it works and draws a spinner beside it. Accepted so the callers need not change.
  busyLabel?: string;
  footer?: ReactNode;
  /// An arrow after the submit label (drawn as a picture, not as text).
  submitArrow?: boolean;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();
  /// Which password fields are being shown, by name. Held here only: never stored, and emptied on every submit.
  const [shown, setShown] = useState<Record<string, boolean>>({});
  /// Counts the answers that wanted the reader's attention. Not `state`, which a keystroke also changes: focus moves when an answer lands, never when a field is edited.
  const [answered, setAnswered] = useState(0);
  const message = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (answered === 0) return;
    const named = fields.find((f) => state.errors?.[f.name]);
    const target = named ? form.current?.querySelector<HTMLInputElement>(`input[name="${named.name}"]`) : message.current;
    target?.focus();
    // Only a new answer moves focus; the fields and the answer are read as they were when it landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  const submit = (data: FormData) => {
    // Enter still submits a read-only form: one attempt at a time.
    if (pending) return;
    setShown({});
    start(async () => {
      const result = await action(EMPTY_FORM_STATE, data);
      setState(result);
      if (!result.ok) setAnswered((n) => n + 1);
      // A password is never left in a field after an answer, right or wrong.
      for (const f of fields) if (f.type === "password") form.current?.querySelectorAll<HTMLInputElement>(`input[name="${f.name}"]`).forEach((input) => (input.value = ""));
      if (result.ok && result.href) {
        router.replace(result.href);
        router.refresh();
      } else if (result.ok) {
        form.current?.reset();
      }
    });
  };

  return (
    <form
      ref={form}
      method="post"
      onSubmit={(e) => submit(formDataOf(e))}
      onInput={(e) => {
        const name = (e.target as HTMLInputElement).name;
        if (name) setState((prev) => withoutError(prev, name));
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      {state.message && (
        // Keyed by the attempt, so a second identical refusal is a new alert and is read again.
        <div key={answered} ref={message} tabIndex={-1} className="mb-1 rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
          <Callout tone={state.ok ? "ok" : "err"}>{state.message}</Callout>
        </div>
      )}
      {fields.map((f) => {
        const Icon = f.icon ? FIELD_ICON[f.icon] : null;
        const visible = !!f.reveal && !!shown[f.name];
        return (
          <Field key={f.name} label={f.label} htmlFor={f.name} hint={f.hint} error={state.errors?.[f.name]}>
            <Input
              id={f.name}
              name={f.name}
              type={f.type === "password" && visible ? "text" : (f.type ?? "text")}
              autoComplete={f.autoComplete}
              mono={f.mono}
              autoFocus={f.autoFocus}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              readOnly={pending}
              icon={Icon ? <Icon size={16} /> : undefined}
              trailing={
                f.reveal && f.type === "password" ? (
                  <IconButton size="sm" touchTarget label={AUTH_WORDS.showPassword.en} aria-pressed={visible} aria-disabled={pending || undefined} onClick={() => !pending && setShown((prev) => ({ ...prev, [f.name]: !prev[f.name] }))}>
                    {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </IconButton>
                ) : undefined
              }
            />
          </Field>
        );
      })}
      <Button type="submit" variant="primary" size="lg" block aria-disabled={pending || undefined} aria-busy={pending || undefined} className="mt-1 aria-disabled:opacity-100!">
        {submitLabel}
        {pending ? <SpinnerIcon size={18} /> : submitArrow && <ArrowRight size={18} />}
      </Button>
      {footer}
    </form>
  );
}
