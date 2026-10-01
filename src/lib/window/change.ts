/**
 * Changing the window after approval for tendering (FR-ADV-015, 016; 6.5 OD-5 A, X-2).
 *
 * Who authorises a change is policy: the engine's route on the domain `window_change`, under the
 * method's key, at the exercise's value, with the condition CORRECTION, EXTENSION or CANCELLATION
 * (a general row serves all three; a conditional row its own). No rule refuses naming the
 * approval matrix (the 6.11 R11 precedent); a committee step is refused with its exit, as for
 * approval for tendering (BD-65-6). Nothing here names an approver.
 *
 * - A correction fixes, before publication, a date the rules refuse (a holiday, a short window).
 * - An extension moves the closing later after publication; refused once the current closing has
 *   passed. Both re-run every date rule against the new dates — an extension from the ORIGINAL
 *   advertisement day — and keep the original and the revised (append-only; X-2: the closing is
 *   written only when a change is applied).
 * - A cancellation of an advertised or invited exercise records the reason and whether the fees
 *   are refunded (unanswered refuses); it is terminal, and refused while an award stands (6.11
 *   BD-29's mirror). Before publication the exercise's own cancel act is unchanged.
 * Pure.
 */

import { exerciseRoutePreview, withRequester, type AppointmentPreview, type FunderContext, type RequesterOnName } from "@/lib/method/approval";
import { WINDOW_CHANGE_DOMAIN, type ExerciseStatus, type Method } from "@/lib/method/types";

import { closingFaults, type ClosingRules } from "./dates";
import { isPublished, type WindowPhase } from "./phase";
import type { ClosingChangeKind, Finding } from "./types";

export type WindowChangeCond = "CORRECTION" | "EXTENSION" | "CANCELLATION";
export type ChangeRouteState = "NO_METHOD_KEY" | "NO_RULE" | "HAS_COMMITTEE_STEP" | "RESOLVED";

/// The window_change route for a change of `cond`, at the exercise's value.
export function resolveWindowChange(ctx: FunderContext, method: Method, value: number, cond: WindowChangeCond): AppointmentPreview & { changeState: ChangeRouteState } {
  const p = exerciseRoutePreview(ctx, WINDOW_CHANGE_DOMAIN, method, value, cond);
  if (p.state === "NO_METHOD_KEY") return { ...p, changeState: "NO_METHOD_KEY" };
  if (p.state !== "RESOLVED") return { ...p, changeState: "NO_RULE" };
  if (p.chain.some((s) => s.committeeCode)) return { ...p, changeState: "HAS_COMMITTEE_STEP" };
  return { ...p, changeState: "RESOLVED" };
}

/// The route with the requester in mind (FR-APR-008): self-approval escalates or is refused.
export function windowChangeRouteForRequester(ctx: FunderContext, method: Method, value: number, cond: WindowChangeCond, requester: RequesterOnName): AppointmentPreview & { changeState: ChangeRouteState; refusal: string | null } {
  const r = resolveWindowChange(ctx, method, value, cond);
  if (r.changeState !== "RESOLVED") return { ...r, refusal: null };
  const w = withRequester(ctx, WINDOW_CHANGE_DOMAIN, method, value, r, requester, cond === "CANCELLATION" ? "cancelling the exercise" : "a change to the closing");
  return { ...r, ...w, changeState: w.chain.some((s) => s.committeeCode) ? "HAS_COMMITTEE_STEP" : "RESOLVED" };
}

export type ChangeFault =
  | "NOT_APPROVED_FOR_TENDERING"
  | "NOT_PUBLISHED"
  | "ALREADY_PUBLISHED"
  | "CLOSING_PASSED"
  | "NOT_LATER"
  | "UNCHANGED"
  | "REASON_REQUIRED"
  | "CHANGE_PENDING"
  | "TIME_ZONE_UNSET"
  | "NEW_CLOSING_NOT_VALID"
  | "AUTHORITY_NOT_RECORDED"
  | "REFUND_NOT_ANSWERED"
  | "AWARD_STANDS";

