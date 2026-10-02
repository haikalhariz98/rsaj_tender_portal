/**
 * The supplier register's words, in English and Malay (AGENTS.md rule 5: codes never reach a screen;
 * the bilingual rule: every string here has both). Screens render `.en` today; the Malay line is kept
 * beside it so the bilingual pass needs no rewording.
 */

import { formatDate } from "@/lib/format";
import type { DeciderFault } from "@/lib/requisition/holders";

import type { DocumentState } from "./documents";
import type { IdentityFault } from "./identity";
import type { LodgeFault, VerifyFault } from "./documents";
import type { ConfigFault } from "./config";
import type { QueueState, ReviewFault } from "./review";
import type { VendorCodeFault } from "@/lib/integration/vendor-master";
import type { ApplicationChannel, ApplicationKind, ApplicationOutcome, ApplicationStatus, Finding, RegistrationValueKind, SupplierListKind, SupplierStatus, VerificationState } from "./types";

export interface Words {
  en: string;
  ms: string;
}

const w = (en: string, ms: string): Words => ({ en, ms });
const day = (d: unknown) => (typeof d === "string" && d ? formatDate(d) : "—");

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
export const LAPSE_RECORDED_LABEL = w("Rejected on lapse", "Ditolak kerana luput");
export const IN_DECISION_LABEL = w("With approval", "Dalam kelulusan");

export const QUEUE_STATE_LABEL: Readonly<Record<QueueState, Words>> = {
  RECEIVED: w("Received", "Diterima"),
  WITH_APPROVAL: IN_DECISION_LABEL,
  RESUBMISSION_REQUESTED: w("Resubmission requested", "Penghantaran semula diminta"),
  LAPSED: LAPSED_LABEL,
  APPROVED: w("Approved", "Diluluskan"),
  REJECTED: w("Rejected", "Ditolak"),
  REJECTED_ON_LAPSE: LAPSE_RECORDED_LABEL,
};
export const QUEUE_STATE_TONE: Readonly<Record<QueueState, "ok" | "warn" | "err" | "info" | "neutral">> = { RECEIVED: "info", WITH_APPROVAL: "info", RESUBMISSION_REQUESTED: "warn", LAPSED: "err", APPROVED: "ok", REJECTED: "neutral", REJECTED_ON_LAPSE: "neutral" };

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
};
export const LIST_KIND_SINGULAR: Readonly<Record<SupplierListKind, Words>> = {
  ENTITY_TYPE: w("Entity type", "Jenis entiti"),
  COUNTRY: w("Country", "Negara"),
};

/// Condition (2): contacts and scans are readable by anyone at the portal until sign-in.
export const NOT_RESTRICTED_CHIP = w("Not restricted until sign-in", "Tidak terhad sehingga log masuk");
/// OD-3 B: the E-Payment form's scan is SULIT at upload and never downloadable before sign-in.
export const EPAYMENT_SULIT_CHIP = w("SULIT · not downloadable until sign-in", "SULIT · tidak boleh dimuat turun sehingga log masuk");
export const ON_BEHALF = w("recorded on behalf of, not signed", "direkodkan bagi pihaknya, tidak ditandatangani");
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

type AnyFault = IdentityFault | LodgeFault | VerifyFault | ReviewFault | ConfigFault | VendorCodeFault;

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
  NOT_LAPSED: (d) => w(d.resubmitBy ? `The deadline (${day(d.resubmitBy)}) has not passed: it lapses the day after.` : "No resubmission deadline stands on it.", d.resubmitBy ? `Tarikh akhir (${day(d.resubmitBy)}) belum berlalu: ia luput sehari selepasnya.` : "Tiada tarikh akhir penghantaran semula padanya."),
  ROUTE_PENDING: () => w("It is with approval: wait for the route's decision.", "Ia dalam kelulusan: tunggu keputusan laluan."),
  DECLARATION_DAY_REQUIRED: () => w("Record the day the paper declaration was signed.", "Rekodkan tarikh akuan bertulis ditandatangani."),
  DECLARATION_SCAN_REQUIRED: () => w("Attach the signed declaration's scan on the application.", "Lampirkan imbasan akuan yang ditandatangani pada permohonan."),
  TYPES_NOT_SET: () => w(`No document types are configured, so the file cannot be judged complete. Set them under ${SETTINGS.en}, Document types.`, `Tiada jenis dokumen dikonfigurasi. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  DOCUMENT_NOT_STANDING: (d) => w(`${d.type} is mandatory and reads “${TYPE_STATE(d.state).en.toLowerCase()}”: it must be verified and in force.`, `${d.type} wajib dan berstatus “${TYPE_STATE(d.state).ms.toLowerCase()}”: ia mesti disahkan dan berkuat kuasa.`),
  MANDATORY_NOT_SET: (d) => w(`Whether ${d.type} is mandatory is not set, so the file cannot be judged complete. Set it under ${SETTINGS.en}, Document types.`, `Sama ada ${d.type} wajib belum ditetapkan. Tetapkan di ${SETTINGS.ms}, Jenis dokumen.`),
  ITEMS_REQUIRED: () => w("Name at least one item to resubmit.", "Namakan sekurang-kurangnya satu perkara untuk dihantar semula."),
  ITEM_REMARKS_REQUIRED: () => w("Every item needs its remarks, as they are to be given to the supplier.", "Setiap perkara memerlukan catatan, seperti yang akan diberikan kepada pembekal."),
  ITEM_NAMES_NOTHING: () => w("Every item names a document on file or a configured document type.", "Setiap perkara menamakan dokumen dalam fail atau jenis dokumen yang dikonfigurasi."),
  SCAN_REQUIRED: () => w("Attach the document's scan first: it is verified on its scan.", "Lampirkan imbasan dokumen dahulu: ia disahkan berdasarkan imbasannya."),
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
};

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
  ENDORSED_IT: w("That person endorsed this matter.", "Orang itu telah menyokong perkara ini."),
  ALREADY_DISCHARGED_A_STEP: w("That person has already decided another step of this route.", "Orang itu telah memutuskan langkah lain laluan ini."),
  FUTURE_DATE: w("A decision cannot be dated after today.", "Keputusan tidak boleh bertarikh selepas hari ini."),
  BEFORE_SUBMISSION: w("A decision cannot be dated before the matter was sent for decision.", "Keputusan tidak boleh bertarikh sebelum perkara dihantar untuk keputusan."),
  DECLARED_CONFLICT: w("That person declared a conflict of interest on this step and recused.", "Orang itu mengisytiharkan konflik kepentingan pada langkah ini dan menarik diri."),
};

/// What a supplier's registration is called in a route refusal.
export const REGISTRATION_MATTER = w("a supplier's registration", "pendaftaran pembekal");
/// Where a refused registration route goes: the application stays open.
export const REGISTRATION_REFUSED_DECIDED_BY = "the application stays open: resubmission may be requested, it may be rejected, or sent again";
