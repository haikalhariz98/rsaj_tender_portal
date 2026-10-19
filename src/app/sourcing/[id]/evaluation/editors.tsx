import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
import { actorField } from "@/lib/auth/actor-field";
import { bidInSentence } from "@/lib/evaluation/anonymise";
import { CHANNEL_LABEL, DIRECTION_LABEL, SIDE_LABEL } from "@/lib/evaluation/labels";
import { COMMUNICATION_CHANNELS, COMMUNICATION_DIRECTIONS, TEAM_SIDES } from "@/lib/evaluation/types";

import { appointTeamMember, assessAspect, correctPrice, logCommunication, recordInputs, recordScore, recordShortlist, startEvaluation, submitStage } from "./actions";
import { closeMeeting, openMeeting, recordNegotiationDecision, requestNegotiation } from "./meeting-actions";
import { formRecommendation, issueReport, recordProposalSigner, renderProposalPaper } from "./report-actions";
import { tableStageOneMatter } from "./stage-one-actions";

/**
 * The drawers of the Evaluation tab (6.8). Fields are data; every rule is the action's and the pure
 * rules behind it (`src/lib/evaluation`). Where those rules already say an act cannot proceed, the
 * control is disabled with the reason beside it (`read.ts` judges with the rule the action runs). Every
 * act names who records it: recorded on their behalf, not signed. Nothing is sent from here.
 */

type Option = { value: string; label: string };
type Allowed = { allowed: true } | { allowed: false; reason: string };
const hidden = (name: string): Field => ({ kind: "hidden", name });
const secondary = buttonClass("secondary", "sm");
const primary = buttonClass("primary", "sm");
const ghost = buttonClass("ghost", "sm");
/// Who is acting: the signed-in officer, shown and not chosen (Phase 2b). A paper approval may be recorded for the holder, from `ps`.
const by = (slot: string, name: string, ps: Option[], label?: string, dated = false): Field => actorField(slot, { name, people: ps, label, dated });
const block = (a: Allowed) => (a.allowed ? null : a.reason);

// ------------------------------------------------------------------ starting and the team

