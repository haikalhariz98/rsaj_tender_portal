/**
 * Every word evaluation puts on a screen: enum labels and the text of every finding. Codes never reach
 * a screen (AGENTS.md rule 5): a screen renders `evaluationFindingText`, never `f.code`. Every refusal
 * names what to do, or where the setting is; a rule frozen unset never says "set it" — it names this
 * exercise's real exit. Never a score, a price or the estimate: findings carry no figure (E-3).
 */

import type { Finding, AspectKind, AspectVerdict, BandOutcome, CapitalBase, CommunicationChannel, CommunicationDirection, ComputedInput, CriterionScale, EvaluationRoute, EvaluationState, EvaluationTrigger, MeetingKind, ModelStatus, ShortlistRule, Side, StageKind } from "./types";
import type { EvaluationPhase } from "./state";
import type { RunningState } from "./stages";
import { formatDate } from "@/lib/format";

import { CONFIG_TEXT } from "./config";

/// Where each setting an evaluation reads is kept.
export const SETTING_AT = {
  models: "Configuration › Evaluation models",
  policy: "Configuration › Evaluation models › Policy",
  aspects: "Configuration › Evaluation models › Aspects",
  bases: "Configuration › Evaluation models › Contract bases",
  matrix: "Configuration › Approval matrix",
  numbering: "Configuration › Numbering",
  templates: "Configuration › Templates",
  users: "Configuration › Users",
  organisation: "Configuration › Organisation",
} as const;

/// The exit for an exercise whose frozen rule can never be met (6.7 C-9 precedent; E-1).
const CANCEL_EXIT = "cancel it from Tender documents › Publishing and republish";

