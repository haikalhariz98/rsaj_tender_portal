"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { CodeDialog } from "@/components/auth/code-dialog";
import { EMPTY_FORM_STATE, RecordEditor } from "@/components/record-editor";
import { LockIcon } from "@/components/icons";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";

import { issueSupplierCodeAction, openSupplierAccountAction, retireContactAction, setContractorSignerAction, unlockSupplierAccountAction, type SupplierCodeState } from "../account-actions";

/**
 * The drawers of a supplier's portal account on the supplier's page (Phase 4a, ADR 0034 D6): open it for a contact, issue the one-time code that activates it or resets its
 * password, unlock it, and retire a contact. The officer says how the caller's identity was checked, every time: it is what stops a stranger from taking over a rival's account by
 * asking for a code. A code is shown here once and nowhere else (the dialog is the staff accounts' own: `CodeDialog`), and leaves the screen with it.
 */

const IDENTITY_HINT = "For example: seen at the counter with their identity card, or called back on the number on the registration certificate. It is kept with the code and in the record.";

type Asks = { name: string; label: string; required?: boolean; hint?: string };

/// The dialog that asks (a sign-in name, how identity was checked) and then shows a code, once.
function CodeAsker({
  trigger,
  label,
  title,
  subtitle,
  submitLabel,
  hidden,
  asks,
  action,
  notice,
}: {
  trigger: string;
  label: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  hidden: Record<string, string>;
  asks: Asks[];
  action: (prev: SupplierCodeState, data: FormData) => Promise<SupplierCodeState>;
  /// Said beside the code once it is shown.
  notice?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SupplierCodeState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const close = () => {
    // The act did not revalidate the page (it would have unmounted this dialog, and the code with it): the page is refreshed now the code has been read.
    if (state.issued) router.refresh();
    // The code leaves the screen with the dialog.
    setState(EMPTY_FORM_STATE);
    setOpen(false);
    opener.current?.focus();
  };
  return (
    <>
      <button type="button" ref={opener} className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <CodeDialog label={label} title={title} subtitle={subtitle} shown={state.issued ? { code: state.issued.code, validUntil: state.issued.validUntil, notice } : null} onClose={close}>
          <form
            className="flex flex-col gap-4 px-6 py-5"
            onSubmit={(e) => {
              const data = formDataOf(e);
              start(async () => setState(await action(EMPTY_FORM_STATE, data)));
            }}
          >
            {state.message && <Callout tone="err">{state.message}</Callout>}
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {asks.map((a) => (
              <Field key={a.name} label={a.label} htmlFor={a.name} required={a.required} hint={a.hint} error={state.errors?.[a.name]}>
                <Input id={a.name} name={a.name} disabled={pending} autoComplete="off" />
              </Field>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Working…" : submitLabel}
              </Button>
            </div>
          </form>
        </CodeDialog>
      )}
    </>
  );
}

export function OpenPortalAccount({ supplierId, contactId, name, suggestedLoginName }: { supplierId: string; contactId: string; name: string; suggestedLoginName: string }) {
  return (
    <CodeAsker
      trigger="Open portal account"
      label={`Open ${name}'s portal account`}
      title={`Open ${name}'s portal account`}
      subtitle="Gives portal sign-in. You pass on the code."
      submitLabel="Open and issue code"
      hidden={{ supplierId, contactId }}
      asks={[
        { name: "loginName", label: "Sign-in name", required: true, hint: `3 to 64: letters, digits, ._-@${suggestedLoginName ? ` E.g. ${suggestedLoginName}` : ""}` },
        { name: "identityCheck", label: "How the caller's identity was checked", required: true, hint: IDENTITY_HINT },
      ]}
      action={openSupplierAccountAction}
      notice="Give them their sign-in name as well. They activate the account on the portal's activation page and choose a password of their own."
    />
  );
}

export function IssueSupplierCode({ supplierId, accountId, name, purpose }: { supplierId: string; accountId: string; name: string; purpose: "ACTIVATION" | "RESET" }) {
  const activation = purpose === "ACTIVATION";
  return (
    <CodeAsker
      trigger={activation ? "Issue activation code" : "Issue reset code"}
      label={`${activation ? "Activation" : "Reset"} code for ${name}`}
      title={`${activation ? "Activation" : "Reset"} code for ${name}`}
      subtitle={activation ? "Lets them choose their first password." : "Lets them choose a new password. Issuing it ends every sign-in of theirs now."}
      submitLabel="Issue code"
      hidden={{ supplierId, accountId, purpose }}
      asks={[{ name: "identityCheck", label: "How the caller's identity was checked", required: true, hint: IDENTITY_HINT }]}
      action={issueSupplierCodeAction}
    />
  );
}

export function UnlockSupplierAccount({ supplierId, accountId, name }: { supplierId: string; accountId: string; name: string }) {
  return (
    <RecordEditor
      title={`Unlock ${name}'s portal account`}
      description="Clears wrong-password counts and ends the lock now. Check who is asking."
      fields={[
        { kind: "hidden", name: "supplierId" },
        { kind: "hidden", name: "accountId" },
        { kind: "text", name: "identityCheck", label: "How the caller's identity was checked", required: true, hint: IDENTITY_HINT },
      ]}
      values={{ supplierId, accountId }}
      action={unlockSupplierAccountAction}
      submitLabel="Unlock"
      trigger={{ label: "Unlock", iconOnly: <LockIcon size={15} />, ariaLabel: `Unlock ${name}'s portal account` }}
      size="sm"
    />
  );
}

export function RetireContact({ supplierId, contactId, name }: { supplierId: string; contactId: string; name: string }) {
  return (
    <RecordEditor
      title={`Stop using ${name}`}
      description="Removes them from contacts. Their portal account is disabled."
      fields={[{ kind: "hidden", name: "supplierId" }, { kind: "hidden", name: "contactId" }]}
      values={{ supplierId, contactId }}
      action={retireContactAction}
      submitLabel="Stop using"
      reason={{ label: "Why is this contact being retired?" }}
      trigger={{ label: "Stop using", className: buttonClass("ghost", "sm"), ariaLabel: `Stop using ${name}` }}
      size="sm"
    />
  );
}

/// Whether this contact may sign for the contractor's company from the portal (decisions log, 2026-10-09, ruling on 1928(3)). An officer sets it, with a reason; it is audited. Not decided refuses.
export function SetContractorSigner({ supplierId, contactId, name, mark }: { supplierId: string; contactId: string; name: string; mark: boolean | null }) {
  return (
    <RecordEditor
      title={`Who signs for the contractor: ${name}`}
      description="Only a marked contact may sign the contractor's certificate blocks. Refused until decided."
      fields={[
        { kind: "hidden", name: "supplierId" },
        { kind: "hidden", name: "contactId" },
        { kind: "select", name: "mark", label: "May sign for the contractor's company", options: [{ value: "yes", label: "Yes: authorised to sign for the company" }, { value: "no", label: "No: does not sign for the company" }, { value: "unset", label: "Not decided" }], required: true },
      ]}
      values={{ supplierId, contactId, mark: mark == null ? "unset" : mark ? "yes" : "no" }}
      action={setContractorSignerAction}
      submitLabel="Save"
      reason={{ label: "Why is this being recorded?" }}
      trigger={{ label: "Who signs", className: buttonClass("ghost", "sm"), ariaLabel: `Who signs for the contractor: ${name}` }}
      size="sm"
    />
  );
}
