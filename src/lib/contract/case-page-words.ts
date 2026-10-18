/**
 * The words of the Contracts screens that are converted to Bahasa Malaysia (NFR-LNG-001, ADR 0040, N1 step 4): the case list and its three
 * sibling views, and the case page's header, step bar, tab strip, panel headings and refusals. The Malay is drafted in this slice and is
 * not yet reviewed by the customer, so both catalogues here are DRAFTED_NOT_REVIEWED.
 *
 * What stays English on the case page (ADR 0040 Q1): the "What's next" sentence under the step bar, the page's own warning callouts, every
 * panel body and drawer form, and the messages actions return. The page is PARTLY converted and says so.
 *
 * Terms follow the shell and the earlier staff Malay: an award is "anugerah", a sourcing exercise "urusan", a requisition "permintaan".
 * "In Delay" is the contract's defined state (FR-SUP-010), drafted as "Dalam Kelewatan". A pair with `{name}` is a sentence with values.
 */

import type { AwardStatus, InstrumentKind } from "@/lib/award/types";

import type { Catalogue } from "@/lib/i18n/registry";

import type { CaseStepKey } from "./case-steps";
import { w, type Words } from "./labels";

// ------------------------------------------------------------------ the case page

/** The five steps of the step bar. */
export const CASE_STEP_WORDS: Readonly<Record<CaseStepKey, Words>> = {
  award: w("Award", "Anugerah"),
  "before-signing": w("Before signing", "Sebelum menandatangani"),
  signing: w("Signing", "Menandatangani"),
  project: w("Project", "Projek"),
  "close-out": w("Close-out", "Penutupan"),
};

/** The tab strip of the case: its ids are `CASE_TABS`'. */
export const CASE_TAB_WORDS: Readonly<Record<string, Words>> = {
  overview: w("Overview", "Gambaran keseluruhan"),
  approval: w("Approval", "Kelulusan"),
  instrument: w("Letter", "Surat"),
  distribution: w("Distribution", "Pengedaran"),
  return: w("Return", "Pulangan"),
  routing: w("Routing sheet", "Helaian penghalaan"),
  conditions: w("Conditions", "Syarat"),
  securities: w("Securities and insurance", "Sekuriti dan insurans"),
  formation: w("Formation", "Pembentukan"),
  baseline: w("Baseline", "Garis dasar"),
  team: w("Team", "Pasukan"),
  site: w("Site", "Tapak"),
  payments: w("Payments", "Bayaran"),
  variations: w("Variations", "Perubahan"),
  documents: w("Documents", "Dokumen"),
  submissions: w("Submissions", "Penyerahan"),
};

/** The second level under a tab, keyed `<tab>.<section>`. */
export const CASE_SECTION_WORDS: Readonly<Record<string, Words>> = {
  "formation.assembly": w("Assembly", "Himpunan"),
  "formation.checks": w("Reconciliation and checks", "Penyesuaian dan semakan"),
  "formation.legal": w("Legal review", "Semakan undang-undang"),
  "formation.signing": w("Signing", "Menandatangani"),
  "formation.copies": w("Copies and custody", "Salinan dan jagaan"),
  "payments.valuations": w("Valuations", "Penilaian"),
  "payments.retention": w("Retention", "Wang tahanan"),
  "payments.advance": w("Advance payment", "Bayaran pendahuluan"),
  "payments.damages": w("Liquidated damages", "Ganti rugi tertentu"),
  "site.start": w("Possession and progress", "Milikan dan kemajuan"),
  "site.diary": w("Site diary", "Diari tapak"),
  "site.oversight": w("Oversight", "Penyeliaan"),
  "site.records": w("Site records", "Rekod tapak"),
  "variations.variations": w("Variations", "Perubahan"),
  "variations.adjustments": w("Adjustments of the contract sum", "Pelarasan jumlah kontrak"),
};

/** The main button that links to the panel holding an act's drawer. */
export const CASE_LINK_ACTION_WORDS = {
  RECORD_DESPATCH: w("Record despatch", "Rekod penghantaran"),
  RECORD_RETURN: w("Record the return", "Rekod pulangan"),
  LODGE_SECURITY: w("Lodge a security", "Failkan sekuriti"),
  VERIFY_SECURITY: w("Verify securities", "Sahkan sekuriti"),
  SUBMIT_TO_LEGAL: w("Send to the legal office", "Hantar ke pejabat undang-undang"),
  RECORD_SIGNATURE: w("Record the signatures", "Rekod tandatangan"),
  RECORD_STAMPING: w("Record the stamping", "Rekod penyetemenan"),
  RECORD_POSSESSION: w("Record possession of site", "Rekod milikan tapak"),
} as const;

