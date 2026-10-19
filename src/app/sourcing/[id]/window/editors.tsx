import { Blocked } from "@/app/requisitions/editors";
import { RecordEditor, type Field, type SaveAction } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { Callout } from "@/components/ui/feedback";
import { EXERCISE_NOTE_ID } from "../../editors";
import { Facts } from "../documents/editors";

import { chooseEvaluationModel, recordLetterDelivery, proposeInvitee, publishWindow, recordPublication, removeFeeLine, removeInvitee, removePublication, saveFeeLine, saveWindow, takeSaleMode, takeSubmissionChannel } from "./actions";
import { requestCancellation, requestClosingChange, recordNoticeDelivery, recordWindowChangeDecision } from "./change-actions";
import { cancelEvent, issueAddendum, markEventHeld, recordAddendumDelivery, recordAttendance, recordPurchaseReceipt, recordReceipt, recordSale, saveAddendum, scheduleEvent, setEventMandatory, voidAddendum, voidSale } from "./register-actions";

/**
 * The drawers of the Invitation tab. Fields are data; every rule sits in the action and the pure
 * checks behind it (`src/lib/window`). Where those checks already say an act cannot proceed, the
 * control is disabled with the reason beside it (read.ts judges with the rule the action runs).
 * Every act is the signed-in officer's own (Phase 2b). A decision of an office that was made on paper is recorded for the holder by someone else, and is not signed.
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
const RECORDED_AS_YOURS = "It is recorded as yours.";

// ------------------------------------------------------------------ the notice's items and fee

export type WindowItems = { inspectionPlace: string; purchasePlace: string; inspectionHours: string; purchaseFromDay: string; purchaseCloseDay: string; feeAmount: string; feePaymentMethods: string; submissionPlace: string; closingTimeReason: string; specialPermissionOffered: string };

/// SR-10 (ruling 16, G1): take the organisation's setting for how this exercise's documents are sold. Disabled with the reason where the organisation has not set it either.
export function TakeSaleModeDrawer({ exerciseId, take, setting }: { exerciseId: string; take: Allowed; setting: string }) {
  if (!take.allowed) return <Blocked label="Take the organisation's setting" reason={take.reason} primary />;
  return (
    <RecordEditor
      title="Take the organisation's setting"
      description={`Takes the current setting once: ${setting}. Frozen from publication.`}
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      action={takeSaleMode}
      submitLabel="Take the setting"
      trigger={{ label: "Take the organisation's setting", className: primary }}
      size="md"
    />
  );
}

/// SR-13 (ruling 20z, 12e): take the organisation's setting for how bids are submitted. Disabled with the reason where the organisation has not set it either.
export function TakeSubmissionChannelDrawer({ exerciseId, take, setting }: { exerciseId: string; take: Allowed; setting: string }) {
  if (!take.allowed) return <Blocked label="Take how bids are submitted" reason={take.reason} primary />;
  return (
    <RecordEditor
      title="Take how bids are submitted"
      description={`Takes the current setting once: ${setting}. Frozen from publication.`}
      fields={[hidden("exerciseId")]}
      values={{ exerciseId }}
      action={takeSubmissionChannel}
      submitLabel="Take the setting"
      trigger={{ label: "Take how bids are submitted", className: primary }}
      size="md"
    />
  );
}

export function EditWindowDrawer({ exerciseId, items, allowed, first, online = false }: { exerciseId: string; items: WindowItems | null; allowed: Allowed; first: boolean; online?: boolean }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={first ? "Fill in notice and fee" : "Edit notice and fee"}
      description={`${online ? "Days of sale and fee. Sold online, so no place or hour." : "Places, days of sale, fee and where tenders go."} Closing is not changed here.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        // SR-10 (ruling 16): an exercise sold online has no places, hours or payment counter, so the form does not ask for them.
        ...(online
          ? []
          : ([
              { kind: "text", name: "inspectionPlace", label: "Where the documents are inspected", required: true },
              { kind: "text", name: "purchasePlace", label: "Where the documents are bought", required: true },
              { kind: "text", name: "inspectionHours", label: "Inspection and purchase hours", required: true, hint: "As the notice states them." },
              { kind: "text", name: "submissionPlace", label: "Where tenders are submitted", required: true },
            ] satisfies Field[])),
        { kind: "date", name: "purchaseFromDay", label: "First day of sale", required: true, hint: "Not before the advertisement day." },
        { kind: "date", name: "purchaseCloseDay", label: "Last day of sale", required: true, hint: "Judged against the closing cut-off." },
        { kind: "money", name: "feeAmount", label: "Document fee", required: true, hint: "Judged against the band's minimum." },
        ...(online ? [] : ([{ kind: "text", name: "feePaymentMethods", label: "How the fee is paid", required: true }] satisfies Field[])),
        { kind: "textarea", name: "closingTimeReason", label: "Why the closing time is not the usual one", hint: "Only if different from the default time." },
        { kind: "select", name: "specialPermissionOffered", label: "Special permission", options: [{ value: "unset", label: "Not stated" }, { value: "yes", label: "Offered" }, { value: "no", label: "Not offered" }], hint: "For a firm short of a grade or field code. Not stated: none granted." },
      ]}
      values={{ exerciseId, specialPermissionOffered: "unset", ...(items ?? {}) }}
      action={saveWindow}
      submitLabel="Save"
      trigger={{ label: first ? "Fill in notice and fee" : "Edit notice and fee", className: first ? primary : secondary }}
      size="lg"
    />
  );
}

export function FeeLineDrawer({ exerciseId, allowed, kinds, line }: { exerciseId: string; allowed: Allowed; kinds: Option[]; line?: { id: string; label: string; values: Record<string, string> } }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title={line ? `Change ${line.label}` : "Add a cost to the fee's basis"}
      description="Give a quantity and unit cost, or one amount."
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
      description="Issued versions only. Pinned on the exercise at publication."
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
      description="Fee unchanged."
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

      columns={2}
      fields={[
        hidden("exerciseId"),
        ...(withdrawsRoute ? ([{ kind: "note", text: "Changing the list withdraws the name approval. It is asked for again." }] as Field[]) : []),
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
      description={`${name} is no longer proposed.${withdrawsRoute ? " Name approval is withdrawn and asked for again." : ""}`}
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
      description={`Where and when the notice appeared. ${RECORDED_AS_YOURS}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "channelId", label: "Channel", required: true, placeholder: "Choose", options: channels },
        { kind: "date", name: "publishedOn", label: "Published on", required: true, hint: "Not after today." },
        { kind: "text", name: "reference", label: "Title and edition, board or address" },
        actorField("PublicationRecord.recordedBy", { name: "recordedByPersonId", people }),
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
      description="Every rule is judged again as this is saved."
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
      description={`Not emailed. Record how the ${what} reached ${who}.`}
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
      description={`Closing now ${closing}. Both closings are kept.`}
      more={`${kind === "EXTENSION" ? "An extension" : "A correction"} is decided on the approval matrix's route for a window change, and applied when its last step is recorded. Every date rule is judged again on the new dates.`}
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
      description="Goes for approval. Once approved it ends and cannot be reopened."
      more="Cancelled on the approval matrix's route for a window change. A replacement is a new exercise. Everyone holding the documents is told."
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
      description={`On ${what}. Signed with the holder's password.`}
      more="A decision from paper is recorded for them by someone else and is not signed. The decider must hold the requisition department's office, or a delegation of it. A refusal means the change is not made; it may be asked for again."
      fields={[
        hidden("exerciseId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused: the change is not made" }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true, hint: people.length === 0 ? "Nobody holds this office for the requisition's department today." : undefined }),
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
  suppliers = [],
  suppliersTotal = 0,
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
  /// 6.15a fix M-2: the register's registered suppliers, one of which the sale may name.
  suppliers?: Option[];
  /// Residual 6: how many registered suppliers there are; past the list, one is named by its reference.
  suppliersTotal?: number;
  noteId?: string;
}) {
  if (!allowed.allowed) return <Blocked label="Record a sale" reason={allowed.reason} primary noteId={noteId} />;
  return (
    <RecordEditor
      title="Record a sale of the documents"
      description={`Sold at ${fee}, today. ${RECORDED_AS_YOURS}`}
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
        { kind: "select", name: "supplierId", label: "Supplier on the register", placeholder: "Not named", options: suppliers, hint: `Type to search${suppliersTotal > suppliers.length ? ` (first ${suppliers.length} of ${suppliersTotal})` : ""}. Links an unlinked contractor.` },
        ...(suppliersTotal > suppliers.length ? [{ kind: "text", name: "supplierReference", label: "Or its register reference", mono: true, hint: "As the register shows it." } as Field] : []),
        { kind: "textarea", name: "linkReason", label: "Why they are the same company", hint: "Only if the registration number differs." },
        { kind: "text", name: "collectedBy", label: "Collected by", required: true, hint: "The representative who took the set." },
        { kind: "select", name: "authoritySighted", label: "Proof of the representative's authority sighted", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Not answered refuses the sale." },
        ...(restricted
          ? ([
              { kind: "select", name: "restrictionCertSighted", label: `${restricted.label}: certificate shown`, required: true, placeholder: "Choose", placeholderDisabled: true, options: [{ value: "ORIGINAL", label: "Original shown" }, { value: "CERTIFIED_COPY", label: "Certified copy shown" }, { value: "NOT_SHOWN", label: "Not shown" }], hint: restricted.asks },
              { kind: "date", name: "restrictionCertValidUntil", label: "Certificate valid until" },
            ] as Field[])
          : []),
        { kind: "select", name: "registrationCheck", label: "Registration with the regulator", placeholder: "Not checked", options: [{ value: "FAILED", label: "Checked: failed" }], hint: "Linked: read from the register. Otherwise not checked." },
        { kind: "select", name: "suspensionCheck", label: "Suspension", placeholder: "Not checked", options: [{ value: "FAILED", label: "Checked: suspended" }], hint: "Linked: read from the register. Otherwise not checked." },
        { kind: "textarea", name: "checkNote", label: "Note on the checks" },
        { kind: "text", name: "paymentMethod", label: "How the fee was paid", required: true },
        { kind: "text", name: "financeReceiptNo", label: "Finance receipt number", mono: true, hint: "As on finance's receipt. Empty: shows in receipts to collect." },
        actorField("DocumentSale.issuedBy", { name: "issuedByPersonId", people }),
      ]}
      values={{ exerciseId }}
      action={recordSale}
      submitLabel="Record the sale"
      trigger={{ label: "Record a sale", className: primary }}
      size="lg"
    />
  );
}

/**
 * Record the finance receipt of an online purchase awaiting payment (SR-10, ruling 17: the officer-recorded receipt stays as the second writer of "paid"). The number is finance's, typed as it reads; the
 * portal never makes one, and a simulated payment is never one. Recording it pays the online purchase and releases the documents to the buyer.
 */
