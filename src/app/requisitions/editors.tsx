import { RecordEditor, type Field } from "@/components/record-editor";
import { Button, buttonClass } from "@/components/ui/button";

import {
  cancelRequisition,
  changeFunding,
  checkBudget,
  citeCommitteeDecision,
  closeRequisition,
  markEndorsed,
  recallRequisition,
  recordDecision,
  recordEndorsement,
  recordErpRefs,
  recordExternalAuthority,
  registerRequisition,
  reopenDraft,
  returnRequisition,
  submitRequisition,
  justifySplit,
} from "./actions";

/**
 * The drawers of a requisition. Fields are data; every rule sits in the action and the
 * pure checks behind it. Where the pure checks already say an act cannot proceed, the
 * control is shown disabled with the reason beside it, rather than opening a drawer
 * that can only refuse. No field is pre-filled with a policy value.
 */

type Option = { value: string; label: string };

/// A control the rules say cannot be used yet, with the reason beside it.
export function Blocked({ label, reason, primary }: { label: string; reason: string; primary?: boolean }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <Button size="sm" variant={primary ? "primary" : "secondary"} disabled title={reason}>
        {label}
      </Button>
      <span className="max-w-64 text-[12px] leading-tight text-ink-3">{reason}</span>
    </span>
  );
}

const hidden = (name: string): Field => ({ kind: "hidden", name });

