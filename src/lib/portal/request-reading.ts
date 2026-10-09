/**
 * Where the office's request for more stands, as the supplier must be told it (FR-VND-007 online, Phase 4c). One pure rule for both places that say it: the Company workspace's Overview
 * and the account page. It reads the items of the latest request and each item's answers, and it never says "answered" for an item nobody answered.
 *
 * Before the deadline an item needs the supplier when nothing was sent for it, or when the latest thing sent was found not in order (the supplier may send it again, and the date is still
 * running). After the deadline the lapse rule decides, exactly as the office's side reads it (`isAnsweredOnTime`: every item has something sent on or before the deadline day): then the
 * office decides on what was sent, and otherwise the date has passed with the request unanswered and the application is rejected once the office records it.
 */

import { isAnsweredOnTime } from "@/lib/suppliers/review";
import type { VerificationState } from "@/lib/suppliers/types";

export interface ReadingItem {
  id: string;
  /// The documents the supplier sent for it, in any order.
  answers: readonly { id: string; verification: VerificationState; lodgedOn: string }[];
}

export type RequestReading =
  /// Time remains (or no date was set) and `needing` items still need the supplier: nothing sent, or what was sent was not accepted.
  | { kind: "WAITING"; needing: number }
  /// Everything asked for has been sent and none of it is found not in order, or the date passed with every item answered in time: the office decides.
  | { kind: "ANSWERED" }
  /// The date passed and `unanswered` items had nothing sent for them by that day.
  | { kind: "DATE_PASSED"; unanswered: number };

const newestFirst = (a: ReadingItem["answers"][number], b: ReadingItem["answers"][number]) => b.lodgedOn.localeCompare(a.lodgedOn) || b.id.localeCompare(a.id);

/// `today` is the organisation's day, or null where it is not set: nothing is then said to have passed.
export function readRequest(items: readonly ReadingItem[], resubmitBy: string | null, today: string | null): RequestReading {
  const needing = items.filter((it) => {
    const latest = [...it.answers].sort(newestFirst)[0];
    return !latest || latest.verification === "NOT_IN_ORDER";
  }).length;
  const passed = resubmitBy != null && today != null && today > resubmitBy;
  if (!passed) return items.length > 0 && needing === 0 ? { kind: "ANSWERED" } : { kind: "WAITING", needing };
  const answers = items.flatMap((it) => it.answers.map((a) => ({ answersItemId: it.id, lodgedOn: a.lodgedOn })));
  if (isAnsweredOnTime(items, answers, resubmitBy)) return { kind: "ANSWERED" };
  return { kind: "DATE_PASSED", unanswered: items.filter((it) => !it.answers.some((a) => a.lodgedOn <= resubmitBy!)).length };
}
