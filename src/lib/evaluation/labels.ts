/**
 * Every word evaluation puts on a screen: enum labels and the text of every finding. Codes never reach
 * a screen (AGENTS.md rule 5): a screen renders `evaluationFindingText`, never `f.code`. Every refusal
 * names what to do, or where the setting is; a rule frozen unset never says "set it" — it names this
 * exercise's real exit. Never a score, a price or the estimate: findings carry no figure (E-3).
 */

import type { Finding, AspectKind, AspectVerdict, BandOutcome, CapitalBase, CommunicationChannel, CommunicationDirection, ComputedInput, CriterionScale, EvaluationRoute, EvaluationState, EvaluationTrigger, MeetingKind, ModelStatus, ShortlistRule, Side, StageKind } from "./types";
import type { EvaluationPhase } from "./state";
import type { RunningState } from "./stages";
import { CONFIG_TEXT } from "./config";

/// Where each setting an evaluation reads is kept.
export const SETTING_AT = {
  models: "Configuration › Evaluation models",
  policy: "Configuration › Evaluation models, under Policy",
  aspects: "Configuration › Evaluation models, under Aspects",
  bases: "Configuration › Evaluation models, under Contract bases",
  matrix: "Configuration › Approval matrix",
  numbering: "Configuration › Numbering",
  templates: "Configuration › Templates",
  users: "Configuration › Users",
  organisation: "Configuration › Organisation",
} as const;

/// The exit for an exercise whose frozen rule can never be met (6.7 C-9 precedent; E-1).
const CANCEL_EXIT = "this exercise's exit is to cancel it, from its Invitation tab, and publish a replacement";

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
export const MEETING_KIND_LABEL: Readonly<Record<MeetingKind, string>> = { CLARIFICATION: "Clarification", NEGOTIATION: "Negotiation" };
export const STATE_LABEL: Readonly<Record<EvaluationState, string>> = { OPEN: "In progress", ISSUED: "Report issued", SUPERSEDED: "Superseded", CANCELLED: "Closed: exercise cancelled" };
export const STATE_TONE: Readonly<Record<EvaluationState, "brand" | "ok" | "neutral">> = { OPEN: "brand", ISSUED: "ok", SUPERSEDED: "neutral", CANCELLED: "neutral" };
export const TRIGGER_LABEL: Readonly<Record<EvaluationTrigger, string>> = { START: "Started after the opening", LOOP: "Opened again on the committee's decision", SUPPLEMENTARY_OPENING: "Opened again when a late tender was opened" };
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

/// What the evaluation's figures and records are (E-3): said beside every one.
export const SULIT_CHIP = "SULIT · not restricted until sign-in";
export const EVALUATION_STATEMENT = {
  title: "Evaluation records are SULIT",
  body: "Nobody signs in yet, so the portal cannot restrict who reads them; they are kept off every list, the dashboard and search. Uploaded evidence cannot be downloaded until sign-in: print the report to table it.",
};

const side = (d: Finding["data"]) => (d?.side ? SIDE_LABEL[d.side as Side]?.toLowerCase() : null) ?? "that side";
const bid = (d: Finding["data"]) => (d?.listingNo != null ? `bid No. ${d.listingNo}` : "a bid");
const plural = (n: unknown, one: string, many: string) => (n === 1 ? one : many);

