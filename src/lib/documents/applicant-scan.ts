/**
 * RSEC-2 (security audit H3): a file a stranger sent with the public registration (`DocumentVersion.recordedByPortalApplicationId`), opened by staff. Such a file was written by someone
 * not signed in and before any scanner looked at it, so its download takes a fresh scan, judged by the release's own rule (`releaseScanRefusal`): a threat, stored or found now, is
 * refused; a scan that failed is refused; once a scanner is configured, a file it did not check is refused. With no scanner, it is served only after the shared question is answered
 * (the confirming request carries `UNSCANNED_CONFIRM_PARAM`), and it is never shown as clean. Pure, and safe for the browser.
 */

import { releaseScanRefusal, type ReleaseScanRefusal } from "./release-scan";
import type { ScanResult } from "./store/types";
import type { ScanState } from "./types";

/// The query parameter a confirmed download carries.
export const UNSCANNED_CONFIRM_PARAM = "unscanned";
/// The question asked before such a file is opened with no scanner.
export const UNSCANNED_QUESTION = "Not scanned. Sent by someone not signed in.";

export type ApplicantDownloadRefusal = ReleaseScanRefusal | "UNCONFIRMED";

export function applicantDownloadRefusal(i: { stored: ScanState; fresh: ScanResult; scannerConfigured: boolean; confirmed: boolean }): ApplicantDownloadRefusal | null {
  const refused = releaseScanRefusal({ stored: i.stored, fresh: i.fresh, scannerConfigured: i.scannerConfigured });
  if (refused) return refused;
  if (!i.scannerConfigured && !i.confirmed) return "UNCONFIRMED";
  return null;
}

/// Whether a link to the version must ask first: an applicant's file, and nothing scans.
export const asksBeforeOpening = (v: { recordedByPortalApplicationId: string | null }, scannerConfigured: boolean): boolean => v.recordedByPortalApplicationId != null && !scannerConfigured;

/// Why such a download was refused, in words.
export const APPLICANT_DOWNLOAD_REFUSAL_TEXT: Readonly<Record<ApplicantDownloadRefusal, string>> = {
  THREAT: "Malware was found in this file, so it is not opened. The request was refused and logged.",
  SCAN_ERROR: "This file could not be checked for malware, so it is not opened. The request was refused and logged.",
  NOT_SCANNED: "The malware scanner did not check this file, so it is not opened. The request was refused and logged.",
  UNCONFIRMED: `${UNSCANNED_QUESTION} Open it from its page, and confirm.`,
};
