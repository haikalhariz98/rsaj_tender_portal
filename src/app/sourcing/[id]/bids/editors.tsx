import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { WITHDRAWAL_QUOTE_HINT } from "@/lib/bids/labels";

import { applyValidityExtension, correctEnvelope, lockBox, recordReceiptAfterTheFact, recordReceiptNow, recordReturnedUnopened, recordValidityExtension, recordWithdrawal, saveBidAnswers, tableLateMatter } from "./actions";

/**
 * The drawers of the Received section of Bids and opening. Fields are data; every rule sits in the action and the
 * pure checks behind it (`src/lib/bids`). Where those checks already say an act cannot proceed,
 * the control is disabled with the reason beside it, judged by the rule the action runs. There is
 * no time field on the server-stamped receipt: the server's clock stamps it. There is no Delete and
 * no Reject anywhere: a late envelope's admission is the committee's.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const KIND_OPTIONS: Option[] = [
  { value: "BID", label: "Bid" },
  { value: "ALTERNATIVE", label: "Alternative bid (marked as one on the envelope)" },
];
const CHANNEL_OPTIONS: Option[] = [
  { value: "COUNTER", label: "Over the counter" },
  { value: "POST", label: "By post" },
  { value: "COURIER", label: "By courier" },
];
const PROVENANCE_OPTIONS: Option[] = [
  { value: "STATED", label: "Stated: written in the tender documents" },
  { value: "OBSERVED", label: "Observed: seen in practice" },
  { value: "ASSUMED", label: "Assumed: a working figure, needs confirming" },
];

const receiptFields = (people: Option[], bids: Option[]): Field[] => [
  hidden("exerciseId"),
  { kind: "select", name: "kind", label: "Envelope", required: true, placeholder: "Choose", options: KIND_OPTIONS },
  { kind: "select", name: "parentEnvelopeId", label: "Alternative to", placeholder: "Not named on the envelope", options: bids, hint: "Only if the envelope names it." },
  { kind: "select", name: "channel", label: "How it came", required: true, placeholder: "Choose", options: CHANNEL_OPTIONS, hint: "Tender box envelopes are registered at opening." },
  { kind: "textarea", name: "markings", label: "Markings, as written on the envelope", required: true, hint: "Title, number and closing as shown." },
  actorField("BidEnvelope.receivedBy", { name: "receivedByPersonId", people }),
];

/// FR-BID-002: the server stamps the receipt when it is saved. No time is asked.
export function ReceiveNowDrawer({ exerciseId, allowed, people, bids, noteId }: { exerciseId: string; allowed: Allowed; people: Option[]; bids: Option[]; noteId: string }) {
  if (!allowed.allowed) return <Blocked label="Record a receipt now" reason={allowed.reason} primary noteId={noteId} />;
  return (
    <RecordEditor
      title="Record a receipt now"
      description="The portal stamps the time on save. Late envelopes go to the committee."
      fields={[...receiptFields(people, bids), { kind: "note", text: "Record it as handed over. After closing it is late." }]}
      values={{ exerciseId }}
      showWhen={{ parentEnvelopeId: { name: "kind", in: ["ALTERNATIVE"] } }}
      action={recordReceiptNow}
      submitLabel="Record the receipt"
      trigger={{ label: "Record a receipt now", className: primary }}
      size="md"
    />
  );
}

/// OD-3 amended: recorded after the event. The stamp still decides; the stated time is kept beside it.
export function ReceiveLaterDrawer({ exerciseId, allowed, people, bids, noteId }: { exerciseId: string; allowed: Allowed; people: Option[]; bids: Option[]; noteId: string }) {
  if (!allowed.allowed) return <Blocked label="Record a receipt after the event" reason={allowed.reason} noteId={noteId} />;
  return (
    <RecordEditor
      title="Record a receipt after the event"
      description="The portal stamps it now, and that stamp decides lateness."
      more="The time you state, and why it is recorded now, are kept beside the stamp and shown to the committee as your statement, never judged."
      columns={2}
      fields={[
        ...receiptFields(people, bids),
        { kind: "date", name: "statedDay", label: "Received on", required: true },
        { kind: "time", name: "statedTime", label: "At", required: true, hint: "On the organisation's clock." },
        { kind: "textarea", name: "entryReason", label: "Why it is recorded now", required: true },
      ]}
      values={{ exerciseId }}
      showWhen={{ parentEnvelopeId: { name: "kind", in: ["ALTERNATIVE"] } }}
      action={recordReceiptAfterTheFact}
      submitLabel="Record the receipt"
      trigger={{ label: "Record a receipt after the event", className: secondary }}
      size="lg"
    />
  );
}

/// FR-BID-004, X-11: a withdrawal letter received before the closing.
export function WithdrawalDrawer({ exerciseId, allowed, people, envelopes, noteId }: { exerciseId: string; allowed: Allowed; people: Option[]; envelopes: Option[]; noteId: string }) {
  if (!allowed.allowed) return <Blocked label="Record a withdrawal" reason={allowed.reason} noteId={noteId} />;
  return (
    <RecordEditor
      title="Record a withdrawal letter"
      description="Received before closing. Attach the letter afterwards: it is held SULIT."
      more="Name the envelope where it was received over the counter or by post. One in the tender box is matched at the opening and is not opened."
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "envelopeId", label: "Envelope withdrawn", placeholder: "In the tender box: matched at the opening", options: envelopes },
        { kind: "textarea", name: "markings", label: "How the letter identifies the envelope", required: true, hint: WITHDRAWAL_QUOTE_HINT },
        actorField("BidWithdrawal.receivedBy", { name: "receivedByPersonId", people }),
      ]}
      values={{ exerciseId }}
      action={recordWithdrawal}
      submitLabel="Record the withdrawal"
      trigger={{ label: "Record a withdrawal", className: secondary }}
      size="md"
    />
  );
}

/// The box locked at the closing, by a named officer, stamped now.
export function LockBoxDrawer({ exerciseId, allowed, people, noteId }: { exerciseId: string; allowed: Allowed; people: Option[]; noteId: string }) {
  if (!allowed.allowed) return <Blocked label="Record the box locked" reason={allowed.reason} noteId={noteId} />;
  return (
    <RecordEditor
      title="Record the tender box locked"
      description="Records who locked it, stamped now. The box and key remain the control."
      fields={[
        hidden("exerciseId"),
        actorField("BoxEvent.person", { name: "personId", people, label: "Locked by", paper: false }),
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ exerciseId }}
      action={lockBox}
      submitLabel="Record it"
      trigger={{ label: "Record the box locked", className: secondary }}
      size="sm"
    />
  );
}

/// FR-BID-005: the one correction — the portal's record of the envelope, never the bid.
export function CorrectDrawer({ exerciseId, envelope }: { exerciseId: string; envelope: { id: string; sequence: number; markings: string; channel: string; receivedById: string } }) {
  return (
    <RecordEditor
      title={`Correct the record of envelope ${envelope.sequence}`}
      description="Markings and channel only, before closing, with a reason."
      more="The receiving officer is the officer who recorded it. The received time, sequence, late flag and kind are never corrected, and nothing changes after the closing."
      fields={[
        hidden("exerciseId"),
        hidden("envelopeId"),
        { kind: "select", name: "channel", label: "How it came", required: true, options: CHANNEL_OPTIONS },
        { kind: "textarea", name: "markings", label: "Markings, as written on the envelope", required: true },
      ]}
      values={{ exerciseId, envelopeId: envelope.id, channel: envelope.channel, markings: envelope.markings }}
      action={correctEnvelope}
      submitLabel="Save the correction"
      destructive={{ reasonLabel: "Why is it corrected?" }}
      trigger={{ label: "Correct", className: ghost, ariaLabel: `Correct the record of envelope ${envelope.sequence}` }}
      size="md"
    />
  );
}

/// A withdrawn envelope handed back unopened.
export function ReturnedDrawer({ exerciseId, envelopeId, sequence }: { exerciseId: string; envelopeId: string; sequence: number }) {
  return (
    <RecordEditor
      title={`Envelope ${sequence} handed back unopened`}
      description="Day handed back unopened."
      fields={[hidden("exerciseId"), hidden("envelopeId"), { kind: "date", name: "returnedOn", label: "Handed back on", required: true }, { kind: "textarea", name: "returnNote", label: "To whom, and how" }]}
      values={{ exerciseId, envelopeId }}
      action={recordReturnedUnopened}
      submitLabel="Record it"
      trigger={{ label: "Handed back", className: ghost, ariaLabel: `Record envelope ${sequence} handed back unopened` }}
      size="sm"
    />
  );
}

/// FR-CTE-008: a late envelope's admission, tabled at a sitting of the method's committee.
export function TableLateDrawer({ exerciseId, envelopeId, name, committee, sittings, holders, allowed }: { exerciseId: string; envelopeId: string; name: string; committee: string | null; sittings: Option[]; holders: Option[]; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Table for admission" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Table ${name.toLowerCase()} for admission`}
      description={`A matter for ${committee ?? "the committee"}. Carried means admitted. Only its Secretariat tables it.`}
      fields={[
        hidden("exerciseId"),
        hidden("envelopeId"),
        { kind: "select", name: "meetingId", label: "Sitting", required: true, placeholder: "Choose", options: sittings, hint: "Scheduled or in progress." },
        actorField("CommitteeDecision.tabledBy", { name: "tabledByPersonId", people: holders, hint: holders.length === 0 ? "Nobody holds the Secretariat office." : "Only the Secretariat can table." }),
      ]}
      values={{ exerciseId, envelopeId }}
      action={tableLateMatter}
      submitLabel="Table it"
      trigger={{ label: "Table for admission", className: secondary }}
      size="md"
    />
  );
}

/// FR-BID-010: an extension of the bids' validity on the recommended tenderer's consent (OD-7).
export function ExtensionDrawer({ exerciseId, allowed, parties, people, expiry }: { exerciseId: string; allowed: Allowed; parties: Option[]; people: Option[]; expiry: string | null }) {
  if (!allowed.allowed) return <Blocked label="Record an extension" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Record an extension of the bids' validity"
      description={`Valid until ${expiry ?? "a day not set"}. The new expiry must be later. Attach the tenderer's consent, then apply.`}
      more="The recommended tenderer you name is recorded on your behalf and is not checked against an evaluation."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "date", name: "toExpiry", label: "Valid until", required: true },
        { kind: "date", name: "consentReceivedOn", label: "Consent received on", required: true },
        { kind: "select", name: "consentPartyId", label: "Recommended tenderer", required: true, placeholder: "Choose", options: parties, hint: "Not checked against an evaluation." },
        actorField("ValidityExtension.recordedBy", { name: "recordedByPersonId", people }),
        { kind: "textarea", name: "reason", label: "Why it is extended", required: true },
      ]}
      values={{ exerciseId }}
      action={recordValidityExtension}
      submitLabel="Record the extension"
      trigger={{ label: "Record an extension", className: secondary }}
      size="lg"
    />
  );
}

export function ApplyExtensionDrawer({ exerciseId, extensionId, to, allowed }: { exerciseId: string; extensionId: string; to: string; allowed: Allowed }) {
  if (!allowed.allowed) return <Blocked label="Apply" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Apply the extension to ${to}`}
      description="Bids are then valid until this day."
      fields={[hidden("exerciseId"), hidden("extensionId")]}
      values={{ exerciseId, extensionId }}
      action={applyValidityExtension}
      submitLabel="Apply it"
      trigger={{ label: "Apply", className: secondary }}
      size="sm"
    />
  );
}

/// FR-BID-006, 009: the window's bid answers.
export function BidAnswersDrawer({ exerciseId, allowed, values, needsReason }: { exerciseId: string; allowed: Allowed; values: Record<string, string>; needsReason: boolean }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={needsReason ? "Record the bids' validity" : "Bid validity and alternatives"}
      description={needsReason ? "Validity not on record. Enter the days the documents state, with source and reason." : "Days the documents state. Left empty, no award can be issued."}
      fields={[
        hidden("exerciseId"),
        { kind: "number", name: "bidValidityDays", label: "Bids valid for (days from the closing day)", min: 1, required: needsReason },
        { kind: "select", name: "bidValidityProvenance", label: "Where the days came from", placeholder: "Choose", options: PROVENANCE_OPTIONS },
        { kind: "select", name: "alternativesPermitted", label: "Alternative bids", required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "yes", label: "Permitted" }, { value: "no", label: "Not permitted" }, { value: "unset", label: "Not stated" }] },
        ...(needsReason
          ? [{ kind: "textarea", name: "reason", label: "Why it is recorded now", required: true } as Field]
          : []),
      ]}
      values={{ exerciseId, ...values }}
      action={saveBidAnswers}
      submitLabel="Save"
      trigger={{ label: needsReason ? "Record the validity" : "Edit", className: needsReason ? primary : ghost, ariaLabel: "Edit the bids' validity and alternatives" }}
      size="md"
    />
  );
}
