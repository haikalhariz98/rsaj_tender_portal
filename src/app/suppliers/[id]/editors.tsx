import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";

import { decideApplication, decideRegistrationStep, lodgeDocument, openApplication, recordApplicationPaper, recordLapse, saveContact, setErpVendorCode, submitForDecision, verifyDocument } from "../actions";
import { verifyCreditorProfile } from "../creditor-actions";

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
      description="SULIT. Shown only to roles the organisation has chosen."
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
      description="Entered by hand. Not synced."
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
      description={renews ? "Takes effect once verified. The old document stays in force until then." : "One per type; later ones renew it. Then attach the scan and verify."}
      columns={2}
      fields={[
        hidden("supplierId"),
        hidden("renewsId"),
        ...(renews ? [hidden("typeId")] : [{ kind: "select", name: "typeId", label: "Document type", required: true, placeholder: "Choose", options: types } as Field]),
        { kind: "text", name: "reference", label: "Reference", hint: "Number as printed. Not for not-applicable." },
        { kind: "text", name: "issuingAuthority", label: "Issuing authority" },
        { kind: "date", name: "issuedOn", label: "Issued on" },
        { kind: "date", name: "validFrom", label: "Valid from" },
        { kind: "date", name: "expiresOn", label: "Expires on", hint: "Required where the type carries an expiry." },
        { kind: "tokens", name: "valueIds", label: "Values it records", options: values, hint: "Grades, categories, codes, as the certificate states them." },
        ...(renews ? [] : [{ kind: "switch", name: "notApplicable", label: "Not applicable to this supplier", hint: "Only where the type allows it." } as Field]),
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

export function VerifyDocumentDrawer({ documentId, label, people, today, blocker, expiresOn, asksExpiry }: { documentId: string; label: string; people: Option[]; today: string | null; blocker: string | null; /** The expiry date the document holds now (YYYY-MM-DD), to be confirmed against the certificate. */ expiresOn?: string | null; /** Whether this kind of document has an expiry to confirm. */ asksExpiry?: boolean }) {
  return (
    <RecordEditor
      title={`Record the check of ${label}`}
      description="Checked against the original, signed with your password."
      fields={[
        hidden("documentId"),
        { kind: "select", name: "verification", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "VERIFIED", label: "Verified" }, { value: "NOT_IN_ORDER", label: "Not in order" }] },
        actorField("SupplierDocument.verifiedBy", { name: "personId", people }),
        { kind: "date", name: "verifiedOn", label: "Checked on", required: true, hint: "Not after today, nor before it was lodged." },
        ...(asksExpiry ? [{ kind: "date", name: "expiresOn", label: "Expiry date on the certificate", hint: "Confirm against the certificate." } satisfies Field] : []),
        { kind: "textarea", name: "verificationNote", label: "Why", hint: "Required if not in order or expiry changed." },
      ]}
      values={{ documentId, verifiedOn: today, ...(asksExpiry ? { expiresOn: expiresOn ?? "" } : {}) }}
      action={verifyDocument}
      submitLabel="Record the check"
      submitBlock={blocker}
      trigger={{ label: "Record the check", className: secondary, ariaLabel: `Record the check of ${label}` }}
    />
  );
}

/**
 * The check of a supplier's bank details (Phase 4b, FR-VND-005): ONE officer, signed with their own password, against the statement the supplier uploaded. Found not in order, it says why; a
 * later change by the supplier is a new version, checked on its own. `blocker` says why the check cannot be made, beside the button.
 */
export function VerifyCreditorDrawer({ profileId, version, today, blocker }: { profileId: string; version: number; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={`Check the bank details, version ${version}`}
      description="You sign with your password. Payments use these details once checked."
      fields={[
        hidden("profileId"),
        { kind: "select", name: "verification", label: "Outcome", required: true, placeholder: "Choose", options: [{ value: "VERIFIED", label: "In order" }, { value: "NOT_IN_ORDER", label: "Not in order" }] },
        actorField("CreditorProfile.verifiedBy", { name: "personId", dated: true }),
        { kind: "date", name: "verifiedOn", label: "Checked on", required: true, hint: "Not after today or before it was sent." },
        { kind: "textarea", name: "verificationNote", label: "Why", hint: "Required where not in order." },
      ]}
      values={{ profileId, verifiedOn: today }}
      action={verifyCreditorProfile}
      submitLabel="Record the check"
      submitBlock={blocker}
      trigger={{ label: "Check the bank details", className: primary, ariaLabel: `Check the bank details, version ${version}` }}
    />
  );
}

// ------------------------------------------------------------------ applications

export function OpenApplicationDrawer({ supplierId, kinds, channels, people, today, blocker }: { supplierId: string; kinds: Option[]; channels: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record a further application"
      description="As received on paper."
      columns={2}
      fields={[
        hidden("supplierId"),
        { kind: "select", name: "kind", label: "What it is for", required: true, placeholder: "Choose", options: kinds },
        { kind: "date", name: "receivedOn", label: "Received on", required: true },
        { kind: "select", name: "channel", label: "How it came in", required: true, placeholder: "Choose", options: channels },
        { kind: "date", name: "declarationSignedOn", label: "Declaration signed on" },
        { kind: "date", name: "epaymentFormReceivedOn", label: "E-Payment form received on", hint: "Receipt only: no bank detail recorded." },
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
      description="Scans are attached below."
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
      description={`Sent along ${route.length ? route.join(" → ") : "the matrix route"}. The sender cannot decide a step.`}
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
      description="Signed by the holder with their password. Paper decisions are recorded by someone else."
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
      description="Written as given to the supplier. Shown on the record, not emailed."
      columns={1}
      fields={[
        hidden("applicationId"),
        hidden("outcome"),
        ...items.map((i) => ({ kind: "textarea", name: i.name, label: i.label } as Field)),
        { kind: "date", name: "resubmitBy", label: "Resubmit by", required: true, hint: "After today. It lapses the day after." },
        { kind: "textarea", name: "remarks", label: "General remarks" },
        actorField("ApplicationDecision.decidedBy", { name: "personId", people, paper: false }),
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
      description="Written as given to the supplier. Shown on the record, not emailed."
      fields={[hidden("applicationId"), hidden("outcome"), actorField("ApplicationDecision.decidedBy", { name: "personId", people, paper: false })]}
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
      description={`Due ${deadline}, not received. Recording it rejects the application.`}
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
