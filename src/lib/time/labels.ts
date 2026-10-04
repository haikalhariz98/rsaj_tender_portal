/**
 * Time's words (6.13 Part B run 1b), English and Malay, as the design note gives them (6.13B-run1b-design.md §6). A code
 * never reaches a screen: every refusal is worded here, naming what refuses and the way out. A contract matter's own
 * codes are matter/labels.ts's, read through. Pure.
 */

import { formatDate } from "@/lib/format";
import { matterFaultWords, MATTER_FAULT_WORDS } from "@/lib/matter/labels";

import type { EotPackItem, Finding } from "./types";
import type { PeriodPrecondition } from "./period";

export interface Words {
  en: string;
  ms: string;
}
const w = (en: string, ms: string): Words => ({ en, ms });
type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const day = (v: unknown) => (v ? formatDate(String(v)) : "that day");

export const PACK_ITEM_WORDS: Readonly<Record<EotPackItem, Words>> = {
  CALCULATION: w("How the proposed period was calculated (bar charts or other methods attached)", "Cara tempoh yang dicadangkan dikira (carta bar atau kaedah lain dilampirkan)"),
  EMPLOYER_DELAY: w("Where the employer is responsible: whether the cause is resolved, and if not, what is being done", "Jika majikan bertanggungjawab: sama ada punca telah diselesaikan, dan jika tidak, apa yang sedang dilakukan"),
  LOSS_EXPENSE: w("Whether the contractor has claimed, or will claim, loss and expense, and the estimate", "Sama ada kontraktor telah atau akan menuntut kerugian dan perbelanjaan, dan anggarannya"),
  PROGRESS: w("The progress achieved and the balance of work", "Kemajuan yang dicapai dan baki kerja"),
  COMPLETION: w("Whether it can complete by the proposed date, and if not, when", "Sama ada ia dapat siap pada tarikh yang dicadangkan, dan jika tidak, bila"),
};

export const PRECONDITION_WORDS: Readonly<Record<PeriodPrecondition, Words>> = {
  priorAgreement: w("The contractor's prior agreement", "Persetujuan awal kontraktor"),
  termsRetained: w("The existing terms and conditions retained", "Terma dan syarat sedia ada dikekalkan"),
  ratesRetained: w("The existing rates retained", "Kadar harga sedia ada dikekalkan"),
  performanceSatisfactory: w("The contractor's satisfactory performance", "Prestasi kontraktor yang memuaskan"),
  spanConfirmed: w("The SPAN Act's compliance", "Pematuhan Akta SPAN"),
};

const packWords = (d: Data): Words => PACK_ITEM_WORDS[String(d.item) as EotPackItem] ?? w("A pack item", "Item pakej");
const precondition = (d: Data): Words => PRECONDITION_WORDS[String(d.precondition) as PeriodPrecondition] ?? w("A precondition", "Satu prasyarat");

