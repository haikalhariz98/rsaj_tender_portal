import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { DECISION_WORDS, METHOD_WORDS } from "@/lib/certificate/labels";
import { DELIVERY_METHODS, SIGNATURE_DECISIONS, type Block } from "@/lib/certificate/types";
import { actorField } from "@/lib/auth/actor-field";

import {
  acknowledgeCertificateCopy,
  chooseCertificateRouteRejection,
  decideCertificateRouteStep,
  correctCertificatePayment,
  recordCertificatePayment,
  sendCertificateForApproval,
  correctCertificateDay,
  despatchCertificateCopy,
  overrideCertificateFigure,
  recordCertificateCheck,
  recordCertificateReceived,
  recordCertificateSignature,
  sendCertificateForRouting,
  sendCertificateToSigning,
  voidCertificateAct,
} from "./actions";

/**
 * The certificate's drawers (6.14 increment 1). No field carries a default but the day an act is recorded.
 * Every act is the signed-in officer's own; a decision, check or signature made on paper is recorded for the holder by someone else, and is not signed (Phase 2b). No drawer posts a bound field: the figures as
 * computed, the number, the sequence and the certificate's date are never inputs (FR-CRT-002). Each act is
 * judged again by the server on locked rows; a drawer that cannot proceed says why beside its button.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
/// Who is acting: the signed-in officer, shown and not chosen. Where the slot may come from paper, `people` are who it may be recorded for.
const by = (slot: string, name: string, people: Option[], label?: string, dated = false): Field => actorField(slot, { name, people, label, dated });

export function SendForRoutingDrawer({ certId, typeLabel, blocker }: { certId: string; typeLabel: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send for routing"
      description={`Starts the routing sheet (${typeLabel}). Checks, targets and figures freeze.`}
      fields={[hidden("certId")]}
      values={{ certId }}
      action={sendCertificateForRouting}
      submitLabel="Send for routing"
      submitBlock={blocker}
      trigger={{ label: "Send for routing", className: primary }}
    />
  );
}

export function SendToSigningDrawer({ certId, blocker, routed }: { certId: string; blocker: string | null; routed: boolean }) {
  return (
    <RecordEditor
      title="Send to signing"
      description={routed ? "Opens once the route is approved and checks are recorded." : "No routing sheet. Signature blocks open in printed order."}
      fields={[hidden("certId")]}
      values={{ certId }}
      action={sendCertificateToSigning}
      submitLabel="Send to signing"
      submitBlock={blocker}
      trigger={{ label: "Send to signing", className: primary }}
    />
  );
}

export function ReceivedDrawer({ certId, today, current }: { certId: string; today: string | null; current: string | null }) {
  return (
    <RecordEditor
      title="The day received"
      description="Starts the internal clock. Not in the future."
      fields={[hidden("certId"), { kind: "date", name: "receivedOn", label: "Received on", required: true }]}
      values={{ certId, receivedOn: current ?? today }}
      action={recordCertificateReceived}
      trigger={current ? { label: "Correct the received day", className: ghost } : { label: "Record the received day", className: secondary }}
    />
  );
}

export function CheckDrawer({ certId, defOrder, label, office, people, today, blocker }: { certId: string; defOrder: number; label: string; office: string | null; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title={label}
      description={office ? `For a holder of ${office}, or a delegate.` : "No office set for this check. Any officer may be named."}
      fields={[hidden("certId"), hidden("defOrder"), by("RoutingCheck.person", "personId", people), { kind: "date", name: "on", label: "On", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
      values={{ certId, defOrder: String(defOrder), on: today }}
      action={recordCertificateCheck}
      submitBlock={blocker}
      trigger={{ label: "Record", className: secondary, ariaLabel: `Record ${label}` }}
    />
  );
}

export function SignatureDrawer({ certId, block, people, today, blocker }: { certId: string; block: Block; people: Option[]; today: string | null; blocker: string | null }) {
  const own = ["SO", "SO_REP", "RECOMMENDING_OFFICER", "NAMED_OFFICE"].includes(block.officeRule);
  const fields: Field[] = [hidden("certId"), hidden("blockOrder")];
  if (own) {
    fields.push(hidden("personBlock"));
    fields.push(by("CertificateSignature.person", "personId", people, undefined, true));
    fields.push({ kind: "date", name: "signedOn", label: "Signed on", hint: "Empty is today. From paper: signing day." });
  } else {
    fields.push({ kind: "text", name: "name", label: "Full name as signed", required: true });
    fields.push({ kind: "text", name: "icNumber", label: "Identity-card number", hint: "Only the last four digits are kept." });
    fields.push({ kind: "date", name: "signedOn", label: "Signed on paper on", required: true });
    if (block.refusalAllowed) {
      fields.push({ kind: "select", name: "refused", label: "Signed, or refused", required: true, placeholder: "Choose", options: [{ value: "no", label: "Signed" }, { value: "yes", label: "Refused to sign: recorded, and the next block follows" }] });
      fields.push({ kind: "textarea", name: "refusalNote", label: "What the refusal was" });
    }
  }
  if (block.carriesDecision) {
    fields.push({ kind: "select", name: "decision", label: "Answer", required: true, placeholder: "Choose", options: SIGNATURE_DECISIONS.map((d) => ({ value: d, label: DECISION_WORDS[d].en })) });
    fields.push({ kind: "money", name: "decisionCap", label: "Supported up to (where capped)" });
  }
  return (
    <RecordEditor
      title={block.labelEn}
      description={own ? `Dated today${block.datesCertificate ? ", and that day is the certificate's date" : ""}. The first signature pins the form.` : `Dated the day signed on paper${block.datesCertificate ? ", which is the certificate's date" : ""}.`}
      fields={fields}
      values={{ certId, blockOrder: String(block.blockOrder), signedOn: own ? null : today, personBlock: own ? "yes" : "no" }}
      showWhen={block.refusalAllowed ? { refusalNote: { name: "refused", in: ["yes"] } } : undefined}
      action={recordCertificateSignature}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={{ label: "Record", className: primary, ariaLabel: `Record ${block.labelEn}` }}
    />
  );
}

export function OverrideDrawer({ certId, fieldKey, label, computed, people }: { certId: string; fieldKey: string; label: string; computed: string; people: Option[] }) {
  return (
    <RecordEditor
      title={`Override: ${label}`}
      description={`As computed: ${computed}. An override needs a justification and the officer. Totals are recomputed.`}
      fields={[hidden("certId"), hidden("fieldKey"), { kind: "text", name: "value", label: "Overridden to", required: true }, { kind: "textarea", name: "justification", label: "Justification", required: true }, by("CertificateOverride.person", "personId", people)]}
      values={{ certId, fieldKey }}
      action={overrideCertificateFigure}
      trigger={{ label: "Override", className: ghost, ariaLabel: `Override ${label}` }}
    />
  );
}

export function CorrectDateDrawer({ certId, current }: { certId: string; current: string }) {
  return (
    <RecordEditor
      title="Correct the certificate's date"
      description={`Now ${current}. Earlier days only; the reason is kept. Final once issued.`}
      fields={[hidden("certId"), { kind: "date", name: "correctedDay", label: "Corrected day", required: true }]}
      values={{ certId }}
      reason={{ label: "Why" }}
      action={correctCertificateDay}
      trigger={{ label: "Correct the date", className: ghost }}
    />
  );
}

export function DespatchDrawer({ certId, copyId, label, today }: { certId: string; copyId: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Send ${label}`}
      description="Not before issue, not in the future."
      fields={[hidden("certId"), hidden("copyId"), { kind: "select", name: "method", label: "How it went", required: true, placeholder: "Choose", options: DELIVERY_METHODS.map((m) => ({ value: m, label: METHOD_WORDS[m].en })) }, { kind: "date", name: "despatchedOn", label: "Sent on", required: true }]}
      values={{ certId, copyId, despatchedOn: today }}
      action={despatchCertificateCopy}
      trigger={{ label: "Record sending", className: secondary, ariaLabel: `Record sending ${label}` }}
    />
  );
}

export function AcknowledgeDrawer({ certId, copyId, label, today }: { certId: string; copyId: string; label: string; today: string | null }) {
  return (
    <RecordEditor
      title={`Acknowledged: ${label}`}
      description="Not before it went, not in the future."
      fields={[hidden("certId"), hidden("copyId"), { kind: "date", name: "acknowledgedOn", label: "Acknowledged on", required: true }]}
      values={{ certId, copyId, acknowledgedOn: today }}
      action={acknowledgeCertificateCopy}
      trigger={{ label: "Record acknowledgement", className: ghost, ariaLabel: `Record acknowledgement of ${label}` }}
    />
  );
}

export function VoidDrawer({ certId, blocker }: { certId: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Void the certificate"
      description="Only before issue. Keeps no number; everything recorded is kept."
      fields={[hidden("certId")]}
      values={{ certId }}
      destructive={{ reasonLabel: "Why it is void" }}
      action={voidCertificateAct}
      submitLabel="Void the certificate"
      cancelLabel="Keep the certificate"
      submitBlock={blocker}
      trigger={{ label: "Void", className: ghost }}
    />
  );
}

// ------------------------------------------------------------------ the approval route (6.13 Part A step 3, 614-C4)

export function SendForApprovalDrawer({ certId, figure, people, blocker, again }: { certId: string; figure: string; people: Option[]; blocker: string | null; again: boolean }) {
  return (
    <RecordEditor
      title={again ? "Send for approval again" : "Send for approval"}
      description={`Routed on ${figure}. Figures freeze. You cannot decide it afterwards.`}
      fields={[hidden("certId"), by("ApprovalInstance.submittedBy", "personId", people)]}
      values={{ certId }}
      action={sendCertificateForApproval}
      submitLabel={again ? "Send again" : "Send for approval"}
      submitBlock={blocker}
      trigger={{ label: again ? "Send for approval again" : "Send for approval", className: primary }}
    />
  );
}

export function DecideRouteStepDrawer({ certId, stepId, roleLabel, act, done, people, today }: { certId: string; stepId: string; roleLabel: string; act: string; done: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Record ${roleLabel}'s decision`}
      description={`The ${act.toLowerCase()} step. Paper decisions are recorded, not signed.`}
      fields={[
        hidden("certId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused" }] },
        by("ApprovalStep.decidedBy", "personId", people, undefined, true),
        { kind: "date", name: "receivedOn", label: "Received on", hint: "Optional. Not recorded shows as such." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today or before it was sent." },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required for a refusal." },
      ]}
      values={{ certId, stepId, decidedOn: today }}
      action={decideCertificateRouteStep}
      submitLabel="Record decision"
      trigger={{ label: "Record decision", className: primary, ariaLabel: `Record ${roleLabel}'s decision` }}
      size="md"
    />
  );
}

export function ChooseRejectionDrawer({ certId, offered, steps, people }: { certId: string; offered: Option[]; steps: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title="Where the refusal sends it"
      description="No destination configured. The officer chooses."
      fields={[
        hidden("certId"),
        { kind: "select", name: "goesTo", label: "Where it goes", required: true, placeholder: "Choose", options: offered },
        { kind: "select", name: "returnToSeq", label: "Back to the step", placeholder: steps.length ? "Choose, for a return to a step" : "No earlier step", options: steps },
        by("ApprovalInstance.rejectionChosenBy", "personId", people),
        { kind: "textarea", name: "reason", label: "Why it goes there", required: true },
      ]}
      values={{ certId }}
      action={chooseCertificateRouteRejection}
      submitLabel="Record where it goes"
      showWhen={{ returnToSeq: { name: "goesTo", in: ["RETURN_TO_STEP"] } }}
      trigger={{ label: "Choose where it goes", className: primary }}
      size="md"
    />
  );
}

export function FinancePaymentDrawer({ certId, amount, people, today, blocker }: { certId: string; amount: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Paid by Finance"
      description={`Batch number and day paid. The amount is the certificate's own (${amount}).`}
      fields={[hidden("certId"), { kind: "text", name: "batchNo", label: "Batch number", required: true }, { kind: "date", name: "paidOn", label: "Paid on", required: true }, by("FinancePayment.person", "personId", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ certId, paidOn: today }}
      action={recordCertificatePayment}
      submitLabel="Record the payment"
      submitBlock={blocker}
      trigger={{ label: "Record Finance's payment", className: secondary }}
    />
  );
}

/// Phase 0.3 item 12: the day and batch as they should read; the amount is the certificate's own and is never corrected.
export function CorrectFinancePaymentDrawer({ certId, batchNo, paidOn, blocker }: { certId: string; batchNo: string; paidOn: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Correct Finance's payment"
      description="Kept as a correction beside the payment, never an edit."
      fields={[hidden("certId"), { kind: "text", name: "batchNo", label: "Batch number", required: true }, { kind: "date", name: "paidOn", label: "Paid on", required: true }]}
      values={{ certId, batchNo, paidOn }}
      action={correctCertificatePayment}
      reason={{ label: "Why is it corrected?" }}
      submitLabel="Save the correction"
      submitBlock={blocker}
      trigger={{ label: "Correct", className: ghost }}
    />
  );
}
