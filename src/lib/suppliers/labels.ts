/**
 * The supplier register's words, in English and Malay (AGENTS.md rule 5: codes never reach a screen;
 * the bilingual rule: every string here has both). Screens render `.en` today; the Malay line is kept
 * beside it so the bilingual pass needs no rewording.
 */

import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/securities/period";
import type { DeciderFault } from "@/lib/requisition/holders";

import type { DocumentState } from "./documents";
import type { IdentityFault } from "./identity";
import type { StepOneFault } from "./step-one";
import type { LodgeFault, VerifyFault } from "./documents";
import type { ConfigFault } from "./config";
import type { QueueState, ReviewFault } from "./review";
import type { VendorCodeFault } from "@/lib/integration/vendor-master";
import type { BlacklistFault } from "./blacklist";
import type { CancellationFault } from "./cancellation";
import type { ConditionKind, ConditionRow, Result, Verdict } from "./eligibility";
import type { BandFault, ExpiryBand } from "./expiry";
import type { LinkFault } from "./link";
import type { PermissionFault } from "./permission";
import type { ReinstateFault, SuspendFault } from "./reinstate";
import type { CheckState, SaleFault } from "./sale";
import type { Standing, StandingEventKind, StandingNote, StandingReading } from "./standing";
import type { ApplicationChannel, ApplicationKind, ApplicationOutcome, ApplicationStatus, Finding, RegistrationValueKind, SupplierListKind, SupplierStatus, VerificationState } from "./types";

export interface Words {
  en: string;
  ms: string;
}

const w = (en: string, ms: string): Words => ({ en, ms });
const day = (d: unknown) => (typeof d === "string" && d ? formatDate(d) : "—");

/// A configured label written to sit inside a sentence ("the Demo Contractors Board") as a heading or a value on its own line: its first letter capitalised, nothing else changed.
export const asHeading = (label: string) => (label ? label.charAt(0).toUpperCase() + label.slice(1) : label);

/**
 * A blacklisting's end in words (S-1). `endsOn` is exclusive, the free-from day, as every period in the
 * project; the screens say both days so neither can be misread: "Last blacklisted day 30 Sep 2031 · Free
 * from 1 Oct 2031". No end: until further notice.
 */
export function blacklistEndWords(endsOn: string | null): Words {
  if (!endsOn) return w("Until further notice", "Sehingga notis selanjutnya");
  const last = addDays(endsOn, -1);
  return w(`Last blacklisted day ${formatDate(last)} · Free from ${formatDate(endsOn)}`, `Hari terakhir disenarai hitam ${formatDate(last)} · Bebas mulai ${formatDate(endsOn)}`);
}

/// A verified renewal whose validity has not started (fix M-3): the document before it stays in force until then.
export const renewalUpcomingWords = (validFrom: string | null) => `Renewal verified, in force from ${validFrom ? formatDate(validFrom) : "its start"}`;

/// The same, inside a sentence: "last blacklisted day 30 Sep 2031, free from 01 Oct 2031".
export function blacklistEndPhrase(endsOn: string | null): Words {
  if (!endsOn) return w("until further notice", "sehingga notis selanjutnya");
  const last = addDays(endsOn, -1);
  return w(`last blacklisted day ${formatDate(last)}, free from ${formatDate(endsOn)}`, `hari terakhir disenarai hitam ${formatDate(last)}, bebas mulai ${formatDate(endsOn)}`);
}

export const VALUE_KIND_LABEL: Readonly<Record<RegistrationValueKind, Words>> = {
  GRADE: w("Grade", "Gred"),
  CATEGORY: w("Category", "Kategori"),
  SPECIALISATION: w("Specialisation", "Pengkhususan"),
  FIELD_CODE: w("Field code", "Kod bidang"),
  CLASS: w("Class", "Kelas"),
  PERMIT_TYPE: w("Permit type", "Jenis permit"),
};

export const SUPPLIER_STATUS_LABEL: Readonly<Record<SupplierStatus, Words>> = {
  APPLICANT: w("Applicant", "Pemohon"),
  REGISTERED: w("Registered", "Berdaftar"),
  REJECTED: w("Not registered: application rejected", "Tidak berdaftar: permohonan ditolak"),
};
export const SUPPLIER_STATUS_TONE: Readonly<Record<SupplierStatus, "ok" | "warn" | "err" | "info" | "neutral">> = { APPLICANT: "info", REGISTERED: "ok", REJECTED: "neutral" };

export const APPLICATION_KIND_LABEL: Readonly<Record<ApplicationKind, Words>> = {
  NEW: w("First registration", "Pendaftaran baharu"),
  RENEWAL: w("Renewal of registration", "Pembaharuan pendaftaran"),
  UPGRADE: w("Upgrade of registration", "Peningkatan pendaftaran"),
};

export const CHANNEL_LABEL: Readonly<Record<ApplicationChannel, Words>> = {
  COUNTER: w("Over the counter", "Di kaunter"),
  POST: w("By post", "Melalui pos"),
  EMAIL: w("By email", "Melalui e-mel"),
  PORTAL: w("Through the supplier portal", "Melalui portal pembekal"),
};

export const APPLICATION_STATUS_LABEL: Readonly<Record<ApplicationStatus, Words>> = {
  RECEIVED: w("Received", "Diterima"),
  RESUBMISSION_REQUESTED: w("Resubmission requested", "Penghantaran semula diminta"),
  APPROVED: w("Approved", "Diluluskan"),
  REJECTED: w("Rejected", "Ditolak"),
};
export const APPLICATION_STATUS_TONE: Readonly<Record<ApplicationStatus, "ok" | "warn" | "err" | "info" | "neutral">> = { RECEIVED: "info", RESUBMISSION_REQUESTED: "warn", APPROVED: "ok", REJECTED: "err" };

/// An application whose resubmission deadline has passed: derived (no scheduler), shown before it is recorded.
export const LAPSED_LABEL = w("Lapsed: deadline passed", "Luput: tarikh akhir telah berlalu");
/// The deadline has passed and the supplier answered every item of the request online in time (Phase 4c): the office decides on what it sent.
export const ANSWERED_LABEL = w("Answered online, with the office", "Dijawab dalam talian, bersama pejabat");
export const LAPSE_RECORDED_LABEL = w("Rejected on lapse", "Ditolak kerana luput");
export const IN_DECISION_LABEL = w("With approval", "Dalam kelulusan");

export const QUEUE_STATE_LABEL: Readonly<Record<QueueState, Words>> = {
  RECEIVED: w("Received", "Diterima"),
  WITH_APPROVAL: IN_DECISION_LABEL,
  RESUBMISSION_REQUESTED: w("Resubmission requested", "Penghantaran semula diminta"),
  LAPSED: LAPSED_LABEL,
  ANSWERED: ANSWERED_LABEL,
  APPROVED: w("Approved", "Diluluskan"),
  REJECTED: w("Rejected", "Ditolak"),
  REJECTED_ON_LAPSE: LAPSE_RECORDED_LABEL,
};
export const QUEUE_STATE_TONE: Readonly<Record<QueueState, "ok" | "warn" | "err" | "info" | "neutral">> = { RECEIVED: "info", WITH_APPROVAL: "info", RESUBMISSION_REQUESTED: "warn", LAPSED: "err", ANSWERED: "info", APPROVED: "ok", REJECTED: "neutral", REJECTED_ON_LAPSE: "neutral" };

export const OUTCOME_LABEL: Readonly<Record<ApplicationOutcome, Words>> = {
  APPROVE: w("Approved", "Diluluskan"),
  RESUBMIT: w("Resubmission requested", "Penghantaran semula diminta"),
  REJECT: w("Rejected", "Ditolak"),
  LAPSE: w("Rejected: the resubmission deadline lapsed", "Ditolak: tarikh akhir penghantaran semula luput"),
};

export const VERIFICATION_LABEL: Readonly<Record<VerificationState, Words>> = {
  NOT_CHECKED: w("Not checked", "Belum disemak"),
  VERIFIED: w("Verified", "Disahkan"),
  NOT_IN_ORDER: w("Not in order", "Tidak teratur"),
};
export const VERIFICATION_TONE: Readonly<Record<VerificationState, "ok" | "warn" | "err">> = { NOT_CHECKED: "warn", VERIFIED: "ok", NOT_IN_ORDER: "err" };

export const DOCUMENT_STATE_LABEL: Readonly<Record<DocumentState, Words>> = {
  VALID: w("Valid", "Sah"),
  NOT_APPLICABLE: w("Not applicable", "Tidak berkenaan"),
  NOT_YET_VALID: w("Not yet valid", "Belum sah"),
  EXPIRED: w("Expired", "Tamat tempoh"),
  NOT_CHECKED: w("Lodged, not checked", "Dikemukakan, belum disemak"),
  NOT_IN_ORDER: w("Not in order", "Tidak teratur"),
  MISSING: w("Missing", "Tiada"),
};
export const DOCUMENT_STATE_TONE: Readonly<Record<DocumentState, "ok" | "warn" | "err" | "neutral">> = {
  VALID: "ok",
  NOT_APPLICABLE: "neutral",
  NOT_YET_VALID: "warn",
  EXPIRED: "err",
  NOT_CHECKED: "warn",
  NOT_IN_ORDER: "err",
  MISSING: "err",
};

export const LIST_KIND_LABEL: Readonly<Record<SupplierListKind, Words>> = {
  ENTITY_TYPE: w("Entity types", "Jenis entiti"),
  COUNTRY: w("Countries", "Negara"),
  STATE: w("States", "Negeri"),
  BUMIPUTERA_STATUS: w("Bumiputera statuses (as declared)", "Status Bumiputera (diisytiharkan)"),
  BANK: w("Banks", "Bank"),
  ACCOUNT_TYPE: w("Bank account types", "Jenis akaun bank"),
};
export const LIST_KIND_SINGULAR: Readonly<Record<SupplierListKind, Words>> = {
  ENTITY_TYPE: w("Entity type", "Jenis entiti"),
  COUNTRY: w("Country", "Negara"),
  STATE: w("State", "Negeri"),
  BUMIPUTERA_STATUS: w("Bumiputera status", "Status Bumiputera"),
  BANK: w("Bank", "Bank"),
  ACCOUNT_TYPE: w("Bank account type", "Jenis akaun bank"),
};