export const ROUTE_LABEL: Readonly<Record<EvaluationRoute, string>> = { TRADITIONAL: "Traditional", TWO_STAGE: "Two-stage" };
export const STAGE_KIND_LABEL: Readonly<Record<StageKind, string>> = {
  CHECKLIST: "Checklist",
  SHORTLIST: "Shortlist",
  SCORED: "Scored",
  ASPECTS: "Aspects",
  FINANCIAL_TEST: "Financial test",
  COMMERCIAL: "Commercial",
  COMPOSITE: "Composite",
  COMMITTEE_DECISION: "Committee decision",
  RECOMMENDATION: "Recommendation",
};
export const SIDE_LABEL: Readonly<Record<Side, string>> = { IMPLEMENTING_DEPARTMENT: "Implementing department", CONTRACT_PROCUREMENT: "Contract and procurement", COMMITTEE: "The committee" };
export const SCALE_LABEL: Readonly<Record<CriterionScale, string>> = { ENTERED_MARKS: "Marks entered", PASS_FAIL: "Pass or fail", BANDED: "Banded" };
export const INPUT_LABEL: Readonly<Record<ComputedInput, string>> = {
  NONE: "None",
  MIN_CAPITAL_RATIO: "Minimum capital ratio",
  VARIANCE_VS_ESTIMATE: "Against the company estimate",
  VARIANCE_VS_LOWEST: "Against the lowest price",
  CPR_PERCENT: "Contractor performance (CPR)",
};
export const CAPITAL_BASE_LABEL: Readonly<Record<CapitalBase, string>> = { TENDER_AMOUNT: "The tender amount", COMPANY_ESTIMATE: "The company estimate" };
export const SHORTLIST_RULE_LABEL: Readonly<Record<ShortlistRule, string>> = { COUNT_RANGE: "A number between a minimum and a maximum", DECIDED_BY_OFFICE: "Decided by an office's holder", NONE: "Every bidder in the running goes on" };
export const MODEL_STATUS_LABEL: Readonly<Record<ModelStatus, string>> = { DRAFT: "Draft", ISSUED: "Issued", RETIRED: "Retired" };
export const MODEL_STATUS_TONE: Readonly<Record<ModelStatus, "neutral" | "ok" | "warn">> = { DRAFT: "warn", ISSUED: "ok", RETIRED: "neutral" };
export const ASPECT_KIND_LABEL: Readonly<Record<AspectKind, string>> = {
  COMPLETENESS: "(a) Completeness",
  PRICE_VS_ESTIMATE: "(b) The price against the estimate",
  COMPLETION_PERIOD: "(c) The completion period",
  CAPABILITY: "(d) Capability",
  OTHER: "Other",
};
export const VERDICT_LABEL: Readonly<Record<AspectVerdict, string>> = { SATISFACTORY: "Satisfactory", NOT_SATISFACTORY: "Not satisfactory" };
export const VERDICT_TONE: Readonly<Record<AspectVerdict, "ok" | "err">> = { SATISFACTORY: "ok", NOT_SATISFACTORY: "err" };
export const OUTCOME_LABEL: Readonly<Record<BandOutcome, string>> = { PASS: "Passes", FAIL: "Fails", NONE: "Shown only" };
/// A band set's rounding before banding: its places (the column allows 0 to 4; 4 is the figure as worked out, so it is not offered).
export const ROUND_PLACES = ["0", "1", "2", "3"] as const;
export const roundedWords = (p: number | null | undefined): string => (p == null ? "Not rounded" : p === 0 ? "To a whole number" : `To ${p} decimal place${p === 1 ? "" : "s"}`);
export const MEETING_KIND_LABEL: Readonly<Record<MeetingKind, string>> = { CLARIFICATION: "Clarification", NEGOTIATION: "Negotiation" };
export const STATE_LABEL: Readonly<Record<EvaluationState, string>> = { OPEN: "In progress", ISSUED: "Report issued", SUPERSEDED: "Superseded", CANCELLED: "Closed: cancelled" };
export const STATE_TONE: Readonly<Record<EvaluationState, "brand" | "ok" | "neutral">> = { OPEN: "brand", ISSUED: "ok", SUPERSEDED: "neutral", CANCELLED: "neutral" };
export const TRIGGER_LABEL: Readonly<Record<EvaluationTrigger, string>> = { START: "Started after the opening", LOOP: "Reopened by the committee", SUPPLEMENTARY_OPENING: "Reopened for a late tender" };
export const DIRECTION_LABEL: Readonly<Record<CommunicationDirection, string>> = { TO_TENDERER: "To the tenderer", FROM_TENDERER: "From the tenderer" };
export const CHANNEL_LABEL: Readonly<Record<CommunicationChannel, string>> = { LETTER: "Letter", EMAIL: "Email", FAX: "Fax" };
export const RUNNING_LABEL: Readonly<Record<RunningState, string>> = { IN: "In the running", EXCLUDED: "Excluded above the ceiling", OUT: "Out of the running", AWAITING_STAGE_ONE: "Awaiting the committee" };
export const PHASE_LABEL: Readonly<Record<EvaluationPhase, string>> = {
  NOT_STARTED: "Not started",
  UNDER_EVALUATION: "Under evaluation",
  CLARIFICATION: "Clarification",
  NEGOTIATION: "Negotiation",
  EVALUATED: "Evaluated",
  PENDING_COMMITTEE: "Pending committee",
  APPROVED: "Approved",
  NOT_APPROVED: "Not approved",
  CANCELLED: "Cancelled",
};
export const PHASE_TONE: Readonly<Record<EvaluationPhase, "brand" | "ok" | "warn" | "err" | "neutral" | "info">> = {
  NOT_STARTED: "neutral",
  UNDER_EVALUATION: "brand",
  CLARIFICATION: "info",
  NEGOTIATION: "info",
  EVALUATED: "ok",
  PENDING_COMMITTEE: "warn",
  APPROVED: "ok",
  NOT_APPROVED: "err",
  CANCELLED: "neutral",
};

/// What the evaluation's figures and records are (E-3, FR-EVL-014): said at the head of the tab.
export const EVALUATION_STATEMENT = {
  title: "Evaluation records are SULIT",
  body: "Read only by the evaluation team, the people named on the exercise and the roles the organisation chose. Every reading and download is logged. Kept off lists, the dashboard and search.",
};

const side = (d: Finding["data"]) => (d?.side ? SIDE_LABEL[d.side as Side]?.toLowerCase() : null) ?? "that side";
/// `bidRef`: how the screen calls the bid where it is not by its listing number (an anonymised stage: "Bidder 3", FR-EVL-020), which then stands in the sentence.
const bid = (d: Finding["data"]) => (d?.bidRef ? String(d.bidRef) : d?.listingNo != null ? `bid No. ${d.listingNo}` : "a bid");
const plural = (n: unknown, one: string, many: string) => (n === 1 ? one : many);

