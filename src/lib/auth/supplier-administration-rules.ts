import type { AccountStatus, CodePurpose } from "@/generated/prisma/client";

import { LOGIN_NAME } from "./login-name";
import type { Fault } from "./types";

/**
 * The rules of administering a supplier's portal account (Phase 4a, ADR 0034 D2, D6): an officer opens it for a contact, issues the one-time code that
 * activates it or resets its password, unlocks it, and retiring the contact disables it. Pure: each takes what the act has read and answers the faults it finds,
 * in both languages, so a screen can say what is wrong in words and a test can pin each rule without a database.
 *
 * Who may: an officer holding `supplierAccounts.manage` (grantable to roles only, undecided until the organisation decides, so refused until then). The officer
 * must record how the caller's identity was checked outside the system: it is the one thing that stops a stranger from taking over a rival's account by asking for
 * a reset (threat model F7). A supplier's code is made by one officer: the second-person rule is for the accounts of office holders.
 */

const fault = (code: string, en: string): Fault => ({ code, en });

export const NOT_PERMITTED = fault(
  "SUPPLIER_ACCOUNTS_NOT_PERMITTED",
  "Opening a supplier's portal account, and issuing its codes, needs the permission to manage supplier accounts, which your role has not been given.",
);
export const IDENTITY_CHECK_REQUIRED = fault(
  "IDENTITY_CHECK_REQUIRED",
  "Say how you checked who the caller is (for example: seen at the counter with their identity card, or called back on the number on the registration certificate).",
);
export const IDENTITY_CHECK_TOO_LONG = fault("IDENTITY_CHECK_TOO_LONG", "Keep it to 1,000 characters.");
export const NO_SUCH_SUPPLIER_ACCOUNT = fault("NO_SUCH_SUPPLIER_ACCOUNT", "That portal account no longer exists.");

export const IDENTITY_CHECK_MAX = 1000;

export const LOGIN_NAME_HELP = "3 to 64 characters: letters, digits and . _ - @, starting with a letter or digit.";

type OpenKey = "loginName" | "identityCheck" | "*";

/// Faults in opening a portal account for a contact, from what was read. `contact` is null where there is no such live contact on the supplier.
export function openAccountFaults(i: {
  permitted: boolean;
  loginName: string;
  loginNameTaken: boolean;
  identityCheck: string;
  contact: { retired: boolean; hasAccount: boolean } | null;
}): Partial<Record<OpenKey, Fault>> {
  const out: Partial<Record<OpenKey, Fault>> = {};
  if (!i.permitted) out["*"] = NOT_PERMITTED;
  if (!i.contact) out["*"] ??= fault("NO_SUCH_CONTACT", "There is no such contact on this supplier.");
  else if (i.contact.retired) out["*"] ??= fault("CONTACT_RETIRED", "That contact has been retired, so no portal account is opened for them.");
  else if (i.contact.hasAccount) out["*"] ??= fault("CONTACT_HAS_ACCOUNT", "That contact already has a portal account. A contact has at most one, and it is never moved to another.");
  if (!LOGIN_NAME.test(i.loginName.trim())) out.loginName = fault("BAD_LOGIN_NAME", `The sign-in name is ${LOGIN_NAME_HELP}`);
  else if (i.loginNameTaken) out.loginName = fault("LOGIN_NAME_TAKEN", "That sign-in name is already used.");
  const check = identityCheckFault(i.identityCheck);
  if (check) out.identityCheck = check;
  return out;
}

export function identityCheckFault(identityCheck: string): Fault | null {
  const t = identityCheck.trim();
  if (t === "") return IDENTITY_CHECK_REQUIRED;
  if ([...t].length > IDENTITY_CHECK_MAX) return IDENTITY_CHECK_TOO_LONG;
  return null;
}

/**
 * Faults in issuing a code for an existing account: an activation code for one waiting to be activated, a reset code for one that is active (the table
 * `redeemSupplierCode` judges a code against), the identity check recorded, and a live contact.
 */
export function issueSupplierCodeFaults(i: {
  permitted: boolean;
  target: { status: AccountStatus; contactRetired: boolean } | null;
  purpose: CodePurpose;
  identityCheck: string;
}): Fault[] {
  if (!i.permitted) return [NOT_PERMITTED];
  if (!i.target) return [NO_SUCH_SUPPLIER_ACCOUNT];
  const out: Fault[] = [];
  if (i.target.contactRetired) out.push(fault("CONTACT_RETIRED", "That contact has been retired, so no code is issued for their account."));
  else if (i.purpose === "ACTIVATION" && i.target.status !== "PENDING_ACTIVATION") {
    out.push(fault("NOT_AWAITING_ACTIVATION", "An activation code is for an account that has not been activated. This one has been, or is disabled."));
  } else if (i.purpose === "RESET" && i.target.status !== "ACTIVE") {
    out.push(fault("NOT_ACTIVE", "A reset code is for an active account. This one is waiting for activation or is disabled."));
  }
  const check = identityCheckFault(i.identityCheck);
  if (check) out.push(check);
  return out;
}

/// Faults in unlocking an account an attacker may have locked on purpose (a rival, near a closing time): an officer unlocks it, with the check of who asked.
export function unlockSupplierFaults(i: { permitted: boolean; target: { failedAttempts: number; lockedUntil: Date | null } | null; identityCheck: string; now: Date }): Fault[] {
  if (!i.permitted) return [NOT_PERMITTED];
  if (!i.target) return [NO_SUCH_SUPPLIER_ACCOUNT];
  const out: Fault[] = [];
  const locked = i.target.lockedUntil != null && i.target.lockedUntil.getTime() > i.now.getTime();
  if (!locked && i.target.failedAttempts === 0) out.push(fault("NOT_LOCKED", "That account is not locked and has no wrong passwords counted."));
  const check = identityCheckFault(i.identityCheck);
  if (check) out.push(check);
  return out;
}

/// What a person reads for an account, by its state, and what an officer may do to it. Words only, never the state itself.
export function accountStateWords(i: { status: AccountStatus; locked: boolean }): { en: string;  } {
  if (i.status === "DISABLED") return { en: "Disabled" };
  if (i.status === "PENDING_ACTIVATION") return { en: "Waiting for its activation code" };
  return i.locked ? { en: "Active, locked after wrong passwords" } : { en: "Active" };
}
