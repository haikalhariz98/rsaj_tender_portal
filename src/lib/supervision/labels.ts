/**
 * Supervision's words (6.13 Part A, 4b), English and Malay. A code never reaches a screen: every enum value and
 * every refusal is worded here, naming what refuses the act and the way out of it. Exhaustive maps.
 */

import { formatDate } from "@/lib/format";

import type { ComplianceArea, ContractPartyKind, DelegateKind, DelegationVariant, DiaryEndorser, DirectionCause, EarlyActionBranch, Finding, PendingDeductionKind, ProgrammeDecision, ProgrammeKind, SiteRecordsSet, SoAssignmentReason, SupervisionAct } from "./types";

export interface Words {
  en: string;
  ms: string;
}
export const w = (en: string, ms: string): Words => ({ en, ms });

export const SO_REASON_WORDS: Readonly<Record<SoAssignmentReason, Words>> = {
  EXECUTION: w("Resolved at execution", "Ditentukan semasa pelaksanaan"),
  RESOLVED: w("Resolved for a contract executed before supervision was recorded", "Ditentukan bagi kontrak yang dilaksanakan sebelum penyeliaan direkodkan"),
  RE_RESOLVED: w("Re-resolved after the contract sum moved across a band", "Ditentukan semula selepas jumlah kontrak melepasi jalur"),
};

export const DELEGATE_KIND_WORDS: Readonly<Record<DelegateKind, Words>> = {
  PRINCIPAL: w("Principal Representative", "Wakil P.P. Utama"),
  SPECIALIST: w("Specialist Representative", "Wakil P.P. Pakar"),
  SPECIALIST_QS: w("Specialist Representative (Quantity Surveyor)", "Wakil P.P. Pakar (Juruukur Bahan)"),
};

export const ACT_WORDS: Readonly<Record<SupervisionAct, Words>> = {
  DIARY: w("Keep and attest the site diary", "Menyimpan dan mengesahkan diari tapak"),
  PROGRAMME_SCRUTINY: w("Scrutinise the work programme", "Meneliti program kerja"),
  PROGRESS: w("Record progress", "Merekod kemajuan"),
  OBSERVATION: w("Record compliance observations", "Merekod pemerhatian pematuhan"),
  CONTRACTOR_COMMUNICATION: w("Communicate with the contractor", "Berhubung dengan kontraktor"),
  INSTRUCTION: w("Issue instructions", "Mengeluarkan arahan"),
  VALUATION: w("Value work for interim payment", "Menilai kerja untuk bayaran interim"),
  VARIATION_APPLICATION: w("Apply for variations", "Memohon perubahan kerja"),
};

export const VARIANT_WORDS: Readonly<Record<DelegationVariant, Words>> = {
  CONVENTIONAL: w("Conventional contracts (letters A/1 and A/2)", "Kontrak konvensional (surat A/1 dan A/2)"),
  DESIGN_AND_BUILD: w("Design and build and turnkey (letters B/1 and B/2)", "Reka dan bina serta turnkey (surat B/1 dan B/2)"),
};

export const PROGRAMME_KIND_WORDS: Readonly<Record<ProgrammeKind, Words>> = {
  WORK_PROGRAMME: w("Work programme", "Program kerja"),
  SERVICE_SCHEDULE: w("Service and maintenance implementation schedule", "Jadual pelaksanaan perkhidmatan dan penyelenggaraan"),
};

export const PROGRAMME_DECISION_WORDS: Readonly<Record<ProgrammeDecision, Words>> = {
  APPROVED: w("Approved", "Diluluskan"),
  RETURNED: w("Returned for revision", "Dikembalikan untuk dipinda"),
};

export const ENDORSER_WORDS: Readonly<Record<DiaryEndorser, Words>> = {
  SUPERIOR_OFFICER: w("Superior officer", "Pegawai atasan"),
  SUPERINTENDING_OFFICER: w("Superintending Officer", "Pegawai Penguasa"),
};