export function StartEvaluationDrawer({ exerciseId, allowed, people: ps, carried }: { exerciseId: string; allowed: Allowed; people: Option[]; carried: number }) {
  return (
    <RecordEditor
      title="Start the evaluation"
      description={`${carried} ${carried === 1 ? "bid" : "bids"} carried. Score decimals freeze now.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "tokens", name: "implementing", label: "For the implementing department", options: ps, hint: "From the requisition's unit." },
        { kind: "tokens", name: "procurement", label: "For contract and procurement", options: ps, hint: "Nobody sits on both sides." },
        { kind: "date", name: "appointedOn", label: "Appointed on", required: true },
        by("Evaluation.startedBy", "startedByPersonId", ps),
      ]}
      values={{ exerciseId }}
      action={startEvaluation}
      submitLabel="Start"
      submitBlock={block(allowed)}
      trigger={{ label: "Start the evaluation", className: primary }}
      size="lg"
    />
  );
}

export function AppointMemberDrawer({ exerciseId, allowed, people: ps }: { exerciseId: string; allowed: Allowed; people: Option[] }) {
  if (!allowed.allowed) return null;
  return (
    <RecordEditor
      title="Appoint a team member"
      description="Only the stage's side scores or submits."
      fields={[hidden("exerciseId"), { kind: "select", name: "personId", label: "Member", required: true, placeholder: "Choose", options: ps }, { kind: "select", name: "side", label: "Side", required: true, placeholder: "Choose", options: TEAM_SIDES.map((s) => ({ value: s, label: SIDE_LABEL[s] })) }, { kind: "date", name: "appointedOn", label: "Appointed on", required: true }]}
      values={{ exerciseId }}
      action={appointTeamMember}
      submitLabel="Appoint"
      trigger={{ label: "Appoint a member", icon: true, className: secondary }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ bidders: price, inputs

export function CorrectPriceDrawer({ exerciseId, bidder, people: ps }: { exerciseId: string; bidder: { id: string; listingNo: number; asRead: string }; people: Option[] }) {
  return (
    <RecordEditor
      title={`Correct the price of bid No. ${bidder.listingNo}`}
      description={`As read: ${bidder.asRead}. Arithmetic corrections only, before stage one is submitted.`}
      fields={[hidden("exerciseId"), hidden("bidderId"), { kind: "money", name: "correctedPrice", label: "Corrected price", required: true }, { kind: "textarea", name: "correctionReason", label: "Why it is corrected", required: true }, by("EvaluationBidder.correctedBy", "personId", ps)]}
      values={{ exerciseId, bidderId: bidder.id }}
      action={correctPrice}
      submitLabel="Correct"
      trigger={{ label: "Correct price", className: ghost, ariaLabel: `Correct the price of bid No. ${bidder.listingNo}` }}
      size="md"
    />
  );
}

export function InputsDrawer({ exerciseId, bidder, factors, capital, cpr, people: ps }: { exerciseId: string; bidder: { id: string; listingNo: number; raw: Record<string, string> }; factors: Option[]; capital: boolean; cpr: boolean; people: Option[] }) {
  return (
    <RecordEditor
      title={`Record the inputs for bid No. ${bidder.listingNo}`}
      description="Refused once a stage reading them is submitted."
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("bidderId"),
        ...(capital
          ? ([
              { kind: "select", name: "factorOptionCode", label: "Factor option", placeholder: "Not chosen", options: factors },
              { kind: "text", name: "balanceMonth1", label: "Balance, month 1", hint: "In ringgit. Negative if overdrawn." },
              { kind: "text", name: "balanceMonth2", label: "Balance, month 2" },
              { kind: "text", name: "balanceMonth3", label: "Balance, month 3" },
            ] as Field[])
          : []),
        ...(cpr ? ([{ kind: "text", name: "cprPercent", label: "Contractor performance (%)", hint: "From the attached report." }] as Field[]) : []),
        by("EvaluationBidder.inputsRecordedBy", "personId", ps),
      ]}
      values={{ exerciseId, bidderId: bidder.id, ...bidder.raw }}
      action={recordInputs}
      submitLabel="Record"
      trigger={{ label: "Record inputs", className: ghost, ariaLabel: `Record the inputs for bid No. ${bidder.listingNo}` }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ stages

export function ScoreDrawer({ exerciseId, stage, bidder, criteria, people: ps }: { exerciseId: string; stage: { code: string; label: string }; bidder: { id: string; ref: string }; criteria: { code: string; label: string; scale: string; scaleLabel: string; max: string | null }[]; people: Option[] }) {
  const marks = criteria.some((c) => c.scale === "ENTERED_MARKS");
  const pass = criteria.some((c) => c.scale === "PASS_FAIL");
  return (
    <RecordEditor
      title={`Score ${bidInSentence(bidder.ref)} on ${stage.label}`}
      description="Marks above the maximum are refused."
      fields={[
        hidden("exerciseId"),
        hidden("bidderId"),
        hidden("stageCode"),
        { kind: "select", name: "criterionCode", label: "Criterion", required: true, placeholder: "Choose", options: criteria.map((c) => ({ value: c.code, label: `${c.label} (${c.max ? `out of ${c.max}` : c.scaleLabel.toLowerCase()})` })) },
        ...(marks ? ([{ kind: "text", name: "marks", label: "Marks", hint: "Out of the maximum." }] as Field[]) : []),
        ...(pass ? ([{ kind: "select", name: "passed", label: "Pass or fail", placeholder: "Choose", options: [{ value: "yes", label: "Passes" }, { value: "no", label: "Fails" }], hint: "Pass or fail." }] as Field[]) : []),
        { kind: "textarea", name: "note", label: "Note" },
        by("EvaluationScore.scoredBy", "scoredByPersonId", ps),
      ]}
      values={{ exerciseId, bidderId: bidder.id, stageCode: stage.code }}
      action={recordScore}
      submitLabel="Record the score"
      trigger={{ label: "Score", className: ghost, ariaLabel: `Score ${bidInSentence(bidder.ref)} on ${stage.label}` }}
      size="md"
    />
  );
}

export function SubmitStageDrawer({ exerciseId, stage, notBanded, pending, people: ps }: { exerciseId: string; stage: { code: string; label: string }; notBanded: { key: string; label: string }[]; pending: string[]; people: Option[] }) {
  return (
    <RecordEditor
      title={`Submit ${stage.label}`}
      description="Freezes every result. Cannot be undone."
      fields={[hidden("exerciseId"), hidden("stageCode"), ...notBanded.map((n): Field => ({ kind: "textarea", name: `note:${n.key}`, label: n.label, required: true, hint: "For the report." })), by("StageSubmission.submittedBy", "personId", ps)]}
      values={{ exerciseId, stageCode: stage.code }}
      action={submitStage}
      submitLabel="Submit"
      submitBlock={pending.length ? pending.join(" ") : null}
      trigger={{ label: "Submit the stage", className: primary }}
      size="md"
    />
  );
}

export function ShortlistDrawer({ exerciseId, stage, bidders, people: ps }: { exerciseId: string; stage: { code: string; label: string }; bidders: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title={`Record ${stage.label}`}
      description="Bids not chosen leave the running."
      fields={[hidden("exerciseId"), hidden("stageCode"), { kind: "tokens", name: "chosen", label: "Shortlisted", options: bidders }, by("StageSubmission.submittedBy", "personId", ps, "Decided by")]}
      values={{ exerciseId, stageCode: stage.code }}
      action={recordShortlist}
      submitLabel="Record the shortlist"
      trigger={{ label: "Record the shortlist", className: primary }}
      size="md"
    />
  );
}

export function TableStageOneDrawer({ exerciseId, bidder, sittings, people: ps, again = false }: { exerciseId: string; bidder: { id: string; ref: string }; sittings: Option[]; people: Option[]; again?: boolean }) {
  return (
    <RecordEditor
      title={`Table ${bidInSentence(bidder.ref)}'s first stage${again ? " again" : ""}`}
      description={again ? "Deferred. Table it at a sitting." : "The committee decides at its sitting."}
      fields={[hidden("exerciseId"), hidden("bidderId"), { kind: "select", name: "meetingId", label: "Sitting", required: true, placeholder: sittings.length ? "Choose" : "No open sitting", options: sittings }, by("CommitteeDecision.tabledBy", "tabledByPersonId", ps)]}
      values={{ exerciseId, bidderId: bidder.id }}
      action={tableStageOneMatter}
      submitLabel="Table"
      trigger={{ label: again ? "Table again" : "Table", className: ghost, ariaLabel: `Table ${bidInSentence(bidder.ref)}'s first stage${again ? " again" : ""}` }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ aspects

export function AssessDrawer({ exerciseId, bidder, aspect, suggestion, people: ps }: { exerciseId: string; bidder: { id: string; listingNo: number }; aspect: { code: string; label: string }; suggestion: { verdict: string | null; narrative: string; guide?: string | null }; people: Option[] }) {
  return (
    <RecordEditor
      title={`${aspect.label}: bid No. ${bidder.listingNo}`}
      description={suggestion.guide ? `${suggestion.guide} SULIT: keep out of the narrative.` : undefined}
      fields={[hidden("exerciseId"), hidden("bidderId"), hidden("aspectCode"), { kind: "select", name: "verdict", label: "Verdict", required: true, placeholder: "Choose", options: [{ value: "SATISFACTORY", label: "Satisfactory" }, { value: "NOT_SATISFACTORY", label: "Not satisfactory" }] }, { kind: "textarea", name: "narrative", label: "Narrative", required: true }, by("AspectAssessment.assessedBy", "personId", ps)]}
      values={{ exerciseId, bidderId: bidder.id, aspectCode: aspect.code, verdict: suggestion.verdict, narrative: suggestion.narrative }}
      action={assessAspect}
      submitLabel="Record"
      trigger={{ label: aspect.label, className: ghost, ariaLabel: `Assess ${aspect.label} for bid No. ${bidder.listingNo}` }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ meetings, negotiations, letters

export function OpenMeetingDrawer({ exerciseId, bidders, people: ps, allowed }: { exerciseId: string; bidders: Option[]; people: Option[]; allowed: Allowed }) {
  return (
    <RecordEditor
      title="Record a meeting held"
      description="A negotiation needs approval and a bid in the running."
      columns={2}
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "select", name: "kind", label: "Meeting", required: true, placeholder: "Choose", options: [{ value: "CLARIFICATION", label: "Clarification" }, { value: "NEGOTIATION", label: "Negotiation" }] }, { kind: "date", name: "heldOn", label: "Held on", required: true }, { kind: "text", name: "place", label: "Where", required: true }, by("EvaluationMeeting.openedBy", "personId", ps)]}
      values={{ exerciseId }}
      action={openMeeting}
      submitLabel="Record"
      submitBlock={block(allowed)}
      trigger={{ label: "Record a meeting", icon: true, className: secondary }}
      size="lg"
    />
  );
}

export function CloseMeetingDrawer({ exerciseId, meeting, people: ps }: { exerciseId: string; meeting: { id: string; label: string; isNegotiation: boolean }; people: Option[] }) {
  return (
    <RecordEditor
      title={`Close ${meeting.label}`}
      description="Attach the tenderer's confirmation first. Closed is frozen."
      columns={meeting.isNegotiation ? 2 : 1}
      fields={[hidden("exerciseId"), hidden("meetingId"), { kind: "textarea", name: "minutes", label: "Minutes", required: true }, ...(meeting.isNegotiation ? ([{ kind: "money", name: "priceBefore", label: "Price before the round", required: true }, { kind: "money", name: "priceAfter", label: "Price after the round", required: true }] as Field[]) : []), by("EvaluationMeeting.closedBy", "personId", ps)]}
      values={{ exerciseId, meetingId: meeting.id }}
      action={closeMeeting}
      submitLabel="Close"
      trigger={{ label: "Close", className: ghost, ariaLabel: `Close ${meeting.label}` }}
      size="md"
    />
  );
}

export function RequestNegotiationDrawer({ exerciseId, bidders, people: ps, allowed }: { exerciseId: string; bidders: Option[]; people: Option[]; allowed: Allowed }) {
  return (
    <RecordEditor
      title="Ask for a negotiation"
      description="Routed by the approval matrix."
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "textarea", name: "reason", label: "Why a negotiation is needed", required: true }, by("NegotiationRequest.requestedBy", "personId", ps)]}
      values={{ exerciseId }}
      action={requestNegotiation}
      submitLabel="Ask"
      submitBlock={block(allowed)}
      trigger={{ label: "Ask for a negotiation", className: secondary }}
      size="md"
    />
  );
}

export function NegotiationDecisionDrawer({ exerciseId, stepId, office, people: ps, today }: { exerciseId: string; stepId: string; office: string; people: Option[]; today: string | null }) {
  return (
    <RecordEditor
      title={`Decision of ${office}`}
      description="Holder or delegate on the day."
      fields={[hidden("exerciseId"), hidden("stepId"), { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: "Approved" }, { value: "REJECTED", label: "Refused" }] }, by("ApprovalStep.decidedBy", "personId", ps, undefined, true), { kind: "date", name: "decidedOn", label: "Decided on", required: true }, { kind: "textarea", name: "reason", label: "Reason", hint: "Required when refused." }]}
      values={{ exerciseId, stepId, decidedOn: today }}
      action={recordNegotiationDecision}
      submitLabel="Record"
      trigger={{ label: "Record decision", className: ghost, ariaLabel: `Record the decision of ${office}` }}
      size="md"
    />
  );
}

