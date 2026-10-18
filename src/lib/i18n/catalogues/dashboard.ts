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

import type { Catalogue } from "../registry";

export const GREETING = {
  morning: w("Good morning", "Selamat pagi"),
  afternoon: w("Good afternoon", "Selamat petang"),
  evening: w("Good evening", "Selamat malam"),
  /** No time zone is set, so no time of day is claimed. */
  welcome: w("Welcome", "Selamat datang"),
} as const;

/** The state of an exercise, as the Sourcing screens name it, for the hover on the dashboard's Sourcing card. */
export const EXERCISE_STATUS_WORDS: Readonly<Record<ExerciseStatus, Words>> = {
  DRAFT: w("Draft", "Draf"),
  DOCUMENTS_IN_PREPARATION: w("Documents in preparation", "Dokumen sedang disediakan"),
  PENDING_APPROVAL_FOR_TENDERING: w("Awaiting approval for tendering", "Menunggu kelulusan untuk tender"),
  APPROVED_FOR_TENDERING: w("Approved for tendering", "Diluluskan untuk tender"),
  ADVERTISED: w("Advertised", "Diiklankan"),
  INVITED: w("Invited", "Dijemput"),
  OPENING_IN_PROGRESS: w("Opening in progress", "Pembukaan sedang berjalan"),
  OPENED: w("Opened", "Dibuka"),
  UNDER_EVALUATION: w("Under evaluation", "Sedang dinilai"),
  EVALUATED: w("Evaluated", "Telah dinilai"),
  CANCELLED: w("Cancelled", "Dibatalkan"),
};

/** The three phases of an open exercise (`phaseSummary`), lower case because they follow a number. */
export const EXERCISE_PHASE_WORDS = {
  PREPARING: w("preparing", "dalam penyediaan"),
  IN_MARKET: w("out to market", "di pasaran"),
  EVALUATING: w("at opening or evaluation", "pada pembukaan atau penilaian"),
} as const;

export const BREAKDOWN_WORDS = {
  cancelledNotCounted: w("{count} cancelled, not counted", "{count} dibatalkan, tidak dikira"),
} as const;

/** Waiting counts from when the step opened (`WAITING_RULE_TEXT` in `@/lib/approvals/queue`, which a test holds to this English). */
export const WAITING_RULE_WORDS = w(
  "Waiting counts from when the step opened: the day the step before it was decided, or the day the route opened for the first step. Escalating a step to another office does not restart it.",
  "Tempoh menunggu dikira dari saat langkah itu dibuka: hari langkah sebelumnya diputuskan, atau hari laluan dibuka bagi langkah pertama. Menaikkan langkah kepada pejabat lain tidak memulakannya semula.",
);

