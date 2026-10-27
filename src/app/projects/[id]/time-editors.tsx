"use client";

import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { moreItemClass } from "@/components/ui/more-item-class";
import { actorField } from "@/lib/auth/actor-field";

import { recordLadWaiver, resendLadWaiver, sendLadWaiver } from "./damages-actions";
import { chooseContractMatterRejection, citeContractMatterDecision, decideContractMatterStep, tableContractMatter } from "./matter-actions";
import {
  addEotReason,
  answerEotClaim,
  determineEotClaim,
  openEotClaim,
  raiseEotCertificate,
  raisePeriodAgreement,
  recordDelayNotice,
  recordLossExpense,
  recordPeriodExtension,
  removeEotReason,
  sendEotClaim,
  sendLossExpense,
  sendPeriodExtension,
  valueLossExpense,
} from "./time-actions";

/**
 * The drawers of time and damages (Phase 2 close-out stage A; plan closeout-plan.md §3.1): the delay notice, the extension-of-time claim and its
 * certificate, loss and expense, the contract period, the matter's route, and the waiver. Each posts to its act, which judges it again; a drawer's
 * blocker is the act's own refusal on the same inputs. Every known set of values is a dropdown.
 */

export type Option = { value: string; label: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const primary = buttonClass("primary", "sm");
const secondary = buttonClass("secondary", "sm");
const by = (slot: string, name: string, people: Option[], opts: { dated?: boolean } = {}): Field => actorField(slot, { name, people, dated: opts.dated });
const choose = (name: string, label: string, options: Option[], hint?: string, required = true): Field => ({ kind: "select", name, label, required, placeholder: "Choose", options, ...(hint ? { hint } : {}) });
const YES_NO: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const trig = (label: string, menu: boolean, main = false) => ({ label, className: menu ? moreItemClass() : main ? primary : secondary });

// ------------------------------------------------------------------ the delay notice and the claim

export function DelayNoticeDrawer({ id, people, today, blocker }: { id: string; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record delay notice"
      fields={[
        hidden("id"),
        choose("path", "How it came", [
          { value: "CONTRACTOR_NOTICE", label: "The contractor's notice" },
          { value: "SO_DIRECTION", label: "The S.O.'s direction to give reasons" },
        ]),
        { kind: "textarea", name: "cause", label: "Cause of the delay", required: true },
        { kind: "date", name: "occurredOn", label: "Delay occurred on", required: true },
        { kind: "date", name: "receivedOn", label: "Received on", required: true },
        { kind: "textarea", name: "note", label: "Note" },
        by("DelayNotice.person", "personId", people),
      ]}
      values={{ id, receivedOn: today }}
      action={recordDelayNotice}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={trig("Record delay notice", false, true)}
    />
  );
}

export function OpenClaimDrawer({ id, notices, programmes, people, blocker, menu = false }: { id: string; notices: Option[]; programmes: Option[]; people: Option[]; blocker: string | null; menu?: boolean }) {
  return (
    <RecordEditor
      title="Open a claim"
      description="For the whole works."
      fields={[
        hidden("id"),
        hidden("scope"),
        choose("noticeId", "Delay notice", notices, notices.length ? undefined : "Record the delay notice first."),
        { kind: "text", name: "groundClause", label: "Ground (clause)", required: true },
        { kind: "textarea", name: "cause", label: "Cause", required: true },
        choose("programmeId", "Approved programme", programmes, programmes.length ? undefined : "No approved programme revision."),
        { kind: "number", name: "proposedDays", label: "Days proposed", required: true, min: 0 },
        choose("financialImpact", "Financial impact", [
          { value: "NONE", label: "None" },
          { value: "AUTHORITY_REQUIREMENT", label: "Due to an authority's requirement" },
          { value: "OTHER", label: "Other" },
        ]),
        { kind: "switch", name: "isWeather", label: "A weather claim" },
        by("ContractMatter.person", "personId", people),
      ]}
      values={{ id, scope: "WHOLE" }}
      action={openEotClaim}
      submitLabel="Open"
      submitBlock={blocker}
      trigger={trig("Open a claim", menu, !menu)}
    />
  );
}

const PACK: [string, string][] = [
  ["CALCULATION", "How the period was calculated"],
  ["EMPLOYER_DELAY", "Employer's delay: resolved, or what is being done"],
  ["LOSS_EXPENSE", "Loss and expense claimed or to be claimed"],
  ["PROGRESS", "Progress and the balance of work"],
  ["COMPLETION", "Can it complete by the proposed date"],
];

export function AnswerClaimDrawer({ id, claimId, weather, people, menu = false }: { id: string; claimId: string; weather: boolean; people: Option[]; menu?: boolean }) {
  return (
    <RecordEditor
      title="Answer the claim"
      description="The submission pack: answer each item, or mark it not required and say why."
      fields={[
        hidden("id"),
        hidden("claimId"),
        { kind: "number", name: "actualDelayDays", label: "Actual delay (days)", min: 0 },
        ...(weather ? [{ kind: "select", name: "exceptional", label: "Exceptional weather", placeholder: "Not answered", options: YES_NO } as Field] : []),
        { kind: "number", name: "earthworksDays", label: "Earthworks drying days", min: 0 },
        { kind: "select", name: "canComplete", label: "Can complete by the proposed date", placeholder: "Not answered", options: YES_NO },
        { kind: "date", name: "estimatedCompletion", label: "Estimated completion" },
        { kind: "money", name: "lossExpenseEstimate", label: "Loss-and-expense estimate (RM)" },
        ...PACK.flatMap(([k, label]): Field[] => [
          { kind: "textarea", name: `pack_${k}`, label },
          { kind: "switch", name: `pack_${k}_notRequired`, label: "Not required (say why above)" },
        ]),
        by("EotClaim.answeredBy", "personId", people),
      ]}
      values={{ id, claimId }}
      showWhen={{ estimatedCompletion: { name: "canComplete", in: ["no"] } }}
      action={answerEotClaim}
      submitLabel="Record"
      trigger={trig("Answer the claim", menu, !menu)}
    />
  );
}

export function AddReasonDrawer({ id, claimId, menu = false }: { id: string; claimId: string; menu?: boolean }) {
  return (
    <RecordEditor
      title="Add reason"
      fields={[
        hidden("id"),
        hidden("claimId"),
        { kind: "text", name: "clause", label: "Clause", required: true },
        { kind: "textarea", name: "reason", label: "Reason", required: true },
        { kind: "date", name: "delayFrom", label: "Delay from", required: true },
        { kind: "date", name: "delayUntil", label: "Delay until", hint: "The first day not delayed.", required: true },
        { kind: "number", name: "extensionDays", label: "Extension (days)", required: true, min: 0 },
        choose("concurrency", "Runs", [
          { value: "CONSECUTIVE", label: "Consecutively" },
          { value: "CONCURRENT", label: "Concurrently" },
        ]),
        { kind: "text", name: "group", label: "Concurrent group", hint: "Reasons in one group count at the longest." },
      ]}
      values={{ id, claimId }}
      showWhen={{ group: { name: "concurrency", in: ["CONCURRENT"] } }}
      action={addEotReason}
      submitLabel="Add"
      trigger={trig("Add reason", menu, !menu)}
    />
  );
}

export function RemoveReasonDrawer({ id, reasons }: { id: string; reasons: Option[] }) {
  return (
    <RecordEditor
      title="Remove reason"
      fields={[hidden("id"), choose("reasonId", "Reason", reasons)]}
      values={{ id }}
      action={removeEotReason}
      submitLabel="Remove"
      trigger={trig("Remove reason", true)}
    />
  );
}

export function DetermineDrawer({ id, claimId, condition, people }: { id: string; claimId: string; condition: string | null; people: Option[] }) {
  return (
    <RecordEditor
      title="Determine"
      description="The S.O.'s determination. Not entitled closes the claim."
      fields={[
        hidden("id"),
        hidden("claimId"),
        choose("entitlement", "Entitled", [
          { value: "ENTITLED", label: "Entitled" },
          { value: "NOT_ENTITLED", label: "Not entitled" },
        ]),
        { kind: "textarea", name: "entitlementReason", label: "Why", required: true },
        { kind: "select", name: "bestEndeavours", label: "Best endeavours", placeholder: "Choose", options: [
          { value: "FULL", label: "Fully" },
          { value: "PARTIAL", label: "In part" },
          { value: "NONE", label: "Not used" },
        ] },
        ...(condition ? [{ kind: "textarea", name: "exclusionOverrideReason", label: `Why ${condition} is overridden` } as Field] : []),
        by("EotClaim.determinedBy", "personId", people),
      ]}
      values={{ id, claimId }}
      showWhen={{ bestEndeavours: { name: "entitlement", in: ["ENTITLED"] } }}
      action={determineEotClaim}
      submitLabel="Determine"
      trigger={trig("Determine", false, true)}
    />
  );
}

export function SendClaimDrawer({ id, claimId, people, blocker }: { id: string; claimId: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send for approval"
      description="Routed on the matrix by its financial impact."
      fields={[hidden("id"), hidden("claimId"), by("ApprovalInstance.submittedBy", "personId", people)]}
      values={{ id, claimId }}
      action={sendEotClaim}
      submitLabel="Send"
      submitBlock={blocker}
      trigger={trig("Send for approval", false, true)}
    />
  );
}

export function RaiseEotDrawer({ id, claimId, computed, partial, people, blocker }: { id: string; claimId: string; computed: number; partial: boolean; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise certificate"
      description={`The reasons compute ${computed} days (assumed).`}
      fields={[
        hidden("id"),
        hidden("claimId"),
        { kind: "number", name: "grantedDays", label: "Days granted", required: true, min: 1 },
        ...(partial ? [{ kind: "textarea", name: "unextendedNote", label: "Period not extended", required: true } as Field] : []),
        by("ExtensionOfTime.person", "personId", people),
      ]}
      values={{ id, claimId, grantedDays: String(computed) }}
      action={raiseEotCertificate}
      submitLabel="Raise"
      submitBlock={blocker}
      trigger={trig("Raise certificate", false, true)}
    />
  );
}

// ------------------------------------------------------------------ a contract matter's route

export function DecideMatterStepDrawer({ id, matterId, stepId, roleLabel, people, today }: { id: string; matterId: string; stepId: string; roleLabel: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`${roleLabel}: decide`}
      description="Not the sender."
      fields={[
        hidden("id"),
        hidden("matterId"),
        hidden("stepId"),
        choose("decision", "Decision", [
          { value: "DONE", label: "Approved" },
          { value: "REJECTED", label: "Refused" },
        ]),
        by("ApprovalStep.decidedBy", "personId", people, { dated: true }),
        { kind: "date", name: "decidedOn", label: "Decided on", required: true },
        { kind: "date", name: "receivedOn", label: "Received on" },
        { kind: "textarea", name: "reason", label: "Reason", hint: "Required where it is refused." },
      ]}
      values={{ id, matterId, stepId, decidedOn: today }}
      action={decideContractMatterStep}
      submitLabel="Record decision"
      trigger={trig("Record decision", false, true)}
    />
  );
}