export function LogCommunicationDrawer({ exerciseId, bidders, people: ps, allowed }: { exerciseId: string; bidders: Option[]; people: Option[]; allowed: Allowed }) {
  return (
    <RecordEditor
      title="Record a letter, email or fax"
      description="Recorded only. Nothing is sent."
      columns={2}
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "select", name: "direction", label: "Direction", required: true, placeholder: "Choose", options: COMMUNICATION_DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] })) }, { kind: "select", name: "channel", label: "By", required: true, placeholder: "Choose", options: COMMUNICATION_CHANNELS.map((d) => ({ value: d, label: CHANNEL_LABEL[d] })) }, { kind: "date", name: "on", label: "Sent or received on", required: true }, { kind: "text", name: "subject", label: "Subject", required: true }, { kind: "textarea", name: "content", label: "What it says", required: true }, by("TendererCommunication.recordedBy", "personId", ps)]}
      values={{ exerciseId }}
      action={logCommunication}
      submitLabel="Record"
      submitBlock={block(allowed)}
      trigger={{ label: "Record a letter", icon: true, className: secondary }}
      size="lg"
    />
  );
}

// ------------------------------------------------------------------ the recommendation, the report, the paper

export function RecommendDrawer({ exerciseId, bidders, topId, allowed, people: ps }: { exerciseId: string; bidders: Option[]; topId: string | null; allowed: Allowed; people: Option[] }) {
  return (
    <RecordEditor
      title="Form the recommendation"
      description="Another than the top-ranked needs a justification."
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Recommended tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "textarea", name: "justification", label: "Why this one", hint: "Required where it is not the top-ranked." }, by("Recommendation.formedBy", "personId", ps)]}
      values={{ exerciseId, bidderId: topId }}
      action={formRecommendation}
      submitLabel="Form"
      submitBlock={block(allowed)}
      trigger={{ label: "Form the recommendation", className: primary }}
      size="md"
    />
  );
}

