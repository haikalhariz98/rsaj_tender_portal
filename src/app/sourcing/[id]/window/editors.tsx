import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { EXERCISE_NOTE_ID } from "../../editors";
import { Facts } from "../documents/editors";

import { chooseEvaluationModel, recordLetterDelivery, proposeInvitee, publishWindow, recordPublication, removeFeeLine, removeInvitee, removePublication, saveFeeLine, saveWindow } from "./actions";
import { requestCancellation, requestClosingChange, recordNoticeDelivery, recordWindowChangeDecision } from "./change-actions";
import { cancelEvent, issueAddendum, markEventHeld, recordAddendumDelivery, recordAttendance, recordReceipt, recordSale, saveAddendum, scheduleEvent, setEventMandatory, voidAddendum, voidSale } from "./register-actions";

/**
 * The drawers of the Invitation tab. Fields are data; every rule sits in the action and the pure
 * checks behind it (`src/lib/window`). Where those checks already say an act cannot proceed, the
 * control is disabled with the reason beside it (read.ts judges with the rule the action runs).
 * Every act that names a person reads "recorded on behalf of, not signed": nobody is signed in.
 * Nothing is sent from here: delivery is recorded, never carried out.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const THREE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unset", label: "Not answered" },
];
const DELIVERY_OPTIONS: Option[] = [
  { value: "REGISTERED_POST", label: "Registered post" },
  { value: "COLLECTION", label: "Collected" },
  { value: "BY_HAND", label: "By hand" },
];
const ON_BEHALF = "Name who did it: recorded on their behalf, not signed.";

// ------------------------------------------------------------------ the notice's items and fee

export type WindowItems = { inspectionPlace: string; purchasePlace: string; inspectionHours: string; purchaseFromDay: string; purchaseCloseDay: string; feeAmount: string; feePaymentMethods: string; submissionPlace: string; closingTimeReason: string; specialPermissionOffered: string };

export function EditWindowDrawer({ exerciseId, items, allowed, first }: { exerciseId: string; items: WindowItems | null; allowed: Allowed; first: boolean }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={first ? "Prepare the window" : "Edit the window"}
      description="What the notice states: where the documents are inspected and bought, the days of sale, the fee and where tenders go. The closing is not changed here: it was recorded when the documents were approved, and moves only by a closing change."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "text", name: "inspectionPlace", label: "Where the documents are inspected", required: true },
        { kind: "text", name: "purchasePlace", label: "Where the documents are bought", required: true },
        { kind: "text", name: "inspectionHours", label: "Inspection and purchase hours", required: true, hint: "As the notice states them." },
        { kind: "text", name: "submissionPlace", label: "Where tenders are submitted", required: true },
        { kind: "date", name: "purchaseFromDay", label: "First day of sale", required: true, hint: "Not before the advertisement day." },
        { kind: "date", name: "purchaseCloseDay", label: "Last day of sale", required: true, hint: "Judged against the closing by the cut-off set under Invitation controls." },
        { kind: "money", name: "feeAmount", label: "Document fee", required: true, hint: "Entered, not worked out from the basis. Judged against the minimum for its band." },
        { kind: "text", name: "feePaymentMethods", label: "How the fee is paid", required: true },
        { kind: "textarea", name: "closingTimeReason", label: "Why the closing time is not the usual one", hint: "Only if the closing time differs from the default time set under Invitation controls." },
        { kind: "select", name: "specialPermissionOffered", label: "Special permission", options: [{ value: "unset", label: "Not stated" }, { value: "yes", label: "Offered" }, { value: "no", label: "Not offered" }], hint: "Whether the notice offers special permission to a firm short of a grade or a field code. Not stated: none is granted on this exercise." },
      ]}
      values={{ exerciseId, specialPermissionOffered: "unset", ...(items ?? {}) }}
      action={saveWindow}
      submitLabel="Save"
      trigger={{ label: first ? "Prepare the window" : "Edit the window", className: first ? primary : secondary }}
      size="lg"
    />
  );
}

export function FeeLineDrawer({ exerciseId, allowed, kinds, line }: { exerciseId: string; allowed: Allowed; kinds: Option[]; line?: { id: string; label: string; values: Record<string, string> } }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={line ? `Change ${line.label}` : "Add a cost to the fee's basis"}
      description="The basis shows what the documents cost to produce. Give a quantity and a unit cost, or one amount. The line's amount is worked out by the portal."
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("lineId"),
        { kind: "select", name: "kind", label: "Cost", required: true, placeholder: "Choose", options: kinds },
        { kind: "text", name: "description", label: "Description" },
        { kind: "text", name: "quantity", label: "Quantity", hint: "Leave empty when giving one amount." },
        { kind: "money", name: "unitCost", label: "Unit cost" },
        { kind: "money", name: "amount", label: "Amount", hint: "Only where there is no quantity." },
      ]}
      values={{ exerciseId, lineId: line?.id ?? null, ...(line?.values ?? {}) }}
      action={saveFeeLine}
      submitLabel={line ? "Save" : "Add the cost"}
      trigger={line ? { label: "Edit", className: ghost, ariaLabel: `Edit ${line.label}` } : { label: "Add a cost", icon: true, className: secondary }}
      size="md"
    />
  );
}

/// 6.8 (E-2): choose the evaluation model, an issued version; publication pins it and it does not change after.
export function ChooseEvaluationModelDrawer({ exerciseId, allowed, models, current }: { exerciseId: string; allowed: Allowed; models: Option[]; current: string | null }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title="Choose the evaluation model"
      description="The model the bids are evaluated by: its stages, criteria, bands and aspects. Only issued versions are offered. Its route is judged against the contract basis when the window is published, and its content is pinned on the exercise then: nothing changes it after."
      fields={[hidden("exerciseId"), { kind: "select", name: "evaluationModelId", label: "Evaluation model", required: true, placeholder: "Choose", options: models }]}
      values={{ exerciseId, evaluationModelId: current }}
      action={chooseEvaluationModel}
      submitLabel="Choose"
      trigger={{ label: current ? "Change the model" : "Choose the model", className: current ? secondary : primary }}
      size="md"
    />
  );
}

export function RemoveFeeLineDrawer({ exerciseId, lineId, label }: { exerciseId: string; lineId: string; label: string }) {
  return (
    <RecordEditor
      title={`Remove ${label}`}
      description="The line comes off the fee's basis. The fee itself is not changed."
      fields={[hidden("exerciseId"), hidden("lineId")]}
      values={{ exerciseId, lineId }}
      danger
      cancelLabel="Keep the line"
      action={removeFeeLine}
      submitLabel="Remove the line"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove ${label}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ invitees

export function ProposeInviteeDrawer({ exerciseId, allowed, withdrawsRoute }: { exerciseId: string; allowed: Allowed; withdrawsRoute: boolean }) {
  if (!allowed.allowed) return <Blocked label="Add a contractor" reason={allowed.reason} />;
  return (
    <RecordEditor
      title="Propose a contractor for invitation"
      description="The contractors proposed are the list the name is approved for."
      columns={2}
      fields={[
        hidden("exerciseId"),
        ...(withdrawsRoute ? ([{ kind: "note", text: "The name approval already asked for or given no longer describes the list once it changes: it is withdrawn, and the name is asked for again with the new list." }] as Field[]) : []),
        { kind: "text", name: "name", label: "Contractor", required: true },
        { kind: "text", name: "registrationNo", label: "Registration number", required: true, mono: true },
        { kind: "textarea", name: "address", label: "Address" },
        { kind: "text", name: "phone", label: "Telephone" },
        { kind: "text", name: "fax", label: "Fax" },
        { kind: "text", name: "email", label: "Email" },
      ]}
      values={{ exerciseId }}
      action={proposeInvitee}
      submitLabel="Add to the list"
      trigger={{ label: "Add a contractor", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemoveInviteeDrawer({ exerciseId, partyId, name, withdrawsRoute }: { exerciseId: string; partyId: string; name: string; withdrawsRoute: boolean }) {
  return (
    <RecordEditor
      title={`Take ${name} off the list`}
      description={`${name} is no longer proposed for invitation.${withdrawsRoute ? " The name approval asked for or given is withdrawn, and the name is asked for again with the new list." : ""}`}
      fields={[hidden("exerciseId"), hidden("partyId")]}
      values={{ exerciseId, partyId }}
      destructive={{ reasonLabel: "Why they are taken off" }}
      cancelLabel="Keep them on the list"
      action={removeInvitee}
      submitLabel={`Take ${name} off`}
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Take ${name} off the invitee list` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ publications

export function RecordPublicationDrawer({ exerciseId, channels, people, today }: { exerciseId: string; channels: Option[]; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title="Record a publication"
      description={`Record where and when the notice appeared. ${ON_BEHALF} Keep the proof (a cutting, a screen print) with the exercise's documents below.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "channelId", label: "Channel", required: true, placeholder: "Choose", options: channels },
        { kind: "date", name: "publishedOn", label: "Published on", required: true, hint: "Not after today." },
        { kind: "text", name: "reference", label: "Title and edition, board or address" },
        { kind: "select", name: "recordedByPersonId", label: "Recorded by", required: true, placeholder: "Choose", options: people },
      ]}
      values={{ exerciseId, publishedOn: today }}
      action={recordPublication}
      submitLabel="Record publication"
      trigger={{ label: "Record a publication", icon: true, className: secondary }}
      size="md"
    />
  );
}

export function RemovePublicationDrawer({ exerciseId, publicationId, channel }: { exerciseId: string; publicationId: string; channel: string }) {
  return (
    <RecordEditor
      title={`Remove the publication through ${channel}`}
      description="Only a publication recorded in error. The notice is not yet published."
      fields={[hidden("exerciseId"), hidden("publicationId")]}
      values={{ exerciseId, publicationId }}
      destructive={{ reasonLabel: "Why it is removed" }}
      cancelLabel="Keep it"
      action={removePublication}
      submitLabel="Remove the publication"
      trigger={{ label: "Remove", className: ghost, ariaLabel: `Remove the publication through ${channel}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ publishing

export function PublishDrawer({ exerciseId, label, allowed, rows, notes, noteId = EXERCISE_NOTE_ID }: { exerciseId: string; label: string; allowed: Allowed; rows: [string, string][]; notes: string[]; noteId?: string }) {
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} primary noteId={noteId} />;
  return (
    <RecordEditor
      title={label}
      description="Every rule is judged again as this is saved. What is stated and every rule it was judged under are then kept with the window, and later changes to the settings do not rewrite them."
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      sections={
        <div className="flex flex-col gap-4">
          <Facts rows={rows} />
          {notes.map((n) => (
            <Callout key={n} tone="warn">{n}</Callout>
          ))}
        </div>
      }
      action={publishWindow}
      submitLabel={label}
      trigger={{ label, className: primary }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ delivery (recorded, not sent)

/// How one copy went: sent by, consignment, sent on, acknowledged on. One drawer for a letter, an addendum copy and a notice.
export function DeliveryDrawer({
  exerciseId,
  idName,
  id,
  action,
  who,
  what,
  values,
  allowed,
}: {
  exerciseId: string;
  idName: "letterId" | "recipientId" | "noticeId";
  id: string;
  action: SaveAction;
  who: string;
  what: string;
  values: { method: string; consignmentRef: string; despatchedOn: string; acknowledgedOn: string };
  allowed?: Allowed;
}) {
  // Once something is recorded the act is a change to it, and says so.
  const recorded = !!(values.method || values.consignmentRef || values.despatchedOn || values.acknowledgedOn);
  const verb = recorded ? "Change delivery" : "Record delivery";
  if (allowed && !allowed.allowed) return <Blocked label={verb} reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`How ${who} was told`}
      description={`The portal sends nothing: record how the ${what} reached ${who}, as the officer did it.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden(idName),
        { kind: "select", name: "method", label: "Sent by", placeholder: "Not recorded", options: DELIVERY_OPTIONS },
        { kind: "text", name: "consignmentRef", label: "Consignment number", hint: "The registered post number, where there is one." },
        { kind: "date", name: "despatchedOn", label: "Sent on", hint: "Not after today." },
        { kind: "date", name: "acknowledgedOn", label: "Acknowledged on", hint: "Not before it was sent." },
      ]}
      values={{ exerciseId, [idName]: id, ...values }}
      action={action}
      submitLabel="Record"
      trigger={{ label: verb, className: ghost, ariaLabel: `${recorded ? "Change" : "Record"} how ${who} was told` }}
      size="md"
    />
  );
}

export const LetterDeliveryDrawer = (p: { exerciseId: string; id: string; who: string; values: { method: string; consignmentRef: string; despatchedOn: string; acknowledgedOn: string } }) => (
  <DeliveryDrawer exerciseId={p.exerciseId} idName="letterId" id={p.id} action={recordLetterDelivery} who={p.who} what="letter of invitation" values={p.values} />
);
export const AddendumDeliveryDrawer = (p: { exerciseId: string; id: string; who: string; withDocuments: boolean; values: { method: string; consignmentRef: string; despatchedOn: string; acknowledgedOn: string } }) =>
  p.withDocuments ? null : <DeliveryDrawer exerciseId={p.exerciseId} idName="recipientId" id={p.id} action={recordAddendumDelivery} who={p.who} what="addendum" values={p.values} />;
export const NoticeDeliveryDrawer = (p: { exerciseId: string; id: string; who: string; what: string; values: { method: string; consignmentRef: string; despatchedOn: string; acknowledgedOn: string } }) => (
  <DeliveryDrawer exerciseId={p.exerciseId} idName="noticeId" id={p.id} action={recordNoticeDelivery} who={p.who} what={p.what} values={p.values} />
);

// ------------------------------------------------------------------ asking for a change

export function RequestChangeDrawer({ exerciseId, kind, allowed, closing, lastDayOfSale, noteId = EXERCISE_NOTE_ID }: { exerciseId: string; kind: "CORRECTION" | "EXTENSION"; allowed: Allowed; closing: string; lastDayOfSale: string | null; noteId?: string }) {
  const label = kind === "EXTENSION" ? "Extend the closing" : "Correct the closing";
  if (!allowed.allowed) return <Blocked label={label} reason={allowed.reason} noteId={noteId} />;
  return (
    <RecordEditor
      title={label}
      description={`The closing now stands at ${closing}. ${kind === "EXTENSION" ? "An extension" : "A correction"} is decided on the route the approval matrix sets for a change to the window, and applied when its last step is recorded. Every date rule is judged again on the new dates, and the original and the new closing are both kept.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("kind"),
        { kind: "date", name: "closingDay", label: "New closing day", required: true },
        { kind: "text", name: "closingTime", label: "New closing time", required: true, placeholder: "14:30", hint: "Hours and minutes, 24-hour, the organisation's clock." },
        { kind: "date", name: "purchaseCloseDay", label: "New last day of sale", hint: lastDayOfSale ? `Now ${lastDayOfSale}. Leave empty to keep it.` : "Leave empty to keep it." },
        { kind: "textarea", name: "reason", label: "Why", required: true, hint: "Purchasers are told of an extension: the register is the list." },
      ]}
      values={{ exerciseId, kind }}
      action={requestClosingChange}
      submitLabel="Ask for it"
      trigger={{ label, className: secondary }}
      size="md"
    />
  );
}

export function RequestCancellationDrawer({ exerciseId, allowed, reference, noteId = EXERCISE_NOTE_ID }: { exerciseId: string; allowed: Allowed; reference: string; noteId?: string }) {
  if (!allowed.allowed) return <Blocked label="Cancel exercise" reason={allowed.reason} noteId={noteId} destructive />;
  return (
    <RecordEditor
      title={`Cancel ${reference}`}
      description="A published exercise is cancelled on the route the approval matrix sets for a change to the window. Once approved it is ended: it cannot be reopened, and a replacement is a new exercise. Everyone holding the documents is told."
      fields={[
        hidden("exerciseId"),
        { kind: "textarea", name: "reason", label: "Why", required: true },
        { kind: "select", name: "feeRefund", label: "Are the document fees refunded?", required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "yes", label: "Yes, the fees are refunded" }, { value: "no", label: "No, they are not" }], hint: "Must be answered before it can be asked for." },
      ]}
      values={{ exerciseId }}
      danger
      cancelLabel={`Keep ${reference}`}
      action={requestCancellation}
      submitLabel={`Ask to cancel ${reference}`}
      trigger={{ label: "Cancel exercise", className: buttonClass("destructive", "sm") }}
      size="md"
    />
  );
}

export function WindowDecisionDrawer({ exerciseId, stepId, office, done, people, today, what }: { exerciseId: string; stepId: string; office: string; done: string; people: Option[]; today: string | null; what: string }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`On ${what}. ${ON_BEHALF} They must hold the office for the requisition's department, or a delegation of it. A refusal means the change is not made; it may be asked for again.`}
      fields={[
        hidden("exerciseId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused: the change is not made" }] },
        { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: people, hint: people.length === 0 ? "Nobody holds this office for the requisition's department today." : undefined },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was asked for." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ exerciseId, stepId, decidedOn: today }}
      action={recordWindowChangeDecision}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: primary }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ sales

export function RecordSaleDrawer({
  exerciseId,
  allowed,
  parties,
  invited,
  restricted,
  people,
  fee,
  noteId = EXERCISE_NOTE_ID,
}: {
  exerciseId: string;
  allowed: Allowed;
  /// Contractors already on the exercise (invitees, attendees) who have not bought.
  parties: Option[];
  invited: boolean;
  restricted: { label: string; asks: string } | null;
  people: Option[];
  fee: string;
  noteId?: string;
}) {
  if (!allowed.allowed) return <Blocked label="Record a sale" reason={allowed.reason} primary noteId={noteId} />;
  return (
    <RecordEditor
      title="Record a sale of the documents"
      description={`The set is sold at ${fee}, as the window states it. The day of sale is today. ${ON_BEHALF}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "partyId", label: invited ? "Invited contractor" : "Contractor already on this exercise", required: invited, placeholder: invited ? "Choose" : "A contractor not yet on the exercise", options: parties, hint: invited ? "Only the invited contractors may buy." : "Leave empty to enter a new contractor below." },
        ...(invited
          ? []
          : ([
              { kind: "text", name: "name", label: "Contractor", hint: "Needed where no contractor is chosen above." },
              { kind: "text", name: "registrationNo", label: "Registration number", mono: true },
              { kind: "textarea", name: "address", label: "Address", hint: "Printed on the label that goes on the set." },
              { kind: "text", name: "phone", label: "Telephone" },
              { kind: "text", name: "fax", label: "Fax" },
              { kind: "text", name: "email", label: "Email" },
            ] as Field[])),
        { kind: "text", name: "collectedBy", label: "Collected by", required: true, hint: "The representative who took the set." },
        { kind: "select", name: "authoritySighted", label: "Proof of the representative's authority sighted", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Not answered refuses the sale." },
        ...(restricted
          ? ([
              { kind: "select", name: "restrictionCertSighted", label: `${restricted.label}: certificate shown`, required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "ORIGINAL", label: "Original shown" }, { value: "CERTIFIED_COPY", label: "Certified copy shown" }, { value: "NOT_SHOWN", label: "Not shown" }], hint: restricted.asks },
              { kind: "date", name: "restrictionCertValidUntil", label: "Certificate valid until" },
            ] as Field[])
          : []),
        { kind: "select", name: "registrationCheck", label: "Registration with the regulator", placeholder: "Not checked", options: [{ value: "FAILED", label: "Checked: failed" }], hint: "The supplier register is not built yet, so a registration cannot be shown as clear. It is carried with the sale as not checked." },
        { kind: "select", name: "suspensionCheck", label: "Suspension", placeholder: "Not checked", options: [{ value: "FAILED", label: "Checked: suspended" }], hint: "Carried as not checked until the supplier register exists." },
        { kind: "textarea", name: "checkNote", label: "Note on the checks" },
        { kind: "text", name: "paymentMethod", label: "How the fee was paid", required: true },
        { kind: "text", name: "financeReceiptNo", label: "Finance receipt number", mono: true, hint: "Typed as it reads on finance's receipt: the portal never makes one. Leave empty if not yet to hand: the sale then shows among the receipts to collect." },
        { kind: "select", name: "issuedByPersonId", label: "Issued by", required: true, placeholder: "Choose", options: people },
      ]}
      values={{ exerciseId }}
      action={recordSale}
      submitLabel="Record the sale"
      trigger={{ label: "Record a sale", className: primary }}
      size="lg"
    />
  );
}

export function VoidSaleDrawer({ exerciseId, saleId, name }: { exerciseId: string; saleId: string; name: string }) {
  return (
    <RecordEditor
      title={`Void the sale to ${name}`}
      description="A sale recorded in error. The row stays on the register, marked void, with its reason. It cannot be voided once the window has closed."
      fields={[hidden("exerciseId"), hidden("saleId")]}
      values={{ exerciseId, saleId }}
      destructive={{ reasonLabel: "Why the sale is void" }}
      cancelLabel="Keep the sale"
      action={voidSale}
      submitLabel="Void the sale"
      trigger={{ label: "Void", className: ghost, ariaLabel: `Void the sale to ${name}` }}
      size="sm"
    />
  );
}

export function RecordReceiptDrawer({ exerciseId, saleId, name }: { exerciseId: string; saleId: string; name: string }) {
  return (
    <RecordEditor
      title={`Receipt number for ${name}`}
      description="The number on finance's receipt, typed as it reads. The portal never makes one up, and a number already on another sale is refused."
      fields={[hidden("exerciseId"), hidden("saleId"), { kind: "text", name: "financeReceiptNo", label: "Receipt number", required: true, mono: true }]}
      values={{ exerciseId, saleId }}
      action={recordReceipt}
      submitLabel="Record the number"
      trigger={{ label: "Record receipt", className: ghost, ariaLabel: `Record the receipt number for ${name}` }}
      size="sm"
    />
  );
}

// ------------------------------------------------------------------ briefings and site visits

export function ScheduleEventDrawer({ exerciseId, allowed, mandatoryOffered }: { exerciseId: string; allowed: Allowed; mandatoryOffered: boolean }) {
  if (!allowed.allowed) return <Blocked label="Schedule an event" reason={allowed.reason} primary noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title="Schedule a briefing or site visit"
      description="Its day, time and place together: the notice states them. Events are scheduled while the window is being prepared."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "kind", label: "Event", required: true, placeholder: "Choose", options: [{ value: "BRIEFING", label: "Tender briefing" }, { value: "SITE_VISIT", label: "Site visit" }] },
        { kind: "date", name: "day", label: "Day", required: true },
        { kind: "text", name: "time", label: "Time", required: true, placeholder: "10:00", hint: "24-hour, the organisation's clock." },
        { kind: "text", name: "place", label: "Place", required: true },
        ...(mandatoryOffered
          ? ([{ kind: "select", name: "mandatory", label: "Attendance mandatory", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "If mandatory, the documents are sold only to a contractor who attended. Not answered holds the window back." }] as Field[])
          : ([{ kind: "note", text: "Not mandatory: whether attendance may be made mandatory is not set, or not permitted, under Invitation controls." }] as Field[])),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{ exerciseId }}
      action={scheduleEvent}
      submitLabel="Schedule"
      trigger={{ label: "Schedule an event", className: primary }}
      size="md"
    />
  );
}

export function SetMandatoryDrawer({ exerciseId, eventId, label, current }: { exerciseId: string; eventId: string; label: string; current: string }) {
  return (
    <RecordEditor
      title={`Is attendance at the ${label.toLowerCase()} mandatory?`}
      description="If mandatory, the documents are sold only to a contractor who attended. It may be answered only while the window is being prepared."
      fields={[hidden("exerciseId"), hidden("eventId"), { kind: "select", name: "mandatory", label: "Attendance mandatory", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE }]}
      values={{ exerciseId, eventId, mandatory: current }}
      action={setEventMandatory}
      submitLabel="Save"
      trigger={{ label: "Answer", className: ghost, ariaLabel: `Say whether attendance at the ${label.toLowerCase()} is mandatory` }}
      size="sm"
    />
  );
}

export function MarkHeldDrawer({ exerciseId, eventId, label, today }: { exerciseId: string; eventId: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Record the ${label.toLowerCase()} as held`}
      description="Attendance is recorded once the event is held."
      fields={[hidden("exerciseId"), hidden("eventId"), { kind: "date", name: "heldOn", label: "Held on", required: true, hint: "Not before it was to start, nor after today." }]}
      values={{ exerciseId, eventId, heldOn: today }}
      action={markEventHeld}
      submitLabel="Record as held"
      trigger={{ label: "Record as held", className: secondary, ariaLabel: `Record the ${label.toLowerCase()} as held` }}
      size="sm"
    />
  );
}

export function CancelEventDrawer({ exerciseId, eventId, label, published }: { exerciseId: string; eventId: string; label: string; published: boolean }) {
  return (
    <RecordEditor
      title={`Cancel the ${label.toLowerCase()}`}
      description={published ? "The published notice stated it: tell the purchasers by an addendum." : "It comes off the notice."}
      fields={[hidden("exerciseId"), hidden("eventId")]}
      values={{ exerciseId, eventId }}
      destructive={{ reasonLabel: "Why it is cancelled" }}
      cancelLabel="Keep it"
      action={cancelEvent}
      submitLabel={`Cancel the ${label.toLowerCase()}`}
      trigger={{ label: "Cancel", className: ghost, ariaLabel: `Cancel the ${label.toLowerCase()}` }}
      size="sm"
    />
  );
}

export function RecordAttendanceDrawer({ exerciseId, eventId, label, parties, invited, people }: { exerciseId: string; eventId: string; label: string; parties: Option[]; invited: boolean; people: Option[] }) {
  return (
    <RecordEditor
      title={`Record attendance at the ${label.toLowerCase()}`}
      description={`One contractor's representative. ${ON_BEHALF}${invited ? " Only the invited contractors attend." : ""}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("eventId"),
        { kind: "select", name: "partyId", label: invited ? "Invited contractor" : "Contractor already on this exercise", required: invited, placeholder: invited ? "Choose" : "A contractor not yet on the exercise", options: parties, hint: invited ? undefined : "Leave empty to enter a new contractor below." },
        ...(invited ? [] : ([{ kind: "text", name: "name", label: "Contractor" }, { kind: "text", name: "registrationNo", label: "Registration number", mono: true }] as Field[])),
        { kind: "text", name: "representative", label: "Representative", required: true },
        { kind: "select", name: "recordedByPersonId", label: "Recorded by", required: true, placeholder: "Choose", options: people },
      ]}
      values={{ exerciseId, eventId }}
      action={recordAttendance}
      submitLabel="Record attendance"
      trigger={{ label: "Record attendance", className: secondary, ariaLabel: `Record attendance at the ${label.toLowerCase()}` }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ addenda

export function AddendumDrawer({ exerciseId, allowed, draft, closingChanges }: { exerciseId: string; allowed: Allowed; draft?: { id: string; label: string; title: string; whatChanged: string }; closingChanges: Option[] }) {
  if (!allowed.allowed) return draft ? null : <Blocked label="Draft an addendum" reason={allowed.reason} primary noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title={draft ? `Edit ${draft.label}` : "Draft an addendum"}
      description="What changes in the documents. It takes its number when it is issued. The signed copy is attached to the draft before it can be issued."
      fields={[
        hidden("exerciseId"),
        hidden("addendumId"),
        { kind: "text", name: "title", label: "Title", required: true },
        { kind: "textarea", name: "whatChanged", label: "What it changes", required: true },
        ...(closingChanges.length > 0 ? ([{ kind: "select", name: "closingChangeId", label: "The closing change it announces", placeholder: "None", options: closingChanges }] as Field[]) : []),
      ]}
      values={{ exerciseId, addendumId: draft?.id ?? null, title: draft?.title ?? "", whatChanged: draft?.whatChanged ?? "" }}
      action={saveAddendum}
      submitLabel="Save the draft"
      trigger={draft ? { label: "Edit", className: ghost, ariaLabel: `Edit ${draft.label}` } : { label: "Draft an addendum", className: primary }}
      size="md"
    />
  );
}

export function VoidAddendumDrawer({ exerciseId, addendumId, label }: { exerciseId: string; addendumId: string; label: string }) {
  return (
    <RecordEditor
      title={`Void ${label}`}
      description="A draft that is not going out. It never takes a number, and the issued addenda run on without a gap."
      fields={[hidden("exerciseId"), hidden("addendumId")]}
      values={{ exerciseId, addendumId }}
      destructive={{ reasonLabel: "Why the draft is voided" }}
      cancelLabel="Keep the draft"
      action={voidAddendum}
      submitLabel="Void the draft"
      trigger={{ label: "Void", className: ghost, ariaLabel: `Void ${label}` }}
      size="sm"
    />
  );
}

export function IssueAddendumDrawer({ exerciseId, addendumId, label, allowed, recipients }: { exerciseId: string; addendumId: string; label: string; allowed: Allowed; recipients: string }) {
  if (!allowed.allowed) return <Blocked label="Issue" reason={allowed.reason} />;
  return (
    <RecordEditor
      title={`Issue ${label}`}
      description="It takes the next number and its text is frozen from the template. Its recipients are the register as it stands now; later purchasers receive it with the documents. Nothing is sent: delivery is recorded copy by copy."
      fields={[hidden("exerciseId"), hidden("addendumId")]}
      values={{ exerciseId, addendumId }}
      sections={<Facts rows={[["Goes to", recipients]]} />}
      action={issueAddendum}
      submitLabel="Issue the addendum"
      trigger={{ label: "Issue", className: primary, ariaLabel: `Issue ${label}` }}
      size="md"
    />
  );
}