export const TIME_FAULT_WORDS: Readonly<Record<string, (d: Data) => Words>> = {
  // 6.1 the delay notice
  NOTICE_CAUSE_REQUIRED: () => w("Say what caused the delay, as the notice gives it.", "Nyatakan punca kelewatan, seperti yang diberi dalam notis."),
  RECEIVED_BEFORE_OCCURRED: () => w("The notice cannot have been received before the delay occurred.", "Notis tidak mungkin diterima sebelum kelewatan berlaku."),
  FUTURE_DATE: (d) => w(`${day(d.day)} is after today.`, `${day(d.day)} adalah selepas hari ini.`),
  // 6.2 opening a claim
  NOTICE_REQUIRED: () => w("Name the delay notice (or the S.O.'s direction) the claim rests on.", "Namakan notis kelewatan (atau arahan P.P.) yang menjadi asas tuntutan."),
  NOTICE_NOT_ON_CONTRACT: () => w("That notice is not on this contract.", "Notis itu bukan bagi kontrak ini."),
  SECTION_REQUIRED: () => w("Choose the section of the baseline the claim is for.", "Pilih seksyen garis dasar bagi tuntutan ini."),
  GROUND_CLAUSE_REQUIRED: () => w("Give the clause of the conditions of contract the ground falls under.", "Nyatakan klausa syarat kontrak bagi alasan itu."),
  CAUSE_REQUIRED: () => w("Say what caused the delay.", "Nyatakan punca kelewatan."),
  PROGRAMME_NOT_APPROVED: () => w("The delay is assessed against an approved programme revision, and the one named is not approved.", "Kelewatan dinilai berdasarkan semakan program yang diluluskan, dan yang dinamakan belum diluluskan."),
  PROPOSED_DAYS_REQUIRED: () => w("Give the days the contractor proposes, as a whole number not below nothing.", "Nyatakan hari yang dicadangkan oleh kontraktor, sebagai nombor bulat tidak kurang daripada sifar."),
  EOT_INSTRUMENT_NOT_SET: (d) => w(`The contract type (${s(d.type, "of this contract")}) does not say which time instrument it offers. Set it under Configuration › Reference data › Contract types.`, `Jenis kontrak (${s(d.type, "kontrak ini")}) tidak menyatakan instrumen masa yang ditawarkan. Tetapkan di Konfigurasi › Data rujukan › Jenis kontrak.`),
  EOT_NOT_OFFERED: (d) => w(`A contract of this type (${s(d.type, "its type")}) is extended by an extension of the contract period, not an extension of time.`, `Kontrak jenis ini (${s(d.type, "jenisnya")}) dilanjutkan melalui lanjutan tempoh kontrak, bukan lanjutan masa.`),
  PERIOD_NOT_OFFERED: (d) => w(`A contract of this type (${s(d.type, "its type")}) is extended by an extension of time, not of its contract period.`, `Kontrak jenis ini (${s(d.type, "jenisnya")}) dilanjutkan melalui lanjutan masa, bukan tempoh kontraknya.`),
  // 6.3 answering, reasons
  CLAIM_CLOSED: (d) => w(`The claim is closed (${s(d.reason, "its reason recorded")}): nothing more is recorded on it.`, `Tuntutan telah ditutup (${s(d.reason, "sebabnya direkodkan")}): tiada lagi yang direkodkan padanya.`),
  CLAIM_DETERMINED: () => w("The claim is determined: its answers and reasons stand as they were determined.", "Tuntutan telah diputuskan: jawapan dan sebabnya kekal seperti yang diputuskan."),
  ESTIMATED_COMPLETION_REQUIRED: () => w("The contractor cannot complete by the proposed date: give the estimated completion date.", "Kontraktor tidak dapat siap pada tarikh yang dicadangkan: nyatakan anggaran tarikh siap."),
  DAYS_BELOW_NOTHING: () => w("A count of days is a whole number, never below nothing.", "Bilangan hari ialah nombor bulat, tidak kurang daripada sifar."),
  UNTIL_NOT_AFTER_FROM: () => w("The delay must end after it begins (the end day is the first day not delayed).", "Kelewatan mesti tamat selepas ia bermula (hari tamat ialah hari pertama tidak lewat)."),
  GROUP_REQUIRED: () => w("A concurrent reason names the group of reasons it runs with.", "Sebab serentak menamakan kumpulan sebab yang berjalan bersamanya."),
  REASON_FIELDS_REQUIRED: () => w("Give the reason's clause and its words.", "Nyatakan klausa sebab itu dan perkataannya."),
  // 6.4 the determination
  ENTITLEMENT_REQUIRED: () => w("Say whether the contractor is entitled to an extension.", "Nyatakan sama ada kontraktor layak mendapat lanjutan."),
  ENTITLEMENT_REASON_REQUIRED: () => w("Say why the cause does or does not entitle the contractor to an extension.", "Nyatakan mengapa punca itu melayakkan atau tidak melayakkan kontraktor mendapat lanjutan."),
  EXCLUDED_BY_CONDITION: (d) => w(`The delay is put down to ${s(d.condition, "a condition of the award")}, a condition of the award that excludes an extension of time and is not met: not a ground, unless you record why it is overridden.`, `Kelewatan dikaitkan dengan ${s(d.condition, "syarat award")}, syarat award yang mengecualikan lanjutan masa dan belum dipenuhi: bukan alasan, melainkan anda merekodkan sebab ia diatasi.`),
  WEATHER_EVIDENCE_REQUIRED: () => w("A weather claim needs the meteorological record attached to it.", "Tuntutan cuaca memerlukan rekod meteorologi dilampirkan."),
  WEATHER_NOT_EXCEPTIONAL: () => w("Weather that is not exceptional (monsoon season, heavy rain normal for the area) is not a ground: it was allowed for in the tender.", "Cuaca yang tidak luar biasa (musim tengkujuh, hujan lebat biasa di kawasan itu) bukan alasan: ia telah diambil kira dalam tender."),
  WEATHER_EXCEPTIONAL_REQUIRED: () => w("A weather claim says whether the weather was exceptional against the meteorological records.", "Tuntutan cuaca menyatakan sama ada cuaca itu luar biasa berbanding rekod meteorologi."),
  PACK_ITEM_REQUIRED: (d) => w(`${packWords(d).en}: answer it, or mark it not required with the reason.`, `${packWords(d).ms}: jawab, atau tandakan tidak diperlukan dengan sebabnya.`),
  PACK_NOT_REQUIRED_REASON: (d) => w(`${packWords(d).en} is marked not required: say why.`, `${packWords(d).ms} ditandakan tidak diperlukan: nyatakan sebabnya.`),
  ACTUAL_DELAY_REQUIRED: () => w("Give the actual delay, in days, against the approved programme.", "Nyatakan kelewatan sebenar, dalam hari, berbanding program yang diluluskan."),
  REASONS_REQUIRED: () => w("An entitled claim has at least one reason, with its clause and its extension.", "Tuntutan yang layak mempunyai sekurang-kurangnya satu sebab, dengan klausa dan lanjutannya."),
  BEST_ENDEAVOURS_NONE: () => w("The contractor did not use best endeavours: no extension is granted. Determine it not entitled.", "Kontraktor tidak berusaha sedaya upaya: tiada lanjutan diberi. Putuskan sebagai tidak layak."),
  BEST_ENDEAVOURS_REQUIRED: () => w("Say whether the contractor used best endeavours (fully, in part or not).", "Nyatakan sama ada kontraktor berusaha sedaya upaya (sepenuhnya, sebahagian atau tidak)."),
  // 6.6 the certificate
  NOT_DETERMINED: () => w("The claim is sent for approval, and certified, once it is determined entitled.", "Tuntutan dihantar untuk kelulusan, dan diperakui, setelah diputuskan layak."),
  EOT_CERTIFICATE_LIVE: (d) => w(`The claim's certificate is already raised (${s(d.number, "not yet numbered")}): void it first to raise another.`, `Perakuan tuntutan itu telah dinaikkan (${s(d.number, "belum bernombor")}): batalkan dahulu untuk menaikkan yang lain.`),
  GRANTED_DAYS_REQUIRED: () => w("Give the days granted, more than none.", "Nyatakan hari yang diberi, lebih daripada sifar."),
  UNEXTENDED_NOTE_REQUIRED: () => w("Best endeavours were met in part: state the period not extended.", "Usaha sedaya upaya dipenuhi sebahagian: nyatakan tempoh yang tidak dilanjutkan."),
  NO_DATE_FOR_COMPLETION: () => w("The baseline in force has no date for completion (possession not recorded).", "Garis dasar berkuat kuasa tiada tarikh siap (milik tapak belum direkodkan)."),
  GRANT_DIFFERS: (d) => w(`The days granted (${s(d.granted, "stated")}) differ from the reasons' computed ${s(d.computed, "days")} (assumed: consecutive reasons added, each concurrent group at its longest).`, `Hari diberi (${s(d.granted, "dinyatakan")}) berbeza daripada ${s(d.computed, "hari")} yang dikira daripada sebab-sebab (andaian: sebab berturutan dicampur, setiap kumpulan serentak pada yang terpanjang).`),
  EOT_MOVED: (d) => w(`Another extension of time moved the date for completion since this certificate was raised (now ${d.day ? formatDate(String(d.day)) : "unknown"}). Void it and raise it again from the claim.`, `Lanjutan masa lain telah mengubah tarikh siap sejak perakuan ini dinaikkan (kini ${d.day ? formatDate(String(d.day)) : "tidak diketahui"}). Batalkan dan naikkan semula daripada tuntutan.`),
  // 6.7 the period extension
  NEW_EXPIRY_NOT_LATER: (d) => w(`The new expiry must be after the current one (${day(d.day)}).`, `Tarikh tamat baharu mesti selepas yang semasa (${day(d.day)}).`),
  PERIOD_REASON_REQUIRED: () => w("Say why the contract period is extended (the current need).", "Nyatakan mengapa tempoh kontrak dilanjutkan (keperluan semasa)."),
  FINANCIAL_IMPACT_BELOW_NOTHING: () => w("A financial impact is never below nothing.", "Kesan kewangan tidak kurang daripada sifar."),
  PRECONDITION_NOT_MET: (d) => w(`${precondition(d).en} is not confirmed: all four, and the SPAN Act's compliance, are confirmed before the extension is evaluated.`, `${precondition(d).ms} belum disahkan: keempat-empatnya, serta pematuhan Akta SPAN, disahkan sebelum lanjutan dinilai.`),
  PERIOD_MOVED: (d) => w(`The contract period moved since the agreement was raised (now ${day(d.day)}). Void it and raise it again.`, `Tempoh kontrak telah berubah sejak perjanjian dinaikkan (kini ${day(d.day)}). Batalkan dan naikkan semula.`),
  PERIOD_AGREEMENT_LIVE: (d) => w(`The extension's agreement is already raised (${s(d.number, "not yet numbered")}): void it first to raise another.`, `Perjanjian lanjutan itu telah dinaikkan (${s(d.number, "belum bernombor")}): batalkan dahulu untuk menaikkan yang lain.`),
  // 6.8 loss and expense
  CLAIMED_REQUIRED: () => w("Give the amount claimed, not below nothing.", "Nyatakan amaun yang dituntut, tidak kurang daripada sifar."),
  VALUED_ALREADY_SENT: () => w("Its value was sent for approval and stands as sent.", "Nilainya telah dihantar untuk kelulusan dan kekal seperti dihantar."),
  VALUED_REQUIRED: () => w("Give the value and the day it was valued.", "Nyatakan nilai dan hari ia dinilai."),
  VALUATION_BASIS_REQUIRED: () => w("Say how it was valued.", "Nyatakan cara ia dinilai."),
  NOT_VALUED: () => w("The claim is sent once it is valued.", "Tuntutan dihantar setelah dinilai."),
  CLAIMS_COMMITTEE_MISMATCH: (d) => w(`The route's committee step is ${s(d.committee, "another committee")}, and the contract type names ${s(d.claims, "another")} for its loss-and-expense claims. Correct the matrix row or the contract type.`, `Langkah jawatankuasa laluan ialah ${s(d.committee, "jawatankuasa lain")}, sedangkan jenis kontrak menamakan ${s(d.claims, "yang lain")} bagi tuntutan kerugian dan perbelanjaannya. Betulkan baris matriks atau jenis kontrak.`),
  CLAIMS_COMMITTEE_NOT_SET: () => w("The contract type names no committee for its loss-and-expense claims, so the route's committee step is not compared.", "Jenis kontrak tidak menamakan jawatankuasa bagi tuntutan kerugian dan perbelanjaannya, maka langkah jawatankuasa laluan tidak dibandingkan."),
  LOSS_NOT_APPROVED: (d) => w(`A loss-and-expense line takes an approved claim; ${s(d.claim, "this claim")} is not approved.`, `Baris kerugian dan perbelanjaan memerlukan tuntutan yang diluluskan; ${s(d.claim, "tuntutan ini")} belum diluluskan.`),
};

/// The finding in words: time's own, else a contract matter's (fails closed in words: "Refused.").
export function timeFaultWords(f: Finding): Words {
  const fn = TIME_FAULT_WORDS[f.code];
  if (fn) return fn(f.data ?? {});
  if (MATTER_FAULT_WORDS[f.code]) return matterFaultWords(f);
  return w("Refused.", "Ditolak.");
}

export const timeFaultText = (f: Finding) => timeFaultWords(f).en;
export const timeRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(timeFaultText).join(" ")}`.trim();
