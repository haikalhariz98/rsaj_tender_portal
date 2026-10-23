import { writeAudit } from "@/lib/audit/record";
import { AccountStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { codeVerdict, hashCode, normaliseCode } from "./codes";
import { signInOrganisation } from "./deployment";
import { failedSignInsFrom, recordSignInEvent } from "./events";
import { hashPool } from "./hash-pool";
import { auditActorOf, confirmStaffPassword, hasAdministrator, lockAccount, loginKeyOf } from "./identity";
import { lockoutVerdict, throttleSince } from "./lockout";
import { hashPassword, passwordFaults } from "./password";
import { loadSecurityPolicy } from "./policy-store";
import { signInSettings, unsetSettings } from "./policy";
import type { RequestFacts } from "./request";
import { signInRefusedForRole } from "./runtime-role-store";
import { cookieMaxAgeSeconds } from "./session-rules";
import { revokeAccountSessions } from "./session-store";
import { hashToken, newToken } from "./token";
import type { Fault, SecurityPolicyKey, StaffActor } from "./types";

/**
 * What an account holder does to their own account: change the password, use a one-time code, and acknowledge the notice that
 * their password was reset. Each is one transaction that writes the change, its audit row (with the holder as actor) and its sign-in
 * log row together. No password, hash, token or code is ever written to the audit trail or the log.
 */

export type FieldFaults = Partial<Record<"current" | "password" | "loginName" | "code", Fault>>;

export type ChangePasswordOutcome =
  | { ok: true; token: string; maxAgeSeconds: number }
  | { ok: false; kind: "FIELDS"; faults: FieldFaults }
  | { ok: false; kind: "LOCKED" }
  | { ok: false; kind: "THROTTLED" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

const WRONG_CURRENT: Fault = { code: "WRONG_CURRENT", en: "That is not your current password." };
const SAME_AS_CURRENT: Fault = { code: "SAME_AS_CURRENT", en: "Choose a password different from the current one." };

/**
 * Change the password of the signed-in account. The current password is asked for again and counts towards the lockout if wrong. Every other
 * session of the account ends, and this one gets a new token (the caller sets the cookie), so a token that leaked before the change dies with it.
 */
export async function changePassword(actor: StaffActor, input: { current: string; next: string }, request: RequestFacts, now: Date = new Date()): Promise<ChangePasswordOutcome> {
  const policy = await loadSecurityPolicy(db, actor.organisationId);
  const unset = unsetSettings(policy, "SIGN_IN", "SET_PASSWORD");
  const settings = signInSettings(policy);
  if (unset.length > 0 || !settings || policy?.passwordMinLength == null) return { ok: false, kind: "POLICY_NOT_SET", unset };

  const confirmed = await confirmStaffPassword(actor, input.current, request, now);
  if (!confirmed.ok) return confirmed.kind === "WRONG" ? { ok: false, kind: "FIELDS", faults: { current: WRONG_CURRENT } } : confirmed.kind === "LOCKED" ? { ok: false, kind: "LOCKED" } : confirmed.kind === "THROTTLED" ? { ok: false, kind: "THROTTLED" } : { ok: false, kind: "POLICY_NOT_SET", unset };

  const account = await db.staffAccount.findUniqueOrThrow({ where: { id: actor.accountId }, select: { loginName: true, passwordChangedAt: true, mustChangePassword: true } });
  const faults = passwordFaults(input.next, { loginName: account.loginName, minLength: policy.passwordMinLength });
  if (input.next === input.current) faults.push(SAME_AS_CURRENT);
  if (faults.length > 0) return { ok: false, kind: "FIELDS", faults: { password: faults[0] } };

  const passwordHash = await hashPool.run(() => hashPassword(input.next));
  const token = newToken();
  const maxAgeSeconds = await db.$transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    await tx.staffAccount.update({ where: { id: actor.accountId }, data: { passwordHash, passwordChangedAt: now, mustChangePassword: false } });
    await revokeAccountSessions(tx, actor.accountId, "PASSWORD_CHANGED", now, actor.sessionId);
    const session = await tx.staffSession.update({ where: { id: actor.sessionId }, data: { tokenHash: hashToken(token) }, select: { createdAt: true, absoluteExpiresAt: true } });
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "StaffAccount",
        entityId: actor.accountId,
        entityLabel: `Sign-in account of ${actor.personName}`,
        reason: "Password changed by the account holder",
        actor: { kind: "STAFF", personId: actor.personId, sessionId: actor.sessionId, offices: actor.offices, sourceAddress: request.sourceAddress },
      },
      "UPDATE",
      [
        { field: "passwordChangedAt", before: account.passwordChangedAt.toISOString(), after: now.toISOString() },
        ...(account.mustChangePassword ? [{ field: "mustChangePassword", before: "yes", after: "no" }] : []),
      ],
    );
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: actor.accountId, kind: "PASSWORD_CHANGED", request, at: now });
    return cookieMaxAgeSeconds(session, settings.staffAbsoluteMinutes, now);
  });
  return { ok: true, token, maxAgeSeconds };
}

