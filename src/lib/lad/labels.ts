/**
 * The damages chain's run 1b words (6.13 Part B run 1b), English and Malay, as the design note gives them
 * (6.13B-run1b-design.md §6.9, §6.10, §7). A code never reaches a screen. Part A's codes stay payment/labels.ts's,
 * which reads these through. Pure.
 */

import { formatDate } from "@/lib/format";
import { formatSen, parseSen } from "@/lib/money";
import type { Finding } from "@/lib/method/types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null | undefined>;
const s = (v: unknown, fallback: string) => (v == null || v === "" ? fallback : String(v));
const money = (v: unknown) => (v == null ? "—" : formatSen(parseSen(String(v))));
const day = (v: unknown) => (v ? formatDate(String(v)) : "the date");

const CLAIM_STATE: Readonly<Record<string, Words>> = {
  OPEN: w("still open"),
  ENTITLED_UNCERTIFIED: w("determined entitled and not yet certified"),
};

export const LAD_FAULT_WORDS: Readonly<Record<string, (d: Data) => Words>> = {
  EOT_DETERMINATION_OUTSTANDING: (d) => {
    const st = CLAIM_STATE[String(d.state)] ?? w("outstanding");
    return w(`Damages cannot be decided while the extension-of-time claim ${s(d.claim, "(not yet numbered)")} on this scope is ${st.en}.`);
  },
  EOT_CLAIM_REQUIRED: () => w("An excusable or pending delay names the extension-of-time claim it waits on."),
  EOT_CLAIM_NOT_OUTSTANDING: (d) => w(`${s(d.claim, "That claim")} is neither open nor entitled and uncertified.`),
  NON_COMPLETION_SUPERSEDED: (d) => w(`The decision in force on ${s(d.scope, "this scope")} was superseded by the extension of time ${s(d.eotNumber, "(not yet numbered)")}, and this valuation's day is past the new date for completion (${day(d.day)}): record a replacement decision first.`),
  LAD_LINE_SCOPE_UNKNOWN: (d) => w(`The damages on ${s(d.issuedNumber, "an issued certificate")} were charged before damages were kept per scope, and more than one scope has had a decision: which one it charged cannot be read.`),
  LAD_WAIVER_OVER_CHARGED: (d) => w(`On ${s(d.line, "the damages line")}: waivers ${money(d.waived)} and credits ${money(d.credited)} would pass the damages it charged (${money(d.charged)}).`),
  LAD_CREDIT_OVER_CHARGED: (d) => w(`On ${s(d.line, "the damages line")}: credits ${money(d.credited)} and waivers ${money(d.waived)} would pass the damages it charged (${money(d.charged)}).`),
  LAD_BASIS_MOVED: (d) =>
    d.then != null
      ? w(`The LAD amount it was approved on (${money(d.then)}) is now ${money(d.now)}: ${s(d.moved, "its basis moved")}. Send it again at the new amount (the approver is picked by the share waived).`)
      : w(`The damages it was raised on have moved since: ${s(d.moved, "its basis moved")}. Void it and raise it again.`),
  DECISION_NOT_CHARGING: (d) => w(`A waiver is of damages a live decision charges (${s(d.decision, "no decision in force")} does not).`),
  WAIVED_REQUIRED: (d) => w(`Give the amount waived, more than nothing and not more than the LAD amount (${money(d.amount)}).`),
  WAIVED_PAST_LAD: (d) => w(`Other waivers on this decision already take ${money(d.already)}: at most ${money(d.left)} is left to waive.`),
  NO_LAD_AMOUNT: (d) => w(`No damages are charged or chargeable to ${day(d.day)} on this decision.`),
  WAIVER_REASON_REQUIRED: () => w("Say why the damages are waived."),
  WAIVER_SETTING_NOT_SET: () => w("Approved, not applied. Timing not set in Configuration › Post-award controls."),
  WAIVER_AT_FINAL: () => w("Approved, applied in the final account (the setting says so)."),
  OPENING_DAMAGES_NOT_CREDITED: (d) => w(`Damages were charged before the system to ${day(d.day)}, with no rate on record here: any of those days an extension of time now reaches are not returned by this certificate. Return them by hand, with the paper record.`),
  WAIVER_NOT_APPLIED_MOVED: (d) => w(`The waiver ${s(d.waiver, "")} is not applied: ${s(d.moved, "its basis moved")}. Send it again at the new amount.`),
};

export function ladFaultWords(f: Finding): Words | null {
  const fn = LAD_FAULT_WORDS[f.code];
  return fn ? fn(f.data ?? {}) : null;
}
