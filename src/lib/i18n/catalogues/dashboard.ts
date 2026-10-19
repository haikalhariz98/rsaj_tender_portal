/**
 * The Dashboard's own words (NFR-LNG-001, ADR 0040): the greeting, the three pipeline cards, the two lists, the side cards, the sign-in notices and
 * the lines of "Recent activity". The Malay is drafted in the N1 slice and not yet reviewed by the customer.
 *
 * A pair with `{name}` in it is a sentence with values: `sayWith` fills them. Terms follow the shell: Requisition is "Permintaan", Sourcing
 * "Sumber Perolehan", an award "anugerah", a sourcing exercise "urusan" (as the staff screens' "New exercise" is "Urusan baharu"; the supplier
 * portal's "Pelawaan" is the supplier-facing word). Plain words only: the keys are property names and never reach a screen.
 */

import { w, type Words } from "@/lib/contract/labels";
import type { ExerciseStatus } from "@/lib/method/types";


export const GREETING = {
  morning: w("Good morning"),
  afternoon: w("Good afternoon"),
  evening: w("Good evening"),
  /** No time zone is set, so no time of day is claimed. */
  welcome: w("Welcome"),
} as const;

/** The state of an exercise, as the Sourcing screens name it, for the hover on the dashboard's Sourcing card. */
export const EXERCISE_STATUS_WORDS: Readonly<Record<ExerciseStatus, Words>> = {
  DRAFT: w("Draft"),
  DOCUMENTS_IN_PREPARATION: w("Documents in preparation"),
  PENDING_APPROVAL_FOR_TENDERING: w("Awaiting approval for tendering"),
  APPROVED_FOR_TENDERING: w("Approved for tendering"),
  ADVERTISED: w("Advertised"),
  INVITED: w("Invited"),
  OPENING_IN_PROGRESS: w("Opening in progress"),
  OPENED: w("Opened"),
  UNDER_EVALUATION: w("Under evaluation"),
  EVALUATED: w("Evaluated"),
  CANCELLED: w("Cancelled"),
};

/** The three phases of an open exercise (`phaseSummary`), lower case because they follow a number. */
export const EXERCISE_PHASE_WORDS = {
  PREPARING: w("preparing"),
  IN_MARKET: w("out to market"),
  EVALUATING: w("at opening or evaluation"),
} as const;

export const BREAKDOWN_WORDS = {
  cancelledNotCounted: w("{count} cancelled, not counted"),
} as const;

/** Waiting counts from when the step opened (`WAITING_RULE_TEXT` in `@/lib/approvals/queue`, which a test holds to this English). */
export const WAITING_RULE_WORDS = w(
  "Waiting counts from when the step opened: the day the step before it was decided, or the day the route opened for the first step. Escalating a step to another office does not restart it.",
);

export const DASHBOARD_WORDS = {
  setupTitle: w("Nothing configured yet"),
  setupRun: w("Run"),
  setupLoad: w("to load the organisation."),
  newRequisition: w("New requisition"),

  awaitingMyDecision: w("Awaiting my decision"),
  stepsWaitingForYou: w("steps waiting for you"),
  nothingWaitingForYou: w("nothing is waiting for you"),
  requisitions: w("Requisitions"),
  sourcing: w("Sourcing"),
  contracts: w("Contracts"),
  noneInPipeline: w("none in the pipeline"),
  requisitionHint: w("{approved} approved, waiting for sourcing · {back} back with the requester"),
  contractsHint: w("{awarding} awarding · {signing} signing · {onSite} on site"),

  committeeTitle: w("Committee matters waiting"),
  committeeSubtitle: w("Matters routed to a committee, oldest first."),
  viewAll: w("View all"),
  searchMatters: w("Search matters…"),
  committeeEmptyTitle: w("No committee matter is waiting"),
  committeeEmptyBody: w("Matters routed to a committee appear here the moment they are raised."),
  financialItems: w("Financial items"),
  type: w("Type"),
  committee: w("Committee"),
  openTheSitting: w("Open the sitting"),
  item: w("Item"),
  value: w("Value"),
  waiting: w("Waiting"),
  with: w("With"),
  daysShort: w("{days}d"),
  votesCast: w("{cast} of {entitled} voted"),

  awaitingTitle: w("Requisitions awaiting approval"),
  awaitingLead: w("Open approval routes, longest wait first."),
  awaitingMore: w("Each step shows the office acting for it."),
  myApprovals: w("My approvals"),
  awaitingEmptyTitle: w("No requisition is awaiting approval"),
  awaitingEmptyBody: w("A requisition appears here once it is submitted, until its route closes."),
  open: w("Open"),
  requisition: w("Requisition"),
  waitingOn: w("Waiting on"),
  escalatedFrom: w("escalated from {office}"),
  noStepPending: w("No step pending"),
  notCounted: w("Not counted"),

  onTheWay: w("On the way"),
  onTheWaySubtitle: w("These will report here once their modules are built."),
  notBuiltYet: w("Not built yet"),
  projectHealth: w("Project health"),
  projectHealthBody: w("Progress, certified value and time remaining will report here once contract administration lands."),

  upcomingTitle: w("Upcoming sittings"),
  upcomingSubtitle: w("Committees scheduled to sit."),
  nothingScheduled: w("Nothing scheduled"),
  today: w("today"),
  inDays: w("in {days} days"),

  recentTitle: w("Recent activity"),
  recentSubtitle: w("Requisitions, sittings and awards as they move."),
  nothingMoved: w("Nothing has moved yet"),
  nothingMovedBody: w("Requisitions, sittings and awards appear here as they change."),

  changePassword: w("Change password"),
  haveSeenThis: w("I have seen this"),
  failedAttempts: w("{count} failed attempts to sign in to your account since you last signed in"),
  failedAttempt: w("{count} failed attempt to sign in to your account since you last signed in"),
  notYou: w("If this was not you, change your password and tell an administrator."),
  reviewSignIns: w("Review sign-ins"),
} as const;

