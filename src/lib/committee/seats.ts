import { inForceOn, type Effective } from "@/lib/effective";

/**
 * The seats of a committee in force on a date.
 *
 * One rule for every screen and route that asks "who sits on this body": begun, and
 * not yet ended, on the day in question. A past sitting is judged against the seats
 * in force on the day it sat, not today's — which is what lets a historic decision
 * keep showing the membership it was actually taken by.
 */
export function seatsInForce<T extends Effective>(members: readonly T[], on: Date): T[] {
  return members.filter((m) => inForceOn(m, on));
}