export const CASE_HEADER_WORDS = {
  contracts: w("Contracts", "Kontrak"),
  contractNumber: w("Contract {number}", "Kontrak {number}"),
  contractDate: w("Contract Date {date}", "Tarikh Kontrak {date}"),
  notSigned: w("Not signed", "Belum ditandatangani"),
  forExercise: w("for", "untuk"),
  stagesLabel: w("Stages of this case", "Peringkat kes ini"),
  whatsNextOn: w("What's next on {step}:", "Seterusnya pada {step}:"),
  awardRestricted: w("restricted to the people named on the exercise", "terhad kepada orang yang dinamakan pada urusan"),
  instrument: w("Instrument", "Instrumen"),
  caseTabs: w("Case", "Kes"),
} as const;

/** The award's status (the badge before there is a contract) and the instrument's short name. */
export const AWARD_STATUS_WORDS: Readonly<Record<AwardStatus, Words>> = {
  DRAFT: w("Draft", "Draf"),
  PENDING_APPROVAL: w("Awaiting approval", "Menunggu kelulusan"),
  APPROVED: w("Approved, not issued", "Diluluskan, belum dikeluarkan"),
  ISSUED: w("Issued", "Dikeluarkan"),
  ACCEPTED: w("Accepted", "Diterima"),
  CANCELLED: w("Cancelled", "Dibatalkan"),
};
export const INSTRUMENT_SHORT_WORDS: Readonly<Record<InstrumentKind, Words>> = {
  LETTER_OF_ACCEPTANCE: w("Letter of Acceptance", "Surat Setuju Terima"),
  WORK_INDENT: w("Work indent", "Indent kerja"),
};

/** The refusals the page renders itself, and the notices that stand in for a panel. */
export const CASE_REFUSAL_WORDS = {
  conditionsRestrictedTitle: w("Adding and settling conditions is restricted", "Menambah dan menyelesaikan syarat adalah terhad"),
  conditionsRestrictedBody: w(
    "Adding and settling the award's conditions is restricted to the people named on the exercise. Their state shows on the Project overview.",
    "Menambah dan menyelesaikan syarat anugerah terhad kepada orang yang dinamakan pada urusan. Keadaannya dipaparkan pada gambaran keseluruhan Projek.",
  ),
  awardStageRestrictedTitle: w("The award stage is restricted", "Peringkat anugerah adalah terhad"),
  awardStageRestrictedBody: w(
    "The award stage of this exercise is restricted to the people named on it. The contract stages are open to you.",
    "Peringkat anugerah bagi urusan ini terhad kepada orang yang dinamakan padanya. Peringkat kontrak terbuka kepada anda.",
  ),
  notJudged: w("Not judged", "Belum dinilai"),
  setTimeZoneFirst: w("Set the organisation's time zone first.", "Tetapkan zon waktu organisasi dahulu."),
  closeOutParked: w("Parked until after go-live", "Ditangguhkan sehingga selepas beroperasi"),
  recordWagesCheck: w("Record the wages check", "Rekod semakan upah"),
  verifyPolicyAbove: w("Verify the policy above first.", "Sahkan polisi di atas dahulu."),
  verifyPolicyFirst: w("Verify the policy first.", "Sahkan polisi dahulu."),
  revisedSumUnreadable: w("The revised contract sum cannot be read", "Jumlah kontrak yang disemak tidak dapat dibaca"),
  openTheCertificate: w("Open the certificate", "Buka sijil"),
  employerSignedBy: w("The employer's amendments are signed by {office}.", "Pindaan majikan ditandatangani oleh {office}."),
  officeNoLongerConfigured: w("an office no longer configured", "pejabat yang tidak lagi dikonfigurasi"),
  employerSigningNotSet: w("Employer's signing office not set", "Pejabat penandatangan majikan belum ditetapkan"),
  employerSigningNotSetWhy: w("An amendment is still recorded, with the offices its signer held on the day.", "Pindaan masih direkodkan, bersama pejabat yang dipegang penandatangannya pada hari itu."),
  employerSigningSetUnder: w("It is set under Configuration › Contract controls.", "Ia ditetapkan di bawah Konfigurasi › Kawalan kontrak."),
} as const;

