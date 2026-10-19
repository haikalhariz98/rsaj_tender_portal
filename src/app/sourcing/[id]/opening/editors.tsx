import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { authoriseOnlineUnseal } from "./unseal-actions";
import { fileSealedBidFiles, finaliseOnline, signOnlineFinalise } from "./online-finalise-actions";
import type { ColumnSeen } from "@/lib/opening/matrix";
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
 * named is the signed-in officer, or, for a panel member's paper initial or signature, recorded for them and not signed (ADR 0017, Phase 2b). A panel member's authorisation is never recorded for them: each signs in as themselves (FR-OPN-003, Phase 3d). Nothing here offers a Delete.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const PERIOD_UNITS: Option[] = [
  { value: "DAYS", label: "Days" },
  { value: "WEEKS", label: "Weeks" },
  { value: "MONTHS", label: "Months" },
];
/// Who is acting: the signed-in officer, shown and not chosen (Phase 2b).
const by = (slot: string, people: Option[], name = "personId", label?: string, paper = false): Field => actorField(slot, { name, people, label, paper });

function blockedOr(allowed: Allowed, label: string, node: () => React.ReactNode, opts: { primary?: boolean; noteId?: string } = {}) {
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} primary={opts.primary} noteId={opts.noteId} />;
  return node();
}

// ------------------------------------------------------------------ starting

/// Where the exercise names its opening officers (SR-07) the panel is those officers, and only who is present is asked.
const rosterPanelFields = (officers: Option[], people: Option[]): Field[] => [
  { kind: "note", text: `Panel: ${officers.map((o) => o.label).join("; ")}.` },
  { kind: "tokens", name: "present", label: "Present at the opening", options: officers, placeholder: "Pick who is present", hint: "Fixed at the start. At least two present." },
  by("Opening.startedBy", people, "startedByPersonId", "Recorded by"),
  { kind: "note", text: "Only if the panel size changed since the officers were named." },
  { kind: "text", name: "panelOverrideAuthority", label: "Authority for a panel of another size" },
  { kind: "textarea", name: "panelOverrideReason", label: "Why the panel is of another size" },
];

const panelFields = (seats: Option[], people: Option[], panelSize: number | null): Field[] => [
  { kind: "tokens", name: "panel", label: "The panel", options: seats, placeholder: "Pick from the committee's seats", hint: panelSize == null ? "Panel size not set." : `Committee panel: ${panelSize}.` },
  { kind: "tokens", name: "present", label: "Present at the opening", options: seats, placeholder: "Pick who is present", hint: "Fixed at the start. At least two present." },
  by("Opening.startedBy", people, "startedByPersonId", "Recorded by"),
  { kind: "note", text: "Only for a panel of another size." },
  { kind: "text", name: "panelOverrideAuthority", label: "Authority for a panel of another size" },
  { kind: "textarea", name: "panelOverrideReason", label: "Why the panel is of another size" },
];