export function ChooseMatterRefusalDrawer({ id, matterId, offered, steps, people }: { id: string; matterId: string; offered: Option[]; steps: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title="Where the refused route goes"
      fields={[hidden("id"), hidden("matterId"), choose("kind", "Where it goes", offered), { kind: "select", name: "returnToSeq", label: "Back to step", placeholder: "Choose", options: steps }, by("ApprovalInstance.rejectionChosenBy", "personId", people), { kind: "textarea", name: "reason", label: "Reason", required: true }]}
      values={{ id, matterId }}
      showWhen={{ returnToSeq: { name: "kind", in: ["RETURN_TO_STEP"] } }}
      action={chooseContractMatterRejection}
      submitLabel="Record"
      trigger={trig("Say where it goes", false, true)}
    />
  );
}

export function TableMatterDrawer({ id, matterId, sittings, tablers }: { id: string; matterId: string; sittings: Option[]; tablers: Option[] }) {
  return (
    <RecordEditor
      title="Table it for the committee"
      fields={[hidden("id"), hidden("matterId"), choose("meetingId", "Sitting", sittings, sittings.length ? undefined : "No sitting open. Schedule one under Committees."), by("CommitteeDecision.tabledBy", "tabledByPersonId", tablers)]}
      values={{ id, matterId }}
      action={tableContractMatter}
      submitLabel="Table"
      trigger={trig("Table at a sitting", false, true)}
    />
  );
}

