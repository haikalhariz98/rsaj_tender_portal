/**
 * Variations' and the adjustment of the contract sum's words (6.13 Part A step 4), English and Malay. A code never
 * reaches a screen: every enum value and every refusal is worded here, naming what refuses the act and the way out of
 * it. Where a refusal stands on a setting, the words name the setting; where it stands on something frozen when a
 * decision was made, the words say what it was decided under and what can still be done. Exhaustive maps.
 */

import { formatDate } from "@/lib/format";
import { kindFaultWords } from "@/lib/certificate/kinds";
import { templateNotSetWords } from "@/lib/certificate/form-needs";
import { formatSen } from "@/lib/money";
import { supervisionFaultWords } from "@/lib/supervision/labels";

import type { Stage } from "./application";
import type { ConsentState } from "./instruction";
import type { AdjustmentDirection, AdjustmentSection, AdjustmentTrigger, Finding, RateSource, ScheduleForm, SoDecision, VariationBase, VariationEvent, VariationExemption, VariationOrigin, VariationPctBasis, VariationStatus } from "./types";

export interface Words {
  en: string;
  ms: string;
}
/// A label set inside a sentence: only its first letter lowered, so an office's or a form's own capitals stay.
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const w = (en: string, ms: string): Words => ({ en, ms });

export const STATUS_WORDS: Readonly<Record<VariationStatus, Words>> = {
  DRAFT: w("Draft", "Draf"),
  SUBMITTED: w("Submitted", "Dikemukakan"),
  SUPPORTED: w("Open", "Terbuka"),
  CLOSED: w("Closed", "Ditutup"),
};

export const STAGE_WORDS: Readonly<Record<Stage, Words>> = {
  DRAFT: w("Draft", "Draf"),
  WITH_SO: w("With the S.O. for a decision", "Dengan P.P. untuk keputusan"),
  TO_SEND: w("Supported: to be sent for approval", "Disokong: untuk dihantar bagi kelulusan"),
  AWAITING_APPROVAL: w("Awaiting approval", "Menunggu kelulusan"),
  REFUSED_AWAITING_CHOICE: w("Refused: where it goes is awaited", "Ditolak: menunggu ke mana ia pergi"),
  APPROVED: w("Approved: to be instructed", "Diluluskan: untuk diarahkan"),
  EXEMPT: w("Exempt from prior approval: to be instructed", "Dikecualikan daripada kelulusan terdahulu: untuk diarahkan"),
  INSTRUCTED: w("Instructed", "Diarahkan"),
  CERTIFIED: w("Certified", "Diperakui"),
  CLOSED: w("Closed", "Ditutup"),
};

export const STAGE_TONE: Readonly<Record<Stage, "brand" | "info" | "ok" | "warn" | "err" | "neutral">> = {
  DRAFT: "neutral",
  WITH_SO: "info",
  TO_SEND: "info",
  AWAITING_APPROVAL: "warn",
  REFUSED_AWAITING_CHOICE: "err",
  APPROVED: "ok",
  EXEMPT: "brand",
  INSTRUCTED: "brand",
  CERTIFIED: "ok",
  CLOSED: "neutral",
};

export const EVENT_WORDS: Readonly<Record<VariationEvent, Words>> = {
  PRIOR: w("Prior approval to instruct the variation", "Kelulusan terdahulu untuk mengarahkan perubahan kerja"),
  INCREASE: w("Approval to increase an approved variation", "Kelulusan menambah perubahan kerja yang diluluskan"),
  AGREED_RATE: w("Approval to use rates not in the contract", "Kelulusan menggunakan kadar yang tiada dalam kontrak"),
  REMEASUREMENT: w("Approval of a re-measurement of provisional quantities", "Kelulusan pengukuran semula kuantiti sementara"),
};

