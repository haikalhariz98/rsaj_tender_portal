"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { EMPTY_FORM_STATE, type FormState, type SaveAction } from "@/components/record-editor";
import { ArrowRight, EyeIcon, EyeOffIcon, LockIcon, UserIcon } from "@/components/icons";
import { Button, IconButton } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { AUTH_WORDS } from "@/lib/auth/words";

/**
 * The form of the sign-in screens and the account page: a few text or password fields, one button, the action's answer.
 *
 * Fields are data, as in RecordEditor, so a server component declares them beside the action that reads them. Nothing is pre-filled. A
 * refused attempt keeps what was typed, except a password, which is cleared (a wrong one is not worth leaving on the screen). Where the
 * action answers with `href` the form goes there; otherwise a success message is shown and the form is emptied.
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
  busyLabel,
  footer,
  submitArrow,
}: {
  action: SaveAction;
  fields: AuthField[];
  submitLabel: string;
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

  const submit = (data: FormData) => {
    setShown({});
    start(async () => {
      const result = await action(EMPTY_FORM_STATE, data);
      setState(result);
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
    <form ref={form} onSubmit={(e) => submit(formDataOf(e))} noValidate className="flex flex-col gap-4">
      {state.message && (
        <Callout tone={state.ok ? "ok" : "err"} className="mb-1">
          {state.message}
        </Callout>
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
              disabled={pending}
              icon={Icon ? <Icon size={16} /> : undefined}
              trailing={
                f.reveal && f.type === "password" ? (
                  <IconButton size="sm" touchTarget label={AUTH_WORDS.showPassword.en} title={visible ? AUTH_WORDS.hidePassword.en : AUTH_WORDS.showPassword.en} aria-pressed={visible} onClick={() => setShown((prev) => ({ ...prev, [f.name]: !prev[f.name] }))}>
                    {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </IconButton>
                ) : undefined
              }
            />
          </Field>
        );
      })}
      <Button type="submit" variant="primary" size="lg" block disabled={pending} className="mt-1">
        {pending ? (busyLabel ?? submitLabel) : submitLabel}
        {submitArrow && !pending && <ArrowRight size={18} />}
      </Button>
      {footer}
    </form>
  );
}