export const DASHBOARD_WORDS = {
  setupTitle: w("Nothing configured yet", "Belum ada yang dikonfigurasi"),
  setupRun: w("Run", "Jalankan"),
  setupLoad: w("to load the organisation.", "untuk memuatkan organisasi."),
  newRequisition: w("New requisition", "Permintaan baharu"),

  awaitingMyDecision: w("Awaiting my decision", "Menunggu keputusan saya"),
  stepsWaitingForYou: w("steps waiting for you", "langkah menunggu anda"),
  nothingWaitingForYou: w("nothing is waiting for you", "tiada yang menunggu anda"),
  requisitions: w("Requisitions", "Permintaan"),
  sourcing: w("Sourcing", "Sumber Perolehan"),
  contracts: w("Contracts", "Kontrak"),
  noneInPipeline: w("none in the pipeline", "tiada dalam saluran"),
  requisitionHint: w("{approved} approved, waiting for sourcing · {back} back with the requester", "{approved} diluluskan, menunggu sumber perolehan · {back} dikembalikan kepada pemohon"),
  contractsHint: w("{awarding} awarding · {signing} signing · {onSite} on site", "{awarding} pemberian · {signing} menandatangani · {onSite} di tapak"),

  committeeTitle: w("Committee matters waiting", "Perkara jawatankuasa yang menunggu"),
  committeeSubtitle: w("Matters routed to a committee, oldest first.", "Perkara yang dihalakan kepada jawatankuasa, yang paling lama dahulu."),
  viewAll: w("View all", "Lihat semua"),
  searchMatters: w("Search matters…", "Cari perkara…"),
  committeeEmptyTitle: w("No committee matter is waiting", "Tiada perkara jawatankuasa yang menunggu"),
  committeeEmptyBody: w("Matters routed to a committee appear here the moment they are raised.", "Perkara yang dihalakan kepada jawatankuasa muncul di sini sebaik sahaja ia dibangkitkan."),
  financialItems: w("Financial items", "Perkara kewangan"),
  type: w("Type", "Jenis"),
  committee: w("Committee", "Jawatankuasa"),
  openTheSitting: w("Open the sitting", "Buka mesyuarat"),
  item: w("Item", "Perkara"),
  value: w("Value", "Nilai"),
  waiting: w("Waiting", "Menunggu"),
  with: w("With", "Bersama"),
  daysShort: w("{days}d", "{days}h"),
  votesCast: w("{cast} of {entitled} voted", "{cast} daripada {entitled} telah mengundi"),

  awaitingTitle: w("Requisitions awaiting approval", "Permintaan menunggu kelulusan"),
  awaitingLead: w("Open approval routes, longest wait first.", "Laluan kelulusan yang terbuka, yang paling lama menunggu dahulu."),
  awaitingMore: w("Each step shows the office acting for it.", "Setiap langkah menunjukkan pejabat yang bertindak bagi pihaknya."),
  myApprovals: w("My approvals", "Kelulusan saya"),
  awaitingEmptyTitle: w("No requisition is awaiting approval", "Tiada permintaan yang menunggu kelulusan"),
  awaitingEmptyBody: w("A requisition appears here once it is submitted, until its route closes.", "Permintaan muncul di sini selepas dihantar, sehingga laluannya ditutup."),
  open: w("Open", "Buka"),
  requisition: w("Requisition", "Permintaan"),
  waitingOn: w("Waiting on", "Menunggu"),
  escalatedFrom: w("escalated from {office}", "dinaikkan daripada {office}"),
  noStepPending: w("No step pending", "Tiada langkah yang tertunda"),
  notCounted: w("Not counted", "Tidak dikira"),

  onTheWay: w("On the way", "Akan datang"),
  onTheWaySubtitle: w("These will report here once their modules are built.", "Ini akan dilaporkan di sini selepas modulnya dibina."),
  notBuiltYet: w("Not built yet", "Belum dibina"),
  projectHealth: w("Project health", "Kesihatan projek"),
  projectHealthBody: w("Progress, certified value and time remaining will report here once contract administration lands.", "Kemajuan, nilai yang disahkan dan masa yang berbaki akan dilaporkan di sini selepas pentadbiran kontrak tersedia."),

  upcomingTitle: w("Upcoming sittings", "Mesyuarat akan datang"),
  upcomingSubtitle: w("Committees scheduled to sit.", "Jawatankuasa yang dijadualkan bersidang."),
  nothingScheduled: w("Nothing scheduled", "Tiada yang dijadualkan"),
  today: w("today", "hari ini"),
  inDays: w("in {days} days", "dalam {days} hari"),

  recentTitle: w("Recent activity", "Aktiviti terkini"),
  recentSubtitle: w("Requisitions, sittings and awards as they move.", "Permintaan, mesyuarat dan anugerah apabila ia bergerak."),
  nothingMoved: w("Nothing has moved yet", "Belum ada yang bergerak"),
  nothingMovedBody: w("Requisitions, sittings and awards appear here as they change.", "Permintaan, mesyuarat dan anugerah muncul di sini apabila ia berubah."),

  changePassword: w("Change password", "Tukar kata laluan"),
  haveSeenThis: w("I have seen this", "Saya telah melihat ini"),
  failedAttempts: w("{count} failed attempts to sign in to your account since you last signed in", "{count} percubaan log masuk yang gagal ke akaun anda sejak log masuk terakhir anda"),
  failedAttempt: w("{count} failed attempt to sign in to your account since you last signed in", "{count} percubaan log masuk yang gagal ke akaun anda sejak log masuk terakhir anda"),
  notYou: w("If this was not you, change your password and tell an administrator.", "Jika ini bukan anda, tukar kata laluan anda dan maklumkan kepada pentadbir."),
  reviewSignIns: w("Review sign-ins", "Semak log masuk"),
} as const;