export function CiteMatterDrawer({ id, matterId, stepId, committee, matters }: { id: string; matterId: string; stepId: string; committee: string; matters: Option[] }) {
  return (
    <RecordEditor
      title={`${committee}: cite its decision`}
      fields={[hidden("id"), hidden("matterId"), hidden("stepId"), choose("committeeDecisionId", "The decision", matters, matters.length ? undefined : "Nothing decided yet.")]}
      values={{ id, matterId, stepId }}
      action={citeContractMatterDecision}
      submitLabel="Cite"
      trigger={trig("Cite the decision", false, true)}
    />
  );
}

// ------------------------------------------------------------------ loss and expense

export function RecordLossDrawer({ id, claims, people, blocker }: { id: string; claims: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record loss and expense"
      fields={[hidden("id"), { kind: "money", name: "claimed", label: "Amount claimed (RM)", required: true }, { kind: "select", name: "eotClaimId", label: "On the extension-of-time claim", placeholder: "None", options: claims }, by("LossExpenseClaim.person", "personId", people)]}
      values={{ id }}
      action={recordLossExpense}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={trig("Record", false, true)}
    />
  );
}

export function ValueLossDrawer({ id, losses, people, today, blocker }: { id: string; losses: Option[]; people: Option[]; today: string | null; blocker: string | null }) {
  return (
    <RecordEditor
      title="Value loss and expense"
      fields={[hidden("id"), choose("lossId", "Claim", losses), { kind: "money", name: "valued", label: "Value (RM)", required: true }, { kind: "textarea", name: "basis", label: "How it was valued", required: true }, { kind: "date", name: "valuedOn", label: "Valued on", required: true }, by("LossExpenseClaim.valuedBy", "personId", people, { dated: true })]}
      values={{ id, valuedOn: today }}
      action={valueLossExpense}
      submitLabel="Record"
      submitBlock={losses.length ? blocker : "Nothing to value."}
      trigger={trig("Value", true)}
    />
  );
}