export const EXEMPTION_WORDS: Readonly<Record<VariationExemption, Words>> = {
  REDUCTION: w("A reduction of the contract sum", "Pengurangan harga kontrak"),
  PC_SUM: w("Adjustment of a prime cost sum", "Pelarasan wang kos prima"),
  PROVISIONAL_SUM: w("Adjustment of a provisional sum", "Pelarasan wang peruntukan sementara"),
  REMEASUREMENT: w("Re-measurement of provisional quantities", "Pengukuran semula kuantiti sementara"),
};

export const ORIGIN_WORDS: Readonly<Record<VariationOrigin, Words>> = {
  DEPARTMENT: w("The implementing department, reviewed by an S.O.'s Representative", "Jabatan pelaksana, disemak oleh Wakil P.P."),
  SO_REPRESENTATIVE: w("An S.O.'s Representative", "Wakil P.P."),
};

export const RATE_SOURCE_WORDS: Readonly<Record<RateSource, Words>> = {
  CONTRACT_RATE: w("The contract's rate", "Kadar kontrak"),
  AGREED_RATE: w("An agreed rate", "Kadar harga yang dipersetujui"),
};

export const DIRECTION_WORDS: Readonly<Record<AdjustmentDirection, Words>> = {
  ADDITION: w("Addition", "Penambahan"),
  OMISSION: w("Omission", "Pengurangan"),
};

export const SECTION_WORDS: Readonly<Record<AdjustmentSection, Words>> = {
  VARIATION: w("1.1 Variations", "1.1 Perubahan kerja"),
  OTHER: w("1.2 Other adjustments", "1.2 Pelarasan lain"),
};

export const TRIGGER_WORDS: Readonly<Record<AdjustmentTrigger, Words>> = {
  VARIATION: w("Variation of works", "Perubahan kerja"),
  LOSS_AND_EXPENSE: w("A contractor's claim for loss and expense", "Tuntutan kontraktor bagi kerugian dan perbelanjaan"),
  REMEASUREMENT: w("Re-measurement of provisional quantities", "Pengukuran semula kuantiti sementara"),
  PC_AND_PROVISIONAL_SUMS: w("Prime cost and provisional sums", "Wang kos prima dan wang peruntukan sementara"),
  PRICE_FLUCTUATION: w("Price fluctuation, with an extension of the contract period", "Turun naik harga, dengan lanjutan tempoh kontrak"),
};

export const SCHEDULE_FORM_WORDS: Readonly<Record<ScheduleForm, Words>> = {
  AGREED_PRICE: w("The agreed-price schedule", "Jadual harga yang dipersetujui"),
  MEASURED: w("The measured schedule", "Jadual kuantiti diukur"),
  BOTH: w("The agreed-price and measured schedules", "Jadual harga yang dipersetujui dan kuantiti diukur"),
};

export const BASIS_WORDS: Readonly<Record<VariationPctBasis, Words>> = {
  THIS_VARIATION: w("This variation alone", "Perubahan kerja ini sahaja"),
  CUMULATIVE: w("Every approved variation to date, with this one", "Semua perubahan kerja diluluskan setakat ini, termasuk ini"),
};

export const BASE_WORDS: Readonly<Record<VariationBase, Words>> = {
  ORIGINAL: w("The original contract sum", "Harga kontrak asal"),
  REVISED: w("The revised contract sum (with the issued adjustments)", "Harga kontrak disemak (dengan pelarasan yang dikeluarkan)"),
};

export const SO_DECISION_WORDS: Readonly<Record<SoDecision, Words>> = {
  SUPPORTED: w("Supported", "Disokong"),
  NOT_SUPPORTED: w("Not supported", "Tidak disokong"),
};

export const CONSENT_WORDS: Readonly<Record<ConsentState, Words>> = {
  NONE: w("not yet tabled", "belum dibentangkan"),
  PENDING: w("tabled and not yet decided", "dibentangkan dan belum diputuskan"),
  CARRIED: w("given", "diberi"),
  NOT_CARRIED: w("not given", "tidak diberi"),
};

