"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import {
  addMaterialLine,
  addValuationDeduction,
  applyAdvancePayment,
  closeLadWindow,
  holdValuation,
  openInterimValuation,
  raiseInterimCertificate,
  raiseLadWarning,
  recordJointValuation,
  recordMainWorks,
  recordNonCompletion,
  recordOpeningPosition,
  recordPartyLine,
  recordValuationCalendar,
  recordWarningPost,
  releaseRetention,
  removeMaterialLine,
  removeValuationDeduction,
  withdrawValuation,
} from "./payment-actions";

/**
 * The contract's interim payment and damages drawers (6.13 Part A step 3, 4c). No field carries a default but the day
 * an act is recorded on. No drawer posts a figure the certificate computes: the totals, the retention, the damages and
 * the advance recouped are worked out from the records, never typed. Every person named is recorded on their behalf,
 * not signed; the server judges whether they may be recorded for the act on the day. A drawer that cannot proceed
 * says why beside its button, in the act's own words.
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

// ------------------------------------------------------------------ the calendar and the valuation

export function CalendarDrawer({ id, people, today, current }: { id: string; people: Option[]; today: string | null; current: { dayOfMonth: number; agreedWith: string } | null }) {
  return (
    <RecordEditor
      title={current ? "Change the valuation day" : "Record the valuation day"}
      description="The day of each month agreed with the contractor for the joint site valuation (in a shorter month, its last day). The parties are notified as the notification rules say: nothing is sent yet."
      fields={[hidden("id"), { kind: "number", name: "dayOfMonth", label: "Day of the month", required: true, hint: "1 to 31." }, { kind: "date", name: "agreedOn", label: "Agreed on", required: true }, { kind: "text", name: "agreedWith", label: "Agreed with, for the contractor", required: true }, by("PaymentCalendar.person", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, dayOfMonth: current ? String(current.dayOfMonth) : null, agreedWith: current?.agreedWith ?? null, agreedOn: today }}
      action={recordValuationCalendar}
      reason={current ? { label: "Why the day is changed" } : undefined}
      submitLabel="Record"
      trigger={{ label: current ? "Change" : "Record the valuation day", className: current ? ghost : primary }}
    />
  );
}

export function OpenValuationDrawer({ id, people, today, triggers, blocker, warning }: { id: string; people: Option[]; today: string | null; triggers: Option[]; blocker: string | null; warning: string | null }) {
  return (
    <RecordEditor
      title="Open a valuation"
      description={`On the agreed valuation day, or on a claim from the contractor (the issue period then runs from the day the claim was received). One valuation at a time.${warning ? ` ${warning}` : ""}`}
      fields={[hidden("id"), choose("trigger", "What started it", triggers), { kind: "date", name: "claimReceivedOn", label: "Claim received on", hint: "For a claim only." }, { kind: "date", name: "valuationDate", label: "Valuation day", required: true }, by("InterimValuation.person", "personId", people)]}
      values={{ id, valuationDate: today }}
      showWhen={{ claimReceivedOn: { name: "trigger", in: ["CLAIM"] } }}
      action={openInterimValuation}
      submitLabel="Open the valuation"
      submitBlock={blocker}
      trigger={{ label: "Open a valuation", className: primary }}
    />
  );
}

export function MainWorksDrawer({ id, valuationId, current }: { id: string; valuationId: string; current: string | null }) {
  return (
    <RecordEditor
      title="Main contractor's work, to date"
      description="The value of the work the main contractor has executed to date, as valued jointly (the main works, valued as one figure). Each certificate deducts what was certified before."
      fields={[hidden("id"), hidden("valuationId"), { kind: "money", name: "mainWorks", label: "Work executed to date", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, valuationId, mainWorks: current }}
      action={recordMainWorks}
      submitLabel="Record"
      trigger={{ label: current ? "Change" : "Record the value", className: current ? ghost : secondary }}
    />
  );
}

export function JointValuationDrawer({ id, valuationId, answers, today, recorded }: { id: string; valuationId: string; answers: Option[]; today: string | null; recorded: boolean }) {
  return (
    <RecordEditor
      title="The joint valuation"
      description="Who valued the work and materials together on site, the method as explained to the contractor, and whether the contractor agrees. A dissent says what is disputed."
      size="lg"
      columns={2}
      fields={[hidden("id"), hidden("valuationId"), { kind: "date", name: "jointOn", label: "Valued jointly on", required: true }, choose("contractorAnswer", "The contractor's answer", answers), { kind: "textarea", name: "participants", label: "Who took part", required: true, hint: "One per line: at least the valuer and the contractor's representative." }, { kind: "textarea", name: "valuationMethod", label: "How it was valued", required: true }, { kind: "textarea", name: "dissent", label: "What the contractor disputes" }]}
      values={{ id, valuationId, jointOn: today }}
      showWhen={{ dissent: { name: "contractorAnswer", in: ["DISSENT"] } }}
      action={recordJointValuation}
      submitLabel="Record"
      trigger={{ label: recorded ? "Record again" : "Record the joint valuation", className: recorded ? ghost : secondary }}
    />
  );
}

export function MaterialDrawer({ id, valuationId, today }: { id: string; valuationId: string; today: string | null }) {
  return (
    <RecordEditor
      title="A material on site"
      description="A line of the contractor's materials-on-site list, submitted on or before the valuation day (a later list goes to the next cycle). It is valued only where all three answers are yes and it is not formwork or other temporary works; the allowance's percentage is the contract's or the organisation's, never typed here."
      size="lg"
      columns={2}
      fields={[
        hidden("id"),
        hidden("valuationId"),
        { kind: "text", name: "description", label: "Material or goods", required: true },
        { kind: "text", name: "quantity", label: "Quantity", required: true },
        { kind: "text", name: "location", label: "Where it is stored on site", required: true },
        { kind: "money", name: "value", label: "Value", required: true },
        choose("protectedOnSite", "Adequately protected", YES_NO, undefined, false),
        choose("notTooEarly", "Not delivered too early", YES_NO, undefined, false),
        choose("formsPartOfWorks", "Forms part of the completed works", YES_NO, undefined, false),
        { kind: "date", name: "submittedOn", label: "On the list submitted on", required: true },
        { kind: "switch", name: "temporary", label: "Formwork or other temporary works", hint: "Never valued." },
      ]}
      values={{ id, valuationId, submittedOn: today }}
      action={addMaterialLine}
      submitLabel="Add"
      trigger={{ label: "Add a material", className: secondary }}
    />
  );
}

export function RemoveMaterialDrawer({ id, valuationId, lineId, label }: { id: string; valuationId: string; lineId: string; label: string }) {
  return (
    <RecordEditor
      title={`Take ${label} off the valuation`}
      description="Removed from this valuation, with the reason. The trail keeps what it was."
      fields={[hidden("id"), hidden("valuationId"), hidden("lineId")]}
      values={{ id, valuationId, lineId }}
      action={removeMaterialLine}
      destructive={{ reasonLabel: "Why it is taken off" }}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}

export function PartyLineDrawer({ id, valuationId, partyId, name, assignee, today, current }: { id: string; valuationId: string; partyId: string; name: string; assignee: boolean; today: string | null; current: { value: string | null; due: string } | null }) {
  return (
    <RecordEditor
      title={`${name} on this valuation`}
      description={assignee ? "What the assignee's claim or invoice makes due on this certificate (by the cut-off). Totals only: the payment annexes are not available (B1)." : "Its work or supply valued to date (part of the gross value), and what is due to it on this certificate. Totals only: the payment annexes are not available (B1)."}
      fields={[hidden("id"), hidden("valuationId"), hidden("partyId"), ...(assignee ? [] : [{ kind: "money", name: "value", label: "Valued to date", required: true } as Field]), { kind: "money", name: "due", label: "Due on this certificate", required: true }, { kind: "date", name: "submittedOn", label: "Its valuation or claim submitted on", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, valuationId, partyId, value: current?.value ?? null, due: current?.due ?? null, submittedOn: today }}
      action={recordPartyLine}
      submitLabel="Record"
      trigger={{ label: current ? "Change" : "Record", className: current ? ghost : secondary, ariaLabel: `Record ${name} on this valuation` }}
    />
  );
}

export function DeductionDrawer({ id, valuationId, kinds }: { id: string; valuationId: string; kinds: Option[] }) {
  return (
    <RecordEditor
      title="A deduction"
      description="A deduction the certificate makes that no rule computes: premiums and social security or workers' wages the employer paid, the costs of the contractor's failure to comply with instructions, up to three other permitted deductions, or the signed rounding on the damages line (which says why). Retention, earlier payments, the advance and the damages are computed, never keyed."
      fields={[hidden("id"), hidden("valuationId"), choose("deduction", "Deduction", kinds), { kind: "text", name: "label", label: "What it is", hint: "For another permitted deduction." }, { kind: "text", name: "amount", label: "Amount", required: true, hint: "A rounding may be below nothing (−0.20)." }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, valuationId }}
      showWhen={{ label: { name: "deduction", in: ["OTHER"] } }}
      action={addValuationDeduction}
      submitLabel="Add"
      trigger={{ label: "Add a deduction", className: secondary }}
    />
  );
}

export function RemoveDeductionDrawer({ id, valuationId, deductionId, label }: { id: string; valuationId: string; deductionId: string; label: string }) {
  return (
    <RecordEditor
      title={`Take off: ${label}`}
      description="Removed from this valuation, with the reason. The trail keeps what it was."
      fields={[hidden("id"), hidden("valuationId"), hidden("deductionId")]}
      values={{ id, valuationId, deductionId }}
      action={removeValuationDeduction}
      destructive={{ reasonLabel: "Why it is taken off" }}
      submitLabel="Take it off"
      cancelLabel="Keep it"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
    />
  );
}

export function RaiseCertificateDrawer({ id, valuationId, blocker, summary }: { id: string; valuationId: string; blocker: string | null; summary: string }) {
  return (
    <RecordEditor
      title="Raise the interim payment certificate"
      description={`${summary} The certificate opens as a draft on the baseline in force today, with every figure and the readings it rests on frozen; the valuation's lines freeze with it. It then goes for approval from the certificate.`}
      fields={[hidden("id"), hidden("valuationId")]}
      values={{ id, valuationId }}
      action={raiseInterimCertificate}
      submitLabel="Raise the certificate"
      submitBlock={blocker}
      trigger={{ label: "Raise the certificate", className: primary }}
    />
  );
}

export function HoldValuationDrawer({ id, valuationId }: { id: string; valuationId: string }) {
  return (
    <RecordEditor
      title="Hold to the next cycle"
      description="Below the certificate's minimum, the valuation is held: no certificate is raised, and the next cycle's valuation values the work to date again."
      fields={[hidden("id"), hidden("valuationId")]}
      values={{ id, valuationId }}
      action={holdValuation}
      reason={{ label: "Why it is held" }}
      submitLabel="Hold"
      trigger={{ label: "Hold to the next cycle", className: secondary }}
    />
  );
}

export function WithdrawValuationDrawer({ id, valuationId }: { id: string; valuationId: string }) {
  return (
    <RecordEditor
      title="Withdraw the valuation"
      description="Closed without a certificate, its lines kept with it. Another valuation may then be opened."
      fields={[hidden("id"), hidden("valuationId")]}
      values={{ id, valuationId }}
      action={withdrawValuation}
      destructive={{ reasonLabel: "Why it is withdrawn" }}
      submitLabel="Withdraw"
      cancelLabel="Keep it"
      trigger={{ label: "Withdraw", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ retention, the advance

export function ReleaseDrawer({ id, release, label, people, today, blocker }: { id: string; release: "RELEASED_FIRST" | "RELEASED_BALANCE"; label: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={label}
      description="Released from what the latest issued interim certificate holds, per tier, and paid through the next interim certificate (it comes off the retention held). Once each."
      fields={[hidden("id"), hidden("release"), { kind: "date", name: "releasedOn", label: "Released on", required: true }, by("RetentionRelease.person", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id, release, releasedOn: today }}
      action={releaseRetention}
      submitLabel="Release"
      submitBlock={blocker}
      trigger={{ label: release === "RELEASED_FIRST" ? "Release the first share" : "Release the balance", className: secondary }}
    />
  );
}

export function AdvanceDrawer({ id, people, parties, guarantees, parts, blocker }: { id: string; people: Option[]; parties: Option[]; guarantees: Option[]; parts: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Apply for an advance payment"
      description="No documented procedure states who may have an advance, how much, or how it is recouped (B2): eligibility and the percentage are not checked. It rests on an Advance Payment Guarantee verified in the register, and on the recoupment schedule entered here, which must recoup the whole advance. Its certificate opens as a draft and goes for approval on the approval matrix."
      size="lg"
      columns={2}
      fields={[hidden("id"), choose("advanceFor", "For", parts), { kind: "select", name: "partyId", label: "The nominated sub-contractor", placeholder: parties.length ? "Choose" : "None recorded on Team", options: parties }, { kind: "money", name: "amount", label: "Amount", required: true }, choose("securityId", "Advance Payment Guarantee", guarantees), { kind: "textarea", name: "schedule", label: "Recoupment schedule", required: true, hint: "One line per interim certificate: \"certificate number | amount\"." }, by("AdvancePayment.person", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ id }}
      showWhen={{ partyId: { name: "advanceFor", in: ["NSC"] } }}
      action={applyAdvancePayment}
      submitLabel="Apply and open its certificate"
      submitBlock={blocker}
      trigger={{ label: "Apply for an advance", className: secondary }}
    />
  );
}

// ------------------------------------------------------------------ the damages chain

export function WarningDrawer({ id, people, today, blocker, completion }: { id: string; people: Option[]; today: string | null; blocker: string | null; completion: string | null }) {
  return (
    <RecordEditor
      title="Warning of liquidated damages"
      description={`The standard letter of the intention to impose damages, before they are imposed: the clauses as in the contract, the extended date for completion, and the rate per day from the baseline (never typed). It opens as a certificate; once issued it is sent by registered post, and the contractor's reasons are awaited for the organisation's response window.${completion ? ` The date for completion is ${completion}.` : ""}`}
      size="lg"
      columns={2}
      fields={[hidden("id"), { kind: "text", name: "eotClause", label: "Extension-of-time clause", required: true }, { kind: "text", name: "ladClause", label: "Damages (non-completion) clause", required: true }, { kind: "date", name: "extendedCompletion", label: "Extended date for completion", required: true, hint: "The date for completion where none is extended." }, by("LadWarning.person", "personId", people)]}
      values={{ id, extendedCompletion: null }}
      action={raiseLadWarning}
      submitLabel="Raise the letter"
      submitBlock={blocker ?? (today ? null : "Set the organisation's time zone first.")}
      trigger={{ label: "Raise the warning letter", className: secondary }}
    />
  );
}

export function PostDrawer({ id, warningId, today }: { id: string; warningId: string; today: string | null }) {
  return (
    <RecordEditor
      title="Sent by registered post"
      description="The consignment reference and the day it was posted: the contractor's response window runs from it (assumed: from posting)."
      fields={[hidden("id"), hidden("warningId"), { kind: "text", name: "consignmentRef", label: "Consignment reference", required: true }, { kind: "date", name: "postedOn", label: "Posted on", required: true }]}
      values={{ id, warningId, postedOn: today }}
      action={recordWarningPost}
      submitLabel="Record"
      trigger={{ label: "Record the registered post", className: secondary }}
    />
  );
}

export function NonCompletionDrawer({ id, people, outcomes, scopes, sections, pack, blocker, windowFrom, replaces }: { id: string; people: Option[]; outcomes: Option[]; scopes: Option[]; sections: Option[]; pack: { item: string; label: string }[]; blocker: string | null; windowFrom: string | null; replaces: { id: string; text: string } | null }) {
  const lad = ["LAD_APPLIES"];
  const packFields: Field[] = pack.flatMap((p) => [{ kind: "textarea", name: `pack_${p.item}`, label: p.label, hint: "Write it; or mark it not required and say why here." } as Field, { kind: "switch", name: `pack_${p.item}_notRequired`, label: "Not required (the text above says why)" } as Field]);
  const show = Object.fromEntries(["scope", "sectionRef", "eotClause", "ladClause", "insuranceExpiry", "expectedCompletion", "windowFrom", "windowUntil", ...pack.flatMap((p) => [`pack_${p.item}`, `pack_${p.item}_notRequired`])].map((n) => [n, { name: "decisionOutcome", in: lad }]));
  return (
    <RecordEditor
      title="The non-completion decision"
      description="Once the date for completion has passed. Damages apply only where the causes of delay give no ground for an extension of time: the Certificate of Non-Completion is raised, with its particulars as in the contract, the insurance extended to the expected completion, the submission pack, and the window damages run over (entered here, an assumed reading: from the day after the date for completion to completion). Otherwise the delay is recorded as excusable or its entitlement pending, with its reasons, and the interim certificates go on without a damages line. Until the extension-of-time module, this decision records the entitlement itself."
      size="xl"
      columns={2}
      fields={[
        hidden("id"),
        ...(replaces ? ([hidden("replacesId"), { kind: "readonly", name: "replacing", label: "Replaces the decision in force", text: replaces.text }, { kind: "textarea", name: "replaceReason", label: "Why it is replaced", required: true, hint: "Kept with both decisions; the earlier is kept and linked." }] as Field[]) : []),
        choose("decisionOutcome", "Decision", outcomes),
        by("NonCompletion.person", "personId", people),
        { kind: "textarea", name: "decisionReason", label: "Reasons", required: true, hint: "Shown on the certificates it governs." },
        choose("scope", "Covers", scopes, undefined, false),
        { kind: "select", name: "sectionRef", label: "The section", placeholder: sections.length ? "Choose" : "No sections in the baseline", options: sections },
        { kind: "text", name: "eotClause", label: "Extension-of-time clause" },
        { kind: "text", name: "ladClause", label: "Damages clause" },
        { kind: "date", name: "insuranceExpiry", label: "The insurance policies expire on" },
        { kind: "date", name: "expectedCompletion", label: "Expected completion" },
        { kind: "date", name: "windowFrom", label: "Damages run from" },
        { kind: "date", name: "windowUntil", label: "Completed on", hint: "Leave empty while the works are not complete." },
        ...packFields,
      ]}
      values={{ id, windowFrom, replacesId: replaces?.id ?? null }}
      showWhen={show}
      action={recordNonCompletion}
      submitLabel={replaces ? "Replace the decision" : "Record the decision"}
      submitBlock={blocker}
      trigger={{ label: replaces ? "Replace the non-completion decision" : "Record the non-completion decision", className: replaces ? secondary : primary }}
    />
  );
}

export function CloseWindowDrawer({ id, decisionId, today }: { id: string; decisionId: string; today: string | null }) {
  return (
    <RecordEditor
      title="Completed: close the damages window"
      description="The day the works were completed: the first day damages no longer run. Certificates already issued keep what they charged."
      fields={[hidden("id"), hidden("decisionId"), { kind: "date", name: "windowUntil", label: "Completed on", required: true }]}
      values={{ id, decisionId, windowUntil: today }}
      action={closeLadWindow}
      reason={{ label: "On what the completion rests" }}
      submitLabel="Close the window"
      trigger={{ label: "Record completion", className: secondary }}
    />
  );
}

/// BD-613-41 as amended: the opening position, every figure with where it came from (stated on a certificate, or
/// assumed with the reason). No figure is proposed.
export function OpeningDrawer({ id, people, groups, values, existing, blocker }: { id: string; people: Option[]; groups: { group: string; label: string }[]; values: Record<string, string | null>; existing: boolean; blocker: string | null }) {
  const SOURCE = [
    { value: "STATED", label: "Stated on a certificate (give its reference)" },
    { value: "ASSUMED", label: "Assumed (say why): warns on every later certificate" },
  ];
  const source = (g: string, label: string): Field[] => [
    { kind: "select", name: `${g}Provenance`, label: `${label}: where it came from`, required: true, placeholder: "Choose: there is no default", options: SOURCE },
    { kind: "text", name: `${g}Note`, label: `${label}: the certificate's reference, or why it is assumed`, required: true },
  ];
  const label = (g: string) => groups.find((x) => x.group === g)?.label ?? g;
  return (
    <RecordEditor
      title="Opening position"
      description="The last interim certificate issued before this system (or not from a valuation here), and the figures to date, as the next certificate continues from them. Entered once, before the first valuation raised here; corrected with a reason until then. Money as on the certificates; nil is 0.00."
      size="xl"
      columns={2}
      fields={[
        hidden("id"),
        { kind: "text", name: "lastCertificateNumber", label: "The last interim certificate's number, as issued", required: true },
        { kind: "number", name: "lastSequence", label: "Which interim certificate it was on this contract", required: true, min: 1 },
        { kind: "money", name: "grossToDate", label: label("gross"), required: true },
        ...source("gross", label("gross")),
        { kind: "money", name: "previouslyCertified", label: label("previous"), required: true, hint: "What the next certificate deducts as previously certified." },
        ...source("previous", label("previous")),
        { kind: "money", name: "retentionMain", label: "Retention held: main contractor", required: true },
        { kind: "money", name: "retentionNsc", label: "Retention held: nominated sub-contractors", required: true },
        { kind: "money", name: "retentionNs", label: "Retention held: nominated suppliers", required: true },
        ...source("retention", label("retention")),
        { kind: "money", name: "releasedMain", label: "Retention released: main contractor", required: true },
        { kind: "money", name: "releasedNsc", label: "Retention released: nominated sub-contractors", required: true },
        { kind: "money", name: "releasedNs", label: "Retention released: nominated suppliers", required: true },
        ...source("released", label("released")),
        { kind: "textarea", name: "advanceRecouped", label: "Advance recouped, by certificate", hint: 'One line each: "certificate number | amount". Empty: none.' },
        ...source("advance", label("advance")),
        { kind: "date", name: "damagesChargedUntil", label: "Damages charged until (the first day not charged)", hint: "Empty: none charged." },
        ...source("damages", label("damages")),
        by("OpeningPosition.person", "personId", people),
        ...(existing ? ([{ kind: "textarea", name: "reason", label: "Why it is corrected", required: true }] as Field[]) : []),
      ]}
      values={{ id, ...values }}
      action={recordOpeningPosition}
      submitLabel={existing ? "Correct the opening position" : "Record the opening position"}
      submitBlock={blocker}
      trigger={{ label: existing ? "Correct" : "Record the opening position", className: existing ? secondary : primary }}
    />
  );
}
