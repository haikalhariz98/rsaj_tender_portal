/**
 * What every 6.12 refusal says, in English and Malay. A code never reaches a screen: each finding is
 * worded here, naming what refuses the act and the way out of it. A setting frozen when preparation
 * started is never "set it": it is what this contract was formed under, and the words say what can
 * still be done.
 */

import { formatDate } from "@/lib/format";
import { SIGNER_FAULT_TEXT } from "@/lib/award/labels";

import { AWARD_TERM_WORDS, type AwardTerm } from "./award-correction";
import { BASELINE_FIELD_WORDS, CHECK_WORDS, COMPARISON_WORDS, GATE_WORDS, w, type Words } from "./labels";
import type { Finding, FormationCheckKind, ReconciliationComparison } from "./types";

const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
const field = (v: unknown) => BASELINE_FIELD_WORDS[String(v)] ?? w("A baseline value", "Nilai garis dasar");
const check = (v: unknown) => CHECK_WORDS[v as FormationCheckKind] ?? w("A check", "Satu semakan");
const comparison = (v: unknown) => COMPARISON_WORDS[v as ReconciliationComparison] ?? w("A comparison", "Satu perbandingan");
const gate = (v: unknown) => GATE_WORDS[String(v)] ?? w("a condition", "satu syarat");
const lower = (x: Words): Words => ({ en: x.en.charAt(0).toLowerCase() + x.en.slice(1), ms: x.ms.charAt(0).toLowerCase() + x.ms.slice(1) });

const SIGNATORY_TEXT: Record<string, Words> = {
  SIGNATORY_UNRESOLVED: w("No signatory rule on the approval matrix covers the contract agreement at this sum, so nobody may sign it. Add the rule on the approval matrix; the portal does not route round the gap.", "Tiada peraturan penandatangan pada matriks kelulusan meliputi perjanjian kontrak pada jumlah ini. Tambah peraturan itu pada matriks kelulusan."),
  SIGNATORY_NOT_FOR_INSTRUMENT: w("The signatory rule that matches names another condition, so it is not read as covering the contract agreement. Give the rule the contract agreement's condition on the approval matrix.", "Peraturan penandatangan yang sepadan menamakan syarat lain. Berikan peraturan itu syarat perjanjian kontrak pada matriks kelulusan."),
  SIGNATORY_AMBIGUOUS: w("More than one signatory rule matches the contract agreement at this sum. Correct the overlapping rules on the approval matrix.", "Lebih daripada satu peraturan penandatangan sepadan. Betulkan peraturan yang bertindih pada matriks kelulusan."),
  SIGNATORY_GAP: w("The signatory rule that matches is recorded as a known gap. A contract signatory cannot be an assumption: record the rule on the approval matrix.", "Peraturan penandatangan yang sepadan direkodkan sebagai jurang. Rekodkan peraturan itu pada matriks kelulusan."),
  SIGNATORY_BOUNDARY_UNDECIDED: w("The signatory rule has an edge on the boundary and nobody has decided whether it follows the boundary switch. Decide it on the approval matrix.", "Peraturan penandatangan mempunyai had pada sempadan yang belum diputuskan. Putuskan pada matriks kelulusan."),
};

const PERSON_TEXT: Record<string, Words> = {
  NAME_REQUIRED: w("needs their full name", "memerlukan nama penuh"),
  IC_REQUIRED: w("needs their identity-card number", "memerlukan nombor kad pengenalan"),
  IC_FORMAT: w("has an identity-card number not in the shape 000000-00-0000", "mempunyai nombor kad pengenalan yang tidak berbentuk 000000-00-0000"),
};

