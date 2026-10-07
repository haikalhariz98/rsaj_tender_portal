"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import {
  addMeasurement,
  chooseVariationRefusal,
  citeVariationCommittee,
  closeVariation,
  decideVariation,
  decideVariationApprovalStep,
  editVariation,
  raiseInstruction,
  raiseSumAdjustment,
  raiseVariationOrder,
  recordCommencement,
  recordDaywork,
  recordOralLoop,
  recordVariation,
  removeMeasurement,
  sendVariationForApproval,
  submitVariation,
  tableVariationMatter,
} from "./variation-actions";

/**
 * The contract's variation and adjustment drawers (6.13 Part A step 4, 4d). No field carries a default but the day an
 * act is recorded on and the words a rule requires repeated exactly (the instruction's description, which the act
 * judges again). No drawer posts a figure a certificate computes: the percentage, the cumulative, the new sum, an
 * item's amount and the adjustment's totals are worked out from the records, never typed. Every person named is
 * recorded on their behalf, not signed; the server judges whether they may be recorded for the act on the day. A
 * drawer that cannot proceed says why beside its button, in the act's own words.
 */

export type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const primary = buttonClass("primary", "sm");
const secondary = buttonClass("secondary", "sm");
const ghost = buttonClass("ghost", "sm");
/// Who is acting: the signed-in officer, shown and not chosen. Where the act may be recorded from paper, `people` are who it may be recorded for.
const by = (slot: string, name: string, people: Option[], opts: { label?: string; dated?: boolean; named?: "required" | "optional" } = {}): Field =>
  actorField(slot, { name, people, label: opts.label, dated: opts.dated, ...(opts.named ? { named: { optional: opts.named === "optional" } } : {}) });
const choose = (name: string, label: string, options: Option[], hint?: string, required = true): Field => ({ kind: "select", name, label, required, placeholder: "Choose: there is no default", options, ...(hint ? { hint } : {}) });
const YES_NO: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const answer = (name: string, label: string, hint?: string): Field => ({ kind: "select", name, label, placeholder: "Not answered", options: YES_NO, ...(hint ? { hint } : {}) });

// ------------------------------------------------------------------ the record

export function VariationRecordDrawer({ id, people, origins, exemptions, values, blocker }: { id: string; people: Option[]; origins: Option[]; exemptions: Option[]; values?: Record<string, string | null>; blocker: string | null }) {
  const editing = !!values?.variationId;
  return (
    <RecordEditor
      title={editing ? "Change the draft variation" : "Record a variation"}
      description="What the variation is, why it is done as a variation, and its estimated amount (a reduction with a minus). The number, the percentage, the cumulative and the new contract sum are worked out when it is submitted, never typed. The answers below are needed before it is submitted."
      size="lg"
      columns={2}
      fields={[
        hidden("id"),
        hidden("variationId"),
        choose("origin", "Originated by", origins),
        by("Variation.originator", "originatorPersonId", people, { named: "required" }),
        { kind: "textarea", name: "description", label: "Description", required: true },
        { kind: "textarea", name: "reason", label: "Reason it is done as a variation", required: true },
        { kind: "text", name: "estimate", label: "Estimated amount (RM)", required: true, hint: "An omission (a reduction of the contract sum) below nothing, with a minus.", placeholder: "0.00" },
        { kind: "select", name: "exemption", label: "Exempt from prior approval", placeholder: "Not exempt", options: exemptions, hint: "An exempt variation goes straight to the S.O.'s instruction, without the committee or the approval tiers." },
        answer("periodImplication", "Implies a change to the contract period"),
        answer("agreedRateExists", "A negotiated agreed rate already exists", "Decides the schedule form it produces."),
        answer("funderConsentRequired", "Affects a funder's assets", "Yes: the funder's consent is tabled before it is instructed."),
        { kind: "note", text: "The department path: the review by an S.O.'s Representative before it is submitted." },
        by("Variation.reviewedBy", "reviewedByPersonId", people, { named: "optional" }),
        { kind: "date", name: "reviewedOn", label: "Reviewed on" },
        { kind: "textarea", name: "reviewNote", label: "Review note" },
        { kind: "note", text: "A Specialist representative: the allocation confirmed, and the Principal Representative it passed through." },
        answer("allocationConfirmed", "The allocation is confirmed available"),
        { kind: "textarea", name: "allocationNote", label: "Allocation note" },
        by("Variation.principal", "principalPersonId", people, { named: "optional" }),
        { kind: "date", name: "principalOn", label: "Passed through on" },
      ]}
      values={{ id, ...(values ?? {}) }}
      action={editing ? editVariation : recordVariation}
      submitLabel={editing ? "Save" : "Record"}
      submitBlock={blocker}
      trigger={{ label: editing ? "Change" : "Record a variation", className: editing ? secondary : primary }}
    />
  );
}

