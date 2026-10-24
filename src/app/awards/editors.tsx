import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";

import { INSURANCE_KIND_LABEL, RETURN_DRAWER_NOTE } from "@/lib/award/labels";
import { cancelWaitingNote } from "@/lib/award/online-return-view";

import { Blocked } from "../requisitions/editors";
import {
  addCondition,
  answerAwardQuery,
  cancelAward,
  chooseAwardRejection,
  citeAppointmentDecision,
  decideAppointmentStep,
  issueAward,
  lodgePolicy,
  lodgeSecurity,
  recallAward,
  recordCommencement,
  recordCommitment,
  recordDespatch,
  recordReturn,
  refuseOnlineReturn,
  reviewPolicy,
  reviewSecurity,
  satisfyCondition,
  submitAward,
  updateAwardDetails,
  updateAwardTerms,
  verifyOnlineReturn,
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
export function detailFields(parties?: Option[], recommended?: { valueText: string } | null, supplier?: { currentLabel: string | null }): Field[] {
  return [
    ...(parties ? [{ kind: "select", name: "awardeePartyId", label: "Bidder carried to evaluation", required: true, placeholder: "Choose", options: parties, hint: "Compared as the bidder carried to evaluation." } as Field] : []),
    // No bidder carried: the awardee is a supplier from the register (its name, number and address are copied from it, and the award is linked to it), or typed below for one not on it.
    ...(!parties && supplier
      ? [{ kind: "select", name: "awardeeSupplierId", label: "Supplier on the register", placeholder: "Not on the register: type below", options: [], search: { url: "/api/lookup?kind=supplier" }, orphanLabel: supplier.currentLabel ?? undefined, hint: "Type to search. Details are copied from it." } as Field]
      : []),
    { kind: "text", name: "awardeeName", label: "Awardee", required: true, hint: "As registered; kept as written." },
    { kind: "text", name: "awardeeRegistrationNo", label: "Registration number" },
    { kind: "textarea", name: "awardeeAddress", label: "Address" },
    { kind: "money", name: "awardedValue", label: "Awarded value", required: true, hint: "Within the approval and the exercise's band." },
    { kind: "number", name: "completionPeriod", label: "Completion period", required: true, min: 1 },
    { kind: "select", name: "completionUnit", label: "Counted in", required: true, placeholder: "Choose", options: UNITS },
    // 6.8 (E-9): each figure that differs from the evaluation's recommendation carries its reason.
    ...(recommended
      ? ([
          { kind: "textarea", name: "recValueDiffersReason", label: "Why the value differs from the recommendation", hint: `Recommended: ${recommended.valueText}. Only where it differs.` },
          { kind: "textarea", name: "recPeriodDiffersReason", label: "Why the period differs from the recommendation", hint: "Only where it differs." },
        ] as Field[])
      : []),
  ];
}

/// The manual awardee fields show only while no register supplier is chosen.
const MANUAL_AWARDEE_SHOWN: Record<string, { name: string; in: readonly string[] }> = Object.fromEntries(["awardeeName", "awardeeRegistrationNo", "awardeeAddress"].map((n) => [n, { name: "awardeeSupplierId", in: [""] }]));

export function EditDetailsDrawer({ id, values, parties, recommended, supplier, menu }: { id: string; values: Values; parties?: Option[]; recommended?: { valueText: string } | null; supplier?: { currentLabel: string | null }; /** A menu entry rather than a header button. */ menu?: boolean }) {
  return (
    <RecordEditor
      title="Edit the award"
      description="Awardee, value and period change only while the award is a draft."
      fields={[hidden("id"), ...detailFields(parties, recommended, supplier)]}
      values={{ id, ...values }}
      showWhen={!parties && supplier ? MANUAL_AWARDEE_SHOWN : undefined}
      action={updateAwardDetails}
      submitLabel="Save"
      trigger={{ label: "Edit", className: menu ? moreItemClass() : buttonClass("secondary", "sm") }}
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
  menu,
  tender = null,
  insuranceMinimums = null,
}: {
  id: string;
  values: Values;
  regulatedLabel: string | null;
  /// Whether the exercise's terms band asks for retention and a defects liability
  /// period; false says so beside the field, which stays on the form.
  asked: { retention: boolean | null; dlp: boolean | null };
  label?: string;
  /** A menu entry rather than a header button. */
  menu?: boolean;
  /// 64-C4: what the frozen tender states for each term, in words (null: states nothing).
  /// Not given: the exercise froze no Appendix, and the form is as before.
  tender?: { lad: string | null; dlp: string | null; regulated: string | null; worksInsured?: string | null; liabilityInsured?: string | null; wcInsured?: string | null } | null;
  /// 64-C4-b: the tender Appendix's insurance minimum for each kind, in words (null: it states none).
  insuranceMinimums?: { works: string | null; liability: string | null; wc: string | null } | null;
}) {
  const bond = { name: "bondRequired", in: ["yes"] } as const;
  const fromTender = (t: string | null | undefined, words = "The tender Appendix states") => (t ? `${words}: ${t}.` : undefined);
  const minimum = (t: string | null | undefined) =>
    !insuranceMinimums ? "Empty: the tender Appendix minimum governs." : t ? `Appendix: ${t}. Empty takes it.` : "Appendix states none. Empty: not compared.";
  const reasons: Field[] = tender
    ? [
        { kind: "note", text: "Explain each difference from the tender; issuing needs a reason for each." },
        ...(tender.lad ? [{ kind: "textarea", name: "ladDiffersReason", label: "Why the liquidated damages differ from the tender Appendix", hint: "Only where they differ." } as const] : []),
        ...(tender.dlp ? [{ kind: "textarea", name: "dlpDiffersReason", label: "Why the defects liability period differs from the tender Appendix", hint: "Only where it differs." } as const] : []),
        ...(tender.regulated ? [{ kind: "textarea", name: "regulatedDiffersReason", label: "Why the regulated-activity answer differs from the tender's", hint: "Only where it differs." } as const] : []),
        // BD-613-2 ruling: a sum insured stated otherwise than the figure the Appendix governs needs its reason.
        ...(tender.worksInsured ? [{ kind: "textarea", name: "worksInsuredDiffersReason", label: "Why the works sum insured differs from the tender Appendix", hint: "Only where the figure differs." } as const] : []),
        ...(tender.liabilityInsured ? [{ kind: "textarea", name: "liabilityInsuredDiffersReason", label: "Why the public liability sum insured differs from the tender Appendix", hint: "Only where it differs." } as const] : []),
        ...(tender.wcInsured ? [{ kind: "textarea", name: "wcInsuredDiffersReason", label: "Why the workmen's compensation sum insured differs from the tender Appendix", hint: "Only where it differs." } as const] : []),
      ]
    : [];
  return (
    <RecordEditor
      title="The terms, the bond and the start"
      description={
        tender
          ? "Appendix terms are pre-filled; a change needs a reason. Issuing needs the required terms."
          : "Decided for this award. Empty means not set; issuing needs the required terms."
      }
      fields={[
        hidden("id"),
        { kind: "date", name: "startDate", label: "Stated start date", hint: "Starts the commencement and insurance clocks." },
        {
          kind: "select",
          name: "regulatedActivity",
          label: regulatedLabel ? `Is this ${regulatedLabel.toLowerCase()}?` : "Are the works the regulated activity?",
          placeholder: "Not answered",
          options: YES_NO,
          hint: fromTender(tender?.regulated, "The tender answered") ?? "Recipients of copies may depend on it.",
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
        { kind: "text", name: "bondPercent", label: "Bond percentage", placeholder: "e.g. 5", hint: "More than 0; empty for a stated amount." },
        { kind: "money", name: "bondBasisAmount", label: "One-year value, or the stated amount", hint: "Entered, not calculated; a comparison figure shows beside." },
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
        { kind: "text", name: "retentionPercent", label: "Retention percentage", placeholder: "e.g. 5", hint: asked.retention === false ? "Not asked by the terms band." : undefined },
        { kind: "text", name: "retentionCapPercent", label: "Retention limit, percentage of the contract sum", placeholder: "e.g. 5" },
        { kind: "number", name: "dlpMonths", label: "Defects liability period, months", min: 0, hint: fromTender(tender?.dlp === "None" ? "none (0 months)" : tender?.dlp) ?? (asked.dlp === false ? "Not asked; the insurance period still counts it." : undefined) },
        { kind: "note", text: "Sums insured as this award states them. Empty takes the tender Appendix minimum." },
        { kind: "money", name: "worksSumInsured", label: "Works insurance, sum insured", hint: minimum(insuranceMinimums?.works) },
        { kind: "money", name: "liabilitySumInsured", label: "Public liability insurance, sum insured", hint: minimum(insuranceMinimums?.liability) },
        { kind: "money", name: "wcSumInsured", label: "Workmen's compensation insurance, sum insured", hint: minimum(insuranceMinimums?.wc) },
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
          hint: "Uncovered wages: never counts as met.",
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
      trigger={{ label, className: menu ? moreItemClass() : buttonClass("secondary", "sm") }}
      size="lg"
    />
  );
}

export function RecallAwardDrawer({ id, blocker, menu }: { id: string; blocker: string | null; menu?: boolean }) {
  if (blocker) return <Blocked label="Recall" reason={blocker} noteId={menu ? undefined : AWARD_NOTE_ID} />;
  return (
    <RecordEditor
      title="Recall the award"
      description="Recalls the award from approval and returns it to draft. The route stays on record."
      fields={[hidden("id")]}
      values={{ id }}
      action={recallAward}
      submitLabel="Recall"
      destructive={{ reasonLabel: "Why is it being recalled?" }}
      trigger={{ label: "Recall", className: menu ? moreItemClass() : buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function SubmitAwardDrawer({ id, blocker, route }: { id: string; blocker: string | null; route: string[] }) {
  if (blocker) return <Blocked label="Send for approval" reason={blocker} primary noteId={AWARD_NOTE_ID} />;
  return (
    <RecordEditor
      title="Send the award for approval"
      description="The approval route is fixed now, under the matrix in force. The contract type locks."
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
      description={`The holder decides this ${act.toLowerCase()} step with their password. Paper is recorded, unsigned.`}
      fields={[
        hidden("id"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused" }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true }),
        { kind: "date", name: "receivedOn", label: "Received on", hint: "From the routing sheet. Optional." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today; dated today unless back-dated." },
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
      description="Discharged by the committee's recorded decision, never by a person."
      fields={[hidden("id"), hidden("stepId"), { kind: "select", name: "committeeDecisionId", label: "The matter", required: true, placeholder: "Choose", options: matters, hint: "Undecided matters cannot be chosen." }]}
      values={{ id, stepId }}
      action={citeAppointmentDecision}
      submitLabel="Cite decision"
      trigger={{ label: "Cite decision", className: buttonClass("primary", "sm") }}
      size="md"
    />
  );
}

export function RecordCommitmentDrawer({ id, indent, example, today, menu }: { id: string; indent: boolean; example: string | null; today: string | null; menu?: boolean }) {
  return (
    <RecordEditor
      title="Record the commitment number"
      description={indent ? "The indent number from the finance system, as it reads." : "The finance system's number, as it reads."}
      fields={[
        hidden("id"),
        ...(indent ? [hidden("erpCommitmentKind")] : []),
        { kind: "text", name: "erpCommitmentNo", label: indent ? "Commitment number (the indent's)" : "Commitment number", required: true, mono: true, hint: example ? `For example ${example}.` : "No format set, so not checked." },
        ...(indent ? [] : ([{ kind: "select", name: "erpCommitmentKind", label: "It is", required: true, placeholder: "Choose", options: [{ value: "INDENT", label: "An indent" }, { value: "PURCHASE_ORDER", label: "A purchase order" }] }] as Field[])),
        { kind: "date", name: "receivedOn", label: "Received on", required: true, hint: indent ? "The indent's validity runs from this day." : undefined },
      ]}
      values={{ id, erpCommitmentKind: indent ? "INDENT" : null, receivedOn: today }}
      action={recordCommitment}
      submitLabel="Record number"
      trigger={{ label: "Record commitment number", className: menu ? moreItemClass() : buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function IssueDrawer({ id, signatory, people, today, summary }: { id: string; signatory: string; people: Option[]; today: string | null; summary: [string, string][] }) {
  return (
    <RecordEditor
      title="Issue the instrument"
      description={`Signed by the ${signatory} in the portal. Issuing numbers the contract and hands it over.`}
      fields={[
        hidden("id"),
        actorField("Award.signatoryPerson", { name: "signatoryPersonId", people, dated: true, hint: `Holder of the ${signatory} office, or a delegate.` }),
        { kind: "date", name: "signedOn", label: "Signed on", required: true, hint: "Not after today; dated today unless back-dated." },
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
      description="Record how it went and when. Registered post needs its consignment reference."
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
    { kind: "note", text: "As the contractor returned it. Identity card number is SULIT: full only here and on Return." },
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
        actorField("AwardReturn.receivedBy", { name: "receivedByPersonId", people }),
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

/// ADR 0045 D1: verify a return the contractor sent online. It becomes the award's return and the award is accepted; the primary action of the header while one waits.
export function VerifyOnlineReturnDrawer({ id, day, blocker }: { id: string; day: string; blocker: string | null }) {
  if (blocker) return <Blocked label="Verify the return" reason={blocker} primary noteId={AWARD_NOTE_ID} />;
  return (
    <RecordEditor
      title="Verify the return"
      description={`Sent online on ${day}. It becomes the award's return and the award is accepted.`}
      fields={[hidden("id"), actorField("AwardOnlineReturn.verifiedBy", { name: "verifiedByPersonId" })]}
      values={{ id }}
      action={verifyOnlineReturn}
      submitLabel="Verify"
      trigger={{ label: "Verify the return", className: buttonClass("primary", "sm") }}
      size="sm"
    />
  );
}

/// The contractor reads the reason in its portal and may send the return again.
export function RefuseOnlineReturnDrawer({ id, day, menu }: { id: string; day: string; menu?: boolean }) {
  return (
    <RecordEditor
      title={`Refuse the return sent on ${day}`}
      description="The contractor reads the reason and may send it again."
      fields={[hidden("id"), actorField("AwardOnlineReturn.refusedBy", { name: "refusedByPersonId" })]}
      values={{ id }}
      action={refuseOnlineReturn}
      destructive={{ reasonLabel: "Why it is refused" }}
      submitLabel="Refuse the return"
      trigger={{ label: "Refuse the return", className: menu ? moreItemClass(true) : buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

/// A question is answered once; the contractor reads the answer in its portal.
export function AnswerQueryDrawer({ id, question }: { id: string; question: string }) {
  return (
    <RecordEditor
      title="Answer the question"
      description={question}
      fields={[hidden("id"), { kind: "textarea", name: "answer", label: "Answer", required: true }, actorField("AwardQuery.answeredBy", { name: "answeredByPersonId" })]}
      values={{ id }}
      action={answerAwardQuery}
      submitLabel="Send the answer"
      trigger={{ label: "Answer", className: buttonClass("secondary", "sm") }}
      size="md"
    />
  );
}

export function CommencementDrawer({ id, today, menu }: { id: string; today: string | null; menu?: boolean }) {
  return (
    <RecordEditor
      title="Record commencement"
      description="The day work started on site."
      fields={[hidden("id"), { kind: "date", name: "commencedOn", label: "Commenced on", required: true }]}
      values={{ id, commencedOn: today }}
      action={recordCommencement}
      submitLabel="Record"
      trigger={{ label: "Record commencement", className: menu ? moreItemClass() : buttonClass("secondary", "sm") }}
      size="sm"
    />
  );
}

export function CancelAwardDrawer({ id, issued, consequence, menu, waiting }: { id: string; issued: boolean; consequence: string | null; menu?: boolean; /** The day a return sent online waits since (WV-4): the cancel is refused, naming it. */ waiting?: string | null }) {
  if (waiting) return <Blocked label="Cancel award" reason={cancelWaitingNote(waiting)} destructive />;
  return (
    <RecordEditor
      title="Cancel this award"
      description={
        issued
          ? `Cancels its contract; the number stays as a gap.${consequence ? ` ${consequence}` : ""}`
          : "The award stays on record; its approval route is withdrawn."
      }
      fields={[hidden("id")]}
      values={{ id }}
      action={cancelAward}
      destructive={{ reasonLabel: "Why it is cancelled" }}
      submitLabel="Cancel award"
      cancelLabel="Keep the award"
      trigger={{ label: "Cancel award", className: menu ? moreItemClass(true) : buttonClass("destructive", "sm") }}
      size="sm"
    />
  );
}

export function AddConditionDrawer({ id, kinds }: { id: string; kinds: Option[] }) {
  if (kinds.length === 0) return <Blocked label="Add condition" reason="No conditions precedent are configured. Add them under Award controls." />;
  return (
    <RecordEditor
      title="Add a condition precedent"
      description="Needed before work starts, by a set day."
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
      description="Verified separately against the approved list, bond basis and validity."
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
      description="Verified only if every check passes; a refusal names the failed one."
      fields={[
        hidden("id"),
        hidden(kind === "security" ? "securityId" : "policyId"),
        { kind: "select", name: "outcome", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "VERIFIED", label: "Verified" }, { value: "REJECTED", label: "Rejected" }] },
        actorField(kind === "security" ? "SecurityInstrument.verifiedBy" : "InsurancePolicy.verifiedBy", { name: "personId", people }),
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
      description="Verified separately against the requirement, bands and period."
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
          hint: tenderUplift ? `Appendix states ${tenderUplift}. Empty takes it.` : "Must cover the contract price plus this.",
        },
        { kind: "money", name: "requiredLimit", label: "Public liability limit to meet", hint: "Empty: band limit. Higher needs a reason." },
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
      description="No destination applied, so you choose. Recorded as yours, not policy."
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "select", name: "kind", label: "Where it goes", required: true, placeholder: "Choose", options: kinds },
        { kind: "select", name: "returnToSeq", label: "The step it returns to", required: true, placeholder: "Choose", options: steps, hint: "Steps before it keep their decisions." },
        actorField("ApprovalInstance.rejectionChosenBy", { name: "personId", people }),
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
