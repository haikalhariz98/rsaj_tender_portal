import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { decideApplication, decideRegistrationStep, lodgeDocument, openApplication, recordApplicationPaper, recordLapse, saveContact, setErpVendorCode, submitForDecision, verifyDocument } from "../actions";

/**
 * The supplier record's drawers (6.15a). No field carries a default but the day, where an act is
 * recorded today. Every person named is recorded on their behalf, not signed. Each act is judged again
 * by the server under the supplier's lock; a drawer that cannot proceed says why beside its button.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");

// ------------------------------------------------------------------ the company

export function ContactDrawer({ supplierId, contact }: { supplierId: string; contact?: { id: string; name: string; values: Record<string, string | boolean> } }) {
  return (
    <RecordEditor
      title={contact ? `Edit ${contact.name}` : "Add a contact"}
      description="A person at the supplier, as the supplier names them: not a user of this portal. Readable by anyone at the portal until sign-in; History and the audit export withhold the details."
      columns={2}
      fields={[
        hidden("supplierId"),
        hidden("contactId"),
        { kind: "text", name: "contactName", label: "Name", required: true },
        { kind: "text", name: "contactDesignation", label: "Designation" },
        { kind: "text", name: "contactEmail", label: "Email", hint: "An email or a telephone." },
        { kind: "text", name: "contactPhone", label: "Telephone" },
        { kind: "switch", name: "primary", label: "The primary contact", hint: "Marking this one primary unmarks the other." },
      ]}
      values={{ supplierId, ...(contact?.values ?? {}) }}
      action={saveContact}
      trigger={contact ? { label: "Edit", className: ghost, ariaLabel: `Edit ${contact.name}` } : { label: "Add a contact" }}
    />
  );
}

export function VendorCodeDrawer({ supplierId, current, blocker }: { supplierId: string; current: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={current ? "Change the finance system's vendor code" : "Record the finance system's vendor code"}
      description="The code the finance system gave this supplier. It is entered by an officer: no adapter to the finance system exists yet, so it is never synced automatically."
      fields={[hidden("supplierId"), { kind: "text", name: "erpVendorCode", label: "Vendor code", required: true, mono: true }]}
      values={{ supplierId, erpVendorCode: current ?? "" }}
      {...(current ? { reason: { label: "Why the code changes" } } : {})}
      action={setErpVendorCode}
      submitBlock={blocker}
      trigger={{ label: current ? "Change the vendor code" : "Record the vendor code", className: current ? ghost : secondary }}
    />
  );
}

// ------------------------------------------------------------------ documents

export function LodgeDocumentDrawer({ supplierId, types, values, people, renews, blocker, trigger }: { supplierId: string; types: Option[]; values: Option[]; people: Option[]; renews?: { id: string; typeId: string; label: string }; blocker?: string | null; trigger?: string }) {
  return (
    <RecordEditor
      title={renews ? `Renew ${renews.label}` : "Lodge a document"}
      description={renews ? "The renewal takes effect only once it is verified; until then the document it renews stays in force (and reads expired once its day has passed)." : "One document of each type is lodged; a later one is lodged as its renewal. Attach its scan once lodged, then record the check."}
      columns={2}
      fields={[
        hidden("supplierId"),
        hidden("renewsId"),
        ...(renews ? [hidden("typeId")] : [{ kind: "select", name: "typeId", label: "Document type", required: true, placeholder: "Choose", options: types } as Field]),
        { kind: "text", name: "reference", label: "Reference", hint: "Its number as printed. Not for a document recorded as not applicable." },
        { kind: "text", name: "issuingAuthority", label: "Issuing authority" },
        { kind: "date", name: "issuedOn", label: "Issued on" },
        { kind: "date", name: "validFrom", label: "Valid from" },
        { kind: "date", name: "expiresOn", label: "Expires on", hint: "Required where the type carries an expiry." },
        { kind: "tokens", name: "valueIds", label: "Values it records", options: values, hint: "Grades, categories, codes, as the certificate states them." },
        ...(renews ? [] : [{ kind: "switch", name: "notApplicable", label: "Not applicable to this supplier", hint: "Only where the type allows it. Nothing else is recorded then." } as Field]),
        actorField("SupplierDocument.recordedBy", { name: "recordedByPersonId", people }),
        { kind: "textarea", name: "note", label: "Note" },
      ]}
      values={{ supplierId, renewsId: renews?.id ?? "", typeId: renews?.typeId ?? "" }}
      action={lodgeDocument}
      submitLabel={renews ? "Lodge the renewal" : "Lodge"}
      submitBlock={blocker ?? null}
      trigger={{ label: trigger ?? (renews ? "Renew" : "Lodge a document"), className: renews ? ghost : primary, ariaLabel: renews ? `Renew ${renews.label}` : undefined }}
      size="lg"
    />
  );
}

export function VerifyDocumentDrawer({ documentId, label, people, today, blocker }: { documentId: string; label: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Record the check of ${label}`}
      description={`Checked against the original or a certified copy, by you, signed in. A document is not checked twice: a corrected one is lodged as its renewal.`}
      fields={[
        hidden("documentId"),
        { kind: "select", name: "verification", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "VERIFIED", label: "Verified" }, { value: "NOT_IN_ORDER", label: "Not in order" }] },
        actorField("SupplierDocument.verifiedBy", { name: "personId", people }),
        { kind: "date", name: "verifiedOn", label: "Checked on", required: true, hint: "Not after today, nor before it was lodged." },
        { kind: "textarea", name: "verificationNote", label: "Why", hint: "Required where it is not in order." },
      ]}
      values={{ documentId, verifiedOn: today }}
      action={verifyDocument}
      submitLabel="Record the check"
      submitBlock={blocker}
      trigger={{ label: "Record the check", className: secondary, ariaLabel: `Record the check of ${label}` }}
    />
  );
}

// ------------------------------------------------------------------ applications

export function OpenApplicationDrawer({ supplierId, kinds, channels, people, today, blocker }: { supplierId: string; kinds: Option[]; channels: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a further application"
      description="A renewal or an upgrade from a registered supplier, or a first registration again after a rejection, as received on paper."
      columns={2}
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "kind", label: "What it is for", required: true, placeholder: "Choose", options: kinds },
        { kind: "date", name: "receivedOn", label: "Received on", required: true },
        { kind: "select", name: "channel", label: "How it came in", required: true, placeholder: "Choose", options: channels },
        { kind: "date", name: "declarationSignedOn", label: "Declaration signed on" },
        { kind: "date", name: "epaymentFormReceivedOn", label: "E-Payment form received on", hint: "Only that it was received: no bank detail before sign-in." },
        actorField("SupplierApplication.recordedBy", { name: "recordedByPersonId", people }),
      ]}
      values={{ supplierId, receivedOn: today }}
      action={openApplication}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: "Record a further application", className: secondary }}
    />
  );
}

export function PaperDaysDrawer({ applicationId, values }: { applicationId: string; values: Record<string, string> }) {
  return (
    <RecordEditor
      title="Record the paper's days"
      description="When the signed declaration was signed, and when the paper E-Payment form was received (no bank detail is recorded before sign-in). Their scans are attached below."
      fields={[hidden("applicationId"), { kind: "date", name: "declarationSignedOn", label: "Declaration signed on" }, { kind: "date", name: "epaymentFormReceivedOn", label: "E-Payment form received on" }]}
      values={{ applicationId, ...values }}
      action={recordApplicationPaper}
      trigger={{ label: "Record the paper's days", className: ghost }}
    />
  );
}

export function SubmitApplicationDrawer({ applicationId, people, blocker, route }: { applicationId: string; people: Option[]; blocker: string | null; route: string[] }) {
  return (
    <RecordEditor
      title="Send for decision"
      description={`The file goes to its approval route: ${route.length ? route.join(" → ") : "as the approval matrix resolves it"}. Whoever sends it may not decide a step of it.`}
      fields={[hidden("applicationId"), actorField("SupplierApplication.submittedBy", { name: "personId", people })]}
      values={{ applicationId }}
      action={submitForDecision}
      submitLabel="Send for decision"
      submitBlock={blocker}
      trigger={{ label: "Send for decision", className: primary }}
    />
  );
}

export function DecideStepDrawer({ stepId, office, done, people, today }: { stepId: string; office: string; done: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Record ${office}'s decision`}
      description={`On the supplier's registration. The holder signs in and decides it with their password. A decision that came from paper is recorded for them by someone else, and is not signed. Whoever it is for must hold the office organisation-wide, or a delegation of it with no value ceiling. A refusal leaves the application open.`}
      fields={[
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused: the application stays open" }] },
        actorField("ApprovalStep.decidedBy", { name: "personId", people, dated: true, hint: people.length === 0 ? "Nobody holds this office organisation-wide today." : undefined }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was sent." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ stepId, decidedOn: today }}
      action={decideRegistrationStep}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: primary }}
    />
  );
}

export function ResubmissionDrawer({ applicationId, items, people, blocker }: { applicationId: string; items: { name: string; label: string }[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Request a resubmission"
      description="Write the remarks for each item as they are to be given to the supplier; an item left empty is not asked for. The notice is shown on the record, not sent."
      columns={1}
      fields={[
        hidden("applicationId"),
        hidden("outcome"),
        ...items.map((i) => ({ kind: "textarea", name: i.name, label: i.label } as Field)),
        { kind: "date", name: "resubmitBy", label: "Resubmit by", required: true, hint: "After today. It lapses the day after: the application is then rejected when the lapse is recorded." },
        { kind: "textarea", name: "remarks", label: "General remarks" },
        actorField("ApplicationDecision.decidedBy", { name: "personId", people }),
      ]}
      values={{ applicationId, outcome: "RESUBMIT" }}
      action={decideApplication}
      submitLabel="Request the resubmission"
      submitBlock={blocker}
      trigger={{ label: "Request a resubmission", className: secondary }}
      size="lg"
    />
  );
}

export function RejectApplicationDrawer({ applicationId, people, blocker }: { applicationId: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Reject the application"
      description="The reasons are recorded as written, to be given to the supplier. The notice is shown on the record, not sent. A first registration rejected leaves the supplier not registered; it may apply again."
      fields={[hidden("applicationId"), hidden("outcome"), actorField("ApplicationDecision.decidedBy", { name: "personId", people })]}
      values={{ applicationId, outcome: "REJECT" }}
      destructive={{ reasonLabel: "The reasons, as written" }}
      action={decideApplication}
      submitLabel="Reject the application"
      cancelLabel="Keep it open"
      submitBlock={blocker}
      trigger={{ label: "Reject", className: ghost }}
    />
  );
}

export function RecordLapseDrawer({ applicationId, deadline }: { applicationId: string; deadline: string }) {
  return (
    <RecordEditor
      title="Record the lapse"
      description={`The resubmission was due by ${deadline} and has not been received. Recording the lapse rejects the application; nobody's name is put to it, it is the deadline's outcome. The notice is shown on the record, not sent.`}
      fields={[hidden("applicationId")]}
      values={{ applicationId }}
      danger
      action={recordLapse}
      submitLabel="Record the lapse"
      cancelLabel="Not now"
      trigger={{ label: "Record the lapse", className: primary }}
    />
  );
}