/** Every card heading on the case page and in the panels it renders. */
export const CASE_PANEL_TITLE_WORDS = {
  notStarted: w("Not started", "Belum dimulakan"),
  theContract: w("The contract", "Kontrak"),
  readyToSign: w("Ready to sign?", "Sedia untuk ditandatangani?"),
  awardConditions: w("The award's conditions", "Syarat anugerah"),
  securitiesAndInsurance: w("Securities and insurance", "Sekuriti dan insurans"),
  securitiesAndInsurances: w("Securities and insurances", "Sekuriti dan insurans"),
  wagesCheck: w("Workmen's compensation wages check", "Semakan upah pampasan pekerja"),
  theAward: w("The award", "Anugerah"),
  // formation
  contractDocument: w("The Contract Document", "Dokumen Kontrak"),
  reconciliation: w("Reconciliation", "Penyesuaian"),
  beforeSignature: w("Before signature", "Sebelum tandatangan"),
  stampingAtLhdn: w("Stamping at LHDN", "Penyetemenan di LHDN"),
  integrityPact: w("Integrity Pact, Stage Three", "Pakatan Integriti, Peringkat Ketiga"),
  originalsInCustody: w("Originals in custody", "Dokumen asal dalam jagaan"),
  // payments
  payments: w("Payments", "Bayaran"),
  valuationCalendar: w("Valuation calendar", "Kalendar penilaian"),
  valuationsAndCertificates: w("Valuations and their certificates", "Penilaian dan sijilnya"),
  materialsOnSite: w("Materials on site", "Bahan di tapak"),
  nominatedParties: w("Nominated parties and assignees", "Pihak yang dinamakan dan penerima serah hak"),
  deductionsKeyed: w("Deductions keyed", "Potongan yang dimasukkan"),
  certificateAsItStands: w("The certificate as it stands", "Sijil seperti sedia ada"),
  retention: w("Retention", "Wang tahanan"),
  advancePayments: w("Advance payments", "Bayaran pendahuluan"),
  liquidatedDamages: w("Liquidated damages", "Ganti rugi tertentu"),
  warningLetters: w("Warning letters", "Surat amaran"),
  // supervision
  onSite: w("On site", "Di tapak"),
  programme: w("Programme", "Program"),
  progress: w("Progress", "Kemajuan"),
  siteDiary: w("Site diary", "Diari tapak"),
  endorsements: w("Endorsements", "Pengesahan"),
  specialSiteMeetings: w("Special site meetings", "Mesyuarat tapak khas"),
  complianceObservations: w("Compliance observations", "Pemerhatian pematuhan"),
  directionsOnProgramme: w("Directions on the programme", "Arahan mengenai program"),
  earlyAction: w("Early action", "Tindakan awal"),
  premiumsPaid: w("Premiums paid by the employer", "Premium yang dibayar oleh majikan"),
  handedOver: w("Handed over", "Diserahkan"),
  // variations, baseline, documents
  contractSumAndVariations: w("The contract sum and its variations", "Jumlah kontrak dan perubahannya"),
  variations: w("Variations", "Perubahan"),
  versions: w("Versions", "Versi"),
  certificates: w("Certificates", "Sijil"),
  signatures: w("Signatures", "Tandatangan"),
  controlledCopies: w("Controlled copies", "Salinan terkawal"),
  legalReviewBy: w("Legal review by {office}", "Semakan undang-undang oleh {office}"),
  openingPosition: w("Opening position", "Kedudukan permulaan"),
  releases: w("Releases", "Pelepasan"),
  nonCompletionDecisions: w("Non-completion decisions", "Keputusan ketidaksempurnaan"),
  superintendingOfficer: w("Superintending Officer", "Pegawai Penguasa"),
  representatives: w("Representatives", "Wakil"),
  possessionOfSite: w("Possession of site", "Milikan tapak"),
  adjustmentsOfContractSum: w("Adjustments of the contract sum", "Pelarasan jumlah kontrak"),
  theDraft: w("The draft", "Draf"),
  versionInForce: w("Version {version} in force", "Versi {version} berkuat kuasa"),
  // the award's panels
  whoApproves: w("Who approves the appointment", "Siapa yang meluluskan pelantikan"),
  approvalOfAppointment: w("Approval of the appointment", "Kelulusan pelantikan"),
  routingSheet: w("Routing sheet", "Helaian penghalaan"),
  whoSigns: w("Who signs the instrument", "Siapa yang menandatangani instrumen"),
  earlierRoutes: w("Earlier routes", "Laluan terdahulu"),
  conditionsPrecedent: w("Conditions precedent to signing", "Syarat terdahulu sebelum menandatangani"),
  beforeWorkStarts: w("Before work starts", "Sebelum kerja bermula"),
  distribution: w("Distribution", "Pengedaran"),
  documents: w("Documents", "Dokumen"),
  contractAndCommitment: w("Contract and commitment", "Kontrak dan komitmen"),
  lettersTerms: w("The letter's terms", "Terma surat"),
  returnedItems: w("What came back (integrity pact, second stage)", "Yang dikembalikan (pakatan integriti, peringkat kedua)"),
  acceptancePage: w("The acceptance page", "Halaman penerimaan"),
  performanceBond: w("The performance bond", "Bon pelaksanaan"),
  securitiesLodged: w("Securities lodged", "Sekuriti yang difailkan"),
  insurance: w("Insurance", "Insurans"),
} as const;