export function RecordEndorsementDrawer({ id, tiers, people, today }: { id: string; tiers: Option[]; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record an endorsement"
      description="The head of the tier's unit endorses the draft. Recorded on their behalf: nobody signs in yet."
      fields={[
        hidden("id"),
        { kind: "select", name: "tier", label: "Tier", required: true, placeholder: "Choose", options: tiers },
        { kind: "select", name: "personId", label: "Endorsed by", required: true, placeholder: "Choose", options: people, hint: "Must head that unit on the date." },
        { kind: "date", name: "endorsedOn", label: "Endorsed on", required: true, hint: "Not after today." },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, endorsedOn: today }}
      action={recordEndorsement}
      submitLabel="Record endorsement"
      trigger={{ label: "Record endorsement", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function MarkEndorsed({ id, blocker }: { id: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Mark endorsed" reason={blocker} primary />;
  return (
    <RecordEditor
      title="Mark as endorsed"
      description="Every tier has endorsed it. From here its fields are fixed; it is registered, budget-checked and submitted."
      fields={[hidden("id")]}
      values={{ id }}
      action={markEndorsed}
      submitLabel="Mark endorsed"
      trigger={{ label: "Mark endorsed", className: buttonClass("primary", "sm") }}
      size="sm"
    />
  );
}

export function ReturnDrawer({ id, people, today }: { id: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Return as incomplete"
      description="The completeness review found the pack incomplete. It goes back to the requesting department with the reason (FR-REQ-010)."
      fields={[
        hidden("id"),
        { kind: "textarea", name: "reason", label: "What is incomplete" },
        { kind: "select", name: "returnedToPersonId", label: "Returned to", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "returnedOn", label: "Returned on", required: true },
      ]}
      values={{ id, returnedOn: today }}
      action={returnRequisition}
      submitLabel="Return"
      trigger={{ label: "Return", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function RegisterDrawer({ id, required, proc, nm, blocker }: { id: string; required: boolean | null; proc: string | null; nm: string | null; blocker: string | null }) {
  if (blocker) return <Blocked label="Register" reason={blocker} primary />;
  return (
    <RecordEditor
      title="Register"
      description={
        required
          ? "Registration needs the finance system's requisition and note numbers. They are consumed, never issued here."
          : "The finance system's numbers are not required to register. Record them here if they are known."
      }
      fields={[
        hidden("id"),
        { kind: "text", name: "erpRequisitionNo", label: "Finance system requisition no.", required: required === true, mono: true },
        { kind: "text", name: "erpNoteNo", label: "Requisition note no.", required: required === true, mono: true },
      ]}
      values={{ id, erpRequisitionNo: proc, erpNoteNo: nm }}
      action={registerRequisition}
      submitLabel="Register"
      trigger={{ label: "Register", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function ErpRefsDrawer({ id, proc, nm }: { id: string; proc: string | null; nm: string | null }) {
  return (
    <RecordEditor
      title="Record finance numbers"
      description="The finance system's requisition and note numbers, as it issued them. Each belongs to one requisition."
      fields={[
        hidden("id"),
        { kind: "text", name: "erpRequisitionNo", label: "Finance system requisition no.", mono: true },
        { kind: "text", name: "erpNoteNo", label: "Requisition note no.", mono: true },
      ]}
      values={{ id, erpRequisitionNo: proc, erpNoteNo: nm }}
      action={recordErpRefs}
      reason={proc || nm ? { label: "Reason for the change" } : undefined}
      trigger={{ label: "Record finance numbers", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function CheckBudgetDrawer({ id, source, blocker, today }: { id: string; source: "PORTAL_LEDGER" | "MANUAL_ERP_ENTRY" | null; blocker: string | null; today: string | null }) {
  if (blocker || !source) return <Blocked label="Check budget" reason={blocker ?? "The budget check source is not set."} />;
  const manual = source === "MANUAL_ERP_ENTRY";
  return (
    <RecordEditor
      title="Check the budget"
      description={
        manual
          ? "Type the four figures as the finance system shows them. They are stored exactly as typed; the verdict is read from the balance alone."
          : "Computed now from the portal's budget ledger, through the requisition's budget code."
      }
      fields={[
        hidden("id"),
        ...(manual
          ? ([
              { kind: "date", name: "asAt", label: "As at", required: true },
              { kind: "money", name: "balanceAsAt", label: "Balance as at", required: true },
              { kind: "money", name: "actualBudget", label: "Actual budget" },
              { kind: "money", name: "approvedAccount", label: "Approved account" },
              { kind: "money", name: "projectedBalance", label: "Projected balance" },
            ] as Field[])
          : [{ kind: "note" as const, text: "Nothing is typed: the figures come from the budget code's movements up to today." }]),
      ]}
      values={{ id, asAt: today }}
      action={checkBudget}
      submitLabel="Run check"
      trigger={{ label: "Check budget", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function SubmitDrawer({
  id,
  blocker,
  overBudget,
}: {
  id: string;
  blocker: string | null;
  /// Where the latest check is over budget: whether it needs the route invoked, and whether the control is set.
  overBudget: { invocation: boolean; controlNotSet: boolean; auto: boolean; ifRechecked?: boolean } | null;
}) {
  if (blocker) return <Blocked label="Submit for approval" reason={blocker} primary />;
  const fields: Field[] = [hidden("id")];
  if (overBudget?.invocation) {
    fields.push({
      kind: "note",
      text: overBudget.ifRechecked
        ? "The last budget check is stale and is re-run on submission. If the fresh check finds it over budget, it proceeds only if you invoke the over-budget route here; otherwise the switch is ignored."
        : overBudget.controlNotSet
        ? "Over budget, and the availability check is not set. It proceeds only if you invoke the over-budget route, which sends it to the over-budget approvers — never the band route."
        : "Over budget, and the availability check blocks it. It proceeds only if you invoke the over-budget route, which sends it to the over-budget approvers.",
    });
    fields.push({ kind: "switch", name: "invokeOverBudget", label: "Invoke the over-budget route", hint: "Recorded on the approval trail." });
  } else if (overBudget?.auto) {
    fields.push({ kind: "note", text: "Over budget. The availability check is set to warn, so it routes to the over-budget approvers on its own, with a warning on the trail." });
  }
  fields.push({
    kind: "note",
    text: "On submission the budget is re-checked if the last check is stale, the splitting check runs, and the route is resolved from the approval matrix in force and stored with every rule it was judged under.",
  });
  return (
    <RecordEditor
      title="Submit for approval"
      description="Opens the approval route. Its steps are then decided in order."
      fields={fields}
      values={{ id }}
      action={submitRequisition}
      submitLabel="Submit"
      trigger={{ label: "Submit for approval", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function RecallDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Recall" reason={blocker} />;
  return (
    <RecordEditor
      title="Recall"
      description="Withdraws it from approval before anyone has decided. The route is kept on record as recalled."
      fields={[hidden("id")]}
      values={{ id }}
      action={recallRequisition}
      submitLabel="Recall"
      destructive={{ reasonLabel: "Why is it being recalled?" }}
      trigger={{ label: "Recall", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function CancelDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Cancel the requisition"
      description="Withdrawn before approval. A cancelled requisition cannot be reopened."
      fields={[hidden("id")]}
      values={{ id }}
      action={cancelRequisition}
      submitLabel="Cancel requisition"
      destructive={{ reasonLabel: "Why is it cancelled?" }}
      trigger={{ label: "Cancel", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

export function ReopenDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Reopen as a draft"
      description="Back to draft to be corrected. Editing it withdraws its endorsements, and it is endorsed, registered and checked again."
      fields={[hidden("id")]}
      values={{ id }}
      action={reopenDraft}
      submitLabel="Reopen"
      reason={{ label: "Why is it being reopened?" }}
      trigger={{ label: "Reopen as draft", className: buttonClass("primary", "sm") }}
      size="sm"
    />
  );
}

export function CloseDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Close the requisition"
      description="Rejected and not going further. Closed is final."
      fields={[hidden("id")]}
      values={{ id }}
      action={closeRequisition}
      submitLabel="Close"
      destructive={{ reasonLabel: "Why is it closed?" }}
      trigger={{ label: "Close", className: buttonClass("ghost", "sm") }}
      size="sm"
    />
  );
}

export function DecisionDrawer({
  id,
  stepId,
  roleLabel,
  act,
  people,
  today,
  blocker,
}: {
  id: string;
  stepId: string;
  roleLabel: string;
  act: string;
  people: Option[];
  today: string | null;
  blocker: string | null;
}) {
  if (blocker) return <Blocked label="Record decision" reason={blocker} />;
  return (
    <RecordEditor
      title={`Record ${roleLabel}'s decision`}
      description={`The ${act.toLowerCase()} step. Name who decided: it is recorded on their behalf, not signed, until sign-in exists. They must hold the office for this requisition's department, or a delegation of it.`}
      fields={[
        hidden("id"),
        hidden("stepId"),
        {
          kind: "select",
          name: "decision",
          label: "Decision",
          required: true,
          placeholder: "Choose",
          options: [
            { value: "DONE", label: `${act} — done` },
            { value: "REJECTED", label: "Rejected" },
          ],
        },
        { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: people, hint: "Holders of the office for this department are listed first." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was submitted." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a rejection." },
      ]}
      values={{ id, stepId, decidedOn: today }}
      action={recordDecision}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function CiteCommitteeDrawer({ id, stepId, committee, decisions, blocker }: { id: string; stepId: string; committee: string; decisions: Option[]; blocker: string | null }) {
  if (blocker) return <Blocked label="Cite committee decision" reason={blocker} />;
  return (
    <RecordEditor
      title={`Cite the ${committee}'s decision`}
      description="The step is discharged by the committee's recorded decision on a matter tabled against this requisition, exactly as the sitting records it."
      fields={[
        hidden("id"),
        hidden("stepId"),
        { kind: "select", name: "committeeDecisionId", label: "Decision", required: true, placeholder: "Choose", options: decisions },
      ]}
      values={{ id, stepId }}
      action={citeCommitteeDecision}
      submitLabel="Cite decision"
      trigger={{ label: "Cite committee decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function JustifySplitDrawer({ id, people, today }: { id: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Justify the possible split"
      description="Why these related requisitions are not one requirement split below a threshold. Required before the final approval (FR-REQ-015)."
      fields={[
        hidden("id"),
        { kind: "textarea", name: "overrideJustification", label: "Justification" },
        { kind: "select", name: "personId", label: "Justified by", required: true, placeholder: "Choose", options: people, hint: "Recorded on their behalf, not signed." },
        { kind: "date", name: "overriddenOn", label: "On", required: true },
      ]}
      values={{ id, overriddenOn: today }}
      action={justifySplit}
      submitLabel="Record justification"
      trigger={{ label: "Justify", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function ChangeFundingDrawer({ id, current, routes }: { id: string; current: string | null; routes: Option[] }) {
  return (
    <RecordEditor
      title="Change the funding route"
      description="A controlled change with a reason. What the new route implies — whether the organisation sources, whose rules apply — is read again and stored."
      fields={[hidden("id"), { kind: "select", name: "fundingRouteCode", label: "Funding route", required: true, placeholder: "Choose", options: routes, orphanLabel: "A route no longer configured" }]}
      values={{ id, fundingRouteCode: current }}
      action={changeFunding}
      reason={{ label: "Why is the funding route changing?" }}
      trigger={{ label: "Change funding", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function ExternalAuthorityDrawer({ id, label, current }: { id: string; label: string; current: string | null }) {
  return (
    <RecordEditor
      title={`Record ${label.toLowerCase()}`}
      description="The external body's authority this funding route waits for. Its reference, as issued."
      fields={[hidden("id"), { kind: "text", name: "externalAuthorityRef", label: "Reference", required: true, mono: true }]}
      values={{ id, externalAuthorityRef: current }}
      action={recordExternalAuthority}
      reason={current ? { label: "Why is the recorded reference changing?" } : undefined}
      trigger={{ label: current ? `Change ${label.toLowerCase()}` : `Record ${label.toLowerCase()}`, className: buttonClass(current ? "secondary" : "primary", "sm") }}
      size="md"
    />
  );
}