const FIELD: Readonly<Record<string, Words>> = {
  description: w("the description", "keterangan"),
  reason: w("the reason it is done as a variation", "sebab ia dibuat sebagai perubahan kerja"),
  estimate: w("the estimated amount", "anggaran amaun"),
  periodImplication: w("whether it implies a change to the contract period", "sama ada ia melibatkan tempoh kontrak"),
  agreedRateExists: w("whether a negotiated agreed rate already exists", "sama ada kadar harga yang dipersetujui telah wujud"),
  funderConsentRequired: w("whether it affects a funder's assets (and needs the funder's consent)", "sama ada ia melibatkan aset penyandang dana"),
  instructionDescription: w("the instruction's description", "keterangan arahan"),
  confirmationMatches: w("whether the contractor's confirmation matches the instruction intended", "sama ada pengesahan kontraktor sepadan"),
  objectionNote: w("the objection", "bantahan"),
  itemRef: w("the item's reference", "rujukan butiran"),
  rateSource: w("where the rate comes from", "sumber kadar"),
  coveredUp: w("whether the work will be covered up", "sama ada kerja akan ditutup"),
  removedReason: w("why it is removed", "sebab dikeluarkan"),
  agreedWith: w("who it was agreed with for the contractor", "dengan siapa ia dipersetujui"),
  valuationClauseId: w("the valuation clause", "klausa penilaian"),
  line: w("each line's reference and description", "rujukan dan keterangan setiap baris"),
};

const money = (v: unknown) => (typeof v === "string" && /^-?\d+$/.test(v) ? formatSen(BigInt(v)) : typeof v === "string" ? v : "the amount");
const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
const field = (v: unknown) => FIELD[String(v)] ?? w("a required answer", "jawapan yang diperlukan");
const eventOf = (v: unknown) => EVENT_WORDS[v as VariationEvent] ?? w("an approval", "kelulusan");
const stat = (v: unknown) => STATUS_WORDS[v as VariationStatus] ?? w("where it stands", "kedudukannya");

