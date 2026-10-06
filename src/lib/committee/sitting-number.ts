import type { Tx } from "@/lib/audit/record";
import { NumberingError, issueReference } from "@/lib/numbering/issue";

/// The numbering series a sitting's number is drawn from, where one is configured.
export const SITTING_SERIES_KEY = "meeting";

/**
 * Number a sitting and create it, inside the caller's transaction.
 *
 * A typed number is the sitting's own and draws nothing. Otherwise the number comes from
 * `issueReference`, the one issuer, which locks the series row before it reads it, so two
 * sittings scheduled at once queue on the lock and never read the same serial. `day` is the
 * organisation's day, never the server's clock. The committee's unique (committee,
 * reference) is the backstop. A missing or broken series throws `NumberingError`: a number
 * is never improvised.
 *
 * Its own function so that the scheduling action and `scripts/check-numbering-concurrency.ts`
 * run the same code, and a source scan can say nothing else writes a series.
 */
export async function createNumberedSitting(
  tx: Tx,
  input: {
    organisationId: string;
    committeeId: string;
    meetingDate: Date;
    agenda: string;
    typedReference: string | null;
    day: Date | null;
    seriesKey?: string;
  },
) {
  const key = input.seriesKey ?? SITTING_SERIES_KEY;
  let reference = input.typedReference;
  if (!reference) {
    if (!input.day) throw new NumberingError("SERIES_INVALID", key);
    reference = await issueReference(tx, input.organisationId, key, input.day);
  }
  const row = await tx.meeting.create({
    data: { committeeId: input.committeeId, reference, meetingDate: input.meetingDate, agenda: input.agenda },
  });
  return { row, reference };
}
