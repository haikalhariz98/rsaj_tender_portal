/**
 * Interim payment's and the damages chain's words (6.13 Part A step 3), English and Malay. A code never reaches a
 * screen: every enum value and every refusal is worded here, naming what refuses the act and the way out of it.
 * Where a refusal stands on something frozen when the certificate was raised, the words say what it was raised
 * under and what can still be done, never "set it" (the setting no longer moves it). Exhaustive maps.
 */

import { formatDate } from "@/lib/format";
import { templateNotSetWords } from "@/lib/certificate/form-needs";
import { ladFaultWords } from "@/lib/lad/labels";
import { formatSen } from "@/lib/money";

import type { AdvanceParty, ContractClock, ContractorAnswer, Finding, KeyedDeductionKind, NonCompletionOutcome, NonCompletionScope, PackItem, PaymentRouteFigure, RetentionRelease, RetentionTier, ValuationStatus, ValuationTrigger, WaterfallRemainder } from "./types";
import { creditorStandingWords } from "./creditor";
import type { MaterialVerdict } from "./materials";
import type { OpeningGroup } from "./opening";

export interface Words {
  en: string;
  ms: string;
}
export const w = (en: string, ms: string): Words => ({ en, ms });

export const TRIGGER_WORDS: Readonly<Record<ValuationTrigger, Words>> = {
  VALUATION_DATE: w("The agreed monthly valuation day", "Hari penilaian bulanan yang dipersetujui"),
  CLAIM: w("A claim from the contractor", "Tuntutan daripada kontraktor"),
};

export const ANSWER_WORDS: Readonly<Record<ContractorAnswer, Words>> = {
  AGREED: w("Agreed by the contractor", "Dipersetujui oleh kontraktor"),
  DISSENT: w("The contractor dissents", "Kontraktor tidak bersetuju"),
};

export const VALUATION_STATUS_WORDS: Readonly<Record<ValuationStatus, Words>> = {
  OPEN: w("Being valued", "Sedang dinilai"),
  RAISED: w("Certificate raised", "Perakuan dibangkitkan"),
  HELD: w("Held to the next cycle", "Ditangguhkan ke kitaran berikutnya"),
  WITHDRAWN: w("Withdrawn", "Ditarik balik"),
};

export const DEDUCTION_WORDS: Readonly<Record<KeyedDeductionKind, Words>> = {
  PREMIUMS_PERKESO: w("Insurance premiums and social security paid by the employer", "Premium insurans dan PERKESO dibayar oleh majikan"),
  WAGES: w("Workers' wages paid by the employer", "Upah pekerja dibayar oleh majikan"),
  NON_COMPLIANCE: w("Costs of the contractor's failure to comply with instructions", "Kos kegagalan kontraktor mematuhi arahan"),
  OTHER: w("Another permitted deduction", "Potongan lain yang dibenarkan"),
  LAD_ROUNDING: w("Rounding on the damages line (signed)", "Pelarasan pembundaran ganti rugi"),
};

export const RELEASE_WORDS: Readonly<Record<RetentionRelease, Words>> = {
  RELEASED_FIRST: w("First release, on the as-built drawings", "Pelepasan pertama, atas lukisan siap bina"),
  RELEASED_BALANCE: w("Balance, on the Certificate of Making Good Defects", "Baki, atas Perakuan Membaiki Kecacatan"),
};

export const TIER_WORDS: Readonly<Record<RetentionTier, Words>> = {
  MAIN: w("Main contractor", "Kontraktor utama"),
  NSC: w("Nominated sub-contractors", "Subkontraktor dinamakan"),
  NS: w("Nominated suppliers", "Pembekal dinamakan"),
};

export const ADVANCE_PARTY_WORDS: Readonly<Record<AdvanceParty, Words>> = {
  MAIN: w("The main contractor", "Kontraktor utama"),
  NSC: w("A nominated sub-contractor", "Subkontraktor dinamakan"),
};

export const ROUTE_FIGURE_WORDS: Readonly<Record<PaymentRouteFigure, Words>> = {
  RECOMMENDED: w("The payment recommended on the certificate", "Bayaran yang disyorkan pada perakuan"),
  GROSS_THIS_PERIOD: w("The gross value this period", "Nilai kasar tempoh ini"),
};

export const REMAINDER_WORDS: Readonly<Record<WaterfallRemainder, Words>> = {
  LARGEST_REMAINDER: w("To the largest remainders, a sen each", "Kepada baki terbesar, satu sen setiap satu"),
  FIRST_PARTY: w("All to the first party", "Semua kepada pihak pertama"),
};

export const OUTCOME_WORDS: Readonly<Record<NonCompletionOutcome, Words>> = {
  LAD_APPLIES: w("Damages apply: Certificate of Non-Completion", "Ganti rugi dikenakan: Perakuan Kerja Tidak Siap"),
  EXCUSED_OR_PENDING: w("Delay excusable, or entitlement pending", "Kelewatan boleh dimaafkan, atau hak masih belum diputuskan"),
};

export const SCOPE_WORDS: Readonly<Record<NonCompletionScope, Words>> = {
  WHOLE: w("The whole of the works", "Keseluruhan kerja"),
  SECTION: w("A section of the works", "Satu bahagian kerja"),
};

export const OPENING_GROUP_WORDS: Readonly<Record<OpeningGroup, Words>> = {
  gross: w("Gross certified to date", "Nilai kasar diperakui setakat ini"),
  previous: w("Previously certified to date", "Telah diperakui setakat ini"),
  retention: w("Retention held", "Wang tahanan dipegang"),
  released: w("Retention released", "Wang tahanan dilepaskan"),
  advance: w("Advance recouped", "Pendahuluan dipulihkan"),
  damages: w("Damages charged until", "Ganti rugi dikenakan sehingga"),
};

export const CLOCK_WORDS: Readonly<Record<ContractClock, Words>> = {
  ORAL_CONFIRM: w("Confirming an oral instruction in writing", "Pengesahan arahan lisan secara bertulis"),
  ORAL_OBJECTION: w("Objecting to a confirmed oral instruction", "Bantahan terhadap arahan lisan yang disahkan"),
  DAYWORK_SUBSTANTIATION: w("Substantiating daywork", "Pembuktian kerja harian"),
  LAD_WARNING_RESPONSE: w("The contractor's reasons after a damages warning", "Alasan kontraktor selepas amaran ganti rugi"),
  CERT_ISSUE: w("Issuing a certificate after its valuation or claim", "Mengeluarkan perakuan selepas penilaian atau tuntutan"),
};

