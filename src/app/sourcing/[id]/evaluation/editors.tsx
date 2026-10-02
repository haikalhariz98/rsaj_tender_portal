import { RecordEditor, type Field } from "@/components/record-editor";
import { buttonClass } from "@/components/ui/button";
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
const ON_BEHALF = "Recorded on their behalf, not signed.";
const who = (name: string, label = "Recorded by", required = true): Field => ({ kind: "select", name, label, required, placeholder: "Choose", options: [], hint: ON_BEHALF });
const people = (f: Field, options: Option[]): Field => (f.kind === "select" ? { ...f, options } : f);
const block = (a: Allowed) => (a.allowed ? null : a.reason);

// ------------------------------------------------------------------ starting and the team

export function StartEvaluationDrawer({ exerciseId, allowed, people: ps, carried }: { exerciseId: string; allowed: Allowed; people: Option[]; carried: number }) {
  return (
    <RecordEditor
      title="Start the evaluation"
      description={`The ${carried} ${carried === 1 ? "bid" : "bids"} the opening carried become its bidders; a quotation's bid above the exercise's ceiling is excluded with the reason. The team is appointed on both sides; the places a score is judged at are frozen now. The exercise is then Under evaluation.`}
      columns={2}
      fields={[
        hidden("exerciseId"),
        { kind: "tokens", name: "implementing", label: "For the implementing department", options: ps, hint: "Of the requisition's unit or a unit under it." },
        { kind: "tokens", name: "procurement", label: "For contract and procurement", options: ps, hint: "Nobody sits on both sides." },
        { kind: "date", name: "appointedOn", label: "Appointed on", required: true },
        people(who("startedByPersonId", "Started by"), ps),
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
      description="A further member on one side, while the version is open. Only a member appointed to a stage's side scores or submits it."
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
      description={`As read at the opening: ${bidder.asRead}. An arithmetic correction, with its reason, only before the first stage is submitted. The ceiling is judged again on the corrected price.`}
      fields={[hidden("exerciseId"), hidden("bidderId"), { kind: "money", name: "correctedPrice", label: "Corrected price", required: true }, { kind: "textarea", name: "correctionReason", label: "Why it is corrected", required: true }, people(who("personId"), ps)]}
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
      description="What the computed criteria read: the factor option and the three monthly balances for the minimum capital, and the contractor performance percentage from its attached report. Refused once a stage reading them is submitted."
      columns={2}
      fields={[
        hidden("exerciseId"),
        hidden("bidderId"),
        ...(capital
          ? ([
              { kind: "select", name: "factorOptionCode", label: "Factor option", placeholder: "Not chosen", options: factors },
              { kind: "text", name: "balanceMonth1", label: "Balance, month 1", hint: "In ringgit; below nothing where overdrawn." },
              { kind: "text", name: "balanceMonth2", label: "Balance, month 2" },
              { kind: "text", name: "balanceMonth3", label: "Balance, month 3" },
            ] as Field[])
          : []),
        ...(cpr ? ([{ kind: "text", name: "cprPercent", label: "Contractor performance (%)", hint: "From the report attached to the bid, not from a register." }] as Field[]) : []),
        people(who("personId"), ps),
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

export function ScoreDrawer({ exerciseId, stage, bidder, criteria, people: ps }: { exerciseId: string; stage: { code: string; label: string }; bidder: { id: string; listingNo: number }; criteria: { code: string; label: string; scale: string; scaleLabel: string; max: string | null }[]; people: Option[] }) {
  const marks = criteria.some((c) => c.scale === "ENTERED_MARKS");
  const pass = criteria.some((c) => c.scale === "PASS_FAIL");
  return (
    <RecordEditor
      title={`Score bid No. ${bidder.listingNo} on ${stage.label}`}
      description="One criterion at a time; a rescore is kept beside the earlier score. Marks above a criterion's maximum are refused, never capped."
      fields={[
        hidden("exerciseId"),
        hidden("bidderId"),
        hidden("stageCode"),
        { kind: "select", name: "criterionCode", label: "Criterion", required: true, placeholder: "Choose", options: criteria.map((c) => ({ value: c.code, label: `${c.label} (${c.max ? `out of ${c.max}` : c.scaleLabel.toLowerCase()})` })) },
        ...(marks ? ([{ kind: "text", name: "marks", label: "Marks", hint: "For a criterion marked out of a maximum." }] as Field[]) : []),
        ...(pass ? ([{ kind: "select", name: "passed", label: "Pass or fail", placeholder: "Choose", options: [{ value: "yes", label: "Passes" }, { value: "no", label: "Fails" }], hint: "For a criterion passed or failed." }] as Field[]) : []),
        { kind: "textarea", name: "note", label: "Note" },
        people(who("scoredByPersonId", "Scored by"), ps),
      ]}
      values={{ exerciseId, bidderId: bidder.id, stageCode: stage.code }}
      action={recordScore}
      submitLabel="Record the score"
      trigger={{ label: "Score", className: ghost, ariaLabel: `Score bid No. ${bidder.listingNo} on ${stage.label}` }}
      size="md"
    />
  );
}

export function SubmitStageDrawer({ exerciseId, stage, notBanded, pending, people: ps }: { exerciseId: string; stage: { code: string; label: string }; notBanded: { key: string; label: string }[]; pending: string[]; people: Option[] }) {
  return (
    <RecordEditor
      title={`Submit ${stage.label}`}
      description="Every bid in the running is computed and its result frozen with the submission, by a member on the stage's side. A value no band holds is submitted with the evaluator's note."
      fields={[hidden("exerciseId"), hidden("stageCode"), ...notBanded.map((n): Field => ({ kind: "textarea", name: `note:${n.key}`, label: n.label, required: true, hint: "Why it is so, for the report." })), people(who("personId", "Submitted by"), ps)]}
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
      description="The bids chosen among those in the running, under the stage's rule. Those not chosen go out of the running."
      fields={[hidden("exerciseId"), hidden("stageCode"), { kind: "tokens", name: "chosen", label: "Shortlisted", options: bidders }, people(who("personId", "Decided by"), ps)]}
      values={{ exerciseId, stageCode: stage.code }}
      action={recordShortlist}
      submitLabel="Record the shortlist"
      trigger={{ label: "Record the shortlist", className: primary }}
      size="md"
    />
  );
}

export function TableStageOneDrawer({ exerciseId, bidder, sittings, people: ps }: { exerciseId: string; bidder: { id: string; listingNo: number }; sittings: Option[]; people: Option[] }) {
  return (
    <RecordEditor
      title={`Table bid No. ${bidder.listingNo}'s first stage`}
      description="The committee decides each bid's first stage at its sitting; the decision there is the act. Tabled on the Secretariat holder's behalf."
      fields={[hidden("exerciseId"), hidden("bidderId"), { kind: "select", name: "meetingId", label: "Sitting", required: true, placeholder: sittings.length ? "Choose" : "No sitting of the committee is open", options: sittings }, people(who("tabledByPersonId", "Tabled by"), ps)]}
      values={{ exerciseId, bidderId: bidder.id }}
      action={tableStageOneMatter}
      submitLabel="Table"
      trigger={{ label: "Table", className: ghost, ariaLabel: `Table bid No. ${bidder.listingNo}'s first stage` }}
      size="md"
    />
  );
}

// ------------------------------------------------------------------ aspects

export function AssessDrawer({ exerciseId, bidder, aspect, suggestion, people: ps }: { exerciseId: string; bidder: { id: string; listingNo: number }; aspect: { code: string; label: string }; suggestion: { verdict: string | null; narrative: string }; people: Option[] }) {
  return (
    <RecordEditor
      title={`${aspect.label}: bid No. ${bidder.listingNo}`}
      description="A verdict and a narrative. What the opening found, or what the figures show, is offered to start from; it is recorded only when saved. A reassessment is kept beside the earlier one."
      fields={[hidden("exerciseId"), hidden("bidderId"), hidden("aspectCode"), { kind: "select", name: "verdict", label: "Verdict", required: true, placeholder: "Choose", options: [{ value: "SATISFACTORY", label: "Satisfactory" }, { value: "NOT_SATISFACTORY", label: "Not satisfactory" }] }, { kind: "textarea", name: "narrative", label: "Narrative", required: true }, people(who("personId", "Assessed by"), ps)]}
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
      description="A clarification with any bid in the running, as often as needed; a negotiation only once its approval is recorded. Close it on its minutes once the tenderer's written confirmation is attached."
      columns={2}
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "select", name: "kind", label: "Meeting", required: true, placeholder: "Choose", options: [{ value: "CLARIFICATION", label: "Clarification" }, { value: "NEGOTIATION", label: "Negotiation" }] }, { kind: "date", name: "heldOn", label: "Held on", required: true }, { kind: "text", name: "place", label: "Where", required: true }, people(who("personId"), ps)]}
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
      description={meeting.isNegotiation ? "On its minutes, the tenderer's written confirmation attached, and the price before and after the round. Closed, it is frozen." : "On its minutes, the tenderer's written confirmation attached. Closed, it is frozen."}
      columns={meeting.isNegotiation ? 2 : 1}
      fields={[hidden("exerciseId"), hidden("meetingId"), { kind: "textarea", name: "minutes", label: "Minutes", required: true }, ...(meeting.isNegotiation ? ([{ kind: "money", name: "priceBefore", label: "Price before the round", required: true }, { kind: "money", name: "priceAfter", label: "Price after the round", required: true }] as Field[]) : []), people(who("personId", "Closed by"), ps)]}
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
      description="The route is resolved from your approval matrix's rules for a negotiation; none ships. Refused, the negotiation is not held, and may be asked for again."
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "textarea", name: "reason", label: "Why a negotiation is needed", required: true }, people(who("personId", "Asked by"), ps)]}
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
      description="Recorded on the decider's behalf, not signed: the office's holder or delegate on the day."
      fields={[hidden("exerciseId"), hidden("stepId"), { kind: "select", name: "decision", label: "Decision", required: true, placeholder: "Choose", options: [{ value: "DONE", label: "Approved" }, { value: "REJECTED", label: "Refused" }] }, { kind: "select", name: "personId", label: "Decided by", required: true, placeholder: "Choose", options: ps }, { kind: "date", name: "decidedOn", label: "Decided on", required: true }, { kind: "textarea", name: "reason", label: "Reason", hint: "Required when refused." }]}
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
      description="A written communication with a tenderer, recorded, never sent from here. Attach the letter itself to the tenderer's record."
      columns={2}
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "select", name: "direction", label: "Direction", required: true, placeholder: "Choose", options: COMMUNICATION_DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_LABEL[d] })) }, { kind: "select", name: "channel", label: "By", required: true, placeholder: "Choose", options: COMMUNICATION_CHANNELS.map((d) => ({ value: d, label: CHANNEL_LABEL[d] })) }, { kind: "date", name: "on", label: "Sent or received on", required: true }, { kind: "text", name: "subject", label: "Subject", required: true }, { kind: "textarea", name: "content", label: "What it says", required: true }, people(who("personId"), ps)]}
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
      description="A bid in the running after every stage. Recommending another than the top-ranked needs its justification. Its price is the one after negotiation where one was held."
      fields={[hidden("exerciseId"), { kind: "select", name: "bidderId", label: "Recommended tenderer", required: true, placeholder: "Choose", options: bidders }, { kind: "textarea", name: "justification", label: "Why this one", hint: "Required where it is not the top-ranked." }, people(who("personId", "Formed by"), ps)]}
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
      description="Its reference is drawn from the configured series and its text from the configured template; annexes A to F are frozen with it. It is never edited: a later version supersedes it. The exercise is then Evaluated."
      fields={[hidden("exerciseId"), people(who("personId", "Issued by"), ps)]}
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
      title="Produce the Kertas Cadangan"
      description="From the issued report, through the configured template, frozen. Its checking and its recommending officers are then recorded: the offices' holders on the day, two different people."
      fields={[hidden("exerciseId"), people(who("personId", "Produced by"), ps)]}
      values={{ exerciseId }}
      action={renderProposalPaper}
      submitLabel="Produce"
      submitBlock={block(allowed)}
      trigger={{ label: "Produce the Kertas Cadangan", className: primary }}
      size="md"
    />
  );
}

export function ProposalSignerDrawer({ exerciseId, role, office, people: ps, today }: { exerciseId: string; role: "CHECKER" | "RECOMMENDER"; office: string; people: Option[]; today: string | null }) {
  const what = role === "CHECKER" ? "checked" : "recommended";
  return (
    <RecordEditor
      title={`Record who ${what} it`}
      description={`The holder of ${office} on the day; recorded on their behalf, not signed. The checking and the recommending officers are two different people.`}
      fields={[hidden("exerciseId"), hidden("role"), { kind: "select", name: "personId", label: role === "CHECKER" ? "Checked by" : "Recommended by", required: true, placeholder: "Choose", options: ps }, { kind: "date", name: "signedOn", label: "On", required: true }]}
      values={{ exerciseId, role, signedOn: today }}
      action={recordProposalSigner}
      submitLabel="Record"
      trigger={{ label: role === "CHECKER" ? "Record the checker" : "Record the recommender", className: secondary }}
      size="md"
    />
  );
}
