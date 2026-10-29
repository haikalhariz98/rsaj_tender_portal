/**
 * Close-out's words (Phase 2 close-out stage B). A code never reaches a screen: every refusal is worded here, naming what refuses and the way
 * out. English only. Pure.
 */

import { formatDate } from "@/lib/format";
import { formatMoney, type Sen } from "@/lib/money";

import type { DefectState, Finding } from "./types";

type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const day = (v: unknown) => (v ? formatDate(String(v)) : "that day");

const EVENT_WORDS: Readonly<Record<string, string>> = { MAKING_GOOD: "the Certificate of Making Good Defects is issued", FINAL_INSPECTION: "the final defects inspection is recorded", FINAL_PAYMENT: "the final certificate is paid" };

export const CLOSEOUT_FAULT_WORDS: Readonly<Record<string, (d: Data) => string>> = {
  // Practical completion
  CPC_LIVE: (d) => `A practical completion certificate${d.number ? ` (${d.number})` : ""} is already raised. Void it to raise another.`,
  SECTIONAL_NOT_BUILT: () => "This contract has sections. Sectional completion is not built yet, so its practical completion is not certified here.",
  IT_VARIANT_NOT_BUILT: () => "This contract type completes as an IT contract. That certificate is not built yet, so its practical completion is not certified here.",
  VARIANT_NOT_SET: () => "The contract type does not say how its works complete, so this is raised as the standard works certificate. Set it under Settings › Contract types.",
  DLP_NOT_SET: () => "The contract's baseline does not say whether a defects liability period applies, or how long it is. Correct the baseline first.",
  COMPLETION_IN_FUTURE: (d) => `The completion date (${day(d.day)}) is after today.`,
  BEFORE_POSSESSION: (d) => `The completion date is before possession of site (${day(d.day)}).`,
  INSPECTION_IN_FUTURE: (d) => `The joint inspection (${day(d.day)}) is after today.`,
  TEST_REASONS_REQUIRED: () => "Say why the works are practically complete.",
  LAD_WINDOW_OPEN: () => "Damages are still running. Close the damages window at the completion date under Payments first.",
  LAD_WINDOW_MISMATCH: (d) => `The damages window closes on ${day(d.day)}, not the completion date (${day(d.completion)}).`,
  LINE_HAS_EVENTS: () => "Something is already recorded against this defect, so it stays on the list.",
  CPC_NOT_DRAFT: () => "The certificate's list is fixed once it leaves draft.",
  DESCRIPTION_REQUIRED: () => "Say what the defect is.",
  DUE_REQUIRED: () => "Give the day it is to be made good by.",
  DUE_BEFORE_COMPLETION: (d) => `The due day is before the completion date (${day(d.day)}).`,
  // A defect line
  LINE_CLOSED: (d) => `This defect is already ${d.state === "WITHDRAWN" ? "withdrawn" : "made good"}.`,
  NOT_OPEN: () => "This defect is already reported rectified.",
  NOT_REPORTED: () => "Only a defect reported rectified is returned.",
  RETURN_NOTE_REQUIRED: () => "Say why it is not made good.",
  WITHDRAW_REASON_REQUIRED: () => "Say why it is withdrawn.",
  DAY_IN_FUTURE: (d) => `${day(d.day)} is after today.`,
  BEFORE_CERTIFICATE: (d) => `It is before the certificate of making good defects was issued (${day(d.day)}).`,
  OBSERVED_REQUIRED: () => "Give the day it was observed.",
  OBSERVED_OUTSIDE_DLP: (d) => `It was observed outside the defects liability period${d.from && d.to ? ` (${day(d.from)} to ${day(d.to)})` : ""}.`,
  CPC_NOT_ISSUED: () => "The practical completion certificate is not issued yet.",
  DLP_NOT_APPLICABLE: () => "No defects liability period applies to this contract.",
  SCHEDULE_ISSUED: () => "The Schedule of Defects is issued. No more defects are added.",
  // The Schedule of Defects
  // F10 (code review of close-out stage B): the day given is the period's exclusive end, the first day after it, so the words say "from" it.
  DLP_NOT_ENDED: (d) => `The defects liability period has not ended. This can be raised from ${d.day ? formatDate(String(d.day)) : "the day after it ends"}.`,
  SCHEDULE_LIVE: (d) => `A Schedule of Defects${d.number ? ` (${d.number})` : ""} is already raised.`,
  NO_OPEN_DEFECTS: () => "No defect is open.",
  RECTIFY_BY_NOT_AFTER_TODAY: () => "The day to make good by is after today.",
  RECTIFY_BY_PAST_LIMIT: (d) => `The day to make good by is after ${day(d.day)}, the longest the contract allows.`,
  LIMIT_NOT_SET: () => "The longest period a schedule may give is not set, so it is not checked.",
  // The certificate of making good defects
  DEFECTS_OPEN: (d) => `${s(d.n, "Some")} ${d.n === 1 ? "defect is" : "defects are"} neither made good nor withdrawn.`,
  FINAL_INSPECTION_BEFORE_DLP_END: (d) => `The final defects inspection is before ${day(d.day)}: it is held at the end of the defects liability period, after the Schedule of Defects where one issued.`,
  MADE_GOOD_BEFORE_COMPLETION: (d) => `The defects are made good before practical completion (${day(d.day)}).`,
  CMGD_FIGURES_MOVED: (d) => `What it prints has changed since it was raised (${s(d.items, "its figures")}). Void it and raise it again.`,
  CMGD_LIVE: (d) => `A certificate of making good defects${d.number ? ` (${d.number})` : ""} is already raised.`,
  // Retention and securities
  RELEASE_EVENT_NOT_SET: (d) => `When the ${s(d.setting, "release")} is released is not set. See Configuration › Post-award.`,
  MAKING_GOOD_NOT_ISSUED: () => "Held until the Certificate of Making Good Defects is issued.",
  FINAL_INSPECTION_NOT_RECORDED: () => "The final defects inspection is not recorded.",
  BALANCE_WITH_FINAL_PAYMENT: () => "Released with the final certificate's payment.",
  NOT_HELD: () => "This security was rejected, so nothing is held to return.",
  ALREADY_RETURNED: () => "Already returned.",
  DGB_SURVIVES: () => "The design guarantee bond survives the close. It is not returned here.",
  ADVANCE_NOT_RECOUPED: () => "Its advance is not fully recouped on issued certificates yet.",
  EVENT_NOT_SET: (d) => `When the ${s(d.setting, "security")} is released is not set. See Configuration › Post-award.`,
  EVENT_NOT_REACHED: (d) => `Returned once ${EVENT_WORDS[String(d.event)] ?? "its event is reached"}.`,
  OFFICIAL_RECEIPT_REQUIRED: () => "Give the official receipt's reference for a cash or banker's draft security.",
  // The final account (stage C)
  FINAL_LIVE: (d) => `A final certificate${d.number ? ` (${d.number})` : ""} is already raised. Void it to raise another.`,
  MAKING_GOOD_NOT_ISSUED_FINAL: () => "The certificate of making good defects is not issued yet.",
  CERTIFICATES_IN_PROGRESS: (d) => `Finish or void first: ${s(d.items, "the certificates in progress")}.`,
  VALUATION_OPEN: () => "An interim valuation is open. Raise its certificate or withdraw it under Payments first.",
  EOT_OPEN: (d) => `An extension of time is not finished: ${s(d.items, "a claim")}. Determine it, or certify it once approved.`,
  LOSS_EXPENSE_NOT_VALUED: (d) => `Loss and expense is not valued or decided: ${s(d.items, "a claim")}.`,
  FINAL_BASIS_NOT_SET: () => "What the final account counts as previous payments is not set. See Configuration › Post-award.",
  WAIVER_SETTING_NOT_SET: () => "An approved damages waiver is not applied, and when waivers are applied is not set. See Configuration › Post-award.",
  PARTY_DUE_NOT_RECORDED: (d) => `What each nominated party and assignee is due on the final account is not recorded: ${s(d.items, "a party")}. Record it under the final account's parties, nothing where nothing is due.`,
  NOMINATED_PARTY_NOT_RECORDED: (d) => `There is value for the ${d.tier === "NS" ? "nominated suppliers" : "nominated sub-contractors"}, but none is recorded on the contract, so their share would go to the main contractor. Record each under Project › Team first.`,
  REMAINDER_RULE_NOT_SET: (d) => `The payment does not cover what the nominated parties are due, and sharing it pro rata leaves ${s(d.sen, "some")} sen over: where they go is not set under Configuration › Post-award.`,
  DUE_NEGATIVE: () => "An amount due to a party is below nothing.",
  VARIATIONS_NOT_ADJUSTED: (d) => `The final sum counts only issued adjustments of the contract sum, and nothing adds a variation after the final certificate. Not on an issued adjustment: ${s(d.items, "a variation")}.`,
  NEGATIVE_DEDUCTION: (d) => `${s(d.label, "A deduction")} is below nothing.`,
  TOO_MANY_OTHER_DEDUCTIONS: (d) => `At most ${s(d.max, "three")} other deductions.`,
  ROUNDING_ONCE: () => "The damages are rounded once.",
  ROUNDING_WITHOUT_LAD: () => "There are no damages to round.",
  LAD_ROUNDING_OUT_OF_RANGE: () => "A rounding lies between −RM1.00 and RM1.00.",
  LAD_ROUNDING_BELOW_NOTHING: () => "The rounding would take the damages below nothing.",
  // Ruling 3 (code review of close-out stage C): what the contractor owes is said, and that the contract stays open; never a payment of nothing.
  FINAL_NEGATIVE: (d) => `The deductions exceed what is due: the contractor owes ${d.amount ? formatMoney(BigInt(String(d.amount))) : "an amount"}. Recovering it is not built yet, so no final certificate is raised and the contract stays open.`,
  PACK_INCOMPLETE: (d) => `The pack is missing: ${s(d.items, "documents")}. Add each, or mark it not applicable.`,
  DECLARATION_NOT_TAKEN_UP: () => "The contractor's statutory declaration is not taken up and linked.",
  FINANCE_NOT_CONFIRMED: () => "Finance has not confirmed what it paid on the interim and advance certificates.",
  FINANCE_TOTAL_DIFFERS: (d) => `Finance confirmed ${d.confirmed ? formatMoney(BigInt(String(d.confirmed))) : "a total"}, but its recorded payments add to ${d.computed ? formatMoney(BigInt(String(d.computed))) : "another"}.`,
  FINAL_INTERIM_UNREADABLE: (d) => `The interim certificate ${s(d.number, "")} cannot be read: its deductions do not add up to what it carried forward less what it paid.`.replace("  ", " "),
  WAIVER_MOVED: (d) => `An approved waiver's damages moved since it was sent: ${s(d.items, "a waiver")}. Send it again first.`,
  FINAL_SENT: () => "The final certificate has left draft, or its route is open. Void it to change the account.",
  FINAL_ACCOUNT_MISSING: () => "The certificate has no final account recorded with it.",
  FINAL_NOT_ACCEPTED: (d) => `The contractor refused to sign “${s(d.block, "its acceptance")}” on ${day(d.day)}. A final account the contractor does not accept is not issued: void the certificate and raise the final account again.`,
  FINAL_BASIS_MOVED: (d) => `What the final account read has changed since it was raised (${s(d.items, "its figures")}). Void it and raise it again.`,
  // The close (stage C)
  SUPPLY_NOT_BUILT: () => "Supply contracts are not closed here yet.",
  FINAL_NOT_ISSUED: () => "The final certificate is not issued.",
  PAID_DIFFERS: (d) => `Paid other than certified: ${s(d.items, "a certificate")}.`,
  CERTIFICATES_NOT_PAID: (d) => `Finance's payment is not recorded on: ${s(d.items, "a certificate")}.`,
  MATTERS_OPEN: (d) => `A route is still open: ${s(d.items, "a matter")}.`,
  RETENTION_HELD: (d) =>
    d.paidOnFinal === "yes"
      ? `The retention balance of ${d.amount ? formatMoney(BigInt(String(d.amount))) : "an amount"} is not recorded as released. Record the release: the final certificate paid it.`
      : `Retention of ${d.amount ? formatMoney(BigInt(String(d.amount))) : "an amount"} is still held.`,
  SECURITY_NOT_RETURNED: (d) => `Not returned: ${s(d.items, "a security")}.`,
  PERFORMANCE_NOT_FILED: () => "The contractor performance report is not verified.",
  // Issue
  WORK_WOULD_BE_STRANDED: (d) => `Finish or close first: ${s(d.items, "open work")}. Nothing could finish it once this certificate issues.`,
  SO_ROUTE_MISMATCH: (d) => `The route's approving office is not the contract's S.O. (${s(d.so, "the S.O.")}) today. Correct the approval matrix's row.`,
  SO_UNRESOLVED: () => "The contract's S.O. does not resolve today. Resolve the S.O. under Project › Team first.",
};

