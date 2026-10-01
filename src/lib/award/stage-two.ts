/**
 * What the awardee returns (FR-AWD-003, FR-AWD-008, §11.2 Stage Two).
 *
 * A Letter of Acceptance comes back signed, with the signed Surat Akuan Pembida Berjaya
 * and a Surat Pewakilan Kuasa; the return is complete only with all three. An
 * appointment letter comes back with its acceptance page, every field of which is
 * required. `false` for a stamp or a signature is a recorded fault; `null` is not
 * recorded — the two are never read alike.
 */

import type { InstrumentKind } from "./types";

export type ReturnItem = "SIGNED_LETTER" | "DECLARATION" | "AUTHORISATION";

export interface ReturnRecord {
  signedLetterReceivedOn: string | null;
  declarationReceivedOn: string | null;
  authorisationReceivedOn: string | null;
  signatoryName: string;
  icNumber: string;
  occupation: string;
  address: string;
  capacity: string;
  contractorSigned: boolean | null;
  stampAffixed: boolean | null;
  witnessName: string;
  witnessSigned: boolean | null;
}

export const EMPTY_RETURN: ReturnRecord = {
  signedLetterReceivedOn: null,
  declarationReceivedOn: null,
  authorisationReceivedOn: null,
  signatoryName: "",
  icNumber: "",
  occupation: "",
  address: "",
  capacity: "",
  contractorSigned: null,
  stampAffixed: null,
  witnessName: "",
  witnessSigned: null,
};

export function returnState(r: ReturnRecord): { complete: boolean; missing: ReturnItem[] } {
  const missing: ReturnItem[] = [];
  if (!r.signedLetterReceivedOn) missing.push("SIGNED_LETTER");
  if (!r.declarationReceivedOn) missing.push("DECLARATION");
  if (!r.authorisationReceivedOn) missing.push("AUTHORISATION");
  return { complete: missing.length === 0, missing };
}

export type AcceptanceFault =
  | "RECEIVED_ON"
  | "SIGNATORY_NAME"
  | "IC_NUMBER"
  | "OCCUPATION"
  | "ADDRESS"
  | "CAPACITY"
  | "CONTRACTOR_SIGNATURE_NOT_RECORDED"
  | "CONTRACTOR_NOT_SIGNED"
  | "STAMP_NOT_RECORDED"
  | "STAMP_NOT_AFFIXED"
  | "WITNESS_NAME"
  | "WITNESS_SIGNATURE_NOT_RECORDED"
  | "WITNESS_NOT_SIGNED";

/// The acceptance page comes back with the appointment letter; the day it was received
/// is kept where a Letter of Acceptance keeps its signed letter's.
export function acceptancePageFaults(r: ReturnRecord): AcceptanceFault[] {
  const out: AcceptanceFault[] = [];
  if (!r.signedLetterReceivedOn) out.push("RECEIVED_ON");
  if (!r.signatoryName.trim()) out.push("SIGNATORY_NAME");
  if (!r.icNumber.trim()) out.push("IC_NUMBER");
  if (!r.occupation.trim()) out.push("OCCUPATION");
  if (!r.address.trim()) out.push("ADDRESS");
  if (!r.capacity.trim()) out.push("CAPACITY");
  if (r.contractorSigned == null) out.push("CONTRACTOR_SIGNATURE_NOT_RECORDED");
  else if (!r.contractorSigned) out.push("CONTRACTOR_NOT_SIGNED");
  if (r.stampAffixed == null) out.push("STAMP_NOT_RECORDED");
  else if (!r.stampAffixed) out.push("STAMP_NOT_AFFIXED");
  if (!r.witnessName.trim()) out.push("WITNESS_NAME");
  if (r.witnessSigned == null) out.push("WITNESS_SIGNATURE_NOT_RECORDED");
  else if (!r.witnessSigned) out.push("WITNESS_NOT_SIGNED");
  return out;
}

/// Whether the instrument has come back complete: the three documents for a Letter of
/// Acceptance, the acceptance page for an appointment letter.
export function returnComplete(kind: InstrumentKind, r: ReturnRecord): boolean {
  return kind === "LETTER_OF_ACCEPTANCE" ? returnState(r).complete : acceptancePageFaults(r).length === 0;
}

/// Whether the instrument has come back signed at all — the signed letter, or the
/// acceptance page's signatory — which is what ends cancellation (BD-17).
export function instrumentReturned(kind: InstrumentKind, r: { signedLetterReceivedOn: string | Date | null; signatoryName: string } | null): boolean {
  if (!r) return false;
  // An acceptance page is back once its received day or its signatory is recorded.
  return kind === "LETTER_OF_ACCEPTANCE" ? !!r.signedLetterReceivedOn : !!r.signedLetterReceivedOn || !!r.signatoryName.trim();
}