/** "Recent activity": the verbs that follow a subject, and the sentences with values. */
export const ACTIVITY_WORDS = {
  // an exercise's move into each state
  exReturned: w("Exercise {ref}: tender documents returned for amendment", "Urusan {ref}: dokumen tender dikembalikan untuk pindaan"),
  exPreparation: w("Exercise {ref} moved into preparation", "Urusan {ref} masuk ke penyediaan"),
  exSentForApproval: w("Exercise {ref}: tender documents sent for approval", "Urusan {ref}: dokumen tender dihantar untuk kelulusan"),
  exApprovedForTendering: w("Exercise {ref} approved for tendering", "Urusan {ref} diluluskan untuk tender"),
  exAdvertised: w("Exercise {ref} advertised", "Urusan {ref} diiklankan"),
  exInvited: w("Exercise {ref}: letters of invitation issued", "Urusan {ref}: surat jemputan dikeluarkan"),
  exOpeningInProgress: w("Exercise {ref}: tender box opened at its opening", "Urusan {ref}: peti tender dibuka semasa pembukaan"),
  exOpened: w("Exercise {ref}: opening finalised", "Urusan {ref}: pembukaan dimuktamadkan"),
  exUnderEvaluation: w("Exercise {ref}: under evaluation", "Urusan {ref}: sedang dinilai"),
  exEvaluated: w("Exercise {ref}: evaluation report issued", "Urusan {ref}: laporan penilaian dikeluarkan"),
  exCancelled: w("Exercise {ref} cancelled", "Urusan {ref} dibatalkan"),
  exOpenedFor: w("Exercise {ref} opened for {req}", "Urusan {ref} dibuka untuk {req}"),
  exOpenedPlain: w("Exercise {ref} opened", "Urusan {ref} dibuka"),

  // a requisition
  reqFromFinance: w("received from the finance system", "diterima daripada sistem kewangan"),
  reqRaised: w("raised", "dibangkitkan"),
  reqReturnedEarlier: w("returned to an earlier step", "dikembalikan ke langkah terdahulu"),
  reqSentForApproval: w("sent for approval", "dihantar untuk kelulusan"),
  reqSentBack: w("sent back to whoever raised it", "dikembalikan kepada pembangkitnya"),
  reqRejected: w("rejected", "ditolak"),
  reqEndorsed: w("endorsed", "disokong"),
  reqRegistered: w("registered", "didaftarkan"),
  reqOverBudget: w("is over budget", "melebihi bajet"),
  reqApproved: w("approved", "diluluskan"),
  reqRecalled: w("recalled", "ditarik balik"),
  reqCancelled: w("cancelled", "dibatalkan"),
  reqClosed: w("closed", "ditutup"),

  // an approval step
  stepPassed: w("{ref}: {office} step passed to {acting}", "{ref}: langkah {office} dipindahkan kepada {acting}"),
  stepDecided: w("{ref}: {office} decided", "{ref}: {office} telah memutuskan"),
  stepRejected: w("{ref}: {office} rejected", "{ref}: {office} menolak"),

  // an award
  awardLabel: w("Award {ref}", "Anugerah {ref}"),
  awardOpened: w("opened", "dibuka"),
  awardSentForApproval: w("sent for approval", "dihantar untuk kelulusan"),
  awardApproved: w("approved", "diluluskan"),
  awardIssued: w("issued", "dikeluarkan"),
  awardAccepted: w("accepted", "diterima"),
  awardCancelled: w("cancelled", "dibatalkan"),
  awardCommenced: w("{label}: work commenced {date}", "{label}: kerja bermula {date}"),

  // a matter tabled at a sitting
  outcomeCarried: w("carried", "diluluskan"),
  outcomeNotCarried: w("not carried", "tidak diluluskan"),
  outcomeDeferred: w("deferred", "ditangguhkan"),
  matterTabledAt: w("{subject} tabled at {at}", "{subject} dibentangkan di {at}"),
  matterTabled: w("{subject} tabled", "{subject} dibentangkan"),
  matterOutcome: w("{subject}: {verb}", "{subject}: {verb}"),

  // a sitting
  sittingOf: w("{committee} sitting", "Mesyuarat {committee}"),
  sittingRef: w("Sitting {ref}", "Mesyuarat {ref}"),
  sittingScheduled: w("{name} scheduled", "{name} dijadualkan"),
  sittingScheduledFor: w("{name} scheduled for {date}", "{name} dijadualkan pada {date}"),
  sittingStarted: w("started", "dimulakan"),
  sittingMinuted: w("minuted", "diminitkan"),
  sittingCancelled: w("cancelled", "dibatalkan"),

  // the lines made of several acts of one moment
  foldRejectedAt: w("{subject} rejected at {office}{end}", "{subject} ditolak di {office}{end}"),
  foldAnd: w("and", "dan"),
  foldCancelledRefused: w("Exercise {subject} cancelled: {office} refused the name", "Urusan {subject} dibatalkan: {office} menolak nama itu"),
  foldReturnedAt: w("Exercise {subject}: tender documents returned for amendment at {office}", "Urusan {subject}: dokumen tender dikembalikan untuk pindaan di {office}"),
  foldApprovedAt: w("{subject} approved at {office}", "{subject} diluluskan di {office}"),
  foldTenderingAt: w("Exercise {subject} approved for tendering at {office}", "Urusan {subject} diluluskan untuk tender di {office}"),
} as const;

const prefixed = (prefix: string, table: Readonly<Record<string, Words>>): Record<string, Words> =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [`${prefix}${k}`, v]));

export const DASHBOARD: Catalogue = {
  name: "dashboard",
  review: "DRAFTED_NOT_REVIEWED",
  words: {
    ...prefixed("greeting.", GREETING),
    ...prefixed("exerciseStatus.", EXERCISE_STATUS_WORDS),
    ...prefixed("exercisePhase.", EXERCISE_PHASE_WORDS),
    ...prefixed("breakdown.", BREAKDOWN_WORDS),
    waitingRule: WAITING_RULE_WORDS,
    ...prefixed("dashboard.", DASHBOARD_WORDS),
    ...prefixed("activity.", ACTIVITY_WORDS),
  },
};