export const AREA_WORDS: Readonly<Record<ComplianceArea, Words>> = {
  MATERIAL_QUALITY: w("Quality of materials", "Kualiti bahan"),
  WORKMANSHIP: w("Workmanship", "Mutu kerja"),
  AUTHORITY_COMPLIANCE: w("Local-authority and third-party compliance", "Pematuhan pihak berkuasa tempatan dan pihak ketiga"),
  WORKER_WELFARE: w("Worker welfare", "Kebajikan pekerja"),
  SAFETY: w("Safety", "Keselamatan"),
  INSURANCE: w("Insurance protection", "Perlindungan insurans"),
  WAGES: w("Payment of wages due", "Pembayaran gaji"),
  OSHA: w("Occupational Safety and Health Act", "Akta Keselamatan dan Kesihatan Pekerjaan"),
};

export const CAUSE_WORDS: Readonly<Record<DirectionCause, Words>> = {
  VARIATION: w("A variation order", "Perintah perubahan kerja"),
  LOCAL_AUTHORITY_DELAY: w("A local-authority delay", "Kelewatan pihak berkuasa tempatan"),
  OTHER_DELAY: w("Another contractual delay event", "Peristiwa kelewatan kontrak yang lain"),
};

export const DEDUCTION_KIND_WORDS: Readonly<Record<PendingDeductionKind, Words>> = {
  INSURANCE_PREMIUM: w("Insurance premium paid by the employer (self-help)", "Premium insurans dibayar oleh majikan"),
};

export const BRANCH_WORDS: Readonly<Record<EarlyActionBranch, Words>> = {
  EXTEND_TIME: w("Grant an extension of time or of the contract period", "Memberi lanjutan masa atau tempoh kontrak"),
  IMPOSE_LAD: w("Impose liquidated damages", "Mengenakan ganti rugi tertentu"),
  TERMINATE: w("Terminate the contractor's employment", "Menamatkan pengambilan kontraktor"),
};

export const PARTY_KIND_WORDS: Readonly<Record<ContractPartyKind, Words>> = {
  NOMINATED_SUBCONTRACTOR: w("Nominated sub-contractor", "Subkontraktor dinamakan"),
  NOMINATED_SUPPLIER: w("Nominated supplier", "Pembekal dinamakan"),
  ASSIGNEE: w("Approved assignee", "Penerima serah hak yang diluluskan"),
};

export const RECORDS_SET_WORDS: Readonly<Record<SiteRecordsSet, Words>> = {
  PIPE_LOG: w("Pipe log", "Log paip"),
  AS_BUILT: w("As-built drawings", "Lukisan siap bina"),
};

const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");

