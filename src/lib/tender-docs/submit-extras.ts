/**
 * What the submit gate reads beyond the pack itself since Sourcing Requirements v2 (SR-05, SR-06 and SR-07, rulings 8, 9 and 11): the
 * dates proposed on the exercise, the notice, fee and briefing prepared on Scope and estimate, and the officers named to open. One
 * function, read on the locked rows inside `submitPack` and without them for the Tender documents checklist, so a disabled screen and a
 * refused act say the same thing. The rules are `approvalDatesFault`, `noticeSubmitFaults` and `rosterFaults`; nothing is restated here.
 */

import type { Tx } from "@/lib/audit/record";
import { storedDay } from "@/lib/dates";
import { proposedDatesOf } from "@/lib/method/key-dates";
import { db } from "@/lib/db";
import { loadOpeningRoster, rosterFindings } from "@/lib/opening/roster-store";
import { parseSen } from "@/lib/money";
import { feeBasisTotal } from "@/lib/window/fee";
import { noticeSubmitFaults } from "@/lib/window/items";
import { loadFloors, loadWindowPolicy } from "@/lib/window/repo";
import type { Finding as WindowFinding } from "@/lib/window/types";

import { approvalDatesFault, type DatesFault } from "./tendering";
import type { Finding } from "./types";

export interface SubmitExtras {
  /// `approvalDatesFault` on the stored proposal, judged against today.
  dates: Finding<DatesFault>[];
  /// The days and time judged, for the freeze; null where they are not entered or not valid.
  proposed: { startOn: string; closingDay: string; closingTime: string; proposedClosingAt: Date } | null;
  officers: Finding[];
  notice: Finding[];
}

export interface ExerciseForExtras {
  id: string;
  sourcingMethodCode: string;
  regime: string | null;
  packKindSnapshot: string | null;
  openingRosterRequired: boolean;
  proposedStartOn: Date | null;
  proposedClosingAt: Date | null;
}

/**
 * Judge the three. An exercise that assembles no tender or quotation documents has no window to state and no bids to open, so only its
 * dates are asked (it is never submitted this way; the answer is empty rather than a guess).
 */
export async function loadSubmitExtras(ex: ExerciseForExtras, org: { id: string; code: string; timeZone: string | null; today: string | null }, client: Tx = db): Promise<SubmitExtras> {
  const stored = proposedDatesOf(ex, org.timeZone);
  const judged = approvalDatesFault({ ...stored, timeZone: org.timeZone, today: org.today });
  const proposed = judged.faults.length === 0 && judged.closingAt && stored.startOn && stored.closingDay && stored.closingTime ? { startOn: stored.startOn, closingDay: stored.closingDay, closingTime: stored.closingTime, proposedClosingAt: judged.closingAt } : null;
  const tender = ex.packKindSnapshot === "TENDER" || ex.packKindSnapshot === "QUOTATION";
  if (!tender) return { dates: judged.faults, proposed, officers: [], notice: [] };

  const roster = await loadOpeningRoster(ex, org, client);
  const policy = await loadWindowPolicy(org.id, client);
  const floors = await loadFloors(org.id, client);
  const w = await client.exerciseWindow.findUnique({
    where: { exerciseId: ex.id },
    select: {
      inspectionPlace: true,
      purchasePlace: true,
      inspectionHours: true,
      purchaseFromDay: true,
      purchaseCloseDay: true,
      feeAmount: true,
      feePaymentMethods: true,
      submissionPlace: true,
      closingTimeReason: true,
      bidValidityDays: true,
      events: { select: { kind: true, startsAt: true, place: true, mandatory: true, cancelledAt: true } },
      feeLines: { select: { amount: true } },
    },
  });
  const notice = noticeSubmitFaults({
    window: w
      ? {
          inspectionPlace: w.inspectionPlace,
          purchasePlace: w.purchasePlace,
          inspectionHours: w.inspectionHours,
          purchaseFromDay: w.purchaseFromDay ? storedDay(w.purchaseFromDay) : null,
          purchaseCloseDay: w.purchaseCloseDay ? storedDay(w.purchaseCloseDay) : null,
          fee: w.feeAmount != null ? parseSen(w.feeAmount.toString()) : null,
          feePaymentMethods: w.feePaymentMethods,
          submissionPlace: w.submissionPlace,
          closingTimeReason: w.closingTimeReason,
          bidValidityDays: w.bidValidityDays,
        }
      : null,
    events: (w?.events ?? []).map((e) => ({ kind: e.kind, startsAt: e.startsAt, place: e.place, mandatory: e.mandatory, cancelled: e.cancelledAt != null })),
    mandatoryAttendancePermitted: policy.mandatoryAttendancePermitted,
    proposedClosingAt: proposed?.proposedClosingAt ?? null,
    regime: ex.regime,
    floors,
    basisTotal: feeBasisTotal((w?.feeLines ?? []).map((l) => ({ amount: parseSen(l.amount.toString()) }))),
  }) as WindowFinding[];
  return { dates: judged.faults, proposed, officers: rosterFindings(roster), notice: notice as Finding[] };
}
