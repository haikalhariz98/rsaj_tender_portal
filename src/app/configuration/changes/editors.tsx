"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ActAttributionFields } from "@/components/act-attribution-fields";
import { CodeDialog } from "@/components/auth/code-dialog";
import { EMPTY_FORM_STATE, RecordEditor, type Field } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { Field as FormField, Textarea } from "@/components/ui/field";
import { formDataOf } from "@/components/ui/form-submit";
import { KeyValues } from "@/components/ui/stat";
import { actorField } from "@/lib/auth/actor-field";
import type { ChangeLine } from "@/lib/auth/configuration-change-words";

import {
  applyChangeAction,
  declineChangeAction,
  proposeAccountCode,
  proposeAdministratorChange,
  proposePermissionGrant,
  proposeSecurityPolicy,
  withdrawChangeAction,
  type DecideState,
} from "./actions";

/**
 * The acts of two-person change (Phase 2c), each the shared editor (a drawer that asks, a reason where the act needs one, the signed-in person shown and the
 * password asked where the act is a signature) except applying a change that makes a code, which has something to show once afterwards.
 */

const WHY_PROPOSED: Field = { kind: "textarea", name: "reason", label: "Why is it proposed?", required: true, hint: "Kept with the change, and shown to the second person who decides it." };
const PROPOSER: Field = actorField("ConfigurationChange.proposedBy", { name: "personId" });
const DECIDED_BY = actorField("ConfigurationChange.decidedBy", { name: "personId" });
const DECIDER: Field = DECIDED_BY;

/// What a change would do, as the second person reads it before deciding.
export function ChangeFacts({ title, subject, lines, reason, proposedBy }: { title: string; subject: string | null; lines: ChangeLine[]; reason: string; proposedBy: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-sunken px-4 py-3">
      <KeyValues
        items={[
          { label: "Change", value: title },
          ...(subject ? [{ label: "About", value: subject }] : []),
          ...lines.map((l) => ({ label: l.label, value: l.before == null ? l.after : `${l.before}  →  ${l.after}` })),
          { label: "Proposed by", value: proposedBy },
          { label: "Why", value: reason },
        ]}
      />
    </div>
  );
}

// --------------------------------------------------------------------------------------------- proposing

export function ProposeSetting({
  setting,
  label,
  current,
  choices,
}: {
  setting: string;
  label: string;
  /// How the setting reads now, in words: "30 minutes", "Not set".
  current: string;
  /// The offered choices of a setting that is a choice; absent for a whole number.
  choices?: { value: string; label: string }[];
}) {
  return (
    <RecordEditor
      title={`Propose a change to: ${label}`}
      description={`Now: ${current}. A second person decides. Until then it stays.`}
      fields={[
        { kind: "hidden", name: "setting" },
        choices
          ? { kind: "select", name: "value", label: "Change it to", required: true, placeholder: "Choose", options: choices }
          : { kind: "number", name: "value", label: "Change it to", required: true, min: 0 },
        WHY_PROPOSED,
        PROPOSER,
      ]}
      values={{ setting }}
      action={proposeSecurityPolicy}
      submitLabel="Propose the change"
      trigger={{ label: "Propose a change", className: buttonClass("secondary", "sm"), ariaLabel: `Propose a change to ${label}` }}
      size="md"
    />
  );
}

export function ProposePermission({
  permissionKey,
  permissionLabel,
  roleCode,
  roleName,
  current,
  trigger,
}: {
  permissionKey: string;
  permissionLabel: string;
  roleCode: string;
  roleName: string;
  /// How the role stands on it now, in words.
  current: string;
  trigger: { label: string; className?: string; ariaLabel?: string };
}) {
  return (
    <RecordEditor
      title={`${permissionLabel}: ${roleName}`}
      description={`Now: ${current}. Undecided is refused. A second person decides.`}
      fields={[
        { kind: "hidden", name: "permissionKey" },
        { kind: "hidden", name: "roleCode" },
        {
          kind: "select",
          name: "decision",
          label: "Change it to",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "GRANTED", label: "Granted" },
            { value: "WITHHELD", label: "Withheld" },
            { value: "UNDECIDED", label: "Undecided" },
          ],
        },
        WHY_PROPOSED,
        PROPOSER,
      ]}
      values={{ permissionKey, roleCode }}
      action={proposePermissionGrant}
      submitLabel="Propose the change"
      trigger={trigger}
      size="md"
    />
  );
}

export function ProposeAdministrator({ accountId, name, direction }: { accountId: string; name: string; direction: "GRANT" | "REVOKE" }) {
  const grant = direction === "GRANT";
  return (
    <RecordEditor
      title={grant ? `Propose making ${name} an administrator` : `Propose taking administration from ${name}`}
      description={
        grant
          ? "An administrator is kept apart from every office, committee seat and delegation, so someone who holds one cannot be made one. A second administrator decides it, and the account's sessions end when it is applied."
          : "A second administrator decides it. The account's sessions end when it is applied. The only active administrator cannot be taken from."
      }
      fields={[{ kind: "hidden", name: "accountId" }, { kind: "hidden", name: "direction" }, WHY_PROPOSED, PROPOSER]}
      values={{ accountId, direction }}
      action={proposeAdministratorChange}
      submitLabel="Propose the change"
      trigger={{ label: grant ? "Propose administrator" : "Propose ending administration", className: buttonClass("secondary", "sm"), ariaLabel: `${grant ? "Propose making" : "Propose taking administration from"} ${name}` }}
      size="md"
    />
  );
}