/// Every supervision refusal, in both languages.
export function supervisionFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ the S.O.
    case "SO_UNRESOLVED":
      return w(`No superintending-officer rule on the approval matrix${d.matrix ? ` (${String(d.matrix)})` : ""} gives this contract an S.O. at its value and regime, or the rules that match disagree. Record the rule on the approval matrix; the S.O. is never keyed.`, `Tiada peraturan Pegawai Penguasa pada matriks kelulusan yang menentukan P.P. bagi kontrak ini. Rekodkan peraturan itu pada matriks kelulusan.`);
    case "NOT_EXECUTED":
      return w("The contract is not executed yet: its S.O. is resolved at the employer's signature.", "Kontrak belum dilaksanakan: P.P. ditentukan semasa tandatangan majikan.");
    case "ALREADY_RESOLVED":
      return w("This contract's S.O. is already resolved.", "P.P. kontrak ini telah ditentukan.");
    case "NO_SO":
      return w("No S.O. is resolved for this contract yet. Resolve it on the Team tab first.", "P.P. belum ditentukan bagi kontrak ini. Tentukan di tab Pasukan dahulu.");
    case "NOT_SO":
      return w(`Only the S.O. (${String(d.office ?? "the office")}) is recorded for this, or someone acting in that office.`, `Hanya P.P. direkodkan untuk ini.`);
    case "NOT_PRINCIPAL":
      return w(`This is the S.O.'s or the Principal Representative's: the person named is neither (the S.O. is ${String(d.office ?? "the office")}).`, `Ini untuk P.P. atau Wakil P.P. Utama sahaja.`);
    case "NOT_IN_SCOPE":
      return w(`The person named is the S.O.'s representative, but "${ACT_WORDS[d.act as SupervisionAct]?.en ?? "this act"}" is outside their delegation's scope. The S.O. records it, or a delegation that covers it.`, `Orang yang dinamakan ialah wakil P.P., tetapi perkara ini di luar skop perwakilannya.`);
    case "NOT_AUTHORISED":
      return w(`The person named is neither the S.O. (${String(d.office ?? "the office")}) nor a representative whose delegation is in force today.`, `Orang yang dinamakan bukan P.P. dan bukan wakil yang perwakilannya berkuat kuasa.`);
    // ------------------------------------------------ delegation
    case "GRANTOR_NOT_SO":
      return w(`Only the S.O. (${String(d.office ?? "the office")}) delegates: the person named as delegating does not hold the office today.`, `Hanya P.P. boleh mewakilkan.`);
    case "SUB_DELEGATION":
      return w("A representative never delegates: the S.O.'s authority is not delegated twice.", "Wakil tidak boleh mewakilkan semula.");
    case "DELEGATE_IS_GRANTOR":
      return w("The S.O. does not delegate to themselves.", "P.P. tidak mewakilkan kepada diri sendiri.");
    case "DELEGATE_INACTIVE":
      return w("Choose a delegate on record and active.", "Pilih wakil yang aktif.");
    case "ALREADY_DELEGATED":
      return w("That person already has a delegation on this contract that is not revoked.", "Orang itu sudah mempunyai perwakilan pada kontrak ini.");
    case "COMPETENCY_NOT_CONFIRMED":
      return w("Record the S.O.'s satisfaction that the delegate has the ability and experience needed, and on what it rests.", "Rekodkan kepuasan P.P. bahawa wakil mempunyai kebolehan dan pengalaman.");
    case "SCOPE_EMPTY":
      return w("Choose what the delegation covers.", "Pilih skop perwakilan.");
    case "VARIANT_NOT_SET":
      return w(`Which delegation letters ${d.type ? String(d.type) : "this contract type"} takes is not set. Set its delegation letter variant under Configuration › Reference data.`, `Varian surat perwakilan bagi jenis kontrak ini belum ditetapkan.`);
    case "FORMS_NOT_SET":
      return w(`The forms of the delegation letter and its notification for ${VARIANT_WORDS[d.variant as DelegationVariant]?.en.toLowerCase() ?? "this variant"} are not set. Set them under Configuration › Post-award.`, `Borang surat perwakilan dan pemberitahuannya belum ditetapkan.`);
    case "ALREADY_REVOKED":
      return w("The delegation is already revoked.", "Perwakilan telah dibatalkan.");
    case "BEFORE_RECORDED":
      return w(`Not before the delegation was made (${day(d.day)}).`, `Tidak sebelum perwakilan dibuat.`);
    // ------------------------------------------------ possession
    case "NOT_STAMPED":
      return w("Possession is recorded once the contract is fully executed: record its stamping first (Formation › Signing).", "Milik tapak direkodkan selepas kontrak dilaksanakan sepenuhnya: rekodkan setem dahulu.");
    case "ALREADY_POSSESSED":
      return w("Possession of site is recorded once.", "Milik tapak direkodkan sekali sahaja.");
    case "NO_BASELINE_VERSION":
      return w("The baseline has no version: possession writes a new one, so confirm the baseline first.", "Garis dasar belum mempunyai versi.");
    case "BEFORE_CONTRACT_DATE":
      return w(`Not before the Contract Date (${day(d.day)}).`, `Tidak sebelum Tarikh Kontrak.`);
    case "START_RULE_NOT_SET":
      return w(`Whether ${d.type ? String(d.type) : "this contract type"} needs its securities before work starts is not set. Set its start-of-work behaviour under Configuration › Reference data.`, `Sama ada jaminan diperlukan sebelum kerja bermula belum ditetapkan bagi jenis kontrak ini.`);
    case "SECURITIES_NOT_MET":
      return w(`This contract type starts only with its securities verified: ${d.item === "BOND" ? "the performance bond" : "the required insurance"} is ${d.state === "NOT_SET" ? "not decided" : "not met"} (see Securities).`, `Jenis kontrak ini bermula hanya dengan jaminan disahkan.`);
    // ------------------------------------------------ programme
    case "OPEN_REVISION":
      return w(`Revision ${String(d.revision ?? "")} is still waiting for its decision: decide it first.`, `Semakan sebelumnya masih menunggu keputusan.`);
    case "DECIDED":
      return w("That revision is already decided.", "Semakan itu telah diputuskan.");
    case "ALREADY_SCRUTINISED":
      return w("Its scrutiny is already recorded.", "Penelitiannya telah direkodkan.");
    case "ANSWER_REQUIRED":
      return w("Say whether it reflects a reasonable and realistic sequence with reasonable commencement and completion dates.", "Nyatakan sama ada ia munasabah dan realistik.");
    case "NOTE_REQUIRED":
      return w("Say what is wrong with it.", "Nyatakan apa yang tidak kena.");
    case "BEFORE_SUBMITTED":
      return w(`Not before it was submitted (${day(d.day)}).`, `Tidak sebelum ia dikemukakan.`);
    case "NOT_SCRUTINISED":
      return w("A programme is approved only after its scrutiny is recorded.", "Program diluluskan hanya selepas penelitiannya direkodkan.");
    case "FOUND_UNREASONABLE":
      return w("Its scrutiny found it not reasonable: return it for revision instead.", "Penelitian mendapati ia tidak munasabah: kembalikan untuk dipinda.");
    case "NO_POINTS":
      return w("Give its planned progress (at least one day and percentage): it is the baseline progress is measured against.", "Nyatakan kemajuan dirancang.");
    case "BEFORE_SCRUTINY":
      return w(`Not before its scrutiny (${day(d.day)}).`, `Tidak sebelum penelitiannya.`);
    case "POINT_NOT_A_PERCENT":
      return w(`Line ${String(d.line ?? "")}: the planned percentage must be from 0 to 100, to at most four places.`, `Baris ${String(d.line ?? "")}: peratusan tidak sah.`);
    case "POINT_DAYS_NOT_ASCENDING":
      return w(`Line ${String(d.line ?? "")}: each day must come after the one before.`, `Baris ${String(d.line ?? "")}: tarikh mesti menaik.`);
    case "POINT_PCT_FALLS":
      return w(`Line ${String(d.line ?? "")}: planned progress is cumulative and never falls.`, `Baris ${String(d.line ?? "")}: kemajuan dirancang tidak boleh menurun.`);
    case "POINT_BEFORE_POSSESSION":
      return w(`Line ${String(d.line ?? "")}: not before possession of site (${day(d.day)}).`, `Baris ${String(d.line ?? "")}: tidak sebelum milik tapak.`);
    // ------------------------------------------------ diary, progress, records
    case "NOT_POSSESSED":
      return w("Possession of site is not recorded yet: the site's records start from it (Site tab).", "Milik tapak belum direkodkan.");
    case "BEFORE_POSSESSION":
      return w(`Not before possession of site (${day(d.day)}).`, `Tidak sebelum milik tapak.`);
    case "ALREADY_ENTERED":
      return w(`The diary already has an entry for ${day(d.day)}: one a day.`, `Diari sudah mempunyai catatan bagi hari itu.`);
    case "ENTRY_REQUIRED":
      return w("Write the day's entry.", "Tulis catatan hari itu.");
    case "BACKDATED_NO_EXCEPTION":
      return w(`An entry for ${day(d.day)}, an earlier day, needs a recorded exception: say why it was not written on the day.`, `Catatan bagi hari terdahulu memerlukan pengecualian yang direkodkan.`);
    case "ALREADY_ATTESTED":
      return w("Already attested.", "Telah disahkan.");
    case "AGENT_NAME_REQUIRED":
      return w("Give the contractor's agent's name, as signed.", "Nyatakan nama ejen kontraktor.");
    case "BEFORE_DAY":
      return w(`Not before the day the entry is for (${day(d.day)}).`, `Tidak sebelum hari catatan itu.`);
    case "DISAGREEMENT_REQUIRED":
      return w("Say what the two disagree on.", "Nyatakan perkara yang tidak dipersetujui.");
    case "ALREADY_DISPUTED":
      return w("A disagreement is already recorded on this entry and escalated to the S.O.", "Perselisihan telah direkodkan.");
    case "COVERS_ORDER":
      return w("The covered days run from the first to the last.", "Tempoh yang diliputi tidak sah.");
    case "BEFORE_COVER":
      return w(`The visit is on or after the last day it covers (${day(d.day)}).`, `Lawatan mesti pada atau selepas hari terakhir yang diliputi.`);
    case "NO_ENTRIES":
      return w("No diary entry falls in those days.", "Tiada catatan diari dalam tempoh itu.");
    case "NOT_A_PERCENT":
      return w("Give a percentage from 0 to 100, to at most four places.", "Nyatakan peratusan 0 hingga 100.");
    case "ALREADY_RECORDED":
      return w(`Progress is already recorded for ${day(d.day)}.`, `Kemajuan telah direkodkan bagi hari itu.`);
    case "FALLS":
      return w("Actual progress is cumulative: it is not below an earlier day's, nor above a later day's.", "Kemajuan sebenar adalah kumulatif.");
    case "NOT_IN_DELAY":
      return w("A special meeting follows an In Delay classification, and the contract is not In Delay on that day.", "Mesyuarat khas diadakan selepas klasifikasi Lewat.");
    case "MINUTES_REQUIRED":
      return w("Record the minutes.", "Rekodkan minit.");
    case "NO_ATTENDEES":
      return w("Name who attended.", "Namakan yang hadir.");
    case "POLICY_NOT_ON_CONTRACT":
      return w("Choose a policy lodged on this contract.", "Pilih polisi kontrak ini.");
    case "AMOUNT_NOT_POSITIVE":
      return w("Give the premium paid, above nothing.", "Nyatakan premium yang dibayar.");
    case "EXTENDED_NOT_LATER":
      return w(`The extended cover runs past the policy's present end (${day(d.day)}).`, `Lanjutan mesti melepasi tarikh tamat polisi.`);
    case "NO_BRANCH":
      return w("Choose at least one action.", "Pilih sekurang-kurangnya satu tindakan.");
    case "NO_LIVE_VERSION":
      return w(`Nothing to hand over: no ${RECORDS_SET_WORDS[d.set as SiteRecordsSet]?.en.toLowerCase() ?? "record"} is attached to the contract.`, `Tiada rekod untuk diserahkan.`);
    case "TO_REQUIRED":
      return w("Say who it is handed to (the Implementing Department).", "Nyatakan penerima.");
    case "RECEIVER_REQUIRED":
      return w("Name who received it.", "Namakan penerima.");
    case "NAME_REQUIRED":
      return w("Give the party's name.", "Nyatakan nama pihak.");
    case "PARTY_BEFORE_EXECUTION":
      return w("Parties paid through the certificates are recorded once the contract is executed.", "Pihak direkodkan selepas kontrak dilaksanakan.");
    case "SUM_NEGATIVE":
      return w("A sum is never below nothing.", "Jumlah tidak boleh negatif.");
    case "DUPLICATE_NAME":
      return w("That party is already recorded on this contract.", "Pihak itu telah direkodkan.");
    case "RETIRED":
      return w("That party is already retired.", "Pihak itu telah dikeluarkan.");
    // ------------------------------------------------ shared
    case "FUTURE_DATE":
      return w(`Not in the future (${day(d.day)}).`, `Bukan tarikh akan datang.`);
    case "REASON_REQUIRED":
      return w("Give the reason.", "Nyatakan sebabnya.");
    default:
      return w("Refused.", "Ditolak.");
  }
}

export const supervisionFaultText = (f: Finding) => supervisionFaultWords(f).en;
export const supervisionRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(supervisionFaultText).join(" ")}`.trim();