// ------------------------------------------------------------------ the case list and its sibling views

/** The chips on a case's row (`awardChips`) and the other words a row writes. */
export const CASE_CHIP_WORDS = {
  returned: w("Returned", "Dipulangkan"),
  awaitingReturn: w("Awaiting return", "Menunggu pulangan"),
  toVerify: w("{count} to verify", "{count} untuk disahkan"),
  securitiesVerified: w("Securities verified", "Sekuriti disahkan"),
  noSecuritiesLodged: w("No securities lodged", "Tiada sekuriti difailkan"),
  noCommitmentNumber: w("No commitment number", "Tiada nombor komitmen"),
  indentExpired: w("Indent expired", "Indent tamat tempoh"),
  toIssue: w("To issue", "Untuk dikeluarkan"),
  withTheApprovers: w("With the approvers", "Bersama pelulus"),
  beingPrepared: w("Being prepared", "Sedang disediakan"),
} as const;

export const CASES_LIST_WORDS = {
  title: w("Contracts", "Kontrak"),
  subtitle: w("Every award from the day it is started, then its contract, to site and close.", "Setiap anugerah dari hari ia dimulakan, kemudian kontraknya, hingga ke tapak dan penutupan."),
  nAwarding: w("{count} awarding", "{count} pemberian"),
  nSigning: w("{count} signing", "{count} menandatangani"),
  nOnSite: w("{count} on site", "{count} di tapak"),
  nAwaitingConditions: w("{count} awaiting conditions", "{count} menunggu syarat"),
  nReadyToSign: w("{count} ready to sign", "{count} sedia ditandatangani"),
  nInDelay: w("{count} In Delay", "{count} Dalam Kelewatan"),
  nStraightLine: w(", {count} on the straight-line reading", ", {count} mengikut bacaan garis lurus"),
  stillToComeTitle: w("Still to come here", "Masih akan datang di sini"),
  stillToComeBody: w(
    "Possession of site, supervision and site records are recorded on each contract's Team and Site tabs; valuations, interim certificates, retention, the warning letter, the Certificate of Non-Completion and liquidated damages on its Payments tab; variations and the adjustment of the contract sum on its Variations tab. Still to come: extensions of time and the rest of the time and default chain; completion, defects, nominated parties and the final account. Each contract's baseline here is what they will read.",
    "Milikan tapak, penyeliaan dan rekod tapak direkodkan pada tab Pasukan dan Tapak setiap kontrak. Penilaian, sijil interim, wang tahanan, surat amaran, Sijil Ketidaksempurnaan dan ganti rugi tertentu pada tab Bayaran. Perubahan dan pelarasan jumlah kontrak pada tab Perubahan. Masih akan datang: lanjutan masa dan selebihnya rantaian masa dan kemungkiran, serta penyempurnaan, kecacatan, pihak yang dinamakan dan akaun akhir. Garis dasar setiap kontrak di sini ialah apa yang akan dibaca oleh semua itu.",
  ),
  casesInDelay: w("Cases In Delay", "Kes Dalam Kelewatan"),
  allCases: w("All cases", "Semua kes"),
  delaySubtitle: w("Every contract In Delay today, judged across all of them, newest first.", "Setiap kontrak yang Dalam Kelewatan hari ini, dinilai merentas kesemuanya, yang terbaharu dahulu."),
  delayBasis: w("Planned progress between the approved programme's points is read on a straight line.", "Kemajuan yang dirancang antara titik program yang diluluskan dibaca pada garis lurus."),
  defaultSubtitle: w("Newest first. A case begins as an award and gets a contract number when its instrument is issued.", "Yang terbaharu dahulu. Satu kes bermula sebagai anugerah dan mendapat nombor kontrak apabila instrumennya dikeluarkan."),
  commencedPending: w("Commenced pending approval ({count})", "Dimulakan menunggu kelulusan ({count})"),
  securitiesExpiring: w("Securities expiring or not verified ({count})", "Sekuriti hampir tamat atau belum disahkan ({count})"),
  submissionsWaiting: w("Submissions waiting ({count})", "Penyerahan menunggu ({count})"),
  stagesNav: w("Stages", "Peringkat"),
  workNav: w("Awards that need work", "Anugerah yang memerlukan tindakan"),
  allCount: w("All ({count})", "Semua ({count})"),
  inDelayCount: w("In Delay ({count})", "Dalam Kelewatan ({count})"),
  viewCount: w("{label} ({count})", "{label} ({count})"),
  validityNotSet: w("{label} (validity not set)", "{label} (kesahihan belum ditetapkan)"),
  search: w("Search by title, number or contractor", "Cari mengikut tajuk, nombor atau kontraktor"),
  noneInDelay: w("None In Delay", "Tiada yang Dalam Kelewatan"),
  noneHere: w("None here", "Tiada di sini"),
  noCasesYet: w("No cases yet", "Belum ada kes"),
  noContractInDelay: w("No contract is In Delay today.", "Tiada kontrak yang Dalam Kelewatan hari ini."),
  noCaseAtStage: w("No case is at this stage.", "Tiada kes pada peringkat ini."),
  startAward: w("An award is started from its exercise's Award tab.", "Anugerah dimulakan daripada tab Anugerah urusannya."),
  stage: w("Stage", "Peringkat"),
  open: w("Open", "Buka"),
  colCase: w("Case", "Kes"),
  colContractor: w("Contractor", "Kontraktor"),
  colValue: w("Value", "Nilai"),
  colStage: w("Stage", "Peringkat"),
  colStatus: w("Status", "Status"),
  colDates: w("Dates", "Tarikh"),
  inDelay: w("In Delay", "Dalam Kelewatan"),
  contractNumber: w("Contract {number}", "Kontrak {number}"),
  noContractYet: w("{reference} · no contract number yet", "{reference} · belum ada nombor kontrak"),
  contractDate: w("Contract Date {date}", "Tarikh Kontrak {date}"),
  notSigned: w("Not signed", "Belum ditandatangani"),
  completion: w("Completion {date}", "Siap {date}"),
  completionNotSet: w("Completion date not set until possession", "Tarikh siap tidak ditetapkan sehingga milikan"),
  contractNotNumbered: w("Contract not yet numbered", "Kontrak belum bernombor"),
  instrument: w("Instrument", "Instrumen"),
  pageRange: w("Cases {from}–{to} of {total}. Search and the filter look within this page.", "Kes {from}–{to} daripada {total}. Carian dan penapis hanya melihat dalam halaman ini."),
  previous: w("Previous", "Sebelumnya"),
  next: w("Next", "Seterusnya"),
  // the view of variations commenced pending approval
  commencedTitle: w("Commenced pending approval", "Dimulakan menunggu kelulusan"),
  commencedSubtitle: w(
    "Work started on the S.O.'s support before the variation's approval, across every contract, oldest first. {count} in all, an estimated {amount} not yet approved.",
    "Kerja dimulakan atas sokongan P.P. sebelum perubahan diluluskan, merentas semua kontrak, yang paling lama dahulu. {count} kesemuanya, anggaran {amount} belum diluluskan.",
  ),
  allContracts: w("All contracts", "Semua kontrak"),
  commencedSearch: w("Search by variation, contract or contractor", "Cari mengikut perubahan, kontrak atau kontraktor"),
  none: w("None", "Tiada"),
  noCommenced: w("No variation has commenced pending its approval.", "Tiada perubahan yang dimulakan menunggu kelulusannya."),
  colVariation: w("Variation", "Perubahan"),
  colContract: w("Contract", "Kontrak"),
  colEstimate: w("Estimate", "Anggaran"),
  colAge: w("Age", "Tempoh"),
  variationRef: w("Variation {reference}", "Perubahan {reference}"),
  variationUnnumbered: w("Variation (not yet numbered)", "Perubahan (belum bernombor)"),
  contractAndContractor: w("Contract {number} · {contractor}", "Kontrak {number} · {contractor}"),
  timeZoneNotSet: w("Time zone not set", "Zon waktu belum ditetapkan"),
  oneDay: w("{count} day", "{count} hari"),
  nDays: w("{count} days", "{count} hari"),
  commencedOn: w("Commenced {date}", "Dimulakan {date}"),
  variationsRange: w("Variations {from}–{to} of {total}. The totals above are over all of them.", "Perubahan {from}–{to} daripada {total}. Jumlah di atas meliputi kesemuanya."),
} as const;