export function SubmitVariationDrawer({ id, variationId, exempt, blocker }: { id: string; variationId: string; exempt: boolean; blocker: string | null }) {
  return (
    <RecordEditor
      title="Submit the variation"
      description={exempt ? "It is numbered from the variation series and goes straight on to the S.O.'s instruction (exempt from prior approval)." : "It is numbered from the variation series and goes to the S.O. for a decision. Its percentage is read on the organisation's settings."}
      fields={[hidden("id"), hidden("variationId")]}
      values={{ id, variationId }}
      action={submitVariation}
      submitLabel="Submit"
      submitBlock={blocker}
      trigger={{ label: "Submit", className: primary }}
    />
  );
}

export function SoDecisionDrawer({ id, variationId, people, decisions, today, destinationSet, blocker }: { id: string; variationId: string; people: Option[]; decisions: Option[]; today: string | null; destinationSet: boolean; blocker: string | null }) {
  return (
    <RecordEditor
      title="The S.O.'s decision"
      description={`Supported (with a cap no higher than the estimate, where the S.O. gives one) or not supported, with the reason. ${destinationSet ? "Where it is not supported, it goes where the configured destination says." : "No destination is configured for a variation not supported: say where it goes."}`}
      fields={[
        hidden("id"),
        hidden("variationId"),
        choose("soDecision", "Decision", decisions),
        { kind: "money", name: "soDecisionCap", label: "Supported up to (RM)", hint: "Optional, with support only." },
        { kind: "textarea", name: "soDecisionNote", label: "Note", hint: "Required where it is not supported." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true },
        by("Variation.soDecidedBy", "personId", people, { dated: true }),
        ...(destinationSet ? [] : [choose("whereTo", "Where it goes, if not supported", [{ value: "RETURN_TO_ORIGINATOR", label: "Back to its originator" }, { value: "TERMINATE", label: "The variation ends" }], undefined, false)]),
      ]}
      values={{ id, variationId, decidedOn: today }}
      action={decideVariation}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: "Record the S.O.'s decision", className: primary }}
    />
  );
}

// ------------------------------------------------------------------ the approvals

export function SendVariationDrawer({ id, variationId, events, people, blocker, label }: { id: string; variationId: string; events: Option[]; people: Option[]; blocker: string | null; label: string }) {
  return (
    <RecordEditor
      title="Send for approval"
      description="Its route is resolved on the approval matrix in force today, at its percentage on the organisation's basis and base (worked out now and frozen with the route). Whoever sends it may not decide it."
      fields={[
        hidden("id"),
        hidden("variationId"),
        choose("event", "Which approval", events),
        { kind: "money", name: "value", label: "Amount the agreed rates will value (RM)", hint: "For approval to use rates not in the contract only." },
        by("ApprovalInstance.submittedBy", "personId", people),
      ]}
      values={{ id, variationId }}
      showWhen={{ value: { name: "event", in: ["AGREED_RATE"] } }}
      action={sendVariationForApproval}
      submitLabel="Send"
      submitBlock={blocker}
      trigger={{ label, className: primary }}
    />
  );
}