export function RecordPurchaseReceiptDrawer({ exerciseId, purchaseId, name }: { exerciseId: string; purchaseId: string; name: string }) {
  return (
    <RecordEditor
      title={`Receipt number for ${name}`}
      description="Records payment and releases the documents to the buyer."
      fields={[hidden("exerciseId"), hidden("purchaseId"), { kind: "text", name: "financeReceiptNo", label: "Receipt number", required: true, mono: true }, actorField("DocumentSale.issuedBy", { name: "issuedByPersonId" })]}
      values={{ exerciseId, purchaseId }}
      action={recordPurchaseReceipt}
      submitLabel="Record the receipt"
      trigger={{ label: "Record receipt", className: ghost, ariaLabel: `Record the finance receipt for the online purchase by ${name}` }}
      size="sm"
    />
  );
}

export function VoidSaleDrawer({ exerciseId, saleId, name }: { exerciseId: string; saleId: string; name: string }) {
  return (
    <RecordEditor
      title={`Void the sale to ${name}`}
      description="Stays on the register, marked void. Not possible after closing."
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
      description="A number already used on another sale is refused."
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

/// `inCard`: the act sits in its own card's header (preparation, before approval), so it is a secondary button and its reason is beside it, not in the page header's note.
export function ScheduleEventDrawer({ exerciseId, allowed, mandatoryOffered, inCard = false }: { exerciseId: string; allowed: Allowed; mandatoryOffered: boolean; inCard?: boolean }) {
  if (!allowed.allowed) return inCard ? <Blocked label="Schedule an event" reason={allowed.reason} /> : <Blocked label="Schedule an event" reason={allowed.reason} primary noteId={EXERCISE_NOTE_ID} />;
  return (
    <RecordEditor
      title="Schedule a briefing or site visit"
      description="The notice states day, time and place."
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "select", name: "kind", label: "Event", required: true, placeholder: "Choose", options: [{ value: "BRIEFING", label: "Tender briefing" }, { value: "SITE_VISIT", label: "Site visit" }] },
        { kind: "date", name: "day", label: "Day", required: true },
        { kind: "text", name: "time", label: "Time", required: true, placeholder: "10:00", hint: "24-hour, the organisation's clock." },
        { kind: "text", name: "place", label: "Place", required: true },
        ...(mandatoryOffered
          ? ([{ kind: "select", name: "mandatory", label: "Attendance mandatory", required: true, placeholder: "Choose", placeholderDisabled: true, options: THREE, hint: "Mandatory: documents sold only to attendees." }] as Field[])
          : ([{ kind: "note", text: "Not mandatory: not permitted or not set under Invitation controls." }] as Field[])),
        { kind: "textarea", name: "notes", label: "Notes" },
      ]}
      values={{ exerciseId }}
      action={scheduleEvent}
      submitLabel="Schedule"
      trigger={{ label: "Schedule an event", className: inCard ? secondary : primary }}
      size="md"
    />
  );
}

