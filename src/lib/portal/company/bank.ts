/**
 * Changing the bank details after registration (Phase 4c; the CPD rulings of 2026-10-07 and the addendum: a change is a NEW VERSION, the version in force stays in force until one
 * officer has checked the new one, and a changed profile counts for payment only then). Pure.
 *
 * The details and the GIRO authorisation are judged by the rules the registration already has (`creditorFaults`, the wording check by hash) so the two cannot drift. What is new here is the
 * state a change may be made in: the supplier is on the register, and no earlier change is still waiting for an officer (one at a time, so the officer is never left two versions to check
 * and the supplier is never unsure which is in force). The change is signed: the password is asked again, because a stolen sign-in must not be able to redirect payment (ruling 2).
 */

import { creditorFaults } from "@/lib/portal/registration/creditor";
import { signatoryDiffers } from "@/lib/portal/registration/declaration";
import type { CreditorInput, RegistrationContext } from "@/lib/portal/registration/types";
import { isBlank } from "@/lib/portal/registration/types";
import type { SupplierStatus, VerificationState } from "@/lib/suppliers/types";

import type { CompanyFinding } from "./types";

export interface BankChangeInput {
  creditor: CreditorInput;
  /// How many files came with the request (the statement).
  statementFiles: number;
  /// The wording the page showed (id and hash of it with the organisation's name filled in), who signs, and the tick.
  giro: { textVersionId: string; textSha256: string; signatoryName: string; signatoryDesignation: string; confirmed: boolean };
}

/// A version of the supplier's bank details as the rules read it.
export interface BankVersionFacts {
  version: number;
  sent: boolean;
  verification: VerificationState;
}

/// Where the supplier's bank details stand, from its versions: the version in force (the newest checked and found in order), one waiting for an officer, and the newest found not in order.
export interface BankState {
  inForce: BankVersionFacts | null;
  waiting: BankVersionFacts | null;
  /// The newest version sent, when an officer found it not in order and nothing newer has been sent since.
  notInOrder: BankVersionFacts | null;
  /// Nothing has been sent yet.
  none: boolean;
}

export function bankState(versions: readonly BankVersionFacts[]): BankState {
  const sent = versions.filter((v) => v.sent).sort((a, b) => b.version - a.version);
  const inForce = sent.find((v) => v.verification === "VERIFIED") ?? null;
  const waiting = sent.find((v) => v.verification === "NOT_CHECKED") ?? null;
  const newest = sent[0] ?? null;
  return { inForce, waiting, notInOrder: newest && newest.verification === "NOT_IN_ORDER" ? newest : null, none: sent.length === 0 };
}

/**
 * The faults of a change. The state first (the supplier is on the register; no change is waiting), then the details by the registration's own rules, then the authorisation: the wording the
 * page showed is the wording in force, who signs is named, and the box is ticked. A password is needed to send, and is asked of the request, not stored.
 */
export function bankChangeFaults(i: BankChangeInput, ctx: RegistrationContext, state: { supplierStatus: SupplierStatus; bank: BankState; passwordGiven: boolean }): CompanyFinding[] {
  if (ctx.today == null) return [{ code: "TIME_ZONE_UNSET", level: "block" }];
  const out: CompanyFinding[] = [];
  if (state.supplierStatus !== "REGISTERED") out.push({ code: "NOT_REGISTERED_FOR_CHANGE", level: "block" });
  if (state.bank.waiting) out.push({ code: "CHANGE_WAITING", level: "block", data: { version: state.bank.waiting.version } });
  for (const f of creditorFaults(i.creditor, i.statementFiles, ctx)) out.push({ code: f.code, level: f.level, ...(f.field ? { field: f.field } : {}), ...(f.data ? { data: f.data } : {}) });
  const text = ctx.texts.GIRO_AUTHORISATION;
  if (!text) out.push({ code: "TEXT_NOT_SET", level: "block", field: "giro", data: { kind: "GIRO_AUTHORISATION" } });
  else {
    if (i.giro.textVersionId !== text.id || i.giro.textSha256 !== text.sha256) out.push({ code: "TEXT_STALE", level: "block", field: "giro" });
    if (isBlank(i.giro.signatoryName)) out.push({ code: "SIGNATORY_NAME_REQUIRED", level: "block", field: "giro.signatoryName" });
    if (isBlank(i.giro.signatoryDesignation)) out.push({ code: "SIGNATORY_DESIGNATION_REQUIRED", level: "block", field: "giro.signatoryDesignation" });
    if (!i.giro.confirmed) out.push({ code: "NOT_CONFIRMED", level: "block", field: "giro.confirmed", data: { kind: "GIRO_AUTHORISATION" } });
    if (signatoryDiffers(i.giro.signatoryName, ctx.supplier.contactName)) out.push({ code: "SIGNATORY_DIFFERS", level: "warn", field: "giro.signatoryName" });
  }
  if (!state.passwordGiven) out.push({ code: "PASSWORD_REQUIRED", level: "block", field: "password" });
  return out;
}

/// What the supplier is told of its bank details, in a sentence each way.
export type BankReading = "NONE_SENT" | "IN_FORCE" | "IN_FORCE_CHANGE_WAITING" | "WAITING_FIRST" | "NOT_IN_ORDER_STILL_IN_FORCE" | "NOT_IN_ORDER";

export function bankReading(s: BankState): BankReading {
  if (s.none) return "NONE_SENT";
  if (s.inForce && s.waiting) return "IN_FORCE_CHANGE_WAITING";
  if (s.inForce && s.notInOrder) return "NOT_IN_ORDER_STILL_IN_FORCE";
  if (s.inForce) return "IN_FORCE";
  if (s.waiting) return "WAITING_FIRST";
  return "NOT_IN_ORDER";
}

export const BANK_READING_WORDS: Readonly<Record<BankReading, { title: string; detail: string; tone: "ok" | "warn" | "info" | "neutral" }>> = {
  NONE_SENT: { title: "No bank details on record", detail: "The procurement office has no bank details of yours, so payments cannot be made to you yet.", tone: "warn" },
  IN_FORCE: { title: "Payments go to these details", detail: "An officer has checked them against your bank statement.", tone: "ok" },
  IN_FORCE_CHANGE_WAITING: { title: "A change is waiting for the office", detail: "Payments still go to the details an officer checked before. The new details count only once an officer has checked them.", tone: "info" },
  WAITING_FIRST: { title: "Waiting for the office to check them", detail: "An officer has not checked your bank details yet, so payments cannot be made to you until they have.", tone: "info" },
  NOT_IN_ORDER_STILL_IN_FORCE: { title: "Your last change was not accepted", detail: "Payments still go to the details an officer checked before. The reason the office gave is below; send the details again with it put right.", tone: "warn" },
  NOT_IN_ORDER: { title: "Your bank details were not accepted", detail: "Payments cannot be made to you until the details are put right and an officer has checked them. The reason the office gave is below.", tone: "warn" },
};