export const PACK_WORDS: Readonly<Record<PackItem, Words>> = {
  STUDY: w("The S.O. Representative's study: the contractor's ability to complete, and whether damages will speed completion", "Kajian Wakil P.P.: keupayaan kontraktor menyiapkan, dan sama ada ganti rugi akan mempercepat penyiapan"),
  PROGRESS: w("Progress achieved, the balance of work, and when it can be completed", "Kemajuan dicapai, baki kerja, dan bila boleh disiapkan"),
  EMPLOYER_DELAY: w("Whether the employer caused delay, extensions granted, and further delay expected", "Sama ada majikan menyebabkan kelewatan, lanjutan diberi, dan kelewatan lanjut dijangka"),
  PAYMENTS: w("Interim payments made, and the reasons for any late or non-payment", "Bayaran interim dibuat, dan sebab bayaran lewat atau tidak dibayar"),
};

export const MATERIAL_VERDICT_WORDS: Readonly<Record<MaterialVerdict, Words>> = {
  ELIGIBLE: w("Valued", "Dinilai"),
  NOT_ANSWERED: w("Not valued: the three answers are not all recorded", "Tidak dinilai: tiga jawapan belum direkodkan"),
  NOT_PROTECTED: w("Not valued: not adequately protected", "Tidak dinilai: tidak dilindungi dengan sewajarnya"),
  TOO_EARLY: w("Not valued: delivered too early", "Tidak dinilai: dihantar terlalu awal"),
  NOT_PART_OF_WORKS: w("Not valued: does not form part of the completed works", "Tidak dinilai: bukan sebahagian kerja yang siap"),
  TEMPORARY: w("Not valued: formwork or other temporary works", "Tidak dinilai: acuan atau kerja sementara"),
};

const money = (v: unknown) => (typeof v === "string" && /^-?\d+$/.test(v) ? formatSen(BigInt(v)) : typeof v === "string" ? v : "the amount");
const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const FIELD: Readonly<Record<string, Words>> = {
  retentionApplies: w("whether retention applies", "sama ada wang tahanan dikenakan"),
  retentionPercent: w("the retention percentage", "peratusan wang tahanan"),
  retentionCapPercent: w("the retention cap", "had wang tahanan"),
  firstInterimMinimum: w("the first interim certificate's minimum", "minimum perakuan interim pertama"),
  subsequentInterimMinimum: w("a later interim certificate's minimum", "minimum perakuan interim seterusnya"),
};
const KIND_FORM: Readonly<Record<string, Words>> = {
  INTERIM_PAYMENT: w("the interim payment certificate", "perakuan bayaran interim"),
  ADVANCE_PAYMENT: w("the advance payment certificate", "perakuan bayaran pendahuluan"),
  LAD_WARNING: w("the damages warning letter", "surat amaran ganti rugi"),
  NON_COMPLETION: w("the Certificate of Non-Completion", "Perakuan Kerja Tidak Siap"),
  warning: w("the damages warning letter", "surat amaran ganti rugi"),
  nonCompletion: w("the Certificate of Non-Completion", "Perakuan Kerja Tidak Siap"),
};
const GATE: Readonly<Record<string, Words>> = {
  RETURNED: w("the signed and witnessed Letter of Acceptance returned", "Surat Setuju Terima yang ditandatangani dan disaksikan dikembalikan"),
  BOND: w("the performance bond lodged and verified", "bon pelaksanaan diserah dan disahkan"),
  INSURANCE: w("every stipulated policy lodged and verified", "setiap polisi yang ditetapkan diserah dan disahkan"),
};