/// Condition (2), as Phase 3b closes it: a supplier's contacts and the scans of its papers are SULIT. A supplier keeps no list of who is named on it, so they are read by the
/// roles the organisation has chosen (`sulit.read.organisation`), and by no one else until it chooses. Every reading and every download is logged.
export const SCANS_SULIT = w(
  "Scans are SULIT: they are downloaded by the roles the organisation has chosen, and every download, allowed or refused, is logged.",
  "Imbasan adalah SULIT: ia dimuat turun oleh peranan yang dipilih oleh organisasi, dan setiap muat turun, dibenarkan atau ditolak, direkodkan.",
);
/// OD-3 B: the E-Payment form carries bank details and is SULIT at upload.
export const EPAYMENT_SULIT = w("The E-Payment form is SULIT at upload, and its downloads are logged.", "Borang E-Payment adalah SULIT semasa dimuat naik, dan muat turunnya direkodkan.");
export const PAPER_CALLOUT = w(
  "Recorded from the paper application by an officer; the supplier cannot sign in yet.",
  "Direkodkan daripada permohonan bertulis oleh pegawai; pembekal belum boleh log masuk.",
);
export const NOT_VALIDATED = w(
  "Documents are not validated automatically against any registry: each is checked by an officer, who is named with the day of the check.",
  "Dokumen tidak disahkan secara automatik dengan mana-mana daftar: setiap satu disemak oleh pegawai, yang dinamakan bersama tarikh semakan.",
);
export const NOT_SENT = w("Shown here, not sent: nothing is sent from the portal in this phase.", "Dipaparkan di sini, tidak dihantar: tiada apa dihantar dari portal dalam fasa ini.");
export const FORMAT_NOT_CHECKED_CHIP = w("Format not checked", "Format tidak disemak");
export const ERP_NOT_SYNCED = w("Approved, not in the finance system", "Diluluskan, belum dalam sistem kewangan");

const TYPE_STATE = (s: unknown) => DOCUMENT_STATE_LABEL[s as DocumentState] ?? w("not standing", "tidak berdiri");
const SETTINGS = w("Configuration › Supplier register", "Konfigurasi › Daftar pembekal");

type AnyFault = IdentityFault | StepOneFault | LodgeFault | VerifyFault | ReviewFault | ConfigFault | VendorCodeFault | BandFault | BlacklistFault | SuspendFault | ReinstateFault | SaleFault | LinkFault | PermissionFault | StandingNote | CancellationFault;