export function SendLossDrawer({ id, losses, people, blocker }: { id: string; losses: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send loss and expense for approval"
      fields={[hidden("id"), choose("lossId", "Claim", losses), by("ApprovalInstance.submittedBy", "personId", people)]}
      values={{ id }}
      action={sendLossExpense}
      submitLabel="Send"
      submitBlock={losses.length ? blocker : "Nothing valued to send."}
      trigger={trig("Send for approval", true)}
    />
  );
}

// ------------------------------------------------------------------ the contract period

const PRECONDITIONS: [string, string][] = [
  ["priorAgreement", "The contractor agrees beforehand"],
  ["termsRetained", "The terms and conditions are kept"],
  ["ratesRetained", "The rates are kept"],
  ["performanceSatisfactory", "The contractor's performance is satisfactory"],
  ["spanConfirmed", "The SPAN Act is complied with"],
];

export function RecordPeriodDrawer({ id, people, blocker }: { id: string; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Record period extension"
      fields={[
        hidden("id"),
        ...PRECONDITIONS.map(([k, label]) => choose(k, label, YES_NO)),
        { kind: "date", name: "newExpiry", label: "New expiry", required: true },
        { kind: "money", name: "financialImpact", label: "Financial impact (RM)", hint: "Leave empty where there is none." },
        { kind: "textarea", name: "reason", label: "Why it is extended", required: true },
        by("PeriodExtension.person", "personId", people),
      ]}
      values={{ id }}
      action={recordPeriodExtension}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={trig("Record period extension", false, true)}
    />
  );
}

export function SendPeriodDrawer({ id, extensions, people, blocker }: { id: string; extensions: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send period extension for approval"
      fields={[hidden("id"), choose("extensionId", "Extension", extensions), by("ApprovalInstance.submittedBy", "personId", people)]}
      values={{ id }}
      action={sendPeriodExtension}
      submitLabel="Send"
      submitBlock={extensions.length ? blocker : "Nothing to send."}
      trigger={trig("Send for approval", true)}
    />
  );
}

export function RaiseAgreementDrawer({ id, extensions, people, blocker }: { id: string; extensions: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Raise supplementary agreement"
      fields={[hidden("id"), choose("extensionId", "Approved extension", extensions), by("PeriodAgreement.person", "personId", people)]}
      values={{ id }}
      action={raisePeriodAgreement}
      submitLabel="Raise"
      submitBlock={extensions.length ? blocker : "No approved extension."}
      trigger={trig("Raise agreement", true)}
    />
  );
}

// ------------------------------------------------------------------ waivers of damages

export function RecordWaiverDrawer({ id, decisions, people, blocker }: { id: string; decisions: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Ask for a waiver"
      fields={[hidden("id"), choose("decisionId", "Decision", decisions, decisions.length ? undefined : "No decision charging damages."), { kind: "money", name: "waived", label: "Amount waived (RM)", required: true }, { kind: "text", name: "waiverLetterRef", label: "Waiver letter reference" }, { kind: "textarea", name: "reason", label: "Why", required: true }, by("LadWaiver.person", "personId", people)]}
      values={{ id }}
      action={recordLadWaiver}
      submitLabel="Record"
      submitBlock={blocker}
      trigger={trig("Ask for a waiver", false, true)}
    />
  );
}

export function SendWaiverDrawer({ id, waivers, people, blocker }: { id: string; waivers: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send waiver for approval"
      description="Routed by the share of the damages waived."
      fields={[hidden("id"), choose("waiverId", "Waiver", waivers), by("ApprovalInstance.submittedBy", "personId", people)]}
      values={{ id }}
      action={sendLadWaiver}
      submitLabel="Send"
      submitBlock={waivers.length ? blocker : "Nothing to send."}
      trigger={trig("Send for approval", true)}
    />
  );
}

export function ResendWaiverDrawer({ id, waivers, people, blocker }: { id: string; waivers: Option[]; people: Option[]; blocker: string | null }) {
  return (
    <RecordEditor
      title="Send again at the new amount"
      fields={[hidden("id"), choose("waiverId", "Waiver", waivers), by("LadWaiver.person", "personId", people)]}
      values={{ id }}
      action={resendLadWaiver}
      submitLabel="Record again"
      submitBlock={waivers.length ? blocker : "No approved waiver has moved."}
      trigger={trig("Send again", true)}
    />
  );
}