/** The lodged securities and policies view (`?view=securities`). */
export const SECURITIES_VIEW_WORDS = {
  viewAttention: w("Expiring or not verified", "Hampir tamat atau belum disahkan"),
  viewExpiring: w("Expiring or expired", "Hampir tamat atau tamat"),
  viewUnverified: w("Lodged, not verified", "Difailkan, belum disahkan"),
  viewAll: w("All lodged", "Semua yang difailkan"),
  notOnList: w("Not on the approved list", "Tiada dalam senarai yang diluluskan"),
  retiredBefore: w("Retired from the list before it was lodged", "Digugurkan daripada senarai sebelum difailkan"),
  onListRetired: w("On the list when lodged; retired {date}", "Dalam senarai semasa difailkan, digugurkan {date}"),
  onList: w("On the approved list", "Dalam senarai yang diluluskan"),
  issuerNotRecorded: w("Issuer not recorded", "Pengeluar tidak direkodkan"),
  insurerNotRecorded: w("Insurer not recorded", "Penanggung insurans tidak direkodkan"),
  notRecorded: w("Not recorded", "Tidak direkodkan"),
  awardeeAndContract: w("{awardee} · contract {number}", "{awardee} · kontrak {number}"),
  title: w("Contracts", "Kontrak"),
  subtitle: w("Contracts after award: formed, signed, stamped and distributed, on a fixed baseline.", "Kontrak selepas anugerah: dibentuk, ditandatangani, disetem dan diedarkan, pada garis dasar yang tetap."),
  nLodgedNotVerified: w("{count} lodged, not verified", "{count} difailkan, belum disahkan"),
  nExpiring: w("{count} expiring or expired", "{count} hampir tamat atau tamat"),
  shownNotSentTitle: w("Shown here, not sent", "Dipaparkan di sini, tidak dihantar"),
  shownNotSentBody: w(
    "Expiry reminders are worked out from the notification rule for expiring securities and shown on this register. Nothing is sent from the portal in this phase.",
    "Peringatan tamat tempoh dikira daripada peraturan pemberitahuan bagi sekuriti yang hampir tamat dan dipaparkan pada daftar ini. Tiada apa-apa dihantar daripada portal dalam fasa ini.",
  ),
  cardTitle: w("Securities expiring or not verified", "Sekuriti hampir tamat atau belum disahkan"),
  cardSubtitle: w(
    "Live ones first, soonest to expire first; then those long expired, then those rejected. {unverified} lodged, not verified; {expiring} expiring or expired. {reminders}. Each is lodged and verified under Before signing, in the contract's securities and insurance panel.",
    "Yang aktif dahulu, yang paling hampir tamat dahulu. Kemudian yang telah lama tamat, kemudian yang ditolak. {unverified} difailkan, belum disahkan. {expiring} hampir tamat atau tamat. {reminders}. Setiap satu difailkan dan disahkan di bawah Sebelum menandatangani, dalam panel sekuriti dan insurans kontrak.",
  ),
  search: w("Search by contract, awardee or issuer", "Cari mengikut kontrak, penerima anugerah atau pengeluar"),
  nothingLodgedYet: w("Nothing lodged yet", "Belum ada yang difailkan"),
  nothingInView: w("Nothing in this view", "Tiada apa-apa dalam paparan ini"),
  emptyBody: w("Securities and policies are lodged on an award once its instrument is issued.", "Sekuriti dan polisi difailkan pada anugerah selepas instrumennya dikeluarkan."),
  colSecurity: w("Security", "Sekuriti"),
  colIssuer: w("Issuer", "Pengeluar"),
  colValue: w("Value", "Nilai"),
  colExpires: w("Expires", "Tamat"),
  colStatus: w("Status", "Status"),
  showing: w("Showing {from}–{to} of {total}", "Menunjukkan {from}–{to} daripada {total}"),
} as const;

