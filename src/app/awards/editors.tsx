import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";

import { INSURANCE_KIND_LABEL, RETURN_DRAWER_NOTE } from "@/lib/award/labels";

import { Blocked } from "../requisitions/editors";
import {
  addCondition,
  cancelAward,
  chooseAwardRejection,
  citeAppointmentDecision,
  decideAppointmentStep,
  issueAward,
  lodgePolicy,
  lodgeSecurity,
  recordCommencement,
  recordCommitment,
  recordDespatch,
  recordReturn,
  reviewPolicy,
  reviewSecurity,
  satisfyCondition,
  submitAward,
  updateAwardDetails,
  updateAwardTerms,
} from "./actions";

/**
 * The drawers of an award. Fields are data; every rule sits in the action and the pure
 * checks behind it. Where the checks already say an act cannot proceed, the control is
 * disabled with the reason stated under the header's actions — or, for Issue, not
 * rendered at all until nothing is outstanding (FR-AWD-001).
 */

type Option = { value: string; label: string };
type Values = Record<string, string | boolean | null>;
const hidden = (name: string): Field => ({ kind: "hidden", name });
const YES_NO: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const PROVENANCE: Option[] = [
  { value: "STATED", label: "Stated — written in a governing document" },
  { value: "OBSERVED", label: "Observed — seen in practice, such as an award pack" },
  { value: "ASSUMED", label: "Assumed — a working reading, needs sign-off" },
];
const UNITS: Option[] = [
  { value: "DAYS", label: "Days" },
  { value: "WEEKS", label: "Weeks" },
  { value: "MONTHS", label: "Months" },
];

/// Id of the header note that states why a header action is unavailable.
export const AWARD_NOTE_ID = "award-actions-note";

/// 6.7 (C-7): where the exercise's openings apply, the awardee is picked from the bidders carried to evaluation.
export function detailFields(parties?: Option[], recommended?: { valueText: string } | null): Field[] {
  return [
    ...(parties ? [{ kind: "select", name: "awardeePartyId", label: "Bidder carried to evaluation", required: true, placeholder: "Choose", options: parties, hint: "The award names a bidder the opening carried to evaluation; it is compared as that bidder, never by the words typed below." } as Field] : []),
    { kind: "text", name: "awardeeName", label: "Awardee", required: true, hint: "As registered: the name, number and address are kept as written. The award's link to the supplier register follows its bidder's link (or is made from the supplier's record where there is no bidder)." },
    { kind: "text", name: "awardeeRegistrationNo", label: "Registration number" },
    { kind: "textarea", name: "awardeeAddress", label: "Address" },
    { kind: "money", name: "awardedValue", label: "Awarded value", required: true, hint: "Within what the requisition's approval covers, and in the exercise's band." },
    { kind: "number", name: "completionPeriod", label: "Completion period", required: true, min: 1 },
    { kind: "select", name: "completionUnit", label: "Counted in", required: true, placeholder: "Choose", options: UNITS },
    // 6.8 (E-9): each figure that differs from the evaluation's recommendation carries its reason.
    ...(recommended
      ? ([
          { kind: "textarea", name: "recValueDiffersReason", label: "Why the value differs from the recommendation", hint: `Recommended: ${recommended.valueText}. Only where the awarded value is not that.` },
          { kind: "textarea", name: "recPeriodDiffersReason", label: "Why the period differs from the recommendation", hint: "Only where the period is not the recommended one." },
        ] as Field[])
      : []),
  ];
}