const TEXT: Record<AnyFault, (d: Record<string, string | number | null>) => Words> = {
  // identity (FR-VND-001)
  NAME_REQUIRED: () => w("Give the registered name.", "Nyatakan nama berdaftar."),
  REGISTRATION_NO_REQUIRED: () => w("Give the registration number.", "Nyatakan nombor pendaftaran."),
  FORMAT_MISMATCH: (d) => w(`The registration number ${d.number} does not match the format set for registration numbers. Check it against the certificate.`, `Nombor pendaftaran ${d.number} tidak sepadan dengan format yang ditetapkan. Semak dengan sijil.`),
  FORMAT_NOT_CHECKED: () => w("Format not checked: no format is set for registration numbers (Configuration › Reference data, code formats). The number is recorded as typed.", "Format tidak disemak: tiada format ditetapkan bagi nombor pendaftaran. Nombor direkodkan seperti ditaip."),
  DUPLICATE: (d) => w(`The registration number ${d.number} is already on the register, held by ${d.name} (${d.reference}). Open that supplier instead.`, `Nombor pendaftaran ${d.number} sudah ada dalam daftar, dipegang oleh ${d.name} (${d.reference}). Buka pembekal itu.`),
  ENTITY_TYPES_NOT_SET: () => w(`No entity types are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`, `Tiada jenis entiti ditetapkan. Tetapkan di ${SETTINGS.ms}, Senarai.`),
  ENTITY_TYPE_REQUIRED: () => w("Choose the entity type.", "Pilih jenis entiti."),
  ENTITY_TYPE_NOT_LISTED: () => w("That entity type is not on the list in force.", "Jenis entiti itu tiada dalam senarai yang berkuat kuasa."),
  COUNTRIES_NOT_SET: () => w(`No countries are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`, `Tiada negara ditetapkan. Tetapkan di ${SETTINGS.ms}, Senarai.`),
  COUNTRY_REQUIRED: () => w("Choose the country.", "Pilih negara."),
  COUNTRY_NOT_LISTED: () => w("That country is not on the list in force.", "Negara itu tiada dalam senarai yang berkuat kuasa."),
  ADDRESS_REQUIRED: () => w("Give the registered address.", "Nyatakan alamat berdaftar."),
  EMAIL_REQUIRED: () => w("Give the company email.", "Nyatakan e-mel syarikat."),
  EMAIL_NOT_VALID: () => w("The company email is not an email address.", "E-mel syarikat bukan alamat e-mel."),
  CONTACT_NAME_REQUIRED: () => w("Give the primary contact's name.", "Nyatakan nama orang hubungan utama."),
  CONTACT_REACH_REQUIRED: () => w("Give the primary contact's email or telephone.", "Nyatakan e-mel atau telefon orang hubungan utama."),
  CONTACT_EMAIL_REQUIRED: () => w("Give the primary contact's email: the organisation asks for both an email and a mobile number.", "Nyatakan e-mel orang hubungan utama: organisasi meminta kedua-dua e-mel dan nombor telefon bimbit."),
  CONTACT_PHONE_REQUIRED: () => w("Give the primary contact's mobile number: the organisation asks for both an email and a mobile number.", "Nyatakan nombor telefon bimbit orang hubungan utama: organisasi meminta kedua-dua e-mel dan nombor telefon bimbit."),
  // step one's parts (Phase 4a)
  CALLING_CODE_ONLY_FOR_COUNTRY: () => w("Only a country has a dial code.", "Hanya negara mempunyai kod dailan."),
  CALLING_CODE_NOT_VALID: () => w("A dial code is a plus sign and up to six digits, for example +60.", "Kod dailan ialah tanda tambah dan sehingga enam digit, contohnya +60."),
  CONTACT_RULE_PROVENANCE_REQUIRED: () => w("Say where the contact rule comes from.", "Nyatakan dari mana peraturan orang hubungan datang."),
  ADDRESS_LINE_REQUIRED: () => w("Give the street address.", "Nyatakan alamat jalan."),
  CITY_REQUIRED: () => w("Give the city.", "Nyatakan bandar."),
  POSTCODE_REQUIRED: () => w("Give the postcode.", "Nyatakan poskod."),
  STATES_NOT_SET: () => w(`No states are set, so none can be recorded. Set them under ${SETTINGS.en}, Lists.`, `Tiada negeri ditetapkan. Tetapkan di ${SETTINGS.ms}, Senarai.`),
  ADDRESS_STATE_REQUIRED: () => w("Choose the state.", "Pilih negeri."),
  ADDRESS_STATE_NOT_LISTED: () => w("That state is not on the list in force.", "Negeri itu tiada dalam senarai yang berkuat kuasa."),
  BUMIPUTERA_NOT_LISTED: () => w("That Bumiputera status is not on the list in force.", "Status Bumiputera itu tiada dalam senarai yang berkuat kuasa."),
  INCORPORATED_ON_REQUIRED: () => w("Give the day the company was incorporated.", "Nyatakan tarikh syarikat diperbadankan."),
  INCORPORATED_ON_NOT_A_DAY: () => w("The date incorporated is not a real day.", "Tarikh diperbadankan bukan tarikh yang sebenar."),
  INCORPORATED_IN_FUTURE: () => w("The date incorporated cannot be after today.", "Tarikh diperbadankan tidak boleh selepas hari ini."),
  CONTACT_EMAIL_NOT_VALID: () => w("The contact's email is not an email address.", "E-mel orang hubungan bukan alamat e-mel."),
  TIME_ZONE_UNSET: () => w("The organisation's time zone is not set, so no day can be recorded. Set it under Configuration › Organisation.", "Zon waktu organisasi belum ditetapkan, jadi tiada tarikh boleh direkodkan. Tetapkan di Konfigurasi › Organisasi."),
  RECEIVED_ON_REQUIRED: () => w("Give the day the application was received.", "Nyatakan tarikh permohonan diterima."),
  RECEIVED_IN_FUTURE: () => w("The day received cannot be after today.", "Tarikh diterima tidak boleh selepas hari ini."),
  CHANNEL_REQUIRED: () => w("Say how the application came in.", "Nyatakan cara permohonan diterima."),
  DECLARATION_IN_FUTURE: () => w("The declaration's day cannot be after today.", "Tarikh akuan tidak boleh selepas hari ini."),
  DECLARATION_AFTER_RECEIPT: () => w("The declaration was signed before the application arrived: its day cannot be after the day received.", "Akuan ditandatangani sebelum permohonan tiba: tarikhnya tidak boleh selepas tarikh diterima."),
  RECORDER_REQUIRED: () => w("Name the officer recording it (an active person).", "Namakan pegawai yang merekodkannya (orang yang aktif)."),
  // documents (FR-VND-002, 008)
  TYPE_NOT_CONFIGURED: () => w(`That document type is not configured. Add it under ${SETTINGS.en}, Document types.`, `Jenis dokumen itu tidak dikonfigurasi. Tambah di ${SETTINGS.ms}, Jenis dokumen.`),
  TYPE_RETIRED: (d) => w(`${d.type} is retired: no new one is lodged.`, `${d.type} telah dibersarakan: tiada yang baharu dikemukakan.`),
  ALREADY_LODGED: (d) => w(`A ${d.type} is already on file. Lodge the new one as its renewal.`, `${d.type} sudah ada dalam fail. Kemukakan yang baharu sebagai pembaharuannya.`),
  REFERENCE_REQUIRED: () => w("Give the document's reference (its number as printed).", "Nyatakan rujukan dokumen (nombornya seperti dicetak)."),
  AUTHORITY_REQUIRED: () => w("Give the issuing authority.", "Nyatakan pihak berkuasa yang mengeluarkan."),
  EXPIRES_NOT_SET: (d) => w(`Whether a ${d.type} expires is not set, so it cannot be lodged. Set it under ${SETTINGS.en}, Document types.`, `Sama ada ${d.type} tamat tempoh belum ditetapkan. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  EXPIRY_REQUIRED: () => w("Give the day it expires.", "Nyatakan tarikh tamat tempoh."),
  EXPIRY_NOT_TAKEN: (d) => w(`A ${d.type} is set not to expire: leave the expiry empty.`, `${d.type} ditetapkan tidak tamat tempoh: biarkan tarikh tamat kosong.`),
  NOT_APPLICABLE_NOT_SET: (d) => w(`Whether a ${d.type} may be not applicable is not set, so it cannot be recorded so. Set it under ${SETTINGS.en}, Document types.`, `Sama ada ${d.type} boleh tidak berkenaan belum ditetapkan. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  NOT_APPLICABLE_NOT_ALLOWED: (d) => w(`A ${d.type} may not be recorded as not applicable.`, `${d.type} tidak boleh direkodkan sebagai tidak berkenaan.`),
  NOT_APPLICABLE_WITH_DETAILS: () => w("A document recorded as not applicable carries no reference, days or values.", "Dokumen tidak berkenaan tidak membawa rujukan, tarikh atau nilai."),
  DAY_NOT_VALID: () => w("One of the days is not a real calendar day.", "Salah satu tarikh bukan tarikh kalendar yang sah."),
  ISSUED_IN_FUTURE: () => w("The day issued cannot be after today.", "Tarikh dikeluarkan tidak boleh selepas hari ini."),
  VALID_FROM_AFTER_EXPIRY: () => w("It cannot be valid from a day after it expires.", "Ia tidak boleh sah dari tarikh selepas tamat tempoh."),
  VALUE_NOT_OF_TYPE: (d) => w(`A value chosen is not one a ${d.type} records.`, `Nilai yang dipilih bukan yang direkodkan oleh ${d.type}.`),
  VALUE_RETIRED: () => w("A value chosen is retired.", "Nilai yang dipilih telah dibersarakan."),
  VALUES_NOT_TAKEN: (d) => w(`A ${d.type} records no values.`, `${d.type} tidak merekodkan nilai.`),
  RENEWS_NOTHING: () => w("The document it renews is not on file.", "Dokumen yang diperbaharui tiada dalam fail."),
  RENEWS_SUPERSEDED: () => w("That document is already renewed: renew the latest one.", "Dokumen itu sudah diperbaharui: perbaharui yang terkini."),
  RENEWS_ANOTHER_TYPE: () => w("A renewal is of the same document type.", "Pembaharuan mestilah jenis dokumen yang sama."),
  RENEWAL_NOT_LATER: (d) => w(`A renewal ends later than what it renews (${day(d.expiresOn)}).`, `Pembaharuan tamat lewat daripada yang diperbaharui (${day(d.expiresOn)}).`),
  SUPPLIER_CLOSED: () => w("The supplier's application was rejected: open a new application first.", "Permohonan pembekal telah ditolak: buka permohonan baharu dahulu."),
  // verification (FR-VND-004)
  ALREADY_CHECKED: () => w("This document is already checked. A corrected one is lodged as a renewal.", "Dokumen ini sudah disemak. Dokumen yang dibetulkan dikemukakan sebagai pembaharuan."),
  STATE_REQUIRED: () => w("Say whether it is verified or not in order.", "Nyatakan sama ada ia disahkan atau tidak teratur."),
  PERSON_REQUIRED: () => w("Name the officer (an active person).", "Namakan pegawai (orang yang aktif)."),
  DAY_REQUIRED: () => w("Give the day.", "Nyatakan tarikh."),
  IN_FUTURE: () => w("The day cannot be after today.", "Tarikh tidak boleh selepas hari ini."),
  BEFORE_LODGED: (d) => w(`It cannot be checked before it was lodged (${day(d.lodgedOn)}).`, `Ia tidak boleh disemak sebelum dikemukakan (${day(d.lodgedOn)}).`),
  NOTE_REQUIRED: () => w("Say what is not in order.", "Nyatakan apa yang tidak teratur."),
  // review (FR-VND-007)
  DECIDED: () => w("The application is already decided.", "Permohonan sudah diputuskan."),
  LAPSED: (d) => w(`The resubmission deadline (${day(d.resubmitBy)}) has passed. Record the lapse first.`, `Tarikh akhir penghantaran semula (${day(d.resubmitBy)}) telah berlalu. Rekodkan luput dahulu.`),
  LAPSE_UNRECORDED: (d) => w(`The resubmission deadline (${day(d.resubmitBy)}) has passed: record the lapse, which rejects the application.`, `Tarikh akhir penghantaran semula (${day(d.resubmitBy)}) telah berlalu: rekodkan luput, yang menolak permohonan.`),
  ANSWERED_ON_TIME: (d) => w(`The supplier answered everything the office asked for online by the deadline (${day(d.resubmitBy)}), so the application has not lapsed and is not rejected for it. Decide it on what was sent: approve it, ask again, or reject it with reasons.`, `Pembekal menjawab semua yang diminta pejabat dalam talian sebelum tarikh akhir (${day(d.resubmitBy)}), jadi permohonan tidak luput dan tidak ditolak kerananya. Putuskan berdasarkan apa yang dihantar: luluskan, minta semula, atau tolak dengan sebab.`),
  NOT_LAPSED: (d) => w(d.resubmitBy ? `The deadline (${day(d.resubmitBy)}) has not passed: it lapses the day after.` : "No resubmission deadline stands on it.", d.resubmitBy ? `Tarikh akhir (${day(d.resubmitBy)}) belum berlalu: ia luput sehari selepasnya.` : "Tiada tarikh akhir penghantaran semula padanya."),
  ROUTE_PENDING: () => w("It is with approval: wait for the route's decision.", "Ia dalam kelulusan: tunggu keputusan laluan."),
  DECLARATION_DAY_REQUIRED: () => w("Record the day the paper declaration was signed.", "Rekodkan tarikh akuan bertulis ditandatangani."),
  DECLARATION_SCAN_REQUIRED: () => w("Attach the signed declaration's scan on the application.", "Lampirkan imbasan akuan yang ditandatangani pada permohonan."),
  ONLINE_DECLARATION_SWITCH_NOT_SET: () => w("The supplier signed the declaration online, but the organisation has not said whether that stands in for the paper declaration (Configuration, Supplier register, Policy). Until it does, the paper declaration's day and scan are still required.", "Pembekal menandatangani akuan secara dalam talian, tetapi organisasi belum menyatakan sama ada ia menggantikan akuan bertulis (Konfigurasi, Daftar pembekal, Dasar). Selagi belum, tarikh dan imbasan akuan bertulis masih diperlukan."),
  CREDITOR_NOT_VERIFIED: () => w("The supplier's bank details have not been checked. Payments to this supplier will be refused until an officer checks them.", "Butiran bank pembekal belum disemak. Bayaran kepada pembekal ini akan ditolak sehingga seorang pegawai menyemaknya."),
  TYPES_NOT_SET: () => w(`No document types are configured, so the file cannot be judged complete. Set them under ${SETTINGS.en}, Document types.`, `Tiada jenis dokumen dikonfigurasi. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  DOCUMENT_NOT_STANDING: (d) => w(`${d.type} is mandatory and reads “${TYPE_STATE(d.state).en.toLowerCase()}”: it must be verified and in force.`, `${d.type} wajib dan berstatus “${TYPE_STATE(d.state).ms.toLowerCase()}”: ia mesti disahkan dan berkuat kuasa.`),
  MANDATORY_NOT_SET: (d) => w(`Whether ${d.type} is mandatory is not set, so the file cannot be judged complete. Set it under ${SETTINGS.en}, Document types.`, `Sama ada ${d.type} wajib belum ditetapkan. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  ITEMS_REQUIRED: () => w("Name at least one item to resubmit.", "Namakan sekurang-kurangnya satu perkara untuk dihantar semula."),
  ITEM_REMARKS_REQUIRED: () => w("Every item needs its remarks, as they are to be given to the supplier.", "Setiap perkara memerlukan catatan, seperti yang akan diberikan kepada pembekal."),
  ITEM_NAMES_NOTHING: () => w("Every item names a document on file or a configured document type.", "Setiap perkara menamakan dokumen dalam fail atau jenis dokumen yang dikonfigurasi."),
  SCAN_REQUIRED: () => w("Attach the document's scan first: it is verified on its scan.", "Lampirkan imbasan dokumen dahulu: ia disahkan berdasarkan imbasannya."),
  EXPIRY_NOT_A_DAY: () => w("The expiry date is not a date.", "Tarikh tamat tempoh bukan tarikh yang sah."),
  EXPIRY_REASON_REQUIRED: () => w("You changed the expiry date. Say why in the note: the change is recorded with the date before and after.", "Anda mengubah tarikh tamat tempoh. Nyatakan sebabnya dalam nota: perubahan direkodkan dengan tarikh sebelum dan selepas."),
  ITEM_NOT_ON_FILE: () => w("An item names a document not on this supplier's file.", "Satu perkara menamakan dokumen yang tiada dalam fail pembekal ini."),
  DEADLINE_REQUIRED: () => w("Give the resubmission deadline.", "Nyatakan tarikh akhir penghantaran semula."),
  DEADLINE_NOT_AFTER_TODAY: () => w("The deadline must be after today.", "Tarikh akhir mestilah selepas hari ini."),
  REMARKS_REQUIRED: () => w("Give the reasons, as they are to be given to the supplier.", "Nyatakan sebab-sebabnya, seperti yang akan diberikan kepada pembekal."),
  OUTCOME_NOT_RECORDED_HERE: () => w("Approval is given on the application's route; a lapse is recorded on its own.", "Kelulusan diberi melalui laluan permohonan; luput direkodkan berasingan."),
  ALREADY_OPEN: () => w("An application is already open for this supplier.", "Permohonan sudah dibuka untuk pembekal ini."),
  KIND_REQUIRED: () => w("Say what the application is for.", "Nyatakan tujuan permohonan."),
  KIND_NOT_FOR_STATUS: (d) => w(d.kind === "NEW" ? "The supplier is registered: open a renewal or an upgrade." : "The supplier is not registered: open a first registration.", d.kind === "NEW" ? "Pembekal berdaftar: buka pembaharuan atau peningkatan." : "Pembekal tidak berdaftar: buka pendaftaran baharu."),
  // configuration
  CODE_REQUIRED: () => w("Give the code.", "Nyatakan kod."),
  CODE_TAKEN: () => w("That code is already in use.", "Kod itu sudah digunakan."),
  PROVENANCE_REQUIRED: () => w("Say where it comes from.", "Nyatakan sumbernya."),
  BODY_NOT_CONFIGURED: () => w("That registration body is not configured.", "Badan pendaftaran itu tidak dikonfigurasi."),
  VALUE_KIND_REQUIRED: () => w("Say what kind of value it is.", "Nyatakan jenis nilai."),
  PARENT_NOT_CATEGORY: () => w("A specialisation sits under one of the body's categories.", "Pengkhususan terletak di bawah salah satu kategori badan itu."),
  PARENT_ONLY_FOR_SPECIALISATION: () => w("Only a specialisation sits under a category.", "Hanya pengkhususan terletak di bawah kategori."),
  RANK_ONLY_FOR_GRADE: () => w("Only a grade takes a rank.", "Hanya gred mempunyai kedudukan."),
  RANK_NOT_VALID: () => w("A rank is a whole number from 1.", "Kedudukan ialah nombor bulat dari 1."),
  RANK_TAKEN: (d) => w(`Another of the body's grades has rank ${d.rank}.`, `Gred lain badan itu mempunyai kedudukan ${d.rank}.`),
  RANK_HELD: (d) => w(`This grade's rank cannot change now: ${d.exercises} ask for a grade of this body and have gone for approval or are open, so bidders are being compared by these ranks. It can change when they are opened or cancelled.`, `Kedudukan gred ini tidak boleh diubah sekarang: ${d.exercises} meminta gred badan ini dan telah dihantar untuk kelulusan atau sedang dibuka, jadi pembida dibandingkan mengikut kedudukan ini. Ia boleh diubah apabila ia dibuka atau dibatalkan.`),
  CEILING_ONLY_FOR_GRADE: () => w("Only a grade carries a value ceiling.", "Hanya gred membawa had nilai."),
  CEILING_NOT_VALID: () => w("The ceiling is an amount above nothing, at most two decimal places.", "Had ialah amaun melebihi sifar, paling banyak dua tempat perpuluhan."),
  CEILING_PROVENANCE_REQUIRED: () => w("Say where the ceiling comes from.", "Nyatakan sumber had itu."),
  KINDS_WITHOUT_BODY: () => w("A type records values only of a registration body it names.", "Jenis merekodkan nilai hanya bagi badan pendaftaran yang dinamakannya."),
  KIND_NOT_LISTED: () => w("That list is not one of the register's.", "Senarai itu bukan senarai daftar."),
  REASON_REQUIRED: () => w("Give the reason.", "Nyatakan sebabnya."),
  // the finance system's vendor code (INT-03)
  FORMAT: () => w("The code does not match the format set for the finance system's vendor codes.", "Kod tidak sepadan dengan format yang ditetapkan bagi kod vendor sistem kewangan."),
  TAKEN: () => w("That vendor code is already recorded on another supplier.", "Kod vendor itu sudah direkodkan pada pembekal lain."),
  NOT_REGISTERED: () => w("A vendor code is recorded once the supplier is registered.", "Kod vendor direkodkan setelah pembekal berdaftar."),
  // a2: the register's policy (FR-VND-008, OD-4..OD-7, condition 4)
  BAND_NEGATIVE: () => w("Each band is a whole number of days, from 0.", "Setiap jalur ialah bilangan hari bulat, dari 0."),
  BANDS_PARTLY_SET: () => w("Set all three bands, or none: a band on its own cannot be read.", "Tetapkan ketiga-tiga jalur, atau tiada: satu jalur sahaja tidak boleh dibaca."),
  BANDS_OUT_OF_ORDER: () => w("The bands run from the soonest: critical fewer days than warning, warning fewer than upcoming.", "Jalur bermula dari yang terdekat: kritikal kurang hari daripada amaran, amaran kurang daripada akan datang."),
  BLACKLIST_PERIOD_NOT_SET: () => w(`How long a first-offence blacklisting lasts is not set, so one cannot be recorded. Set it under ${SETTINGS.en}, Standing.`, `Tempoh senarai hitam kesalahan pertama belum ditetapkan, jadi ia tidak boleh direkodkan. Tetapkan di ${SETTINGS.ms}, Kedudukan.`),
  OFFENCE_INVALID: () => w("The offence's number cannot be read.", "Bilangan kesalahan tidak boleh dibaca."),
  // fix S-2 (FR-TRM-017): a blacklisting in effect stops a renewal or upgrade, and its approval.
  BLACKLISTED_NO_APPLICATION: (d) => w(`A blacklisting is in effect (since ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).en}): a renewal or upgrade is not opened while it stands.`, `Senarai hitam sedang berkuat kuasa (sejak ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).ms}): pembaharuan atau naik taraf tidak dibuka selagi ia berkuat kuasa.`),
  BLACKLISTED_NOT_APPROVED: (d) => w(`A blacklisting is in effect (since ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).en}): an application is not approved while it stands. Reject it, or wait until the blacklisting ends or is lifted.`, `Senarai hitam sedang berkuat kuasa (sejak ${day(d.since)}, ${d.reason}; ${blacklistEndPhrase(typeof d.endsOn === "string" ? d.endsOn : null).ms}): permohonan tidak diluluskan selagi ia berkuat kuasa. Tolak, atau tunggu sehingga senarai hitam tamat atau ditarik balik.`),
  // a2: standing (FR-VND-010, OD-7, OD-8)
  STANDING_NEEDS_REGISTRATION: () => w("Only a registered supplier is suspended or blacklisted.", "Hanya pembekal berdaftar digantung atau disenaraihitamkan."),
  ALREADY_BLACKLISTED: () => w("The supplier is already blacklisted.", "Pembekal sudah disenaraihitamkan."),
  NOT_BLACKLISTED: () => w("No blacklisting of this supplier is in effect.", "Tiada senarai hitam pembekal ini yang berkuat kuasa."),
  REQUEST_OPEN: () => w("A blacklisting, or its lifting, is already asked for and not yet recorded: finish that one first.", "Senarai hitam, atau penarikannya, sudah dipohon dan belum direkodkan: selesaikan dahulu."),
  REASON_NOT_FOR_BLACKLISTING: () => w("That reason is on the list for suspensions, not blacklistings.", "Sebab itu dalam senarai penggantungan, bukan senarai hitam."),
  REASON_NOT_FOR_SUSPENSION: () => w("That reason is on the list for blacklistings, not suspensions.", "Sebab itu dalam senarai senarai hitam, bukan penggantungan."),
  REASON_RETIRED: () => w("That reason is retired.", "Sebab itu telah dibersarakan."),
  STANDING_NOTE_REQUIRED: () => w("Say why, in words: it is kept with the record.", "Nyatakan sebabnya: ia disimpan bersama rekod."),
  AWARD_NOT_CANCELLED_FOR_BLACKLISTING: () => w("That award was not cancelled with blacklisting recommended.", "Anugerah itu tidak dibatalkan dengan cadangan senarai hitam."),
  AWARD_NOT_THIS_SUPPLIER: () => w("That award is not linked to this supplier.", "Anugerah itu tidak dipautkan kepada pembekal ini."),
  ROUTE_NOT_APPROVED: () => w("Its route has not approved it: it is recorded once the route's last step approves.", "Laluannya belum meluluskannya: ia direkodkan setelah langkah terakhir laluan meluluskan."),
  ALREADY_RECORDED: () => w("This is already recorded.", "Ini sudah direkodkan."),
  // fix R-7: withdrawing a request
  REQUEST_WITHDRAWN: () => w("This request was withdrawn: it is not recorded. Ask again if it is still wanted.", "Permohonan ini telah ditarik balik: ia tidak direkodkan. Pohon semula jika masih dikehendaki."),
  ALREADY_WITHDRAWN: () => w("This request is already withdrawn.", "Permohonan ini sudah ditarik balik."),
  WITHDRAW_ROUTE_PENDING: () => w("It is still on its route: it is decided there first (a refusal closes it).", "Ia masih dalam laluannya: ia diputuskan di sana dahulu (penolakan menutupnya)."),
  WITHDRAW_ROUTE_REFUSED: () => w("Its route refused it: it is already closed.", "Laluannya menolaknya: ia sudah ditutup."),
  WITHDRAW_REASON_REQUIRED: () => w("Say why it is withdrawn: it is kept with the request.", "Nyatakan sebab ia ditarik balik: ia disimpan bersama permohonan."),
  EFFECTIVE_REQUIRED: () => w("Give the day it takes effect.", "Nyatakan tarikh ia berkuat kuasa."),
  // 615-C2 (BD-613-91): a registration body's cancellation, and its withdrawal when recorded in error.
  REGISTRATION_DAY_NOT_RECORDED: () => w("The supplier's registration day is not recorded, so the registration a cancellation ends cannot be named.", "Tarikh pendaftaran pembekal tidak direkodkan, jadi pendaftaran yang dibatalkan tidak boleh dinamakan."),
  CANCELLATION_NEEDS_REGISTRATION: () => w("Only a registered supplier's registration can be recorded as cancelled.", "Hanya pendaftaran pembekal berdaftar boleh direkodkan sebagai dibatalkan."),
  ALREADY_CANCELLED: (d) => w(`A cancellation of the registration is already recorded (in effect since ${day(d.since)}). If it was recorded in error, withdraw it first.`, `Pembatalan pendaftaran sudah direkodkan (berkuat kuasa sejak ${day(d.since)}). Jika ia direkodkan secara tersilap, tarik baliknya dahulu.`),
  CANCELLING_BODY_REQUIRED: () => w("Choose the registration body that cancelled it.", "Pilih badan pendaftaran yang membatalkannya."),
  CANCELLING_BODY_NOT_CONFIGURED: () => w("That registration body is not configured (Configuration › Supplier register).", "Badan pendaftaran itu tidak dikonfigurasi (Konfigurasi › Daftar pembekal)."),
  CANCELLATION_REFERENCE_REQUIRED: () => w("Give the body's reference for the cancellation, as on its notice.", "Nyatakan rujukan badan bagi pembatalan, seperti pada notisnya."),
  NOT_A_CANCELLATION: () => w("Only a registration cancelled is withdrawn here; the other standing records are ended by their own acts.", "Hanya pembatalan pendaftaran ditarik balik di sini; rekod kedudukan lain ditamatkan melalui tindakan masing-masing."),
  CANCELLATION_ALREADY_WITHDRAWN: () => w("It is already withdrawn.", "Ia sudah ditarik balik."),
  CANCELLATION_WITHDRAW_REASON_REQUIRED: () => w("Say why it was recorded in error: it is kept with the record.", "Nyatakan mengapa ia direkodkan secara tersilap: ia disimpan bersama rekod."),
  EFFECTIVE_IN_FUTURE: () => w("The day it takes effect cannot be after today: record it on the day.", "Tarikh berkuat kuasa tidak boleh selepas hari ini: rekodkan pada hari itu."),
  EFFECTIVE_BEFORE_DECISION: (d) => w(`It cannot take effect before its route approved it (${day(d.approvedOn)}).`, `Ia tidak boleh berkuat kuasa sebelum laluannya meluluskan (${day(d.approvedOn)}).`),
  EFFECTIVE_BEFORE_REGISTRATION: (d) => w(`It cannot take effect before the supplier was registered (${day(d.registeredOn)}).`, `Ia tidak boleh berkuat kuasa sebelum pembekal didaftarkan (${day(d.registeredOn)}).`),
  EFFECTIVE_BEFORE_SUSPENSION: (d) => w(`It cannot take effect before the suspension did (${day(d.since)}).`, `Ia tidak boleh berkuat kuasa sebelum penggantungan (${day(d.since)}).`),
  ALREADY_SUSPENDED: (d) => w(`The supplier is already suspended (since ${day(d.since)}).`, `Pembekal sudah digantung (sejak ${day(d.since)}).`),
  // S-1 (Run 0 fix round): only a blacklisting refuses a suspension now; a cancellation is recorded beside one.
  ALREADY_BARRED: (d) => w(`The supplier is blacklisted${d.since ? ` (since ${day(d.since)})` : ""}: a suspension adds nothing.`, `Pembekal disenaraihitamkan${d.since ? ` (sejak ${day(d.since)})` : ""}: penggantungan tidak menambah apa-apa.`),
  DOCUMENT_NOT_ON_FILE: () => w("A document named is not on this supplier's file.", "Dokumen yang dinamakan tiada dalam fail pembekal ini."),
  NOT_SUSPENDED: () => w("No suspension of this supplier is in effect.", "Tiada penggantungan pembekal ini yang berkuat kuasa."),
  BLACKLISTED: () => w("The supplier is blacklisted: a blacklisting is not reinstated, it is lifted on its own route.", "Pembekal disenaraihitamkan: senarai hitam tidak dipulihkan, ia ditarik balik melalui laluannya sendiri."),
  FLAGGED_NOT_STANDING: (d) => w(`Not reinstated: these documents the suspension was for are not verified and in force: ${d.types}.`, `Tidak dipulihkan: dokumen-dokumen yang menjadi sebab penggantungan ini belum disahkan dan berkuat kuasa: ${d.types}.`),
  LAPSED_SINCE: (d) => w(`Not reinstated: a mandatory document has expired since: ${d.types}.`, `Tidak dipulihkan: dokumen wajib telah tamat tempoh sejak itu: ${d.types}.`),
  CHECKLIST_INCOMPLETE: (d) => w(`Tick every line of the checklist, having seen each verified: ${d.types}.`, `Tandakan setiap baris senarai semak, setelah melihat setiap satu disahkan: ${d.types}.`),
  LAPSE_RULE_NOT_SET: (d) => w(`Active — lapse rule not set; a mandatory document has expired${d.types ? ` (${d.types})` : ""}. Whether that suspends the supplier is set under ${SETTINGS.en}, Standing.`, `Aktif — peraturan luput belum ditetapkan; dokumen wajib telah tamat tempoh${d.types ? ` (${d.types})` : ""}. Sama ada itu menggantung pembekal ditetapkan di ${SETTINGS.ms}, Kedudukan.`),
  MANDATORY_EXPIRED: (d) => w(`A mandatory document has expired (${d.types}); the policy does not suspend on lapse.`, `Dokumen wajib telah tamat tempoh (${d.types}); polisi tidak menggantung kerana luput.`),
  BLACKLIST_ENDED: (d) => w(`A first-offence blacklisting has ended: last blacklisted day ${day(d.lastDay)} · free from ${day(d.freeFrom)}.`, `Senarai hitam kesalahan pertama telah tamat: hari terakhir disenarai hitam ${day(d.lastDay)} · bebas mulai ${day(d.freeFrom)}.`),
  // M-1 (BD-613-108): a cancellation that stood, ended by the supplier registering again.
  CANCELLATION_ENDED: (d) => cancellationEndedWords(d.since, d.registeredOn),
  CANCELLED_NEW_APPLICATION_ONLY: (d) => {
    const by = d.body ? ` by ${d.body}${d.reference ? ` (${d.reference})` : ""}` : "";
    const byMs = d.body ? ` oleh ${d.body}${d.reference ? ` (${d.reference})` : ""}` : "";
    return w(`The supplier's registration is cancelled (since ${day(d.since)}${by}): a renewal or an upgrade is not opened or approved while it stands. The way back is a new registration: open a first registration (a new application), which, once approved, ends the cancellation.`, `Pendaftaran pembekal dibatalkan (sejak ${day(d.since)}${byMs}): pembaharuan atau naik taraf tidak dibuka atau diluluskan selagi ia berkuat kuasa. Jalan kembali ialah pendaftaran baharu: buka pendaftaran baharu (permohonan baharu), yang setelah diluluskan menamatkan pembatalan itu.`);
  },
  CANCELLED_APPROVE_FROM: (d) => w(`The registration was cancelled from ${day(d.since)}: a new registration ends it only from a later day, so it is approved from ${day(d.from)}.`, `Pendaftaran dibatalkan mulai ${day(d.since)}: pendaftaran baharu menamatkannya hanya dari hari kemudian, jadi ia diluluskan mulai ${day(d.from)}.`),
  SCHEDULED: (d) => w(`${STANDING_EVENT_LABEL[d.kind as StandingEventKind]?.en ?? "A change"} takes effect on ${day(d.effectiveOn)}.`, `${STANDING_EVENT_LABEL[d.kind as StandingEventKind]?.ms ?? "Satu perubahan"} berkuat kuasa pada ${day(d.effectiveOn)}.`),
  // a2: the sale (FR-ADV-010, OD-5)
  SALE_NOT_REGISTERED: () => w("Not sold: the purchaser's supplier is not registered.", "Tidak dijual: pembekal pembeli tidak berdaftar."),
  BARRED: (d) => w(`Not sold: the purchaser's supplier is ${(STANDING_LABEL[d.standing as Standing]?.en ?? "barred").toLowerCase()}.`, `Tidak dijual: pembekal pembeli ${(STANDING_LABEL[d.standing as Standing]?.ms ?? "dihalang").toLowerCase()}.`),
  NOT_LINKED_REGISTER_REQUIRED: () => w("Not sold: the documents are sold only to a purchaser on the supplier register, and no supplier is named for this contractor. Choose its supplier under “Supplier on the register” on this form: the contractor is linked to it as the sale is recorded. A company not yet on the register is recorded there first (Suppliers › Record a paper application).", "Tidak dijual: dokumen dijual hanya kepada pembeli dalam daftar pembekal, dan tiada pembekal dinamakan bagi kontraktor ini. Pilih pembekalnya di bawah “Pembekal dalam daftar” pada borang ini: kontraktor dipautkan kepadanya semasa jualan direkodkan. Syarikat yang belum dalam daftar direkodkan di sana dahulu (Pembekal › Rekod permohonan kertas)."),
  SALE_PARTY_LINKED_ELSEWHERE: () => w("Not sold: this contractor is already linked to another supplier on the register. A link is not moved: leave “Supplier on the register” empty, or choose the supplier it is linked to.", "Tidak dijual: kontraktor ini sudah dipautkan kepada pembekal lain dalam daftar. Pautan tidak dipindahkan: kosongkan “Pembekal dalam daftar”, atau pilih pembekal yang dipautkan."),
  REGISTER_RULE_NOT_SET: () => w(`Not checked against the register: the party is not linked, and whether a sale needs the register is not set (${SETTINGS.en}, Standing).`, `Tidak disemak dengan daftar: pihak itu tidak dipautkan, dan sama ada jualan memerlukan daftar belum ditetapkan (${SETTINGS.ms}, Kedudukan).`),
  NOT_LINKED: () => w("Not checked against the register: the party is not linked to a supplier.", "Tidak disemak dengan daftar: pihak itu tidak dipautkan kepada pembekal."),
  // a2: links (OD-9)
  AWARD_LINK_DISAGREES: (d) => w(`The award is linked on its own to ${d.awardSupplier ?? "a supplier"} on the register, and the bidder named is ${d.partySupplier ? `linked to ${d.partySupplier}` : "not linked"}: the links would disagree. Link the bidder to the same supplier from the supplier's record first.`, `Anugerah dipautkan sendiri kepada ${d.awardSupplier ?? "pembekal"} dalam daftar, dan petender yang dinamakan ${d.partySupplier ? `dipautkan kepada ${d.partySupplier}` : "tidak dipautkan"}: pautan akan bercanggah. Pautkan petender kepada pembekal yang sama dari rekod pembekal dahulu.`),
  ALREADY_LINKED: () => w("It is already linked to that supplier.", "Ia sudah dipautkan kepada pembekal itu."),
  SUPPLIER_ON_OTHER_PARTY: (d) => w(`${d.party} is already linked to that supplier on this exercise: one company is one party on an exercise. Use that party.`, `${d.party} sudah dipautkan kepada pembekal itu dalam latihan ini: satu syarikat ialah satu pihak dalam latihan. Gunakan pihak itu.`),
  LINKED_ELSEWHERE: () => w("It is already linked to another supplier. A link is not moved.", "Ia sudah dipautkan kepada pembekal lain. Pautan tidak dipindahkan."),
  NUMBER_DIFFERS_REASON_REQUIRED: (d) => w(`The registration number recorded (${d.recorded}) differs from the register's (${d.register}): say why they are the same company.`, `Nombor pendaftaran yang direkodkan (${d.recorded}) berbeza daripada daftar (${d.register}): nyatakan mengapa ia syarikat yang sama.`),
  NUMBER_DIFFERS: (d) => w(`Linked although the number recorded (${d.recorded}) differs from the register's (${d.register}).`, `Dipautkan walaupun nombor yang direkodkan (${d.recorded}) berbeza daripada daftar (${d.register}).`),
  SUPPLIER_NOT_REGISTERED: () => w("Linked to a supplier that is not registered.", "Dipautkan kepada pembekal yang tidak berdaftar."),
  AWARD_HAS_PARTY: () => w("This award names its awardee party: link the party, and the award follows it.", "Anugerah ini menamakan pihak penerimanya: pautkan pihak itu, dan anugerah mengikutinya."),
  SUPPLIER_REQUIRED: () => w("Choose the supplier on the register.", "Pilih pembekal dalam daftar."),
  // a2: special permission (FR-ADV-017)
  NOT_OFFERED: () => w("The exercise's notice does not offer special permission.", "Notis latihan tidak menawarkan kebenaran khas."),
  OFFER_NOT_SET: () => w("Whether the exercise's notice offers special permission is not set: set it on the exercise's window.", "Sama ada notis latihan menawarkan kebenaran khas belum ditetapkan: tetapkan pada tetingkap latihan."),
  REQUIREMENT_REQUIRED: () => w("Choose the registration requirement it relaxes.", "Pilih keperluan pendaftaran yang dilonggarkan."),
  REQUIREMENT_NOT_ON_EXERCISE: () => w("That requirement is not this exercise's.", "Keperluan itu bukan milik latihan ini."),
  RELAXES_REQUIRED: () => w("Say what it relaxes: the grade or the field codes.", "Nyatakan apa yang dilonggarkan: gred atau kod bidang."),
  PERMISSION_AUTHORITY_REQUIRED: () => w("Name who grants it: a registration body outside the organisation, or the organisation's own approval.", "Namakan pemberinya: badan pendaftaran luar organisasi, atau kelulusan organisasi sendiri."),
  CLASS_NOT_CONFIRMED: () => w("Confirm the party already holds a registration class.", "Sahkan pihak itu sudah memegang kelas pendaftaran."),
  RECORD_NOT_CONFIRMED: () => w("Confirm the party's record is good.", "Sahkan rekod pihak itu baik."),
  PERMISSION_DUPLICATE: () => w("A permission relaxing that already stands for this party and requirement.", "Kebenaran yang melonggarkan itu sudah ada bagi pihak dan keperluan ini."),
  ALREADY_GRANTED: () => w("It is already granted.", "Ia sudah diberikan."),
  INTERNAL_ROUTE_NOT_APPROVED: () => w("Its approval inside the organisation has not been given: it is granted once its route approves.", "Kelulusan dalam organisasi belum diberi: ia diberikan setelah laluannya meluluskan."),
  GRANTED_REQUIRED: () => w("Give the day it was granted.", "Nyatakan tarikh ia diberikan."),
  GRANTED_IN_FUTURE: () => w("The day granted cannot be after today.", "Tarikh diberikan tidak boleh selepas hari ini."),
  GRANTED_BEFORE_APPROVAL: (d) => w(`It cannot be granted before its route approved it (${day(d.approvedOn)}).`, `Ia tidak boleh diberikan sebelum laluannya meluluskan (${day(d.approvedOn)}).`),
};

// ------------------------------------------------------------------ a2: standing, expiry and eligibility words

export const STANDING_LABEL: Readonly<Record<Standing, Words>> = {
  ACTIVE: w("Active", "Aktif"),
  SUSPENDED: w("Suspended", "Digantung"),
  SUSPENDED_ON_LAPSE: w("Suspended on lapse", "Digantung kerana luput"),
  BLACKLISTED: w("Blacklisted", "Disenarai hitam"),
  CANCELLED: w("Registration cancelled", "Pendaftaran dibatalkan"),
  NOT_REGISTERED: w("Not registered", "Tidak berdaftar"),
};
export const STANDING_TONE: Readonly<Record<Standing, "ok" | "warn" | "err" | "info" | "neutral">> = { ACTIVE: "ok", SUSPENDED: "err", SUSPENDED_ON_LAPSE: "err", BLACKLISTED: "err", CANCELLED: "err", NOT_REGISTERED: "neutral" };

/// OD-7 A as ruled: an active supplier with an expired mandatory document and the lapse rule unset reads exactly this.
export const LAPSE_RULE_NOT_SET_WORDS = w("Active — lapse rule not set; a mandatory document has expired", "Aktif — peraturan luput belum ditetapkan; dokumen wajib telah tamat tempoh");

/// A standing as one line: the label, or the OD-7 wording where the lapse rule is unset.
export function standingWords(r: Pick<StandingReading, "standing" | "notes">): Words {
  if (r.standing === "ACTIVE" && r.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET")) return LAPSE_RULE_NOT_SET_WORDS;
  return STANDING_LABEL[r.standing];
}
export const standingTone = (r: Pick<StandingReading, "standing" | "notes">) => (r.standing === "ACTIVE" && r.notes.some((n) => n.code === "LAPSE_RULE_NOT_SET") ? "warn" : STANDING_TONE[r.standing]);

export const STANDING_EVENT_LABEL: Readonly<Record<StandingEventKind, Words>> = {
  SUSPEND: w("Suspended", "Digantung"),
  REINSTATE: w("Reinstated", "Dipulihkan"),
  BLACKLIST: w("Blacklisted", "Disenarai hitam"),
  BLACKLIST_LIFT: w("Blacklisting lifted", "Senarai hitam ditarik balik"),
  REGISTRATION_CANCELLED: w("Registration cancelled", "Pendaftaran dibatalkan"),
};

/// M-1 (BD-613-108): a cancellation ended by the supplier registering again: the CANCELLATION_ENDED note's words, also the
/// Recorded card's chip on that cancellation (Run 1a, Should 2: one source, English and Malay).
export function cancellationEndedWords(since: unknown, registeredOn: unknown): Words {
  return w(`The registration cancelled from ${day(since)} ended when the supplier registered again on ${day(registeredOn)}.`, `Pendaftaran yang dibatalkan mulai ${day(since)} tamat apabila pembekal berdaftar semula pada ${day(registeredOn)}.`);
}

/// Run 1a (Should 2): an application's approval, as the act returns it. `again`: a cancellation the new registration ends.
export function approvedWords(kind: string, again: { since: string } | null, today: string): Words {
  const what =
    kind !== "NEW" ? w("the application is approved", "permohonan diluluskan")
    : again ? w(`the supplier is registered again from ${day(today)}; the registration cancelled from ${day(again.since)} no longer stands`, `pembekal berdaftar semula mulai ${day(today)}; pendaftaran yang dibatalkan mulai ${day(again.since)} tidak lagi berkuat kuasa`)
    : w("the supplier is registered", "pembekal didaftarkan");
  return w(`Approved: ${what.en}. The notice to the supplier is shown, not sent.`, `Diluluskan: ${what.ms}. Notis kepada pembekal dipaparkan, tidak dihantar.`);
}

/// Run 1a (Should 2): a cancellation withdrawn as recorded in error, as the act returns it. `now`: the standing it changed
/// to (null where it did not change); `notRevisited`: what is not revisited (notRevisitedWords).
export function withdrawnWords(now: Words | null, notRevisited: Words): Words {
  return w(
    `Withdrawn as recorded in error. It stays on the record, marked withdrawn with why; the supplier's standing no longer reads it${now ? ` (now ${now.en.toLowerCase()})` : ""}. ${notRevisited.en}`,
    `Ditarik balik kerana direkodkan secara tersilap. Ia kekal dalam rekod, ditanda ditarik balik beserta sebabnya; kedudukan pembekal tidak lagi membacanya${now ? ` (kini ${now.ms.toLowerCase()})` : ""}. ${notRevisited.ms}`,
  );
}

/// Said (and only said) to a reader who is not named on some restricted exercise, whether or not this supplier bid on it: the openings on those are left out of
/// what is listed as not revisited (FR-MTD-007), and an unconditional sentence cannot tell the reader that this supplier took part in one.
export const RESTRICTED_OPENINGS_NOT_LISTED = w(
  "Openings on exercises restricted to their named people are not listed here to anyone not named on them.",
  "Pembukaan bagi eksesais yang dihadkan kepada orang yang dinamakan padanya tidak disenaraikan di sini kepada sesiapa yang tidak dinamakan padanya.",
);

/// The not-revisited words with that sentence added, for a reader who is not named on some restricted exercise.
export const withRestrictedOpeningsNote = (notRevisited: Words): Words => w(`${notRevisited.en} ${RESTRICTED_OPENINGS_NOT_LISTED.en}`, `${notRevisited.ms} ${RESTRICTED_OPENINGS_NOT_LISTED.ms}`);

/// Run 1a (Should 2): the withdrawal drawer's way back for a cancellation that stood.
export const NEW_APPLICATION_WAY_BACK = w(
  "A cancellation that stood is not withdrawn: the supplier registers again, by a new application on the Applications tab, which ends it once approved.",
  "Pembatalan yang telah berkuat kuasa tidak ditarik balik: pembekal mendaftar semula melalui permohonan baharu di tab Permohonan, yang menamatkannya setelah diluluskan.",
);

/**
 * BD-613-105(e) / S-3 (Run 0 fix round): a registration cancelled's reason line, composed at read from the body's label as
 * frozen and the body's reference, in English and Malay: "Cancelled by {body} ({reference})". Nothing of it is stored as
 * words (its reasonSnapshot stays ""), so no product wording sits in a data row.
 */
export function cancellationWords(by: { body: string; reference: string }): Words {
  return w(`Cancelled by ${by.body} (${by.reference})`, `Dibatalkan oleh ${by.body} (${by.reference})`);
}

/// An event's reason line in words: a cancellation's composed from its body and reference; any other kind's its reason as recorded.
export function eventReasonWords(e: { kind: string; reasonLabel: string; cancelledBy: { body: string; reference: string } | null }): Words {
  if (e.kind === "REGISTRATION_CANCELLED") return e.cancelledBy ? cancellationWords(e.cancelledBy) : w("", "");
  return w(e.reasonLabel, e.reasonLabel);
}

export const REASON_USE_LABEL: Readonly<Record<"SUSPEND" | "BLACKLIST", Words>> = { SUSPEND: w("Suspension", "Penggantungan"), BLACKLIST: w("Blacklisting", "Senarai hitam") };
export const REQUEST_KIND_LABEL: Readonly<Record<"BLACKLIST" | "BLACKLIST_LIFT", Words>> = { BLACKLIST: w("Blacklisting", "Senarai hitam"), BLACKLIST_LIFT: w("Lifting a blacklisting", "Penarikan balik senarai hitam") };
export const CONSEQUENCE_LABEL: Readonly<Record<"ELIMINATE" | "REPORT", Words>> = { ELIMINATE: w("Eliminated at the opening", "Disingkirkan semasa pembukaan"), REPORT: w("Reported to the committee, which decides", "Dilaporkan kepada jawatankuasa, yang memutuskan") };
export const RELAXES_LABEL: Readonly<Record<"GRADE" | "FIELD_CODE", Words>> = { GRADE: w("The grade", "Gred"), FIELD_CODE: w("The field codes", "Kod bidang") };
export const CHECK_STATE_LABEL: Readonly<Record<CheckState, Words>> = { NOT_CHECKED: w("Not checked", "Tidak disemak"), CLEAR: w("Clear on the register", "Jelas dalam daftar"), FAILED: w("Failed on the register", "Gagal dalam daftar") };

export const EXPIRY_BAND_LABEL: Readonly<Record<ExpiryBand, Words>> = {
  EXPIRED: w("Expired", "Tamat tempoh"),
  CRITICAL: w("Critical", "Kritikal"),
  WARNING: w("Warning", "Amaran"),
  UPCOMING: w("Upcoming", "Akan datang"),
  NONE: w("Not yet near", "Belum hampir"),
  NO_EXPIRY: w("No expiry", "Tiada tarikh tamat"),
  BANDS_NOT_SET: w("Bands not set", "Jalur belum ditetapkan"),
};
export const EXPIRY_BAND_TONE: Readonly<Record<ExpiryBand, "ok" | "warn" | "err" | "info" | "neutral">> = { EXPIRED: "err", CRITICAL: "err", WARNING: "warn", UPCOMING: "info", NONE: "neutral", NO_EXPIRY: "neutral", BANDS_NOT_SET: "warn" };
export const REMINDER_NOT_SENT = w("Reminder due, not sent", "Peringatan perlu, tidak dihantar");

export const VERDICT_LABEL: Readonly<Record<Verdict, Words>> = { ELIGIBLE: w("Eligible", "Layak"), NOT_ELIGIBLE: w("Not eligible", "Tidak layak"), NOT_ASSESSED: w("Not assessed", "Tidak dinilai") };
/// "Not assessed" is never green.
export const VERDICT_TONE: Readonly<Record<Verdict, "ok" | "err" | "warn">> = { ELIGIBLE: "ok", NOT_ELIGIBLE: "err", NOT_ASSESSED: "warn" };
export const RESULT_LABEL: Readonly<Record<Result, Words>> = { PASS: w("Pass", "Lulus"), FAIL: w("Fail", "Gagal"), NOT_ASSESSED: w("Not assessed", "Tidak dinilai"), PASS_BY_PERMISSION: w("Passes by special permission", "Lulus dengan kebenaran khas") };
export const RESULT_TONE: Readonly<Record<Result, "ok" | "err" | "warn" | "info">> = { PASS: "ok", FAIL: "err", NOT_ASSESSED: "warn", PASS_BY_PERMISSION: "info" };
export const CONDITION_LABEL: Readonly<Record<ConditionKind, Words>> = {
  REGISTERED: w("Registered with the organisation", "Berdaftar dengan organisasi"),
  STANDING: w("In good standing", "Berkedudukan baik"),
  REGISTRATION: w("Registration held across the window", "Pendaftaran dipegang sepanjang tempoh"),
  GRADE: w("Grade", "Gred"),
  CATEGORY: w("Category", "Kategori"),
  SPECIALISATION: w("Specialisation", "Pengkhususan"),
  FIELD_CODES: w("Field codes", "Kod bidang"),
  PERMITS: w("Permit types", "Jenis permit"),
  QUALIFIERS: w("What the requirement states", "Apa yang dinyatakan keperluan"),
  RESTRICTION: w("The restriction's evidence across the window", "Bukti sekatan sepanjang tempoh"),
};

/// Why a condition reads as it does, in words.
export function conditionWords(r: Pick<ConditionRow, "reason" | "data">): Words {
  const d = r.data ?? {};
  switch (r.reason) {
    case "IS_REGISTERED": return w("Registered.", "Berdaftar.");
    case "NOT_REGISTERED": return w("Not registered with the organisation.", "Tidak berdaftar dengan organisasi.");
    case "IN_GOOD_STANDING": return w("Active.", "Aktif.");
    case "BARRED": return w(`${STANDING_LABEL[d.standing as Standing]?.en ?? "Barred"}.`, `${STANDING_LABEL[d.standing as Standing]?.ms ?? "Dihalang"}.`);
    case "LAPSE_RULE_NOT_SET": return w(`${LAPSE_RULE_NOT_SET_WORDS.en}${d.types ? ` (${d.types})` : ""}.`, `${LAPSE_RULE_NOT_SET_WORDS.ms}${d.types ? ` (${d.types})` : ""}.`);
    case "NO_DOCUMENT_TYPE_FOR_BODY": return w(`No document type records ${d.body}'s registration (${SETTINGS.en}, Document types).`, `Tiada jenis dokumen merekodkan pendaftaran ${d.body} (${SETTINGS.ms}, Jenis dokumen).`);
    case "QUALIFIERS_IN_WORDS": return w(`Stated in words only (“${d.qualifiers}”), not compared.`, `Dinyatakan dalam perkataan sahaja (“${d.qualifiers}”), tidak dibandingkan.`);
    case "GRADE_MET": return w(`Holds ${d.held}; ${d.needed} or above is asked.`, `Memegang ${d.held}; ${d.needed} atau lebih diminta.`);
    case "GRADE_BELOW": return w(`Holds ${d.held}, below the ${d.needed} asked.`, `Memegang ${d.held}, di bawah ${d.needed} yang diminta.`);
    case "GRADE_NOT_HELD": return w(`Holds no grade; ${d.needed} is asked.`, `Tidak memegang gred; ${d.needed} diminta.`);
    case "GRADE_RANK_NOT_SET": return w(`A grade's rank is not set (${SETTINGS.en}, Values), so ${d.needed} cannot be compared.`, `Kedudukan gred belum ditetapkan (${SETTINGS.ms}, Nilai), jadi ${d.needed} tidak boleh dibandingkan.`);
    case "VALUE_HELD": return w(`Holds ${d.held}.`, `Memegang ${d.held}.`);
    case "VALUE_NOT_HELD": return w(`Holds none of ${d.needed}.`, `Tidak memegang mana-mana ${d.needed}.`);
    case "FIELD_CODES_HELD": return w("Holds every field code asked.", "Memegang setiap kod bidang yang diminta.");
    case "FIELD_CODES_MISSING": return w(`Does not hold ${d.missing}.`, `Tidak memegang ${d.missing}.`);
    case "PERMITS_HELD": return w("Holds every permit type asked.", "Memegang setiap jenis permit yang diminta.");
    case "PERMITS_MISSING": return w(`Does not hold ${d.missing}.`, `Tidak memegang ${d.missing}.`);
    case "RESTRICTION_NOT_STATED": return w("Whether the exercise is restricted is not stated on it.", "Sama ada latihan terhad tidak dinyatakan padanya.");
    case "EVIDENCE_TYPE_NOT_SET": return w(`The document type that evidences the restriction is not set (${SETTINGS.en}, Standing).`, `Jenis dokumen yang membuktikan sekatan belum ditetapkan (${SETTINGS.ms}, Kedudukan).`);
    case "COVERS_WINDOW": return d.body ? w(`${asHeading(String(d.body))}: verified and in force from the advertisement to past the closing.`, `${asHeading(String(d.body))}: disahkan dan berkuat kuasa dari iklan hingga selepas tutup.`) : w("Verified and in force from the advertisement to past the closing.", "Disahkan dan berkuat kuasa dari iklan hingga selepas tutup.");
    case "COVERS_TO_CLOSING_DAY": return w(`Expires on the closing day (${day(d.expiresOn)}), which the policy counts as valid.`, `Tamat pada hari tutup (${day(d.expiresOn)}), yang dikira sah oleh polisi.`);
    case "NOT_PUBLISHED": return w("The window is not published yet: there is no advertisement day to judge from.", "Tetingkap belum diterbitkan: tiada tarikh iklan untuk dinilai.");
    case "CLOSING_NOT_SET": return w("The closing is not set.", "Tarikh tutup belum ditetapkan.");
    case "NOT_HELD": return d.body ? w(`${asHeading(String(d.body))}: no verified document on file.`, `${asHeading(String(d.body))}: tiada dokumen disahkan dalam fail.`) : w("No verified document on file.", "Tiada dokumen disahkan dalam fail.");
    case "RECORDED_NOT_APPLICABLE": return w("Recorded as not applicable.", "Direkodkan sebagai tidak berkenaan.");
    case "UNVERIFIED": return w("Lodged and not yet verified.", "Dikemukakan dan belum disahkan.");
    case "RENEWAL_UNVERIFIED": return w("A renewal is lodged and not yet verified: judged once it is.", "Pembaharuan dikemukakan dan belum disahkan: dinilai setelah disahkan.");
    case "STARTS_AFTER_ADVERTISEMENT": return w(`Valid only from ${day(d.from)}, after the advertisement (${day(d.advertisementDay)}).`, `Sah hanya dari ${day(d.from)}, selepas iklan (${day(d.advertisementDay)}).`);
    case "EXPIRED_BEFORE_ADVERTISEMENT": return w(`Expired before the advertisement (${day(d.advertisementDay)}).`, `Tamat sebelum iklan (${day(d.advertisementDay)}).`);
    case "LAPSES_BEFORE_CLOSING": return w(`Expires ${day(d.expiresOn)}, before the closing (${day(d.closingDay)}), though valid today.`, `Tamat ${day(d.expiresOn)}, sebelum tutup (${day(d.closingDay)}), walaupun sah hari ini.`);
    case "LAPSES_ON_CLOSING_DAY": return w(`Expires on the closing day (${day(d.expiresOn)}), which the policy does not count as valid.`, `Tamat pada hari tutup (${day(d.expiresOn)}), yang tidak dikira sah oleh polisi.`);
    case "CLOSING_DAY_RULE_NOT_SET": return w(`Expires on the closing day (${day(d.expiresOn)}), and whether that counts is not set (${SETTINGS.en}, Standing).`, `Tamat pada hari tutup (${day(d.expiresOn)}), dan sama ada itu dikira belum ditetapkan (${SETTINGS.ms}, Kedudukan).`);
  }
}

/// What a supplier's blacklisting route is called in a refusal.
export const BLACKLIST_MATTER = w("a supplier's blacklisting", "senarai hitam pembekal");
/// What a special permission's route is called in a refusal.
export const PERMISSION_MATTER = w("a special permission", "kebenaran khas");
/// Where a refused blacklisting route goes: nothing is recorded.
export const STANDING_REFUSED_DECIDED_BY = "nothing is recorded: the request is closed, and may be asked for again";
export const PERMISSION_REFUSED_DECIDED_BY = "the permission is not granted: it may be asked for again";

/// A finding of the register's rules, in words.
export function supplierFaultText(f: Finding, lang: keyof Words = "en"): string {
  const t = (TEXT as Record<string, (d: Record<string, string | number | null>) => Words>)[f.code];
  return t ? t(f.data ?? {})[lang] : lang === "en" ? "This cannot be done as it stands." : "Ini tidak boleh dilakukan seperti keadaannya.";
}

/// Whether every code a rule can return has words (the labels test asks this of each fault list).
export const hasFaultText = (code: string) => code in TEXT;

/// A step decider's fault on a supplier route, in words (6.1's rule; the matter is the supplier's, not a requisition).
export const SUPPLIER_DECIDER_TEXT: Readonly<Record<DeciderFault, Words>> = {
  TIME_ZONE_UNSET: w("Set the organisation's time zone before recording decisions.", "Tetapkan zon waktu organisasi sebelum merekodkan keputusan."),
  COMMITTEE_STEP: w("A committee step is not taken on a supplier matter.", "Langkah jawatankuasa tidak diambil bagi perkara pembekal."),
  NOT_PENDING: w("This step is already decided.", "Langkah ini sudah diputuskan."),
  OUT_OF_ORDER: w("An earlier step is still pending. Steps are decided in order.", "Langkah terdahulu masih belum diputuskan. Langkah diputuskan mengikut turutan."),
  INACTIVE: w("That person is recorded as having left.", "Orang itu direkodkan telah meninggalkan organisasi."),
  NOT_HOLDER: w("That person does not hold this office organisation-wide on that day, and holds no delegation of it without a value ceiling (a supplier matter has no value to judge a ceiling by).", "Orang itu tidak memegang jawatan ini di peringkat organisasi pada hari itu, dan tidak memegang perwakilan kuasa tanpa had nilai."),
  DELEGATION_NOT_PERMITTED: w("This step cannot be delegated, and that person acts only under a delegation.", "Langkah ini tidak boleh diwakilkan, dan orang itu bertindak hanya di bawah perwakilan kuasa."),
  OVER_CEILING: w("A delegation with a value ceiling cannot be judged on a supplier matter, which has no value.", "Perwakilan kuasa dengan had nilai tidak boleh dinilai bagi perkara pembekal, yang tiada nilai."),
  SELF_APPROVAL: w("That person sent this matter for decision. Nobody decides a matter they sent.", "Orang itu menghantar perkara ini untuk keputusan. Tiada sesiapa memutuskan perkara yang dihantarnya."),
  // A supplier route bars the one person who sent it (SELF_APPROVAL), so this code is not met here; it has words because every code does.
  SENT_IT: w("That person sent this matter for decision. Nobody decides a matter they sent.", "Orang itu menghantar perkara ini untuk keputusan. Tiada sesiapa memutuskan perkara yang dihantarnya."),
  ENDORSED_IT: w("That person endorsed this matter.", "Orang itu telah menyokong perkara ini."),
  ALREADY_DISCHARGED_A_STEP: w("That person has already decided another step of this route.", "Orang itu telah memutuskan langkah lain laluan ini."),
  FUTURE_DATE: w("A decision cannot be dated after today.", "Keputusan tidak boleh bertarikh selepas hari ini."),
  BEFORE_SUBMISSION: w("A decision cannot be dated before the matter was sent for decision.", "Keputusan tidak boleh bertarikh sebelum perkara dihantar untuk keputusan."),
  DECLARED_CONFLICT: w("That person declared a conflict of interest on this step and recused.", "Orang itu mengisytiharkan konflik kepentingan pada langkah ini dan menarik diri."),
  RECORDER_IS_REQUESTER: w("You sent this matter for decision. Nobody records the decision of a matter they sent, for themselves or on someone else's behalf.", "Anda menghantar perkara ini untuk keputusan. Tiada sesiapa merekodkan keputusan perkara yang dihantarnya, untuk diri sendiri atau bagi pihak orang lain."),
  RECORDER_ENDORSED_IT: w("You endorsed this matter. An endorser does not record its decision for someone else.", "Anda telah menyokong perkara ini. Penyokong tidak merekodkan keputusannya bagi pihak orang lain."),
  RECORDER_DECIDED_ANOTHER_STEP: w("You have already decided another step of this route. The same person does not record a second decision on it for someone else.", "Anda telah memutuskan langkah lain laluan ini. Orang yang sama tidak merekodkan keputusan kedua padanya bagi pihak orang lain."),
  RECORDER_DECLARED_CONFLICT: w("You declared a conflict of interest on this step and recused. You do not record its decision for someone else.", "Anda mengisytiharkan konflik kepentingan pada langkah ini dan menarik diri. Anda tidak merekodkan keputusannya bagi pihak orang lain."),
};

/// What a supplier's registration is called in a route refusal.
export const REGISTRATION_MATTER = w("a supplier's registration", "pendaftaran pembekal");
/// Where a refused registration route goes: the application stays open.
export const REGISTRATION_REFUSED_DECIDED_BY = "the application stays open: resubmission may be requested, it may be rejected, or sent again";
