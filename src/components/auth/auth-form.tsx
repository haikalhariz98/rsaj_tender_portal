"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { EMPTY_FORM_STATE, type FormState, type SaveAction } from "@/components/record-editor";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";

/**
 * The form of the sign-in screens and the account page: a few text or password fields, one button, the action's answer.
 *
 * Fields are data, as in RecordEditor, so a server component declares them beside the action that reads them. Nothing is pre-filled. A
 * refused attempt keeps what was typed, except a password, which is cleared (a wrong one is not worth leaving on the screen). Where the
 * action answers with `href` the form goes there; otherwise a success message is shown and the form is emptied.
 */

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete?: string;
  hint?: string;
  mono?: boolean;
  autoFocus?: boolean;
}

export function AuthForm({ action, fields, submitLabel, busyLabel, footer }: { action: SaveAction; fields: AuthField[]; submitLabel: string; busyLabel?: string; footer?: ReactNode }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();

  const submit = (data: FormData) =>
    start(async () => {
      const result = await action(EMPTY_FORM_STATE, data);
      setState(result);
      // A password is never left in a field after an answer, right or wrong.
      form.current?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => (input.value = ""));
      if (result.ok && result.href) {
        router.replace(result.href);
        router.refresh();
      } else if (result.ok) {
        form.current?.reset();
      }
    });

  return (
    <form ref={form} onSubmit={(e) => submit(formDataOf(e))} noValidate className="flex flex-col gap-4">
      {state.message && (
        <Callout tone={state.ok ? "ok" : "err"} className="mb-1">
          {state.message}
        </Callout>
      )}
      {fields.map((f) => (
        <Field key={f.name} label={f.label} htmlFor={f.name} hint={f.hint} error={state.errors?.[f.name]}>
          <Input id={f.name} name={f.name} type={f.type ?? "text"} autoComplete={f.autoComplete} mono={f.mono} autoFocus={f.autoFocus} spellCheck={false} autoCapitalize="none" disabled={pending} />
        </Field>
      ))}
      <Button type="submit" variant="primary" size="lg" block disabled={pending} className="mt-1">
        {pending ? (busyLabel ?? submitLabel) : submitLabel}
      </Button>
      {footer}
    </form>
  );
}