export function DecideVariationStepDrawer({ id, variationId, stepId, roleLabel, act, done, people, today }: { id: string; variationId: string; stepId: string; roleLabel: string; act: string; done: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`${roleLabel}: ${act.toLowerCase()}`}
      description="A named Person's decision, recorded on their behalf: they hold the office (or act for it) on the day, and did not send it."
      fields={[
        hidden("id"),
        hidden("variationId"),
        hidden("stepId"),
        choose("decision", "Decision", [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused" }]),
        by("ApprovalStep.decidedBy", "personId", people, { dated: true }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true },
        { kind: "date", name: "receivedOn", label: "Received on", hint: "Optional: the day it reached them." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required where it is refused." },
      ]}
      values={{ id, variationId, stepId, decidedOn: today }}
      action={decideVariationApprovalStep}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: primary }}
    />
  );
}

export function CiteCommitteeDrawer({ id, variationId, stepId, committee, matters }: { id: string; variationId: string; stepId: string; committee: string; matters: Option[] }) {
  return (
    <RecordEditor
      title={`${committee}: cite its decision`}
      description="A committee's step is discharged only by its decision on the matter tabled from this variation: carried discharges it; not carried refuses the route (back to be tabled again, or the variation ends, as its outcome says); deferred leaves it waiting."
      fields={[hidden("id"), hidden("variationId"), hidden("stepId"), choose("committeeDecisionId", "The matter", matters, matters.length ? undefined : "Nothing tabled from this variation for this committee yet.")]}
      values={{ id, variationId, stepId }}
      action={citeVariationCommittee}
      submitLabel="Cite"
      trigger={{ label: "Cite the decision", className: primary }}
    />
  );
}

