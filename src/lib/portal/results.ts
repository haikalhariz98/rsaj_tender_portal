/**
 * What the public may see of an award: that an advertised exercise was awarded, to whom, and when.
 * The awarded value only where the organisation has said so.
 *
 * Pure. A result is an exercise the board would list as awarded (`isPublicOpportunity` and
 * `opportunityState`), so every row links to an opportunity page that exists. The projection returns
 * strings and flags only, and it never reads a value it was not allowed to show: with the setting
 * unset or No, the figure is absent from the row and ignored if a caller passes one anyway.
 */

import { dayIn } from "@/lib/dates";
import { formatDay } from "@/lib/award/fields";
import { senFromDecimal } from "@/lib/money";
import type { ExerciseStatus } from "@/lib/method/types";

import { isPublicOpportunity, opportunityState } from "./public";

/// An award counts as a result only once issued (and still standing if accepted).
export const isIssuedAward = (status: string): boolean => status === "ISSUED" || status === "ACCEPTED";

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
  awards: { status: string; issuedAt: Date | null; awardeeName: string; awardedValue?: { toString(): string } | null }[];
}

export interface ResultContext {
  now: Date;
  timeZone: string | null;
  methodNames: ReadonlyMap<string, string>;
  /// `AwardPolicy.publishAwardedValue`: only exactly true shows the value. Null (not set) and false do not.
  publishAwardedValue: boolean | null;
}

export interface PublicResult {
  id: string;
  reference: string;
  title: string;
  method: string;
  /// The awardee's name as the award records it; empty where none is recorded.
  awardee: string;
  /// The day the award was issued, as the organisation reads it; for sorting, `awardedDay` (YYYY-MM-DD).
  awardedOn: string | null;
  awardedDay: string | null;
  /// The awarded value in sen, as an integer's decimal string; null unless the organisation publishes it.
  awardedSen: string | null;
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
  const showValue = ctx.publishAwardedValue === true && award.awardedValue != null;
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    method: ctx.methodNames.get(row.sourcingMethodCode) ?? "",
    awardee: award.awardeeName.trim(),
    awardedOn: day ? formatDay(day, "EN") : null,
    awardedDay: day,
    awardedSen: showValue ? senFromDecimal(award.awardedValue).toString() : null,
  };
}
