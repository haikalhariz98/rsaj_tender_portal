import type { AccountStatus, CodePurpose } from "@/generated/prisma/client";

import type { Fault } from "./types";

/**
 * The rules of administering sign-in accounts (Phase 1b, ADR 0034 D2, D6, D8). Pure: each takes what the act has read and answers the faults it finds, in
 * both languages, so the screen says what is wrong in words and a test can pin each rule without a database.
 *
 * Until permissions arrive (Phase 2a) the administrator flag is the whole of "may administer"; `accounts.manage` replaces it there.
 */

const fault = (code: string, en: string, ms: string): Fault => ({ code, en, ms });

export const NOT_ADMINISTRATOR = fault("NOT_ADMINISTRATOR", "Only an administrator manages sign-in accounts.", "Hanya pentadbir menguruskan akaun log masuk.");
export const REASON_REQUIRED = fault("REASON_REQUIRED", "A reason is required.", "Sebab diperlukan.");
export const NO_SUCH_ACCOUNT = fault("NO_SUCH_ACCOUNT", "That account no longer exists.", "Akaun itu tidak lagi wujud.");

export const LOGIN_NAME_HELP = "3 to 64 characters: letters, digits and . _ - @, starting with a letter or digit.";

type CreateKey = "loginName" | "personId" | "*";

/// Faults in creating an account for a person, from what was read. `person` is null where no such person is in the organisation.
export function createAccountFaults(i: {
  isAdministrator: boolean;
  loginNameValid: boolean;
  loginNameTaken: boolean;
  person: { isActive: boolean; hasAccount: boolean } | null;
}): Partial<Record<CreateKey, Fault>> {
  const out: Partial<Record<CreateKey, Fault>> = {};
  if (!i.isAdministrator) out["*"] = NOT_ADMINISTRATOR;
  if (!i.person) out.personId = fault("NO_SUCH_PERSON", "There is no such person in this organisation.", "Tiada orang sedemikian dalam organisasi ini.");
  else if (!i.person.isActive) out.personId = fault("PERSON_INACTIVE", "That person is no longer active.", "Orang itu tidak lagi aktif.");
  else if (i.person.hasAccount) {
    out.personId = fault(
      "PERSON_HAS_ACCOUNT",
      "That person already has a sign-in account. A person has at most one, and it is never moved to another person.",
      "Orang itu sudah mempunyai akaun log masuk. Seorang hanya boleh mempunyai satu, dan ia tidak dipindahkan kepada orang lain.",
    );
  }
  if (!i.loginNameValid) {
    out.loginName = fault("BAD_LOGIN_NAME", `The sign-in name is ${LOGIN_NAME_HELP}`, "Nama log masuk ialah 3 hingga 64 aksara: huruf, digit dan . _ - @, bermula dengan huruf atau digit.");
  } else if (i.loginNameTaken) out.loginName = fault("LOGIN_NAME_TAKEN", "That sign-in name is already used.", "Nama log masuk itu sudah digunakan.");
  return out;
}

/// Faults in disabling an account.
export function disableFaults(i: {
  isAdministrator: boolean;
  actorAccountId: string;
  target: { id: string; status: AccountStatus; isAdministrator: boolean } | null;
  activeAdministrators: number;
  reason: string;
}): Fault[] {
  if (!i.isAdministrator) return [NOT_ADMINISTRATOR];
  if (!i.target) return [NO_SUCH_ACCOUNT];
  const out: Fault[] = [];
  if (i.target.id === i.actorAccountId) out.push(fault("OWN_ACCOUNT", "You cannot disable your own account. Ask another administrator.", "Anda tidak boleh melumpuhkan akaun anda sendiri. Minta pentadbir lain."));
  if (i.target.status === "DISABLED") out.push(fault("ALREADY_DISABLED", "That account is already disabled.", "Akaun itu sudah dilumpuhkan."));
  else if (i.target.isAdministrator && i.target.status === "ACTIVE" && i.activeAdministrators <= 1) out.push(lastAdministrator());
  if (!i.reason.trim()) out.push(REASON_REQUIRED);
  return out;
}

/**
 * Faults in making a person inactive where that disables their sign-in account (they left: `disableAccountOfLeaver`). It is the same act as disabling the
 * account, reached by another door, so it has the same rules (Phase 1b review): only an administrator, never one's own account, never the only active
 * administrator's. `account` is null for a person with no account, and an account already disabled has nothing left to do: neither is refused here.
 */