export const SECURITY_KIND_WORDS = {
  PERFORMANCE_BOND: w("Performance bond", "Bon pelaksanaan"),
  ADVANCE_PAYMENT_GUARANTEE: w("Advance payment guarantee", "Jaminan bayaran pendahuluan"),
  DESIGN_GUARANTEE_BOND: w("Design guarantee bond", "Bon jaminan reka bentuk"),
  RETENTION_BOND: w("Retention bond", "Bon wang tahanan"),
} as const;
export const INSURANCE_KIND_WORDS = {
  WORKS: w("Works insurance", "Insurans kerja"),
  PUBLIC_LIABILITY: w("Public liability insurance", "Insurans liabiliti awam"),
  WORKMENS_COMPENSATION: w("Workmen's compensation insurance", "Insurans pampasan pekerja"),
  CAR: w("Contractor's all risks insurance", "Insurans semua risiko kontraktor"),
  EAR: w("Erection all risks insurance", "Insurans semua risiko pemasangan"),
} as const;
export const REGISTER_STATUS_WORDS = {
  LODGED: w("Lodged, not verified", "Difailkan, belum disahkan"),
  VERIFIED: w("Verified", "Disahkan"),
  REJECTED: w("Rejected", "Ditolak"),
} as const;

/** The expiry chip on a security (`expiryChip`) and the reminder intervals (`remindersText`). */
export const EXPIRY_WORDS = {
  expiredAgo: w("Expired {days} days ago", "Tamat {days} hari yang lalu"),
  expiresIn: w("Expires in {days} days", "Tamat dalam {days} hari"),
  noExpiry: w("No expiry recorded", "Tiada tarikh tamat direkodkan"),
  remindersAt: w("Reminders at {days} days", "Peringatan pada {days} hari"),
  remindersNotSet: w("Expiry reminders are not set", "Peringatan tamat tempoh belum ditetapkan"),
} as const;

