import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import {
  cancelRequisition,
  changeFunding,
  checkBudget,
  checkCommitteeGates,
  citeCommitteeDecision,
  citeGateDecision,
  chooseWhereItGoes,
  closeWithoutSourcing,
  markEndorsed,
  recallRequisition,
  recordDecision,
  recordEndorsement,
  recordExternalAuthority,
  reopenDraft,
  returnRequisition,
  submitRequisition,
} from "./actions";

/**
 * The drawers of a requisition. Fields are data; every rule sits in the action and the
 * pure checks behind it. Where the pure checks already say an act cannot proceed, the
 * control is shown disabled with the reason beside it, rather than opening a drawer
 * that can only refuse. No field is pre-filled with a policy value.
 */

type Option = { value: string; label: string };

// The shared disabled control with its reason moved to the design system (6.15a fix S-4); re-exported for its users.
import { Blocked } from "@/components/ui/blocked";
export { Blocked };

const hidden = (name: string): Field => ({ kind: "hidden", name });

export function RecordEndorsementDrawer({ id, tiers, byTier, today }: { id: string; tiers: Option[]; byTier: Record<string, Option[]>; today: string | null }) {
  return (
    <RecordEditor
      title="Record an endorsement"
      description="Signed by the tier's unit head. From paper, it is recorded unsigned."
      fields={[
        hidden("id"),
        { kind: "select", name: "tier", label: "Tier", required: true, placeholder: "Choose", options: tiers },
        // Who heads each tier's unit (from the day raised to today). Recorded from paper, the person is one of them; the action checks it is the chosen tier's head.
        actorField("RequisitionEndorsement.person", {
          name: "personId",
          people: [...new Map(Object.values(byTier).flat().map((o) => [o.value, o])).values()],
          hint: "The unit head. None on record: set one under Organisation.",
        }),
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

/// Id of the header note that states why a header action is unavailable.
export const HEADER_NOTE_ID = "requisition-actions-note";

export function MarkEndorsed({ id, blocker, source }: { id: string; blocker: string | null; source: "PORTAL_LEDGER" | "MANUAL_ERP_ENTRY" | null }) {
  if (blocker) return <Blocked label="Mark endorsed" reason={blocker} primary noteId={HEADER_NOTE_ID} />;
  return (
    <RecordEditor
      title="Mark as endorsed"
      description={
        source === "PORTAL_LEDGER"
          ? "Fields are fixed and the budget is checked. After that it cannot be returned as incomplete."
          : "Fields are fixed, then it is budget-checked."
      }
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
      description="Goes back to the requesting department with the reason."
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

export function CheckBudgetDrawer({ id, source, blocker, today }: { id: string; source: "PORTAL_LEDGER" | "MANUAL_ERP_ENTRY" | null; blocker: string | null; today: string | null }) {
  if (blocker || !source) return <Blocked label="Check budget" reason={blocker ?? "Budget check source not set."} noteId={HEADER_NOTE_ID} />;
  const manual = source === "MANUAL_ERP_ENTRY";
  return (
    <RecordEditor
      title="Check the budget"
      description={
        manual
          ? "Type the figures as the finance system shows them."
          : "Computed now from the budget ledger."
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
          : [{ kind: "note" as const, text: "Nothing to type. Figures come from the ledger." }]),
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
  if (blocker) return <Blocked label="Submit for approval" reason={blocker} primary noteId={HEADER_NOTE_ID} />;
  const fields: Field[] = [hidden("id")];
  if (overBudget?.invocation) {
    fields.push({
      kind: "note",
      text: overBudget.ifRechecked
        ? "Last check is stale and re-runs. If over budget, it proceeds only on the over-budget route."
        : overBudget.controlNotSet
        ? "Over budget, availability check not set. Proceeds only on the over-budget route."
        : "Over budget, availability check blocks it. Proceeds only on the over-budget route.",
    });
    fields.push({ kind: "switch", name: "invokeOverBudget", label: "Invoke the over-budget route", hint: "Recorded on the approval trail." });
  } else if (overBudget?.auto) {
    fields.push({ kind: "note", text: "Over budget. Routes to the over-budget approvers, with a warning on the trail." });
  }
  fields.push({
    kind: "note",
    text: "Route is resolved from the approval matrix in force.",
  });
  return (
    <RecordEditor
      title="Submit for approval"
      description="Opens the approval route."
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
  if (blocker) return <Blocked label="Recall" reason={blocker} noteId={HEADER_NOTE_ID} />;
  return (
    <RecordEditor
      title="Recall"
      description="Withdraws it from approval. The route stays on record."
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
      description="Cannot be reopened."
      fields={[hidden("id")]}
      values={{ id }}
      action={cancelRequisition}
      submitLabel="Cancel requisition"
      destructive={{ reasonLabel: "Why is it cancelled?" }}
      trigger={{ label: "Cancel requisition", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function ReopenDrawer({ id }: { id: string }) {
  return (
    <RecordEditor
      title="Reopen as a draft"
      description="Editing withdraws its endorsements. They are given again."
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

/**
 * Where a rejected requisition goes next, chosen by the officer where the rejection
 * decided nothing (FR-APR-016, ruling CO-5). Recorded as their choice, on behalf of the
 * Person named — never as the organisation's policy.
 */
export function WhereItGoesDrawer({
  id,
  kinds,
  steps,
  people,
}: {
  id: string;
  kinds: Option[];
  steps: Option[];
  people: Option[];
}) {
  return (
    <RecordEditor
      title="Where it goes next"
      description="Recorded as your choice, not organisation policy."
      fields={[
        hidden("id"),
        { kind: "select", name: "kind", label: "Where it goes", required: true, placeholder: "Choose", options: kinds },
        { kind: "select", name: "returnToSeq", label: "The step it returns to", required: true, placeholder: "Choose", options: steps, hint: "Earlier steps keep their decisions." },
        actorField("ApprovalInstance.rejectionChosenBy", { name: "personId", people }),
        { kind: "textarea", name: "reason", label: "Why it goes there" },
      ]}
      showWhen={{ returnToSeq: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      values={{ id }}
      action={chooseWhereItGoes}
      submitLabel="Record the choice"
      trigger={{ label: "Choose where it goes", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function DecisionDrawer({
  id,
  stepId,
  roleLabel,
  act,
  done,
  people,
  today,
  blocker,
}: {
  id: string;
  stepId: string;
  roleLabel: string;
  act: string;
  /// The act as done: "Recommended", "Approved".
  done: string;
  people: Option[];
  today: string | null;
  blocker: string | null;
}) {
  if (blocker) return <Blocked label="Record decision" reason={blocker} />;
  return (
    <RecordEditor
      title={`Record ${roleLabel}'s decision`}
      description={`The ${act.toLowerCase()} step. The holder signs in to decide. From paper, it is recorded unsigned.`}
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
            { value: "DONE", label: done },
            { value: "REJECTED", label: "Rejected" },
          ],
        },
        // Recorded from paper, the picker lists the holders of the office for this department and their delegates first, then anyone who cannot decide it and why.
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today or before submission." },
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
      description="Discharges the step as the sitting recorded it."
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

export function ChangeFundingDrawer({ id, current, routes }: { id: string; current: string | null; routes: Option[] }) {
  return (
    <RecordEditor
      title="Change the funding route"
      description="Re-reads what the new route implies. The budget is checked again."
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
      description="The external body's reference, as issued."
      fields={[hidden("id"), { kind: "text", name: "externalAuthorityRef", label: "Reference", required: true, mono: true }]}
      values={{ id, externalAuthorityRef: current }}
      action={recordExternalAuthority}
      reason={current ? { label: "Why is the recorded reference changing?" } : undefined}
      trigger={{ label: current ? `Change ${label.toLowerCase()}` : `Record ${label.toLowerCase()}`, className: buttonClass(current ? "secondary" : "primary", "sm") }}
      size="md"
    />
  );
}

// ------------------------------------------------------------- committee gate

export function CheckGatesDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Check committee gates" reason={blocker} />;
  return (
    <RecordEditor
      title="Check committee gates"
      description="Records the gates to pass before sourcing. An unset setting is refused."
      fields={[hidden("id")]}
      values={{ id }}
      action={checkCommitteeGates}
      submitLabel="Check gates"
      trigger={{ label: "Check committee gates", className: buttonClass("primary", "sm") }}
      size="sm"
    />
  );
}

export function CiteGateDrawer({ id, gateId, committee, decisions, blocker }: { id: string; gateId: string; committee: string; decisions: Option[]; blocker: string | null }) {
  if (blocker) return <Blocked label="Cite the decision" reason={blocker} />;
  return (
    <RecordEditor
      title={`Cite the ${committee}'s decision on the gate`}
      description="The sitting's record decides: carried passes, a loop returns it, a terminal outcome ends it."
      fields={[
        hidden("id"),
        hidden("gateId"),
        { kind: "select", name: "committeeDecisionId", label: "Matter", required: true, placeholder: "Choose", options: decisions },
      ]}
      values={{ id, gateId }}
      action={citeGateDecision}
      submitLabel="Cite decision"
      trigger={{ label: "Cite the decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function CloseWithoutSourcingDrawer({ id, commitment }: { id: string; commitment: string | null }) {
  return (
    <RecordEditor
      title="Close without sourcing"
      description={`Final. ${commitment ? `Releases the ${commitment} commitment.` : "A committee gate ended it."}`}
      fields={[hidden("id")]}
      values={{ id }}
      action={closeWithoutSourcing}
      submitLabel="Close without sourcing"
      destructive={{ reasonLabel: "Why is it closed?" }}
      trigger={{ label: "Close without sourcing", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}
