/**
 * The contractor's "Accept the award" card and its questions (Wave V, V4), as the page reads them. Pure: the store gathers the facts and asks these; a component draws what comes back.
 *
 * Three outcomes decide the button. A reason on the organisation's side (its switch unset or off, no class for the returned scans, no time zone, paper already started) means the
 * contractor returns the documents on paper, and the card says only that: the setting is the office's to name, never the contractor's. An account that may not sign for the company
 * gets no button. Otherwise it may accept. A return that waits or was accepted is a state line, and a refused one offers to send again.
 */

import { INSTRUMENT_LABEL, RETURN_SLOT_LABEL } from "@/lib/award/labels";
import type { OnlineReturnState } from "@/lib/award/online-return";
import { RETURN_SCANS } from "@/lib/award/stage-two";
import type { InstrumentKind } from "@/lib/award/types";
import { formatDate } from "@/lib/format";

export type AcceptGate = "OPEN" | "PAPER" | "NOT_SIGNER";

export const PAPER_LINE = "Return the signed documents on paper.";
export const NOT_SIGNER_RULE = "Only someone who may sign for your company can accept the award. The office sets who.";
/// FR-AWD-006: an expired indent is not accepted, online or on paper. The office's next step (a fresh indent) is its own, so the contractor is told only the fact.
export const expiredLine = (day: string): string => `The indent expired on ${formatDate(day)}.`;
export const ACCEPT_INFO = "Your signed scans are the record. Changes go through a variation, not here.";

/// Why the contractor cannot accept online, if it cannot. The switch faults are the organisation's (nobody may), the other two are this contact's own mark.
export function acceptGate(f: { classSet: boolean; today: string | null; paperStarted: boolean; signingFault: string | null }): AcceptGate {
  if (f.signingFault === "PORTAL_SIGNING_NOT_SET" || f.signingFault === "PORTAL_SIGNING_OFF" || !f.classSet || f.today == null || f.paperStarted) return "PAPER";
  return f.signingFault ? "NOT_SIGNER" : "OPEN";
}

/// An issued award with no return waiting and none accepted: what the contractor still has to do. One rule for the card, the project list's chip and the portal home.
/// FR-AWD-006: an expired indent is not to accept (the card's EXPIRED arm); `indentExpired` is the card's reading (`indentState`), so a validity not set is not expired.
export const toAccept = (awardStatus: string, state: OnlineReturnState, indentExpired: boolean): boolean => awardStatus === "ISSUED" && state !== "WAITING" && state !== "VERIFIED" && !indentExpired;

export const commitmentLine = (kind: string | null, no: string | null): string | null => (no ? `${kind === "PURCHASE_ORDER" ? "Purchase order" : kind === "INDENT" ? "Indent" : "Commitment"} ${no}` : null);

export interface Signatory {
  id: string;
  name: string;
  designation: string;
}

/// What the drawer needs. An indent also types its acceptance page; a Letter of Acceptance sends its three scans and nothing else.
export interface AcceptForm {
  scans: { key: string; label: string }[];
  isIndent: boolean;
  signatories: Signatory[];
  defaultSignatoryId: string;
  address: string;
  resend: boolean;
}

export interface AwardQuestion {
  id: string;
  body: string;
  askedOn: string | null;
  answer: string | null;
  answeredOn: string | null;
}

export interface AwardCardView {
  contractId: string;
  instrumentLabel: string;
  title: string;
  issuedOn: string | null;
  commitment: string | null;
  validUntil: string | null;
  state: OnlineReturnState;
  sentOn: string | null;
  acceptedOn: string | null;
  refusedReason: string | null;
  /// Whether the Accept card is drawn at all.
  showAccept: boolean;
  action: "ACCEPT" | "PAPER" | "NOT_SIGNER" | "EXPIRED" | "NONE";
  form: AcceptForm | null;
  /// Asking is open only while the award is issued (WV-7); answers are read in any status.
  mayAsk: boolean;
  queries: AwardQuestion[];
}

export interface AwardCardInput {
  contractId: string;
  awardStatus: string;
  instrument: InstrumentKind;
  issuedOn: string | null;
  commitment: { kind: string | null; number: string | null };
  validUntil: string | null;
  /// A work indent whose validity has passed today (`indentState` EXPIRED). Its expiry day is `validUntil`.
  indentExpired: boolean;
  state: OnlineReturnState;
  sentOn: string | null;
  acceptedOn: string | null;
  refusedReason: string;
  gate: { classSet: boolean; today: string | null; paperStarted: boolean; signingFault: string | null };
  /// The awardee's contacts marked as authorised to sign for the company, and the one signed in.
  signatories: Signatory[];
  signedInContactId: string;
  address: string;
  queries: AwardQuestion[];
}

/// The card's view, or null where there is neither the card nor a question to show.
export function awardCardView(i: AwardCardInput): AwardCardView | null {
  const issued = i.awardStatus === "ISSUED";
  const showAccept = issued || i.state === "VERIFIED";
  if (!showAccept && i.queries.length === 0) return null;
  const open = issued && (i.state === "NONE" || i.state === "REFUSED");
  // FR-AWD-006: an expired indent is taken neither online nor on paper, so it comes before the gate.
  const expired = open && i.instrument === "WORK_INDENT" && i.indentExpired;
  const gate = open && !expired ? acceptGate(i.gate) : null;
  const action = expired ? "EXPIRED" : gate === "OPEN" ? "ACCEPT" : gate === "PAPER" ? "PAPER" : gate === "NOT_SIGNER" ? "NOT_SIGNER" : "NONE";
  const form: AcceptForm | null =
    action === "ACCEPT"
      ? {
          scans: RETURN_SCANS[i.instrument].map((key) => ({ key, label: RETURN_SLOT_LABEL[key] })),
          isIndent: i.instrument === "WORK_INDENT",
          signatories: i.signatories,
          defaultSignatoryId: i.signatories.find((s) => s.id === i.signedInContactId)?.id ?? i.signatories[0]?.id ?? "",
          address: i.address,
          resend: i.state === "REFUSED",
        }
      : null;
  return {
    contractId: i.contractId,
    instrumentLabel: INSTRUMENT_LABEL[i.instrument],
    title: i.state === "VERIFIED" ? "Award accepted" : "Accept the award",
    issuedOn: i.issuedOn,
    commitment: commitmentLine(i.commitment.kind, i.commitment.number),
    validUntil: i.instrument === "WORK_INDENT" ? i.validUntil : null,
    state: i.state,
    sentOn: i.sentOn,
    acceptedOn: i.acceptedOn,
    refusedReason: i.state === "REFUSED" ? i.refusedReason.trim() || null : null,
    showAccept,
    action,
    form,
    mayAsk: issued,
    queries: i.queries,
  };
}