export function leaverFaults(i: {
  isAdministrator: boolean;
  actorAccountId: string;
  account: { id: string; status: AccountStatus; isAdministrator: boolean } | null;
  activeAdministrators: number;
}): Fault[] {
  if (!i.account || i.account.status === "DISABLED") return [];
  if (!i.isAdministrator) return [fault("NOT_ADMINISTRATOR_FOR_LEAVER", "This person has a sign-in account, and making them inactive disables it. Only an administrator does that: ask one, or have them disable the account under Sign-in accounts.", "Orang ini mempunyai akaun log masuk, dan menjadikan mereka tidak aktif melumpuhkannya. Hanya pentadbir boleh berbuat demikian: minta seorang, atau minta mereka melumpuhkan akaun di bawah Akaun log masuk.")];
  const out: Fault[] = [];
  if (i.account.id === i.actorAccountId) out.push(fault("OWN_ACCOUNT", "You cannot disable your own account. Ask another administrator.", "Anda tidak boleh melumpuhkan akaun anda sendiri. Minta pentadbir lain."));
  else if (i.account.isAdministrator && i.account.status === "ACTIVE" && i.activeAdministrators <= 1) out.push(lastAdministrator());
  return out;
}

/// Why the only active administrator cannot be disabled, or made inactive: nobody could administer sign-in after.
export const lastAdministrator = (): Fault =>
  fault(
    "LAST_ADMINISTRATOR",
    "That is the only active administrator. Create another one first (npm run auth:bootstrap with --additional), or nobody could administer sign-in.",
    "Itulah satu-satunya pentadbir aktif. Cipta seorang lagi dahulu, atau tiada sesiapa dapat mentadbir log masuk.",
  );

/// Faults in putting a disabled account back to waiting for activation. The person must be active again.
export function enableFaults(i: { isAdministrator: boolean; target: { status: AccountStatus; personActive: boolean } | null; reason: string }): Fault[] {
  if (!i.isAdministrator) return [NOT_ADMINISTRATOR];
  if (!i.target) return [NO_SUCH_ACCOUNT];
  const out: Fault[] = [];
  if (i.target.status !== "DISABLED") out.push(fault("NOT_DISABLED", "That account is not disabled.", "Akaun itu tidak dilumpuhkan."));
  if (!i.target.personActive) out.push(fault("PERSON_INACTIVE", "That person is not active. Make them active again under Users & roles first.", "Orang itu tidak aktif. Aktifkan semula di bawah Pengguna & peranan dahulu."));
  if (!i.reason.trim()) out.push(REASON_REQUIRED);
  return out;
}

/// Faults in unlocking an account.
export function unlockFaults(i: { isAdministrator: boolean; target: { failedAttempts: number; lockedUntil: Date | null } | null; reason: string; now: Date }): Fault[] {
  if (!i.isAdministrator) return [NOT_ADMINISTRATOR];
  if (!i.target) return [NO_SUCH_ACCOUNT];
  const out: Fault[] = [];
  const locked = i.target.lockedUntil != null && i.target.lockedUntil.getTime() > i.now.getTime();
  if (!locked && i.target.failedAttempts === 0) out.push(fault("NOT_LOCKED", "That account is not locked and has no wrong passwords counted.", "Akaun itu tidak dikunci dan tiada kata laluan salah dikira."));
  if (!i.reason.trim()) out.push(REASON_REQUIRED);
  return out;
}

/**
 * Which code may be issued for an account in which state: an activation code for one waiting to be activated, a reset code for one that is active
 * (the same table `redeemOneTimeCode` judges a code against). Nobody issues a code for their own account.
 */
