/**
 * FR-OPN-003, 004 (C-2, OD-1 A, OD-11): authorising the opening. Each authorisation is one panel
 * member's own act, stamped by the server and signed with their own password in their own sign-in (since Phase 3d it is never keyed from a member's paper by
 * another officer; rows recorded that way before still count, and `SAME_HAND` still reads them); the second distinct
 * present member's authorisation opens the box (the unseal) — or, at a resumed sitting, lets the
 * sitting record again. The server clock must be after the closing, to the second: at the closing
 * second itself the box is refused (a bid recorded in that second is in time, FR-BID-002, BD-66-3,
 * `closing-instant.test.ts`), and from the next second it may be opened. The main opening also needs
 * the box's LOCKED event (6.6). Pure.
 */

import { isLate } from "@/lib/bids/lateness";

import { PAPER_AUTHORISATIONS, sittingAuthorisers, type AuthorisationFacts, type OpeningState, type PanelMemberFacts } from "./state";
import type { Finding } from "./types";

export type AuthorisationFault = "CANCELLED" | "FINALISED" | "ADJOURNED" | "ALREADY_AUTHORISED" | "SITTING_AUTHORISED" | "NOT_ON_PANEL" | "ABSENT" | "AT_OR_BEFORE_CLOSING" | "CLOSING_NOT_SET" | "BOX_NOT_LOCKED" | "SAME_HAND";

export function authorisationFaults(i: {
  state: OpeningState;
  panel: readonly PanelMemberFacts[];
  auths: readonly AuthorisationFacts[];
  personId: string;
  /// The signed-in officer who is keying this authorisation from the member's paper, where it is recorded for them; null where the member signs in their own session.
  recorderId: string | null;
  /// The server's stamp, read at the act's entry, to the second (6.6 CR-3).
  now: Date;
  closing: Date | null;
  /// MAIN: a LOCKED box event at or after the closing. A supplementary opening opens an envelope held by an officer.
  boxLocked: boolean;
  /// ONLINE (ADR 0036 D10, ruling 20k): there is no box, so `BOX_NOT_LOCKED` does not apply, and every named officer authorises (`required` is the roster's n). Paper: false, and two.
  online?: boolean;
  required?: number;
}): Finding<AuthorisationFault>[] {
  if (i.state.cancelled) return [{ code: "CANCELLED", level: "block" }];
  if (i.state.finalised) return [{ code: "FINALISED", level: "block" }];
  const out: Finding<AuthorisationFault>[] = [];
  const f = (code: AuthorisationFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.state.adjourned) f("ADJOURNED");
  const member = i.panel.find((p) => p.personId === i.personId);
  if (!member) f("NOT_ON_PANEL");
  else if (!member.present) f("ABSENT");
  const done = sittingAuthorisers(i.state.sittingNo, i.auths, i.panel);
  if (i.auths.some((a) => a.sittingNo === i.state.sittingNo && a.personId === i.personId && a.lapsedAt == null)) f("ALREADY_AUTHORISED");
  else if (done.length >= (i.required ?? PAPER_AUTHORISATIONS)) f("SITTING_AUTHORISED", { required: i.required ?? PAPER_AUTHORISATIONS });
  // Two people authorise: two distinct humans act. The member's authorisation keyed by an officer is that officer's hand as well as the member's, so no officer is a
  // hand of both (they cannot record one authorisation and give the other, nor record both), whoever the authorisations are attributed to.
  const mine = new Set([i.personId, ...(i.recorderId ? [i.recorderId] : [])]);
  const live = i.auths.filter((a) => a.sittingNo === i.state.sittingNo && a.lapsedAt == null);
  if (live.some((a) => a.personId !== i.personId && ((i.recorderId != null && (a.personId === i.recorderId || a.recordedByPersonId === i.recorderId)) || (a.recordedByPersonId != null && mine.has(a.recordedByPersonId))))) f("SAME_HAND");
  if (!i.closing) f("CLOSING_NOT_SET");
  // OD-11: refused at the closing second, allowed from the next.
  else if (!isLate(i.now, i.closing)) f("AT_OR_BEFORE_CLOSING");
  if (i.state.kind === "MAIN" && !i.boxLocked && !i.online) f("BOX_NOT_LOCKED");
  return out;
}

export type UnsealState = "AWAITING_FIRST" | "AWAITING_SECOND" | "AUTHORISED";

/// The sitting's authorisations, counted as the box reads them: none, one (awaiting the second), or two.
/// `required` is two on paper and the roster's n online: AWAITING_SECOND then covers every count from one to n-1.
export function unsealState(sittingNo: number, auths: readonly AuthorisationFacts[], panel: readonly PanelMemberFacts[], required: number = PAPER_AUTHORISATIONS): { state: UnsealState; count: number } {
  const n = sittingAuthorisers(sittingNo, auths, panel).length;
  return { state: n === 0 ? "AWAITING_FIRST" : n < required ? "AWAITING_SECOND" : "AUTHORISED", count: n };
}

/// Whether this authorisation is the one that opens the box: the last distinct one (the second on paper, the nth online), before any unseal.
export const opensTheBox = (s: OpeningState, countAfter: number, required: number = PAPER_AUTHORISATIONS) => !s.unsealed && countAfter === required;

/// C-2: adjourning lapses an unpaired authorisation of the sitting it ends (kept, marked lapsed).
export function lapsedByAdjourning(sittingNo: number, auths: readonly (AuthorisationFacts & { id: string })[], panel: readonly PanelMemberFacts[], required: number = PAPER_AUTHORISATIONS): string[] {
  const live = auths.filter((a) => a.sittingNo === sittingNo && a.lapsedAt == null);
  return sittingAuthorisers(sittingNo, auths, panel).length >= required ? [] : live.map((a) => a.id);
}

export type AdjournFault = "CANCELLED" | "FINALISED" | "ALREADY_ADJOURNED" | "NOT_ADJOURNED" | "REASON_REQUIRED" | "PERSON_REQUIRED";

/// FR-OPN-011: adjourning and resuming lose nothing; each says why and who recorded it.
export function adjournFaults(i: { state: OpeningState; reason: string; personActive: boolean; resume: boolean }): Finding<AdjournFault>[] {
  // Review M-1: a cancelled exercise's opening is neither adjourned nor resumed; it stays as it stood.
  if (i.state.cancelled) return [{ code: "CANCELLED", level: "block" }];
  if (i.state.finalised) return [{ code: "FINALISED", level: "block" }];
  const out: Finding<AdjournFault>[] = [];
  const f = (code: AdjournFault) => out.push({ code, level: "block" });
  if (i.resume && !i.state.adjourned) f("NOT_ADJOURNED");
  if (!i.resume && i.state.adjourned) f("ALREADY_ADJOURNED");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}