export function ProposeAccountCode({ accountId, name, purpose, notice }: { accountId: string; name: string; purpose: "ACTIVATION" | "RESET"; notice: string | null }) {
  const activation = purpose === "ACTIVATION";
  return (
    <RecordEditor
      title={`Propose ${activation ? "an activation" : "a reset"} code for ${name}`}
      description={`${notice ? `${notice} ` : ""}A second administrator issues the code and is the one shown it. Say how ${name}'s identity was checked outside the system.`}
      fields={[
        { kind: "hidden", name: "accountId" },
        { kind: "hidden", name: "purpose" },
        { kind: "textarea", name: "reason", label: "How was their identity checked, and why is it needed?", required: true },
        PROPOSER,
      ]}
      values={{ accountId, purpose }}
      action={proposeAccountCode}
      submitLabel="Propose the code"
      trigger={{ label: activation ? "Propose activation code" : "Propose reset code", className: buttonClass("secondary", "sm"), ariaLabel: `Propose ${activation ? "an activation" : "a reset"} code for ${name}` }}
      size="md"
    />
  );
}

// --------------------------------------------------------------------------------------------- deciding

type Facts = { title: string; subject: string | null; lines: ChangeLine[]; reason: string; proposedBy: string };

/// Apply a change that makes nothing to show afterwards: the second person's password, and why if they wish.
export function ApplyChange({ changeId, facts }: { changeId: string; facts: Facts }) {
  return (
    <RecordEditor
      title={`Apply: ${facts.title}`}
      description="You are the second person. Your password signs the decision. Stale changes are not applied."
      identity={<ChangeFacts {...facts} />}
      fields={[{ kind: "hidden", name: "changeId" }, DECIDER, { kind: "textarea", name: "reason", label: "Note (optional)" }]}
      values={{ changeId }}
      action={applyChangeAction}
      submitLabel="Apply it"
      trigger={{ label: "Apply", className: buttonClass("primary", "sm"), ariaLabel: `Apply: ${facts.title}` }}
      size="md"
    />
  );
}

export function DeclineChange({ changeId, facts }: { changeId: string; facts: Facts }) {
  return (
    <RecordEditor
      title={`Decline: ${facts.title}`}
      description="Nothing is changed. The proposal stays on the record as declined, with your reason."
      identity={<ChangeFacts {...facts} />}
      fields={[{ kind: "hidden", name: "changeId" }, DECIDER]}
      values={{ changeId }}
      action={declineChangeAction}
      submitLabel="Decline it"
      destructive={{ reasonLabel: "Why is it declined?" }}
      trigger={{ label: "Decline", className: buttonClass("secondary", "sm"), ariaLabel: `Decline: ${facts.title}` }}
      size="md"
    />
  );
}

export function WithdrawChange({ changeId, facts }: { changeId: string; facts: Facts }) {
  return (
    <RecordEditor
      title={`Withdraw: ${facts.title}`}
      description="You proposed it, so you cannot decide it. Withdrawing changes nothing."
      identity={<ChangeFacts {...facts} />}
      fields={[{ kind: "hidden", name: "changeId" }, DECIDER, { kind: "textarea", name: "reason", label: "Note (optional)" }]}
      values={{ changeId }}
      action={withdrawChangeAction}
      submitLabel="Withdraw it"
      trigger={{ label: "Withdraw", className: buttonClass("secondary", "sm"), ariaLabel: `Withdraw: ${facts.title}` }}
      size="md"
    />
  );
}

/**
 * Apply a change that makes a code. The second person is shown the code once, in the shared dialog; closing it ends it. It is returned to this form only and
 * kept nowhere (not in the address, not in the page behind, not in the trail: only its hash is stored).
 */
export function ApplyCodeChange({ changeId, facts }: { changeId: string; facts: Facts }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DecideState>(EMPTY_FORM_STATE);
  const [pending, start] = useTransition();
  const opener = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const close = () => {
    // The code leaves the screen with the dialog, and only then does the queue take the decided change out of the waiting list.
    const made = state.issued != null;
    setState(EMPTY_FORM_STATE);
    setOpen(false);
    opener.current?.focus();
    if (made) router.refresh();
  };
  const reset = state.issued?.purpose === "RESET";

  return (
    <>
      <button type="button" ref={opener} className={buttonClass("primary", "sm")} onClick={() => setOpen(true)} aria-label={`Apply: ${facts.title}`}>
        Issue the code
      </button>
      {open && (
        <CodeDialog
          label={facts.title}
          title={state.issued ? `Code for ${state.issued.personName}` : facts.title}
          subtitle={state.issued ? "Hand it over by hand. The system sends nothing." : "You issue the code, and you are the one shown it."}
          shown={state.issued ? { code: state.issued.code, validUntil: state.issued.validUntil, notice: reset ? "Their open sign-ins have ended. Their old password stops working once they use this code." : null } : null}
          onClose={close}
        >
          <form
            className="flex flex-col gap-4 px-6 py-5"
            onSubmit={(e) => {
              const data = formDataOf(e);
              start(async () => setState(await applyChangeAction(EMPTY_FORM_STATE, data)));
            }}
          >
            <ChangeFacts {...facts} />
            {state.message && <Callout tone="err">{state.message}</Callout>}
            <input type="hidden" name="changeId" value={changeId} />
            <ActAttributionFields spec={DECIDED_BY} errors={state.errors} />
            <FormField label="Note (optional)" htmlFor="apply-note">
              <Textarea id="apply-note" name="reason" rows={2} disabled={pending} />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Issuing…" : "Issue the code"}
              </Button>
            </div>
          </form>
        </CodeDialog>
      )}
    </>
  );
}