export function issueCodeFaults(i: {
  isAdministrator: boolean;
  actorAccountId: string;
  target: { id: string; status: AccountStatus; personActive: boolean } | null;
  purpose: CodePurpose;
  reason: string;
}): Fault[] {
  if (!i.isAdministrator) return [NOT_ADMINISTRATOR];
  if (!i.target) return [NO_SUCH_ACCOUNT];
  const out: Fault[] = [];
  if (i.target.id === i.actorAccountId) {
    out.push(fault("OWN_ACCOUNT", "You cannot issue a code for your own account. Ask another administrator.", "Anda tidak boleh mengeluarkan kod untuk akaun anda sendiri. Minta pentadbir lain."));
  }
  if (!i.target.personActive) out.push(fault("PERSON_INACTIVE", "That person is no longer active.", "Orang itu tidak lagi aktif."));
  else if (i.purpose === "ACTIVATION" && i.target.status !== "PENDING_ACTIVATION") {
    out.push(fault("NOT_AWAITING_ACTIVATION", "An activation code is for an account that has not been activated. This one has been, or is disabled.", "Kod pengaktifan untuk akaun yang belum diaktifkan. Akaun ini sudah diaktifkan, atau dilumpuhkan."));
  } else if (i.purpose === "RESET" && i.target.status !== "ACTIVE") {
    out.push(fault("NOT_ACTIVE", "A reset code is for an active account. This one is waiting for activation or is disabled.", "Kod tetapan semula untuk akaun aktif. Akaun ini menunggu pengaktifan atau dilumpuhkan."));
  }
  if (!i.reason.trim()) out.push(REASON_REQUIRED);
  return out;
}

/**
 * What to say beside an office holder's account (ADR 0034 D6, Phase 2c): activating or resetting the account of a person who holds, or has held, an office, a
 * committee seat or a delegation needs a second person. One administrator proposes the code and a different one issues it and is shown it. Null for a person who
 * has held nothing: their code is issued directly. `h` is what the person has held, ended or not (`holdingHistoryOf`): an office ended or moved away a moment
 * before a reset must not be what lets one administrator reset an approver's account alone (review of Phase 2c).
 */
export function officeHolderNotice(h: { offices: number; seats: number; delegations: number }): string | null {
  const parts = [
    h.offices > 0 && `${h.offices} ${h.offices === 1 ? "office" : "offices"}`,
    h.seats > 0 && `${h.seats} committee ${h.seats === 1 ? "seat" : "seats"}`,
    h.delegations > 0 && `${h.delegations} ${h.delegations === 1 ? "delegation" : "delegations"}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `This person holds, or has held, ${parts.join(", ")}. A code for their account needs a second person: one administrator proposes it, and a different one issues it and is shown it.`;
}

/// What to say beside an administrator's account: a code for it needs a second person too, or one administrator could take over another's and decide alone (threat model F7).
export const ADMINISTRATOR_NOTICE =
  "This is an administrator's account. A code for it needs a second person: one administrator proposes it, and a different one issues it and is shown it.";

/// The notice for an account, or null where its code is issued directly: an administrator's, or a person who holds or has held anything.
export function secondPersonNotice(i: { isAdministrator: boolean; held: { offices: number; seats: number; delegations: number } }): string | null {
  return i.isAdministrator ? ADMINISTRATOR_NOTICE : officeHolderNotice(i.held);
}

/// Refused by `issueCode`: the code for an office holder's account is made through a two-person change, never by one administrator alone.
export const OFFICE_HOLDER_NEEDS_SECOND_PERSON = fault(
  "OFFICE_HOLDER_NEEDS_SECOND_PERSON",
  "This person holds, or has held, an office, a committee seat or a delegation, so a code for their account needs a second person. Propose it under Changes awaiting a second person: one administrator proposes it, and a different one issues it and is shown it.",
  "Orang ini memegang, atau pernah memegang, jawatan, kerusi jawatankuasa atau perwakilan, jadi kod untuk akaunnya memerlukan orang kedua. Cadangkannya di bawah Perubahan yang menunggu orang kedua: seorang pentadbir mencadangkannya, dan pentadbir lain mengeluarkannya serta ditunjukkan kod itu.",
);

/// Refused by `issueCode`: nobody resets an administrator's account alone, or one administrator could sign in as another and make every two-person rule one person's.
export const ADMINISTRATOR_NEEDS_SECOND_PERSON = fault(
  "ADMINISTRATOR_NEEDS_SECOND_PERSON",
  "This is an administrator's account, so a code for it needs a second person. Propose it under Changes awaiting a second person: one administrator proposes it, and a different one issues it and is shown it.",
  "Ini akaun pentadbir, jadi kod untuk akaunnya memerlukan orang kedua. Cadangkannya di bawah Perubahan yang menunggu orang kedua: seorang pentadbir mencadangkannya, dan pentadbir lain mengeluarkannya serta ditunjukkan kod itu.",
);