export interface ClosingChangeInput {
  kind: ClosingChangeKind;
  status: ExerciseStatus;
  now: Date;
  currentClosingAt: Date | null;
  /// The proposed closing instant; null where the day or time given is not one.
  toClosingAt: Date | null;
  currentPurchaseCloseDay: string | null;
  toPurchaseCloseDay: string | null;
  reason: string;
  /// A window_change route is already pending on the exercise.
  changePending: boolean;
  /// Everything `closingFaults` reads but the closing and the last day of sale (the proposed ones are used).
  rules: ClosingRules;
}

/**
 * Whether a correction or an extension may be asked for, and what the date rules say of the new
 * dates. The rules' blocks refuse: a change that would itself break a rule is not asked for.
 * Re-run by the approving step under the window's lock before it is applied.
 */
export function closingChangeFaults(i: ClosingChangeInput): Finding[] {
  const out: Finding<ChangeFault>[] = [];
  const f = (code: ChangeFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.rules.timeZone) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (i.kind === "CORRECTION" && i.status !== "APPROVED_FOR_TENDERING") {
    if (isPublished(i.status)) f("ALREADY_PUBLISHED");
    else f("NOT_APPROVED_FOR_TENDERING");
  }
  if (i.kind === "EXTENSION" && !isPublished(i.status)) f("NOT_PUBLISHED");
  if (i.currentClosingAt && i.now.getTime() >= i.currentClosingAt.getTime()) f("CLOSING_PASSED");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (i.changePending) f("CHANGE_PENDING");
  if (!i.toClosingAt) {
    f("NEW_CLOSING_NOT_VALID");
    return out;
  }
  const same = i.currentClosingAt?.getTime() === i.toClosingAt.getTime() && i.currentPurchaseCloseDay === i.toPurchaseCloseDay;
  if (same) f("UNCHANGED");
  if (i.kind === "EXTENSION" && i.currentClosingAt && i.toClosingAt.getTime() <= i.currentClosingAt.getTime()) f("NOT_LATER");
  if (i.toClosingAt.getTime() <= i.now.getTime()) f("CLOSING_PASSED");
  const rules = closingFaults({ ...i.rules, closingAt: i.toClosingAt, purchaseCloseDay: i.toPurchaseCloseDay });
  return [...out, ...rules];
}

/// The route's status as the approving step reads it: only an approved route applies a change.
export function authorityFault(routeStatus: string | null): Finding<ChangeFault> | null {
  return routeStatus === "APPROVED" ? null : { code: "AUTHORITY_NOT_RECORDED", level: "block", data: { status: routeStatus } };
}

/**
 * Whether cancelling a published exercise may be asked for (FR-ADV-016). `awardStands`: an award
 * on the exercise is live (6.11 BD-29: it is cancelled first, from its own record).
 */
export function cancelFaults(i: { status: ExerciseStatus; reason: string; feeRefund: boolean | null; changePending: boolean; awardStands: string | null; today: string | null }): Finding<ChangeFault>[] {
  const out: Finding<ChangeFault>[] = [];
  const f = (code: ChangeFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (!i.today) f("TIME_ZONE_UNSET");
  if (!isPublished(i.status)) f("NOT_PUBLISHED");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (i.feeRefund == null) f("REFUND_NOT_ANSWERED");
  if (i.changePending) f("CHANGE_PENDING");
  if (i.awardStands) f("AWARD_STANDS", { award: i.awardStands });
  return out;
}

/**
 * Who is told of an applied change or of the cancellation (FR-ADV-015, 016): every party holding
 * a live sale and, on the invited path, every invitee whose letter was issued; each once.
 */
export { recipientsFor as noticeRecipients } from "./addendum";

/// Whether a phase is one in which the closing may still move: published and not yet closed.
export const closingMayMove = (phase: WindowPhase) => phase === "PUBLISHED" || phase === "OPEN_FOR_PURCHASE" || phase === "CLOSED_FOR_PURCHASE";
