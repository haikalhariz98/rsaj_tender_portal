"use client";

import { useRef, useState, useTransition } from "react";

import { LockIcon } from "@/components/icons";
import { CodeDialog } from "@/components/auth/code-dialog";
import { EMPTY_FORM_STATE, RecordEditor } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";

import { createAccountAction, disableAccountAction, enableAccountAction, issueCodeAction, unlockAccountAction, type IssueCodeState } from "./actions";

/**
 * The acts on the accounts screen. Each is a shared editor (a drawer that asks, a reason where the act needs one) except issuing a code, which has
 * something to show once afterwards and so keeps its own small dialog open to show it.
 */

export function CreateAccount({ people }: { people: { id: string; name: string; jobTitle: string | null }[] }) {
  return (
    <RecordEditor
      title="Create a sign-in account"
      description="For a person already on record. The account waits for an activation code: nobody can sign in with it until you issue one and hand it over."
      fields={[
        {
          kind: "select",
          name: "personId",
          label: "Person",
          required: true,
          placeholder: people.length === 0 ? "Everyone on record has an account" : "Choose",
          options: people.map((p) => ({ value: p.id, label: p.jobTitle ? `${p.name} · ${p.jobTitle}` : p.name })),
        },
        { kind: "text", name: "loginName", label: "Sign-in name", required: true, mono: true, hint: "3 to 64 characters: letters, digits and . _ - @, starting with a letter or digit. Not case-sensitive." },
        { kind: "note", text: "An account made here is an ordinary one. Administrators are made on the server (npm run auth:bootstrap), never from a screen." },
      ]}
      action={createAccountAction}
      submitLabel="Create account"
      trigger={{ label: "Create account", icon: true }}
    />
  );
}

export function DisableAccount({ accountId, name, loginName }: { accountId: string; name: string; loginName: string }) {
  return (
    <RecordEditor
      title={`Disable ${name}'s account`}
      description={`${loginName} will be signed out everywhere at once, and cannot sign in again until the account is put back.`}
      fields={[{ kind: "hidden", name: "accountId" }]}
      values={{ accountId }}
      action={disableAccountAction}
      submitLabel="Disable"
      destructive={{ reasonLabel: "Why is it being disabled?" }}
      trigger={{ label: "Disable", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function EnableAccount({ accountId, name }: { accountId: string; name: string }) {
  return (
    <RecordEditor
      title={`Put ${name}'s account back`}
      description="It returns to waiting for activation: issue a new code, and the person chooses a password of their own."
      fields={[{ kind: "hidden", name: "accountId" }]}
      values={{ accountId }}
      action={enableAccountAction}
      submitLabel="Put back"
      reason={{ label: "Why is it being put back?" }}
      trigger={{ label: "Put back", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function UnlockAccount({ accountId, name }: { accountId: string; name: string }) {
  return (
    <RecordEditor
      title={`Unlock ${name}'s account`}
      description="Clears the wrong passwords counted against it and ends the lock now."
      fields={[{ kind: "hidden", name: "accountId" }]}
      values={{ accountId }}
      action={unlockAccountAction}
      submitLabel="Unlock"
      reason={{ label: "Why is it being unlocked?" }}
      trigger={{ label: "Unlock", iconOnly: <LockIcon size={15} /> }}
      size="sm"
    />
  );
}

/**
 * Issue a one-time code. The answer is the code, shown here once and nowhere else: it is not in the address, not on the page behind, and not in the trail
 * (only its hash is stored). Closing the dialog is the end of it. To hand it over, read it out or write it down, then close.
 */
export function IssueCode({
  accountId,
  name,
  purpose,
}: {
  accountId: string;
  name: string;
  purpose: "ACTIVATION" | "RESET";
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<IssueCodeState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);
  const activation = purpose === "ACTIVATION";

  const close = () => {
    // The code leaves the screen with the dialog.
    setState(EMPTY_FORM_STATE);
    setOpen(false);
    opener.current?.focus();
  };

  return (
    <>
      <button type="button" ref={opener} className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
        {activation ? "Issue activation code" : "Issue reset code"}
      </button>
      {open && (
        <CodeDialog
          label={activation ? `Activation code for ${name}` : `Reset code for ${name}`}
          title={activation ? `Activation code for ${name}` : `Reset code for ${name}`}
          subtitle={activation ? "Lets them choose their first password." : "Lets them choose a new password. Their current one keeps working until they use it."}
          shown={state.issued ? { code: state.issued.code, validUntil: state.issued.validUntil } : null}
          onClose={close}
        >
          <form
            className="flex flex-col gap-4 px-6 py-5"
            onSubmit={(e) => {
              const data = formDataOf(e);
              start(async () => setState(await issueCodeAction(EMPTY_FORM_STATE, data)));
            }}
          >
            {state.message && <Callout tone="err">{state.message}</Callout>}
            <input type="hidden" name="accountId" value={accountId} />
            <input type="hidden" name="purpose" value={purpose} />
            <Field label="Why is it being issued?" htmlFor="reason" required error={state.errors?.reason}>
              <Textarea id="reason" name="reason" rows={3} disabled={pending} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Issuing…" : "Issue code"}
              </Button>
            </div>
          </form>
        </CodeDialog>
      )}
    </>
  );
}