export function paymentFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ retention (B3)
    case "RETENTION_NOT_SET": {
      const fld = FIELD[String(d.field)] ?? FIELD.retentionApplies;
      return w(`The certificate's baseline does not state ${fld.en}, so its retention cannot be worked out (never taken as nothing). It is a value of the contract's baseline: correct it there, then raise the certificate.`, `Garis dasar perakuan tidak menyatakan ${fld.ms}, jadi wang tahanannya tidak boleh dikira. Betulkan di garis dasar kontrak, kemudian bangkitkan perakuan.`);
    }
    case "RETENTION_NONE_UNSUPPORTED":
      return w("The baseline says no retention applies, but not from a configured terms band or a decision recorded with its provenance, which are the only records that may say so. Record it at baseline with its provenance.", "Garis dasar menyatakan tiada wang tahanan, tetapi bukan daripada jalur terma atau keputusan yang direkodkan dengan asal usulnya. Rekodkannya di garis dasar.");
    case "RELEASED_MORE_THAN_HELD":
      return w("More retention has been released than this certificate would hold: the figures it was released on have gone down since. Check the valuation; a release is never taken back here.", "Wang tahanan yang dilepaskan melebihi yang dipegang oleh perakuan ini. Semak penilaian.");
    case "NOTHING_HELD":
      return w("No retention is held on the latest issued interim certificate, so there is nothing to release.", "Tiada wang tahanan dipegang pada perakuan interim terkini yang dikeluarkan.");
    case "NO_ISSUED_INTERIM":
      return w("No interim certificate is issued yet: retention is released from what an issued certificate holds.", "Belum ada perakuan interim dikeluarkan.");
    case "ALREADY_RELEASED":
      return w(d.kind === "balance" ? "The balance of the retention is already released: it is released once." : "The first release is already recorded: it is released once.", "Pelepasan ini telah direkodkan: ia dilepaskan sekali sahaja.");
    case "AS_BUILT_NOT_HANDED_OVER":
      return w("The first release follows the as-built drawings: record their handover under Site › Records first.", "Pelepasan pertama selepas lukisan siap bina diserahkan: rekodkan penyerahannya di Tapak › Rekod dahulu.");
    case "FIRST_RELEASE_PCT_NOT_SET":
      return w("The share of the retention released on the as-built drawings is not set under Configuration › Post-award: nothing is released on a guessed share.", "Bahagian wang tahanan yang dilepaskan atas lukisan siap bina belum ditetapkan di Konfigurasi › Selepas setuju terima.");
    case "MAKING_GOOD_NOT_ISSUED":
      return w("The balance is released on the Certificate of Making Good Defects, which arrives with completion and defects (Part B). Until it is issued, the balance stays held and the contract carries on.", "Baki dilepaskan atas Perakuan Membaiki Kecacatan, yang tiba bersama modul penyiapan dan kecacatan (Bahagian B).");
    // ------------------------------------------------ materials, minimum, totals
    case "MATERIALS_PCT_NOT_SET":
      return w("Materials on site are valued, but no allowance percentage is set: neither this contract's baseline nor Configuration › Post-award states one. The materials line is not raised on a guessed figure, never 0%.", "Bahan di tapak dinilai, tetapi tiada peratusan elaun ditetapkan sama ada di garis dasar kontrak atau di Konfigurasi › Selepas setuju terima. Bukan 0%.");
    case "MINIMUM_NOT_SET": {
      const fld = FIELD[String(d.field)] ?? FIELD.firstInterimMinimum;
      return w(`The certificate's baseline does not state ${fld.en}, so whether it may be raised cannot be judged. It is a value of the contract's baseline: correct it there.`, `Garis dasar perakuan tidak menyatakan ${fld.ms}. Betulkan di garis dasar kontrak.`);
    }
    case "BELOW_MINIMUM":
      return w(`${d.first === "yes" ? "The value of work executed and materials delivered" : "The amount this certificate carries forward"} (${money(d.value)}) is below the ${d.first === "yes" ? "first certificate's" : "certificate's"} minimum (${money(d.minimum)}). Hold the valuation to the next cycle.`, `Nilai (${money(d.value)}) di bawah minimum (${money(d.minimum)}). Tangguhkan penilaian ke kitaran berikutnya.`);
    case "RECOMMENDED_NEGATIVE":
      return w(`The deductions are more than the certificate carries forward (the payment would be ${money(d.recommended)}): a certificate does not certify a negative payment. Review the keyed deductions; what cannot be deducted now waits for a later certificate.`, "Potongan melebihi amaun yang dibawa ke hadapan: perakuan tidak memperakui bayaran negatif. Semak potongan yang dimasukkan.");
    case "LAD_ROUNDING_OUT_OF_RANGE":
      return w(`The rounding on the damages line (${money(d.rounding)}) is RM1.00 or more either way: a rounding brings the damages to the ringgit, it does not waive them (a waiver has its own approval).`, `Pembundaran baris ganti rugi (${money(d.rounding)}) RM1.00 atau lebih: pembundaran bukan pengecualian.`);
    case "LAD_ROUNDING_BELOW_NOTHING":
      return w(`The rounding (${money(d.rounding)}) would take the damages (${money(d.damages)}) below nothing.`, `Pembundaran akan menjadikan ganti rugi di bawah sifar.`);
    case "ROUNDING_WITHOUT_LAD":
      return w("A rounding on the damages line is keyed, but this certificate has no damages line: remove the rounding.", "Pelarasan pembundaran ganti rugi dimasukkan, tetapi perakuan ini tiada baris ganti rugi.");
    case "TOO_MANY_OTHER_DEDUCTIONS":
      return w(`The certificate carries at most ${s(d.max, "three")} other permitted deductions.`, `Perakuan membawa paling banyak ${s(d.max, "tiga")} potongan lain.`);
    case "NEGATIVE_INPUT":
      return w("A value or a deduction is below nothing: give it as a positive amount.", "Nilai atau potongan di bawah sifar.");
    case "VARIATION_NOT_APPROVED":
      return w("A variation is valued that is not approved: a variation is valued only once its approval is obtained.", "Perubahan kerja yang belum diluluskan dinilai.");
    case "VOC_REQUIRED":
      return w(`The value to date (${money(d.valued)}) is beyond the revised contract sum (${money(d.revised)}): a Variation Order Certificate must be prepared and approved before this is certified.`, `Nilai setakat ini melebihi harga kontrak yang disemak: Perakuan Perubahan Kerja mesti disediakan dan diluluskan dahulu.`);
    // ------------------------------------------------ the waterfall
    case "REMAINDER_RULE_NOT_SET":
      return w(`The payment recommended does not cover what is due to the nominated parties, and splitting it pro rata leaves ${s(d.sen, "some")} sen over: where they go is not set under Configuration › Post-award. Nothing is split on a guess.`, "Pembahagian pro rata meninggalkan baki sen: peraturannya belum ditetapkan di Konfigurasi › Selepas setuju terima.");
    case "RETENTION_REMAINDER_RULE_NOT_SET":
      return w(`Retention reaches its cap, and sharing the cap pro rata between the main contractor and the nominated parties leaves ${s(d.sen, "some")} sen over: where they go is the payment waterfall's rule, not set under Configuration › Post-award. Nothing is split on a guess.`, "Pembahagian had wang tahanan pro rata meninggalkan baki sen: peraturannya belum ditetapkan.");
    case "RETENTION_SPLIT_INVALID":
      return w("Sharing the retention cap would leave a tier below nothing or above what it would hold uncapped: the certificate is not worked out on a wrong figure. Report it.", "Pembahagian had wang tahanan tidak sah.");
    case "NOTHING_TO_PAY":
      return w("The payment recommended is below nothing: there is nothing to share.", "Bayaran yang disyorkan di bawah sifar.");
    case "DUE_NEGATIVE":
      return w("An amount due to a party is below nothing.", "Amaun kena dibayar kepada satu pihak di bawah sifar.");
    // ------------------------------------------------ the advance (B2)
    case "ADVANCE_AMOUNT_REQUIRED":
      return w("Give the advance's amount.", "Nyatakan amaun pendahuluan.");
    case "ADVANCE_PARTY_REQUIRED":
      return w("Name the nominated sub-contractor the advance is for (recorded on the contract's Team tab).", "Namakan subkontraktor dinamakan bagi pendahuluan ini.");
    case "ADVANCE_ALREADY_LIVE":
      return w("An advance for this party is already recorded and not void: one at a time.", "Pendahuluan bagi pihak ini telah direkodkan.");
    case "APG_REQUIRED":
      return w("Name the Advance Payment Guarantee it rests on, lodged in the securities register.", "Namakan Jaminan Bayaran Pendahuluan dalam daftar jaminan.");
    case "APG_NOT_AN_APG":
      return w("The security named is not an Advance Payment Guarantee.", "Jaminan yang dinamakan bukan Jaminan Bayaran Pendahuluan.");
    case "APG_NOT_VERIFIED":
      return w("The Advance Payment Guarantee is not verified in the register: verify it on the award's Securities tab first.", "Jaminan Bayaran Pendahuluan belum disahkan dalam daftar.");
    case "APG_NOT_LIVE":
      return w("The Advance Payment Guarantee is not in force on the day (not yet effective, or expired).", "Jaminan Bayaran Pendahuluan tidak berkuat kuasa pada hari itu.");
    case "APG_BELOW_ADVANCE":
      return w(`The guarantee (${money(d.value)}) is for less than the advance (${money(d.amount)}). No rule states the cover required, so this is said, not refused.`, `Jaminan (${money(d.value)}) kurang daripada pendahuluan (${money(d.amount)}).`);
    case "SCHEDULE_NOT_SET":
      return w("No recoupment schedule is entered: an advance is not applied for without one (no rule states it, so it is entered per contract).", "Tiada jadual pemulihan dimasukkan.");
    case "SCHEDULE_REPEATED":
      return w("The schedule names a certificate twice: one amount per certificate.", "Jadual menamakan satu perakuan dua kali.");
    case "SCHEDULE_ROW_INVALID":
      return w("Each schedule row is a certificate number from 1 and an amount above nothing.", "Setiap baris jadual ialah nombor perakuan dan amaun melebihi sifar.");
    case "SCHEDULE_PAST":
      return w(`The schedule names a certificate already issued (up to interim certificate ${s(d.issued, "the last")}): recoupment starts with the next one.`, "Jadual menamakan perakuan yang telah dikeluarkan.");
    case "ADVANCE_VALUATION_IN_PROGRESS":
      return w(`Interim valuation ${s(d.sequence, "in progress")} is being valued or its certificate is not yet issued, and its recoupment was fixed from the advances issued when it was worked out: apply for the advance once its certificate is issued or void.`, `Penilaian interim ${s(d.sequence, "semasa")} masih dalam proses: mohon pendahuluan selepas perakuannya dikeluarkan atau dibatalkan.`);
    case "SCHEDULE_ON_VALUATION_IN_PROGRESS":
      return w(`The schedule names interim certificate ${s(d.sequence, "in progress")} or an earlier one, already worked out without this advance: recoupment starts after it.`, `Jadual menamakan perakuan interim ${s(d.sequence, "semasa")} atau lebih awal.`);
    case "ADVANCE_PENDING":
      return w(`An advance is applied for and not yet issued or void (${s(d.advances, "an advance")}): its recoupment schedule is still open, so no valuation is opened until it is issued or void.`, `Pendahuluan telah dipohon dan belum dikeluarkan atau dibatalkan (${s(d.advances, "pendahuluan")}): tiada penilaian dibuka sehingga ia dikeluarkan atau dibatalkan.`);
    case "ADVANCE_SCHEDULE_PASSED":
      return w(`The advance's schedule recoups on interim certificate ${s(d.rows, "some")}, at or before interim certificate ${s(d.limit, "the last")} already issued or in progress: those rows would never be recouped. Void it and apply again with a schedule after it.`, `Jadual pendahuluan memulihkan pada perakuan interim ${s(d.rows, "tertentu")} yang telah dikeluarkan atau dalam proses.`);
    case "ADJUSTMENTS_MOVED":
      return w(`The adjustments of the contract sum this certificate's new sum was read from are no longer the ones issued${Number(d.added) ? ` (${String(d.added)} issued since)` : ""}: it would certify against a sum that is no longer the revised one. Void it and raise the valuation again.`, "Pelarasan harga kontrak yang dikeluarkan telah berubah sejak perakuan ini dibangkitkan. Batalkan dan bangkitkan semula penilaian.");
    case "VARIATION_PENDING_NOT_VALUABLE":
      return w(`Variation work commenced pending approval is not valued until its variation is approved: ${String(d.variations ?? "")}. Keep it out of the main contractor's works to date.`, "Kerja perubahan yang dimulakan sementara menunggu kelulusan tidak dinilai sehingga diluluskan.");
    case "ADVANCES_MOVED":
      return w(`The advances this certificate's recoupment was worked out from are no longer the ones issued${d.added ? ` (issued since: ${String(d.added)})` : ""}${Number(d.gone) ? ` (${String(d.gone)} no longer issued)` : ""}: a scheduled recoupment would be skipped for good. Void it and raise the valuation again.`, "Pendahuluan yang dikeluarkan telah berubah sejak perakuan ini dibangkitkan. Batalkan dan bangkitkan semula penilaian.");
    case "SCHEDULE_NOT_BALANCED":
      return w(`The schedule adds up to ${money(d.total)}, not the advance's ${money(d.amount)}: it must recoup the whole advance.`, `Jadual berjumlah ${money(d.total)}, bukan ${money(d.amount)}.`);
    // ------------------------------------------------ routing
    case "ROUTE_UNRESOLVED":
      return w(`The approval matrix${d.matrix ? ` (${String(d.matrix)})` : ""} has no single rule for this certificate at its value and method${d.why ? `: ${String(d.why)}` : ""}. Record the rule on the approval matrix; nobody is assumed to approve it.`, `Matriks kelulusan tiada satu peraturan bagi perakuan ini. Rekodkan peraturan itu pada matriks kelulusan.`);
    case "ROUTE_HAS_COMMITTEE":
      return w(`The rule the matrix gives (${s(d.rule, "its rule")}) sends it to a committee, and a certificate is not tabled at a sitting yet. Route certificates to offices on the approval matrix.`, "Peraturan matriks menghantarnya kepada jawatankuasa, dan perakuan belum dibentangkan di mesyuarat.");
    case "NO_MATRIX":
      return w(`No approval matrix is in force on ${day(d.day)}: issue one under Configuration › Approval matrix.`, `Tiada matriks kelulusan berkuat kuasa pada ${day(d.day)}.`);
    case "ROUTE_FIGURE_NOT_SET":
      return w("Which figure an interim certificate is routed on (the payment recommended, or the gross this period) is not set under Configuration › Post-award: it is not routed on a guess.", "Angka laluan perakuan interim belum ditetapkan di Konfigurasi › Selepas setuju terima.");
    case "ROUTE_FIGURE_NOT_COMPUTED":
      return w("The figure the certificate is routed on is not computed on it.", "Angka laluan tidak dikira pada perakuan.");
    case "ROUTE_ALREADY_OPEN":
      return w(d.state === "APPROVED" ? "Its approval route is already approved." : "Its approval route is already waiting for a decision (Approvals).", "Laluan kelulusannya sudah dibuka.");
    case "ROUTE_NOT_REOPENABLE":
      return w("Its refused route sends it nowhere yet: choose where the refusal sends it on the route first.", "Laluan yang ditolak belum menentukan arahnya.");
    case "NOT_ROUTABLE_STATUS":
      return w("Only a draft, or one on its routing sheet, is sent for approval.", "Hanya draf, atau yang di helaian laluan, dihantar untuk kelulusan.");
    case "KIND_HAS_NO_ROUTE":
      return w("This kind of certificate opens no approval route here.", "Jenis perakuan ini tidak membuka laluan kelulusan.");
    case "SUBMITTER_REQUIRED":
      return w("Name who sends it for approval: someone on record and active (they may not decide it).", "Namakan siapa menghantarnya untuk kelulusan.");
    // ------------------------------------------------ issue (FR-PAY-014)
    case "PRE_EXECUTION_LIMIT_NOT_SET":
      return w(f.level === "warn" ? "The contract is not signed, and how many interim certificates may issue before it is signed is not set under Configuration › Post-award: as things stand, this certificate could not be issued." : "This certificate was raised when no limit on certificates before the contract is signed was set, so it cannot be issued until the contract is executed. Execute the contract, or void the certificate and raise it again once the limit is set.", "Kontrak belum ditandatangani dan had perakuan sebelum pelaksanaan tidak ditetapkan.");
    case "CONTRACT_NOT_SIGNED":
      return w(`Interim certificate ${s(d.sequence, "this")} cannot be issued before the formal contract is signed: ${Number(d.limit) === 0 ? "none may be" : `only certificates up to ${s(d.limit, "the limit")} may be`}. ${f.level === "warn" ? "It may be raised; it issues once the contract is executed." : "Execute the contract first."}`, `Perakuan interim ${s(d.sequence, "ini")} tidak boleh dikeluarkan sebelum kontrak rasmi ditandatangani.`);
    // ------------------------------------------------ bank details (BD-613-44)
    case "CREDITOR_NOT_VERIFIED": {
      const standing = creditorStandingWords({ state: "NONE", reason: d.reason === "AWAITING_CHECK" || d.reason === "NOT_IN_ORDER" ? d.reason : "NOT_ENTERED" });
      return w(`${standing.en} Have the contractor enter its bank details in its registration, and an officer check them, then issue the certificate again.`, `${standing.ms} Minta kontraktor memasukkan butiran banknya dalam pendaftarannya, dan seorang pegawai menyemaknya, kemudian keluarkan perakuan sekali lagi.`);
    }
    case "CONTRACTOR_NOT_ON_REGISTER":
      return w("The contractor is not linked to the supplier register, so there are no checked bank details to pay to. Link the award to its supplier on the award's page, then issue the certificate again.", "Kontraktor tidak dipautkan kepada daftar pembekal, jadi tiada butiran bank yang telah disemak untuk dibayar. Pautkan anugerah kepada pembekalnya pada halaman anugerah, kemudian keluarkan perakuan sekali lagi.");
    case "PRE_EXECUTION_GATE": {
      const g = GATE[String(d.item)] ?? GATE.RETURNED;
      return w(`Before the contract is signed, a certificate is issued only with ${g.en}.`, `Sebelum kontrak ditandatangani, perakuan dikeluarkan hanya dengan ${g.ms}.`);
    }
    case "COVER_NOTE_NO_RECEIPT":
      return w(`A cover note is not evidence of insurance without its premium receipt: record the receipt on ${s(d.policies, "the policy")} (the award's Securities tab).`, `Nota perlindungan bukan bukti insurans tanpa resit premium: rekodkan resit pada ${s(d.policies, "polisi")}.`);
    case "PERKESO_NOT_RECORDED":
      return w("Before the contract is signed, the certificate carries the contractor's social security (PERKESO) registration number: record it on a verified policy.", "Sebelum kontrak ditandatangani, perakuan membawa nombor pendaftaran PERKESO kontraktor.");
    case "OPENING_CLOSED":
      return w("An interim certificate raised after the opening position stands (not void): the position is not corrected now (the certificates since rest on it). A certificate voided before issue does not hold it.", "Penilaian telah dibangkitkan selepas kedudukan pembukaan: ia tidak boleh diubah lagi.");
    case "OPENING_REASON_REQUIRED":
      return w("Say why the opening position is corrected.", "Nyatakan sebab kedudukan pembukaan dibetulkan.");
    case "OPENING_NUMBER_REQUIRED":
      return w("Give the last interim certificate's number, as issued.", "Nyatakan nombor perakuan interim terakhir.");
    case "OPENING_SEQUENCE_REQUIRED":
      return w("Give which interim certificate it was on this contract (1 or more).", "Nyatakan perakuan interim keberapa (1 atau lebih).");
    case "OPENING_DOES_NOT_COVER":
      return w(`The opening position stops at interim certificate ${s(d.last, "its last")}, but interim certificate ${s(d.uncovered, "a later one")} is issued here without a valuation: the position must cover it.`, `Kedudukan pembukaan mesti meliputi perakuan interim ${s(d.uncovered, "terkemudian")}.`);
    case "OPENING_FIGURE_REQUIRED":
      return w(`Give ${(OPENING_GROUP_WORDS[d.group as OpeningGroup]?.en ?? "the figure").toLowerCase()}, not below nothing (nil is 0.00).`, `Nyatakan ${(OPENING_GROUP_WORDS[d.group as OpeningGroup]?.ms ?? "angka itu").toLowerCase()}.`);
    case "OPENING_RELEASED_ABOVE_HELD":
      return w("More retention is released than is held on a tier.", "Wang tahanan dilepaskan melebihi yang dipegang.");
    case "OPENING_ADVANCE_ROW_INVALID":
      return w(`Each advance row is a certificate number from 1 up to the last one covered (${s(d.last, "the last")}) and an amount above nothing.`, "Setiap baris pendahuluan ialah nombor perakuan dan amaun melebihi sifar.");
    case "OPENING_PROVENANCE_REQUIRED":
      return w(`Say where ${(OPENING_GROUP_WORDS[d.group as OpeningGroup]?.en ?? "the figure").toLowerCase()} came from: stated on a certificate, or assumed.`, "Nyatakan sumber angka itu.");
    case "OPENING_SOURCE_REQUIRED":
      return w(`${OPENING_GROUP_WORDS[d.group as OpeningGroup]?.en ?? "The figure"} is stated: give the reference of the certificate it is stated on.`, "Nyatakan rujukan perakuan sumbernya.");
    case "OPENING_ASSUMPTION_REASON_REQUIRED":
      return w(`${OPENING_GROUP_WORDS[d.group as OpeningGroup]?.en ?? "The figure"} is assumed: say why, and on what.`, "Nyatakan sebab angka itu diandaikan.");
    case "OPENING_NOT_RECONCILED":
      return w(`Previously certified to date (${money(d.entered)}) is not the gross to date less the retention held net (${money(d.expected)}): shown as entered.`, "Telah diperakui setakat ini tidak sepadan dengan nilai kasar tolak wang tahanan bersih.");
    case "OPENING_NOT_RECONCILED_ASSUMED":
      return w(`The opening position this certificate continues from does not reconcile (previously certified ${money(d.entered)}, where gross less retention held net is ${money(d.expected)}), and figures in it are assumed: shown as entered.`, "Kedudukan pembukaan tidak sepadan dan mengandungi angka andaian.");
    case "OPENING_ASSUMED":
      return w(`This certificate continues from an opening position in which some figures are assumed, not stated on a certificate: ${s(d.groups, "some")}.`, `Perakuan ini bersambung daripada kedudukan pembukaan dengan angka andaian: ${s(d.groups, "sebahagian")}.`);
    case "SEQUENCE_MOVED":
      return w(`This certificate's figures were worked out as interim certificate ${s(d.expected, "its number")}, but it would issue as ${s(d.allocated, "another")}: another was issued meanwhile. Void it and raise the valuation again.`, "Perakuan lain telah dikeluarkan sementara itu. Batalkan dan bangkitkan semula.");
    case "INTERIM_NOT_FROM_VALUATION":
      return w(`Interim certificate ${s(d.number, "already issued")} was not raised from a valuation here, so what it certified cannot be carried into this one as previously certified. The way out: record the contract's opening position (Payments › Valuations) covering it — the last certificate, the gross and previously certified to date, retention, advance recouped and damages charged, each stated on a certificate or assumed with a reason.`, `Perakuan interim ${s(d.number, "terdahulu")} tidak dibangkitkan daripada penilaian di sini. Rekodkan kedudukan pembukaan kontrak yang meliputinya.`);
    case "NO_BASELINE":
      return w("No baseline version is in force today: a valuation reads the contract's baseline (confirm it under Baseline).", "Tiada versi garis dasar berkuat kuasa hari ini.");
    case "VALUATION_IN_PROGRESS":
      return w("A valuation of this contract is still in progress (being valued, or its certificate neither issued nor void): one at a time.", "Penilaian kontrak ini masih dalam proses.");
    case "TRIGGER_REQUIRED":
      return w("Say what started it: the monthly valuation day, or a claim.", "Nyatakan pencetusnya.");
    case "VALUATION_DATE_REQUIRED":
      return w("Give the valuation day.", "Nyatakan hari penilaian.");
    case "NOT_AFTER_LAST":
      return w(`A valuation comes after the last one issued (${day(d.day)}).`, `Penilaian mesti selepas yang terakhir dikeluarkan (${day(d.day)}).`);
    case "CALENDAR_NOT_SET":
      return w("No valuation day is agreed for this contract: record the calendar first.", "Tiada hari penilaian dipersetujui bagi kontrak ini.");
    case "NOT_THE_VALUATION_DAY":
      return w(`That is not the agreed valuation day: this month's is ${day(d.day)}. A valuation on another day is started by a claim.`, `Itu bukan hari penilaian yang dipersetujui: bulan ini ${day(d.day)}.`);
    case "CLAIM_DATE_REQUIRED":
      return w("Give the day the claim was received: the issue period runs from it.", "Nyatakan hari tuntutan diterima.");
    case "VALUED_BEFORE_CLAIM":
      return w(`The valuation cannot come before the claim was received (${day(d.day)}).`, `Penilaian tidak boleh sebelum tuntutan diterima (${day(d.day)}).`);
    case "CALENDAR_DAY_INVALID":
      return w("Give a day of the month from 1 to 31 (in a shorter month the cycle falls on its last day).", "Nyatakan hari 1 hingga 31.");
    case "CALENDAR_AGREED_ON_REQUIRED":
      return w("Give the day it was agreed.", "Nyatakan hari ia dipersetujui.");
    case "CALENDAR_AGREED_WITH_REQUIRED":
      return w("Name who agreed it for the contractor.", "Namakan wakil kontraktor yang bersetuju.");
    case "CALENDAR_CHANGE_REASON_REQUIRED":
      return w("Changing the agreed valuation day needs its reason.", "Menukar hari penilaian memerlukan sebab.");
    case "PARTICIPANTS_REQUIRED":
      return w("Name who valued it jointly: at least the organisation's valuer and the contractor's representative.", "Namakan peserta penilaian bersama.");
    case "METHOD_REQUIRED":
      return w("Say how it was valued, as explained to the contractor.", "Nyatakan kaedah penilaian.");
    case "ANSWER_REQUIRED":
      return w("Record whether the contractor agrees.", "Rekodkan sama ada kontraktor bersetuju.");
    case "DISSENT_REQUIRED":
      return w("A dissent says what the contractor disputes.", "Bantahan menyatakan apa yang dipertikai.");
    case "JOINT_DAY_REQUIRED":
      return w("Give the day it was valued jointly.", "Nyatakan hari penilaian bersama.");
    case "JOINT_BEFORE_VALUATION":
      return w(`The joint valuation cannot come before the valuation day (${day(d.day)}).`, `Penilaian bersama tidak boleh sebelum hari penilaian.`);
    case "VALUATION_NOT_OPEN":
      return w("The valuation is no longer being valued (its certificate is raised, or it is closed): its lines are frozen.", "Penilaian tidak lagi dibuka.");
    case "JOINT_NOT_RECORDED":
      return w("Record the joint valuation (participants, method and the contractor's answer) first.", "Rekodkan penilaian bersama dahulu.");
    case "MAIN_WORKS_NOT_RECORDED":
      return w("Record the main contractor's work valued to date first.", "Rekodkan nilai kerja kontraktor utama dahulu.");
    case "LINE_AFTER_CUT_OFF":
      return w(`Submitted after the valuation day (${day(d.day)}): it goes to the next cycle (the cut-off is hard).`, `Dihantar selepas hari penilaian (${day(d.day)}): ia ke kitaran berikutnya.`);
    case "PARTY_NOT_ON_CONTRACT":
      return w("That party is not recorded on this contract (or is retired).", "Pihak itu tidak direkodkan pada kontrak ini.");
    case "PARTY_VALUE_REQUIRED":
      return w("A nominated party's line carries its value to date (it feeds the gross).", "Baris pihak dinamakan membawa nilainya setakat ini.");
    case "PARTY_VALUE_NOT_EXPECTED":
      return w("An assignee's line carries only what is due to it on this certificate.", "Baris pemegang serah hak hanya membawa amaun kena dibayar.");
    // Intake 1 (BD-613-96): Part A's FORM_NOT_SET retired; the raise's one form rule names the need and where it is set.
    case "TEMPLATE_NOT_SET":
      return templateNotSetWords(d);
    case "ROUTING_SHEET_NOT_SET": {
      const k = KIND_FORM[String(d.kind)] ?? KIND_FORM.NON_COMPLETION;
      return w(`No routing sheet is set for ${k.en} under Configuration › Post-award: its review chain (endorsed, checked, verified, recommended) is enforced on the sheet, so it is not raised without one.`, `Tiada helaian laluan ditetapkan bagi ${k.ms} di Konfigurasi › Selepas setuju terima.`);
    }
    case "NOT_BELOW_MINIMUM":
      return w("Only a valuation below its minimum is held to the next cycle.", "Hanya penilaian di bawah minimum ditangguhkan.");
    case "CLOSE_REASON_REQUIRED":
      return w("Say why.", "Nyatakan sebab.");
    // ------------------------------------------------ Finance (INT-07)
    case "NOT_ISSUED":
      return w("Finance pays an issued certificate: this one is not issued.", "Kewangan membayar perakuan yang telah dikeluarkan.");
    case "PAYMENT_ALREADY_RECORDED":
      return w("Finance's payment of this certificate is already recorded.", "Bayaran perakuan ini telah direkodkan.");
    case "BATCH_REQUIRED":
      return w("Give Finance's payment batch number.", "Nyatakan nombor kelompok bayaran.");
    case "PAID_BEFORE_ISSUE":
      return w(`It cannot be paid before it was issued (${day(d.day)}).`, `Ia tidak boleh dibayar sebelum dikeluarkan (${day(d.day)}).`);
    // ------------------------------------------------ the damages chain
    case "NON_COMPLETION_DECISION_REQUIRED":
      return w(`The valuation is past the date for completion (${day(d.day)}) and no non-completion decision is recorded: record the non-completion decision (Payments › Damages) first. A certificate is never issued silently without its damages.`, `Penilaian melepasi tarikh siap (${day(d.day)}) tanpa keputusan kerja tidak siap: rekodkan keputusan itu dahulu.`);
    case "CNC_NOT_ISSUED":
      return w("Damages apply, but the Certificate of Non-Completion is not issued yet: no damages line exists before it is, so the certificate waits for it.", "Ganti rugi dikenakan, tetapi Perakuan Kerja Tidak Siap belum dikeluarkan.");
    case "LAD_RATE_NOT_SET":
      return w("The non-completion decision in force records no rate of damages: the rate is frozen with the decision and its Certificate of Non-Completion from the baseline, never keyed. Correct the baseline, then replace the decision.", "Keputusan kerja tidak siap tidak merekodkan kadar ganti rugi: kadarnya dibekukan bersama keputusan, tidak dimasukkan.");
    case "LAD_BASELINE_REVISED":
      return w(`The baseline has been revised since the Certificate of Non-Completion${d.baselineRate ? ` (rate now ${money(d.baselineRate)} a day, the certificate's ${money(d.rate)})` : ""}${d.baselineDate ? ` (date for completion now ${day(d.baselineDate)}, the certificate's ${day(d.date)})` : ""}: the certificate's rate applies until a new decision and Certificate of Non-Completion are recorded. Nothing is re-rated silently.`, "Garis dasar telah disemak sejak Perakuan Kerja Tidak Siap: kadar perakuan itu terpakai sehingga keputusan dan perakuan baharu direkodkan.");
    case "DECISION_ALREADY_LIVE":
      return w("A non-completion decision is already in force on this contract: one at a time. To change it, replace it, saying why (the earlier is kept and linked).", "Keputusan kerja tidak siap telah berkuat kuasa: gantikannya dengan sebab.");
    case "REPLACES_NOT_LIVE":
      return w("The decision named is not the one in force: only the decision in force is replaced.", "Keputusan yang dinamakan bukan yang berkuat kuasa.");
    case "REPLACE_REASON_REQUIRED":
      return w("Say why the decision in force is replaced.", "Nyatakan sebab keputusan itu diganti.");
    case "DECISION_VALUATION_IN_PROGRESS":
      return w(`The ${s(d.valuation, "valuation in progress")} was worked out on the decision in force: issue or void its certificate (or withdraw it) before the decision is replaced.`, `${s(d.valuation, "Penilaian semasa")} dikira atas keputusan berkuat kuasa: keluarkan atau batalkan perakuannya dahulu.`);
    case "EARLIER_CNC_OPEN":
      return w("The decision in force has a Certificate of Non-Completion still open (not issued, not void): issue or void it before deciding again.", "Perakuan Kerja Tidak Siap bagi keputusan berkuat kuasa masih terbuka: keluarkan atau batalkannya dahulu.");
    case "NO_DATE_FOR_COMPLETION":
      return w("The baseline has no date for completion yet (it comes with possession of site).", "Garis dasar belum ada tarikh siap (datang dengan milik tapak).");
    case "NOT_PAST_COMPLETION":
      return w(`The date for completion (${day(d.day)}) has not passed: there is no non-completion to decide.`, `Tarikh siap (${day(d.day)}) belum berlalu.`);
    case "CLAUSE_REQUIRED":
      return w(d.which === "eot" ? "Give the extension-of-time clause, as in the contract document." : "Give the damages (non-completion) clause, as in the contract document.", "Nyatakan klausa itu, seperti dalam dokumen kontrak.");
    case "EXTENDED_COMPLETION_REQUIRED":
      return w("Give the extended date for completion (the date for completion where none is extended).", "Nyatakan tarikh siap yang dilanjutkan.");
    case "EXTENDED_BEFORE_COMPLETION":
      return w(`The extended date cannot be before the date for completion (${day(d.day)}).`, `Tarikh lanjutan tidak boleh sebelum tarikh siap (${day(d.day)}).`);
    case "WARNING_ALREADY_LIVE":
      return w("A warning letter is already raised and not void.", "Surat amaran telah dibangkitkan.");
    case "WARNING_NOT_ISSUED":
      return w("The warning letter is not issued yet: it is posted once issued.", "Surat amaran belum dikeluarkan.");
    case "POST_ALREADY_RECORDED":
      return w("Its registered post is already recorded.", "Pos berdaftarnya telah direkodkan.");
    case "CONSIGNMENT_REQUIRED":
      return w("Give the registered post's consignment reference.", "Nyatakan rujukan pos berdaftar.");
    case "POSTED_BEFORE_ISSUE":
      return w(`It cannot be posted before it was issued (${day(d.day)}).`, `Ia tidak boleh dipos sebelum dikeluarkan (${day(d.day)}).`);
    case "OUTCOME_REQUIRED":
      return w("Choose the decision: damages apply, or the delay is excusable or its entitlement pending.", "Pilih keputusan.");
    case "DECISION_REASON_REQUIRED":
      return w("Give the decision's reasons: they are shown on the certificates it governs.", "Nyatakan sebab keputusan.");
    case "WARNING_NOT_SENT":
      return w("Damages are imposed only after the warning letter is issued and sent by registered post: raise and post it first.", "Ganti rugi dikenakan hanya selepas surat amaran dikeluarkan dan dihantar melalui pos berdaftar.");
    case "SCOPE_REQUIRED":
      return w("Say whether it covers the whole of the works or a section.", "Nyatakan keseluruhan kerja atau satu bahagian.");
    case "SECTION_REQUIRED":
      return w("Choose the section of the baseline it covers.", "Pilih bahagian garis dasar.");
    case "INSURANCE_EXPIRY_REQUIRED":
      return w("The certificate is not issued without the expiry of the relevant insurance policies: give it.", "Perakuan tidak dikeluarkan tanpa tarikh tamat polisi insurans.");
    case "EXPECTED_COMPLETION_REQUIRED":
      return w("Give the expected completion date: the insurance is extended to it.", "Nyatakan tarikh jangkaan siap.");
    case "INSURANCE_NOT_EXTENDED":
      return w(`The insurance expires ${day(d.expiry)}, before the expected completion (${day(d.expected)}): the cover must be extended to it first.`, `Insurans tamat ${day(d.expiry)}, sebelum jangkaan siap (${day(d.expected)}): perlindungan mesti dilanjutkan dahulu.`);
    case "WINDOW_FROM_REQUIRED":
      return w("Give the first day damages run (assumed: the day after the date for completion).", "Nyatakan hari pertama ganti rugi dikenakan.");
    case "WINDOW_BEFORE_COMPLETION":
      return w(`Damages run only after the date for completion (${day(d.day)}).`, `Ganti rugi hanya selepas tarikh siap (${day(d.day)}).`);
    case "WINDOW_ENDS_BEFORE_START":
      return w("The day completion was achieved comes after the first day damages run.", "Hari siap mesti selepas hari pertama ganti rugi.");
    case "WINDOW_ALREADY_CLOSED":
      return w("The damages window is already closed at completion.", "Tempoh ganti rugi telah ditutup.");
    case "WINDOW_NOT_OPEN":
      return w("Only a decision that applies damages has a window to close.", "Hanya keputusan ganti rugi mempunyai tempoh untuk ditutup.");
    case "PACK_ITEM_REQUIRED":
      return w(`The submission pack's item "${(PACK_WORDS[String(d.item) as PackItem] ?? PACK_WORDS.STUDY).en}" is required: write it, or mark it not required with the reason.`, `Item pakej "${(PACK_WORDS[String(d.item) as PackItem] ?? PACK_WORDS.STUDY).ms}" diperlukan.`);
    case "PACK_NOT_REQUIRED_REASON":
      return w(`"${(PACK_WORDS[String(d.item) as PackItem] ?? PACK_WORDS.STUDY).en}" is marked not required: say why.`, "Nyatakan sebab item itu tidak diperlukan.");
    case "FUTURE_DATE":
      return w(`${day(d.day)} is after today: nothing is recorded ahead of its day.`, `${day(d.day)} selepas hari ini.`);
    case "PERSON_REQUIRED":
      return w("Name who it is recorded for: someone on record and active.", "Namakan pegawai yang direkodkan.");
    default:
      // 6.13 Part B run 1b (flagged against Part A, a code Part A never gave): the damages chain's run 1b codes are
      // lad/labels.ts's; any other still fails closed in words.
      return ladFaultWords(f) ?? w("Refused.", "Ditolak.");
  }
}

export const paymentFaultText = (f: Finding) => paymentFaultWords(f).en;
export const paymentRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(paymentFaultText).join(" ")}`.trim();
