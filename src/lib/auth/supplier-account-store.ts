import { writeAudit } from "@/lib/audit/record";
import { AccountStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

import { codeVerdict, hashCode, normaliseCode } from "./codes";
import { signInOrganisation } from "./deployment";
import { failedSignInsFrom, recordSignInEvent } from "./events";
import { hashPool } from "./hash-pool";
import { loginKeyOf } from "./identity";
import { lockoutVerdict, throttleSince } from "./lockout";
import { hashPassword, passwordFaults } from "./password";
import { supplierSignInSettings, unsetSettings } from "./policy";
import { loadSecurityPolicy } from "./policy-store";
import type { RequestFacts } from "./request";
import { signInRefusedForRole } from "./runtime-role-store";
import { cookieMaxAgeSeconds } from "./session-rules";
import { confirmSupplierPassword, lockSupplierAccount } from "./supplier-identity";
import { revokeSupplierAccountSessions } from "./supplier-session-store";
import { hashToken, newToken } from "./token";
import type { Fault, SecurityPolicyKey, SupplierActor } from "./types";

/**
 * What a supplier does to their own account: use a one-time code (to activate it, or to reset a password), change the password, and acknowledge the notice that
 * the password was reset. The staff store's `account-store.ts` for the other store: each is one transaction that writes the change, its audit row (with the holder as actor)
 * and its sign-in log row together. No password, hash, token or code is ever written to the audit trail or the log.
 */

export type SupplierFieldFaults = Partial<Record<"current" | "password" | "loginName" | "code", Fault>>;

const WRONG_CURRENT: Fault = { code: "WRONG_CURRENT", en: "That is not your current password.", ms: "Itu bukan kata laluan semasa anda." };
const SAME_AS_CURRENT: Fault = { code: "SAME_AS_CURRENT", en: "Choose a password different from the current one.", ms: "Pilih kata laluan yang berbeza daripada yang semasa." };

export type ChangeSupplierPasswordOutcome =
  | { ok: true; token: string; maxAgeSeconds: number }
  | { ok: false; kind: "FIELDS"; faults: SupplierFieldFaults }
  | { ok: false; kind: "LOCKED" }
  | { ok: false; kind: "THROTTLED" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

/**
 * Change the password of the signed-in supplier account. The current password is asked for again and counts towards the lockout if wrong. Every other session of the
 * account ends, and this one gets a new token (the caller sets the cookie), so a token that leaked before the change dies with it.
 */
export async function changeSupplierPassword(actor: SupplierActor, input: { current: string; next: string }, request: RequestFacts, now: Date = new Date()): Promise<ChangeSupplierPasswordOutcome> {
  const policy = await loadSecurityPolicy(db, actor.organisationId);
  const unset = unsetSettings(policy, "SUPPLIER_SIGN_IN", "SET_PASSWORD");
  const settings = supplierSignInSettings(policy);
  if (unset.length > 0 || !settings || policy?.passwordMinLength == null) return { ok: false, kind: "POLICY_NOT_SET", unset };

  const confirmed = await confirmSupplierPassword(actor, input.current, request, now);
  if (!confirmed.ok) return confirmed.kind === "WRONG" ? { ok: false, kind: "FIELDS", faults: { current: WRONG_CURRENT } } : confirmed.kind === "LOCKED" ? { ok: false, kind: "LOCKED" } : confirmed.kind === "THROTTLED" ? { ok: false, kind: "THROTTLED" } : { ok: false, kind: "POLICY_NOT_SET", unset };

  const account = await db.supplierAccount.findFirstOrThrow({ where: { id: actor.accountId, organisationId: actor.organisationId }, select: { loginName: true, passwordChangedAt: true, mustChangePassword: true } });
  const faults = passwordFaults(input.next, { loginName: account.loginName, minLength: policy.passwordMinLength });
  if (input.next === input.current) faults.push(SAME_AS_CURRENT);
  if (faults.length > 0) return { ok: false, kind: "FIELDS", faults: { password: faults[0] } };

  const passwordHash = await hashPool.run(() => hashPassword(input.next));
  const token = newToken();
  const maxAgeSeconds = await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, actor.accountId);
    await tx.supplierAccount.update({ where: { id: actor.accountId, organisationId: actor.organisationId }, data: { passwordHash, passwordChangedAt: now, mustChangePassword: false } });
    await revokeSupplierAccountSessions(tx, actor.accountId, "PASSWORD_CHANGED", now, actor.sessionId);
    const session = await tx.supplierSession.update({ where: { id: actor.sessionId }, data: { tokenHash: hashToken(token) }, select: { createdAt: true, absoluteExpiresAt: true } });
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "SupplierAccount",
        entityId: actor.accountId,
        entityLabel: "Supplier portal account",
        reason: "Password changed by the account holder",
        actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: request.sourceAddress },
      },
      "UPDATE",
      [
        { field: "passwordChangedAt", before: account.passwordChangedAt.toISOString(), after: now.toISOString() },
        ...(account.mustChangePassword ? [{ field: "mustChangePassword", before: "yes", after: "no" }] : []),
      ],
    );
    await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: actor.accountId, kind: "PASSWORD_CHANGED", request, at: now });
    return cookieMaxAgeSeconds(session, settings.supplierAbsoluteMinutes, now);
  });
  return { ok: true, token, maxAgeSeconds };
}