export function variationFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ the percentage and the route (OD-A2, OD-A3)
    case "VARIATION_BASIS_NOT_SET":
      return w("What a variation's percentage is of is not set (this variation alone, or every approved variation with it): set it under Configuration › Post-award controls, Variations. Nothing is assumed.", "Asas peratus perubahan kerja belum ditetapkan: tetapkan di Konfigurasi › Kawalan selepas setuju terima, Perubahan kerja.");
    case "VARIATION_BASE_NOT_SET":
      return w("The sum a variation's percentage is taken over is not set (the original or the revised contract sum): set it under Configuration › Post-award controls, Variations. Nothing is assumed.", "Harga asas peratus perubahan kerja belum ditetapkan: tetapkan di Konfigurasi › Kawalan selepas setuju terima, Perubahan kerja.");
    case "VARIATION_VALUE_NOT_POSITIVE":
      return w(`The value to approve must be above nothing (it is ${money(d.value)}).`, "Nilai yang hendak diluluskan mesti melebihi sifar.");
    case "VARIATION_BASE_NOT_POSITIVE":
      return w(`The contract sum the percentage is taken over is ${money(d.base)}: no percentage can be read over it.`, "Harga kontrak asas peratus tidak melebihi sifar.");
    case "VARIATION_ROUTE_UNRESOLVED":
      return w(`No single rule on the approval matrix in force (${d.matrix ?? "the matrix"}) routes this approval${d.why ? `: ${d.why}` : ""}. The matrix's rows for it are the organisation's to add or correct under Configuration › Approval matrix.`, `Tiada peraturan tunggal pada matriks kelulusan yang berkuat kuasa bagi kelulusan ini. Baris matriks ditambah atau dibetulkan di Konfigurasi › Matriks kelulusan.`);
    case "NO_MATRIX":
      return w(`No approval matrix is in force on ${day(d.day)}: issue one under Configuration › Approval matrix.`, "Tiada matriks kelulusan berkuat kuasa: keluarkan satu di Konfigurasi › Matriks kelulusan.");
    // ------------------------------------------------ the application
    case "FIELD_REQUIRED":
      return w(`Say ${field(d.field).en}.`, `Nyatakan ${field(d.field).ms}.`);
    case "ESTIMATE_ZERO":
      return w("The estimated amount cannot be nothing: an addition is above nothing, a reduction below it.", "Anggaran amaun tidak boleh sifar.");
    case "REDUCTION_NOT_OMISSION":
      return w("A reduction of the contract sum is an omission: its estimate is below nothing (write it with a minus).", "Pengurangan harga kontrak ialah pengurangan: anggarannya di bawah sifar.");
    case "OMISSION_IS_REDUCTION":
      return w("An omission (an estimate below nothing) is a reduction of the contract sum: record it as exempt for that reason. Any other variation is an addition, above nothing.", "Pengurangan (anggaran di bawah sifar) ialah pengurangan harga kontrak: rekodkannya sebagai dikecualikan atas sebab itu.");
    case "REVIEW_NOT_RECORDED":
      return w("A variation the implementing department originates is reviewed by an S.O.'s Representative before it is submitted: record the review first.", "Perubahan kerja daripada jabatan pelaksana disemak oleh Wakil P.P. sebelum dikemukakan: rekodkan semakan dahulu.");
    case "REVIEWER_NOT_REPRESENTATIVE":
      return w("Whoever is recorded as reviewing it is not the S.O. nor a representative whose delegation in force covers variation applications.", "Penyemak bukan P.P. atau wakil yang perwakilannya meliputi permohonan perubahan kerja.");
    case "ORIGINATOR_NOT_REPRESENTATIVE":
      return w("On this path the originator is the S.O. or a representative whose delegation in force covers variation applications: they are not.", "Pemula bukan P.P. atau wakil yang perwakilannya meliputi permohonan perubahan kerja.");
    case "ALLOCATION_NOT_CONFIRMED":
      return w("A Specialist representative confirms that the allocation for it is available before it is submitted: record the confirmation.", "Wakil Pakar mengesahkan peruntukan tersedia sebelum dikemukakan: rekodkan pengesahan.");
    case "PRINCIPAL_NOT_RECORDED":
      return w("A Specialist representative's application passes through a Principal Representative: record who it passed through.", "Permohonan Wakil Pakar melalui Wakil Utama: rekodkan melalui siapa.");
    case "NOT_DRAFT":
      return w(`Only a draft is submitted (this variation is ${stat(d.status).en.toLowerCase()}).`, "Hanya draf dikemukakan.");
    case "NOT_WITH_SO":
      return w("The S.O. decides only an application submitted to them and not exempt.", "P.P. hanya memutuskan permohonan yang dikemukakan dan tidak dikecualikan.");
    case "DECISION_REQUIRED":
      return w("Say whether the S.O. supports it.", "Nyatakan sama ada P.P. menyokongnya.");
    case "NOT_SUPPORTED_REASON":
      return w("Say why the S.O. does not support it.", "Nyatakan sebab P.P. tidak menyokongnya.");
    case "CAP_ONLY_ON_SUPPORT":
      return w("A cap is given only with support.", "Had diberi hanya dengan sokongan.");
    case "CAP_OUT_OF_RANGE":
      return w(`A cap is above nothing and no more than the estimate (${money(d.estimate)}).`, "Had melebihi sifar dan tidak melebihi anggaran.");
    case "FUTURE_DATE":
      return w(`${day(d.day)} is after today.`, "Tarikh itu selepas hari ini.");
    case "BEFORE_SUBMITTED":
      return w(`The decision cannot be before it was submitted (${day(d.day)}).`, "Keputusan tidak boleh sebelum dikemukakan.");
    // ------------------------------------------------ sending, commencement, closing
    case "NOT_SUPPORTED_YET":
      return w("Not yet: the S.O. has not supported it (or it is not open).", "Belum: P.P. belum menyokongnya.");
    case "ROUTE_PENDING":
      return w(`Its route for ${eventOf(d.event).en.toLowerCase()} is still waiting for a decision (Approvals): one at a time.`, "Laluannya masih menunggu keputusan: satu pada satu masa.");
    case "AWAITING_CHOICE":
      return w(`Its route for ${eventOf(d.event).en.toLowerCase()} was refused and waits for the officer to say where it goes, on its Approval section.`, "Laluannya ditolak dan menunggu pegawai menyatakan ke mana ia pergi.");
    case "ALREADY_CERTIFIED":
      return w("Its Variation Order Certificate is issued: it is certified.", "Perakuan Perubahan Kerjanya telah dikeluarkan.");
    case "EXEMPT_NO_PRIOR":
      return w("It is exempt from prior approval, so it has no prior approval or increase to send: it goes straight to the S.O.'s instruction.", "Ia dikecualikan daripada kelulusan terdahulu: terus kepada arahan P.P.");
    case "PRIOR_ALREADY_APPROVED":
      return w("Its prior approval is obtained already.", "Kelulusan terdahulunya telah diperoleh.");
    case "PRIOR_NOT_APPROVED":
      return w("Its prior approval is not obtained yet.", "Kelulusan terdahulunya belum diperoleh.");
    case "ORDER_NOT_RAISED":
      return w("Raise its Variation Order Certificate from the measurement first: the value sent is the certificate's.", "Bangkitkan Perakuan Perubahan Kerjanya dahulu.");
    case "NO_INCREASE":
      return w(`The certificate's net (${money(d.net)}) is within what is approved (${money(d.approved)}): no increase is needed.`, "Nilai bersih perakuan dalam had yang diluluskan: tiada tambahan diperlukan.");
    case "VALUE_REQUIRED":
      return w("Give the amount the agreed rates will value.", "Nyatakan amaun yang dinilai pada kadar dipersetujui.");
    case "NOT_REMEASUREMENT":
      return w("Only a re-measurement of provisional quantities is routed as one.", "Hanya pengukuran semula dihalakan sebagai satu.");
    case "NOTHING_TO_ROUTE":
      return w("The re-measurement's net is nothing: there is nothing to approve.", "Bersih pengukuran semula ialah sifar.");
    case "REMEASUREMENT_ALREADY_APPROVED":
      return w("This re-measurement is approved already at the certificate's value.", "Pengukuran semula ini telah diluluskan.");
    case "CUMULATIVE_ROUTE_PENDING":
      return w(`The percentage is read over every approved variation, and ${d.other ?? "another variation"} has a value approval waiting: decide it first, so this one is read with it.`, "Peratus dibaca atas semua perubahan kerja diluluskan, dan kelulusan nilai lain masih menunggu: putuskannya dahulu.");
    case "ADJUSTMENT_IN_PROGRESS":
      return w(`${d.adjustment ?? "An adjustment of the contract sum"} is in progress and would move the sum this is read over: issue or void it first.`, "Pelarasan harga kontrak sedang berjalan: keluarkan atau batalkannya dahulu.");
    case "ALREADY_COMMENCED":
      return w(`Commencement pending approval is recorded already (${day(d.day)}).`, "Permulaan sementara menunggu kelulusan telah direkodkan.");
    case "SUPPORT_NOT_SO":
      return w("Work commences pending approval only on the support of the S.O. or an S.O.'s Representative in force: the person named is neither.", "Kerja dimulakan hanya atas sokongan P.P. atau Wakil P.P.");
    case "BEFORE_SUPPORTED":
      return w(`It cannot commence before the S.O. supported it (${day(d.day)}).`, "Tidak boleh dimulakan sebelum disokong.");
    case "ALREADY_CLOSED":
      return w("It is closed already.", "Ia telah ditutup.");
    case "CLOSE_ROUTE_PENDING":
      return w("A route of it waits for a decision: it is decided first.", "Laluannya menunggu keputusan.");
    case "CLOSE_APPROVED":
      return w("It is approved: an approved variation is undone only by another variation, an omission.", "Ia telah diluluskan: hanya dibatalkan oleh perubahan kerja lain (pengurangan).");
    case "CLOSE_INSTRUCTED":
      return w("Its instruction is raised: void it first if it is not issued; an issued instruction stands.", "Arahannya telah dibangkitkan.");
    case "CLOSE_REASON_REQUIRED":
      return w("Say why it is closed.", "Nyatakan sebab ia ditutup.");
    // ------------------------------------------------ the instruction
    case "INSTRUCTION_EXISTS":
      return w("An instruction is raised already (void it first to raise another).", "Arahan telah dibangkitkan.");
    case "NOT_APPROVED":
      return w("It is not approved: the instruction is never issued before the variation's prior approval.", "Ia belum diluluskan: arahan tidak dikeluarkan sebelum kelulusan terdahulu.");
    case "FUNDER_CONSENT_MISSING":
      return w(`It affects a funder's assets, and the funder's consent is ${CONSENT_WORDS[d.state as ConsentState]?.en ?? "not given"}: table it before the configured committee from this variation, and record its decision there.`, `Ia melibatkan aset penyandang dana, dan persetujuan penyandang dana ${CONSENT_WORDS[d.state as ConsentState]?.ms ?? "tidak diberi"}.`);
    case "SCHEDULE_FORM_NOT_SET":
      return w(`Which schedule form a variation produces where ${d.agreedRate === "yes" ? "an agreed rate exists" : "no agreed rate exists"} is not set: set it under Configuration › Post-award controls, Variations.`, "Borang jadual perubahan kerja belum ditetapkan: tetapkan di Konfigurasi.");
    case "NOT_ORAL":
      return w("The instruction was not first given orally: there is no oral loop to record.", "Arahan tidak diberi secara lisan.");
    case "CONFIRMED_BEFORE_ORAL":
      return w(`The contractor's confirmation cannot be before the oral instruction (${day(d.day)}).`, "Pengesahan kontraktor tidak boleh sebelum arahan lisan.");
    case "OBJECTION_BEFORE_CONFIRMATION":
      return w("An objection follows the contractor's written confirmation: record the confirmation first, and the objection on or after it.", "Bantahan selepas pengesahan bertulis kontraktor.");
    case "OBJECTION_ONLY_ON_MISMATCH":
      return w("An objection is recorded only where the confirmation does not match the instruction intended.", "Bantahan hanya jika pengesahan tidak sepadan.");
    // ------------------------------------------------ measurement and daywork
    case "INSTRUCTION_NOT_ISSUED":
      return w("The S.O.'s instruction is not issued: measurement and daywork follow it.", "Arahan P.P. belum dikeluarkan.");
    case "ORDER_RAISED":
      return w("A Variation Order Certificate is raised from these measurements: they are frozen with it (void it first to change them).", "Perakuan Perubahan Kerja telah dibangkitkan daripada ukuran ini.");
    case "HEADING_NOT_INSTRUCTION":
      return w(`Every item is measured under the instruction's own description, word for word: “${d.heading ?? ""}”.`, "Setiap butiran diukur di bawah keterangan arahan, perkataan demi perkataan.");
    case "ITEM_ALREADY_MEASURED":
      return w(`Item ${d.item ?? ""} is measured already under this instruction: items are never merged; measure a new item under its own reference.`, "Butiran ini telah diukur: butiran tidak digabungkan.");
    case "CONTRACT_ITEM_REQUIRED":
      return w("A contract rate cites the item of the bill or schedule of rates it comes from.", "Kadar kontrak menyebut butiran asalnya.");
    case "AGREED_RATE_NOT_APPROVED":
      return w("A rate not in the contract is used only once its own approval route is approved: send the variation for approval to use agreed rates first.", "Kadar yang tiada dalam kontrak hanya digunakan selepas kelulusannya.");
    case "ADJUSTMENT_CONTRACT_RATE_ONLY":
      return w("The contract's percentage adjustment applies to a contract rate only.", "Pelarasan peratus hanya bagi kadar kontrak.");
    case "QUANTITY_NOT_POSITIVE":
      return w("The quantity is above nothing, to at most three places.", "Kuantiti melebihi sifar.");
    case "RATE_REQUIRED":
      return w("Give the rate, in ringgit and sen.", "Nyatakan kadar.");
    case "ADJUSTMENT_OUT_OF_RANGE":
      return w("The percentage adjustment cannot take the rate to nothing or below.", "Pelarasan peratus tidak boleh menjadikan kadar sifar.");
    case "RECORDS_REQUIRED":
      return w("Work that will be covered up is measured during execution with detailed records: describe the records.", "Kerja yang akan ditutup diukur dengan rekod terperinci.");
    case "ALREADY_REMOVED":
      return w("That item is removed already.", "Butiran itu telah dikeluarkan.");
    case "BEFORE_WORKED":
      return w(`That day is before the day worked (${day(d.day)}).`, "Tarikh itu sebelum hari kerja.");
    // ------------------------------------------------ the order (VO-663)
    case "ORDER_EXISTS":
      return w("A Variation Order Certificate is raised already (void it first to raise another).", "Perakuan Perubahan Kerja telah dibangkitkan.");
    case "NO_MEASUREMENT":
      return w("Nothing is measured under the instruction yet.", "Tiada ukuran lagi.");
    case "DESCRIPTION_NOT_INSTRUCTION":
      return w(`The certificate's description is the instruction's, word for word: “${d.instruction ?? ""}”.`, "Keterangan perakuan sama dengan arahan, perkataan demi perkataan.");
    case "AGREED_RATE_BEYOND_APPROVAL":
      return w(`The items at agreed rates come to ${money(d.measured)}, beyond what their approval covers (${money(d.approved)}): send for approval to use agreed rates for the difference.`, "Butiran pada kadar dipersetujui melebihi kelulusannya.");
    case "REMEASUREMENT_NOT_APPROVED":
      return w(`The re-measurement is not approved at the certificate's value (${money(d.value)}): send it for approval.`, "Pengukuran semula belum diluluskan pada nilai perakuan.");
    case "INCREASE_NOT_APPROVED":
      return w(`The certificate's net (${money(d.net)}) is beyond what is approved (${money(d.approved)}): send the variation for approval of the increase.`, "Nilai bersih perakuan melebihi yang diluluskan: hantar untuk kelulusan tambahan.");
    // ------------------------------------------------ the adjustment of the contract sum
    case "TRIGGERS_NOT_SET":
      return w("The contract's type does not say what its contract sum may be adjusted by: set its adjustment triggers under Configuration › Reference data, Contract types.", "Jenis kontrak tidak menyatakan pencetus pelarasan: tetapkan di Konfigurasi › Data rujukan, Jenis kontrak.");
    case "NO_LINES":
      return w("Add at least one line: an issued Variation Order Certificate, or another adjustment with its basis.", "Tambah sekurang-kurangnya satu baris.");
    case "TRIGGER_NOT_ALLOWED":
      return w(`The contract's type does not provide for an adjustment by ${(TRIGGER_WORDS[d.trigger as AdjustmentTrigger] ?? w("that trigger", "")).en.toLowerCase()}.`, "Jenis kontrak tidak memperuntukkan pelarasan sebegini.");
    case "AMOUNT_NOT_POSITIVE":
      return w(`Line ${d.reference ?? ""}: the amount is above nothing (its direction says which way it moves the sum).`, "Amaun melebihi sifar.");
    case "SECTION_TRIGGER":
      return w(`Line ${d.reference ?? ""}: section 1.1 holds the variations' certificates, section 1.2 the other triggers.`, "Bahagian 1.1 untuk perubahan kerja, 1.2 untuk pencetus lain.");
    case "ORDER_NOT_ISSUED":
      return w(`Line ${d.reference ?? ""}: only an issued Variation Order Certificate adjusts the contract sum.`, "Hanya Perakuan Perubahan Kerja yang dikeluarkan.");
    case "ORDER_ALREADY_ADJUSTED":
      return w(`Line ${d.reference ?? ""}: that variation's certificate is on another adjustment certificate already (not void): it moves the sum once.`, "Perakuan itu telah ada pada pelarasan lain.");
    case "BASIS_REQUIRED":
      return w(`Line ${d.reference ?? ""}: give the basis of its calculation.`, "Nyatakan asas pengiraan.");
    case "REVISED_NOT_POSITIVE":
      return w(`The revised contract sum would be ${money(d.revised)}.`, "Harga kontrak disemak tidak melebihi sifar.");
    case "PRIOR_ADJUSTMENTS_MOVED":
      return w("Another adjustment of the contract sum was issued after this one was raised, so its earlier adjustments and revised sum no longer stand: void it and raise it again.", "Pelarasan lain telah dikeluarkan selepas ini dibangkitkan: batalkan dan bangkitkan semula.");
    case "VARIATION_ROUTE_ON_BASE":
      return w(`${d.variation ?? "A variation"} has a route waiting whose percentage was read over the revised contract sum: decide it before this adjustment moves that sum.`, "Laluan perubahan kerja yang dibaca atas harga disemak masih menunggu: putuskannya dahulu.");
    case "MONEY_NEEDS_APPROVED_ROUTE":
      return kindFaultWords(f);
    case "SO_UNRESOLVED":
      return supervisionFaultWords(f);
    // Intake 1 (BD-613-96): Part A's FORM_NOT_SET retired; the raise's one form rule names the need and where it is set.
    case "TEMPLATE_NOT_SET":
      return templateNotSetWords(d);
    case "NO_BASELINE":
      return w("No baseline version of the contract is in force today: confirm the baseline on the contract's Baseline tab first.", "Tiada versi garis dasar kontrak berkuat kuasa hari ini.");
    case "NOT_EXECUTED":
      return w("The contract is not executed: a variation is recorded on an executed contract.", "Kontrak belum dilaksanakan.");
    // ------------------------------------------------ tabling and citing
    case "NOT_COMMITTEE_STEP":
      return w("That is not a committee's step on the variation's open route.", "Itu bukan langkah jawatankuasa pada laluan terbuka.");
    case "FUNDER_COMMITTEE_NOT_SET":
      return w("Which committee decides a funder's consent is not set: set it under Configuration › Post-award controls, Variations.", "Jawatankuasa persetujuan penyandang dana belum ditetapkan.");
    case "CONSENT_NOT_REQUIRED":
      return w("It does not affect a funder's assets: no consent is tabled.", "Ia tidak melibatkan aset penyandang dana.");
    case "CONSENT_ALREADY":
      return w("The funder's consent is tabled already and not refused: it is decided at that sitting.", "Persetujuan telah dibentangkan.");
    case "OTHER_COMMITTEE":
      return w("That sitting is of another committee than the one the step (or the consent) needs.", "Persidangan itu bagi jawatankuasa lain.");
    case "SITTING_FROZEN":
      return w("That sitting no longer takes matters (it is minuted or cancelled).", "Persidangan itu tidak lagi menerima perkara.");
    case "ALREADY_TABLED":
      return w("This step's matter is tabled already and waits for the committee: cite its decision once it is decided.", "Perkara langkah ini telah dibentangkan dan menunggu jawatankuasa.");
    case "NOT_TABLED_YET":
      return w("Nothing is tabled from this variation for this step's committee yet: table it first.", "Belum ada perkara dibentangkan bagi langkah ini.");
    case "NOT_DECIDED_YET":
      return w("The committee has not decided the matter tabled for this step yet: cite it once it is decided.", "Jawatankuasa belum memutuskan perkara ini.");
    default:
      return w("It cannot be done as things stand.", "Ia tidak boleh dilakukan.");
  }
}

export const variationFaultText = (f: Finding) => variationFaultWords(f).en;
export const variationRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(variationFaultText).join(" ")}`.trim();
