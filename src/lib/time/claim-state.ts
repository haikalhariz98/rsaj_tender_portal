/**
 * Where an extension-of-time claim stands, and its one next action (plan closeout-plan.md §3.1, §4.1). Pure: the claim
 * page renders what this says and decides nothing.
 *
 * Recorded → Answered → Has reasons → determined. Not entitled closes the claim (the damages decision may then be
 * recorded). Entitled → Sent → Approved, or Refused (the officer picks where the refusal goes, on the route card) →
 * Certificate raised → Granted once the certificate issues.
 */

import type { CertificateStatus } from "@/lib/certificate/types";

export interface ClaimStateFacts {
  /// The claim's answers are recorded (its pack).
  answered: boolean;
  reasons: number;
  entitlement: "ENTITLED" | "NOT_ENTITLED" | null;
  closed: boolean;
  /// The latest route of its matter, or null where none was opened.
  route: "PENDING" | "APPROVED" | "REJECTED" | "RECALLED" | null;
  /// Its matter's approval of record stands.
  approved: boolean;
  /// Its latest EOT certificate that is not void (its status).
  raised: { status: CertificateStatus } | null;
}

export const EOT_CLAIM_STATES = ["RECORDED", "ANSWERED", "HAS_REASONS", "ENTITLED", "NOT_ENTITLED", "SENT", "REFUSED", "APPROVED", "CERTIFICATE_RAISED", "GRANTED", "CLOSED"] as const;
export type EotClaimState = (typeof EOT_CLAIM_STATES)[number];

export function eotClaimState(f: ClaimStateFacts): EotClaimState {
  if (f.raised?.status === "ISSUED") return "GRANTED";
  if (f.entitlement === "NOT_ENTITLED") return "NOT_ENTITLED";
  if (f.closed) return "CLOSED";
  if (f.raised) return "CERTIFICATE_RAISED";
  if (f.entitlement === "ENTITLED") {
    if (f.approved) return "APPROVED";
    if (f.route === "PENDING") return "SENT";
    if (f.route === "REJECTED" || f.route === "RECALLED") return "REFUSED";
    return "ENTITLED";
  }
  if (f.reasons > 0) return "HAS_REASONS";
  return f.answered ? "ANSWERED" : "RECORDED";
}

export type EotAction = "ANSWER" | "ADD_REASON" | "DETERMINE" | "SEND" | "RAISE_CERTIFICATE" | "OPEN_CERTIFICATE";

/// The claim page's one primary action in each state (none where someone else acts, or nothing is left).
export const EOT_NEXT: Readonly<Record<EotClaimState, EotAction | null>> = {
  RECORDED: "ANSWER",
  ANSWERED: "ADD_REASON",
  HAS_REASONS: "DETERMINE",
  ENTITLED: "SEND",
  NOT_ENTITLED: null,
  SENT: null,
  REFUSED: null,
  APPROVED: "RAISE_CERTIFICATE",
  CERTIFICATE_RAISED: "OPEN_CERTIFICATE",
  GRANTED: null,
  CLOSED: null,
};

export const eotNext = (s: EotClaimState): EotAction | null => EOT_NEXT[s];

export const EOT_STATE_WORDS: Readonly<Record<EotClaimState, string>> = {
  RECORDED: "Recorded",
  ANSWERED: "Answered",
  HAS_REASONS: "Reasons given",
  ENTITLED: "Entitled",
  NOT_ENTITLED: "Not entitled",
  SENT: "Awaiting approval",
  REFUSED: "Refused",
  APPROVED: "Approved",
  CERTIFICATE_RAISED: "Certificate raised",
  GRANTED: "Granted",
  CLOSED: "Closed",
};

/// The badge's tone (none: neutral).
export const EOT_STATE_TONE: Readonly<Record<EotClaimState, "info" | "warn" | "ok" | "err" | null>> = {
  RECORDED: null,
  ANSWERED: null,
  HAS_REASONS: null,
  ENTITLED: "info",
  NOT_ENTITLED: "err",
  SENT: "warn",
  REFUSED: "err",
  APPROVED: "info",
  CERTIFICATE_RAISED: "info",
  GRANTED: "ok",
  CLOSED: null,
};