// ------------------------------------------------------------- return scans (OD-5)

/// The scan each returned item is bound to (NFR-SIG-002): one per item of a Letter of
/// Acceptance's return, the acceptance page for an appointment letter.
export type ReturnScan = "SIGNED_LETTER" | "DECLARATION" | "AUTHORISATION" | "ACCEPTANCE_PAGE";

export const RETURN_SCANS: Readonly<Record<InstrumentKind, readonly ReturnScan[]>> = {
  LETTER_OF_ACCEPTANCE: ["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"],
  WORK_INDENT: ["ACCEPTANCE_PAGE"],
};

const ITEM_DAY: Readonly<Record<ReturnItem, "signedLetterReceivedOn" | "declarationReceivedOn" | "authorisationReceivedOn">> = {
  SIGNED_LETTER: "signedLetterReceivedOn",
  DECLARATION: "declarationReceivedOn",
  AUTHORISATION: "authorisationReceivedOn",
};

const ACCEPTANCE_FIELDS: readonly (keyof ReturnRecord)[] = [
  "signedLetterReceivedOn", "signatoryName", "icNumber", "occupation", "address", "capacity", "contractorSigned", "stampAffixed", "witnessName", "witnessSigned",
];

const pageRecorded = (r: ReturnRecord) => ACCEPTANCE_FIELDS.some((k) => r[k] != null && r[k] !== "");

/**
 * Whether return scans are required of this award (OD-5): of every award not ACCEPTED
 * when the document store landed. An award accepted before then has no scan snapshot,
 * and is labelled "accepted before scans were required"; it is never re-judged.
 */
export function scansRequired(status: string, hasScanSnapshot: boolean): boolean {
  return !(status === "ACCEPTED" && !hasScanSnapshot);
}

/// The scans whose paper has not come back, so there is nothing to scan yet.
export function scansAwaitingPaper(kind: InstrumentKind, r: ReturnRecord): ReturnScan[] {
  if (kind === "WORK_INDENT") return pageRecorded(r) ? [] : ["ACCEPTANCE_PAGE"];
  return (Object.keys(ITEM_DAY) as ReturnItem[]).filter((i) => !r[ITEM_DAY[i]]);
}

/// The items recorded as received whose scan is not attached.
export function scansMissing(kind: InstrumentKind, r: ReturnRecord, attached: ReadonlySet<string>): ReturnScan[] {
  if (kind === "WORK_INDENT") return pageRecorded(r) && !attached.has("ACCEPTANCE_PAGE") ? ["ACCEPTANCE_PAGE"] : [];
  return (Object.keys(ITEM_DAY) as ReturnItem[]).filter((i) => !!r[ITEM_DAY[i]] && !attached.has(i));
}

/**
 * Whether the return is complete as it counts (OD-5): every item received, and — where
 * scans are required — each with its scan attached. The paper's received days still
 * decide `instrumentReturned` (BD-17); this decides completeness and acceptance.
 */
export function countedReturnComplete(kind: InstrumentKind, r: ReturnRecord, scans: { required: boolean; attached: ReadonlySet<string> }): boolean {
  if (!returnComplete(kind, r)) return false;
  return !scans.required || scansMissing(kind, r, scans.attached).length === 0;
}

/**
 * A correction to an accepted award's return (BD-24) needs a scan only for the item it
 * corrects: an item whose received day changed (Letter of Acceptance), or the acceptance
 * page if any of its fields changed. Returned: the corrected items with no scan attached.
 */
export function correctionScansMissing(kind: InstrumentKind, before: ReturnRecord, after: ReturnRecord, attached: ReadonlySet<string>): ReturnScan[] {
  if (kind === "WORK_INDENT") {
    const changed = ACCEPTANCE_FIELDS.some((k) => (before[k] ?? "") !== (after[k] ?? ""));
    return changed && pageRecorded(after) && !attached.has("ACCEPTANCE_PAGE") ? ["ACCEPTANCE_PAGE"] : [];
  }
  return (Object.keys(ITEM_DAY) as ReturnItem[]).filter((i) => {
    const k = ITEM_DAY[i];
    return (before[k] ?? null) !== (after[k] ?? null) && !!after[k] && !attached.has(i);
  });
}

/**
 * Whether the return reads as complete today, for the screens and the readiness gate.
 * An accepted award was judged when it was accepted (with its scans, where they were
 * required, kept in its snapshot) and is never re-judged: a scan withdrawn or replaced
 * since does not undo its acceptance. Before acceptance the return counts with its scans.
 */
export function returnReadsComplete(status: string, kind: InstrumentKind, r: ReturnRecord, attached: ReadonlySet<string>): boolean {
  if (status === "ACCEPTED") return returnComplete(kind, r);
  return countedReturnComplete(kind, r, { required: true, attached });
}