export function ChooseVariationRefusalDrawer({ id, variationId, offered, steps, people }: { id: string; variationId: string; offered: Option[]; steps: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title="Where the refused route goes"
      description="Nothing configured decides where a refused variation goes, so the officer chooses, recorded on behalf of the Person named."
      fields={[hidden("id"), hidden("variationId"), choose("kind", "Where it goes", offered), { kind: "select", name: "returnToSeq", label: "Back to step", placeholder: "Choose", options: steps }, by("ApprovalInstance.rejectionChosenBy", "personId", people), { kind: "textarea", name: "reason", label: "Reason", required: true }]}
      values={{ id, variationId }}
      showWhen={{ returnToSeq: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      action={chooseVariationRefusal}
      submitLabel="Record"
      trigger={{ label: "Say where it goes", className: primary }}
    />
  );
}

export function TableVariationDrawer({ id, variationId, purpose, sittings, tablers, label, blocker }: { id: string; variationId: string; purpose: "STEP" | "CONSENT"; sittings: Option[]; tablers: Option[]; label: string; blocker: string | null }) {
  return (
    <RecordEditor
      title={purpose === "STEP" ? "Table it for the committee's step" : "Table it for the funder's consent"}
      description="Tabled as a matter naming this variation at a sitting of the committee, which decides it there (each member's vote, with comments). Only a holder of the committee's Secretariat office on the day tables it, recorded on their behalf."
      fields={[hidden("id"), hidden("variationId"), hidden("purpose"), choose("meetingId", "Sitting", sittings, sittings.length ? undefined : "No sitting of the committee takes matters now: schedule one under Committees."), by("CommitteeDecision.tabledBy", "tabledByPersonId", tablers)]}
      values={{ id, variationId, purpose }}
      action={tableVariationMatter}
      submitLabel="Table"
      submitBlock={blocker}
      trigger={{ label, className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ commencement and closing

export function CommenceDrawer({ id, variationId, people, today, blocker }: { id: string; variationId: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Commenced pending approval"
      description="Work proceeds on the support of the S.O. or an S.O.'s Representative while the approval is obtained. Its estimate counts in the exposure until it is approved."
      fields={[hidden("id"), hidden("variationId"), { kind: "date", name: "commencedOn", label: "Commenced on", required: true }, by("Variation.commencedSupport", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, variationId, commencedOn: today }}
      action={recordCommencement}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: "Commenced pending approval", className: secondary }}
    />
  );
}

export function CloseVariationDrawer({ id, variationId, people, blocker }: { id: string; variationId: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Close the variation"
      description="Withdrawn, or ended. Never once approved: an approved variation is undone only by another variation, an omission."
      fields={[hidden("id"), hidden("variationId"), by("Variation.closedBy", "personId", people), { kind: "textarea", name: "reason", label: "Why it is closed", required: true }]}
      values={{ id, variationId }}
      action={closeVariation}
      submitLabel="Close it"
      submitBlock={blocker}
      trigger={{ label: "Close", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ the instruction and its loop

export function InstructionDrawer({ id, variationId, description, people, blocker }: { id: string; variationId: string; description: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise the S.O.'s instruction"
      description="Opened as a certificate on its form and dated by the S.O.'s signature on its page. Its description is the heading every item is measured under, and the Variation Order Certificate repeats it word for word."
      fields={[hidden("id"), hidden("variationId"), { kind: "textarea", name: "instructionDescription", label: "Description", required: true }, { kind: "date", name: "oralIssuedOn", label: "First given orally on", hint: "Only where the instruction was given orally first: the contractor's confirmation clock runs from it." }, by("VariationInstruction.person", "personId", people)]}
      values={{ id, variationId, instructionDescription: description }}
      action={raiseInstruction}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={{ label: "Raise the instruction", className: primary }}
    />
  );
}

export function OralLoopDrawer({ id, variationId, values }: { id: string; variationId: string; values: Record<string, string | null> }) {
  return (
    <RecordEditor
      title="The oral instruction's confirmation"
      description="The contractor's written confirmation that the oral instruction was given, whether it matches what was intended, and an objection where it does not. Each clock is read when its day is first recorded."
      fields={[hidden("id"), hidden("variationId"), { kind: "date", name: "contractorConfirmedOn", label: "Confirmation received on" }, answer("confirmationMatches", "It matches the instruction intended"), { kind: "date", name: "objectedOn", label: "Objected on" }, { kind: "textarea", name: "objectionNote", label: "The objection" }]}
      values={{ id, variationId, ...values }}
      action={recordOralLoop}
      submitLabel="Record"
      trigger={{ label: "Record the confirmation", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ measurement and daywork

export function MeasurementDrawer({ id, variationId, heading, people, sources, directions, today, blocker }: { id: string; variationId: string; heading: string; people: Option[]; sources: Option[]; directions: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Measure an item"
      description="One item under the instruction's heading, never merged with another. Its amount is the quantity × the rate (with the contract's percentage adjustment, where it has one), rounded once."
      size="lg"
      columns={2}
      fields={[
        hidden("id"),
        hidden("variationId"),
        { kind: "readonly", name: "headingShown", label: "Under the instruction's heading", text: heading },
        hidden("heading"),
        { kind: "text", name: "itemRef", label: "Item reference", required: true },
        { kind: "text", name: "description", label: "Item", required: true },
        choose("rateSource", "Where the rate comes from", sources),
        { kind: "text", name: "bqItemRef", label: "Contract item (bill or schedule of rates)", hint: "For a contract rate." },
        { kind: "text", name: "quantity", label: "Quantity", required: true, hint: "To at most three places." },
        { kind: "text", name: "unit", label: "Unit", required: true },
        { kind: "money", name: "baseRate", label: "Rate (RM)", required: true },
        { kind: "text", name: "adjustmentPct", label: "Contract's percentage adjustment (%)", hint: "Optional, for a contract rate (a reduction with a minus)." },
        choose("direction", "Addition or omission", directions),
        { kind: "date", name: "measuredOn", label: "Measured on", required: true },
        answer("coveredUp", "The work will be covered up"),
        { kind: "textarea", name: "recordsNote", label: "Detailed records", hint: "Required where the work will be covered up." },
        by("VariationMeasurement.person", "personId", people),
      ]}
      values={{ id, variationId, heading, measuredOn: today }}
      action={addMeasurement}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: "Measure an item", className: primary }}
    />
  );
}

export function RemoveMeasurementDrawer({ id, variationId, measurementId, label, blocker }: { id: string; variationId: string; measurementId: string; label: string; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="Kept, marked removed with the reason. Only while no Variation Order Certificate is raised from the instruction."
      fields={[hidden("id"), hidden("variationId"), hidden("measurementId"), { kind: "textarea", name: "removedReason", label: "Why it is removed", required: true }]}
      values={{ id, variationId, measurementId }}
      action={removeMeasurement}
      submitLabel="Remove"
      submitBlock={blocker}
      trigger={{ label: "Remove", className: ghost }}
    />
  );
}

export function DayworkDrawer({ id, variationId, people, today, values, blocker }: { id: string; variationId: string; people: Option[]; today: string | null; values?: Record<string, string | null>; blocker: string | null }) {
  const editing = !!values?.dayworkId;
  return (
    <RecordEditor
      title={editing ? "Daywork: agreement and substantiation" : "Record daywork"}
      description="Labour and plant time, checked and agreed with the contractor the same day it is worked (otherwise flagged), and the contractor's vouchers, receipts, wage books and timesheets received within the clock read when the record is made."
      columns={2}
      fields={[hidden("id"), hidden("variationId"), hidden("dayworkId"), { kind: "date", name: "workedOn", label: "Worked on", required: true }, { kind: "textarea", name: "description", label: "Labour and plant", required: true }, { kind: "date", name: "agreedOn", label: "Checked and agreed on" }, { kind: "text", name: "agreedWith", label: "Agreed with, for the contractor" }, { kind: "date", name: "substantiationReceivedOn", label: "Substantiation received on" }, by("DayworkRecord.person", "personId", people)]}
      values={{ id, variationId, workedOn: today, ...(values ?? {}) }}
      action={recordDaywork}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: editing ? "Update" : "Record daywork", className: editing ? ghost : secondary }}
    />
  );
}

// ------------------------------------------------------------------ the order and the adjustment

export function OrderDrawer({ id, variationId, description, clauses, people, blocker }: { id: string; variationId: string; description: string; clauses: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise the Variation Order Certificate"
      description="From the items measured under the instruction, frozen with it. Its description is the instruction's, word for word. It is signed on its page once the variation's approved routes cover its value; a contractor who refuses to sign is recorded as a dispute and does not stop it."
      fields={[hidden("id"), hidden("variationId"), { kind: "textarea", name: "orderDescription", label: "Description (the instruction's)", required: true }, choose("valuationClauseId", "Valued under", clauses, clauses.length ? undefined : "No clauses in the clause library: add them under Configuration › Tender documents."), by("VariationCertificate.person", "personId", people)]}
      values={{ id, variationId, orderDescription: description }}
      action={raiseVariationOrder}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={{ label: "Raise the certificate", className: primary }}
    />
  );
}

export function AdjustmentDrawer({ id, orders, triggers, directions, people, blocker }: { id: string; orders: Option[]; triggers: Option[]; directions: Option[]; people: Option[]; blocker: string | null }) {
  const other = (n: number): Field[] => [
    { kind: "note", text: `Other adjustment ${n} (optional): a trigger the contract's type provides for, with the basis of its calculation.` },
    { kind: "select", name: `other${n}Trigger`, label: "Trigger", placeholder: "None", options: triggers },
    { kind: "select", name: `other${n}Direction`, label: "Addition or omission", placeholder: "Choose", options: directions },
    { kind: "money", name: `other${n}Amount`, label: "Amount (RM)" },
    { kind: "text", name: `other${n}Reference`, label: "Reference" },
    { kind: "text", name: `other${n}Description`, label: "Description" },
    { kind: "textarea", name: `other${n}Basis`, label: "Basis of calculation" },
  ];
  return (
    <RecordEditor
      title="Raise an adjustment of the contract sum"
      description="Section 1.1: the issued Variation Order Certificates chosen; section 1.2: other adjustments. The totals, the revised contract sum (the original plus the issued adjustments before it, plus this) and the sum in words are worked out, never typed. One in progress at a time."
      size="lg"
      columns={2}
      fields={[hidden("id"), { kind: "tokens", name: "orderIds", label: "Variation Order Certificates (issued, not yet adjusted)", placeholder: orders.length ? "Choose" : "None to adjust", options: orders }, ...other(1), ...other(2), ...other(3), by("SumAdjustment.person", "personId", people)]}
      values={{ id }}
      action={raiseSumAdjustment}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={{ label: "Raise an adjustment", className: primary }}
    />
  );
}