export function IssueReportDrawer({ exerciseId, allowed, people: ps }: { exerciseId: string; allowed: Allowed; people: Option[] }) {
  return (
    <RecordEditor
      title="Issue the report"
      description="Freezes the report. Cannot be undone."
      fields={[hidden("exerciseId"), by("Evaluation.issuedBy", "personId", ps)]}
      values={{ exerciseId }}
      action={issueReport}
      submitLabel="Issue"
      submitBlock={block(allowed)}
      trigger={{ label: "Issue the report", className: primary }}
      size="md"
    />
  );
}

export function RenderProposalDrawer({ exerciseId, allowed, people: ps }: { exerciseId: string; allowed: Allowed; people: Option[] }) {
  return (
    <RecordEditor
      title="Produce the proposal paper"
      description="Freezes the paper. Cannot be undone."
      fields={[hidden("exerciseId"), by("ProposalPaper.renderedBy", "personId", ps)]}
      values={{ exerciseId }}
      action={renderProposalPaper}
      submitLabel="Produce"
      submitBlock={block(allowed)}
      trigger={{ label: "Produce proposal paper", className: primary }}
      size="md"
    />
  );
}

export function ProposalSignerDrawer({ exerciseId, role, office, people: ps, today }: { exerciseId: string; role: "CHECKER" | "RECOMMENDER"; office: string; people: Option[]; today: string | null }) {
  const what = role === "CHECKER" ? "checked" : "recommended";
  return (
    <RecordEditor
      title={`Record who ${what} it`}
      description={`Holder of ${office} on the day. Checker and recommender must differ.`}
      fields={[hidden("exerciseId"), hidden("role"), by(role === "CHECKER" ? "ProposalPaper.checkedBy" : "ProposalPaper.recommendedBy", "personId", ps), { kind: "date", name: "signedOn", label: "On", required: true }]}
      values={{ exerciseId, role, signedOn: today }}
      action={recordProposalSigner}
      submitLabel="Record"
      trigger={{ label: role === "CHECKER" ? "Record the checker" : "Record the recommender", className: secondary }}
      size="md"
    />
  );
}
