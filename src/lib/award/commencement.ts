/**
 * The commencement clock on the quotation route (FR-AWD-009). Work must start within
 * `AwardPolicy.commencementGraceDays` of the stated start date. Late raises the
 * warning with the variant's consequence and offers cancellation; blacklisting waits
 * for the vendor master (6.15) and is recorded as recommended (6.11 ruling).
 */

import { addDays, type Day } from "@/lib/securities/period";

import type { NonCommencement } from "./types";

export type CommencementState =
  | { state: "COMMENCED"; on: Day }
  | { state: "NO_START_DATE" }
  | { state: "NOT_SET" }
  | { state: "NOT_DUE"; deadline: Day }
  | { state: "LATE"; deadline: Day; consequence: NonCommencement | null };

export function commencementState(start: Day | null, commencedOn: Day | null, graceDays: number | null, today: Day, consequence: NonCommencement | null): CommencementState {
  if (commencedOn) return { state: "COMMENCED", on: commencedOn };
  if (!start) return { state: "NO_START_DATE" };
  if (graceDays == null) return { state: "NOT_SET" };
  const deadline = addDays(start, graceDays);
  return today > deadline ? { state: "LATE", deadline, consequence } : { state: "NOT_DUE", deadline };
}
