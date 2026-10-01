/**
 * Every word the document store puts on a screen, in a response or in a refusal.
 * Codes, purposes, media types and classification values are configuration keys and
 * never reach a screen (AGENTS.md rule 5): each has its label here.
 */

import { formatDate } from "@/lib/format";

import type { OwnerExit, Reliance } from "./attach";
import type { DownloadRefusal } from "./access";
import { isRetentionPeriod, type RetentionState } from "./retention";
import type { AccessKind, AttachmentPurpose, DisposalMethod, DocumentStatus, Finding, RetentionTrigger, ScanState, SecurityClass } from "./types";

/// Said once on every panel and on the drawer (plan §4). Nothing claims "restricted" or "secure".
export const ACCESS_STATEMENT =
  "Stored and listed. Anyone who can reach the portal can open a document that is not SULIT; there is no sign-in to restrict it.";

/// What a fingerprint proves, and what it does not (OD-9).
export const FINGERPRINT_STATEMENT =
  "The fingerprint proves the file matches what was stored. It does not prove the database itself is untouched.";

/// Every version, until scanning is built (OD-4).
export const SCAN_LABEL: Readonly<Record<ScanState, string>> = {
  NOT_SCANNED: "Not scanned for malware — scanning not built",
  CLEAN: "Scanned, nothing found",
  THREAT: "Malware found — not served",
};

/// Who recorded a version: a named Person, on whose behalf it was recorded. Not a signature.
export const RECORDED_ON_BEHALF = "recorded on behalf of, not signed";

export const CLASSIFICATION_LABEL: Readonly<Record<SecurityClass, string>> = { PUBLIC: "Public", INTERNAL: "Internal", SULIT: "SULIT" };
export const classificationLabel = (c: SecurityClass | null | undefined) => (c ? CLASSIFICATION_LABEL[c] : "Not set");

export const STATUS_LABEL: Readonly<Record<DocumentStatus, string>> = { STAGED: "Received, not filed", FILED: "Filed" };

export const PURPOSE_LABEL: Readonly<Record<AttachmentPurpose, string>> = {
  SIGNED_MINUTES: "Signed minutes",
  DOSSIER_EVIDENCE: "Dossier evidence",
  COORDINATION_SCOPE: "Coordination meeting scope document",
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
  SITTING_CANCELLED: "The sitting was cancelled, so nothing is attached to it.",
  EXERCISE_CANCELLED: "The exercise is cancelled, so nothing more is attached to it.",
  ROUTE_OPEN: "The award's appointment route is open and was sent on this evidence. Wait for its decision, or withdraw it, before changing the dossier.",
  AWARD_APPROVED: "An award on this exercise is approved on this evidence. To change the dossier, cancel that award and open another, which is judged afresh.",
  AWARD_NOT_ISSUED: "The awardee's returned documents are attached once the instrument is issued.",
  AWARD_CANCELLED: "The award is cancelled, so nothing more is attached to it.",
  DELEGATION_ENDED: "The delegation has ended, so nothing more is attached to it.",
};

const RELIANCE_TEXT: Readonly<Record<Reliance, string>> = {
  ACCEPTED_ON_IT: "The award was accepted on this scan, so it is not taken off. To correct it, attach a new version, with the reason.",
  GRANTED_ON_IT: "The delegation stands on this recommendation, so it is not taken off. To correct it, attach a new version, with the reason.",
};

export const DOWNLOAD_REFUSAL_TEXT: Readonly<Record<DownloadRefusal, string>> = {
  SULIT: "SULIT documents are listed but not opened in the portal until there is sign-in to say who is reading. The request was refused and logged.",
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

/// Said on a class's classification field once it is set.
export const CLASS_CLASSIFICATION_HINT =
  "Taken by each document when it is filed. SULIT and not set are listed but never opened in the portal. Once set, it is not taken away, and it is not lowered by one person: lowering needs a second approver, which arrives with sign-in.";

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
      return "This file is a ZIP archive or an Office file, which the portal cannot tell apart from its contents. Save it as a PDF and upload that.";
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
    case "OWNER_NOT_READY":
    case "OWNER_FROZEN":
      return EXIT_TEXT[d.exit as OwnerExit] ?? "This record takes no attachments now.";
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
    case "ALREADY_ATTACHED":
      return "That document is already attached here.";
    case "RELIED_ON":
      return RELIANCE_TEXT[d.by as Reliance] ?? "Something was decided on this attachment, so it is not taken off.";
    case "ALREADY_DETACHED":
      return "That attachment has already been taken off.";
    case "NOT_SAME_DOCUMENT":
      return "A new version must be of the same document.";
    case "ALREADY_PINNED":
      return "That version is the one already attached.";
    // classification.ts
    case "UNCHANGED":
      return "That is already its classification.";
    case "CANNOT_UNSET":
      return "A classification, once set, is not taken away. Choose Public, Internal or SULIT.";
    case "DOWNGRADE_FROM_SULIT":
    case "DOWNGRADE_FROM_INTERNAL":
      return `Lowering it${d.from ? ` from ${classificationLabel(d.from as SecurityClass)}` : ""}${d.to ? ` to ${classificationLabel(d.to as SecurityClass)}` : ""} needs a second approver, which arrives with sign-in: no classification is lowered by one person. ${REUPLOAD_EXIT}`;
    case "BELOW_CLASS_CLASSIFICATION":
      return `Its class is now classified ${classificationLabel(d.classification as SecurityClass)}, so it is not set lower than that by one person: that needs a second approver, which arrives with sign-in. Set it to ${classificationLabel(d.classification as SecurityClass)} or higher. ${REUPLOAD_EXIT}`;
    case "CLASS_CLASSIFICATION_UNSET":
      return `A class's classification, once set, is not taken away: documents filed under it took it. Keep it at ${classificationLabel(d.from as SecurityClass)}, or raise it.`;
    case "CLASS_DOWNGRADE":
      return `Lowering a class's classification${d.from ? ` from ${classificationLabel(d.from as SecurityClass)}` : ""}${d.to ? ` to ${classificationLabel(d.to as SecurityClass)}` : ""} needs a second approver, which arrives with sign-in. To file documents at a lower classification, use or add a class classified that way, upload them again under it, then withdraw the old versions, with the reason.`;
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