export const closeoutFaultText = (f: Finding): string => CLOSEOUT_FAULT_WORDS[f.code]?.(f.data ?? {}) ?? "Refused.";
export const closeoutRefusal = (lead: string, fs: readonly Finding[]) => `${lead} ${fs.map(closeoutFaultText).join(" ")}`.trim();

export const DEFECT_STATE_WORDS: Readonly<Record<DefectState, string>> = { OPEN: "Open", REPORTED_RECTIFIED: "Reported rectified", MADE_GOOD: "Made good", WITHDRAWN: "Withdrawn" };
/// The chip's tone (none: neutral).
export const DEFECT_STATE_TONE: Readonly<Record<DefectState, "info" | "ok" | "warn" | undefined>> = { OPEN: "warn", REPORTED_RECTIFIED: "info", MADE_GOOD: "ok", WITHDRAWN: undefined };

export const SECURITY_KIND_WORDS: Readonly<Record<string, string>> = { PERFORMANCE_BOND: "Performance bond", ADVANCE_PAYMENT_GUARANTEE: "Advance payment guarantee", DESIGN_GUARANTEE_BOND: "Design guarantee bond", RETENTION_BOND: "Retention bond" };
export const SECURITY_FORM_WORDS: Readonly<Record<string, string>> = { BANK_GUARANTEE: "bank guarantee", INSURANCE_GUARANTEE: "insurance guarantee", CASH: "cash", BANKERS_DRAFT: "banker's draft" };

/// "n withdrawn, not made good" (ruling 4), or null where none was.
export const withdrawnWords = (n: number): string | null => (n > 0 ? `${n} withdrawn, not made good` : null);

/// Ruling 3 (code review of close-out stage C): a final account below nothing is shown as what the contractor owes, never as nothing, with the
/// contract left open (FINAL_NEGATIVE still refuses the raise). Null where the payment is not below nothing.
export function owedByContractor(recommended: Sen): { label: string; value: string; note: string } | null {
  if (recommended >= 0n) return null;
  return { label: "Owed by the contractor", value: formatMoney(-recommended), note: "The contract stays open until recovering an amount the contractor owes is built." };
}
