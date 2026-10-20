/**
 * What the public may see of an award: that an advertised exercise was awarded, and when. Nothing of
 * the award's party or figure (founder, 2026-10-20; ruling R3, decisions log).
 *
 * Pure. A result is an exercise the board would list as awarded (`isPublicOpportunity` and
 * `opportunityState`). Its row carries no award party and no figure: `resultSelect` (select.ts) does not
 * read them, so there is nothing here to withhold. The schedule of tenders is a document the procurement
 * office chose to publish (`schedulePublishedAt`); this projection only says when.
 */

import { dayIn } from "@/lib/dates";
import { formatDay } from "@/lib/award/fields";
import type { ExerciseStatus } from "@/lib/method/types";

import { isIssuedAward, isPublicOpportunity, opportunityState } from "./public";

/// What `resultSelect` returns (select.ts). Declared here so the projection is testable without a database.
export interface ResultRow {
  id: string;
  reference: string;
  title: string;
  status: ExerciseStatus;
  restricted: boolean;
  closingAt: Date | null;
  sourcingMethodCode: string;
  window: { path: "ADVERTISED" | "INVITED"; publishedAt: Date | null } | null;
  awards: { status: string; issuedAt: Date | null }[];
}

export interface ResultContext {
  now: Date;
  timeZone: string | null;
  methodNames: ReadonlyMap<string, string>;
  /// When the published schedule of tenders was attached, by exercise id. Absent: not published.
  schedulePublishedAt?: ReadonlyMap<string, Date>;
}

export interface PublicResult {
  id: string;
  reference: string;
  title: string;
  method: string;
  /// The closing day as the organisation reads it; empty where none is recorded.
  closing: string | null;
  /// The day the award was issued, as the organisation reads it; for sorting, `awardedDay` (YYYY-MM-DD).
  awardedOn: string | null;
  awardedDay: string | null;
  /// The day the schedule of tenders was published; null where it is not.
  schedulePublishedOn: string | null;
}

/**
 * The result for one exercise, or null where it is not one: not public, cancelled, or with no issued
 * award. Where there are several issued awards the latest issued is the one shown.
 */
export function toPublicResult(row: ResultRow, ctx: ResultContext): PublicResult | null {
  if (!isPublicOpportunity({ status: row.status, restricted: row.restricted, closingAt: row.closingAt, window: row.window })) return null;
  const issued = row.awards.filter((a) => isIssuedAward(a.status));
  if (opportunityState({ status: row.status, closingAt: row.closingAt }, issued.length > 0, ctx.now) !== "AWARDED") return null;
  const award = [...issued].sort((a, b) => (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0))[0];
  const day = award.issuedAt ? dayIn(award.issuedAt, ctx.timeZone) : null;
  const published = ctx.schedulePublishedAt?.get(row.id);
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    method: ctx.methodNames.get(row.sourcingMethodCode) ?? "",
    closing: row.closingAt ? formatDay(dayIn(row.closingAt, ctx.timeZone), "EN") : null,
    awardedOn: day ? formatDay(day, "EN") : null,
    awardedDay: day,
    schedulePublishedOn: published ? formatDay(dayIn(published, ctx.timeZone), "EN") : null,
  };
}