export function SetMandatoryDrawer({ exerciseId, eventId, label, current }: { exerciseId: string; eventId: string; label: string; current: string }) {
  return (
    <RecordEditor
      title={`Is attendance at the ${label.toLowerCase()} mandatory?`}
      description="Mandatory: documents sold only to attendees."
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
      description={`One contractor's representative. ${RECORDED_AS_YOURS}${invited ? " Only the invited contractors attend." : ""}`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("eventId"),
        { kind: "select", name: "partyId", label: invited ? "Invited contractor" : "Contractor already on this exercise", required: invited, placeholder: invited ? "Choose" : "A contractor not yet on the exercise", options: parties, hint: invited ? undefined : "Leave empty to enter a new contractor below." },
        ...(invited ? [] : ([{ kind: "text", name: "name", label: "Contractor" }, { kind: "text", name: "registrationNo", label: "Registration number", mono: true }] as Field[])),
        { kind: "text", name: "representative", label: "Representative", required: true },
        actorField("SiteEventAttendance.recordedBy", { name: "recordedByPersonId", people }),
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
      description="Takes its number when issued. Attach the signed copy first."
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
      description="Never takes a number."
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
      description="Takes the next number. Goes to the register as it stands now. Not emailed."
      more="Its text is frozen from the template. Later purchasers receive it with the documents. Delivery is recorded copy by copy."
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