export type UseCodeOutcome =
  | { ok: true }
  | { ok: false; kind: "FAILED" }
  | { ok: false; kind: "FIELDS"; faults: FieldFaults }
  | { ok: false; kind: "NOT_CONFIGURED" }
  | { ok: false; kind: "NO_ADMINISTRATOR" }
  | { ok: false; kind: "UNSAFE_DATABASE_ROLE" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

/**
 * Use a one-time code to set a new password (activation or reset). The same refusal whatever is wrong with the name or the code:
 * a name that matches nothing, a code that matches no account, a used or expired code, a disabled account. Using it ends every
 * session of the account, clears any lock, and marks the code used in the same transaction as the new password, so it cannot be used twice.
 */
export async function redeemOneTimeCode(input: { loginName: string; code: string; password: string }, request: RequestFacts, now: Date = new Date()): Promise<UseCodeOutcome> {
  const organisation = await signInOrganisation();
  if (!organisation) return { ok: false, kind: "NOT_CONFIGURED" };
  // As at sign-in (Phase 1d): a code sets a password only while the app runs as its own database role, in production.
  if (await signInRefusedForRole()) return { ok: false, kind: "UNSAFE_DATABASE_ROLE" };
  const policy = await loadSecurityPolicy(db, organisation.id);
  const unset = unsetSettings(policy, "SIGN_IN", "SET_PASSWORD");
  const settings = signInSettings(policy);
  if (unset.length > 0 || !settings || policy?.passwordMinLength == null) return { ok: false, kind: "POLICY_NOT_SET", unset };
  if (!(await hasAdministrator(organisation.id))) return { ok: false, kind: "NO_ADMINISTRATOR" };

  const loginKey = loginKeyOf(input.loginName);
  const found = loginKey ? await db.staffAccount.findUnique({ where: { loginKey }, include: { person: { select: { isActive: true, name: true } } } }) : null;
  const account = found && found.organisationId === organisation.id ? found : null;

  const recent = await failedSignInsFrom(db, organisation.id, request.sourceAddress, throttleSince(now, settings.addressThrottleMinutes));
  if (lockoutVerdict(null, recent, settings, now) === "THROTTLED") {
    await recordSignInEvent(db, { organisationId: organisation.id, staffAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  const refuse = async (): Promise<UseCodeOutcome> => {
    await recordSignInEvent(db, { organisationId: organisation.id, staffAccountId: account?.id ?? null, kind: "FAILED", request, at: now });
    return { ok: false, kind: "FAILED" };
  };

  const normalised = normaliseCode(input.code);
  const row = normalised ? await db.oneTimeCode.findUnique({ where: { codeHash: hashCode(normalised) } }) : null;
  const usable =
    account != null &&
    row != null &&
    row.store === "STAFF" &&
    row.staffAccountId === account.id &&
    row.organisationId === organisation.id &&
    codeVerdict(row, now) === "VALID" &&
    account.person.isActive &&
    codeFitsAccount(row.purpose, account.status);
  if (!usable) return refuse();

  const faults = passwordFaults(input.password, { loginName: account.loginName, minLength: policy.passwordMinLength });
  if (faults.length > 0) return { ok: false, kind: "FIELDS", faults: { password: faults[0] } };

  const passwordHash = await hashPool.run(() => hashPassword(input.password));
  const done = await db.$transaction(async (tx) => {
    await lockAccount(tx, account.id);
    // What was true when the code was judged may not be now: the hash took a while, and an account may have been disabled or its person made inactive. Judged again under the lock, before anything is written (and so before the code is spent).
    const before = await tx.staffAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { status: true, mustChangePassword: true, resetNoticePending: true, passwordChangedAt: true, person: { select: { isActive: true } } },
    });
    if (!before.person.isActive || !codeFitsAccount(row.purpose, before.status)) return false;
    // Used once: the first transaction to mark it wins, and any other finds it already marked.
    const marked = await tx.oneTimeCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (marked.count !== 1) return false;
    // Every other code still open for the account is spent with it, so a letter left over cannot set a password later. "Used" here also means "voided by a later one".
    const voided = await tx.oneTimeCode.updateMany({ where: { store: "STAFF", staffAccountId: account.id, usedAt: null, id: { not: row.id } }, data: { usedAt: now } });
    const resetNoticePending = row.purpose === "RESET";
    await tx.staffAccount.update({
      where: { id: account.id },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: false, status: AccountStatus.ACTIVE, failedAttempts: 0, lockedUntil: null, resetNoticePending },
    });
    await revokeAccountSessions(tx, account.id, "CODE_USED", now);
    const actor = await auditActorOf(tx, account.personId, null, organisation.id, request, now);
    await writeAudit(
      tx,
      {
        organisationId: organisation.id,
        entity: "StaffAccount",
        entityId: account.id,
        entityLabel: `Sign-in account of ${account.person.name}`,
        reason: row.purpose === "ACTIVATION" ? "Account activated with a one-time code" : "Password set with a one-time code after a reset",
        actor,
      },
      "UPDATE",
      [
        { field: "passwordChangedAt", before: before.passwordChangedAt.toISOString(), after: now.toISOString() },
        ...(before.status !== "ACTIVE" ? [{ field: "status", before: before.status, after: "ACTIVE" }] : []),
        ...(before.mustChangePassword ? [{ field: "mustChangePassword", before: "yes", after: "no" }] : []),
        ...(before.resetNoticePending !== resetNoticePending ? [{ field: "resetNoticePending", before: before.resetNoticePending ? "yes" : "no", after: resetNoticePending ? "yes" : "no" }] : []),
        ...(voided.count > 0 ? [{ field: "otherOpenOneTimeCodes", before: String(voided.count), after: "0" }] : []),
      ],
    );
    await recordSignInEvent(tx, { organisationId: organisation.id, staffAccountId: account.id, kind: "CODE_USED", request, at: now });
    await recordSignInEvent(tx, { organisationId: organisation.id, staffAccountId: account.id, kind: "PASSWORD_CHANGED", request, at: now });
    return true;
  });
  return done ? { ok: true } : refuse();
}

/// Which code may be used on an account in which state. An activation code is for an account that has not been activated: after that it is a dead letter, not a way to set the password of a live account. A reset code is for one that is active.
function codeFitsAccount(purpose: "ACTIVATION" | "RESET", status: string): boolean {
  return purpose === "ACTIVATION" ? status === "PENDING_ACTIVATION" : status === "ACTIVE";
}

/// "Your password was reset" is said until the person says they have seen it.
export async function acknowledgeResetNotice(actor: StaffActor, request: RequestFacts): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    const { count } = await tx.staffAccount.updateMany({ where: { id: actor.accountId, resetNoticePending: true }, data: { resetNoticePending: false } });
    if (count === 0) return;
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "StaffAccount",
        entityId: actor.accountId,
        entityLabel: `Sign-in account of ${actor.personName}`,
        reason: "The account holder acknowledged the notice that their password was reset",
        actor: { kind: "STAFF", personId: actor.personId, sessionId: actor.sessionId, offices: actor.offices, sourceAddress: request.sourceAddress },
      },
      "UPDATE",
      [{ field: "resetNoticePending", before: "yes", after: "no" }],
    );
  });
}