export function contractFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ starting preparation
    case "NOT_NUMBER_ALLOCATED":
      return w("Preparation has already started on this contract.", "Penyediaan kontrak ini telah bermula.");
    case "AWARD_NOT_LIVE":
      return w("The award is not issued or accepted, so its contract is not prepared.", "Award belum dikeluarkan atau diterima.");
    case "NO_TIME_ZONE":
      return w("Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's.", "Tetapkan zon waktu organisasi di Konfigurasi › Organisasi dahulu.");
    case "BASIS_NOT_SET":
      return w("The exercise names no contract basis, so the order of the Contract Document and its checks are not known. The basis is chosen on the sourcing exercise.", "Latihan perolehan tidak menamakan asas kontrak.");
    case "BASIS_BQ_NOT_SET":
      return w(`Whether a contract on ${d.basis ?? "this basis"} is let on a bill of quantities is not set, so which checks apply is not known. Set it under Configuration › Scope and estimate.`, `Sama ada kontrak atas ${d.basis ?? "asas ini"} berdasarkan senarai kuantiti belum ditetapkan. Tetapkan di Konfigurasi › Skop dan anggaran.`);
    case "NO_DOCUMENT_PARTS":
      return w(`No Contract Document parts are configured for ${d.basis ?? "this basis"}, so the document cannot be assembled in its prescribed order. Add them under Configuration › Contract controls.`, `Tiada bahagian Dokumen Kontrak dikonfigurasikan bagi ${d.basis ?? "asas ini"}. Tambah di Konfigurasi › Kawalan kontrak.`);
    case "LEGAL_OFFICE_NOT_SET":
      return w("The legal office that reviews contracts is not set. Set it under Configuration › Contract controls.", "Pejabat undang-undang yang menyemak kontrak belum ditetapkan. Tetapkan di Konfigurasi › Kawalan kontrak.");
    case "LEGAL_OFFICE_UNKNOWN":
      return w("The legal office set under Configuration › Contract controls is not a unit of the organisation's structure in force today (it has ended, or has not started yet). Choose a unit in force there.", "Pejabat undang-undang yang ditetapkan bukan unit dalam struktur organisasi yang berkuat kuasa hari ini (telah tamat, atau belum bermula). Pilih unit yang berkuat kuasa.");
    case "SIGNATORY_COND_NOT_SET":
      return w("The approval matrix condition that names the contract agreement's signatory is not set. Set it under Configuration › Contract controls.", "Syarat matriks kelulusan bagi penandatangan perjanjian kontrak belum ditetapkan. Tetapkan di Konfigurasi › Kawalan kontrak.");
    case "STAMP_NOT_SET":
      return w("The words stamped on a controlled copy are not set. Set them under Configuration › Contract controls.", "Perkataan cop salinan terkawal belum ditetapkan. Tetapkan di Konfigurasi › Kawalan kontrak.");
    case "NO_COPY_RECIPIENTS":
      return w("Nobody is set to receive a controlled copy. Add the recipients under Configuration › Contract controls.", "Tiada penerima salinan terkawal ditetapkan. Tambah di Konfigurasi › Kawalan kontrak.");

    // ------------------------------------------------ assembly, reconciliation, checks
    case "NO_PARTS":
      return w("The assembly has no parts: none were configured for the basis when preparation started.", "Himpunan tiada bahagian.");
    case "CANCELLED_WITHOUT_STATEMENT":
      return w(`${d.part ?? "A part"} is cancelled by the alternative proposal without saying what it cancels. State it on the part.`, `${d.part ?? "Satu bahagian"} dibatalkan oleh cadangan alternatif tanpa menyatakan apa yang dibatalkan.`);
    case "COMPARISON_NOT_RECORDED":
      return w(`Reconciliation not recorded: ${lower(comparison(d.comparison)).en}.`, `Penyesuaian belum direkodkan: ${lower(comparison(d.comparison)).ms}.`);
    case "AMENDMENT_NOT_RECORDED":
      return w(`${comparison(d.comparison).en} is recorded as amended but lists no amendment.`, `${comparison(d.comparison).ms} direkodkan sebagai dipinda tetapi tiada pindaan disenaraikan.`);
    case "AMENDMENT_UNSIGNED":
      return w(`An amendment under "${comparison(d.comparison).en}" lacks a signature: both the contractor's signatory and the preparing officer sign it.`, `Satu pindaan tidak lengkap ditandatangani oleh kedua-dua pihak.`);
    case "DESCRIPTION_REQUIRED":
      return w("Say what the amendment changes.", "Nyatakan apa yang dipinda.");
    case "SIGNATORY_REQUIRED":
      return w("Name who signed the amendment for the contractor.", "Namakan penandatangan pindaan bagi pihak kontraktor.");
    case "CHECKS_NOT_SET":
      return w("Which checks this contract takes was not frozen when preparation started.", "Semakan yang terpakai tidak dibekukan semasa penyediaan bermula.");
    case "CHECK_INCOMPLETE":
      return w(`Not complete: ${lower(check(d.check)).en}.`, `Belum lengkap: ${lower(check(d.check)).ms}.`);
    case "NOT_FOR_BASIS":
      return w("This check is not one this contract's basis takes.", "Semakan ini tidak terpakai bagi asas kontrak ini.");
    case "ALREADY_COMPLETE":
      return w("This check is already recorded complete.", "Semakan ini telah direkodkan lengkap.");
    case "BEFORE_PREPARATION":
      return w("The day is before preparation started.", "Tarikh adalah sebelum penyediaan bermula.");
    case "NO_RATE_COMPARED":
      return w("Compare at least one tendered rate with the estimate's before recording the check complete.", "Bandingkan sekurang-kurangnya satu kadar tender dengan kadar anggaran.");
    case "FRONT_LOADING_NOTE_REQUIRED":
      return w("Say what was done about the rates listed (or, with no ratio set, how they were judged).", "Nyatakan tindakan atas kadar yang disenaraikan.");

    // ------------------------------------------------ legal review
    case "NOT_IN_PREPARATION":
      return w("The contract is not being prepared now.", "Kontrak tidak dalam penyediaan sekarang.");
    case "LEGAL_OFFICE_NOT_FROZEN":
      return w("No legal office was frozen when this contract's preparation started.", "Tiada pejabat undang-undang dibekukan semasa penyediaan bermula.");
    case "REVIEW_OPEN":
      return w("The contract is already with the legal office: record its decision first.", "Kontrak sudah berada di pejabat undang-undang.");
    case "NO_SUBMISSION_DOCUMENTS":
      return w("Attach what goes to the legal office (the Conditions of Contract, the signed Letter of Acceptance, the bill or schedule) first: each submission pins them.", "Lampirkan dokumen untuk semakan undang-undang dahulu.");
    case "FORMATION_INCOMPLETE":
      return w(`Formation is not complete: ${d.count ?? "some"} item${d.count === 1 ? "" : "s"} of the assembly, the reconciliation or the checks remain. See Formation.`, `Pembentukan belum lengkap: ${d.count ?? "beberapa"} perkara masih tinggal.`);
    case "NO_OPEN_REVIEW":
      return w("Nothing is with the legal office.", "Tiada apa di pejabat undang-undang.");
    case "COMMENTS_REQUIRED":
      return w("A return needs the legal office's comments: type them, or attach them as the legal office's comments.", "Pemulangan memerlukan ulasan pejabat undang-undang.");
    case "BEFORE_SUBMISSION":
      return w("The decision cannot be before the day it was sent.", "Keputusan tidak boleh sebelum tarikh dihantar.");

    // ------------------------------------------------ signing
    case "NOT_ENDORSED":
      return w("The contract is not legally endorsed.", "Kontrak belum disahkan dari segi undang-undang.");
    case "GATE_NOT_MET":
      return d.item
        ? w(`Not ready to sign: ${gate(d.item).en} — ${d.state === "NOT_SET" ? "not set" : "not met"}.`, `Belum sedia untuk ditandatangani: ${gate(d.item).ms} — ${d.state === "NOT_SET" ? "belum ditetapkan" : "belum dipenuhi"}.`)
        : w("The readiness gate is not met (the instrument returned, the bond and the insurances verified): the conditions for an interim certificate before signature.", "Syarat kesediaan belum dipenuhi.");
    case "NO_RESOLUTION":
      return w("No company resolution or other proof of signing authority is on file. Attach it under Signing.", "Tiada resolusi syarikat atau bukti kuasa menandatangan. Lampirkan di Tandatangan.");
    case "ALREADY_SIGNED":
      return w("The contractor's signature is already recorded.", "Tandatangan kontraktor telah direkodkan.");
    case "SIGNATORY":
      return w(`The contractor's signatory ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete", "tidak lengkap")).en}.`, `Penandatangan kontraktor ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete", "tidak lengkap")).ms}.`);
    case "WITNESS":
      return w(`The witness ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete", "tidak lengkap")).en}.`, `Saksi ${(PERSON_TEXT[String(d.fault)] ?? w("is incomplete", "tidak lengkap")).ms}.`);
    case "NAME_REQUIRED":
    case "IC_REQUIRED":
    case "IC_FORMAT":
      return w(`The person ${PERSON_TEXT[f.code].en}.`, `Orang itu ${PERSON_TEXT[f.code].ms}.`);
    case "BEFORE_ENDORSEMENT":
      return w("The contractor cannot have signed before the legal endorsement.", "Kontraktor tidak boleh menandatangan sebelum pengesahan undang-undang.");
    case "CONTRACTOR_NOT_SIGNED":
      return w("The contractor's signature is not recorded: the contractor signs first.", "Tandatangan kontraktor belum direkodkan.");
    case "CONTRACTOR_SIGNED_LATER":
      return w("The contractor's signature is recorded on a later day than today.", "Tandatangan kontraktor direkodkan pada tarikh terkemudian.");
    case "WITNESS_NOT_RECORDED":
      return w("The witness to the contractor's signature is not recorded.", "Saksi tandatangan kontraktor belum direkodkan.");
    case "ALREADY_EXECUTED":
      return w("The contract is already executed.", "Kontrak telah dilaksanakan.");
    case "COMMITMENT":
      return d.fault === "NO_APPROVAL_ROUTE"
        ? w("The requisition has no approval route, so nothing may be committed against it.", "Permintaan tiada laluan kelulusan.")
        : w(`The requisition is not approved${d.outstanding ? `: waiting on ${d.outstanding}` : ""}. Nothing is committed against an unapproved requisition.`, `Permintaan belum diluluskan${d.outstanding ? `: menunggu ${d.outstanding}` : ""}.`);
    case "SIGNATORY_COND_NOT_FROZEN":
      return w("No signatory condition was frozen when this contract's preparation started.", "Tiada syarat penandatangan dibekukan semasa penyediaan bermula.");
    case "SIGNER": {
      const t = SIGNER_FAULT_TEXT[d.fault as keyof typeof SIGNER_FAULT_TEXT];
      return t ? w(/^[A-Z]/.test(t) ? t : `The officer named ${t}`, "Pegawai yang dinamakan tidak boleh menandatangan.") : w("The officer named may not sign.", "Pegawai yang dinamakan tidak boleh menandatangan.");
    }
    case "NO_ISSUE_IN_FORCE":
      return w("No approval matrix is issued and in force today, so the contract agreement's signatory cannot be resolved and nobody may sign for the employer. Issue one under Configuration › Approval matrix.", "Tiada matriks kelulusan yang dikeluarkan dan berkuat kuasa hari ini, jadi penandatangan perjanjian kontrak tidak dapat ditentukan. Keluarkan satu di Konfigurasi › Matriks kelulusan.");
    case "SIGNATORY_NOT_RESOLVED":
      return SIGNATORY_TEXT[String(d.fault)] ?? w("The contract agreement's signatory is not resolved on the approval matrix.", "Penandatangan perjanjian kontrak tidak diselesaikan.");
    case "BASELINE_INCOMPLETE":
      return w(`The baseline still lacks ${d.count ?? "some"} value${d.count === 1 ? "" : "s"}. See Baseline.`, `Garis dasar masih kurang ${d.count ?? "beberapa"} nilai.`);

    // ------------------------------------------------ Contract Date, stamping, briefing
    case "NOT_EARLIER":
      return w(`A correction moves the Contract Date to an earlier day than ${day(d.current)} only.`, `Pembetulan hanya ke tarikh lebih awal daripada ${day(d.current)}.`);
    case "BEFORE_READY":
      return w(`The contract was not ready to sign before ${day(d.readySince)}.`, `Kontrak belum sedia ditandatangani sebelum ${day(d.readySince)}.`);
    case "BEFORE_CONTRACTOR_SIGNED":
      return d.party === "WITNESS"
        ? w(`The contractor's signature was witnessed on ${day(d.signedOn)}: the employer signs after it, so the Contract Date cannot be before that day.`, `Tandatangan kontraktor disaksikan pada ${day(d.signedOn)}: majikan menandatangan selepasnya, jadi Tarikh Kontrak tidak boleh sebelum tarikh itu.`)
        : w(`The contractor signed on ${day(d.signedOn)}: the employer signs after the contractor, so the Contract Date cannot be before that day.`, `Kontraktor menandatangan pada ${day(d.signedOn)}: majikan menandatangan selepas kontraktor, jadi Tarikh Kontrak tidak boleh sebelum tarikh itu.`);
    case "READY_DAY_NOT_FROZEN":
      return w("The day the contract was first ready to sign was not frozen with the signature, so no earlier day can be judged: the Contract Date stands as recorded.", "Tarikh kontrak mula sedia tidak dibekukan; Tarikh Kontrak kekal seperti direkodkan.");
    case "REASON_REQUIRED":
      return w("Give the reason.", "Nyatakan sebabnya.");
    case "NOT_EXECUTED":
      return w("The contract is not executed yet.", "Kontrak belum dilaksanakan.");
    case "ALREADY_STAMPED":
      return w("The contract is already recorded as stamped.", "Kontrak telah direkodkan sebagai dicop.");
    case "DAY_REQUIRED":
      return w("Record the day it was stamped.", "Rekodkan tarikh dicop.");
    case "REFERENCE_REQUIRED":
      return w("Record the stamping reference LHDN gave: the contract is not fully executed without it.", "Rekodkan rujukan setem LHDN.");
    case "BEFORE_CONTRACT_DATE":
      return w("The day cannot be before the Contract Date.", "Tarikh tidak boleh sebelum Tarikh Kontrak.");
    case "NOT_YET_ENDORSED":
      return w("The briefing is recorded at signing, once the contract is legally endorsed.", "Taklimat direkodkan semasa tandatangan.");
    case "ALREADY_RECORDED":
      return w("The briefing is already recorded.", "Taklimat telah direkodkan.");
    case "NO_PARTICIPANTS":
      return w("Name who attended for the employer.", "Namakan peserta bagi pihak majikan.");
    case "NO_ATTENDEES":
      return w("Name who attended for the contractor.", "Namakan peserta bagi pihak kontraktor.");
    case "FUTURE_DATE":
      return w("The day cannot be after today.", "Tarikh tidak boleh selepas hari ini.");

    // ------------------------------------------------ copies and custody
    case "STAMP_NOT_FROZEN":
      return w("No controlled-copy stamp was frozen when this contract's preparation started.", "Tiada cop salinan terkawal dibekukan.");
    case "CONSULTANT_NOT_ANSWERED":
      return w("Say whether a consulting engineer is engaged on this contract first: their copy depends on it.", "Nyatakan sama ada jurutera perunding dilantik dahulu.");
    case "NOT_A_RECIPIENT":
      return w("That recipient is not on this contract's list.", "Penerima itu tiada dalam senarai kontrak ini.");
    case "ALREADY_HOLDS_ONE":
      return w("That recipient already holds a live copy: recall it first, then reissue.", "Penerima itu sudah memegang salinan.");
    case "RECALLED":
      return w("The copy has been recalled.", "Salinan telah ditarik balik.");
    case "NOT_RECALLED":
      return w("Only a recalled copy is reissued.", "Hanya salinan yang ditarik balik boleh dikeluarkan semula.");
    case "ALREADY_REISSUED":
      return w("The copy has already been reissued.", "Salinan telah dikeluarkan semula.");
    case "NOT_DESPATCHED":
      return w("Record the despatch first.", "Rekodkan penghantaran dahulu.");
    case "ALREADY_DESPATCHED":
      return w("The despatch is already recorded.", "Penghantaran telah direkodkan.");
    case "ALREADY_ACKNOWLEDGED":
      return w("The acknowledgement is already recorded.", "Akuan penerimaan telah direkodkan.");
    case "BEFORE_DESPATCH":
      return w("The day cannot be before the copy went out.", "Tarikh tidak boleh sebelum salinan dihantar.");
    case "ALREADY_OUT":
      return w(`The original is already out, with ${d.holder ?? "someone"}: check it in first.`, `Dokumen asal sudah dikeluarkan kepada ${d.holder ?? "seseorang"}.`);
    case "NOT_OUT":
      return w("The original is in custody: nothing to check in.", "Dokumen asal berada dalam simpanan.");
    case "BEFORE_LAST_MOVEMENT":
      return w(`The day cannot be before the last movement, ${day(d.last)}.`, `Tarikh tidak boleh sebelum pergerakan terakhir, ${day(d.last)}.`);
    case "LOCATION_REQUIRED":
      return w("Say where the original is held.", "Nyatakan lokasi simpanan.");
    case "ALREADY_REGISTERED":
      return w("That original is already in the custody register.", "Dokumen asal itu sudah didaftarkan.");
    case "NOT_ON_CONTRACT":
      return w("That bond or policy is not on this contract's register.", "Bon atau polisi itu tiada dalam daftar kontrak ini.");

    // ------------------------------------------------ the baseline
    case "NO_DRAFT":
      return w("The baseline has no draft: it is built when preparation starts.", "Garis dasar tiada draf.");
    case "ALREADY_VERSIONED":
      return w("The baseline already has a version: change it by a correction, with a reason.", "Garis dasar sudah mempunyai versi: ubah melalui pembetulan.");
    case "VERSIONED":
      return w("The baseline has a version, so its draft no longer changes: record a correction, with a reason.", "Garis dasar mempunyai versi: rekod pembetulan.");
    case "CANCELLED":
      return w("The contract is cancelled.", "Kontrak dibatalkan.");
    case "NO_VERSION":
      return w("Nothing to correct: the baseline has no version yet. Key the draft instead.", "Tiada versi untuk diperbetulkan.");
    case "NOTHING_CHANGED":
      return w("Nothing changes.", "Tiada perubahan.");
    case "NOT_SET":
      return d.part
        ? w(`${field(d.field).en}: the ${d.part} is not set.`, `${field(d.field).ms}: ${d.part} belum ditetapkan.`)
        : w(`${field(d.field).en} is not set.`, `${field(d.field).ms} belum ditetapkan.`);
    case "DLP_MONTHS_NOT_EXPECTED":
      return w("No defects liability period applies, yet months are stated.", "Tiada tempoh tanggungan kecacatan, tetapi bulan dinyatakan.");
    case "DLP_NOT_FOR_TYPE":
      return w("The contract type carries no defects liability period, yet one is stated.", "Jenis kontrak tiada tempoh tanggungan kecacatan.");
    case "DLP_REQUIRED_BY_TYPE":
      return w("The contract type carries a defects liability period, yet none is stated.", "Jenis kontrak memerlukan tempoh tanggungan kecacatan.");
    case "DLP_BEHAVIOUR_NOT_SET":
      return w("Whether the contract type carries a defects liability period was not set when preparation started: the period is not checked against it.", "Tingkah laku jenis kontrak bagi tempoh tanggungan kecacatan tidak ditetapkan.");
    case "LAD_UNIT_NOT_DAILY":
      return w(`Liquidated damages are stated ${d.unit ? `"${d.unit}"` : "with no unit"}, not a day: no daily rate is read from it.`, "Ganti rugi tertentu tidak dinyatakan sehari.");
    case "LAD_PCT_NOT_VALID":
    case "RETENTION_PCT_NOT_VALID":
      return w("A percentage is not a valid figure.", "Peratusan tidak sah.");
    case "SECTIONS_REQUIRED":
      return w("Sectional completion applies but no section is stated.", "Penyiapan berperingkat terpakai tetapi tiada seksyen.");
    case "SECTION_LAD_NOT_SET":
      return w(`Section "${d.section ?? ""}" has no liquidated damages stated.`, `Seksyen "${d.section ?? ""}" tiada ganti rugi tertentu.`);
    case "BUILDERS_WORKS_NOT_POSITIVE":
      return w("The prime cost and provisional sums are the whole contract sum or more.", "Wang kos prima dan peruntukan sementara melebihi jumlah kontrak.");
    case "RETENTION_STATED_BUT_BAND_SAYS_NONE":
      return w("The Letter of Acceptance states retention, but the exercise's terms band says none applies: the band's answer is used.", "Surat Setuju Terima menyatakan wang tahanan, tetapi jalur terma menyatakan tiada.");
    case "PROVENANCE_NOT_CHOSEN":
      return w(`${field(d.group === "sums" ? "sums" : d.group).en}: choose where it came from (stated, observed or assumed). There is no default.`, `${field(d.group).ms}: pilih sumbernya. Tiada nilai lalai.`);
    case "STATED_ELSEWHERE":
      return w(`${field(d.group).en} is stated by the award, the Appendix or the bill, so it is not keyed here.`, `${field(d.group).ms} telah dinyatakan di tempat lain.`);
    // ------------------------------------------------ 612-C1: the award's recorded terms corrected after issue
    case "AWARD_NOT_ISSUED":
      return w("The award is not issued yet: its terms are edited on the award itself until the instrument is issued.", "Surat belum dikeluarkan: termanya disunting pada rekod itu sendiri sehingga surat dikeluarkan.");
    case "AWARD_CANCELLED":
      return w("The award is cancelled: its record is kept as it was.", "Pemberian dibatalkan: rekodnya dikekalkan seperti asal.");
    case "NO_BASELINE_VERSION":
      return w("The baseline has no version yet: the correction writes a new version, so confirm the baseline first.", "Garis dasar belum mempunyai versi: pembetulan menulis versi baharu, jadi sahkan garis dasar dahulu.");
    case "NOT_AWARD_SOURCED": {
      const t = AWARD_TERM_WORDS[d.term as AwardTerm] ?? w("That term", "Terma itu");
      return w(`${t.en} in the baseline is not taken from the Letter of Acceptance, so it is not the award's to correct: an entered value is corrected on the Baseline tab, and one the Appendix or the bill states is kept as stated.`, `${t.ms} dalam garis dasar tidak diambil daripada Surat Setuju Terima, jadi ia tidak diperbetulkan di sini.`);
    }
    case "VALUE_NOT_VALID":
      return w("The corrected value is not a valid figure: an amount above zero, whole months (0 for none), percentages up to 100, or a period of at least one.", "Nilai yang diperbetulkan tidak sah.");
    case "STATED_NOT_CORRECTED": {
      // Ruling Q1 (BD-612-23, ADR 0021 Amendment 1): kept as stated. 612-C1 (6.13 Part A step 0, a faithful
      // change as ruled): a value the Letter of Acceptance states, recorded wrongly, is corrected at its source by
      // correcting the award's recorded terms; a variation changes the terms rather than fixing a record.
      const f = field(d.group);
      const plural = /s$/.test(f.en);
      if (d.source === "DERIVED") {
        return w(
          `${f.en} ${plural ? "are" : "is"} derived under a recorded rule from values the award, the Appendix or the bill state, so ${plural ? "they change" : "it changes"} only when they do.`,
          `${f.ms} diterbitkan di bawah peraturan yang direkodkan daripada nilai yang dinyatakan oleh Surat Setuju Terima, Lampiran atau senarai kuantiti, jadi ia hanya berubah apabila nilai itu berubah.`,
        );
      }
      const by: Record<string, Words> = {
        AWARD: w("the Letter of Acceptance", "Surat Setuju Terima"),
        APPENDIX: w("the frozen tender Appendix", "Lampiran tender yang dibekukan"),
        BQ: w("the bill of quantities pinned to the approved documents", "senarai kuantiti yang disematkan kepada dokumen yang diluluskan"),
      };
      const src = by[String(d.source)] ?? w("the award, the Appendix or the bill", "Surat Setuju Terima, Lampiran atau senarai kuantiti");
      if (d.source === "AWARD") {
        return w(
          `${f.en} ${plural ? "are" : "is"} stated by ${src.en}, so ${plural ? "they are" : "it is"} not corrected here: the baseline keeps what the award, the Appendix and the bill state, in that order. If it was recorded wrongly from the signed letter, correct the award's recorded term (Correct the award's term, beside it): a reasoned correction writes a new version, still from the Letter of Acceptance. A change to the terms themselves is a variation, not a correction.`,
          `${f.ms} dinyatakan oleh ${src.ms}, jadi tidak diperbetulkan di sini: garis dasar mengekalkan apa yang dinyatakan oleh Surat Setuju Terima, Lampiran dan senarai kuantiti, mengikut susunan itu. Jika ia direkodkan salah daripada surat yang ditandatangani, betulkan terma Surat Setuju Terima yang direkodkan (Betulkan terma yang direkodkan, di sebelahnya): pembetulan bersebab menulis versi baharu. Perubahan kepada terma itu sendiri ialah variasi, bukan pembetulan.`,
        );
      }
      return w(
        `${f.en} ${plural ? "are" : "is"} stated by ${src.en}, so ${plural ? "they are" : "it is"} not corrected here: the baseline keeps what the award, the Appendix and the bill state, in that order. Only the award's recorded terms are corrected after issue; ${src.en} is kept as frozen. A change to the terms themselves is a variation, not a correction.`,
        `${f.ms} dinyatakan oleh ${src.ms}, jadi tidak diperbetulkan di sini: garis dasar mengekalkan apa yang dinyatakan oleh Surat Setuju Terima, Lampiran dan senarai kuantiti, mengikut susunan itu. Hanya terma Surat Setuju Terima yang direkodkan boleh diperbetulkan selepas pengeluarannya; ${src.ms} dikekalkan seperti dibekukan. Perubahan kepada terma itu sendiri ialah variasi, bukan pembetulan.`,
      );
    }
    case "DERIVED_BY_POLICY":
      return w(`${field(d.group).en} is derived from the builder's works value under the recorded rule, so it is not keyed here.`, `${field(d.group).ms} diterbitkan di bawah peraturan yang direkodkan.`);
  }
  return w("Refused.", "Ditolak.");
}

export const contractFaultText = (f: Finding) => contractFaultWords(f).en;

/// Several refusals as one sentence each, after a lead.
export const refusalText = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(contractFaultText).join(" ")}`.trim();
