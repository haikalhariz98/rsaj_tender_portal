/**
 * A registration cancelled by a registration body (615-C2 as narrowed, BD-613-91; ADR 0019 Amendment 1; FR-ADV-010,
 * which reads an external registration). Pure.
 *
 * - **Recorded as a fact**, never decided here: the body (a configured registration body), the body's reference and
 *   the day it takes effect, by an officer recorded on their behalf, not signed. No route. The body's notice is
 *   attached on the record afterwards (REGISTRATION_CANCELLATION_NOTICE); until it is, the record says so.
 * - **One at a time.** A cancellation in effect refuses another; a later one waits for the first to be withdrawn.
 * - **Withdrawn when made in error**, with a reason: the row is kept and shown withdrawn, and the standing rule reads it
 *   as never in effect. A cancellation that stood is lifted by a new registration, not by a withdrawal.
 * - Not built (no requirement): the organisation's own cancellation, its request and its route.
 */

import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";

import { eligibilityFindingOf } from "./opening-hook";
import type { StandingReading } from "./standing";
import type { Finding } from "./types";

type Words = { en: string; ms: string };

export type CancellationFault =
  | "TIME_ZONE_UNSET"
  | "CANCELLATION_NEEDS_REGISTRATION"
  | "REGISTRATION_DAY_NOT_RECORDED"
  | "ALREADY_CANCELLED"
  | "CANCELLING_BODY_REQUIRED"
  | "CANCELLING_BODY_NOT_CONFIGURED"
  | "CANCELLATION_REFERENCE_REQUIRED"
  | "EFFECTIVE_REQUIRED"
  | "EFFECTIVE_IN_FUTURE"
  | "EFFECTIVE_BEFORE_REGISTRATION"
  | "PERSON_REQUIRED"
  | "NOT_A_CANCELLATION"
  | "CANCELLATION_ALREADY_WITHDRAWN"
  | "CANCELLATION_WITHDRAW_REASON_REQUIRED";

/// The longest reference kept, as typed (a body's notice number).
export const CANCELLATION_REFERENCE_MAX = 200;

export interface CancellationInput {
  bodyId: string | null;
  reference: string;
  effectiveOn: string | null;
  personActive: boolean;
}

export interface CancellationContext {
  today: string | null;
  /// The supplier's status (APPLICANT, REGISTERED, REJECTED).
  status: string;
  registeredOn: string | null;
  reading: StandingReading;
  /// Whether the body chosen is one the organisation configures. Null: none chosen.
  bodyConfigured: boolean | null;
}

/// Recording a registration body's cancellation of the supplier's registration.
export function recordCancellationFaults(i: CancellationInput, ctx: CancellationContext): Finding<CancellationFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<CancellationFault>[] = [];
  if (ctx.status !== "REGISTERED") out.push({ code: "CANCELLATION_NEEDS_REGISTRATION", level: "block" });
  // BD-613-109: a cancellation names the registration it cancels (its day), so a registered supplier without one is refused.
  else if (!ctx.registeredOn) out.push({ code: "REGISTRATION_DAY_NOT_RECORDED", level: "block" });
  else if (ctx.reading.cancellation) out.push({ code: "ALREADY_CANCELLED", level: "block", data: { since: ctx.reading.cancellation.effectiveOn } });
  if (!i.bodyId) out.push({ code: "CANCELLING_BODY_REQUIRED", level: "block" });
  else if (ctx.bodyConfigured !== true) out.push({ code: "CANCELLING_BODY_NOT_CONFIGURED", level: "block" });
  if (!i.reference.trim()) out.push({ code: "CANCELLATION_REFERENCE_REQUIRED", level: "block" });
  if (!i.effectiveOn) out.push({ code: "EFFECTIVE_REQUIRED", level: "block" });
  else if (i.effectiveOn > ctx.today) out.push({ code: "EFFECTIVE_IN_FUTURE", level: "block" });
  else if (ctx.registeredOn && i.effectiveOn < ctx.registeredOn) out.push({ code: "EFFECTIVE_BEFORE_REGISTRATION", level: "block", data: { registeredOn: ctx.registeredOn } });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// Withdrawing a cancellation recorded in error: a cancellation, not already withdrawn, with a reason and an officer.