/** The contractors' submissions view (`?view=submissions`) and the panel it shares with each contract's Submissions tab. */
export const SUBMISSIONS_WORDS = {
  nWaiting: w("{count} submissions waiting", "{count} penyerahan menunggu"),
  nOverdue: w("{count} past the due day", "{count} melepasi hari akhir"),
  overdueNotJudged: w("Overdue not judged: the time zone is not set", "Lewat tempoh tidak dinilai: zon waktu belum ditetapkan"),
  nAnswered: w("{count} answered", "{count} dijawab"),
  overdueNotJudgedTitle: w("Overdue is not judged", "Lewat tempoh tidak dinilai"),
  overdueNotJudgedBody: w(
    "The organisation's time zone is not set, so no submission is called overdue. Set it under Configuration, Organisation.",
    "Zon waktu organisasi belum ditetapkan, maka tiada penyerahan dikatakan lewat. Tetapkannya di bawah Konfigurasi, Organisasi.",
  ),
  serviceNotSetFor: w("{notSet} for {kinds}", "{notSet} bagi {kinds}"),
  everyKind: w("every kind", "setiap jenis"),
  serviceNotSetBody: w("A submission of a kind with no service level shows no due day and is never judged overdue. Set each under ", "Penyerahan bagi jenis yang tiada tahap perkhidmatan tidak menunjukkan hari akhir dan tidak pernah dinilai lewat. Tetapkan setiap satu di bawah "),
  postAwardControls: w("Configuration › Post-award controls", "Konfigurasi › Kawalan selepas anugerah"),
  waitingTitle: w("Submissions waiting", "Penyerahan menunggu"),
  waitingSubtitle: w(
    "Submissions contractors sent from their portal accounts, waiting for an answer, the longest waiting first{overdue}. {routing} The S.O. office's holders, or a representative whose letter lists contractor communication, answer each.",
    "Penyerahan yang dihantar kontraktor daripada akaun portal mereka, menunggu jawapan, yang paling lama menunggu dahulu{overdue}. {routing} Pemegang pejabat P.P., atau wakil yang suratnya menyenaraikan komunikasi kontraktor, menjawab setiap satu.",
  ),
  overdueUnjudged: w(", overdue is not judged because the organisation's time zone is not set", ", lewat tempoh tidak dinilai kerana zon waktu organisasi belum ditetapkan"),
  overduePast: w(", {count} of them past the due day", ", {count} daripadanya melepasi hari akhir"),
  routingStatement: w("Routed inside the portal to the contract's Superintending Officer; not sent by email (INT-09).", "Dihalakan dalam portal kepada Pegawai Penguasa kontrak. Tidak dihantar melalui e-mel (INT-09)."),
  nothingWaits: w("Nothing waits for an answer", "Tiada yang menunggu jawapan"),
  nothingWaitsBody: w(
    "A contractor's programme, claim, materials list, delay notice, defects report or notice that the statutory declaration is lodged appears here when it is sent.",
    "Program, tuntutan, senarai bahan, notis kelewatan, laporan kecacatan atau notis bahawa akuan berkanun difailkan oleh kontraktor muncul di sini apabila dihantar.",
  ),
  signedWithPassword: w("Signed with the contractor's password", "Ditandatangani dengan kata laluan kontraktor"),
  sentOn: w("sent {date}", "dihantar {date}"),
  claimed: w("claimed {amount}", "dituntut {amount}"),
  aboutDay: w("day {day}", "hari {day}"),
  routedTo: w("routed to {office}", "dihalakan kepada {office}"),
  routedToNobody: w("routed to nobody: no Superintending Officer was assigned", "tidak dihalakan kepada sesiapa: tiada Pegawai Penguasa ditetapkan"),
  rangeOf: w("{from}–{to} of {total}.{note}", "{from}–{to} daripada {total}.{note}"),
  searchLooksInPage: w(" Search and sort look within this page.", " Carian dan isihan hanya melihat dalam halaman ini."),
  answered: w("Answered", "Dijawab"),
  answeredSubtitle: w("Every submission answered, the latest sent first, with who answered it and whether it was answered by its due day.", "Setiap penyerahan yang dijawab, yang terkini dihantar dahulu, bersama siapa yang menjawab dan sama ada dijawab pada hari akhirnya."),
  searchAnswered: w("Search by contract, contractor or title", "Cari mengikut kontrak, kontraktor atau tajuk"),
  nothingAnswered: w("Nothing answered yet", "Belum ada yang dijawab"),
  nothingAnsweredBody: w("An answered submission is listed here.", "Penyerahan yang dijawab disenaraikan di sini."),
  colSubmission: w("Submission", "Penyerahan"),
  colContract: w("Contract", "Kontrak"),
  colAnswer: w("Answer", "Jawapan"),
  colService: w("Against the service level", "Berbanding tahap perkhidmatan"),
  colBy: w("Answered by", "Dijawab oleh"),
  kindSent: w("{kind} · sent {date}", "{kind} · dihantar {date}"),
  contractNumber: w("Contract {number}", "Kontrak {number}"),
  previous: w("Previous", "Sebelumnya"),
  next: w("Next", "Seterusnya"),
  // the service level of a submission (`serviceWords`)
  svcNotSet: w("{notSet}: no due day", "{notSet}: tiada hari akhir"),
  svcDueToday: w("Due today, {date}", "Genap tempoh hari ini, {date}"),
  svcDueOne: w("Due {date}, {count} day left", "Genap tempoh {date}, {count} hari lagi"),
  svcDueMany: w("Due {date}, {count} days left", "Genap tempoh {date}, {count} hari lagi"),
  svcOverdueOne: w("Overdue: was due {date}, {count} day ago", "Lewat: genap tempoh {date}, {count} hari yang lalu"),
  svcOverdueMany: w("Overdue: was due {date}, {count} days ago", "Lewat: genap tempoh {date}, {count} hari yang lalu"),
  svcAnsweredNoLevel: w("Answered (no service level was set)", "Dijawab (tiada tahap perkhidmatan ditetapkan)"),
  svcAnsweredOnTime: w("Answered by its due day, {date}", "Dijawab pada hari akhirnya, {date}"),
  svcAnsweredLate: w("Answered after its due day, {date}", "Dijawab selepas hari akhirnya, {date}"),
  // the answer drawer
  answerTitle: w("Answer: {label}", "Jawapan: {label}"),
  answerDescription: w(
    "From {contractor}. Taken up means you record what it calls for on the contract's own tabs (the programme, the valuation, the delay notice); returned sends it back to the contractor with your note, which it reads in the portal. Either way the answer is shown in the portal and not sent by email.",
    "Daripada {contractor}. Diambil tindakan bermakna anda merekodkan apa yang diperlukannya pada tab kontrak itu sendiri (program, penilaian, notis kelewatan). Dipulangkan menghantarnya semula kepada kontraktor bersama nota anda, yang dibacanya dalam portal. Dalam kedua-dua keadaan, jawapan dipaparkan dalam portal dan tidak dihantar melalui e-mel.",
  ),
  answerField: w("The answer", "Jawapan"),
  answerChoose: w("Choose", "Pilih"),
  answerReturned: w("Returned to the contractor", "Dipulangkan kepada kontraktor"),
  answerNote: w("Note to the contractor", "Nota kepada kontraktor"),
  answerNoteHint: w("Required where it is returned. Shown to the contractor.", "Diperlukan apabila dipulangkan. Dipaparkan kepada kontraktor."),
  answerSubmit: w("Answer", "Jawab"),
} as const;

