import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import type { Allowed } from "@/lib/opening/read";

import {
  adjournOpening,
  correctAsRead,
  finaliseOpening,
  matchWithdrawal,
  openEnvelope,
  recordAlternative,
  recordAuthorisation,
  recordChecklistAnswer,
  recordCopyExplanation,
  recordInitial,
  recordScheduleDetails,
  recordSignature,
  recordVerdict,
  recordWithdrawalFinding,
  registerBoxEnvelope,
  resumeOpening,
  startOpening,
  startSupplementaryOpening,
} from "./actions";

/**
 * The drawers of the Opening and Schedule sections (6.7). Fields are data; every rule sits in the
 * action and the pure checks behind it (`src/lib/opening`). Where those checks already say an act
 * cannot proceed, the control is disabled with the reason beside it, judged by the rule the action
 * runs. No time is ever asked: the server's clock stamps every act, to the second. Every person
 * named is recorded on their behalf, not signed (ADR 0017). Nothing here offers a Delete.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const ON_BEHALF = "Recorded on their behalf, not signed.";
const PERIOD_UNITS: Option[] = [
  { value: "DAYS", label: "Days" },
  { value: "WEEKS", label: "Weeks" },
  { value: "MONTHS", label: "Months" },
];
const recorder = (people: Option[], name = "personId", label = "Recorded by"): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose", options: people, hint: ON_BEHALF });

function blockedOr(allowed: Allowed, label: string, node: () => React.ReactNode, opts: { primary?: boolean; noteId?: string } = {}) {
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} primary={opts.primary} noteId={opts.noteId} />;
  return node();
}

// ------------------------------------------------------------------ starting

const panelFields = (seats: Option[], people: Option[], panelSize: number | null): Field[] => [
  { kind: "tokens", name: "panel", label: "The panel", options: seats, placeholder: "Pick from the committee's seats", hint: panelSize == null ? "The committee's panel size is not set." : `The committee's opening panel has ${panelSize} ${panelSize === 1 ? "member" : "members"}.` },
  { kind: "tokens", name: "present", label: "Present at the opening", options: seats, placeholder: "Pick who is present", hint: "Fixed when the opening starts. An absent member neither authorises, initials nor signs. At least two must be present." },
  recorder(people, "startedByPersonId", "Recorded by"),
  { kind: "note", text: "Only for a panel of another size than the committee's: the authority it is assigned under, the reason and who records it." },
  { kind: "text", name: "panelOverrideAuthority", label: "Authority for a panel of another size" },
  { kind: "textarea", name: "panelOverrideReason", label: "Why the panel is of another size" },
  { kind: "select", name: "panelOverrideByPersonId", label: "Recorded by (panel of another size)", placeholder: "Not applicable", options: people, hint: ON_BEHALF },
];

export function StartOpeningDrawer({ exerciseId, allowed, seats, people, panelSize, independence, estimateLate, noteId }: { exerciseId: string; allowed: Allowed; seats: Option[]; people: Option[]; panelSize: number | null; independence: string; estimateLate: string | null; noteId: string }) {
  return blockedOr(
    allowed,
    "Start the opening",
    () => (
      <RecordEditor
        title="Start the opening"
        description={`The panel is drawn from the seats of the committee the method names, each member present or not. The checklist each bid is checked against, and the rules its verdicts read, are frozen now. ${independence}`}
        columns={2}
        fields={[
          hidden("exerciseId"),
          ...panelFields(seats, people, panelSize),
          ...(estimateLate
            ? ([
                { kind: "note", text: estimateLate },
                { kind: "select", name: "lateOverridePersonId", label: "Override by", placeholder: "Choose", options: people, hint: "Someone holding the office that may override a late estimate. Recorded on their behalf, not signed." },
                { kind: "textarea", name: "lateOverrideReason", label: "Why the late estimate is accepted" },
              ] as Field[])
            : []),
        ]}
        values={{ exerciseId }}
        action={startOpening}
        submitLabel="Start the opening"
        trigger={{ label: "Start the opening", className: primary }}
        size="lg"
      />
    ),
    { primary: true, noteId },
  );
}

export function StartSupplementaryDrawer({ exerciseId, decisionId, sequence, allowed, seats, people, panelSize }: { exerciseId: string; decisionId: string; sequence: number; allowed: Allowed; seats: Option[]; people: Option[]; panelSize: number | null }) {
  return blockedOr(allowed, "Start its supplementary opening", () => (
    <RecordEditor
      title={`Supplementary opening of envelope ${sequence}`}
      description="The committee admitted this late envelope. It is opened at its own opening, under the main opening's checklist and rules, by a panel drawn as the main one was; its offer is added to the schedule as a new version."
      columns={2}
      fields={[hidden("exerciseId"), hidden("decisionId"), ...panelFields(seats, people, panelSize)]}
      values={{ exerciseId, decisionId }}
      action={startSupplementaryOpening}
      submitLabel="Start the supplementary opening"
      trigger={{ label: "Start its supplementary opening", className: secondary, ariaLabel: `Start the supplementary opening of envelope ${sequence}` }}
      size="lg"
    />
  ));
}

// ------------------------------------------------------------------ authorising, adjourning

export function AuthoriseDrawer({ exerciseId, openingId, personId, name, allowed }: { exerciseId: string; openingId: string; personId: string; name: string; allowed: Allowed }) {
  return blockedOr(allowed, "Authorise", () => (
    <RecordEditor
      title={`${name} authorises the opening`}
      description="Recorded on their behalf, not signed, and stamped by the portal's clock when you save. The second present member's authorisation opens the box (or lets a resumed sitting record again). The box and its key remain the control."
      fields={[hidden("exerciseId"), hidden("openingId"), hidden("personId"), { kind: "readonly", name: "who", label: "Authorised by", text: name }]}
      values={{ exerciseId, openingId, personId }}
      action={recordAuthorisation}
      submitLabel="Record the authorisation"
      trigger={{ label: "Authorise", className: secondary, ariaLabel: `Record ${name}'s authorisation` }}
      size="sm"
    />
  ));
}

export function AdjournDrawer({ exerciseId, openingId, allowed, people, resume }: { exerciseId: string; openingId: string; allowed: Allowed; people: Option[]; resume: boolean }) {
  const label = resume ? "Resume" : "Adjourn";
  return blockedOr(allowed, label, () => (
    <RecordEditor
      title={resume ? "Resume the opening" : "Adjourn the opening"}
      description={resume ? "A new sitting starts. Nothing is recorded until two panel members present each authorise it again." : "The sitting ends. Nothing recorded is lost; an authorisation not yet paired lapses and is kept, marked lapsed. Resuming needs two fresh authorisations."}
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "textarea", name: "reason", label: resume ? "Why it resumes now" : "Why it is adjourned", required: true }, recorder(people)]}
      values={{ exerciseId, openingId }}
      action={resume ? resumeOpening : adjournOpening}
      submitLabel={resume ? "Resume" : "Adjourn"}
      trigger={{ label, className: secondary }}
      size="md"
    />
  ));
}

// ------------------------------------------------------------------ the box, withdrawals

export function RegisterBoxDrawer({ exerciseId, openingId, allowed, people }: { exerciseId: string; openingId: string; allowed: Allowed; people: Option[] }) {
  return blockedOr(allowed, "Register an envelope from the box", () => (
    <RecordEditor
      title="Register an envelope found in the box"
      description="Every envelope in the box is registered before the first is opened. It is in time by the box's lock, whatever the gap after the closing, which is shown as a finding; its time reads 'In the box when it was locked', never a receipt time."
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        { kind: "select", name: "kind", label: "Envelope", required: true, placeholder: "Choose", options: [{ value: "BID", label: "Bid" }, { value: "ALTERNATIVE", label: "Alternative bid (marked as one on the envelope)" }] },
        { kind: "textarea", name: "markings", label: "Markings, as written on the envelope", required: true },
        recorder(people),
      ]}
      values={{ exerciseId, openingId }}
      action={registerBoxEnvelope}
      submitLabel="Register it"
      trigger={{ label: "Register an envelope from the box", className: secondary }}
      size="md"
    />
  ));
}

export function MatchWithdrawalDrawer({ exerciseId, openingId, withdrawalId, received, envelopes, allowed }: { exerciseId: string; openingId: string; withdrawalId: string; received: string; envelopes: Option[]; allowed: Allowed }) {
  return blockedOr(allowed, "Match to an envelope", () => (
    <RecordEditor
      title="Match the withdrawal to its envelope"
      description={`The withdrawal received ${received}, for an envelope in the box. The envelope matched is not opened: it is listed as withdrawn.`}
      fields={[hidden("exerciseId"), hidden("openingId"), hidden("withdrawalId"), { kind: "select", name: "envelopeId", label: "The envelope it withdraws", required: true, placeholder: "Choose", options: envelopes }]}
      values={{ exerciseId, openingId, withdrawalId }}
      action={matchWithdrawal}
      submitLabel="Match it"
      trigger={{ label: "Match to an envelope", className: ghost }}
      size="md"
    />
  ));
}

export function WithdrawalFindingDrawer({ exerciseId, openingId, withdrawalId, allowed, people }: { exerciseId: string; openingId: string; withdrawalId: string; allowed: Allowed; people: Option[] }) {
  return blockedOr(allowed, "Record what the panel found", () => (
    <RecordEditor
      title="No envelope matched the withdrawal"
      description="Say what the panel found. The opening is not finalised while a withdrawal is neither matched nor explained."
      fields={[hidden("exerciseId"), hidden("openingId"), hidden("withdrawalId"), { kind: "textarea", name: "finding", label: "What the panel found", required: true }, recorder(people)]}
      values={{ exerciseId, openingId, withdrawalId }}
      action={recordWithdrawalFinding}
      submitLabel="Record it"
      trigger={{ label: "Record what the panel found", className: ghost }}
      size="md"
    />
  ));
}

// ------------------------------------------------------------------ opening an envelope

const offerFields = (): Field[] => [
  { kind: "money", name: "price", label: "Price as read", required: true, hint: "As read out from the form of tender. SULIT: not restricted until sign-in." },
  { kind: "number", name: "validityDays", label: "Validity stated (days)", min: 1 },
  { kind: "number", name: "periodValue", label: "Completion period", min: 1 },
  { kind: "select", name: "periodUnit", label: "Unit", placeholder: "Not stated", options: PERIOD_UNITS },
];

export function OpenEnvelopeDrawer({ exerciseId, openingId, envelope, parties, parents, allowed }: { exerciseId: string; openingId: string; envelope: { id: string; sequence: number; markings: string; isAlternative: boolean }; parties: Option[]; parents: Option[]; allowed: Allowed }) {
  return blockedOr(allowed, "Open", () => (
    <RecordEditor
      title={`Open envelope ${envelope.sequence}`}
      description={`It takes the next number (Bil.) when you save, and the bidder is named here for the first time. Markings: ${envelope.markings}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        hidden("envelopeId"),
        { kind: "select", name: "partyId", label: "The bidder", placeholder: "Not on the exercise yet: name it below", options: parties, hint: "Pick it where it bought the documents or was invited." },
        { kind: "text", name: "bidderName", label: "Bidder's name as read", hint: "Required for a bidder not on the exercise; otherwise its name as written on the bid, if it differs." },
        { kind: "text", name: "registrationNo", label: "Registration number as read", hint: "Required for a bidder not on the exercise." },
        { kind: "text", name: "registrationClass", label: "Registration class as read" },
        { kind: "text", name: "registrationStatus", label: "Registration status as read" },
        ...(envelope.isAlternative ? [{ kind: "select", name: "parentOpenedBidId", label: "Alternative to", placeholder: "Not named", options: parents } as Field] : []),
        ...offerFields(),
      ]}
      values={{ exerciseId, openingId, envelopeId: envelope.id }}
      action={openEnvelope}
      submitLabel="Record it as opened"
      trigger={{ label: "Open", className: secondary, ariaLabel: `Open envelope ${envelope.sequence}` }}
      size="lg"
    />
  ));
}

export function AlternativeInsideDrawer({ exerciseId, bid, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; allowed: Allowed }) {
  return blockedOr(allowed, "Alternative inside", () => (
    <RecordEditor
      title={`An alternative inside No. ${bid.listingNo}`}
      description="An alternative offer found inside this envelope: the same bidder, its own offer and the next number."
      columns={2}
      fields={[hidden("exerciseId"), hidden("openedBidId"), ...offerFields()]}
      values={{ exerciseId, openedBidId: bid.id }}
      action={recordAlternative}
      submitLabel="Record the alternative"
      trigger={{ label: "Alternative inside", className: ghost, ariaLabel: `Record an alternative inside No. ${bid.listingNo}` }}
      size="md"
    />
  ));
}

// ------------------------------------------------------------------ initials, checklist, verdicts, corrections

export function InitialDrawer({ exerciseId, bid, person, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; person: { id: string; name: string }; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`${person.name} initials No. ${bid.listingNo}`}
      description="The member's initial on the offer as read out, recorded on their behalf, not signed. After a correction it is taken again."
      fields={[hidden("exerciseId"), hidden("openedBidId"), hidden("personId"), { kind: "readonly", name: "who", label: "Initialled by", text: person.name }]}
      values={{ exerciseId, openedBidId: bid.id, personId: person.id }}
      action={recordInitial}
      submitLabel="Record the initial"
      trigger={{ label: `Initial: ${person.name}`, className: ghost, ariaLabel: `Record ${person.name}'s initial on No. ${bid.listingNo}` }}
      size="sm"
    />
  );
}

export function ChecklistDrawer({ exerciseId, bid, items, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; items: { key: string; label: string; answerLabel: string }[]; allowed: Allowed }) {
  if (items.length === 0) return null;
  return blockedOr(allowed, "Answer the checklist", () => (
    <RecordEditor
      title={`Checklist for No. ${bid.listingNo}`}
      description={`One item at a time. A changed answer clears the offer's verdict, which is recorded again. As it stands: ${items.map((i) => `${i.label}: ${i.answerLabel.toLowerCase()}`).join("; ")}.`}
      fields={[
        hidden("exerciseId"),
        hidden("openedBidId"),
        { kind: "select", name: "itemKey", label: "Item", required: true, placeholder: "Choose", options: items.map((i) => ({ value: i.key, label: `${i.label} (${i.answerLabel.toLowerCase()})` })) },
        { kind: "select", name: "answer", label: "In the bid", required: true, placeholder: "Choose", options: [{ value: "PRESENT", label: "Present" }, { value: "ABSENT", label: "Absent" }, { value: "NOT_APPLICABLE", label: "Not applicable" }] },
      ]}
      values={{ exerciseId, openedBidId: bid.id }}
      action={recordChecklistAnswer}
      submitLabel="Record the answer"
      trigger={{ label: "Answer the checklist", className: ghost, ariaLabel: `Answer the checklist for No. ${bid.listingNo}` }}
      size="md"
    />
  ));
}

export function VerdictDrawer({ exerciseId, bid, options, grounds, reported, allowed, people }: { exerciseId: string; bid: { id: string; listingNo: number }; options: { value: string; label: string; disabled?: boolean }[]; grounds: string[]; reported: string[]; allowed: Allowed; people: Option[] }) {
  return blockedOr(allowed, "Record the verdict", () => (
    <RecordEditor
      title={`Verdict on No. ${bid.listingNo}`}
      description={`The opening does not evaluate: it carries a bid unless a ground the rules make eliminatory stands against it. ${grounds.length ? `Standing: ${grounds.join("; ")}.` : "No eliminatory ground stands."}${reported.length ? ` Reported to the committee: ${reported.join("; ")}.` : ""}`}
      fields={[
        hidden("exerciseId"),
        hidden("openedBidId"),
        { kind: "select", name: "verdict", label: "Verdict", required: true, placeholder: "Choose", options },
        { kind: "textarea", name: "verdictReason", label: "Why it is not carried", hint: "In words, for the committee." },
        recorder(people),
      ]}
      showWhen={{ verdictReason: { name: "verdict", in: ["REJECT"] } }}
      values={{ exerciseId, openedBidId: bid.id }}
      action={recordVerdict}
      submitLabel="Record the verdict"
      trigger={{ label: "Record the verdict", className: ghost, ariaLabel: `Record the verdict on No. ${bid.listingNo}` }}
      size="md"
    />
  ));
}

export function CorrectAsReadDrawer({ exerciseId, bid, values, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; values: Record<string, string>; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`Correct what was read for No. ${bid.listingNo}`}
      description="A keying slip only, before finalising, with the reason. The before and after are kept, and each present member initials it again. The price is entered afresh: it is not shown back here."
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("openedBidId"),
        { kind: "text", name: "bidderName", label: "Bidder's name as read", required: true },
        { kind: "text", name: "registrationClass", label: "Registration class as read" },
        { kind: "text", name: "registrationStatus", label: "Registration status as read" },
        ...offerFields(),
        { kind: "textarea", name: "reason", label: "What was keyed wrongly", required: true },
      ]}
      values={{ exerciseId, openedBidId: bid.id, ...values }}
      action={correctAsRead}
      submitLabel="Record the correction"
      trigger={{ label: "Correct", className: ghost, ariaLabel: `Correct what was read for No. ${bid.listingNo}` }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ the schedule's paper, finalising

export function SignatureDrawer({ exerciseId, openingId, person, allowed }: { exerciseId: string; openingId: string; person: { id: string; name: string }; allowed: Allowed }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={`${person.name} signed the schedule`}
      description="The day written beside the signature on the paper schedule. Recorded on their behalf, not signed."
      fields={[hidden("exerciseId"), hidden("openingId"), hidden("personId"), { kind: "date", name: "signedOn", label: "Signed on", required: true }]}
      values={{ exerciseId, openingId, personId: person.id }}
      action={recordSignature}
      submitLabel="Record the signature"
      trigger={{ label: `Signed: ${person.name}`, className: ghost, ariaLabel: `Record ${person.name}'s signature on the schedule` }}
      size="sm"
    />
  );
}

export function ScheduleDetailsDrawer({ exerciseId, openingId, pages, minutes, allowed }: { exerciseId: string; openingId: string; pages: number | null; minutes: string; allowed: Allowed }) {
  return blockedOr(allowed, "Pages and minutes", () => (
    <RecordEditor
      title="The signed schedule's pages, and the minutes"
      description="The number of pages the panel signed, as the schedule's header carries it, and the minutes of the opening."
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "number", name: "schedulePages", label: "Pages of the signed schedule", required: true, min: 1 }, { kind: "textarea", name: "minutes", label: "Minutes" }]}
      values={{ exerciseId, openingId, schedulePages: pages == null ? "" : String(pages), minutes }}
      action={recordScheduleDetails}
      submitLabel="Save"
      trigger={{ label: "Pages and minutes", className: ghost }}
      size="md"
    />
  ));
}

export function FinaliseDrawer({ exerciseId, openingId, title, allowed, people, paper }: { exerciseId: string; openingId: string; title: string; allowed: Allowed; people: Option[]; paper: { required: boolean } | null }) {
  return blockedOr(allowed, "Finalise", () => (
    <RecordEditor
      title={`Finalise the ${title.toLowerCase()}`}
      description={`Nothing on it changes after this. In the same step the schedule and its Grand Summary are frozen${paper ? ", the company estimate is disclosed and its paper copy compared with the lodged version" : ""}. The signed schedule's scan is attached afterwards, on the Schedule section.`}
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        recorder(people, "personId", "Finalised by"),
        ...(paper
          ? ([
              { kind: "select", name: "paperCopy", label: "The estimate's paper copy in the box", required: paper.required, placeholder: paper.required ? "Choose" : "Not entered", options: [{ value: "figure", label: "It was in the box: enter its figure" }, { value: "notInBox", label: "It was not in the box" }], hint: "Compared only once everything else is in order, when the estimate is disclosed. A difference never refuses finalising: it is a finding to explain." },
              { kind: "money", name: "paperFigure", label: "The figure on the paper copy", sealed: true },
            ] as Field[])
          : []),
      ]}
      showWhen={{ paperFigure: { name: "paperCopy", in: ["figure"] } }}
      values={{ exerciseId, openingId }}
      action={finaliseOpening}
      submitLabel="Finalise"
      trigger={{ label: "Finalise", className: primary }}
      size="md"
    />
  ), { primary: true });
}

export function CopyExplanationDrawer({ exerciseId, openingId, people }: { exerciseId: string; openingId: string; people: Option[] }) {
  return (
    <RecordEditor
      title="Explain the estimate's paper copy"
      description="Recorded once and never edited. Evaluation and the award wait for it."
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "textarea", name: "explanation", label: "Explanation", required: true }, recorder(people)]}
      values={{ exerciseId, openingId }}
      action={recordCopyExplanation}
      submitLabel="Record the explanation"
      trigger={{ label: "Record the explanation", className: secondary }}
      size="md"
    />
  );
}
