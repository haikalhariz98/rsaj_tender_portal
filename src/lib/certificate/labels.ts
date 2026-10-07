/**
 * The certificate core's words, in English and Malay (AGENTS.md rule 5: codes never reach a screen; every
 * string has both lines). Screens render `.en` today; the Malay line is kept beside it for the bilingual
 * pass. Every map is exhaustive over its vocabulary (X-8), held so by `types-schema.test.ts`.
 */

import { ON_BEHALF_PHRASE } from "@/lib/auth/attribution";
import { w, type Tone, type Words } from "@/lib/contract/labels";

import type { CertificateKind, CertificateStatus, DeliveryMethod, DistributionCondition, RoutingCheckKind, RoutingSubject, SignatureBlockKind, SignatureDecision, SignatureOfficeRule } from "./types";

export { w, type Tone, type Words };

export const KIND_WORDS: Readonly<Record<CertificateKind, Words>> = {
  DELEGATION_LETTER: w("Letter of delegation", "Surat perwakilan kuasa"),
  DELEGATION_NOTICE: w("Notice of delegation to the contractor", "Notis perwakilan kuasa kepada kontraktor"),
  INTERIM_PAYMENT: w("Interim payment certificate", "Perakuan bayaran interim"),
  ADVANCE_PAYMENT: w("Advance payment certificate", "Perakuan bayaran pendahuluan"),
  LAD_WARNING: w("Warning of liquidated damages", "Surat amaran ganti rugi tertentu dan ditetapkan"),
  NON_COMPLETION: w("Certificate of non-completion", "Perakuan kerja tidak siap"),
  VARIATION_APPLICATION: w("Application for a variation", "Permohonan perubahan kerja"),
  SO_INSTRUCTION: w("Superintending Officer's instruction", "Arahan Pegawai Penguasa"),
  VARIATION: w("Variation order", "Arahan perubahan kerja"),
  SUM_ADJUSTMENT: w("Contract sum adjustment", "Pelarasan harga kontrak"),
  // 6.13 Part B run 1a (intake 2).
  EOT: w("Certificate of extension of time", "Perakuan lanjutan masa"),
  CONTRACT_PERIOD_AGREEMENT: w("Supplementary agreement extending the contract period", "Perjanjian tambahan lanjutan tempoh kontrak"),
  PARTIAL_OCCUPATION: w("Certificate of partial occupation", "Perakuan pendudukan separa"),
  PRACTICAL_COMPLETION: w("Certificate of practical completion", "Perakuan siap kerja"),
  SCHEDULE_OF_DEFECTS: w("Schedule of defects", "Jadual kecacatan"),
  MAKING_GOOD_DEFECTS: w("Certificate of making good defects", "Perakuan siap membaiki kecacatan"),
  TERMINATION_INTENT: w("Notice of intention to terminate", "Notis hasrat penamatan"),
  TERMINATION: w("Notice of termination", "Notis penamatan"),
  TERMINATED_FINAL: w("Final payment certificate, contractor's employment terminated", "Perakuan pembayaran muktamad, pengambilan kerja kontraktor ditamatkan"),
  NOMINATION_LETTER: w("Nomination letter", "Surat penamaan"),
  FINAL: w("Final certificate", "Perakuan muktamad"),
};

export const STATUS_WORDS: Readonly<Record<CertificateStatus, Words>> = {
  DRAFT: w("Draft", "Draf"),
  IN_ROUTING: w("On its routing sheet", "Dalam penghalaan"),
  SIGNING: w("Being signed", "Sedang ditandatangani"),
  ISSUED: w("Issued", "Dikeluarkan"),
  VOID: w("Void", "Batal"),
};

export const STATUS_TONE: Readonly<Record<CertificateStatus, Tone>> = {
  DRAFT: "neutral",
  IN_ROUTING: "info",
  SIGNING: "brand",
  ISSUED: "ok",
  VOID: "err",
};

