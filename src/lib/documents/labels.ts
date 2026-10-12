/**
 * Every word the document store puts on a screen, in a response or in a refusal.
 * Codes, purposes, media types and classification values are configuration keys and
 * never reach a screen (AGENTS.md rule 5): each has its label here.
 */

import { actStatusFault, actStatusText, type ContractAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import { formatDate } from "@/lib/format";

import type { OwnerExit, Reliance } from "./attach";
import type { DownloadRefusal } from "./access";
import { isRetentionPeriod, type RetentionState } from "./retention";
import type { AccessKind, AttachmentPurpose, DisposalMethod, DocumentStatus, Finding, RetentionTrigger, ScanState, SecurityClass } from "./types";

/// Said once on every panel and on the drawer (plan §4). Nothing claims "restricted" or "secure".
export const ACCESS_STATEMENT =
  "Stored and listed. A document that is not SULIT opens for signed-in staff who can open the record it hangs on; one restricted to its named people reads as not there to anyone else. A SULIT one opens only for the people that record names and the roles the organisation has chosen. Every download, and every refusal, is logged.";

/// What a fingerprint proves, and what it does not (OD-9).
export const FINGERPRINT_STATEMENT =
  "The fingerprint proves the file matches what was stored. It does not prove the database itself is untouched.";

/// Every version, until scanning is built (OD-4).
export const SCAN_LABEL: Readonly<Record<ScanState, string>> = {
  NOT_SCANNED: "Not scanned for malware — scanning not built",
  CLEAN: "Scanned, nothing found",
  THREAT: "Malware found — not served",
};


// Phase 1 carry D6: the attachment components' field hints, here rather than as literals in the components.
// Phase 2b retired ON_BEHALF_HINT: the person who acts is the one signed in, and the shared attribution component (`ActAttributionFields`) says so, with its words in `lib/auth/act-text.ts`.
/// Under a new document's title.
export const DOCUMENT_TITLE_HINT = "What this document is called in lists.";
/// Under a new document's class.
export const DOCUMENT_CLASS_HINT = "Decides its classification and how long it is kept. A SULIT or unclassified document is listed but never opened in the portal.";
/// Under a new document's note.
export const DOCUMENT_NOTE_HINT = "Optional. Anything the next reader should know about this file.";
/// Under "Kept as" when a stored document is attached to a record.
export const ATTACH_PURPOSE_HINT = "Where a purpose is closed, its reason is under it.";

export const CLASSIFICATION_LABEL: Readonly<Record<SecurityClass, string>> = { PUBLIC: "Public", INTERNAL: "Internal", SULIT: "SULIT" };
export const classificationLabel = (c: SecurityClass | null | undefined) => (c ? CLASSIFICATION_LABEL[c] : "Not set");

/// Where a badge stands alone, "Not set" would not say of what: say it.
export const classificationBadge = (c: SecurityClass | null | undefined) => (c ? CLASSIFICATION_LABEL[c] : "Classification not set");

/// A class in a list of choices: its classification, or the words for its absence and what follows from it.
export const classChoiceText = (name: string, c: SecurityClass | null | undefined) =>
  c ? `${name} · ${CLASSIFICATION_LABEL[c]}` : `${name} · classification not set — it will not open in the portal`;

/// "1 event", "2 events": a count is never "1 events".
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/// A reason or a note ends its sentence once: "Rescanned." stays, "Rescanned" gains the stop.
export const endSentence = (s: string) => {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/// A withdrawn version's one line: when, why, and what it still allows. The reason is said here only.
export function withdrawnLine(on: string, reason: string, canStillDownload: boolean): string {
  const why = reason.trim() ? `: ${endSentence(reason)}` : ", with no reason recorded.";
  return `Withdrawn on ${on}${why}${canStillDownload ? " It can still be downloaded." : ""}`;
}

/// Who recorded a version or a document that no officer did: a signed-in supplier uploaded it (Phase 4b). The account is not named here, and never a person's name.
export const SUPPLIER_UPLOADER_WORDS = "The supplier's own portal account";

export const STATUS_LABEL: Readonly<Record<DocumentStatus, string>> = { STAGED: "Received, not filed", FILED: "Filed" };

export const PURPOSE_LABEL: Readonly<Record<AttachmentPurpose, string>> = {
  SIGNED_MINUTES: "Signed minutes",
  SITTING_MINUTES: "Minutes",
  SPEC_PANEL_FORM: "Signed specification panel form",
  BQ_IMPORT_SOURCE: "Imported bill of quantities file",
  TENDER_PART: "Tender document part",
  ADDENDUM_SIGNED: "Signed addendum",
  DOSSIER_EVIDENCE: "Dossier evidence",
  COORDINATION_SCOPE: "Coordination meeting scope document",
  PUBLICATION_PROOF: "Proof of publication",
  ATTENDANCE_SHEET: "Signed attendance sheet",
  WITHDRAWAL_LETTER: "Bidder's withdrawal letter",
  VALIDITY_CONSENT: "Tenderer's consent to extend validity",
  SIGNED_SCHEDULE: "Signed opening schedule",
  CPR_REPORT: "Contractor performance report",
  COMMUNICATION: "Written communication with the tenderer",
  MEETING_MINUTES: "Signed meeting minutes",
  TENDERER_CONFIRMATION: "Tenderer's written confirmation",
  REPORT_DRAWINGS: "Drawings for the evaluation report",
  SIGNED_REPORT: "Signed evaluation report",
  SIGNED_PROPOSAL_PAPER: "Signed Kertas Cadangan",
  SUPPLIER_DOCUMENT: "Scan of the supplier's document",
  SUPPLIER_DECLARATION: "Supplier's signed declaration",
  SUPPLIER_EPAYMENT_FORM: "Supplier's E-Payment form",
  COMPANY_RESOLUTION: "Contractor's company resolution",
  LEGAL_SUBMISSION: "Sent for legal review",
  LEGAL_COMMENTS: "Legal office's comments",
  RECONCILIATION: "Signed reconciliation record",
  SIGNED_CONTRACT: "Signed Contract Document",
  STAMPING_CERTIFICATE: "Stamping certificate",
  PIPE_LOG: "Pipe log",
  AS_BUILT: "As-built drawings",
  PROGRAMME: "Work programme as submitted",
  DIARY_PHOTO: "Site diary photograph",
  INSTRUCTION_SKETCH: "Plan or sketch for the S.O.'s instruction",
  REGISTRATION_CANCELLATION_NOTICE: "Registration body's notice of cancellation",
  DELAY_NOTICE: "Notice of delay (or the S.O.'s direction)",
  METEOROLOGICAL_RECORD: "Meteorological records",
  EOT_CALCULATION: "How the proposed period was calculated",
  SUPPLIER_DRAFT_DOCUMENT: "Certificate uploaded by the supplier",
  SUPPLIER_BANK_STATEMENT: "Bank statement uploaded by the supplier",
  HOLDER_RECOMMENDATION: "Absent holder's signed recommendation",
  SIGNED_LETTER: "Signed letter of acceptance",
  DECLARATION: "Signed successful bidder declaration",
  AUTHORISATION: "Letter of authorisation",
  ACCEPTANCE_PAGE: "Signed acceptance page",
};

export const ACCESS_KIND_LABEL: Readonly<Record<AccessKind, string>> = {
  DOWNLOADED: "Downloaded",
  REFUSED: "Refused",
  VERIFIED: "Fingerprint verified",
  INTEGRITY_FAILED: "Fingerprint did not match",
};

export const RETENTION_TRIGGER_LABEL: Readonly<Record<RetentionTrigger, string>> = {
  RECEIVED: "From the day it was received",
  OWNER_CLOSED: "From the day the record it belongs to closed",
  CONTRACT_FINAL_ACCOUNT: "From the contract's final account",
};

export const DISPOSAL_METHOD_LABEL: Readonly<Record<DisposalMethod, string>> = {
  DESTROY: "Destroy",
  TRANSFER_TO_ARCHIVES: "Transfer to the archives",
  REVIEW: "Review before deciding",
};

export const MEDIA_LABEL: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/tiff": "TIFF image",
  "text/csv": "CSV file",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel workbook (.xlsx)",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document (.docx)",
  // Declared types only (what a browser may send), so a refusal names what was declared.
  "text/plain": "plain text file",
  "application/vnd.ms-excel": "Excel file",
  "application/zip": "ZIP archive or Office file",
  "text/html": "web page",
  "image/svg+xml": "SVG drawing",
};
export const mediaLabel = (t: string | null | undefined) => (t ? (MEDIA_LABEL[t] ?? "a type the portal does not recognise") : "a type the portal does not recognise");

/// 1,234 bytes · 12.3 KB · 4.5 MB — binary multiples, one decimal.
export function formatBytes(n: bigint | number | string): string {
  const b = typeof n === "bigint" ? n : BigInt(String(n));
  if (b < 1024n) return `${b.toLocaleString("en-GB")} bytes`;
  const units = ["KB", "MB", "GB"];
  let unit = -1;
  let whole = b;
  let tenths = 0n;
  while (whole >= 1024n && unit < units.length - 1) {
    tenths = ((whole % 1024n) * 10n) / 1024n;
    whole = whole / 1024n;
    unit++;
  }
  return `${whole.toLocaleString("en-GB")}${tenths ? `.${tenths}` : ""} ${units[unit]}`;
}

/// The first and last few characters of a fingerprint, for a list. The full one is on the drawer.
export const shortFingerprint = (sha256: string) => (sha256.length > 16 ? `${sha256.slice(0, 8)}…${sha256.slice(-4)}` : sha256);

export const EXIT_TEXT: Readonly<Record<OwnerExit, string>> = {
  MINUTE_FIRST: "The signed minutes are attached once the sitting is minuted.",
  START_FIRST: "The minutes are uploaded once the sitting has started.",
  SITTING_CANCELLED: "The sitting was cancelled, so nothing is attached to it.",
  EXERCISE_CANCELLED: "The exercise is cancelled, so nothing more is attached to it.",
  ROUTE_OPEN: "The award's appointment route is open and was sent on this evidence. Wait for its decision, or withdraw it, before changing the dossier.",
  AWARD_APPROVED: "An award on this exercise is approved on this evidence. To change the dossier, cancel that award and open another, which is judged afresh.",
  AWARD_NOT_ISSUED: "The awardee's returned documents are attached once the instrument is issued.",
  AWARD_CANCELLED: "The award is cancelled, so nothing more is attached to it.",
  DELEGATION_ENDED: "The delegation has ended, so nothing more is attached to it.",
  DELEGATION_ZONE_UNSET: "The organisation's time zone is not set, so today cannot be told and whether the delegation has ended cannot be judged. Set it under Configuration › Organisation, then attach or change its documents.",
  BQ_FINALISED: "This version of the bill is finalised and keeps the file it was imported from. To import another, start a revision of the bill.",
  PANEL_NOT_USED: "This exercise does not use a specification panel, so nothing is attached to one.",
  BILL_NOT_ON_SCREEN: "This exercise does not build its bill of quantities on screen. The bill is a file under Tender documents.",
  SWITCH_NOT_SET: "Whether this exercise uses a specification panel, and whether it builds its bill on screen, is not set. Take the organisation's setting under Scope and estimate, Scope, first.",
  PACK_FROZEN: "The tender documents were submitted on this and stand as they were frozen. A change waits until they are returned for amendment, and is made then (a pack's part on its next version); after approval for tendering a change is an addendum, issued under Publishing on Tender documents.",
  NOT_APPROVED_FOR_TENDERING: "A publication's proof is attached once the exercise is approved for tendering, when it can be published.",
  WINDOW_NOT_PUBLISHED: "An attendance sheet is attached once the exercise is advertised or invited and the event is held.",
  ADDENDUM_ISSUED: "The addendum is issued on this signed copy and stands as issued. A further change is another addendum.",
  ADDENDUM_VOID: "The addendum was voided before it was issued, so nothing more is attached to it.",
  EXTENSION_APPLIED: "The extension was applied on this consent and stands as applied. A further extension is recorded as another one.",
  OPENING_NOT_FINALISED: "The signed schedule carries the company estimate's row, so its scan is attached only once the opening is finalised and the estimate disclosed.",
  EVALUATION_CLOSED: "This evaluation version was superseded or closed, so it keeps what it has. Attach to the version in force, on the Evaluation tab.",
  REPORT_ISSUED: "The report was issued listing the drawings attached then, and stands as issued. A change is made in a new evaluation version.",
  REPORT_NOT_ISSUED: "The signed report is attached once the report is issued, on the Evaluation tab.",
  PROPOSAL_NOT_SIGNED: "The signed Kertas Cadangan is attached once its checking and recommending officers are both recorded, on the Evaluation tab.",
  MEETING_CLOSED: "The meeting was closed on its minutes and the tenderer's confirmation, and stands as closed. A further meeting is recorded as another round.",
  DOCUMENT_RENEWED: "This document has been renewed, so it keeps the scan it was lodged with. Attach the renewal's scan to the renewal, on the supplier's Documents tab.",
  APPLICATION_DECIDED: "The application is decided and stands on what it was decided on. A further application is opened on the supplier's Applications tab.",
  CONTRACT_CANCELLED: "The contract was cancelled with its award and keeps what it has.",
  CONTRACT_NOT_IN_PREPARATION: "Nothing is kept on the contract until its preparation starts, on the contract's Formation tab.",
  LEGAL_REVIEW_PENDING: "The contract is with the legal office on what was sent. If it comes back for amendment, attach the amended papers then.",
  LEGALLY_ENDORSED: "The legal office endorsed the contract on what was sent, which is kept as it was.",
  LEGAL_NOT_SUBMITTED: "The legal office's comments are kept once the contract has been sent for review.",
  CONTRACT_NOT_EXECUTED: "This is kept once the contract is executed, by the RSAJ signature on the Formation tab.",
  POSSESSION_NOT_RECORDED: "This is kept from possession of site, recorded on the contract's Site tab.",
  // BD-613-115: said by exitWords in the table's words; this is only the fallback where the state is not carried.
  CONTRACT_STATE: "Not kept where the contract now stands.",
  CONTRACT_EXECUTED: "The contract is executed and keeps what it was executed on.",
  INSTRUCTION_VOID: "The instruction is void and keeps what it has.",
  VARIATION_CLOSED: "The variation is closed and its instruction keeps what it has.",
  CANCELLATION_WITHDRAWN: "The cancellation was withdrawn as recorded in error and keeps what it has.",
  EOT_CLAIM_DETERMINED: "The extension-of-time claim is determined (or closed) and keeps what it was determined with.",
  EOT_NOT_WEATHER: "Meteorological records are kept only on a weather claim.",
};

/**
 * A refused owner state in words. BD-613-115: where a contract's ACT_STATUS row refused, the table's own words
 * (actStatusText), so the attach screen, the owner page and the store's refusal say what every other act says.
 */
export function exitWords(x: { exit: OwnerExit; act?: ContractAct; status?: ContractStatus }): string {
  if ((x.exit === "CONTRACT_STATE" || x.exit === "CONTRACT_NOT_EXECUTED") && x.act && x.status) {
    const f = actStatusFault(x.act, x.status);
    if (f) return actStatusText(f);
  }
  return EXIT_TEXT[x.exit] ?? "This record takes no attachments now.";
}

const RELIANCE_TEXT: Readonly<Record<Reliance, string>> = {
  ACCEPTED_ON_IT: "The award was accepted on this scan, so it is not taken off. To correct it, attach a new version, with the reason.",
  GRANTED_ON_IT: "The delegation stands on this recommendation, so it is not taken off. To correct it, attach a new version, with the reason.",
  VERIFIED_ON_IT: "The specification panel was verified on this scan, so it is not taken off. To correct it, attach a new version, with the reason. Nobody verified the panel on the new version, so the panel then needs to be verified again.",
  IMPORTED_FROM_IT: "Lines of the bill were imported from this file, so it is not taken off. To correct the bill, import the corrected file into the draft, replacing its lines: the new file then takes this one's place.",
  WITHDRAWN_ON_IT: "The withdrawal was recorded on this letter, so it is not taken off. To correct it, attach a new version, with the reason.",
  SCHEDULE_ON_IT: "Evaluation and the award stand on this signed schedule, so it is not taken off. To correct it, attach a new version, with the reason.",
  CPR_ON_IT: "The contractor performance percentage was entered from this report, so it is not taken off. To correct it, attach a new version, with the reason.",
  DOCUMENT_VERIFIED_ON_IT: "The document was verified on this scan, so it is not taken off. To correct it, attach a new version, with the reason.",
  SENT_ON_IT: "The application was sent for decision on this signed declaration, so it is not taken off. To correct it, attach a new version, with the reason.",
  RESOLUTION_ON_IT: "The contractor's signature was recorded on this company resolution, so it is not taken off. To correct it, attach a new version, with the reason.",
  RETURNED_ON_IT: "The legal office's return was recorded on these comments, so they are not taken off. To correct them, attach a new version, with the reason.",
};

export const DOWNLOAD_REFUSAL_TEXT: Readonly<Record<DownloadRefusal, string>> = {
  SULIT: "This document is SULIT. It is opened only by the people the record it hangs on names and the roles the organisation has chosen, and you are not among them. The request was refused and logged.",
  UNCLASSIFIED: "This document's classification is not set, so it is not opened in the portal. Set its classification first. The request was refused and logged.",
  THREAT: "Malware was found in this file, so it is not opened. The request was refused and logged.",
};

/// Why an access event was logged, in words. The stored reason is a code (a refusal's finding
/// or a download decision's); it never reaches a screen.
export function accessReasonText(code: string): string | null {
  if (!code) return null;
  if (code === "SULIT" || code === "UNCLASSIFIED" || code === "THREAT") return DOWNLOAD_REFUSAL_TEXT[code].replace(/ The request was refused and logged\.$/, "");
  if (code === "DIGEST_MISMATCH") return "The stored file did not hash to its fingerprint.";
  if (code === "BYTES_MISSING") return "The stored file could not be found.";
  return documentFaultText({ code, level: "block" });
}

/// Said on the withdraw form (BD-DS-18): withdrawal marks a version, it does not close access.
export const WITHDRAW_NOTE =
  "Withdrawing marks this version as withdrawn, with your reason, and keeps the file. It does NOT stop the file being downloaded. To stop downloads, set the document's classification to SULIT.";

/// Said on the detach form: what taking a document off a record does and does not do.
export const DETACH_NOTE =
  "This takes the document off this record only. The file and every version stay stored and listed, and the record shows it was taken off, when and why.";

/// Said on the classification form: what recording one does.
export const RECLASSIFY_NOTE =
  "Setting a classification, or raising it, is recorded with your reason. Raising it to SULIT stops the document being opened in the portal. No classification is lowered by one person, and a set one is never taken away.";

/// The way out of a refused lowering (BD-DS-11 as ruled): never a second person faked.
export const REUPLOAD_EXIT =
  "If it belongs at a lower classification, upload it again as a new document under the right class, then withdraw the old version, with the reason.";

/// Said on the form that lowers a classification (Phase 5a, ADR 0034 D15): lowering is proposed by one person and decided by another.
export const LOWER_NOTE =
  "Lowering a classification can release a document to a wider readership, so it is not done by one person. It is proposed here, with your reason, and a second person who holds the permission to decide corrections applies it, under Configuration, Changes waiting. Nothing changes until then.";

/// Said on a class's classification field once it is set.
export const CLASS_CLASSIFICATION_HINT =
  "Taken by each document when it is filed. SULIT and not set are listed but never opened in the portal. Once set, it is not taken away, and it is not lowered by one person: lowering is proposed on its own form and decided by a second person.";

/// A classification choice as a form lists it: its label, and where it is not offered, why.
export function classificationChoiceText(c: { value: SecurityClass | null; allowed: boolean; refusal: Finding | null }): string {
  const label = classificationLabel(c.value);
  if (c.allowed || !c.refusal) return label;
  switch (c.refusal.code) {
    case "UNCHANGED":
      return `${label} — its classification now`;
    case "CANNOT_UNSET":
    case "CLASS_CLASSIFICATION_UNSET":
      return `${label} — a set classification is not taken away`;
    case "BELOW_CLASS_CLASSIFICATION":
      return `${label} — below its class's classification, needs a second approver`;
    default:
      return `${label} — lowering needs a second approver`;
  }
}

/// Said on the new-version form: the new version moves the pin, the old one stays.
export const NEW_VERSION_NOTE =
  "Upload the corrected file. This record then points at the new version; the old version stays stored and the change is recorded with your reason.";

/// Why a staff upload of an Office file (a ZIP the portal tried to read as a workbook or Word document) was refused, and what to do instead (ruling 12a). The supplier portal takes no Office file at all and says so in its own words.
export function officeRefusalText(reason: string): string {
  const instead = "Save it again as a plain .xlsx or .docx, or as a PDF, and upload that.";
  switch (reason) {
    case "MACRO":
      return `This file holds macros (it is macro-enabled, or lists a macro project), which the portal does not accept. ${instead} Remove the macros first.`;
    case "ENCRYPTED":
      return `This file is password-protected, so the portal cannot read it. Remove the password, then save it again as a plain .xlsx or .docx, or as a PDF, and upload that.`;
    case "ACTIVE_CONTENT":
      return `This file holds ActiveX controls or embedded objects, which the portal does not accept. Pictures are fine. Remove the controls or objects, then ${instead.charAt(0).toLowerCase()}${instead.slice(1)}`;
    case "EXTERNAL_TEMPLATE":
      return `This Word document is attached to a template, which Word can load from outside the file, so the portal does not accept it. Copy its text into a new document, or save it as a PDF, and upload that.`;
    default:
      return `This file is not readable as a workbook (.xlsx) or a Word document (.docx): it is another kind of archive, or damaged, or built in a way the portal cannot check. ${instead}`;
  }
}

/// The text for any finding this module's rules, the store and the route handlers return.
export function documentFaultText(f: Finding): string {
  const d = f.data ?? {};
  switch (f.code) {
    // media.ts
    case "TYPES_NOT_SET":
      return "No file types are allowed yet. Set the allowed types under Configuration, Documents, Upload rules.";
    case "TYPE_NOT_RECOGNISED":
      return "The portal cannot tell what this file is from its contents. Upload it as a PDF, or as a PNG, JPEG or TIFF image.";
    case "ARCHIVE_NOT_ACCEPTED":
      return "This file is a ZIP archive, which the portal does not accept. Save it as a PDF and upload that.";
    case "OFFICE_FILE_REFUSED":
      return officeRefusalText(String(d.reason));
    case "MARKUP_NEVER_ACCEPTED":
      return "Web pages and SVG drawings are never accepted. Save it as a PDF and upload that.";
    case "TYPE_NOT_ALLOWED":
      return `This file is ${withArticle(mediaLabel(String(d.sniffed)))}, which the organisation's upload rules do not allow. The allowed types are set under Configuration, Documents, Upload rules.`;
    case "NAME_WITHOUT_TYPE":
      return `The file's contents are ${withArticle(mediaLabel(String(d.sniffed)))}, but its name does not say so. Rename it with the matching extension and upload it again.`;
    case "DECLARED_TYPE_MISMATCH":
      return `The file's contents are ${withArticle(mediaLabel(String(d.sniffed)))}, but it was sent as ${withArticle(mediaLabel(String(d.declared)))}. It was not stored. Check it is the file you meant, and give it its right name.`;
    // limits.ts
    case "SIZE_NOT_SET":
      return "No largest file size is set, so nothing is accepted. Set it under Configuration, Documents, Upload rules.";
    case "CEILING_NOT_SET":
      return "The deployment's largest upload (DOCUMENT_MAX_BYTES) is not set, so nothing is accepted. Whoever runs the portal sets it.";
    case "CEILING_INVALID":
      return "The deployment's largest upload (DOCUMENT_MAX_BYTES) is not a whole number of bytes. Whoever runs the portal corrects it.";
    case "EMPTY":
      return "The file is empty.";
    case "TOO_LARGE":
      return d.cap ? `The file is larger than the ${formatBytes(String(d.cap))} allowed${d.from === "CEILING" ? " by this deployment" : ""}. It was not stored.` : "The file is larger than allowed. It was not stored.";
    case "NAME_TOO_LONG":
      return `The file's name is ${d.length ?? "more"} characters long, and a name may have at most ${d.max ?? 255}. It was not stored. Rename the file with a shorter name and upload it again.`;
    // concurrency.ts
    case "BUSY":
      return "The portal is busy with other files. Nothing was stored or logged. Wait a few seconds and try again.";
    // request-guard.ts
    case "NOT_SAME_ORIGIN":
    case "UPLOAD_HEADER_MISSING":
      return "This upload did not come from the portal's own page, so it was refused. Open the portal, and upload from its screen.";
    case "LENGTH_INVALID":
      return "The upload's declared length is not a number. It was not read.";
    // versioning.ts
    case "IDENTICAL_TO_VERSION_N":
      return `This file is identical to version ${d.n}. Nothing was added.`;
    case "DOCUMENT_WITHDRAWN":
      return "Every version of this document is withdrawn, so it takes no more. Upload the file as a new document.";
    case "ALREADY_WITHDRAWN":
      return "This version is already withdrawn.";
    // received.ts
    case "RECEIVED_ON_INVALID":
      return "The received day is not a date.";
    case "TIME_ZONE_UNSET":
      return "Set the organisation's time zone under Configuration, Organisation before typing a received day: it is judged against today, which is not assumed to be UTC. Or leave the day blank.";
    case "RECEIVED_ON_FUTURE":
      return "The received day cannot be after today.";
    // attach.ts
    case "PURPOSE_NOT_FOR_OWNER":
      return `${PURPOSE_LABEL[d.purpose as AttachmentPurpose] ?? "That kind of document"} does not belong on this record.`;
    case "PURPOSE_NOT_FOR_METHOD": {
      const what = PURPOSE_LABEL[d.purpose as AttachmentPurpose] ?? "That kind of document";
      if (d.reason === "METHOD_NOT_CONFIGURED")
        return `${what} is not kept on this exercise: its sourcing method is no longer configured, so it keeps no document. Configure the method under Configuration, Reference data, or attach the document to another record.`;
      const why = d.purpose === "DOSSIER_EVIDENCE" ? "does not keep a justification dossier" : d.purpose === "COORDINATION_SCOPE" ? "does not record a coordination meeting" : "does not ask for it";
      return `${what} is not kept on this exercise: its sourcing method ${why}. Attach it to an exercise whose method asks for it, or, while the exercise is a draft, change its method.`;
    }
    case "OWNER_NOT_READY":
    case "OWNER_FROZEN":
      return exitWords({ exit: d.exit as OwnerExit, act: d.act as ContractAct | undefined, status: d.status as ContractStatus | undefined });
    case "VERSION_WITHDRAWN":
      return "That version is withdrawn, so it is not attached. Attach a version that stands.";
    case "CLASS_NOT_SET":
      return "Choose the document's class. If none is offered, add one under Configuration, Documents.";
    case "CLASSES_NOT_CONFIGURED":
      return "No document classes are configured, so nothing can be filed. Add one under Configuration, Documents.";
    case "CLASS_UNKNOWN":
      return "That document class is not configured. Choose one from the list.";
    case "CLASSIFICATION_NOT_SET":
      return "This document's classification is not set, so it is listed but not opened in the portal. Set it on the document, or on its class under Configuration, Documents.";
    case "CLASSIFICATION_BELOW_PURPOSE":
      return `${PURPOSE_LABEL[d.purpose as AttachmentPurpose] ?? "That kind of document"} is kept ${classificationLabel(d.required as SecurityClass)}, and this document is ${d.classification ? classificationLabel(d.classification as SecurityClass) : "not classified"}. Raise its classification to ${classificationLabel(d.required as SecurityClass)} on the document, or upload it again under a class classified ${classificationLabel(d.required as SecurityClass)}.`;
    case "ALREADY_ATTACHED":
      return "That document is already attached here.";
    case "BILL_IS_ONE_FILE":
      return "The bill of quantities is one file, and one is already uploaded. Use Replace to put a corrected file in its place.";
    case "ATTACHED_BY_OWNER_ACT":
      return `${PURPOSE_LABEL[d.purpose as AttachmentPurpose] ?? "That kind of document"} is attached by importing it on the bill of quantities, which reads it in the same step. Import it there.`;
    case "RELIED_ON":
      return RELIANCE_TEXT[d.by as Reliance] ?? "Something was decided on this attachment, so it is not taken off.";
    case "ALREADY_DETACHED":
      return "That attachment has already been taken off.";
    case "NOT_SAME_DOCUMENT":
      return "A new version must be of the same document.";
    case "ALREADY_PINNED":
      return "That version is the one already attached.";
    // classification.ts
    case "NOT_A_LOWERING":
      return "This form lowers a classification. To set or raise one, use the classification form.";
    case "UNCHANGED":
      return "That is already its classification.";
    case "CANNOT_UNSET":
      return "A classification, once set, is not taken away. Choose Public, Internal or SULIT.";
    case "DOWNGRADE_FROM_SULIT":
    case "DOWNGRADE_FROM_INTERNAL":
      return `Lowering it${d.from ? ` from ${classificationLabel(d.from as SecurityClass)}` : ""}${d.to ? ` to ${classificationLabel(d.to as SecurityClass)}` : ""} is not done by one person: it is proposed with “Lower the classification” and decided by a second person. ${REUPLOAD_EXIT}`;
    case "BELOW_CLASS_CLASSIFICATION":
      return `Its class is now classified ${classificationLabel(d.classification as SecurityClass)}, so it is not set lower than that by one person: that is proposed with “Lower the classification” and decided by a second person. Set it to ${classificationLabel(d.classification as SecurityClass)} or higher. ${REUPLOAD_EXIT}`;
    case "CLASS_CLASSIFICATION_UNSET":
      return `A class's classification, once set, is not taken away: documents filed under it took it. Keep it at ${classificationLabel(d.from as SecurityClass)}, or raise it.`;
    case "CLASS_DOWNGRADE":
      return `Lowering a class's classification${d.from ? ` from ${classificationLabel(d.from as SecurityClass)}` : ""}${d.to ? ` to ${classificationLabel(d.to as SecurityClass)}` : ""} is not done by one person: it is proposed with “Lower the classification” and decided by a second person. To file documents at a lower classification, use or add a class classified that way, upload them again under it, then withdraw the old versions, with the reason.`;
    // hold.ts
    case "ALREADY_ON_HOLD":
      return "A legal hold already stands on this document. Release it first to record a different reason.";
    case "NOT_ON_HOLD":
      return "No legal hold stands on this document.";
    // retention.ts
    case "RETENTION_NOT_SET":
      return "Its retention is not set, so it is never disposed of. Set the period and what starts it on the class.";
    case "RETENTION_PERIOD_INVALID":
      return `Its retention period of ${d.months} months is not a period, so it is never disposed of. A period is at least one month: correct it on the class.`;
    case "TRIGGER_NOT_REACHED":
      return "What starts its retention has not happened yet.";
    case "RETENTION_RUNNING":
      return `It is retained until ${formatDate(String(d.until))}.`;
    case "ON_LEGAL_HOLD":
      return "A legal hold stands on it.";
    case "OBLIGATION_OUTSTANDING":
      return `${d.obligation} is still outstanding on the record it belongs to.`;
    case "DISPOSAL_METHOD_NOT_SET":
      return "How it is disposed of is not set on its class.";
    case "DISPOSAL_AUTHORITY_NOT_SET":
      return "Whose authority a disposal needs is not set on its class.";
    // policy.ts
    case "TYPE_NOT_RECOGNISABLE":
      return "Only types the portal can recognise from a file's contents may be allowed: PDF, PNG, JPEG and TIFF.";
    case "SIZE_INVALID":
      return "The largest file size must be a whole number of bytes above zero.";
    // the upload and the acts
    case "NO_ORGANISATION":
      return "No organisation is configured. Run npm run setup first.";
    case "NO_FILE":
      return "Choose a file to upload.";
    case "TITLE_REQUIRED":
      return "Give the document a title.";
    case "PERSON_REQUIRED":
      return "Name who is recording it.";
    case "PERSON_UNKNOWN":
      return "Choose someone on record and active.";
    case "DOCUMENT_UNKNOWN":
      return "That document no longer exists.";
    case "VERSION_UNKNOWN":
      return "That version no longer exists.";
    case "REQUEST_UNREADABLE":
      return "The upload could not be read. Try again.";
    case "DRIVER_UNKNOWN":
      return "The deployment's document store driver (DOCUMENT_STORE_DRIVER) is not one the portal has. Whoever runs the portal corrects it.";
    case "DRIVER_NOT_BUILT":
      return "The deployment's document store driver (DOCUMENT_STORE_DRIVER) is not built yet. Whoever runs the portal sets it to postgres.";
    case "REASON_REQUIRED":
      return "Give the reason.";
    default:
      return "This was refused.";
  }
}

function withArticle(label: string): string {
  return /^[AEIOU]/.test(label) ? `an ${label}` : `a ${label}`;
}

/// A class's or snapshot's retention period: "Not set" only for null; a period that is
/// not one (zero, from a snapshot taken before the CHECK) says so, never "Not set".
export function retentionPeriodText(months: number | null | undefined): string {
  if (months == null) return "Not set";
  return isRetentionPeriod(months) ? `${months} month${months === 1 ? "" : "s"}` : `Not a period (${months} months)`;
}

/// The retention line on a document: "Not set", "Starts when …", "Retained until …", "Elapsed on …".
export function retentionText(s: RetentionState, trigger?: RetentionTrigger | null): string {
  switch (s.state) {
    case "NOT_SET":
      return "Not set";
    case "PERIOD_INVALID":
      return `Not a period (${s.months} months): never disposed of until it is corrected on the class`;
    case "TRIGGER_NOT_REACHED":
      return `Not started: ${RETENTION_TRIGGER_LABEL[trigger ?? s.trigger].replace(/^From/, "runs from").toLowerCase()}`;
    case "RUNNING":
      return `Retained until ${formatDate(s.elapsesOn)}`;
    case "ELAPSED":
      return `Retention elapsed on ${formatDate(s.elapsedOn)} — nothing is disposed of by the portal`;
  }
}
