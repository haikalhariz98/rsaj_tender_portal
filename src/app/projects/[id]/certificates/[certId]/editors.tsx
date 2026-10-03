import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { DECISION_WORDS, METHOD_WORDS } from "@/lib/certificate/labels";
import { DELIVERY_METHODS, SIGNATURE_DECISIONS, type Block } from "@/lib/certificate/types";
import { ON_BEHALF_HINT } from "@/lib/documents/labels";

import {
  acknowledgeCertificateCopy,
  chooseCertificateRouteRejection,
  decideCertificateRouteStep,
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
 * Every Person named is recorded on their behalf, not signed. No drawer posts a bound field: the figures as
 * computed, the number, the sequence and the certificate's date are never inputs (FR-CRT-002). Each act is
 * judged again by the server on locked rows; a drawer that cannot proceed says why beside its button.
 */

type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const ghost = buttonClass("ghost", "sm");
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const person = (name: string, label: string, people: Option[]): Field => ({ kind: "select", name, label, required: true, placeholder: "Choose", options: people, hint: ON_BEHALF_HINT });

export function SendForRoutingDrawer({ certId, typeLabel, blocker }: { certId: string; typeLabel: string; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send for routing"
      description={`Starts its routing sheet (${typeLabel}) as the type stands today: its checks and targets are frozen on the certificate. The figures freeze too: nothing is overridden after this.`}
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
      description={routed ? "Its approval route is approved and every check of this round is recorded: the signature blocks open in printed order." : "This certificate has no routing sheet: the module that raised it sends it to no approval route. The figures freeze and the signature blocks open in printed order."}
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
      description="The day the document reached the routing sheet. It starts the internal clock. Not in the future, not after the first check is recorded, and not after its approval route opened or anyone on it decided."
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
      description={office ? `Recorded for a holder of ${office} on the day (or a delegate of the whole office).` : "No office is set for this check on its type: any officer may be named, and the sheet says so."}
      fields={[hidden("certId"), hidden("defOrder"), person("personId", "Recorded for", people), { kind: "date", name: "on", label: "On", required: true }, { kind: "textarea", name: "note", label: "Note" }]}
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
  if (own) fields.push(person("personId", "Signed by", people));
  else {
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
      description={own ? `Dated the day this is recorded${block.datesCertificate ? ", and that day is the certificate's date" : ""}. The first signature pins the form: its order and recipients do not move after it.` : `Dated the day signed on paper${block.datesCertificate ? ", which is the certificate's date" : ""}.`}
      fields={fields}
      values={{ certId, blockOrder: String(block.blockOrder), signedOn: own ? null : today }}
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
      description={`As computed: ${computed}. An override is an exception: it needs its justification and the officer it is recorded for, and both figures stay on the certificate. Totals are recomputed from the lines.`}
      fields={[hidden("certId"), hidden("fieldKey"), { kind: "text", name: "value", label: "Overridden to", required: true }, { kind: "textarea", name: "justification", label: "Justification", required: true }, person("personId", "Recorded for", people)]}
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
      description={`Now ${current}. Corrected while the certificate is being signed, so the day it is issued with is the corrected one; once issued it is final. A correction moves it to an earlier day, never later or into the future, never before a block signed before the dating block, and never before the certificate was opened or its route approved. The reason is kept beside it.`}
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
      description="How the copy went and the day it went. Not before the day the certificate was issued, not in the future."
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
      description="The day the recipient acknowledged the copy. Not before it went, not in the future."
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
      description="A certificate is voided only before it is issued. It keeps no number and leaves no gap; everything recorded on it is kept as it was."
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
      description={`Opens its approval route on the approval matrix in force today, routed on ${figure}. The figures go as they stand (any override included) and freeze: nothing is overridden while the route waits or once it is approved. Where it has a routing sheet, the sheet starts too. Name who sends it: recorded on their behalf, not signed, and they may not decide it.`}
      fields={[hidden("certId"), person("personId", "Sent by", people)]}
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
      description={`The ${act.toLowerCase()} step of the certificate's approval route. Name who decided: recorded on their behalf, not signed. They must hold the office for the contract's department, or a delegation of it, and may not be who sent it for approval.`}
      fields={[
        hidden("certId"),
        hidden("stepId"),
        { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: done }, { value: "REJECTED", label: "Refused" }] },
        { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: people },
        { kind: "date", name: "receivedOn", label: "Received on", hint: "The day it reached them. Optional: not recorded is shown as such." },
        { kind: "date", name: "decidedOn", label: "Decided on", required: true, hint: "Not after today, nor before it was sent for approval." },
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
      description="Nothing configured decides where a refused certificate goes, so the officer chooses: back to whoever raised it (it may be sent again on a new route), back to an earlier step (a new route continues from it), or the certificate ends (it is voided with the refusal as its reason). Recorded on the named officer's behalf."
      fields={[
        hidden("certId"),
        { kind: "select", name: "goesTo", label: "Where it goes", required: true, placeholder: "Choose", options: offered },
        { kind: "select", name: "returnToSeq", label: "Back to the step", placeholder: steps.length ? "Choose, for a return to a step" : "No earlier step", options: steps },
        person("personId", "Chosen by", people),
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
      description={`What Finance returns once it has paid the certificate: its batch number and the day paid. The amount is the certificate's own (${amount}), never keyed.`}
      fields={[hidden("certId"), { kind: "text", name: "batchNo", label: "Batch number", required: true }, { kind: "date", name: "paidOn", label: "Paid on", required: true }, person("personId", "Recorded for", people), { kind: "textarea", name: "note", label: "Note" }]}
      values={{ certId, paidOn: today }}
      action={recordCertificatePayment}
      submitLabel="Record the payment"
      submitBlock={blocker}
      trigger={{ label: "Record Finance's payment", className: secondary }}
    />
  );
}
