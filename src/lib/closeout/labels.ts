/**
 * Close-out's words (Phase 2 close-out stage B). A code never reaches a screen: every refusal is worded here, naming what refuses and the way
 * out. English only. Pure.
 */

import { formatDate } from "@/lib/format";

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
