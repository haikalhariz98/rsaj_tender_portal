/**
 * Where an opening stands, derived from its record on every read and every write (nothing stored but
 * the acts): started, its sittings (adjourned or not), the authorisations of each sitting, unsealed,
 * finalised. Pure.
 *
 * C-2 (OD-1 A): a sitting may record nothing until two distinct panel members present at the
 * opening have each authorised it, each a separate act stamped by the server. The first pair opens
 * the box (the unseal); adjourning ends the sitting and lapses an unpaired authorisation (kept,
 * marked lapsed); resuming starts a new sitting, which needs two fresh authorisations. This is
 * recorded on the members' behalf, not signed: the key and the box remain the control, and the
 * authenticated half waits for sign-in (ADR 0017).
 */

import type { Finding, OpeningKind, OpeningPhase } from "./types";

export interface SittingFacts {
  sittingNo: number;
  adjournedAt: Date | null;
}

export interface AuthorisationFacts {
  personId: string;
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

export interface OpeningState {
  kind: OpeningKind;
  finalised: boolean;
  unsealed: boolean;
  /// The current sitting is adjourned.
  adjourned: boolean;
  /// The current sitting has its two authorisations (C-2).
  sittingAuthorised: boolean;
  sittingNo: number;
}

export function openingState(o: { kind: OpeningKind; unsealedAt: Date | null; finalisedAt: Date | null }, sittings: readonly SittingFacts[], auths: readonly AuthorisationFacts[], panel: readonly PanelMemberFacts[]): OpeningState {
  const s = currentSitting(sittings);
  const sittingNo = s?.sittingNo ?? 1;
  return {
    kind: o.kind,
    finalised: o.finalisedAt != null,
    unsealed: o.unsealedAt != null,
    adjourned: s?.adjournedAt != null,
    sittingAuthorised: sittingAuthorisers(sittingNo, auths, panel).length >= 2,
    sittingNo,
  };
}

export function openingPhase(s: OpeningState): OpeningPhase {
  if (s.finalised) return "FINALISED";
  if (s.adjourned) return "ADJOURNED";
  if (s.sittingAuthorised) return "IN_PROGRESS";
  return s.unsealed ? "AWAITING_REAUTHORISATION" : "AWAITING_AUTHORISATION";
}

export type ActFault = "FINALISED" | "ADJOURNED" | "NOT_UNSEALED" | "SITTING_NOT_AUTHORISED";

/**
 * What every act on the opened record asks first: not finalised (FR-OPN-011: a finalised opening
 * has no update path), not adjourned, the box opened, and this sitting authorised by two members.
 */
export function actFaults(s: OpeningState): Finding<ActFault>[] {
  if (s.finalised) return [{ code: "FINALISED", level: "block" }];
  if (s.adjourned) return [{ code: "ADJOURNED", level: "block" }];
  if (!s.unsealed) return [{ code: "NOT_UNSEALED", level: "block" }];
  if (!s.sittingAuthorised) return [{ code: "SITTING_NOT_AUTHORISED", level: "block", data: { sitting: s.sittingNo } }];
  return [];
}