const TEXT: Record<string, (f: Finding) => string> = {
  // ---- Configuration's own refusals (config.ts), in its words
  ...Object.fromEntries(Object.entries(CONFIG_TEXT).map(([k, t]) => [k, () => t])),
  // ---- acts on a version (state.ts)
  CANCELLED: () => "Cancelled. Nothing more is recorded.",
  NOT_STARTED: () => "Evaluation not started. Start it on Overview.",
  REPORT_ISSUED: () => "Report issued. Changes need a new evaluation version.",
  VERSION_SUPERSEDED: () => "Superseded. Record it on the version in force.",
  VERSION_CANCELLED: () => "Closed: the exercise was cancelled.",
  REPORT_NOT_ISSUED: () => "Report not issued. Issue it on Report first.",
  // ---- starting (start.ts)
  ALREADY_STARTED: () => "Already started.",
  NOT_OPENED: () => "Starts once the main opening is finalised.",
  NOT_THROUGH_WINDOW: () => "Not published through its window. Not evaluated here.",
  MODEL_NOT_PINNED: () => `No pinned model, none to come: ${CANCEL_EXIT}.`,
  OPENING_NOT_FINALISED: () => "Opening not finalised. Finalise it on Bids and opening.",
  SIGNED_SCHEDULE_NOT_ATTACHED: (f) => `${f.data?.supplementary ? `Supplementary opening ${f.data.supplementary}'s` : "The opening's"} signed schedule scan is not attached. Attach it on Schedule.`,
  ESTIMATE_COPY_UNEXPLAINED: () => "Estimate paper copy unexplained. Explain it on Schedule.",
  SUPPLEMENTARY_IN_PROGRESS: (f) => `${f.data?.supplementary ? `Supplementary opening ${f.data.supplementary}` : "A supplementary opening"} is under way. Finalise it first.`,
  DECIMALS_NOT_SET: () => `Score decimal places not set. Set them under ${SETTING_AT.policy}.`,
  BOUNDARY_NOT_RECORDED: () => `Quotation ceiling never recorded. Bids above it cannot be told apart: ${CANCEL_EXIT}.`,
  NOTHING_CARRIED: () => "No bid carried to evaluation. Cancel it from Tender documents › Publishing.",
  TIME_ZONE_NOT_SET: () => `Time zone not set. Set it under ${SETTING_AT.organisation}.`,
  PERSON_REQUIRED: () => "Choose who records it.",
  // ---- the team (team.ts)
  SIDE_NOT_STAFFED: (f) => `Nobody appointed for ${side(f.data)}. Appoint on Overview.`,
  PERSON_ON_BOTH_SIDES: (f) => `${f.data?.person ?? "A person"} is on both sides. Each side needs a different person.`,
  PERSON_NOT_ACTIVE: (f) => `${f.data?.person ?? "A person"} is not active.`,
  ALREADY_ON_TEAM: (f) => `${f.data?.person ?? "That person"} is already on the team.`,
  UNIT_NOT_IMPLEMENTING: (f) => `${f.data?.person ?? "A person"} is not in the implementing department. Pick another, or correct their unit under ${SETTING_AT.users}.`,
  UNIT_NOT_RECORDED: (f) => `${f.data?.person ?? "A person"}'s unit is not recorded. Department not checked.`,
  NOT_ON_TEAM: (f) => `${f.data?.person ? `${f.data.person} is` : "That person is"} not appointed for ${side(f.data)}. Only that side scores or submits.`,
  SAME_PERSON_BOTH_SIDES: (f) => `${f.data?.person ?? "That person"} submitted for the other side. Nobody submits for both.`,
  // ---- scoring and stages (score.ts, stages.ts)
  ABOVE_MAX: (f) => `Score above the maximum${f.data?.criterion ? ` (${f.data.criterion})` : ""}. Enter it again.`,
  NEGATIVE: () => "A score cannot be negative.",
  PASS_RULE_NOT_SET: () => `Pass-mark boundary not set in the model: ${CANCEL_EXIT}.`,
  STAGE_SUBMITTED: (f) => `${f.data?.stage ?? "The stage"} is submitted. Changes need a new evaluation version.`,
  STAGE_LOCKED: (f) => `${f.data?.stage ?? "This stage"} waits for ${f.data?.waitsFor ?? "the stage before it"} to be submitted.`,
  NOT_IN_RUNNING: (f) => (f.data?.stage ? `${bid(f.data)} went out of the running at ${f.data.stage}.` : "That bid is not in the running."),
  EXCLUDED_ABOVE_CEILING: (f) => `${bid(f.data)} is above the quotation ceiling and excluded.`,
  STAGE_ONE_UNDECIDED: (f) => `The committee has not decided ${bid(f.data)} at ${f.data?.stage ?? "the first stage"}. Table it from Stages.`,
  NOT_A_SCORED_CRITERION: () => "Not scored by hand: computed, or a group.",
  WRONG_SCALE: (f) => `${f.data?.criterion ?? "That criterion"} uses the model's scale: marks, or pass and fail.`,
  SCORE_MISSING: (f) => `${bid(f.data)} has no score on ${f.data?.criterion ?? "a criterion"}.`,
  ASPECT_UNASSESSED: (f) => `${bid(f.data)} is not assessed on ${f.data?.aspect ?? "an aspect"}.`,
  SHORTLIST_NOT_RECORDED: (f) => `Whether ${bid(f.data)} is shortlisted is not recorded.`,
  PART_NOT_SUBMITTED: (f) => `The composite waits for ${f.data?.stage ?? "a stage"} to be submitted.`,
  ALREADY_SUBMITTED: (f) => `${f.data?.stage ?? "The stage"} is already submitted.`,
  EARLIER_NOT_SUBMITTED: (f) => `${f.data?.stage ?? "An earlier stage"} is not submitted. Submit in order.`,
  SUBMITTED_BY_ITS_ACT: (f) => `${f.data?.stage ?? "This stage"} is recorded by its own act, not submitted.`,
  NOT_BANDED_NOTE_REQUIRED: (f) => `${bid(f.data)}'s ${f.data?.criterion ?? "value"} falls in no band. Record the evaluators' note.`,
  FACTOR_NOT_CHOSEN: (f) => `Factor for ${bid(f.data)} not chosen. Record it with the inputs.`,
  BALANCES_NOT_ENTERED: (f) => `${bid(f.data)}'s three monthly balances are not all entered.`,
  ESTIMATE_SEALED: () => "Estimate still sealed. Nothing computed against it.",
  ESTIMATE_NOT_AVAILABLE: () => "No company estimate. Record the evaluators' finding in the aspects.",
  BASE_NOT_SET: () => `Minimum-capital base not set: ${CANCEL_EXIT}.`,
  BASE_ZERO: () => "The base is nothing. No percentage can be stated.",
  CPR_NOT_ENTERED: (f) => `${bid(f.data)}'s contractor performance percentage is not entered. Enter it from its report.`,
  CPR_EVIDENCE_REQUIRED: (f) => `${f.data?.listingNo != null ? `${bid(f.data)}'s` : "The"} contractor performance percentage needs its report. Attach it first.`,
  CPR_RANGE: () => "Contractor performance is 0 to 100.",
  BANDS_NOT_SET: () => `No bands for this value. Shown unbanded.`,
  INPUTS_FROZEN: () => "Stage submitted. Inputs stand as recorded.",
  FACTOR_UNKNOWN: () => "Not a factor this stage offers.",
  CORRECTION_AFTER_SUBMISSION: () => "Price correction ends once the first stage is submitted.",
  REASON_REQUIRED: () => "Give the reason.",
  // ---- shortlist (shortlist.ts)
  TOO_FEW: (f) => `Shortlist at least ${f.data?.min ?? "the minimum"}.`,
  TOO_MANY: (f) => `Shortlist no more than ${f.data?.max ?? "the maximum"}.`,
  NOT_ELIGIBLE: () => "Only a bid in the running is shortlisted.",
  FEWER_THAN_MINIMUM: (f) => `Only ${f.data?.eligible} ${plural(f.data?.eligible, "bid is", "bids are")} in the running, below the minimum of ${f.data?.min}. All go on.`,
  NOT_OFFICE_HOLDER: () => "The recorder does not hold the named office today.",
  OFFICE_NOT_SET: () => `No shortlist office in the model: ${CANCEL_EXIT}.`,
  SHORTLIST_UNSET: () => `No shortlist rule in the model: ${CANCEL_EXIT}.`,
  RANGE_NOT_SET: () => `No shortlist range in the model: ${CANCEL_EXIT}.`,
  TIE_SPLIT: (f) => `Bids tied at ${f.data?.rank != null ? `rank ${f.data.rank}` : "a rank"} are not all shortlisted.`,
  NONE_TAKES_ALL: () => "This stage takes every bid in the running.",
  SHORTLIST_DONE: () => "The shortlist is recorded and stands.",
  // ---- aspects
  ASPECT_NOT_IN_MODEL: () => "That aspect is not one the pinned model assesses.",
  NARRATIVE_REQUIRED: () => "Write the narrative.",
  VERDICT_REQUIRED: () => "Choose the verdict.",
  NOT_ASPECTS_STAGE: () => "The pinned model has no aspects stage.",
  // ---- meetings and negotiation
  NEGOTIATION_NOT_REQUESTED: () => "Needs approval first. Ask on Meetings and letters.",
  NEGOTIATION_NOT_AUTHORISED: () => "Approval incomplete. See its route on Meetings and letters.",
  NEGOTIATION_REFUSED: () => "Negotiation refused. It may be asked for again.",
  HELD_IN_FUTURE: () => "Held day cannot be after today.",
  HELD_BEFORE_EVALUATION: () => "Held day is before the evaluation started.",
  PLACE_REQUIRED: () => "Say where it was held.",
  MEETING_OPEN_ALREADY: () => "A meeting with this bidder is still open. Close it first.",
  MEETING_CLOSED: () => "Meeting closed. A further meeting is another round.",
  MINUTES_REQUIRED: () => "Record the minutes before closing the meeting.",
  CONFIRMATION_REQUIRED: () => "Attach the tenderer's written confirmation to the meeting before closing it.",
  PRICES_REQUIRED: () => "Record the price before and after the round.",
  PRICE_RAISED: () => "Price after the round is higher. The report shows both.",
  REQUEST_PENDING: () => "A negotiation with this bidder is already with approval.",
  RULE_NOT_SET: () => `No approval rule for this negotiation. Add one under ${SETTING_AT.matrix}.`,
  NO_METHOD_KEY: () => `Method has no approval key. Set it under ${SETTING_AT.matrix}.`,
  HAS_COMMITTEE_STEP: () => `Rule routes a negotiation to a committee, which it cannot. Change it under ${SETTING_AT.matrix}.`,
  NO_ISSUE: () => `No approval matrix in force. Issue one under ${SETTING_AT.matrix}.`,
  RECOMMENDATION_FORMED: () => "Recommendation formed. No further meetings.",
  // ---- the quotation ceiling on the price recommended (ceiling.ts, Q1)
  PRICE_ABOVE_CEILING: (f) => `Price above the quotation ceiling of ${f.data?.boundary ?? "the recorded boundary"} (${f.data?.operator === "GTE" ? "exactly on it is a tender" : "exactly on it is a quotation"}). It cannot be recommended.`,
  PRICE_ABOVE_CEILING_AT_ROUND: (f) => `Price after the round is above the ceiling of ${f.data?.boundary ?? "the recorded boundary"} (${f.data?.operator === "GTE" ? "exactly on it is a tender" : "exactly on it is a quotation"}). It cannot be recommended. The round closes as recorded.`,
  // ---- recommendation
  STAGES_NOT_COMPLETE: (f) => `${f.data?.stage ?? "A stage"} is not complete.`,
  JUSTIFICATION_REQUIRED: (f) => `Ranked ${f.data?.rank ?? "below the first"}. State why it beats the top-ranked bid.`,
  PRICE_NOT_REASONABLE: (f) => `${f.data?.aspect ?? "The price against the estimate"} is not satisfactory. It is not recommended.`,
  PRICE_NOT_ASSESSED: (f) => `${f.data?.aspect ?? "The price against the estimate"} is not assessed for this bid yet.`,
  ALREADY_FORMED: () => "Recommendation formed.",
  NEGOTIATION_OPEN: () => "A meeting is still open. Close it first.",
  // ---- report
  RECOMMENDATION_MISSING: () => "Form the recommendation first.",
  MEETING_OPEN: (f) => `${f.data?.count} ${plural(f.data?.count, "meeting is", "meetings are")} still open. Close each.`,
  NEGOTIATION_PENDING: () => "A negotiation awaits approval. Record its decision first.",
  SERIES_NOT_SET: () => `Report numbering series not named. Name it under ${SETTING_AT.policy}.`,
  SERIES_INVALID: () => `Report numbering series invalid. Correct it under ${SETTING_AT.numbering}.`,
  TEMPLATE_NOT_SET: () => `No template chosen. Choose one under ${SETTING_AT.policy}.`,
  TEMPLATE_TEXT_NOT_SET: () => `Template has no text. Write it under ${SETTING_AT.templates}.`,
  TEMPLATE_LANGUAGE_NOT_SET: () => `Template language order not set. Set it under ${SETTING_AT.templates}.`,
  TEMPLATE_INCOMPLETE: (f) => `Template fields with nothing recorded: ${f.data?.fields ?? ""}.`,
  TEMPLATE_UNKNOWN_FIELD: (f) => `Template fields not filled by the portal: ${f.data?.fields ?? ""}. Correct it under ${SETTING_AT.templates}.`,
  ADMITTED_UNOPENED: (f) => `${f.data?.count} admitted late ${plural(f.data?.count, "tender is", "tenders are")} unopened. Open each first.`,
  CONSENT_NOT_FROM_RECOMMENDED: (f) => `Validity rests on ${f.data?.party ?? "another tenderer"}'s consent${f.data?.day ? ` to ${formatDate(String(f.data.day))}` : ""}, not the recommended tenderer's. Record their consent on Received.`,
  REPORT_STALE: () => "Bids evaluated are out of date: a late tender opened since. Start a new version.",
  // ---- a two-stage tender's first stage (stage-one.ts)
  NOT_TWO_STAGE: () => "Not a two-stage model. No first-stage matter.",
  OTHER_COMMITTEE: () => "That sitting is of another committee.",
  SITTING_CLOSED: () => "Sitting is minuted or cancelled. Choose another.",
  STAGE_ONE_TABLED: () => "Already tabled. Waiting for the committee.",
  STAGE_ONE_DECIDED: () => "The committee has decided this stage.",
  // ---- the bundle, the Kertas Cadangan
  EVALUATION_NOT_STARTED: () => "Evaluation not started. No report yet.",
  PROPOSAL_NOT_RENDERED: () => "Proposal paper not produced. Produce it on Report.",
  PROPOSAL_NOT_CHECKED: () => "Checking officer not recorded. Record it on Report.",
  PROPOSAL_NOT_RECOMMENDED: () => "Recommending officer not recorded. Record it on Report.",
  ALREADY_RENDERED: () => "Proposal paper already produced.",
  CHECKER_NOT_SET: () => `Office that checks the proposal paper not set. Set it under ${SETTING_AT.policy}.`,
  RECOMMENDER_NOT_SET: () => `Office that recommends the proposal paper not set. Set it under ${SETTING_AT.policy}.`,
  NOT_RENDERED: () => "Produce the proposal paper first.",
  ALREADY_RECORDED: () => "Already recorded; it stands.",
  SAME_PERSON: () => "Checker and recommender must differ.",
  DAY_REQUIRED: () => "Give the day it was signed.",
  DAY_IN_FUTURE: () => "The day cannot be after today.",
  DAY_BEFORE_PAPER: () => "Day is before the proposal paper was produced.",
  // ---- the award (award-gate.ts)
  NEVER_EVALUATED: () => `Never evaluated here, so no award: ${CANCEL_EXIT}.`,
  NOT_EVALUATED: () => "Issue the evaluation report before awarding.",
  AWARDEE_NOT_RECOMMENDED: () => "Awardee must be the recommended tenderer. Another needs a new evaluation version.",
  VALUE_DIFFERS_REASON_REQUIRED: () => "Value differs from the recommendation. Give the reason.",
  PERIOD_DIFFERS_REASON_REQUIRED: () => "Period differs from the recommendation. Give the reason.",
  VALUE_ABOVE_CEILING: (f) => `Value above the quotation ceiling of ${f.data?.boundary ?? "the recorded boundary"} (${f.data?.operator === "GTE" ? "exactly on it is a tender" : "exactly on it is a quotation"}). Award at the recommended price or within the ceiling.`,
  // ---- the version an appointment was tabled on (bundle.ts, fix M-3)
  TABLED_VERSION_NOT_RECORDED: () => "Tabled version not recorded. Table the appointment again on the report in force.",
  TABLED_ON_EARLIER_VERSION: (f) => `Tabled on version ${f.data?.tabled ?? "an earlier version"}${f.data?.inForce != null ? `, but version ${f.data.inForce} is in force` : ", no longer in force"}. Table again once the current report and proposal paper are ready.`,
  LOOP_ON_EARLIER_VERSION: (f) => `Tabled on version ${f.data?.tabled ?? "an earlier version"}, no longer in force. No new version opens. Decision recorded.`,
  LOOP_VERSION_NOT_RECORDED: () => "Tabled version not recorded. No new version opens. Decision recorded.",
  // ---- the loop
  LOOP_TARGET_UNKNOWN: () => "Return stage unknown. No new version opens. Choose one under Configuration › Committees.",
  TERMINAL_NEVER_REOPENS: () => "Outcome ends the matter. Cancel under Tender documents › Publishing.",
  // ---- choosing and pinning (pin.ts)
  EVALUATION_MODEL_NOT_SET: () => "No evaluation model chosen. Choose one on Tender documents › Publishing.",
  EVALUATION_MODEL_NOT_ISSUED: (f) => `${f.data?.model ?? "The model"} is a draft. Issue it under ${SETTING_AT.models} first.`,
  EVALUATION_MODEL_RETIRED: (f) => `${f.data?.model ?? "The model"} is retired. Choose an issued version on Window.`,
  EVALUATION_ROUTE_NOT_SET: (f) => `Evaluation route for ${f.data?.basis ?? "this basis"} not set. Set it under ${SETTING_AT.bases}.`,
  EVALUATION_ROUTE_MISMATCH: (f) => `${f.data?.model ?? "The model"} is for another route than ${f.data?.basis ?? "the contract basis"}. Choose another.`,
  EVALUATION_MODEL_PINNED: () => "Model pinned. It does not change.",
  EVALUATION_MODEL_FROZEN: () => "Model fixed once published.",
  CONTRACT_BASIS_NOT_SET: () => "No contract basis. Evaluation route unknown.",
  // ---- model issue (model.ts), for Configuration
  NO_STAGES: () => "The model has no stages.",
  STAGE_ORDER_DUPLICATE: (f) => `Two stages share position ${f.data?.order}.`,
  UNLOCKS_UNKNOWN: (f) => `${f.data?.stage} waits for a stage that is not before it.`,
  SIDE_FOR_STAGE: (f) => `${f.data?.stage}: a committee decision is the committee's, and only it.`,
  MAX_MARKS_NOT_SET: (f) => `${f.data?.stage} has no total marks above nothing: a stage that forms a figure from marks, a pass mark or a weight needs its total.`,
  NO_CRITERIA: (f) => `${f.data?.stage} has no criteria.`,
  MARKS_NOT_TOTAL: (f) => `${f.data?.criterion ?? f.data?.stage}: its criteria's marks do not add up to its total.`,
  CRITERION_MAX_NOT_SET: (f) => `${f.data?.criterion} has no maximum marks.`,
  CRITERION_SCALE_FOR_STAGE: (f) => `${f.data?.criterion}: that scale is not used on ${f.data?.stage}'s kind of stage.`,
  PASS_MARK_RANGE: (f) => `${f.data?.stage}: a pass mark lies between 0 and 100.`,
  MUST_PASS_NOT_SET: (f) => `${f.data?.stage}: whether a bidder must pass it to stay in the running is not set.`,
  SHORTLIST_RULE_NOT_SET: (f) => `${f.data?.stage}: no shortlist rule.`,
  SHORTLIST_RANGE_NOT_SET: (f) => `${f.data?.stage}: the shortlist's minimum and maximum are not set.`,
  SHORTLIST_OFFICE_NOT_SET: (f) => `${f.data?.stage}: no office decides the shortlist.`,
  CAPITAL_BASE_NOT_SET: (f) => `${f.data?.stage}: what the minimum capital is a percentage of is not set.`,
  FACTORS_NOT_SET: (f) => `${f.data?.stage}: no factor options.`,
  FACTOR_RANGE: (f) => `${f.data?.factor}: a factor lies above 0 and at most 100.`,
  CAPITAL_CRITERION_MISSING: (f) => `${f.data?.stage} has no minimum-capital criterion.`,
  BANDED_INPUT_NOT_SET: (f) => `${f.data?.criterion}: a banded criterion needs the value it bands.`,
  INPUT_FOR_STAGE: (f) => `${f.data?.criterion}: that value is not computed on ${f.data?.stage}'s kind of stage.`,
  BAND_SET_NOT_SET: (f) => `${f.data?.criterion}: no band set.`,
  BAND_SET_UNKNOWN: (f) => `${f.data?.criterion}: its band set is not one of this model's.`,
  FLOOR_EDGE_MISUSED: (f) => `${f.data?.set}: a band edge at the floor belongs only to a minimum-capital band set.`,
  WEIGHTS_NOT_100: (f) => `${f.data?.stage}: the stages' weights do not add up to 100.`,
  WEIGHT_ON_LATER_STAGE: (f) => `${f.data?.stage} carries a weight but comes after the composite.`,
  COMPOSITE_HAS_NO_WEIGHTS: (f) => `${f.data?.stage}: no stage carries a weight.`,
  WEIGHT_ON_KIND: (f) => `${f.data?.stage}: only a scored stage or a financial test carries a weight in the composite; this kind of stage forms no figure to weigh.`,
  PASS_MARK_ON_KIND: (f) => `${f.data?.stage}: this kind of stage forms no figure, so a pass mark on it would never be judged. Clear it, or make it a scored stage, a financial test with marks, or the composite.`,
  COMMITTEE_NOT_SET: (f) => `${f.data?.stage}: no committee is named.`,
  TWO_STAGE_FIRST_STAGE: () => "A two-stage model opens with the committee's decision on each bidder.",
  COMMITTEE_STAGE_ON_TRADITIONAL: (f) => `${f.data?.stage}: a committee decision stage belongs to a two-stage model.`,
  RECOMMENDATION_NOT_LAST: () => "The recommendation is one stage, the last.",
  ASPECTS_STAGE_MISSING: () => `Aspects are required on this route, and the model has no aspects stage. Add one, or change the aspects under ${SETTING_AT.aspects}.`,
  ASPECTS_STAGE_TWICE: () => "The model has two aspects stages.",
  ASPECT_KIND_MISSING: (f) => `${f.data?.kind ? ASPECT_KIND_LABEL[f.data.kind as AspectKind] : "An aspect"} is not configured as required on the traditional route. Add it under ${SETTING_AT.aspects}.`,
  BANDS_OVERLAP: (f) => `${f.data?.set}: ${f.data?.band} and ${f.data?.other} overlap.`,
  BANDS_GAP: (f) => `${f.data?.set}: no band holds the values between ${f.data?.band} and ${f.data?.other}. A value there reads "Not banded" and the evaluators record a note (it may be issued so).`,
  BANDS_EMPTY: (f) => `${f.data?.set} has no bands.`,
  BAND_EDGES_REVERSED: (f) => `${f.data?.set}: ${f.data?.band}'s lower edge is above its upper.`,
};