/** "Recent activity": the verbs that follow a subject, and the sentences with values. */
export const ACTIVITY_WORDS = {
  // an exercise's move into each state
  exReturned: w("Exercise {ref}: tender documents returned for amendment"),
  exPreparation: w("Exercise {ref} moved into preparation"),
  exSentForApproval: w("Exercise {ref}: tender documents sent for approval"),
  exApprovedForTendering: w("Exercise {ref} approved for tendering"),
  exAdvertised: w("Exercise {ref} advertised"),
  exInvited: w("Exercise {ref}: letters of invitation issued"),
  exOpeningInProgress: w("Exercise {ref}: tender box opened at its opening"),
  exOpened: w("Exercise {ref}: opening finalised"),
  exUnderEvaluation: w("Exercise {ref}: under evaluation"),
  exEvaluated: w("Exercise {ref}: evaluation report issued"),
  exCancelled: w("Exercise {ref} cancelled"),
  exOpenedFor: w("Exercise {ref} opened for {req}"),
  exOpenedPlain: w("Exercise {ref} opened"),

  // a requisition
  reqFromFinance: w("received from the finance system"),
  reqRaised: w("raised"),
  reqReturnedEarlier: w("returned to an earlier step"),
  reqSentForApproval: w("sent for approval"),
  reqSentBack: w("sent back to whoever raised it"),
  reqRejected: w("rejected"),
  reqEndorsed: w("endorsed"),
  reqRegistered: w("registered"),
  reqOverBudget: w("is over budget"),
  reqApproved: w("approved"),
  reqRecalled: w("recalled"),
  reqCancelled: w("cancelled"),
  reqClosed: w("closed"),

  // an approval step
  stepPassed: w("{ref}: {office} step passed to {acting}"),
  stepDecided: w("{ref}: {office} decided"),
  stepRejected: w("{ref}: {office} rejected"),

  // an award
  awardLabel: w("Award {ref}"),
  awardOpened: w("opened"),
  awardSentForApproval: w("sent for approval"),
  awardApproved: w("approved"),
  awardIssued: w("issued"),
  awardAccepted: w("accepted"),
  awardCancelled: w("cancelled"),
  awardCommenced: w("{label}: work commenced {date}"),

  // a matter tabled at a sitting
  outcomeCarried: w("carried"),
  outcomeNotCarried: w("not carried"),
  outcomeDeferred: w("deferred"),
  matterTabledAt: w("{subject} tabled at {at}"),
  matterTabled: w("{subject} tabled"),
  matterOutcome: w("{subject}: {verb}"),

  // a sitting
  sittingOf: w("{committee} sitting"),
  sittingRef: w("Sitting {ref}"),
  sittingScheduled: w("{name} scheduled"),
  sittingScheduledFor: w("{name} scheduled for {date}"),
  sittingStarted: w("started"),
  sittingMinuted: w("minuted"),
  sittingCancelled: w("cancelled"),

  // the lines made of several acts of one moment
  foldRejectedAt: w("{subject} rejected at {office}{end}"),
  foldAnd: w("and"),
  foldCancelledRefused: w("Exercise {subject} cancelled: {office} refused the name"),
  foldReturnedAt: w("Exercise {subject}: tender documents returned for amendment at {office}"),
  foldApprovedAt: w("{subject} approved at {office}"),
  foldTenderingAt: w("Exercise {subject} approved for tendering at {office}"),
} as const;

