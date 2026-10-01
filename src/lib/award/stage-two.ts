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
  return kind === "LETTER_OF_ACCEPTANCE" ? !!r.signedLetterReceivedOn : !!r.signatoryName.trim();
}