export function EditDetailsDrawer({ id, values, parties, recommended }: { id: string; values: Values; parties?: Option[]; recommended?: { valueText: string } | null }) {
  return (
    <RecordEditor
      title="Edit the award"
      description="The awardee, the value and the period are what the appointment approves, so they change only while the award is a draft."
      fields={[hidden("id"), ...detailFields(parties, recommended)]}
      values={{ id, ...values }}
      action={updateAwardDetails}
      submitLabel="Save"
      trigger={{ label: "Edit", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function EditTermsDrawer({
  id,
  values,
  regulatedLabel,
  asked,
  label = "Edit terms",
  tender = null,
}: {
  id: string;
  values: Values;
  regulatedLabel: string | null;
  /// Whether the exercise's terms band asks for retention and a defects liability
  /// period; false says so beside the field, which stays on the form.
  asked: { retention: boolean | null; dlp: boolean | null };
  label?: string;
  /// 64-C4: what the frozen tender states for each term, in words (null: states nothing).
  /// Not given: the exercise froze no Appendix, and the form is as before.
  tender?: { lad: string | null; dlp: string | null; regulated: string | null } | null;
}) {
  const bond = { name: "bondRequired", in: ["yes"] } as const;
  const fromTender = (t: string | null | undefined, words = "The tender Appendix states") => (t ? `${words}: ${t}. Stating it otherwise needs a reason, below.` : undefined);
  const reasons: Field[] = tender
    ? [
        { kind: "note", text: "Where a term differs from the tender, say why. Each reason is kept in the award's history and shown beside the term; the instrument is not issued while a difference has none." },
        ...(tender.lad ? [{ kind: "textarea", name: "ladDiffersReason", label: "Why the liquidated damages differ from the tender Appendix", hint: "Only where they differ. Left empty where they match." } as const] : []),
        ...(tender.dlp ? [{ kind: "textarea", name: "dlpDiffersReason", label: "Why the defects liability period differs from the tender Appendix", hint: "Only where it differs." } as const] : []),
        ...(tender.regulated ? [{ kind: "textarea", name: "regulatedDiffersReason", label: "Why the regulated-activity answer differs from the tender's", hint: "Only where it differs." } as const] : []),
      ]
    : [];
  return (
    <RecordEditor
      title="The terms, the bond and the start"
      description={
        tender
          ? "The terms the tender Appendix states were filled in from it when the award was opened; stating one otherwise needs a reason. Everything else is decided for this award: an empty field is not set, and the instrument cannot be issued on what it needs until it is."
          : "Each is decided for this award, with where it came from. Nothing is filled in for you: an empty field is not set, and the instrument cannot be issued on what it needs until it is."
      }
      fields={[
        hidden("id"),
        { kind: "date", name: "startDate", label: "Stated start date", hint: "The commencement clock and the insurance period run from it." },
        {
          kind: "select",
          name: "regulatedActivity",
          label: regulatedLabel ? `Is this ${regulatedLabel.toLowerCase()}?` : "Are the works the regulated activity?",
          placeholder: "Not answered",
          options: YES_NO,
          hint: fromTender(tender?.regulated, "The tender answered") ?? "A recipient of the instrument's copies may depend on it.",
        },
        { kind: "note", text: "The performance bond: decided for this contract, never filled in for you." },
        { kind: "select", name: "bondRequired", label: "Performance bond required", placeholder: "Not decided", options: YES_NO },
        { kind: "textarea", name: "bondNotRequiredReason", label: "Why no bond is required", hint: "Shown on the conditions before signing." },
        {
          kind: "select",
          name: "bondBasis",
          label: "What the bond is a percentage of",
          placeholder: "Not set",
          options: [
            { value: "CONTRACT_PRICE", label: "The contract price" },
            { value: "ANNUAL_VALUE", label: "A one-year value, entered below" },
            { value: "STATED_AMOUNT", label: "A stated amount, entered below" },
          ],
        },
        { kind: "text", name: "bondPercent", label: "Bond percentage", placeholder: "e.g. 5", hint: "More than 0. For a stated amount, leave it empty." },
        { kind: "money", name: "bondBasisAmount", label: "One-year value, or the stated amount", hint: "Entered, never worked out for you: a figure from the sum and period is shown beside it for comparison." },
        { kind: "number", name: "bondValidityExtraMonths", label: "Months it must run past completion", min: 0 },
        { kind: "select", name: "bondBasisProvenance", label: "Where the bond decision came from", placeholder: "Not recorded", options: PROVENANCE },
        { kind: "textarea", name: "bondBasisNote", label: "Bond note" },
        { kind: "note", text: "The letter's terms, quoted by the instrument." },
        { kind: "money", name: "ladAmount", label: "Liquidated damages", hint: fromTender(tender?.lad) },
        {
          kind: "select",
          name: "ladUnit",
          label: "Liquidated damages per",
          placeholder: "Not set",
          options: [
            { value: "per day", label: "Per day" },
            { value: "per week", label: "Per week" },
            { value: "per month", label: "Per month" },
          ],
          orphanLabel: "As recorded before",
        },
        // Always on the form, so a save never clears them: where the terms band does not ask, it says so.
        { kind: "text", name: "retentionPercent", label: "Retention percentage", placeholder: "e.g. 5", hint: asked.retention === false ? "Not asked by the exercise's terms band." : undefined },
        { kind: "text", name: "retentionCapPercent", label: "Retention limit, percentage of the contract sum", placeholder: "e.g. 5" },
        { kind: "number", name: "dlpMonths", label: "Defects liability period, months", min: 0, hint: fromTender(tender?.dlp === "None" ? "none (0 months)" : tender?.dlp) ?? (asked.dlp === false ? "Not asked by the exercise's terms band; the insurance period still counts it." : undefined) },
        { kind: "select", name: "termsProvenance", label: "Where the terms came from", placeholder: "Not recorded", options: PROVENANCE },
        {
          kind: "select",
          name: "wcBasis",
          label: "How workmen's compensation is calculated",
          placeholder: "Not set",
          options: [
            { value: "UNCOVERED_WAGES", label: "On the wages of employees not covered by social security" },
            { value: "PERCENT_OF_CONTRACT", label: "As a percentage of the contract sum" },
          ],
          hint: "Chosen for this award. On uncovered wages the declared sum cannot be checked, so the policy never counts as met.",
        },
        ...reasons,
      ]}
      showWhen={{
        bondNotRequiredReason: { name: "bondRequired", in: ["no"] },
        bondBasis: bond,
        bondPercent: bond,
        bondBasisAmount: bond,
        bondValidityExtraMonths: bond,
        bondBasisProvenance: { name: "bondRequired", in: ["yes", "no"] },
        bondBasisNote: { name: "bondRequired", in: ["yes", "no"] },
      }}
      values={{ id, ...values }}
      action={updateAwardTerms}
      submitLabel="Save terms"
      trigger={{ label, className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

export function SubmitAwardDrawer({ id, blocker, route }: { id: string; blocker: string | null; route: string[] }) {
  if (blocker) return <Blocked label="Send for approval" reason={blocker} primary noteId={AWARD_NOTE_ID} />;
  return (
    <RecordEditor
      title="Send the award for approval"
      description="Who approves the appointment is resolved now, for the awarded value, under the approval matrix in force, and kept with the rules it was judged under. The exercise's contract type is locked from here."
      fields={[hidden("id")]}
      values={{ id }}
      sections={
        route.length > 0 ? (
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px] text-ink-2">
            {route.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        ) : undefined
      }
      action={submitAward}
      submitLabel="Send for approval"
      trigger={{ label: "Send for approval", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function DecideStepDrawer({ id, stepId, roleLabel, act, done, people, today }: { id: string; stepId: string; roleLabel: string; act: string; done: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Record ${roleLabel}'s decision`}
      description={`The ${act.toLowerCase()} step of the appointment. Name who decided: recorded on their behalf, not signed. They must hold the office for the requisition's department, or a delegation of it.`}
      fields={[
        hidden("id"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused" }] },
        { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "receivedOn", label: "Received on", hint: "The day the matter reached them, from the routing sheet. Optional: not recorded is shown as such." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before the award went for approval." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ id, stepId, decidedOn: today }}
      action={decideAppointmentStep}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function CiteDecisionDrawer({ id, stepId, committee, matters }: { id: string; stepId: string; committee: string; matters: (Option & { disabled?: boolean })[] }) {
  if (matters.length === 0) return <Blocked label="Cite decision" reason={`No matter on this exercise has been tabled before the ${committee} yet. Table it at a sitting first.`} />;
  if (matters.every((m) => m.disabled)) return <Blocked label="Cite decision" reason={`The ${committee} has not decided the matter tabled on this exercise yet.`} />;
  return (
    <RecordEditor
      title={`Cite the ${committee}'s decision`}
      description="A committee's step is discharged by its decision on this exercise, as the sitting recorded it — never by a person."
      fields={[hidden("id"), hidden("stepId"), { kind: "select", name: "committeeDecisionId", label: "The matter", required: true, placeholder: "Choose", options: matters, hint: "A matter not decided yet is listed but cannot be chosen." }]}
      values={{ id, stepId }}
      action={citeAppointmentDecision}
      submitLabel="Cite decision"
      trigger={{ label: "Cite decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function RecordCommitmentDrawer({ id, indent, example, today }: { id: string; indent: boolean; example: string | null; today: string | null }) {
  return (
    <RecordEditor
      title="Record the commitment number"
      description={indent ? "The indent number the finance system returned, typed in as it reads. The portal never makes one up." : "The finance system's number for this commitment, typed in as it reads. The portal never makes one up."}
      fields={[
        hidden("id"),
        ...(indent ? [hidden("erpCommitmentKind")] : []),
        { kind: "text", name: "erpCommitmentNo", label: indent ? "Commitment number (the indent's)" : "Commitment number", required: true, mono: true, hint: example ? `For example ${example}.` : "No format is set for it, so it is not checked." },
        ...(indent ? [] : ([{ kind: "select", name: "erpCommitmentKind", label: "It is", required: true, placeholder: "Choose", options: [{ value: "INDENT", label: "An indent" }, { value: "PURCHASE_ORDER", label: "A purchase order" }] }] as Field[])),
        { kind: "date", name: "receivedOn", label: "Received on", required: true, hint: indent ? "The indent's validity runs from this day." : undefined },
      ]}
      values={{ id, erpCommitmentKind: indent ? "INDENT" : null, receivedOn: today }}
      action={recordCommitment}
      submitLabel="Record number"
      trigger={{ label: "Record commitment number", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function IssueDrawer({ id, signatory, people, today, summary }: { id: string; signatory: string; people: Option[]; today: string | null; summary: [string, string][] }) {
  return (
    <RecordEditor
      title="Issue the instrument"
      description={`Signed by the ${signatory}. Name who signs: recorded on their behalf, not signed in the portal. Issuing draws the contract number, freezes the documents' text, draws the distribution list and hands the case over.`}
      fields={[
        hidden("id"),
        { kind: "select", name: "signatoryPersonId", label: "Signed by", required: true, placeholder: "Choose", options: people, hint: `Only a holder of the ${signatory} office for the requisition's department on the day, or a delegate where the rule allows one.` },
        { kind: "date", name: "signedOn", label: "Signed on", required: true, hint: "Not after today." },
      ]}
      values={{ id, signedOn: today }}
      sections={
        <dl className="grid gap-x-4 gap-y-2.5 text-[13.5px] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          {summary.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-ink-3">{k}</dt>
              <dd className="min-w-0 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      }
      action={issueAward}
      submitLabel="Issue"
      trigger={{ label: "Issue", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function DespatchDrawer({ id, row }: { id: string; row: { id: string; name: string; values: Values } }) {
  return (
    <RecordEditor
      title={`The copy for ${row.name}`}
      description="How it went, and when. A copy sent by registered post needs its consignment reference; a collection records the day it was collected."
      fields={[
        hidden("id"),
        hidden("distributionId"),
        { kind: "select", name: "method", label: "How it went", required: true, placeholder: "Choose", options: [{ value: "REGISTERED_POST", label: "Registered post" }, { value: "COLLECTION", label: "Collected" }, { value: "BY_HAND", label: "By hand" }] },
        { kind: "text", name: "consignmentRef", label: "Consignment reference", mono: true },
        { kind: "date", name: "despatchedOn", label: "Despatched or collected on", required: true },
        { kind: "date", name: "acknowledgedOn", label: "Acknowledged on" },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id, distributionId: row.id, ...row.values }}
      action={recordDespatch}
      submitLabel="Record"
      trigger={{ label: row.values.despatchedOn ? "Edit" : "Record despatch", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function ReturnDrawer({ id, loa, values, people, correcting }: { id: string; loa: boolean; values: Values; people: Option[]; correcting: boolean }) {
  const loaFields: Field[] = [
    { kind: "date", name: "signedLetterReceivedOn", label: "Signed letter received" },
    { kind: "date", name: "declarationReceivedOn", label: "Signed successful bidder's declaration received" },
    { kind: "date", name: "authorisationReceivedOn", label: "Letter of authorisation received" },
  ];
  const pageFields: Field[] = [
    { kind: "note", text: "The acceptance page, as the contractor returned it. The identity card number is shown in full only here and on the Return tab; masking elsewhere is not access control until sign-in exists." },
    { kind: "date", name: "signedLetterReceivedOn", label: "Acceptance page received on" },
    { kind: "text", name: "signatoryName", label: "Contractor's signatory" },
    { kind: "text", name: "icNumber", label: "Identity card number", mono: true, hint: "Twelve digits, with or without the hyphens: 900101-14-5678." },
    { kind: "text", name: "occupation", label: "Occupation" },
    { kind: "textarea", name: "address", label: "Address" },
    { kind: "text", name: "capacity", label: "Signed in the capacity of" },
    { kind: "select", name: "contractorSigned", label: "Contractor signed", placeholder: "Not recorded", options: YES_NO },
    { kind: "select", name: "stampAffixed", label: "Company stamp affixed", placeholder: "Not recorded", options: YES_NO },
    { kind: "text", name: "witnessName", label: "Witness's full name" },
    { kind: "select", name: "witnessSigned", label: "Witness signed", placeholder: "Not recorded", options: YES_NO },
  ];
  return (
    <RecordEditor
      title={correcting ? "Correct the return" : "Record what came back"}
      description={
        correcting
          ? RETURN_DRAWER_NOTE.correcting
          : RETURN_DRAWER_NOTE.recording
      }
      fields={[
        hidden("id"),
        ...(loa ? loaFields : pageFields),
        { kind: "select", name: "receivedByPersonId", label: "Received by", placeholder: "Not recorded", options: people },
        { kind: "text", name: "whereHeld", label: "Where the originals are held" },
      ]}
      values={{ id, ...values }}
      action={recordReturn}
      reason={correcting ? { label: "Why it is corrected" } : undefined}
      submitLabel={correcting ? "Save correction" : "Record"}
      trigger={{ label: correcting ? "Correct the return" : "Record return", className: buttonClass(correcting ? "secondary" : "primary", "sm") }}
      size="lg"
    />
  );
}

export function CommencementDrawer({ id, today }: { id: string; today: string | null }) {
  return (
    <RecordEditor
      title="Record commencement"
      description="The day work started on site."
      fields={[hidden("id"), { kind: "date", name: "commencedOn", label: "Commenced on", required: true }]}
      values={{ id, commencedOn: today }}
      action={recordCommencement}
      submitLabel="Record"
      trigger={{ label: "Record commencement", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function CancelAwardDrawer({ id, issued, consequence }: { id: string; issued: boolean; consequence: string | null }) {
  return (
    <RecordEditor
      title="Cancel this award"
      description={
        issued
          ? `The award stays on record. Its contract is cancelled: the number stays allocated as a gap, and its registers are kept.${consequence ? ` ${consequence}` : ""}`
          : "The award stays on record, and an open approval route is withdrawn. Its value no longer counts against the requisition."
      }
      fields={[hidden("id")]}
      values={{ id }}
      action={cancelAward}
      destructive={{ reasonLabel: "Why it is cancelled" }}
      submitLabel="Cancel award"
      cancelLabel="Keep the award"
      trigger={{ label: "Cancel award", className: buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function AddConditionDrawer({ id, kinds }: { id: string; kinds: Option[] }) {
  if (kinds.length === 0) return <Blocked label="Add condition" reason="No conditions precedent are configured. Add them under Award controls." />;
  return (
    <RecordEditor
      title="Add a condition precedent"
      description="Something to be in place before work may start, with the day it is needed by."
      fields={[
        hidden("id"),
        { kind: "select", name: "kindId", label: "Condition", required: true, placeholder: "Choose", options: kinds },
        { kind: "text", name: "reference", label: "Reference" },
        { kind: "date", name: "requiredBy", label: "Required by" },
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ id }}
      action={addCondition}
      submitLabel="Add"
      trigger={{ label: "Add condition", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function SatisfyConditionDrawer({ id, conditionId, name, today }: { id: string; conditionId: string; name: string; today: string | null }) {
  return (
    <RecordEditor
      title={`${name}: met`}
      description="The day the condition was met."
      fields={[hidden("id"), hidden("conditionId"), { kind: "date", name: "satisfiedOn", label: "Met on", required: true }]}
      values={{ id, conditionId, satisfiedOn: today }}
      action={satisfyCondition}
      submitLabel="Record"
      trigger={{ label: "Record met", className: buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function LodgeSecurityDrawer({ id, issuers, today }: { id: string; issuers: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Lodge a security"
      description="As it was handed in. It is verified separately, against the approved list, the award's bond basis and its validity."
      fields={[
        hidden("id"),
        { kind: "select", name: "kind", label: "Kind", required: true, placeholder: "Choose", options: [{ value: "PERFORMANCE_BOND", label: "Performance bond" }, { value: "ADVANCE_PAYMENT_GUARANTEE", label: "Advance payment guarantee" }, { value: "DESIGN_GUARANTEE_BOND", label: "Design guarantee bond" }, { value: "RETENTION_BOND", label: "Retention bond" }] },
        { kind: "select", name: "form", label: "Form", required: true, placeholder: "Choose", options: [{ value: "BANK_GUARANTEE", label: "Bank guarantee" }, { value: "INSURANCE_GUARANTEE", label: "Insurance guarantee" }, { value: "CASH", label: "Cash" }, { value: "BANKERS_DRAFT", label: "Banker's draft" }] },
        { kind: "select", name: "issuerId", label: "Issuer, from the approved list", placeholder: "Not on the list", options: issuers },
        { kind: "text", name: "issuerNameAsWritten", label: "Issuer as written on it" },
        { kind: "text", name: "instrumentRef", label: "Its reference", mono: true },
        { kind: "money", name: "value", label: "Value", required: true },
        { kind: "date", name: "effectiveFrom", label: "Effective from", required: true },
        { kind: "date", name: "expiresOn", label: "Expires on" },
        { kind: "date", name: "lodgedOn", label: "Lodged on", required: true },
      ]}
      values={{ id, lodgedOn: today }}
      action={lodgeSecurity}
      submitLabel="Lodge"
      trigger={{ label: "Lodge security", icon: true, className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function ReviewDrawer({ id, targetId, kind, name, people, today }: { id: string; targetId: string; kind: "security" | "policy"; name: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Check the ${name.charAt(0).toLowerCase()}${name.slice(1)}`}
      description="Verified only where every check passes; the refusal says which did not. Name who checked it: recorded on their behalf, not signed."
      fields={[
        hidden("id"),
        hidden(kind === "security" ? "securityId" : "policyId"),
        { kind: "select", name: "outcome", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "VERIFIED", label: "Verified" }, { value: "REJECTED", label: "Rejected" }] },
        { kind: "select", name: "personId", label: "Checked by", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "on", label: "Checked on", required: true },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a rejection." },
      ]}
      values={{ id, [kind === "security" ? "securityId" : "policyId"]: targetId, on: today }}
      action={kind === "security" ? reviewSecurity : reviewPolicy}
      submitLabel="Record"
      trigger={{ label: "Check", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

/// `tenderUplift`: 64-C4, the frozen tender Appendix's works uplift at the awarded sum, in words. Null: no frozen Appendix.
/// Not pre-filled as a value: the field means something only for a policy covering the works.
export function LodgePolicyDrawer({ id, issuers, today, tenderUplift = null }: { id: string; issuers: Option[]; today: string | null; tenderUplift?: string | null }) {
  const KINDS: Option[] = Object.entries(INSURANCE_KIND_LABEL).map(([value, label]) => ({ value, label }));
  return (
    <RecordEditor
      title="Lodge an insurance policy"
      description="As it was handed in. It is verified separately, against the requirement, the liability bands and the period it must run."
      fields={[
        hidden("id"),
        { kind: "select", name: "kind", label: "Kind", required: true, placeholder: "Choose", options: KINDS },
        { kind: "select", name: "substitutesFor", label: "Accepted in place of", placeholder: "Nothing", options: [{ value: "WORKS", label: `The ${INSURANCE_KIND_LABEL.WORKS.toLowerCase()}` }] },
        { kind: "select", name: "issuerId", label: "Insurer, from the approved list", placeholder: "Not on the list", options: issuers },
        { kind: "text", name: "issuerNameAsWritten", label: "Insurer as written on it" },
        { kind: "text", name: "policyNo", label: "Policy number", mono: true },
        { kind: "money", name: "sumInsured", label: "Sum insured", required: true },
        {
          kind: "money",
          name: "appendixAmount",
          label: "Amount stated in the appendix",
          hint: tenderUplift ? `Works: the tender Appendix states ${tenderUplift} beyond the contract price. Left empty, that figure is taken; another is refused.` : "Works: the sum insured must cover the contract price plus this.",
        },
        { kind: "money", name: "requiredLimit", label: "Public liability limit to meet", hint: "Empty takes the limit derived from the bands. Raised above it needs a justification." },
        { kind: "textarea", name: "raisedJustification", label: "Why the limit is raised" },
        { kind: "date", name: "periodStart", label: "Period from", required: true },
        { kind: "date", name: "periodEnd", label: "Period to", required: true },
        { kind: "text", name: "premiumReceiptRef", label: "Premium receipt" },
        { kind: "text", name: "perkesoRegistrationNo", label: "Social security registration number" },
        { kind: "date", name: "lodgedOn", label: "Lodged on", required: true },
      ]}
      values={{ id, lodgedOn: today }}
      action={lodgePolicy}
      submitLabel="Lodge"
      trigger={{ label: "Lodge policy", icon: true, className: buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

/// Where a refused appointment goes next, where the refusal decided nothing (FR-APR-016, CO-5).
export function AwardChoiceDrawer({ id, kinds, steps, people }: { id: string; kinds: { value: string; label: string }[]; steps: { value: string; label: string }[]; people: { value: string; label: string }[] }) {
  return (
    <RecordEditor
      title="Where the refused appointment goes next"
      description="No destination applied to this refusal, so the officer chooses. The choice is recorded as theirs, on behalf of the person named, not signed — it is not the organisation's policy."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "kind", label: "Where it goes", required: true, placeholder: "Choose", options: kinds },
        { kind: "select", name: "returnToSeq", label: "The step it returns to", required: true, placeholder: "Choose", options: steps, hint: "The route continues from this step; the steps before it keep their decisions." },
        { kind: "select", name: "personId", label: "Chosen by", required: true, placeholder: "Choose", options: people },
        { kind: "textarea", name: "reason", label: "Why it goes there" },
      ]}
      showWhen={{ returnToSeq: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      values={{ id }}
      action={chooseAwardRejection}
      submitLabel="Record the choice"
      trigger={{ label: "Choose where it goes", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}
