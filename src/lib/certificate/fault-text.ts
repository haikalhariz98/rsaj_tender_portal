/**
 * What every certificate refusal says, in English and Malay. A code never reaches a screen: each finding is
 * worded here, naming what refuses the act and the way out of it. Where a refusal stands on something frozen
 * on the certificate (the pinned form, the routing type as it started), the words never say "set it": they
 * say what the certificate was signed or routed under and what can still be done.
 */

import { formatDate } from "@/lib/format";
import { formatSen, parseSen } from "@/lib/money";

import { kindFaultWords } from "./kinds";
import { OFFICE_RULE_WORDS, STATUS_WORDS, w, type Words } from "./labels";
import type { CertificateStatus, Finding, SignatureOfficeRule } from "./types";

const day = (v: unknown) => (typeof v === "string" ? formatDate(v) : "that day");
/// A floor's decimal string as money ("1000.00" → "RM1,000.00").
const floorMoney = (v: unknown) => (typeof v === "string" && /^-?\d+(\.\d{1,2})?$/.test(v) ? formatSen(parseSen(v)) : "its floor");
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));

export function certificateFaultWords(f: Finding): Words {
  const d = f.data ?? {};
  switch (f.code) {
    // ------------------------------------------------ the figures handed in
    case "SNAPSHOT_VERSION":
    case "SNAPSHOT_DAY":
    case "FIELD_KEY":
    case "FIELD_REPEATED":
    case "FIELD_VALUE":
    case "TOTAL_EMPTY":
    case "TOTAL_TERM":
    case "RATIO":
      return w("The figures handed in by the module that raised this certificate are not in the certificate's form (money as decimal strings, each figure once, totals made only of figures). Nothing was saved: the module's calculation must be put right.", "Angka yang diserahkan oleh modul yang membangkitkan perakuan ini tidak dalam bentuk perakuan. Tiada yang disimpan: pengiraan modul itu mesti dibetulkan.");
    // ------------------------------------------------ overrides
    case "OVERRIDE_NOT_IN_DRAFT":
      return w(`A computed figure is overridden only while the certificate is a draft. This one is ${STATUS_WORDS[d.status as CertificateStatus]?.en.toLowerCase() ?? "past its draft"}: its figures are frozen as they were sent on. If a figure is wrong, void it and raise it again.`, `Angka yang dikira hanya boleh diganti semasa perakuan masih draf. Angkanya kini dibekukan. Jika angka salah, batalkan dan bangkitkan semula.`);
    case "OVERRIDE_BELOW_FLOOR":
      return w(`Not below ${floorMoney(d.floor)}: ${s(d.why, "that part is not corrected here")}. Only the part above it may be overridden.`, `Tidak di bawah ${floorMoney(d.floor)}: bahagian itu tidak boleh diganti di sini.`);
    case "OVERRIDE_ROUTE_OPEN":
      return w("Its figures went for approval on a route that is waiting for a decision or approved: they are frozen as they were sent. If a figure is wrong, refuse the route (or void the certificate) and raise it again.", "Angkanya telah dihantar untuk kelulusan: ia dibekukan seperti dihantar. Jika angka salah, tolak laluan itu (atau batalkan perakuan) dan bangkitkan semula.");
    case "NO_FIGURES":
      return w("This certificate carries no computed figures, so there is nothing to override.", "Perakuan ini tiada angka yang dikira.");
    case "TOTAL_NOT_OVERRIDABLE":
      return w("A total is never overridden: it is recomputed from its lines every time, so the certificate always balances. Override the line that is wrong instead, with its justification.", "Jumlah tidak boleh diganti: ia dikira semula daripada barisnya. Ganti baris yang salah, dengan justifikasi.");
    case "UNKNOWN_FIELD":
      return w("That figure is not on this certificate.", "Angka itu tiada pada perakuan ini.");
    case "NOT_OVERRIDABLE":
      return w("That figure is not one the module that computes it allows an officer to override.", "Angka itu tidak boleh diganti oleh pegawai.");
    case "OVERRIDE_VALUE":
      return w(d.type === "MONEY" ? "Give the amount in ringgit and sen, such as 12,500.00." : d.type === "PERCENT" ? "Give the percentage with at most four decimal places." : d.type === "DAYS" ? "Give a whole number of days." : d.type === "DATE" ? "Give a day." : "Give the words.", "Berikan nilai dalam bentuk angka itu.");
    case "SAME_AS_NOW":
      return w("That is the figure as it stands: nothing to override.", "Itu angka sedia ada: tiada yang diganti.");
    case "JUSTIFICATION_REQUIRED":
      return w("An override needs its justification: say why the computed figure is not the one to certify.", "Penggantian memerlukan justifikasi.");
    case "PERSON_REQUIRED":
      return w("Name the officer it is recorded for: someone on record and active.", "Namakan pegawai yang direkodkan: seseorang yang berdaftar dan aktif.");
    // ------------------------------------------------ the form, at the first signature
    case "TEMPLATE_NOT_SET":
      return w("No form is chosen for this certificate, so it has no signature blocks to sign. The module that raised it chooses the form.", "Tiada borang dipilih bagi perakuan ini.");
    case "NO_BLOCKS":
      return w(`The form ${s(d.form, "")} has no signature blocks, so nobody can sign it. Add its blocks in printed order under Configuration › Templates.`, `Borang ${s(d.form, "")} tiada blok tandatangan. Tambah di Konfigurasi › Templat.`);
    case "DELEGABLE_UNDECIDED":
      return w(`On the form ${s(d.form, "")}, whether a delegate may sign "${s(d.block, "a block")}" is not decided, so the form is not signed on. Decide it under Configuration › Templates, in the form's signature blocks.`, `Pada borang ${s(d.form, "")}, sama ada wakil boleh menandatangani "${s(d.block, "blok")}" belum diputuskan. Putuskan di Konfigurasi › Templat.`);
    case "NO_DISTRIBUTION_LIST":
      return w(`The form ${s(d.form, "")} has no distribution list, so a certificate on it could reach nobody. Add its recipients under Configuration › Templates.`, `Borang ${s(d.form, "")} tiada senarai edaran. Tambah penerimanya di Konfigurasi › Templat.`);
    case "TEMPLATE_BODY_EMPTY":
      return w(`The form ${s(d.form, "")} has no text, so nothing can be issued on it. Its text is written under Configuration › Templates.`, `Borang ${s(d.form, "")} tiada teks. Teksnya ditulis di Konfigurasi › Templat.`);
    case "UNKNOWN_FIELDS":
      return w(`The form ${s(d.form, "")} names ${s(d.fields, "a field")}, which a certificate does not fill. Use the certificate's merge fields under Configuration › Templates.`, `Borang ${s(d.form, "")} menamakan ${s(d.fields, "medan")} yang tidak diisi oleh perakuan.`);
    case "MISSING_FIELDS":
      return w(`Not issued: the text needs ${s(d.fields, "a value")}, and this certificate has none for it. A certificate never goes out with a blank where a figure belongs: void it and raise it again with the figure.`, `Tidak dikeluarkan: teks memerlukan ${s(d.fields, "nilai")} yang tiada pada perakuan ini.`);
    case "DATE_FIELD_NO_DATING_BLOCK":
      return w(`The form ${s(d.form, "")} prints the certificate's date, but none of its signature blocks dates the certificate, so its text could never be issued. Mark the block whose signature dates it under Configuration › Templates.`, `Borang ${s(d.form, "")} mencetak tarikh perakuan, tetapi tiada blok tandatangannya yang menentukan tarikh itu, jadi teksnya tidak boleh dikeluarkan. Tandakan blok itu di Konfigurasi › Templat.`);
    case "FIELD_NO_VALUE":
      return w(`The form ${s(d.form, "")} prints ${s(d.fields, "a field")}, which this certificate has no value for (its baseline version or its figures do not hold it), so its text could never be issued. Nothing is pinned: put the form's text right under Configuration › Templates, or void the certificate and raise it again once the value exists.`, `Borang ${s(d.form, "")} mencetak ${s(d.fields, "medan")} yang tiada nilai pada perakuan ini, jadi teksnya tidak boleh dikeluarkan. Tiada yang disematkan: betulkan teks borang di Konfigurasi › Templat, atau batalkan perakuan dan bangkitkan semula apabila nilai itu wujud.`);
    case "SERIES_MISSING":
      return w("No numbering series for certificates is configured, so no number can be given. Add the Certificates series under Configuration › Numbering.", "Tiada siri penomboran bagi perakuan dikonfigurasikan. Tambah siri Perakuan di Konfigurasi › Penomboran.");
    case "SERIES_INVALID":
      return w("The certificate numbering series is not valid. Correct it under Configuration › Numbering.", "Siri penomboran perakuan tidak sah. Betulkan di Konfigurasi › Penomboran.");
    // ------------------------------------------------ signatures
    case "NOT_SIGNING":
      return w(`Signatures are recorded once the certificate is being signed; it is ${STATUS_WORDS[d.status as CertificateStatus]?.en.toLowerCase() ?? "not"}.`, "Tandatangan direkodkan apabila perakuan sedang ditandatangani.");
    case "UNKNOWN_BLOCK":
      return w("That block is not on the form this certificate is signed on.", "Blok itu tiada pada borang perakuan ini.");
    case "ALREADY_SIGNED":
      return w(`"${s(d.block, "That block")}" is already recorded.`, `"${s(d.block, "Blok itu")}" telah direkodkan.`);
    case "OUT_OF_ORDER":
      return w(`Signatures follow the printed order: "${s(d.first, "an earlier block")}" is recorded before "${s(d.block, "this block")}".`, `Tandatangan mengikut susunan bercetak: "${s(d.first, "blok terdahulu")}" direkodkan sebelum "${s(d.block, "blok ini")}".`);
    case "DELEGABLE_NOT_SET":
      return w(`This certificate was pinned with "${s(d.block, "this block")}" not saying whether a delegate may sign it, so nobody signs it on this certificate. Void it and raise it again on the form as it now stands.`, `Perakuan ini disematkan tanpa keputusan sama ada wakil boleh menandatangani "${s(d.block, "blok ini")}". Batalkan dan bangkitkan semula.`);
    case "DECISION_REQUIRED":
      return w(`"${s(d.block, "This block")}" carries an answer: supported or not supported.`, `"${s(d.block, "Blok ini")}" memerlukan jawapan: disokong atau tidak disokong.`);
    case "DECISION_NOT_ON_BLOCK":
      return w(`"${s(d.block, "This block")}" carries no supported or not-supported answer.`, `"${s(d.block, "Blok ini")}" tiada jawapan disokong atau tidak.`);
    case "CAP_ONLY_WHEN_SUPPORTED":
      return w("A cap goes with a supported answer only.", "Had hanya bersama jawapan disokong.");
    case "CAP_FORMAT":
      return w("Give the cap in ringgit and sen, such as 12,500.00.", "Berikan had dalam ringgit dan sen.");
    case "REFUSAL_NOT_ALLOWED":
      return w(`A refusal to sign is not recorded on "${s(d.block, "this block")}": only a contractor's block the form allows it on.`, `Penolakan menandatangani tidak direkodkan pada "${s(d.block, "blok ini")}".`);
    case "REFUSAL_NOTE_REQUIRED":
      return w("Say what the contractor's refusal was (its letter, or what was said, and when).", "Nyatakan penolakan kontraktor.");
    case "INACTIVE":
      return w(`${s(d.name, "That person")} is not active on record.`, `${s(d.name, "Orang itu")} tidak aktif.`);
    case "SAME_PERSON":
      return w(`${s(d.name, "That person")} has already signed "${s(d.block, "another block")}" on this certificate: one person signs one block.`, `${s(d.name, "Orang itu")} telah menandatangani "${s(d.block, "blok lain")}": seorang menandatangani satu blok.`);
    case "SUPERVISION_NOT_RECORDED": {
      // 6.13 Part A (BD-613-13): the S.O.'s blocks now read the contract's supervision; say which part is missing.
      const who = OFFICE_RULE_WORDS[d.rule as SignatureOfficeRule] ?? w("The contract's supervising officer", "Pegawai penyelia kontrak");
      const how =
        d.rule === "SO_REP"
          ? w("A Principal S.O. Representative signs it once their delegation letter is issued and while it is not revoked: record the delegation under Team.", "Wakil Pegawai Penguasa Utama menandatanganinya setelah surat perwakilannya dikeluarkan dan selagi tidak dibatalkan: rekodkan perwakilan di Pasukan.")
          : d.rule === "RECOMMENDING_OFFICER"
            ? w("Who recommends depends on what the certificate certifies, and this version does not resolve it yet: nobody is assumed.", "Siapa yang mengesyorkan bergantung pada apa yang diperakukan, dan versi ini belum menentukannya: tiada sesiapa diandaikan.")
            : w("The Superintending Officer's appointment is resolved when the contract is executed, or under Team for a contract executed before then.", "Penentuan pelantikan Pegawai Penguasa dibuat semasa kontrak dilaksanakan, atau di Pasukan bagi kontrak yang dilaksanakan sebelum itu.");
      return w(
        `"${s(d.block, "This block")}" is signed by ${who.en.toLowerCase()}, and nobody holds that role on this contract today. ${how.en}`,
        `"${s(d.block, "Blok ini")}" ditandatangani oleh ${who.ms.toLowerCase()}, dan tiada sesiapa memegang peranan itu pada kontrak ini hari ini. ${how.ms}`,
      );
    }
    case "NOT_HOLDER":
      return d.block != null
        ? w(`${s(d.name, "That person")} does not hold the office that signs "${s(d.block, "this block")}" today, nor a delegation of the whole office from someone who does.`, `${s(d.name, "Orang itu")} tidak memegang jawatan yang menandatangani "${s(d.block, "blok ini")}" hari ini, atau perwakilan penuh jawatan itu.`)
        : w(`${s(d.name, "That person")} does not hold ${s(d.office, "the office")} that records this check on that day, nor a delegation of the whole office.`, `${s(d.name, "Orang itu")} tidak memegang ${s(d.office, "jawatan")} yang merekodkan semakan ini pada hari itu.`);
    case "NOT_DELEGABLE":
      return w(`"${s(d.block, "This block")}" is signed by the office itself, never a delegate; ${s(d.name, "that person")} holds a delegation of it.`, `"${s(d.block, "Blok ini")}" ditandatangani oleh pemegang jawatan sendiri, bukan wakil.`);
    case "INSTRUCTION_ONLY":
      return w(`${s(d.name, "That person")}'s delegation gives instruction authority only, and this certificate certifies money, so they do not sign "${s(d.block, "this block")}".`, `Perwakilan ${s(d.name, "orang itu")} hanya bagi arahan, dan perakuan ini memperakui wang.`);
    case "BEFORE_EARLIER":
      return w(`Not before ${day(d.day)}, the day an earlier block was recorded.`, `Tidak sebelum ${day(d.day)}, hari blok terdahulu direkodkan.`);
    case "BEFORE_OPENED":
      return w(`Not before ${day(d.day)}, the day the certificate was opened.`, `Tidak sebelum ${day(d.day)}, hari perakuan dibuka.`);
    case "BEFORE_APPROVED":
      return w(`Not before ${day(d.day)}, the day its approval route was approved.`, `Tidak sebelum ${day(d.day)}, hari laluan kelulusannya diluluskan.`);
    case "NAME_REQUIRED":
      return w(`"${s(d.block, "This block")}" needs the full name of who signed it.`, `"${s(d.block, "Blok ini")}" memerlukan nama penuh penandatangan.`);
    case "IC_FORMAT":
      return w("The identity-card number is not in the shape 000000-00-0000.", "Nombor kad pengenalan tidak berbentuk 000000-00-0000.");
    case "SIGNED_ON_REQUIRED":
      return w("Give the day it was signed on paper.", "Berikan hari ia ditandatangani.");
    case "FUTURE_DATE":
      return w(`Not after today (${day(d.day)} is later).`, `Tidak selepas hari ini.`);
    // ------------------------------------------------ the certificate's date
    case "NOT_DATED":
      return w("The certificate is not dated yet: its date is the day of the authorising signature.", "Perakuan belum bertarikh.");
    case "NOT_EARLIER":
      return w(`A correction moves the date to an earlier day than ${day(d.day)}, never later.`, `Pembetulan memindahkan tarikh ke hari lebih awal daripada ${day(d.day)}.`);
    case "ISSUED_DATE_FINAL":
      return w("The certificate is issued: its date went out in its text and is final. A wrong date is put right by a later certificate.", "Perakuan telah dikeluarkan: tarikhnya keluar bersama teksnya dan muktamad. Tarikh yang salah dibetulkan oleh perakuan kemudian.");
    case "REASON_REQUIRED":
      return w("Give the reason.", "Berikan sebab.");
    // ------------------------------------------------ distribution
    case "CONSULTANT_NOT_ANSWERED":
      return w(`The form sends a copy to ${s(d.recipient, "the consulting engineer")} only where one is engaged, and the contract does not say whether one is. Answer it on the contract, under Formation › Copies and custody.`, `Borang menghantar salinan kepada ${s(d.recipient, "jurutera perunding")} hanya jika dilantik, dan kontrak tidak menyatakannya.`);
    case "NOT_DISTRIBUTED":
      return w(`Not distributed: ${d.count} mandatory ${d.count === 1 ? "copy has" : "copies have"} not gone.`, `Belum diedarkan: ${d.count} salinan wajib belum dihantar.`);
    case "ALREADY_DESPATCHED":
      return w(`That copy went on ${day(d.day)}.`, `Salinan itu dihantar pada ${day(d.day)}.`);
    case "BEFORE_ISSUE":
      return w(`Not before ${day(d.day)}, the day the certificate was issued.`, `Tidak sebelum ${day(d.day)}, hari perakuan dikeluarkan.`);
    case "ACK_BEFORE_DESPATCH":
      return w("A copy is acknowledged only after it has gone: record how and when it went first.", "Salinan diakui hanya selepas dihantar.");
    case "ALREADY_ACKNOWLEDGED":
      return w(`That copy was acknowledged on ${day(d.day)}.`, `Salinan itu diakui pada ${day(d.day)}.`);
    case "BEFORE_DESPATCH":
      return w(`Not before ${day(d.day)}, the day it went.`, `Tidak sebelum ${day(d.day)}, hari ia dihantar.`);
    // ------------------------------------------------ the routing sheet
    case "TYPE_NOT_FOUND":
      return w("That routing sheet type is not configured.", "Jenis helaian penghalaan itu tidak dikonfigurasikan.");
    case "TYPE_RETIRED":
      return w(`The routing sheet type ${s(d.type, "")} is retired. Choose one in force under Configuration › Routing sheets.`, `Jenis helaian ${s(d.type, "")} telah dihentikan.`);
    case "TYPE_OTHER_SUBJECT":
      return w(`The routing sheet type ${s(d.type, "")} is drawn over another kind of route.`, `Jenis helaian ${s(d.type, "")} bagi laluan lain.`);
    case "TYPE_OTHER_KIND":
      return w(`The routing sheet type ${s(d.type, "")} is for another kind of certificate.`, `Jenis helaian ${s(d.type, "")} bagi perakuan jenis lain.`);
    case "SHEET_CLOSED":
      return w("The routing sheet is closed: its checks and the day received are recorded only while the document is on it.", "Helaian penghalaan ditutup: semakan dan hari diterima direkodkan hanya semasa dokumen berada padanya.");
    case "RECEIVED_NOT_RECORDED":
      return w("Record the day the document was received before its checks.", "Rekodkan hari dokumen diterima sebelum semakannya.");
    case "UNKNOWN_CHECK":
      return w("That check is not on this routing sheet.", "Semakan itu tiada pada helaian ini.");
    case "ALREADY_CHECKED":
      return w(`"${s(d.check, "That check")}" is already recorded in this round.`, `"${s(d.check, "Semakan itu")}" telah direkodkan.`);
    case "CHECK_OUT_OF_ORDER":
      return w(`Checks follow the sheet's order: "${s(d.first, "an earlier check")}" is recorded before "${s(d.check, "this check")}".`, `Semakan mengikut susunan helaian: "${s(d.first, "semakan terdahulu")}" dahulu.`);
    case "BEFORE_RECEIVED":
      return w(`Not before ${day(d.day)}, the day this round was received.`, `Tidak sebelum ${day(d.day)}, hari pusingan ini diterima.`);
    case "BEFORE_EARLIER_CHECK":
      return w(`Not before ${day(d.day)}, the day the check before it was recorded.`, `Tidak sebelum ${day(d.day)}.`);
    case "AFTER_CHECKS":
      return w(`The day received is not after ${day(d.day)}, the day the first check was recorded.`, `Hari diterima tidak selepas ${day(d.day)}, hari semakan pertama direkodkan.`);
    case "AFTER_ROUTE_OPENED":
      return w(`The day received is not after ${day(d.day)}, the day its approval route opened: the document is received before it is routed.`, `Hari diterima tidak selepas ${day(d.day)}, hari laluan kelulusannya dibuka.`);
    case "AFTER_DECISION":
      return w(`The day received is not after ${day(d.day)}, the day a decision was recorded on its route.`, `Hari diterima tidak selepas ${day(d.day)}, hari keputusan direkodkan pada laluannya.`);
    case "AWARD_ROUTE_DECIDED":
      return w(`The appointment route is ${d.state === "REJECTED" ? "refused" : "approved"}: the routing sheet records the paper's way to that decision, so nothing more is recorded on it. A resubmitted route opens a new round.`, `Laluan pelantikan telah ${d.state === "REJECTED" ? "ditolak" : "diluluskan"}: helaian penghalaan merekodkan perjalanan kertas hingga keputusan itu, jadi tiada lagi yang direkodkan padanya.`);
    // ------------------------------------------------ opening
    case "NO_BASELINE":
      return w("The contract's baseline has no version in force today, so a certificate has nothing to read. Confirm the baseline on the contract's Baseline tab.", "Garis dasar kontrak tiada versi berkuat kuasa hari ini. Sahkan garis dasar di tab Garis dasar kontrak.");
    case "SECTION_NOT_IN_BASELINE":
      return w("That section is not in the baseline version this certificate reads.", "Seksyen itu tiada dalam versi garis dasar yang dibaca oleh perakuan ini.");
    // ------------------------------------------------ moving the certificate
    case "NOT_DRAFT":
      return w("Only a draft is sent on.", "Hanya draf boleh dihantar.");
    case "NO_ROUTING_TYPE":
      return w("This certificate has no routing sheet: the module that raised it sends it to no approval route. Send it to signing.", "Perakuan ini tiada helaian penghalaan. Hantar untuk ditandatangani.");
    case "ROUTED":
      return w("This certificate goes through its routing sheet first: send it for routing.", "Perakuan ini melalui helaian penghalaannya dahulu.");
    case "ROUTE_NOT_OPENED":
      return w("No approval route is open for this certificate. The module that raised it opens its route on the approval matrix.", "Tiada laluan kelulusan dibuka bagi perakuan ini.");
    case "ROUTE_PENDING":
      return w("Its approval route is still waiting for a decision (Approvals).", "Laluan kelulusannya masih menunggu keputusan.");
    case "ROUTE_REJECTED":
      return w("Its approval route was refused. It goes on only on a resubmitted route, opened by the module that raised it.", "Laluan kelulusannya ditolak.");
    case "CHECKS_OUTSTANDING":
      return w(`The routing sheet's checks are not all recorded in this round: ${s(d.checks, "a check")} ${String(d.checks ?? "").includes(",") ? "are" : "is"} still open.`, `Semakan helaian belum lengkap: ${s(d.checks, "semakan")}.`);
    case "MONEY_NEEDS_APPROVED_ROUTE":
      // 614-C1: a money-bearing kind never reaches signing without an approved route.
      return kindFaultWords(f);
    case "ROUTE_RECALLED":
      return w("Its approval route was recalled before a decision. It goes on only on a new route, opened by the module that raised it.", "Laluan kelulusannya ditarik balik sebelum keputusan. Ia diteruskan hanya pada laluan baharu.");
    case "VOID_REASON_REQUIRED":
      return w("Say why the certificate is void.", "Nyatakan sebab perakuan dibatalkan.");
    case "VOID_ROUTE_PENDING":
      return w("Its approval route is still waiting for a decision. Refuse it on the route first (Approvals), then void the certificate.", "Laluan kelulusannya masih menunggu. Tolak dahulu, kemudian batalkan.");
    case "ISSUED_IS_FINAL":
      return w("An issued certificate is final: it is corrected only by a later certificate.", "Perakuan yang dikeluarkan adalah muktamad.");
    case "VOID_IS_FINAL":
      return w("A void certificate stays as it was.", "Perakuan yang batal kekal.");
    case "NOT_ALLOWED":
      return w("The certificate cannot move there from where it stands.", "Perakuan tidak boleh berpindah ke situ.");
    case "CONTRACT_CANCELLED":
      return w("The contract is cancelled: its certificates are kept as they were.", "Kontrak dibatalkan: perakuannya dikekalkan.");
    default:
      return w("Refused.", "Ditolak.");
  }
}

export const certificateFaultText = (f: Finding): string => certificateFaultWords(f).en;

/// A refusal's words: a lead, then each finding.
export function refusalText(lead: string, fs: readonly Finding[]): string {
  return [lead, ...fs.map(certificateFaultText)].join(" ");
}
