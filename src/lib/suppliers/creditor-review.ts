/**
 * An officer checks a supplier's bank details (Phase 4b, FR-VND-005; CPD, 2026-10-07: ONE officer, no second-officer step). Pure.
 *
 * The check is a signed act: the officer's name, the day, and the password asked again. It is made once, on a profile the supplier has sent, against the bank statement the supplier
 * uploaded with it; "found not in order" says why. A profile that was checked is not checked again: a change the supplier makes is a new version, checked on its own, and the
 * version in force stays in force until that is done (`src/lib/payment/creditor.ts`).
 */

import { isDay } from "@/lib/dates";

import type { Finding, VerificationState } from "./types";

export type CreditorReviewFault =
  | "TIME_ZONE_UNSET"
  | "NOT_SENT"
  | "ALREADY_CHECKED"
  | "STATE_REQUIRED"
  | "PERSON_REQUIRED"
  | "DAY_REQUIRED"
  | "IN_FUTURE"
  | "BEFORE_SENT"
  | "NOTE_REQUIRED"
  | "STATEMENT_REQUIRED";

export interface CreditorReviewInput {
  /// The outcome of the check. Null: not chosen.
  state: Exclude<VerificationState, "NOT_CHECKED"> | null;
  /// Whether the officer is an active Person of the organisation.
  personActive: boolean;
  /// The day the check is dated (YYYY-MM-DD): today, or an earlier day the officer says it was made.
  verifiedOn: string | null;
  note: string;
}

export interface CreditorReviewFacts {
  sent: boolean;
  verification: VerificationState;
  /// The organisation's day the supplier sent it.
  sentOn: string | null;
  /// How many live files its bank statement has.
  statementFiles: number;
}

export function creditorReviewFaults(i: CreditorReviewInput, p: CreditorReviewFacts, today: string | null): Finding<CreditorReviewFault>[] {
  if (today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  if (!p.sent) return [{ code: "NOT_SENT", level: "block" }];
  if (p.verification !== "NOT_CHECKED") return [{ code: "ALREADY_CHECKED", level: "block" }];
  const out: Finding<CreditorReviewFault>[] = [];
  if (i.state == null) out.push({ code: "STATE_REQUIRED", level: "block" });
  if (!i.personActive) out.push({ code: "PERSON_REQUIRED", level: "block" });
  if (!i.verifiedOn || !isDay(i.verifiedOn)) out.push({ code: "DAY_REQUIRED", level: "block" });
  else if (i.verifiedOn > today) out.push({ code: "IN_FUTURE", level: "block" });
  else if (p.sentOn && i.verifiedOn < p.sentOn) out.push({ code: "BEFORE_SENT", level: "block", data: { sentOn: p.sentOn } });
  if (i.state === "NOT_IN_ORDER" && !i.note.trim()) out.push({ code: "NOTE_REQUIRED", level: "block" });
  // Bank details are checked against the statement: with none live there is nothing to check them against, so they cannot be passed as in order.
  if (i.state === "VERIFIED" && p.statementFiles === 0) out.push({ code: "STATEMENT_REQUIRED", level: "block" });
  return out;
}

export interface Words {
  en: string;
}

const w = (en: string): Words => ({ en });

const TEXT: Readonly<Record<CreditorReviewFault, (d: Record<string, string | number | null>) => Words>> = {
  TIME_ZONE_UNSET: () => w("Set the organisation's time zone before checking bank details."),
  NOT_SENT: () => w("The supplier has not sent these bank details yet, so there is nothing to check."),
  ALREADY_CHECKED: () => w("These bank details were checked already. A change the supplier makes is a new version, checked on its own."),
  STATE_REQUIRED: () => w("Say whether the bank details are in order or not."),
  PERSON_REQUIRED: () => w("The officer who checks them must be a person of the organisation."),
  DAY_REQUIRED: () => w("Give the day the check was made."),
  IN_FUTURE: () => w("The check cannot be dated after today."),
  BEFORE_SENT: (d) => w(`The check cannot be dated before the supplier sent the details (${d.sentOn ?? "an earlier day"}).`),
  NOTE_REQUIRED: () => w("Say why the bank details are not in order, so the supplier can correct them."),
  STATEMENT_REQUIRED: () => w("There is no bank statement to check the details against. Ask the supplier for one, or mark the details as not in order."),
};

export function creditorReviewText(f: Pick<Finding<CreditorReviewFault>, "code" | "data">): Words {
  return TEXT[f.code](f.data ?? {});
}