export function evaluationFindingText(f: Finding): string {
  const t = TEXT[f.code];
  return t ? t(f) : "This cannot be recorded as it stands.";
}

const listWords = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/// The findings that name one item each for a bid, gathered into one sentence per bid (6.8 re-review 8).
const GATHERED: Readonly<Record<string, { item: string; words: (ref: string, items: string) => string }>> = {
  ASPECT_UNASSESSED: { item: "aspect", words: (ref, items) => `${ref} is not assessed on ${items}.` },
  SCORE_MISSING: { item: "criterion", words: (ref, items) => `${ref} has no score on ${items}.` },
};

/**
 * What still holds a stage, in words a person reads once (6.8 re-review 8): the items one bid lacks
 * gathered into one sentence ("No. 1 is not assessed on A, B, C and D."), every other reason once,
 * each starting with a capital. Order as found.
 */
export const pendingText = (fs: readonly Finding[]): string => pendingSentences(fs).join(" ");

/// The sentences of `pendingText`, each once.
export function pendingSentences(fs: readonly Finding[]): string[] {
  const out: ({ text: string } | { code: string; ref: string; items: string[] })[] = [];
  for (const f of fs) {
    const g = GATHERED[f.code];
    const item = g ? f.data?.[g.item] : null;
    if (g && f.data?.listingNo != null && item != null) {
      const ref = f.data.bidRef ? String(f.data.bidRef) : `No. ${f.data.listingNo}`;
      const at = out.find((x): x is { code: string; ref: string; items: string[] } => "code" in x && x.code === f.code && x.ref === ref);
      if (at) at.items.push(String(item));
      else out.push({ code: f.code, ref, items: [String(item)] });
    } else out.push({ text: capital(evaluationFindingText(f)) });
  }
  return [...new Set(out.map((x) => ("text" in x ? x.text : GATHERED[x.code].words(x.ref, listWords(x.items)))))];
}

/// A draft's finding at issue, in Configuration's words: a rule not set there is set on the draft (never "cancel").
export function modelFindingText(f: Finding): string {
  if (f.code === "PASS_RULE_NOT_SET") return `${f.data?.stage ?? "A stage"}: whether a figure exactly on the pass mark passes is not set.`;
  // The report's code of the same name means "form it"; on a draft it means the stage is missing.
  if (f.code === "RECOMMENDATION_MISSING") return "The model has no recommendation stage: it ends with one.";
  return evaluationFindingText(f);
}

/// Every code this module words, for the test that each has words.
export const EVALUATION_FINDING_CODES = Object.keys(TEXT);
