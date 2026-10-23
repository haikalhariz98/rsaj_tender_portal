/**
 * An earlier contractor submission (`ContractorSubmission`, Phase 4e) as a row of the one Documents list (PW-11; plan step 6 §7). Those rows are read-only and not migrated:
 * the old send path is closed, so nothing new is written there, and an answered one never changes (its triggers hold it). Each shows its stored answer and its stored fields.
 * An unanswered one is still answered through its own act (`answerContractorSubmission`), so until then it waits on the organisation. Pure.
 *
 * What an earlier record says of itself:
 * - Unanswered: "Received", waiting on the organisation.
 * - Taken up: "Taken up" ("Noted" on defects rectified, as a document of the same kind reads, PW-24), waiting on nobody.
 * - Returned: "Returned", waiting on NOBODY. The earlier path is closed, so the contractor answers a return with a new document in the Documents list, not on the earlier
 *   record; it is not "Waiting for you", and it is never in Approved.
 * Its due day is the one stored on it when it was sent, as a plain date: no "days left", no overdue (PW-4), and no word of a service level, whose editor is gone (PW-27).
 */

import { formatDate } from "@/lib/format";
import type { SubmissionOutcome } from "@/lib/portal/projects/types";

import type { DocumentState } from "./state";
import type { Side } from "./types";

/// The mark beside an earlier record, wherever it is listed.
export const EARLIER_RECORD = "Earlier record";

export interface EarlierReading {
  state: DocumentState;
  waitsOn: Side | null;
  /// Answered: read-only from here on.
  answered: boolean;
}

export function earlierReading(outcome: SubmissionOutcome | null): EarlierReading {
  if (outcome === null) return { state: "RECEIVED", waitsOn: "ORGANISATION", answered: false };
  return { state: outcome, waitsOn: null, answered: true };
}

/// The due day stored on an earlier record when it was sent, as a plain date, or that it has none. Never judged against today (PW-4, PW-27).
export const storedDueWords = (dueOn: string | null): string => (dueOn ? `Due ${formatDate(dueOn)}` : "No due day");