export function withdrawCancellationFaults(
  i: { reason: string; personActive: boolean },
  ctx: { today: string | null; event: { kind: string; withdrawn: boolean } | null },
): Finding<CancellationFault>[] {
  if (!ctx.today) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: Finding<CancellationFault>[] = [];
  if (!ctx.event || ctx.event.kind !== "REGISTRATION_CANCELLED") out.push({ code: "NOT_A_CANCELLATION", level: "block" });
  else if (ctx.event.withdrawn) out.push({ code: "CANCELLATION_ALREADY_WITHDRAWN", level: "block" });
  if (!i.reason.trim()) out.push({ code: "CANCELLATION_WITHDRAW_REASON_REQUIRED", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  return out;
}

/// One bid opened for this supplier's linked party, with the register's finding frozen on it (OpenedBid.eligibilityFinding).
export interface OpeningJudged {
  exercise: string;
  listingNo: number;
  /// The organisation's day the finding was made on (its snapshot's judgedOn).
  judgedOn: string;
  /// The standing the finding recorded.
  standing: string;
  /// Whether the bid was rejected at the opening (its verdict).
  rejected: boolean;
}

/// An opened bid as S-4 reads it: its frozen register finding, if it has one (a bidder not linked when opened has none).
export function openingJudgedOf(exercise: string, b: { listingNo: number; eligibilityFinding: unknown; verdict: string | null }): OpeningJudged | null {
  const f = eligibilityFindingOf(b.eligibilityFinding);
  return f ? { exercise, listingNo: b.listingNo, judgedOn: f.judgedOn, standing: f.standing, rejected: b.verdict === "REJECT" } : null;
}

/// A registration cancelled on the supplier's file, as C1 reads it.
export interface CancellationOnFile {
  id: string;
  effectiveOn: string;
  /// The registration it cancels (BD-613-109); null only where none could be named.
  cancelsRegistrationOn: string | null;
  withdrawn: boolean;
}

/// C1: a supplier's standing events as the cancellations on its file (the act and the Standing tab both read them so).
export function cancellationsOnFile(events: readonly { id: string; kind: string; effectiveOn: Date; cancelsRegistrationOn: Date | null; withdrawnAt: Date | null }[]): CancellationOnFile[] {
  return events
    .filter((e) => e.kind === "REGISTRATION_CANCELLED")
    .map((e) => ({ id: e.id, effectiveOn: storedDay(e.effectiveOn), cancelsRegistrationOn: e.cancelsRegistrationOn ? storedDay(e.cancelsRegistrationOn) : null, withdrawn: e.withdrawnAt != null }));
}

/**
 * C1 (Run 1a, flagged 6.15a): the day a cancellation stopped standing (exclusive), or null while it stands: the next
 * registration day after it took effect (the supplier's registration day, or the registration a later cancellation names:
 * a registration is a fact even where that later cancellation was withdrawn), or the next live cancellation's start,
 * whichever is earlier. A registration day on or before the day it took effect does not end it (cancellationEnded is
 * strict).
 */
export function cancellationStoodUntil(target: { id: string; effectiveOn: string }, onFile: readonly CancellationOnFile[], registeredOn: string | null): string | null {
  const others = onFile.filter((c) => c.id !== target.id);
  const after = (d: string | null): d is string => d != null && d > target.effectiveOn;
  const candidates = [registeredOn, ...others.map((c) => c.cancelsRegistrationOn), ...others.filter((c) => !c.withdrawn).map((c) => c.effectiveOn)].filter(after);
  return candidates.length ? candidates.reduce((a, b) => (b < a ? b : a)) : null;
}

/**
 * S-4 (6.13 Part B Run 0 fix round): the openings that judged this supplier's registration cancelled while the record
 * stood, that is on or after the day it took effect, in order. A withdrawal does not revisit them: each keeps its frozen
 * finding (and a bid rejected at the opening stays rejected). A sale refused for the cancellation left no record, so none
 * can be listed. C1 (Run 1a): bounded by `until` (exclusive, `cancellationStoodUntil`), so withdrawing one cancellation
 * never lists openings a later one caused; null while it stands.
 */
export function judgedWhileCancelled(openings: readonly OpeningJudged[], effectiveOn: string, until: string | null): OpeningJudged[] {
  return openings
    .filter((o) => o.standing === "CANCELLED" && o.judgedOn >= effectiveOn && (until == null || o.judgedOn < until))
    .sort((a, b) => a.judgedOn.localeCompare(b.judgedOn) || a.exercise.localeCompare(b.exercise) || a.listingNo - b.listingNo);
}

/// S-4: what a withdrawal does not revisit, in English and Malay, naming each opening that judged the supplier cancelled.
export function notRevisitedWords(judged: readonly OpeningJudged[]): Words {
  const lead = { en: "Judgments made while it stood are not revisited", ms: "Penilaian yang dibuat semasa ia berkuat kuasa tidak disemak semula" };
  const sales = { en: "A sale refused for it left no record, so none is listed.", ms: "Jualan yang ditolak kerananya tidak meninggalkan rekod, jadi tiada yang disenaraikan." };
  if (!judged.length) return { en: `${lead.en}: no bid opening judged the supplier cancelled. ${sales.en}`, ms: `${lead.ms}: tiada pembukaan tawaran yang menilai pembekal sebagai dibatalkan. ${sales.ms}` };
  const en = judged.map((o) => `${o.exercise} (bid No. ${o.listingNo}, opened ${formatDate(o.judgedOn)}${o.rejected ? ", rejected at the opening" : ""})`).join("; ");
  const ms = judged.map((o) => `${o.exercise} (tawaran No. ${o.listingNo}, dibuka ${formatDate(o.judgedOn)}${o.rejected ? ", ditolak semasa pembukaan" : ""})`).join("; ");
  return { en: `${lead.en}. The openings that judged the supplier cancelled keep their findings: ${en}. ${sales.en}`, ms: `${lead.ms}. Pembukaan yang menilai pembekal sebagai dibatalkan mengekalkan penemuannya: ${ms}. ${sales.ms}` };
}
