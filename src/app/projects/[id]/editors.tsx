import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import type { AwardTerm } from "@/lib/contract/award-correction";
import type { EnteredGroup } from "@/lib/contract/baseline";

import {
  acknowledgeCopy,
  addAmendment,
  addCorrection,
  addRate,
  answerConsultingEngineer,
  completeCheck,
  confirmBaseline,
  correctAwardTerm,
  correctBaseline,
  correctContractDate,
  decideLegal,
  despatchCopy,
  issueCopy,
  moveOriginal,
  recallCopy,
  recordBriefing,
  recordContractorSignature,
  recordReconciliation,
  recordRsajSignature,
  recordStamping,
  recordWcCheck,
  registerOriginal,
  reissueCopy,
  removeCheckLine,
  saveBaselineEntry,
  setAssemblyPart,
  startPreparation,
  submitLegal,
} from "./actions";

/**
 * The contract record's drawers (6.12). No field carries a default but the day, where an act is
 * recorded today. Every act is the signed-in officer's own; one made on paper is recorded for the holder by someone else, and is not signed (Phase 2b). Each act is judged again
 * by the server on locked rows; a drawer that cannot proceed says why beside its button.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
/// A person who is not the actor of the act: a custodian, a participant (a state or a roster, not an act).
const person = (name: string, label: string, people: Option[]): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose", options: people });
/// Who is acting: the signed-in officer, shown and not chosen. Where the slot may come from paper, `people` are who it may be recorded for.
const by = (slot: string, name: string, people: Option[], label?: string, dated = false): Field => actorField(slot, { name, people, label, dated });
const PROVENANCE: Field = {
  kind: "select",
  name: "provenance",
  label: "Where it came from",
  required: true,
  placeholder: "Choose: there is no default",
  options: [
    { value: "STATED", label: "Stated — written in a governing document" },
    { value: "OBSERVED", label: "Observed — seen in practice" },
    { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
  ],
};
const METHOD: Field = {
  kind: "select",
  name: "method",
  label: "How it went",
  placeholder: "Not yet sent",
  options: [
    { value: "BY_HAND", label: "By hand" },
    { value: "REGISTERED_POST", label: "Registered post" },
    { value: "COLLECTION", label: "Collected" },
  ],
};

// ------------------------------------------------------------------ preparation

export function StartPreparationDrawer({ id, blocker, frozen }: { id: string; blocker: string | null; frozen: string }) {
  return (
    <RecordEditor
      title="Start preparing the contract"
      description={`Freezes the formation basis: ${frozen}. Builds the baseline draft.`}
      fields={[hidden("id")]}
      values={{ id }}
      action={startPreparation}
      submitLabel="Start preparation"
      submitBlock={blocker}
      trigger={{ label: "Start preparation", className: primary }}
    />
  );
}

export function PartDrawer({ id, part }: { id: string; part: { id: string; label: string; state: string; statement: string } }) {
  return (
    <RecordEditor
      title={part.label}
      description="Marks this part cancelled by an accepted alternative."
      fields={[
        hidden("id"),
        hidden("partId"),
        { kind: "select", name: "state", label: "In the Contract Document", required: true, options: [{ value: "READY", label: "As tendered" }, { value: "CANCELLED_BY_ALTERNATIVE", label: "Cancelled by the accepted alternative" }] },
        { kind: "textarea", name: "cancelledStatement", label: "What the alternative cancels", hint: "Required when cancelled." },
      ]}
      values={{ id, partId: part.id, state: part.state, cancelledStatement: part.statement }}
      showWhen={{ cancelledStatement: { name: "state", in: ["CANCELLED_BY_ALTERNATIVE"] } }}
      action={setAssemblyPart}
      trigger={{ label: "Edit", className: ghost, ariaLabel: `Edit ${part.label}` }}
    />
  );
}

// ------------------------------------------------------------------ reconciliation

export function ReconciliationDrawer({ id, comparison, label, people, today, current }: { id: string; comparison: string; label: string; people: Option[]; today: string | null; current?: { outcome: string; personId: string; checkedOn: string; note: string } }) {
  return (
    <RecordEditor
      title={label}
      description="Lists every tender-stage addendum taken in."
      fields={[
        hidden("id"),
        hidden("comparison"),
        { kind: "select", name: "outcome", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "MATCHES", label: "Identical" }, { value: "AMENDED", label: "Amended: amendments follow, each signed by both" }] },
        by("ContractReconciliation.checkedBy", "personId", people),
        { kind: "date", name: "checkedOn", label: "Checked on", required: true },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, comparison, checkedOn: current?.checkedOn ?? today, ...(current ? { outcome: current.outcome, personId: current.personId, note: current.note } : {}) }}
      action={recordReconciliation}
      trigger={current ? { label: "Record again", className: ghost, ariaLabel: `Record ${label} again` } : { label: "Record", className: secondary, ariaLabel: `Record ${label}` }}
    />
  );
}

export function AmendmentDrawer({ id, reconciliationId, people, today }: { id: string; reconciliationId: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record an amendment"
      description="Signed by the contractor's signatory and the preparing officer. Paper signatures are recorded, not signed."
      columns={2}
      fields={[
        hidden("id"),
        hidden("reconciliationId"),
        { kind: "textarea", name: "description", label: "What it amends", required: true },
        { kind: "text", name: "contractorSignatoryName", label: "Signed for the contractor by", required: true },
        { kind: "date", name: "contractorSignedOn", label: "Contractor signed on", required: true },
        by("ReconciliationAmendment.officer", "officerPersonId", people, undefined, true),
        { kind: "date", name: "officerSignedOn", label: "Officer signed on", required: true },
      ]}
      values={{ id, reconciliationId, contractorSignedOn: today, officerSignedOn: today }}
      action={addAmendment}
      trigger={{ label: "Add amendment", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ checks

export function CorrectionDrawer({ id, checkId }: { id: string; checkId: string }) {
  return (
    <RecordEditor
      title="Record an arithmetical correction"
      description="As tendered and as corrected. The contract sum stands."
      columns={2}
      fields={[
        hidden("id"),
        hidden("checkId"),
        { kind: "text", name: "itemRef", label: "Item", required: true, mono: true },
        { kind: "text", name: "description", label: "Description" },
        { kind: "money", name: "tendered", label: "As tendered", required: true },
        { kind: "money", name: "corrected", label: "Corrected", required: true },
        { kind: "textarea", name: "reason", label: "Why", required: true },
      ]}
      values={{ id, checkId }}
      action={addCorrection}
      trigger={{ label: "Add correction", className: ghost }}
    />
  );
}

export function RateDrawer({ id, checkId }: { id: string; checkId: string }) {
  return (
    <RecordEditor
      title="Compare a rate"
      description="The estimate rate is SULIT and kept out of the trail."
      columns={2}
      fields={[
        hidden("id"),
        hidden("checkId"),
        { kind: "text", name: "itemRef", label: "Item", required: true, mono: true },
        { kind: "text", name: "description", label: "Description" },
        { kind: "money", name: "tenderedRate", label: "Tendered rate", required: true },
        { kind: "money", name: "estimateRate", label: "Estimate rate (SULIT)", required: true },
        { kind: "switch", name: "provisional", label: "Provisionally measured work" },
      ]}
      values={{ id, checkId }}
      action={addRate}
      trigger={{ label: "Add rate", className: ghost }}
    />
  );
}

export function RemoveLineDrawer({ id, checkId, lineId, label }: { id: string; checkId: string; lineId: string; label: string }) {
  return (
    <RecordEditor
      title={`Take off ${label}`}
      description="The trail keeps it."
      fields={[hidden("id"), hidden("checkId"), hidden("lineId")]}
      values={{ id, checkId, lineId }}
      destructive={{ reasonLabel: "Why it is taken off" }}
      action={removeCheckLine}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Take off", className: ghost, ariaLabel: `Take off ${label}` }}
    />
  );
}

export function CompleteCheckDrawer({ id, checkId, label, people, today, blocker, noteHint }: { id: string; checkId: string; label: string; people: Option[]; today: string | null; blocker: string | null; noteHint: string }) {
  return (
    <RecordEditor
      title={`Complete: ${label}`}
      description="Its lines no longer change."
      fields={[hidden("id"), hidden("checkId"), by("FormationCheck.completedBy", "personId", people), { kind: "date", name: "completedOn", label: "Completed on", required: true }, { kind: "textarea", name: "note", label: "Note", hint: noteHint }]}
      values={{ id, checkId, completedOn: today }}
      action={completeCheck}
      submitBlock={blocker}
      trigger={{ label: "Record complete", className: secondary, ariaLabel: `Record complete: ${label}` }}
    />
  );
}

// ------------------------------------------------------------------ legal review

export function SubmitLegalDrawer({ id, office, people, blocker, documents }: { id: string; office: string; people: Option[]; blocker: string | null; documents: string }) {
  return (
    <RecordEditor
      title={`Send to ${office}`}
      description={`Pins the versions now attached: ${documents}.`}
      fields={[hidden("id"), by("LegalReview.submittedBy", "personId", people)]}
      values={{ id }}
      action={submitLegal}
      submitLabel="Send"
      submitBlock={blocker}
      trigger={{ label: "Send for legal review", className: primary }}
    />
  );
}

export function DecideLegalDrawer({ id, iteration, people, today }: { id: string; iteration: number; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`The legal office's decision on iteration ${iteration}`}
      description="Endorsed, or sent back with comments."
      fields={[
        hidden("id"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "ENDORSED", label: "Endorsed" }, { value: "RETURNED", label: "Returned for amendment" }] },
        by("LegalReview.reviewer", "reviewerPersonId", people),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true },
        { kind: "textarea", name: "comments", label: "Comments" },
      ]}
      values={{ id, decidedOn: today }}
      action={decideLegal}
      trigger={{ label: "Record the decision", className: primary }}
    />
  );
}

// ------------------------------------------------------------------ signing

export function WcCheckDrawer({ id, policyId, label, people, today }: { id: string; policyId: string; label: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record the uncovered-wages check"
      description={`${label}: uncovered wages declared, checked before signature. Not judged.`}
      fields={[hidden("id"), hidden("policyId"), by("InsurancePolicy.wcCheckedBy", "personId", people), { kind: "date", name: "checkedOn", label: "Checked on", required: true }, { kind: "money", name: "declaredWages", label: "Declared uncovered wages", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, policyId, checkedOn: today }}
      action={recordWcCheck}
      trigger={{ label: "Record the wages check", className: secondary }}
    />
  );
}

export function ContractorSignatureDrawer({ id, today, blocker }: { id: string; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record the contractor's signature"
      description="Named by you, not signed. Identity numbers are masked elsewhere."
      columns={2}
      fields={[
        hidden("id"),
        { kind: "text", name: "name", label: "Signatory's full name", required: true },
        { kind: "text", name: "icNumber", label: "Signatory's identity-card number", required: true, mono: true, placeholder: "000000-00-0000" },
        { kind: "text", name: "capacity", label: "Capacity", placeholder: "e.g. Director" },
        { kind: "date", name: "signedOn", label: "Signed on", required: true },
        { kind: "text", name: "witnessName", label: "Witness's full name", required: true },
        { kind: "text", name: "witnessIcNumber", label: "Witness's identity-card number", required: true, mono: true, placeholder: "000000-00-0000" },
      ]}
      values={{ id, signedOn: today }}
      action={recordContractorSignature}
      submitBlock={blocker}
      trigger={{ label: "Record the contractor's signature", className: secondary }}
    />
  );
}

export function RsajSignatureDrawer({ id, office, people, blocker, contractDate }: { id: string; office: string; people: Option[]; blocker: string | null; contractDate: string }) {
  return (
    <RecordEditor
      title="Record the signature for the employer"
      description={`Signed by the holder of ${office}, or a delegate. Contract Date is today, ${contractDate}. A late signature is corrected afterwards.`}
      fields={[hidden("id"), by("ContractSignature.person", "personId", people)]}
      values={{ id }}
      action={recordRsajSignature}
      submitLabel="Record and execute"
      submitBlock={blocker}
      trigger={{ label: "Record the signature and execute", className: primary }}
    />
  );
}

export function CorrectDateDrawer({ id, current }: { id: string; current: string }) {
  return (
    <RecordEditor
      title="Correct the Contract Date"
      description={`Earlier than ${current} only, not before the contractor signed. Audited, with the reason.`}
      fields={[hidden("id"), { kind: "date", name: "contractDate", label: "The day it was signed", required: true }]}
      values={{ id }}
      reason={{ label: "Why the day differs from signing" }}
      action={correctContractDate}
      trigger={{ label: "Correct the date", className: ghost }}
    />
  );
}

export function StampingDrawer({ id, today }: { id: string; today: string | null }) {
  return (
    <RecordEditor
      title="Record stamping at LHDN"
      description="Executes the contract."
      fields={[hidden("id"), { kind: "date", name: "stampedOn", label: "Stamped on", required: true }, { kind: "text", name: "stampingRef", label: "Stamping reference", required: true, mono: true }]}
      values={{ id, stampedOn: today }}
      action={recordStamping}
      trigger={{ label: "Record stamping", className: primary }}
    />
  );
}

export function BriefingDrawer({ id, people, today }: { id: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record the Integrity Pact briefing"
      description="Records the briefing on the anti-corruption clause."
      fields={[
        hidden("id"),
        { kind: "date", name: "heldOn", label: "Held on", required: true },
        { kind: "tokens", name: "participantIds", label: "For the employer", options: people, hint: "Who attended for the employer." },
        { kind: "textarea", name: "contractorAttendees", label: "For the contractor", hint: "One name a line." },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, heldOn: today }}
      action={recordBriefing}
      trigger={{ label: "Record the briefing", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ copies and custody

export function ConsultingEngineerDrawer({ id, current }: { id: string; current: boolean | null }) {
  return (
    <RecordEditor
      title="A consulting engineer on this contract?"
      description="Decides whether their copy is listed."
      fields={[hidden("id"), { kind: "select", name: "consultingEngineer", label: "Consulting engineer engaged", required: true, placeholder: "Not answered", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }]}
      values={{ id, consultingEngineer: current == null ? null : current ? "yes" : "no" }}
      action={answerConsultingEngineer}
      trigger={{ label: current == null ? "Answer" : "Change", className: current == null ? secondary : ghost }}
    />
  );
}

export function IssueCopyDrawer({ id, recipients, today, blocker }: { id: string; recipients: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Issue a controlled copy"
      description="Numbered, stamped and logged."
      fields={[hidden("id"), { kind: "select", name: "recipientId", label: "Recipient", required: true, placeholder: "Choose", options: recipients }, { kind: "text", name: "addressedTo", label: "Addressed to", required: true }, METHOD, { kind: "date", name: "despatchedOn", label: "Despatched on" }]}
      values={{ id, despatchedOn: today }}
      action={issueCopy}
      submitBlock={blocker}
      trigger={{ label: "Issue a copy", className: secondary }}
    />
  );
}

export function DespatchCopyDrawer({ id, copyId, copyNo, today }: { id: string; copyId: string; copyNo: number; today: string | null }) {
  return <RecordEditor title={`Copy ${copyNo}: despatch`} fields={[hidden("id"), hidden("copyId"), { ...METHOD, required: true, placeholder: "Choose" } as Field, { kind: "date", name: "despatchedOn", label: "Despatched on", required: true }]} values={{ id, copyId, despatchedOn: today }} action={despatchCopy} trigger={{ label: "Despatched", className: ghost, ariaLabel: `Copy ${copyNo} despatched` }} />;
}

export function AcknowledgeCopyDrawer({ id, copyId, copyNo, today }: { id: string; copyId: string; copyNo: number; today: string | null }) {
  return <RecordEditor title={`Copy ${copyNo}: acknowledged`} fields={[hidden("id"), hidden("copyId"), { kind: "date", name: "acknowledgedOn", label: "Acknowledged on", required: true }]} values={{ id, copyId, acknowledgedOn: today }} action={acknowledgeCopy} trigger={{ label: "Acknowledged", className: ghost, ariaLabel: `Copy ${copyNo} acknowledged` }} />;
}

export function RecallCopyDrawer({ id, copyId, copyNo, today }: { id: string; copyId: string; copyNo: number; today: string | null }) {
  return (
    <RecordEditor
      title={`Recall copy ${copyNo}`}
      description="The recalled copy stays on the register."
      fields={[hidden("id"), hidden("copyId"), { kind: "date", name: "recalledOn", label: "Recalled on", required: true }]}
      values={{ id, copyId, recalledOn: today }}
      destructive={{ reasonLabel: "Why it is recalled" }}
      action={recallCopy}
      submitLabel="Recall"
      cancelLabel="Keep it"
      trigger={{ label: "Recall", className: ghost, ariaLabel: `Recall copy ${copyNo}` }}
    />
  );
}

export function ReissueCopyDrawer({ id, copyId, copyNo, addressedTo, today }: { id: string; copyId: string; copyNo: number; addressedTo: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Reissue copy ${copyNo}`}
      description="Takes a new number."
      fields={[hidden("id"), hidden("copyId"), { kind: "text", name: "addressedTo", label: "Addressed to", required: true }, METHOD, { kind: "date", name: "despatchedOn", label: "Despatched on" }]}
      values={{ id, copyId, addressedTo, despatchedOn: today }}
      action={reissueCopy}
      trigger={{ label: "Reissue", className: ghost, ariaLabel: `Reissue copy ${copyNo}` }}
    />
  );
}

export function RegisterOriginalDrawer({ id, originals, people }: { id: string; originals: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title="Register an original in custody"
      description="Where it is held, and by whom."
      fields={[
        hidden("id"),
        { kind: "select", name: "original", label: "Original", required: true, placeholder: "Choose", options: originals },
        { kind: "text", name: "location", label: "Held at", required: true },
        person("custodianPersonId", "Custodian", people),
      ]}
      values={{ id }}
      action={registerOriginal}
      trigger={{ label: "Register an original", className: secondary }}
    />
  );
}

export function MoveOriginalDrawer({ id, itemId, label, out, people, today }: { id: string; itemId: string; label: string; out: boolean; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`${out ? "Check in" : "Check out"}: ${label}`}
      fields={[hidden("id"), hidden("itemId"), hidden("direction"), by("CustodyMovement.person", "personId", people, out ? "Returned by" : "Taken by"), { kind: "date", name: "on", label: "On", required: true }, { kind: "text", name: "purpose", label: "Purpose" }]}
      values={{ id, itemId, direction: out ? "IN" : "OUT", on: today }}
      action={moveOriginal}
      trigger={{ label: out ? "Check in" : "Check out", className: ghost, ariaLabel: `${out ? "Check in" : "Check out"} ${label}` }}
    />
  );
}

// ------------------------------------------------------------------ baseline

const GROUP_FIELDS: Record<EnteredGroup, Field[]> = {
  lad: [
    { kind: "select", name: "ladKind", label: "Stated as", required: true, placeholder: "Choose", options: [{ value: "AMOUNT_PER_DAY", label: "An amount a day" }, { value: "PERCENT_OF_SUM_PER_DAY", label: "A percentage of the contract sum a day" }] },
    { kind: "money", name: "ladAmount", label: "Amount a day" },
    { kind: "text", name: "ladPct", label: "Percentage of the contract sum a day", placeholder: "e.g. 0.025" },
  ],
  dlp: [
    { kind: "select", name: "dlpApplies", label: "A defects liability period applies", required: true, placeholder: "Choose", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "None" }] },
    { kind: "number", name: "dlpMonths", label: "Months", min: 1 },
  ],
  retention: [
    { kind: "select", name: "retentionApplies", label: "Retention applies", required: true, placeholder: "Choose", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    { kind: "text", name: "retentionPercent", label: "Retention, % of each certificate" },
    { kind: "text", name: "retentionCapPercent", label: "Cap, % of the contract sum" },
  ],
  sums: [
    { kind: "money", name: "pcSums", label: "Prime cost sums", required: true },
    { kind: "money", name: "provisionalSums", label: "Provisional sums", required: true },
  ],
  firstInterim: [{ kind: "money", name: "amount", label: "Minimum of the first interim certificate", required: true }],
  subsequentInterim: [{ kind: "money", name: "amount", label: "Minimum of each later interim certificate", required: true }],
  honourDays: [{ kind: "number", name: "days", label: "Days to honour a certificate", required: true, min: 1 }],
  sectional: [
    { kind: "select", name: "sectionalApplies", label: "Sectional completion applies", required: true, placeholder: "Choose", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    { kind: "textarea", name: "sections", label: "Sections", hint: 'One a line: "reference | description | amount a day".' },
  ],
  unfixedMaterials: [{ kind: "text", name: "percent", label: "Unfixed materials allowance, %", required: true }],
  onCost: [{ kind: "text", name: "percent", label: "On-cost, %", required: true }],
  designWork: [{ kind: "money", name: "amount", label: "Design work value", required: true }],
};

const SHOW_WHEN: Partial<Record<EnteredGroup, Record<string, { name: string; in: string[] }>>> = {
  lad: { ladAmount: { name: "ladKind", in: ["AMOUNT_PER_DAY"] }, ladPct: { name: "ladKind", in: ["PERCENT_OF_SUM_PER_DAY"] } },
  dlp: { dlpMonths: { name: "dlpApplies", in: ["yes"] } },
  retention: { retentionPercent: { name: "retentionApplies", in: ["yes"] }, retentionCapPercent: { name: "retentionApplies", in: ["yes"] } },
  sectional: { sections: { name: "sectionalApplies", in: ["yes"] } },
};

export function BaselineEntryDrawer({ id, group, label, mode }: { id: string; group: EnteredGroup; label: string; mode: "draft" | "correct" }) {
  const correcting = mode === "correct";
  return (
    <RecordEditor
      title={correcting ? `Correct: ${label}` : `Enter: ${label}`}
      description={
        correcting
          ? "A correction is a new version. Earlier versions stay."
          : "Say where it came from. There is no default."
      }
      fields={[hidden("id"), hidden("group"), ...GROUP_FIELDS[group], PROVENANCE, ...(correcting ? [] : [{ kind: "textarea", name: "note", label: "Note" } as Field])]}
      values={{ id, group }}
      showWhen={SHOW_WHEN[group]}
      {...(correcting ? { reason: { label: "Why it is corrected" } } : {})}
      action={correcting ? correctBaseline : saveBaselineEntry}
      trigger={{ label: correcting ? "Correct" : "Enter", className: ghost, ariaLabel: `${correcting ? "Correct" : "Enter"} ${label}` }}
    />
  );
}

export function ConfirmBaselineDrawer({ id, blocker }: { id: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Confirm the baseline"
      description="Version 1. Never edited afterwards; changes are corrections with a reason."
      fields={[hidden("id")]}
      values={{ id }}
      action={confirmBaseline}
      submitLabel="Confirm"
      submitBlock={blocker}
      trigger={{ label: "Confirm the baseline", className: primary }}
    />
  );
}

/// 612-C1: the fields for each of the award's terms, as the corrected value is given.
const TERM_FIELDS: Readonly<Record<AwardTerm, Field[]>> = {
  LAD: [{ kind: "money", name: "ladAmount", label: "Per day, as the letter states", required: true }],
  DLP: [{ kind: "number", name: "dlpMonths", label: "Months; 0 for none", min: 0, required: true }],
  RETENTION: [
    { kind: "text", name: "retentionPercent", label: "Retention percentage of each certificate", placeholder: "e.g. 10", required: true },
    { kind: "text", name: "retentionCapPercent", label: "Capped at, percentage of the contract sum", placeholder: "e.g. 5", required: true },
  ],
  COMPLETION: [
    { kind: "number", name: "completionPeriod", label: "Completion period, as the signed letter states", min: 1, required: true },
    { kind: "select", name: "completionUnit", label: "In", placeholder: "Choose", required: true, options: [{ value: "DAYS", label: "Days" }, { value: "WEEKS", label: "Weeks" }, { value: "MONTHS", label: "Months" }] },
  ],
};

/**
 * 612-C1: correct one of the award's recorded terms after issue, where it was recorded wrongly from the signed
 * letter. Says plainly what it does not do: it never changes the issued letter or a certificate already issued,
 * and a change to the terms themselves is a variation.
 */
export function AwardTermDrawer({ id, term, label, current }: { id: string; term: AwardTerm; label: string; current: string }) {
  return (
    <RecordEditor
      title={`Correct the award's term: ${label}`}
      description={`Recorded as ${current}. Only for a term recorded wrongly from the signed letter. A change to the terms is a variation.`}
      fields={[hidden("id"), hidden("term"), ...TERM_FIELDS[term]]}
      values={{ id, term }}
      reason={{ label: "Why it was recorded wrongly" }}
      action={correctAwardTerm}
      submitLabel="Correct the term"
      trigger={{ label: "Correct the award's term", className: ghost, ariaLabel: `Correct the award's term: ${label}` }}
    />
  );
}
