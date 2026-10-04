/**
 * Where a supplier stands on a day (FR-VND-010, ADR 0019): derived from its recorded standing events and
 * its documents, never stored. Precedence, highest first:
 *
 * - NOT_REGISTERED: an applicant, or rejected; nothing below applies;
 * - BLACKLISTED: a blacklisting in effect (not lifted; a first offence only before its `endsOn`, which is
 *   exclusive: the free-from day, as every period in the project);
 * - CANCELLED: a registration cancellation in effect;
 * - SUSPENDED: a manual suspension in effect (not reinstated);
 * - SUSPENDED_ON_LAPSE (OD-7 A, derived on read, no scheduler): `autoSuspendOnLapse` is true and a
 *   mandatory document has expired;
 * - ACTIVE. With a mandatory document expired and `autoSuspendOnLapse` not set, it stays ACTIVE and says
 *   so: "Active — lapse rule not set; a mandatory document has expired" (never quietly suspended, never
 *   quietly clean). Set to false, it stays ACTIVE with the expiry noted.
 *
 * An event takes effect on its effective day; one dated later is not yet in effect. A registration cancelled that was
 * withdrawn as recorded in error (615-C2) is read as never recorded: not in effect, not scheduled. Pure.
 */

import { addDays } from "@/lib/securities/period";

import type { DocumentState } from "./documents";
import type { Finding } from "./types";

export type StandingEventKind = "SUSPEND" | "REINSTATE" | "BLACKLIST" | "BLACKLIST_LIFT" | "REGISTRATION_CANCELLED";
export const STANDING_EVENT_KINDS: readonly StandingEventKind[] = ["SUSPEND", "REINSTATE", "BLACKLIST", "BLACKLIST_LIFT", "REGISTRATION_CANCELLED"];

export type Standing = "NOT_REGISTERED" | "BLACKLISTED" | "CANCELLED" | "SUSPENDED" | "SUSPENDED_ON_LAPSE" | "ACTIVE";
export const STANDINGS: readonly Standing[] = ["ACTIVE", "SUSPENDED_ON_LAPSE", "SUSPENDED", "CANCELLED", "BLACKLISTED", "NOT_REGISTERED"];

export interface StandingEventFacts {
  id: string;
  kind: StandingEventKind;
  /// YYYY-MM-DD.
  effectiveOn: string;
  /// A first-offence blacklisting's end, exclusive: the day the supplier is free from (its last blacklisted
  /// day is the day before). Null: until further notice.
  endsOn: string | null;
  offenceNo: number | null;
  reasonLabel: string;
  reinstatesEventId: string | null;
  liftsEventId: string | null;
  flaggedDocumentIds: readonly string[];
  /// 615-C2: a registration cancelled withdrawn as recorded in error. Run 0 fix round (consider): required, so a reader
  /// that forgets it cannot read a withdrawn cancellation as standing.
  withdrawn: boolean;
  /// BD-613-105(e) / S-3: a registration cancelled's body (its label as frozen) and the body's reference, from which its
  /// reason line is composed at read in English and Malay (`cancellationWords`); no product wording is stored. Null for
  /// every other kind.
  cancelledBy: { body: string; reference: string } | null;
}

export interface StandingPolicy {
  autoSuspendOnLapse: boolean | null;
}

export type StandingNote = "LAPSE_RULE_NOT_SET" | "MANDATORY_EXPIRED" | "BLACKLIST_ENDED" | "SCHEDULED";

export interface StandingReading {
  standing: Standing;
  /// The blacklisting in effect, where there is one.
  blacklist: StandingEventFacts | null;
  /// The manual suspension in effect, where there is one (also under a blacklisting, so it is not forgotten).
  suspension: StandingEventFacts | null;
  cancellation: StandingEventFacts | null;
  /// The mandatory document types that have expired.
  lapsed: string[];
  notes: Finding<StandingNote>[];
}

/// The standing that bars a supplier from a sale, a bid or an award.
export const barred = (s: Standing) => s === "BLACKLISTED" || s === "CANCELLED" || s === "SUSPENDED" || s === "SUSPENDED_ON_LAPSE";

export function standing(
  supplier: { status: "APPLICANT" | "REGISTERED" | "REJECTED" },
  events: readonly StandingEventFacts[],
  mandatory: readonly { typeLabel: string; state: DocumentState }[],
  policy: StandingPolicy,
  on: string,
): StandingReading {
  // 615-C2: a cancellation withdrawn as recorded in error never stood.
  const live = events.filter((e) => !e.withdrawn);
  const inEffect = live.filter((e) => e.effectiveOn <= on);
  const ended = (id: string, by: "reinstatesEventId" | "liftsEventId") => inEffect.some((e) => e[by] === id);
  const latest = (xs: StandingEventFacts[]) => [...xs].sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.id.localeCompare(a.id))[0] ?? null;

  const blacklistings = inEffect.filter((e) => e.kind === "BLACKLIST" && !ended(e.id, "liftsEventId"));
  const blacklist = latest(blacklistings.filter((e) => e.endsOn == null || on < e.endsOn));
  const suspension = latest(inEffect.filter((e) => e.kind === "SUSPEND" && !ended(e.id, "reinstatesEventId")));
  const cancellation = latest(inEffect.filter((e) => e.kind === "REGISTRATION_CANCELLED"));
  const lapsed = mandatory.filter((m) => m.state === "EXPIRED").map((m) => m.typeLabel);
  const notes: Finding<StandingNote>[] = [];
  const over = latest(blacklistings.filter((e) => e.endsOn != null && on >= e.endsOn));
  if (!blacklist && over) notes.push({ code: "BLACKLIST_ENDED", level: "info", data: { lastDay: addDays(over.endsOn!, -1), freeFrom: over.endsOn } });
  const scheduled = live.find((e) => e.effectiveOn > on && (e.kind === "SUSPEND" || e.kind === "BLACKLIST" || e.kind === "REGISTRATION_CANCELLED"));
  if (scheduled) notes.push({ code: "SCHEDULED", level: "info", data: { kind: scheduled.kind, effectiveOn: scheduled.effectiveOn } });

  const read = (s: Standing): StandingReading => ({ standing: s, blacklist, suspension, cancellation, lapsed, notes });
  if (supplier.status !== "REGISTERED") return read("NOT_REGISTERED");
  if (blacklist) return read("BLACKLISTED");
  if (cancellation) return read("CANCELLED");
  if (suspension) return read("SUSPENDED");
  if (lapsed.length) {
    if (policy.autoSuspendOnLapse === true) return read("SUSPENDED_ON_LAPSE");
    notes.unshift({ code: policy.autoSuspendOnLapse == null ? "LAPSE_RULE_NOT_SET" : "MANDATORY_EXPIRED", level: "warn", data: { types: lapsed.join(", ") } });
  }
  return read("ACTIVE");
}