const TEXT: Record<string, (f: Finding) => string> = {
  // ---- Configuration's own refusals (config.ts), in its words
  ...Object.fromEntries(Object.entries(CONFIG_TEXT).map(([k, t]) => [k, () => t])),
  // ---- acts on a version (state.ts)
  CANCELLED: () => "The exercise is cancelled, so nothing more is recorded on its evaluation.",
  NOT_STARTED: () => "The evaluation has not started. Start it on the Evaluation tab's Overview.",
  REPORT_ISSUED: () => "The report is issued and stands as issued. A change is made only in a new evaluation version, which a committee's decision or a late tender's opening opens.",
  VERSION_SUPERSEDED: () => "This evaluation version was superseded; record it on the version in force.",
  VERSION_CANCELLED: () => "This evaluation version was closed when the exercise was cancelled.",
  REPORT_NOT_ISSUED: () => "The report is not issued yet. Issue it on the Report section first.",
  // ---- starting (start.ts)
  ALREADY_STARTED: () => "The evaluation has already started.",
  NOT_OPENED: () => "The evaluation starts once the exercise is Opened: its main opening finalised, on Bids and opening.",
  NOT_THROUGH_WINDOW: () => "This exercise was not published through its invitation window with tender or quotation documents, so it is not evaluated in the portal.",
  MODEL_NOT_PINNED: () => `Published before evaluation models existed, this exercise has no pinned model and none is pinned later: ${CANCEL_EXIT}.`,
  OPENING_NOT_FINALISED: () => "The main opening is not finalised. Finalise it on Bids and opening, under Opening.",
  SIGNED_SCHEDULE_NOT_ATTACHED: (f) => `${f.data?.supplementary ? `Supplementary opening ${f.data.supplementary}'s` : "The opening's"} signed schedule is not attached. Attach its scan on Bids and opening, under Schedule.`,
  ESTIMATE_COPY_UNEXPLAINED: () => "The company estimate's paper copy did not match, or was not in the box, and is not yet explained. Record the explanation on Bids and opening, under Schedule.",
  SUPPLEMENTARY_IN_PROGRESS: (f) => `${f.data?.supplementary ? `Supplementary opening ${f.data.supplementary}` : "A supplementary opening"} is under way. Finalise it first: its offer may join the evaluation.`,
  DECIMALS_NOT_SET: () => `How many decimal places a score is shown and judged at is not set. Set it under ${SETTING_AT.policy}; it is frozen when the evaluation starts.`,
  BOUNDARY_NOT_RECORDED: () => `The exercise's quotation ceiling was never recorded when it was classified, so a bid above it cannot be told apart; ${CANCEL_EXIT}.`,
  NOTHING_CARRIED: () => "No bid was carried to evaluation at the opening, so there is nothing to evaluate. The exercise's exit is to cancel it, from its Invitation tab.",
  TIME_ZONE_NOT_SET: () => `The organisation's time zone is not set, so nothing can be dated. Set it under ${SETTING_AT.organisation}.`,
  PERSON_REQUIRED: () => "Choose who records it: an active person on record. Recorded on their behalf, not signed.",
  // ---- the team (team.ts)
  SIDE_NOT_STAFFED: (f) => `Nobody is appointed for ${side(f.data)}. Appoint a team member to that side on the Overview.`,
  PERSON_ON_BOTH_SIDES: (f) => `${f.data?.person ?? "A person"} is picked for both sides. Each side is a different person (a joint evaluation).`,
  PERSON_NOT_ACTIVE: (f) => `${f.data?.person ?? "A person"} is not active, so cannot be appointed.`,
  ALREADY_ON_TEAM: (f) => `${f.data?.person ?? "That person"} is already on the team.`,
  UNIT_NOT_IMPLEMENTING: (f) => `${f.data?.person ?? "A person"}'s unit is not the requisition's or under it, so they cannot sit for the implementing department. Pick a member of that department, or correct their unit under ${SETTING_AT.users}.`,
  UNIT_NOT_RECORDED: (f) => `${f.data?.person ?? "A person"}'s unit is not recorded, so whether they belong to the implementing department is not checked.`,
  NOT_ON_TEAM: (f) => `${f.data?.person ? `${f.data.person} is` : "That person is"} not appointed for ${side(f.data)}; only a member appointed to the stage's side scores or submits it.`,
  SAME_PERSON_BOTH_SIDES: (f) => `${f.data?.person ?? "That person"} submitted a stage for the other side. Nobody submits for both sides.`,
  // ---- scoring and stages (score.ts, stages.ts)
  ABOVE_MAX: (f) => `A score cannot be above the criterion's maximum${f.data?.criterion ? ` (${f.data.criterion})` : ""}. Nothing is capped: enter it again.`,
  NEGATIVE: () => "A score is never below nothing.",
  PASS_RULE_NOT_SET: () => `Whether a figure exactly on the pass mark passes was not set in the model as issued, so it cannot be judged; ${CANCEL_EXIT}.`,
  STAGE_SUBMITTED: (f) => `${f.data?.stage ?? "The stage"} is submitted, and its results stand. A change is made only in a new evaluation version.`,
  STAGE_LOCKED: (f) => `${f.data?.stage ?? "This stage"} is scored only once ${f.data?.waitsFor ?? "the stage before it"} is submitted.`,
  NOT_IN_RUNNING: (f) => (f.data?.stage ? `${bid(f.data)} went out of the running at ${f.data.stage}.` : "That bid is not in the running."),
  EXCLUDED_ABOVE_CEILING: (f) => `${bid(f.data)} is above the exercise's quotation ceiling and is excluded from evaluation.`,
  STAGE_ONE_UNDECIDED: (f) => `The committee has not decided ${bid(f.data)} at ${f.data?.stage ?? "the first stage"}. Table it from the Stages section, and record the committee's decision at its sitting.`,
  NOT_A_SCORED_CRITERION: () => "That criterion is not scored by hand: it is computed, or it is a group of others.",
  WRONG_SCALE: (f) => `${f.data?.criterion ?? "That criterion"} is scored as the model says: marks, or pass and fail.`,
  SCORE_MISSING: (f) => `${bid(f.data)} has no score on ${f.data?.criterion ?? "a criterion"}.`,
  ASPECT_UNASSESSED: (f) => `${bid(f.data)} is not assessed on ${f.data?.aspect ?? "an aspect"}.`,
  SHORTLIST_NOT_RECORDED: (f) => `Whether ${bid(f.data)} is shortlisted is not recorded.`,
  PART_NOT_SUBMITTED: (f) => `The composite waits for ${f.data?.stage ?? "a stage it weighs"} to be submitted.`,
  ALREADY_SUBMITTED: (f) => `${f.data?.stage ?? "The stage"} is already submitted.`,
  EARLIER_NOT_SUBMITTED: (f) => `${f.data?.stage ?? "An earlier stage"} is not submitted yet; stages are submitted in order.`,
  SUBMITTED_BY_ITS_ACT: (f) => `${f.data?.stage ?? "This stage"} is recorded by its own act (the shortlist, the committee's decisions or the recommendation), not by a submission.`,
  NOT_BANDED_NOTE_REQUIRED: (f) => `${bid(f.data)}'s ${f.data?.criterion ?? "value"} falls in no band of the model (a gap in the bands as written). Record the evaluators' note on it with the submission.`,
  FACTOR_NOT_CHOSEN: (f) => `Which factor applies to ${bid(f.data)} is not chosen. Record it with the bidder's inputs.`,
  BALANCES_NOT_ENTERED: (f) => `${bid(f.data)}'s three monthly balances are not all entered.`,
  ESTIMATE_SEALED: () => "The company estimate is still sealed, so nothing is computed against it.",
  ESTIMATE_NOT_AVAILABLE: () => "No company estimate was required for this exercise, so a test on it cannot be computed. The model pinned asks for one; record the evaluators' finding in the aspects.",
  BASE_NOT_SET: () => `The model as issued names no base for the minimum capital; ${CANCEL_EXIT}.`,
  BASE_ZERO: () => "The base the figure is taken against is nothing, so no percentage can be stated.",
  CPR_NOT_ENTERED: (f) => `${bid(f.data)}'s contractor performance percentage is not entered. Enter it from its attached report with the bidder's inputs.`,
  CPR_EVIDENCE_REQUIRED: (f) => `${f.data?.listingNo != null ? `${bid(f.data)}'s` : "The"} contractor performance percentage is entered only from its report: attach the report to the bidder first.`,
  CPR_RANGE: () => "A contractor performance percentage lies between 0 and 100.",
  BANDS_NOT_SET: () => `The model as issued has no bands for this value, so it is shown unbanded; ${CANCEL_EXIT} if a band was meant.`,
  INPUTS_FROZEN: () => "The stage that reads these inputs is submitted, so they stand as recorded.",
  FACTOR_UNKNOWN: () => "That factor is not one the model's stage offers.",
  CORRECTION_AFTER_SUBMISSION: () => "A price is corrected only before the first stage is submitted: every stage after it read the price as it stood.",
  REASON_REQUIRED: () => "Give the reason.",
  // ---- shortlist (shortlist.ts)
  TOO_FEW: (f) => `Shortlist at least ${f.data?.min ?? "the minimum"}.`,
  TOO_MANY: (f) => `Shortlist no more than ${f.data?.max ?? "the maximum"}.`,
  NOT_ELIGIBLE: () => "Only a bid in the running is shortlisted.",
  FEWER_THAN_MINIMUM: (f) => `Only ${f.data?.eligible} ${plural(f.data?.eligible, "bid is", "bids are")} in the running, fewer than the shortlist's minimum of ${f.data?.min}: every one goes on, and the report says so.`,
  NOT_OFFICE_HOLDER: () => "The person recording it does not hold the office the model names on the day.",
  OFFICE_NOT_SET: () => `The model as issued names no office to decide the shortlist; ${CANCEL_EXIT}.`,
  SHORTLIST_UNSET: () => `The model as issued sets no shortlist rule; ${CANCEL_EXIT}.`,
  RANGE_NOT_SET: () => `The model as issued sets no shortlist range; ${CANCEL_EXIT}.`,
  TIE_SPLIT: (f) => `Bids sharing ${f.data?.rank != null ? `rank ${f.data.rank}` : "a rank"} on price are not all shortlisted; the report says so.`,
  NONE_TAKES_ALL: () => "This stage takes every bid in the running.",
  SHORTLIST_DONE: () => "The shortlist is recorded and stands.",
  // ---- aspects
  ASPECT_NOT_IN_MODEL: () => "That aspect is not one the pinned model assesses.",
  NARRATIVE_REQUIRED: () => "Write the narrative: the verdict is judged in words.",
  VERDICT_REQUIRED: () => "Choose the verdict.",
  NOT_ASPECTS_STAGE: () => "The pinned model has no aspects stage.",
  // ---- meetings and negotiation
  NEGOTIATION_NOT_REQUESTED: () => "A negotiation needs its approval first. Ask for it on the Meetings and letters section.",
  NEGOTIATION_NOT_AUTHORISED: () => "The negotiation's approval is not complete yet. Its route is on the Meetings and letters section.",
  NEGOTIATION_REFUSED: () => "The negotiation was refused on its route. It may be asked for again.",
  HELD_IN_FUTURE: () => "The day it was held cannot be after today.",
  HELD_BEFORE_EVALUATION: () => "The day it was held is before the evaluation started.",
  PLACE_REQUIRED: () => "Say where it was held.",
  MEETING_OPEN_ALREADY: () => "A meeting of this kind with this bidder is still open. Close it first.",
  MEETING_CLOSED: () => "The meeting is closed on its minutes and the tenderer's confirmation, and stands. A further meeting is another round.",
  MINUTES_REQUIRED: () => "Record the minutes before closing the meeting.",
  CONFIRMATION_REQUIRED: () => "Attach the tenderer's written confirmation to the meeting before closing it.",
  PRICES_REQUIRED: () => "Record the price before and after the round.",
  PRICE_RAISED: () => "The price after the round is higher than before it. Nothing stops it; the report shows both.",
  REQUEST_PENDING: () => "A negotiation with this bidder is already with approval.",
  RULE_NOT_SET: () => `No rule in the approval matrix in force says who approves a negotiation for this method at this value. Add one under ${SETTING_AT.matrix}.`,
  NO_METHOD_KEY: () => `The exercise's method has no key in the approval matrix, so nobody can be shown as approving a negotiation. Set it under ${SETTING_AT.matrix}.`,
  HAS_COMMITTEE_STEP: () => `The approval matrix routes a negotiation through a committee step, which this route cannot take: a committee decides an exercise's appointment, not its negotiation. Change the rule under ${SETTING_AT.matrix}.`,
  NO_ISSUE: () => `No approval matrix is in force. Issue one under ${SETTING_AT.matrix}.`,
  RECOMMENDATION_FORMED: () => "The recommendation is formed, so no further meeting is held in this version.",
  // ---- recommendation
  STAGES_NOT_COMPLETE: (f) => `${f.data?.stage ?? "A stage"} is not complete.`,
  JUSTIFICATION_REQUIRED: (f) => `This bid ranks ${f.data?.rank ?? "below the first"}: state why it is recommended over the top-ranked bid.`,
  PRICE_NOT_REASONABLE: (f) => `${f.data?.aspect ?? "The price against the estimate"} is not satisfactory for this bid, so it is not recommended: the evaluators' verdict decides, the band is a guide.`,
  PRICE_NOT_ASSESSED: (f) => `${f.data?.aspect ?? "The price against the estimate"} is not assessed for this bid yet.`,
  ALREADY_FORMED: () => "The recommendation is formed and stands in this version.",
  NEGOTIATION_OPEN: () => "A meeting is still open. Close it first: the recommendation stands on its outcome.",
  // ---- report
  RECOMMENDATION_MISSING: () => "Form the recommendation first, on the Recommendation section.",
  MEETING_OPEN: (f) => `${f.data?.count} ${plural(f.data?.count, "meeting is", "meetings are")} still open. Close each on its minutes and the tenderer's confirmation.`,
  NEGOTIATION_PENDING: () => "A negotiation is still with approval. Its decision is recorded first, on Meetings and letters: the recommendation and the report stand on its outcome.",
  SERIES_NOT_SET: () => `No numbering series is named for the evaluation report. Name it under ${SETTING_AT.policy}, and configure it under ${SETTING_AT.numbering}.`,
  SERIES_INVALID: () => `The report's numbering series is missing or not valid. Correct it under ${SETTING_AT.numbering}.`,
  TEMPLATE_NOT_SET: () => `No template is chosen for it. Choose one under ${SETTING_AT.policy}.`,
  TEMPLATE_TEXT_NOT_SET: () => `Its template has no text written. Write it under ${SETTING_AT.templates}.`,
  TEMPLATE_LANGUAGE_NOT_SET: () => `Its template has both languages, and which is issued first is not set. Set it under ${SETTING_AT.templates}.`,
  TEMPLATE_INCOMPLETE: (f) => `Its template names fields with nothing recorded: ${f.data?.fields ?? ""}.`,
  TEMPLATE_UNKNOWN_FIELD: (f) => `Its template names fields the portal does not fill: ${f.data?.fields ?? ""}. Correct it under ${SETTING_AT.templates}.`,
  ADMITTED_UNOPENED: (f) => `${f.data?.count} late ${plural(f.data?.count, "tender was", "tenders were")} admitted and not yet opened. Open each at its supplementary opening first.`,
  CONSENT_NOT_FROM_RECOMMENDED: (f) => `The bids' validity was extended on the consent of ${f.data?.party ?? "another tenderer"}, not the recommended tenderer. Record the recommended tenderer's consent, on Bids and opening, under Received.`,
  REPORT_STALE: () => "The bids evaluated are no longer the bids carried to evaluation (a late tender was admitted and opened since). A new evaluation version is evaluated and issued.",
  // ---- a two-stage tender's first stage (stage-one.ts)
  NOT_TWO_STAGE: () => "The pinned model is not a two-stage one, so no first-stage matter is tabled.",
  OTHER_COMMITTEE: () => "That sitting is of another committee than the one the first stage names.",
  SITTING_CLOSED: () => "That sitting is minuted or cancelled. Choose a sitting still to be held.",
  STAGE_ONE_TABLED: () => "This bid's first-stage matter is already tabled and waits for the committee.",
  STAGE_ONE_DECIDED: () => "The committee has decided this bid's first stage; it stands.",
  // ---- the bundle, the Kertas Cadangan
  EVALUATION_NOT_STARTED: () => "The evaluation has not started, so the appointment has no report to stand on.",
  PROPOSAL_NOT_RENDERED: () => "The Kertas Cadangan is not produced yet. Produce it on the Evaluation tab's Report section.",
  PROPOSAL_NOT_CHECKED: () => "The Kertas Cadangan's checking officer is not recorded. Record it on the Report section.",
  PROPOSAL_NOT_RECOMMENDED: () => "The Kertas Cadangan's recommending officer is not recorded. Record it on the Report section.",
  ALREADY_RENDERED: () => "The Kertas Cadangan is produced and frozen.",
  CHECKER_NOT_SET: () => `The office that checks the Kertas Cadangan is not set. Set it under ${SETTING_AT.policy}.`,
  RECOMMENDER_NOT_SET: () => `The office that recommends the Kertas Cadangan is not set. Set it under ${SETTING_AT.policy}.`,
  NOT_RENDERED: () => "Produce the Kertas Cadangan first.",
  ALREADY_RECORDED: () => "Already recorded; it stands.",
  SAME_PERSON: () => "The checking and the recommending officer are two different people.",
  DAY_REQUIRED: () => "Give the day it was signed.",
  DAY_IN_FUTURE: () => "The day cannot be after today.",
  DAY_BEFORE_PAPER: () => "The day is before the Kertas Cadangan was produced.",
  // ---- the award (award-gate.ts)
  NEVER_EVALUATED: () => `Published before evaluation models existed, this exercise is never evaluated in the portal, so no award is made on it: ${CANCEL_EXIT}.`,
  NOT_EVALUATED: () => "An award follows the evaluation: its report must be issued, on the Evaluation tab.",
  AWARDEE_NOT_RECOMMENDED: () => "The awardee is the tenderer the evaluation recommends. Another tenderer is the committee's decision not to carry the appointment, and a new evaluation version.",
  VALUE_DIFFERS_REASON_REQUIRED: () => "The awarded value differs from the recommendation: give the reason.",
  PERIOD_DIFFERS_REASON_REQUIRED: () => "The completion period differs from the recommendation: give the reason.",
  // ---- the version an appointment was tabled on (bundle.ts, fix M-3)
  TABLED_VERSION_NOT_RECORDED: () => "This appointment matter does not record which evaluation version it was tabled on, so whether the committee decided on the report in force cannot be told. Table the appointment again, on the report in force.",
  TABLED_ON_EARLIER_VERSION: (f) => `This appointment matter was tabled on evaluation version ${f.data?.tabled ?? "an earlier version"}${f.data?.inForce != null ? `, and version ${f.data.inForce} is in force now` : ", which is no longer in force"}: the committee decided on a report since superseded. Table the appointment again once the version in force has its report issued and its Kertas Cadangan checked and recommended.`,
  LOOP_ON_EARLIER_VERSION: (f) => `The matter was tabled on evaluation version ${f.data?.tabled ?? "an earlier version"}, which is no longer in force, so no new evaluation version opens: the decision is recorded as made.`,
  LOOP_VERSION_NOT_RECORDED: () => "The matter does not record which evaluation version it was tabled on, so no new evaluation version opens: the decision is recorded as made.",
  // ---- the loop
  LOOP_TARGET_UNKNOWN: () => "The outcome returns the matter to a stage the product does not know, so no new evaluation version opens. Choose one of the evaluation's stages for it under Configuration › Committees.",
  TERMINAL_NEVER_REOPENS: () => "The outcome ends the matter: the evaluation does not reopen. Cancelling the exercise is asked for on its Invitation tab.",
  // ---- choosing and pinning (pin.ts)
  EVALUATION_MODEL_NOT_SET: () => "No evaluation model is chosen. Choose an issued one on the Invitation tab, Window section, Evaluation model.",
  EVALUATION_MODEL_NOT_ISSUED: (f) => `${f.data?.model ?? "The model"} is a draft. Issue it under ${SETTING_AT.models} first.`,
  EVALUATION_MODEL_RETIRED: (f) => `${f.data?.model ?? "The model"} is retired. Choose an issued version under the Window section's Evaluation model.`,
  EVALUATION_ROUTE_NOT_SET: (f) => `Which evaluation route a contract on ${f.data?.basis ?? "this basis"} takes is not set. Set it under ${SETTING_AT.bases}.`,
  EVALUATION_ROUTE_MISMATCH: (f) => `${f.data?.model ?? "The model"} is for another evaluation route than ${f.data?.basis ?? "the contract basis"} takes. Choose a model for that route.`,
  EVALUATION_MODEL_PINNED: () => "The model is pinned on the exercise and does not change.",
  EVALUATION_MODEL_FROZEN: () => "The model is no longer chosen here: a published exercise's model was pinned when it was published, and a cancelled exercise takes none.",
  CONTRACT_BASIS_NOT_SET: () => "The exercise has no contract basis, so its evaluation route cannot be told. Its basis is chosen before preparation.",
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

/// A draft's finding at issue, in Configuration's words: a rule not set there is set on the draft (never "cancel").
export function modelFindingText(f: Finding): string {
  if (f.code === "PASS_RULE_NOT_SET") return `${f.data?.stage ?? "A stage"}: whether a figure exactly on the pass mark passes is not set.`;
  // The report's code of the same name means "form it"; on a draft it means the stage is missing.
  if (f.code === "RECOMMENDATION_MISSING") return "The model has no recommendation stage: it ends with one.";
  return evaluationFindingText(f);
}

/// Every code this module words, for the test that each has words.
export const EVALUATION_FINDING_CODES = Object.keys(TEXT);