export const BLOCK_KIND_WORDS: Readonly<Record<SignatureBlockKind, Words>> = {
  RECOMMENDING: w("Recommends", "Mengesyorkan"),
  AUTHORISING: w("Authorises", "Membenarkan"),
  CONTRACTOR: w("The contractor", "Kontraktor"),
  WITNESS: w("Witness", "Saksi"),
  APPLICANT: w("Applies", "Pemohon"),
  SUPPORTING: w("Supports", "Menyokong"),
};

export const OFFICE_RULE_WORDS: Readonly<Record<SignatureOfficeRule, Words>> = {
  SO: w("The Superintending Officer", "Pegawai Penguasa"),
  SO_REP: w("The Superintending Officer's representative", "Wakil Pegawai Penguasa"),
  RECOMMENDING_OFFICER: w("The recommending officer", "Pegawai yang mengesyorkan"),
  CONTRACTOR: w("The contractor's signatory", "Penandatangan kontraktor"),
  WITNESS: w("A witness", "Saksi"),
  NAMED_OFFICE: w("A named office", "Jawatan yang dinamakan"),
};

export const DECISION_WORDS: Readonly<Record<SignatureDecision, Words>> = {
  SUPPORTED: w("Supported", "Disokong"),
  NOT_SUPPORTED: w("Not supported", "Tidak disokong"),
};

export const CONDITION_WORDS: Readonly<Record<DistributionCondition, Words>> = {
  NONE: w("Always", "Sentiasa"),
  GUARANTOR_EXISTS: w("Only where a performance bond is live (its guarantor)", "Hanya jika bon pelaksanaan berkuat kuasa (penjaminnya)"),
  CONSULTANT_ENGAGED: w("Only where a consulting engineer is engaged", "Hanya jika jurutera perunding dilantik"),
};

export const CHECK_KIND_WORDS: Readonly<Record<RoutingCheckKind, Words>> = {
  CHECKED: w("Checked by", "Disemak oleh"),
  VERIFIED: w("Verified by", "Disahkan oleh"),
  ENDORSED: w("Endorsed by", "Disokong oleh"),
};

export const SUBJECT_WORDS: Readonly<Record<RoutingSubject, Words>> = {
  CERTIFICATE: w("A certificate's route", "Laluan perakuan"),
  AWARD: w("An award's appointment route (pre-award sheet)", "Laluan pelantikan award (helaian pra-award)"),
};

export const METHOD_WORDS: Readonly<Record<DeliveryMethod, Words>> = {
  REGISTERED_POST: w("Registered post", "Pos berdaftar"),
  COLLECTION: w("Collected", "Diambil sendiri"),
  BY_HAND: w("By hand", "Serahan tangan"),
};

/// Phrases the screens and the frozen sheet share.
export const CERT_WORDS = {
  numberOnIssue: w("Allocated on issue", "Diperuntukkan semasa dikeluarkan"),
  dateWhenSigned: w("Set when signed: the day of the authorising signature, never typed", "Ditetapkan semasa ditandatangani: hari tandatangan yang membenarkan, tidak ditaip"),
  notDatedBySignature: w("This form has no block that dates it", "Borang ini tiada blok yang menentukan tarikhnya"),
  draftNotIssued: w("Draft — not issued", "Draf — belum dikeluarkan"),
  overridden: w("Overridden", "Diganti"),
  computed: w("Computed", "Dikira"),
  targetNotSet: w("Target not set", "Sasaran belum ditetapkan"),
  edgeUndecided: w("Target not set: which side of the band's edge counts is not decided", "Sasaran belum ditetapkan: pihak sempadan jalur yang dikira belum diputuskan"),
  calendarDays: w("Calendar days (assumed, a question to the customer)", "Hari kalendar (andaian, soalan kepada pelanggan)"),
  noRoute: w("No approval route: this certificate is not routed through the approval matrix", "Tiada laluan kelulusan: perakuan ini tidak dihalakan melalui matriks kelulusan"),
  officeNotSet: w("Any officer: no office is set for this check", "Mana-mana pegawai: tiada jawatan ditetapkan bagi semakan ini"),
} as const;

/// The one phrase lives in `auth/attribution.ts` (Phase 2a retired this copy of it). Phase 2b replaces its readers with the attribution label.
export const ON_BEHALF = ON_BEHALF_PHRASE;