export type UseSupplierCodeOutcome =
  | { ok: true }
  | { ok: false; kind: "FAILED" }
  | { ok: false; kind: "FIELDS"; faults: SupplierFieldFaults }
  | { ok: false; kind: "NOT_CONFIGURED" }
  | { ok: false; kind: "UNSAFE_DATABASE_ROLE" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

/// Which code may be used on an account in which state: an activation code is for one that has not been activated, a reset code for one that is active.
export function supplierCodeFitsAccount(purpose: "ACTIVATION" | "RESET", status: string): boolean {
  return purpose === "ACTIVATION" ? status === "PENDING_ACTIVATION" : status === "ACTIVE";
}

/**
 * Use a one-time code to set a new password. `purpose` is the door the code was brought to: the activation page takes only an activation code and the reset page only a
 * reset code, so a letter meant for one cannot be spent at the other. The same refusal whatever is wrong with the name or the code: a name that matches nothing, a code
 * that matches no account, a used or expired code, one of the other purpose, a disabled account, a retired contact. Using it ends every session of the account, clears
 * any lock, and marks the code used in the same transaction as the new password, so it cannot be used twice.
 */
export async function redeemSupplierCode(input: { purpose: "ACTIVATION" | "RESET"; loginName: string; code: string; password: string }, request: RequestFacts, now: Date = new Date()): Promise<UseSupplierCodeOutcome> {
  const organisation = await signInOrganisation();
  if (!organisation) return { ok: false, kind: "NOT_CONFIGURED" };
  if (await signInRefusedForRole()) return { ok: false, kind: "UNSAFE_DATABASE_ROLE" };
  const policy = await loadSecurityPolicy(db, organisation.id);
  const unset = unsetSettings(policy, "SUPPLIER_SIGN_IN", "SET_PASSWORD");
  const settings = supplierSignInSettings(policy);
  if (unset.length > 0 || !settings || policy?.passwordMinLength == null) return { ok: false, kind: "POLICY_NOT_SET", unset };

  const loginKey = loginKeyOf(input.loginName);
  const found = loginKey ? await db.supplierAccount.findUnique({ where: { loginKey }, include: { contact: { select: { retiredOn: true } } } }) : null;
  const account = found && found.organisationId === organisation.id ? found : null;

  const recent = await failedSignInsFrom(db, organisation.id, request.sourceAddress, throttleSince(now, settings.addressThrottleMinutes), "SUPPLIER");
  if (lockoutVerdict(null, recent, settings, now) === "THROTTLED") {
    await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  const refuse = async (): Promise<UseSupplierCodeOutcome> => {
    await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: "FAILED", request, at: now });
    return { ok: false, kind: "FAILED" };
  };

  const normalised = normaliseCode(input.code);
  const row = normalised ? await db.oneTimeCode.findUnique({ where: { codeHash: hashCode(normalised) } }) : null;
  const usable =
    account != null &&
    row != null &&
    row.store === "SUPPLIER" &&
    row.supplierAccountId === account.id &&
    row.organisationId === organisation.id &&
    row.purpose === input.purpose &&
    codeVerdict(row, now) === "VALID" &&
    account.contact.retiredOn == null &&
    supplierCodeFitsAccount(row.purpose, account.status);
  if (!usable) return refuse();

  const faults = passwordFaults(input.password, { loginName: account.loginName, minLength: policy.passwordMinLength });
  if (faults.length > 0) return { ok: false, kind: "FIELDS", faults: { password: faults[0] } };

  const passwordHash = await hashPool.run(() => hashPassword(input.password));
  const done = await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, account.id);
    // What was true when the code was judged may not be now: the hash took a while, and an account may have been disabled or its contact retired. Judged again under the lock, before anything is written.
    const before = await tx.supplierAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { status: true, mustChangePassword: true, resetNoticePending: true, passwordChangedAt: true, contact: { select: { retiredOn: true } } },
    });
    if (before.contact.retiredOn != null || !supplierCodeFitsAccount(row.purpose, before.status)) return false;
    // Used once: the first transaction to mark it wins, and any other finds it already marked.
    const marked = await tx.oneTimeCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (marked.count !== 1) return false;
    // Every other code still open for the account is spent with it, so a letter left over cannot set a password later.
    const voided = await tx.oneTimeCode.updateMany({ where: { store: "SUPPLIER", supplierAccountId: account.id, usedAt: null, id: { not: row.id } }, data: { usedAt: now } });
    const resetNoticePending = row.purpose === "RESET";
    await tx.supplierAccount.update({
      where: { id: account.id },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: false, status: AccountStatus.ACTIVE, failedAttempts: 0, lockedUntil: null, resetNoticePending },
    });
    await revokeSupplierAccountSessions(tx, account.id, "CODE_USED", now);
    await writeAudit(
      tx,
      {
        organisationId: organisation.id,
        entity: "SupplierAccount",
        entityId: account.id,
        entityLabel: "Supplier portal account",
        reason: row.purpose === "ACTIVATION" ? "Account activated with a one-time code" : "Password set with a one-time code after a reset",
        actor: { kind: "SUPPLIER", supplierAccountId: account.id, sessionId: null, sourceAddress: request.sourceAddress },
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
    await recordSignInEvent(tx, { organisationId: organisation.id, supplierAccountId: account.id, kind: "CODE_USED", request, at: now });
    await recordSignInEvent(tx, { organisationId: organisation.id, supplierAccountId: account.id, kind: "PASSWORD_CHANGED", request, at: now });
    return true;
  });
  return done ? { ok: true } : refuse();
}

/// "Your password was reset" is said until the person says they have seen it.
export async function acknowledgeSupplierResetNotice(actor: SupplierActor, request: RequestFacts): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, actor.accountId);
    const { count } = await tx.supplierAccount.updateMany({ where: { id: actor.accountId, organisationId: actor.organisationId, resetNoticePending: true }, data: { resetNoticePending: false } });
    if (count === 0) return;
    await writeAudit(
      tx,
      {
        organisationId: actor.organisationId,
        entity: "SupplierAccount",
        entityId: actor.accountId,
        entityLabel: "Supplier portal account",
        reason: "The account holder acknowledged the notice that their password was reset",
        actor: { kind: "SUPPLIER", supplierAccountId: actor.accountId, sessionId: actor.sessionId, sourceAddress: request.sourceAddress },
      },
      "UPDATE",
      [{ field: "resetNoticePending", before: "yes", after: "no" }],
    );
  });
}
