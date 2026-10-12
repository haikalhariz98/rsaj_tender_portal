/**
 * The notice's items, judged once for both gates that need them (Sourcing Requirements v2, SR-06, ruling 9).
 *
 * Until SR-06 the items were judged only when the window was published. They are prepared on Scope and estimate now, before the
 * documents go for approval, so the same findings stand at submission; publication keeps judging them as a backstop, so nothing is
 * weakened. The two gates call these functions and never restate them. Pure.
 *
 * Nothing here is policy: whether mandatory attendance may be asked, the fee floors and the bid validity are the customer's
 * (`WindowPolicyFacts`, `FeeFloorFacts`) and unset means refused, saying so.
 */

import type { Sen } from "@/lib/money";

import { eventFaults } from "./events";
import { feeFaults } from "./fee";
import type { EventFacts, FeeFloorFacts, Finding } from "./types";

export type ItemFault =
  | "INSPECTION_PLACE_MISSING"
  | "PURCHASE_PLACE_MISSING"
  | "INSPECTION_HOURS_MISSING"
  | "PURCHASE_FROM_NOT_SET"
  | "PURCHASE_DAYS_OUT_OF_ORDER"
  | "PAYMENT_METHODS_MISSING"
  | "SUBMISSION_PLACE_MISSING";

/// The window's items as the rules read them (FR-ADV-003 (b), (c), (d) and (g)).
export interface WindowItems {
  inspectionPlace: string;
  purchasePlace: string;
  inspectionHours: string;
  /// YYYY-MM-DD.
  purchaseFromDay: string | null;
  purchaseCloseDay: string | null;
  fee: Sen | null;
  feePaymentMethods: string;
  submissionPlace: string;
  closingTimeReason: string;
}

/// The seven findings about the notice's own items: places, hours, the first day of sale and its order, how the fee is paid, and where tenders go.
export function itemFaults(w: Pick<WindowItems, "inspectionPlace" | "purchasePlace" | "inspectionHours" | "purchaseFromDay" | "purchaseCloseDay" | "feePaymentMethods" | "submissionPlace">): Finding<ItemFault>[] {
  const out: Finding<ItemFault>[] = [];
  const f = (code: ItemFault) => out.push({ code, level: "block" });
  if (!w.inspectionPlace.trim()) f("INSPECTION_PLACE_MISSING");
  if (!w.purchasePlace.trim()) f("PURCHASE_PLACE_MISSING");
  if (!w.inspectionHours.trim()) f("INSPECTION_HOURS_MISSING");
  if (!w.purchaseFromDay) f("PURCHASE_FROM_NOT_SET");
  if (w.purchaseFromDay && w.purchaseCloseDay && w.purchaseFromDay > w.purchaseCloseDay) f("PURCHASE_DAYS_OUT_OF_ORDER");
  if (!w.feePaymentMethods.trim()) f("PAYMENT_METHODS_MISSING");
  if (!w.submissionPlace.trim()) f("SUBMISSION_PLACE_MISSING");
  return out;
}

export type NoticeFault = ItemFault | "WINDOW_ITEMS_NOT_PREPARED" | "BID_VALIDITY_NOT_SET";

export interface NoticeSubmitInput {
  /// The window as written on the exercise; null: no item has been written.
  window: (WindowItems & { bidValidityDays: number | null }) | null;
  events: readonly Pick<EventFacts, "kind" | "startsAt" | "place" | "mandatory" | "cancelled">[];
  /// Whether mandatory attendance may be asked, from the customer's policy; null: not set.
  mandatoryAttendancePermitted: boolean | null;
  /// The closing the documents will propose; null where it is not known (an event is then not judged against it).
  proposedClosingAt: Date | null;
  regime: string | null;
  floors: readonly FeeFloorFacts[];
  basisTotal: Sen;
}

/// What an unprepared window leaves empty: each of these is the same fact, that the items are not written yet. Publication folds the same set.
export const UNPREPARED_ITEM_CODES: ReadonlySet<string> = new Set<string>(["INSPECTION_PLACE_MISSING", "PURCHASE_PLACE_MISSING", "INSPECTION_HOURS_MISSING", "PURCHASE_FROM_NOT_SET", "PAYMENT_METHODS_MISSING", "SUBMISSION_PLACE_MISSING", "FEE_NOT_SET"]);

/**
 * What stands between the notice, fee and briefing and the documents going for approval. A window with nothing written folds its
 * seven missing items under one first finding, as publication does (UX U5), because saying the same thing seven times helps nobody.
 * The bid validity is judged here and not at publication: publication already warns and the award refuses, and a new block there would
 * newly hold back exercises already approved.
 */
export function noticeSubmitFaults(i: NoticeSubmitInput): Finding[] {
  const out: Finding[] = [];
  const w = i.window;
  if (w) out.push(...itemFaults(w));
  for (const e of i.events) out.push(...eventFaults(e, i.mandatoryAttendancePermitted, i.proposedClosingAt));
  out.push(...feeFaults({ fee: w?.fee ?? null, regime: i.regime, floors: i.floors, basisTotal: i.basisTotal }));
  if (!w) {
    const folded = [...itemFaults({ inspectionPlace: "", purchasePlace: "", inspectionHours: "", purchaseFromDay: null, purchaseCloseDay: null, feePaymentMethods: "", submissionPlace: "" }), ...out.filter((f) => f.code === "FEE_NOT_SET")];
    const rest = out.filter((f) => !UNPREPARED_ITEM_CODES.has(f.code));
    out.length = 0;
    out.push({ code: "WINDOW_ITEMS_NOT_PREPARED", level: "block", data: { count: folded.length } }, ...rest);
  }
  if (!w || w.bidValidityDays == null) out.push({ code: "BID_VALIDITY_NOT_SET", level: "block" });
  return out;
}
