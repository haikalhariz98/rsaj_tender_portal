/**
 * Where an opening stands, derived from its record on every read and every write (nothing stored but
 * the acts): started, its sittings (adjourned or not), the authorisations of each sitting, unsealed,
 * finalised. Pure.
 *
 * C-2 (OD-1 A): a sitting may record nothing until two distinct panel members present at the
 * opening have each authorised it, each a separate act stamped by the server. The first pair opens
 * the box (the unseal); adjourning ends the sitting and lapses an unpaired authorisation (kept,
 * marked lapsed); resuming starts a new sitting, which needs two fresh authorisations. This is
 * signed by each member in their own sign-in with their own password (Phase 3d): the key and the box
 * remain the control, and "no single credential unseals" holds of the electronic box, which waits for 6.15c (ADR 0017).
 */

import type { Finding, OpeningKind, OpeningPhase } from "./types";

export interface SittingFacts {
  sittingNo: number;
  adjournedAt: Date | null;
}

export interface AuthorisationFacts {
  personId: string;
  /// Who keyed this authorisation for the member from their paper, where it was recorded for them (Phase 2b review): the member did not act in this session.
  recordedByPersonId?: string | null;
  sittingNo: number;
  recordedAt: Date;
  lapsedAt: Date | null;
}

export interface PanelMemberFacts {
  personId: string;
  present: boolean;
}

/// The sitting now: the latest one.
export const currentSitting = (sittings: readonly SittingFacts[]): SittingFacts | null => [...sittings].sort((a, b) => a.sittingNo - b.sittingNo).at(-1) ?? null;

/// The distinct present panel members who authorised the sitting, never lapsed.
export function sittingAuthorisers(sittingNo: number, auths: readonly AuthorisationFacts[], panel: readonly PanelMemberFacts[]): string[] {
  const present = new Set(panel.filter((p) => p.present).map((p) => p.personId));
  return [...new Set(auths.filter((a) => a.sittingNo === sittingNo && a.lapsedAt == null && present.has(a.personId)).map((a) => a.personId))];
}

/// Paper: two panel members present authorise (C-2). An ONLINE opening is n-of-n across the exercise's named officers (ADR 0036 D10, ruling 20k): the count is the roster's size, never a literal.
export const PAPER_AUTHORISATIONS = 2;

/// How many authorisations open a sitting. ONLINE: every officer of the panel, which is the roster the exercise key was split across, and never fewer than two (a panel of one could never open
/// anything: n-of-n needs two). Paper: two.
export function requiredAuthorisations(channel: string | null | undefined, panelSize: number): number {
  return channel === "ONLINE" ? Math.max(PAPER_AUTHORISATIONS, panelSize) : PAPER_AUTHORISATIONS;
}

export interface OpeningState {
  kind: OpeningKind;
  /// The exercise is cancelled (6.5 FR-ADV-016, 6.7 C-9): nothing more is recorded at any of its openings (review M-1).
  cancelled: boolean;
  finalised: boolean;
  unsealed: boolean;
  /// The current sitting is adjourned.
  adjourned: boolean;
  /// The current sitting has all its authorisations (C-2: two on paper, every named officer online).
  sittingAuthorised: boolean;
  sittingNo: number;
  /// How many authorisations the sitting needs: two, or the roster's n online.
  required: number;
  /// The exercise takes bids online. The words are chosen by this, never by `required` (an online roster of two is still every named officer, with no box).
  online: boolean;
}

export function openingState(o: { kind: OpeningKind; unsealedAt: Date | null; finalisedAt: Date | null; exerciseStatus?: string; online?: boolean }, sittings: readonly SittingFacts[], auths: readonly AuthorisationFacts[], panel: readonly PanelMemberFacts[], required: number = PAPER_AUTHORISATIONS): OpeningState {
  const s = currentSitting(sittings);
  const sittingNo = s?.sittingNo ?? 1;
  return {
    kind: o.kind,
    cancelled: o.exerciseStatus === "CANCELLED",
    finalised: o.finalisedAt != null,
    unsealed: o.unsealedAt != null,
    adjourned: s?.adjournedAt != null,
    sittingAuthorised: sittingAuthorisers(sittingNo, auths, panel).length >= required,
    sittingNo,
    required,
    online: o.online === true,
  };
}

export function openingPhase(s: OpeningState): OpeningPhase {
  if (s.finalised) return "FINALISED";
  if (s.adjourned) return "ADJOURNED";
  if (s.sittingAuthorised) return "IN_PROGRESS";
  return s.unsealed ? "AWAITING_REAUTHORISATION" : "AWAITING_AUTHORISATION";
}

export type ActFault = "CANCELLED" | "FINALISED" | "ADJOURNED" | "NOT_UNSEALED" | "SITTING_NOT_AUTHORISED";

/**
 * What every act on the opened record asks first: the exercise not cancelled (review M-1: a
 * cancelled exercise's openings are kept as they stand), not finalised (FR-OPN-011: a finalised
 * opening has no update path), not adjourned, the box opened, and this sitting authorised by two
 * members.
 */
export function actFaults(s: OpeningState): Finding<ActFault>[] {
  if (s.cancelled) return [{ code: "CANCELLED", level: "block" }];
  if (s.finalised) return [{ code: "FINALISED", level: "block" }];
  if (s.adjourned) return [{ code: "ADJOURNED", level: "block" }];
  // Paper's findings carry what they always did; an online sitting also names how many officers it needs, for the words.
  // The channel decides the words (review: an online roster of two is not a box with two panel members).
  if (!s.unsealed) return [s.online ? { code: "NOT_UNSEALED", level: "block", data: { required: s.required, online: 1 } } : { code: "NOT_UNSEALED", level: "block" }];
  if (!s.sittingAuthorised) return [{ code: "SITTING_NOT_AUTHORISED", level: "block", data: s.online ? { sitting: s.sittingNo, required: s.required, online: 1 } : { sitting: s.sittingNo } }];
  return [];
}