const flat = (prefix: string, table: Readonly<Record<string, Words>>): Record<string, Words> =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [`${prefix}${k}`, v]));

export const CASE_PAGE: Catalogue = {
  name: "case-page",
  review: "DRAFTED_NOT_REVIEWED",
  words: {
    ...flat("step.", CASE_STEP_WORDS),
    ...flat("tab.", CASE_TAB_WORDS),
    ...flat("section.", CASE_SECTION_WORDS),
    ...flat("action.", CASE_LINK_ACTION_WORDS),
    ...flat("header.", CASE_HEADER_WORDS),
    ...flat("awardStatus.", AWARD_STATUS_WORDS),
    ...flat("instrument.", INSTRUMENT_SHORT_WORDS),
    ...flat("refusal.", CASE_REFUSAL_WORDS),
    ...flat("panel.", CASE_PANEL_TITLE_WORDS),
  },
};

export const CONTRACTS_LIST: Catalogue = {
  name: "contracts-list",
  review: "DRAFTED_NOT_REVIEWED",
  words: {
    ...flat("chip.", CASE_CHIP_WORDS),
    ...flat("list.", CASES_LIST_WORDS),
    ...flat("securities.", SECURITIES_VIEW_WORDS),
    ...flat("securityKind.", SECURITY_KIND_WORDS),
    ...flat("insuranceKind.", INSURANCE_KIND_WORDS),
    ...flat("registerStatus.", REGISTER_STATUS_WORDS),
    ...flat("expiry.", EXPIRY_WORDS),
    ...flat("submissions.", SUBMISSIONS_WORDS),
  },
};