export function StartOpeningDrawer({ exerciseId, allowed, seats, roster, people, panelSize, independence, estimateLate, noteId }: { exerciseId: string; allowed: Allowed; seats: Option[]; roster: Option[] | null; people: Option[]; panelSize: number | null; independence: string; estimateLate: string | null; noteId: string }) {
  return blockedOr(
    allowed,
    "Start the opening",
    () => (
      <RecordEditor
        title="Start the opening"
        description={`Freezes the checklist and verdict rules. ${independence}`}
        columns={2}
        fields={[
          hidden("exerciseId"),
          ...(roster ? rosterPanelFields(roster, people) : panelFields(seats, people, panelSize)),
          ...(estimateLate
            ? ([
                { kind: "note", text: estimateLate },
                actorField("EstimateEvent.person", { name: "lateOverridePersonId", people, label: "Override by", hint: "Holder of the override office." }),
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

export function StartSupplementaryDrawer({ exerciseId, decisionId, sequence, allowed, seats, roster, people, panelSize }: { exerciseId: string; decisionId: string; sequence: number; allowed: Allowed; seats: Option[]; roster: Option[] | null; people: Option[]; panelSize: number | null }) {
  return blockedOr(allowed, "Start its supplementary opening", () => (
    <RecordEditor
      title={`Supplementary opening of envelope ${sequence}`}
      description="Adds its offer to the schedule as a new version."
      columns={2}
      fields={[hidden("exerciseId"), hidden("decisionId"), ...(roster ? rosterPanelFields(roster, people) : panelFields(seats, people, panelSize))]}
      values={{ exerciseId, decisionId }}
      action={startSupplementaryOpening}
      submitLabel="Start the supplementary opening"
      trigger={{ label: "Start its supplementary opening", className: secondary, ariaLabel: `Start the supplementary opening of envelope ${sequence}` }}
      size="lg"
    />
  ));
}

// ------------------------------------------------------------------ authorising, adjourning

/// A panel member authorises their own seat, signed in as themselves (FR-OPN-003, Phase 3d): the page offers this only on the row of the member who is signed in.
export function AuthoriseDrawer({ exerciseId, openingId, name, allowed, online = null }: { exerciseId: string; openingId: string; name: string; allowed: Allowed; /** ONLINE: how many named officers must authorise. Null when the bids are not taken online. */ online?: number | null }) {
  if (online !== null) return <AuthoriseOnlineDrawer exerciseId={exerciseId} openingId={openingId} name={name} allowed={allowed} required={online} />;
  return blockedOr(allowed, "Authorise", () => (
    <RecordEditor
      title={`${name} authorises the opening`}
      description="Signed with your own password. Nobody authorises for another. The second authorisation opens the box."
      fields={[hidden("exerciseId"), hidden("openingId"), actorField("OpeningAuthorisation.person", { name: "personId" })]}
      values={{ exerciseId, openingId }}
      action={recordAuthorisation}
      submitLabel="Record the authorisation"
      trigger={{ label: "Authorise", className: secondary, ariaLabel: `Record ${name}'s authorisation` }}
      size="sm"
    />
  ));
}

/// ONLINE: a named officer authorises with the sign-in password and their own unseal passphrase (ADR 0036 D3, D10). Every named officer is needed; the last one's authorisation opens the bids.
export function AuthoriseOnlineDrawer({ exerciseId, openingId, name, allowed, required }: { exerciseId: string; openingId: string; name: string; allowed: Allowed; required: number }) {
  return blockedOr(allowed, "Authorise", () => (
    <RecordEditor
      title={`${name} authorises the opening`}
      description={`Signed as you. All ${required} named officers must authorise. The last one unseals the bids.`}
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true, hint: "Cannot be reset or recovered." }, actorField("OpeningAuthorisation.person", { name: "personId" })]}
      values={{ exerciseId, openingId }}
      action={authoriseOnlineUnseal}
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
      description={resume ? "Starts a new sitting. Two present members must authorise it." : "Ends the sitting. Resuming needs two fresh authorisations."}
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "textarea", name: "reason", label: resume ? "Why it resumes now" : "Why it is adjourned", required: true }, by("OpeningSitting.recordedBy", people)]}
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
      description="Register every envelope before opening the first."
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        { kind: "select", name: "kind", label: "Envelope", required: true, placeholder: "Choose", options: [{ value: "BID", label: "Bid" }, { value: "ALTERNATIVE", label: "Alternative bid (marked as one on the envelope)" }] },
        { kind: "textarea", name: "markings", label: "Markings, as written on the envelope", required: true },
        by("BidEnvelope.receivedBy", people),
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
      description={`Withdrawal received ${received}. The matched envelope is not opened.`}
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
      description="Finalising waits until every withdrawal is matched or explained."
      fields={[hidden("exerciseId"), hidden("openingId"), hidden("withdrawalId"), { kind: "textarea", name: "finding", label: "What the panel found", required: true }, by("BidWithdrawal.findingBy", people)]}
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
  { kind: "money", name: "price", label: "Price as read", required: true, hint: "As read out. SULIT." },
  { kind: "number", name: "validityDays", label: "Validity stated (days)", min: 1 },
  { kind: "number", name: "periodValue", label: "Completion period", min: 1 },
  { kind: "select", name: "periodUnit", label: "Unit", placeholder: "Not stated", options: PERIOD_UNITS },
];

export function OpenEnvelopeDrawer({ exerciseId, openingId, envelope, parties, parents, allowed }: { exerciseId: string; openingId: string; envelope: { id: string; sequence: number; markings: string; isAlternative: boolean }; parties: Option[]; parents: Option[]; allowed: Allowed }) {
  return blockedOr(allowed, "Open", () => (
    <RecordEditor
      title={`Open envelope ${envelope.sequence}`}
      description={`Markings: ${envelope.markings}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        hidden("envelopeId"),
        { kind: "select", name: "partyId", label: "The bidder", placeholder: "Not listed: name it below", options: parties },
        { kind: "text", name: "bidderName", label: "Bidder's name as read", hint: "Required if not listed." },
        { kind: "text", name: "registrationNo", label: "Registration number as read", hint: "Required if not listed." },
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
      description="Same bidder, its own offer, next number."
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

export function InitialDrawer({ exerciseId, bid, column, person, allowed, own = false }: { exerciseId: string; bid: { id: string; listingNo: number }; /** The column as this screen showed it: posted back, so a confirmation lands on that column or on none. */ column: ColumnSeen; person: { id: string; name: string }; allowed: Allowed; /** The matrix's "Confirm this column": the signed-in officer's own confirmation (SR-14). */ own?: boolean }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={own ? `Confirm No. ${bid.listingNo}` : `${person.name} initials No. ${bid.listingNo}`}
      description={own ? "Confirms the column as it stands. A later change asks again." : "Recorded from their paper, not signed. A correction asks again."}
      fields={[hidden("exerciseId"), hidden("openedBidId"), hidden("columnRevision"), hidden("asReadCorrections"), actorField("OpenedBidInitial.person", { name: "personId", forPerson: { id: person.id, name: person.name } })]}
      values={{ exerciseId, openedBidId: bid.id, columnRevision: String(column.columnRevision), asReadCorrections: String(column.asReadCorrections) }}
      action={recordInitial}
      submitLabel="Record the initial"
      trigger={own ? { label: "Confirm this column", className: secondary, ariaLabel: `Confirm the column of No. ${bid.listingNo}` } : { label: `Initial: ${person.name}`, className: ghost, ariaLabel: `Record ${person.name}'s initial on No. ${bid.listingNo}` }}
      size="sm"
    />
  );
}

export function ChecklistDrawer({ exerciseId, bid, items, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; items: { key: string; label: string; answerLabel: string }[]; allowed: Allowed }) {
  if (items.length === 0) return null;
  return blockedOr(allowed, "Answer the checklist", () => (
    <RecordEditor
      title={`Checklist for No. ${bid.listingNo}`}
      description="A changed answer clears the verdict."
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

export function VerdictDrawer({ exerciseId, bid, column, options, grounds, reported, allowed }: { exerciseId: string; bid: { id: string; listingNo: number }; column: ColumnSeen; options: { value: string; label: string; disabled?: boolean }[]; grounds: string[]; reported: string[]; allowed: Allowed }) {
  return blockedOr(allowed, "Record the verdict", () => (
    <RecordEditor
      title={`Verdict on No. ${bid.listingNo}`}
      description={`${grounds.length ? `Standing: ${grounds.join("; ")}.` : "No eliminating ground."}${reported.length ? ` Reported: ${reported.join("; ")}.` : ""}`}
      fields={[
        hidden("exerciseId"),
        hidden("openedBidId"),
        hidden("columnRevision"),
        hidden("asReadCorrections"),
        { kind: "select", name: "verdict", label: "Verdict", required: true, placeholder: "Choose", options },
        { kind: "textarea", name: "verdictReason", label: "Why it is not carried", hint: "In words, for the committee." },
      ]}
      showWhen={{ verdictReason: { name: "verdict", in: ["REJECT"] } }}
      values={{ exerciseId, openedBidId: bid.id, columnRevision: String(column.columnRevision), asReadCorrections: String(column.asReadCorrections) }}
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
      description="Keying slips only. Members initial again. Enter the price afresh."
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
      description="Recorded from their paper, not signed here."
      fields={[hidden("exerciseId"), hidden("openingId"), actorField("OpeningSignature.person", { name: "personId", dated: true, forPerson: { id: person.id, name: person.name } }), { kind: "date", name: "signedOn", label: "Signed on", required: true, hint: "Not after today." }]}
      values={{ exerciseId, openingId }}
      action={recordSignature}
      submitLabel="Record the signature"
      trigger={{ label: `Signed: ${person.name}`, className: ghost, ariaLabel: `Record ${person.name}'s signature on the schedule` }}
      size="sm"
    />
  );
}

/// ONLINE (ADR 0036 D10, ruling 20t): a named officer signs the schedule in their own sign-in with the password asked again. Never for another, and never from paper.
export function OnlineSignatureDrawer({ exerciseId, openingId, name, allowed }: { exerciseId: string; openingId: string; name: string; allowed: Allowed }) {
  return blockedOr(allowed, "Sign", () => (
    <RecordEditor
      title={`${name} signs the schedule`}
      description="Signed as you, dated today. Nobody signs for another."
      fields={[hidden("exerciseId"), hidden("openingId"), actorField("OpeningSignature.person", { name: "personId" })]}
      values={{ exerciseId, openingId }}
      action={signOnlineFinalise}
      submitLabel="Sign the schedule"
      trigger={{ label: "Sign the schedule", className: secondary, ariaLabel: `Record ${name}'s signature on the schedule` }}
      size="sm"
    />
  ));
}

/// ONLINE: any one named officer finalises, with the sign-in password and their own unseal passphrase, once every named officer has signed (ruling 20t). Both are asked every time.
export function OnlineFinaliseDrawer({ exerciseId, openingId, title, allowed }: { exerciseId: string; openingId: string; title: string; allowed: Allowed }) {
  return blockedOr(allowed, "Finalise", () => (
    <RecordEditor
      title={`Finalise the ${title.toLowerCase()}`}
      description="Unseals every bid and freezes the schedule. Cannot be undone."
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "text", name: "passphrase", label: "Unseal passphrase", required: true, secret: true, hint: "Cannot be reset or recovered." }, actorField("EstimateEvent.person", { name: "personId" })]}
      values={{ exerciseId, openingId }}
      action={finaliseOnline}
      submitLabel="Finalise"
      trigger={{ label: "Finalise", className: primary }}
      size="md"
    />
  ), { primary: true });
}

export function ScheduleDetailsDrawer({ exerciseId, openingId, pages, minutes, allowed }: { exerciseId: string; openingId: string; pages: number | null; minutes: string; allowed: Allowed }) {
  return blockedOr(allowed, "Pages and minutes", () => (
    <RecordEditor
      title="The signed schedule's pages, and the minutes"
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
      description={paper ? "Freezes the schedule and discloses the estimate. Cannot be undone." : "Freezes the schedule. Cannot be undone."}
      fields={[
        hidden("exerciseId"),
        hidden("openingId"),
        actorField("EstimateEvent.person", { name: "personId", people, label: "Finalised by", paper: false }),
        ...(paper
          ? ([
              { kind: "select", name: "paperCopy", label: "The estimate's paper copy in the box", required: paper.required, placeholder: paper.required ? "Choose" : "Not entered", options: [{ value: "figure", label: "It was in the box: enter its figure" }, { value: "notInBox", label: "It was not in the box" }], hint: "A difference is explained, never refused." },
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
      description="Recorded once. Cannot be edited."
      fields={[hidden("exerciseId"), hidden("openingId"), { kind: "textarea", name: "explanation", label: "Explanation", required: true }, by("EstimateCopyExplanation.recordedBy", people)]}
      values={{ exerciseId, openingId }}
      action={recordCopyExplanation}
      submitLabel="Record the explanation"
      trigger={{ label: "Record the explanation", className: secondary }}
      size="md"
    />
  );
}

/// ONLINE: files, again, the sealed bid files the filing after the finalise did not reach. No passphrase: the keys were released at the finalise.
export function FileSealedBidsDrawer({ exerciseId, openingId, waiting }: { exerciseId: string; openingId: string; waiting: number }) {
  return (
    <RecordEditor
      title="File the sealed bid files"
      description={`${waiting} file${waiting === 1 ? "" : "s"} left to file. Safe to repeat.`}
      fields={[hidden("exerciseId"), hidden("openingId")]}
      values={{ exerciseId, openingId }}
      action={fileSealedBidFiles}
      submitLabel="File them now"
      trigger={{ label: "File them now", className: secondary }}
      size="sm"
    />
  );
}
