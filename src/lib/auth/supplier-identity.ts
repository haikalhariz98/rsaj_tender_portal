import type { Tx } from "@/lib/audit/record";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { signInOrganisation } from "./deployment";
import { failedSignInsFrom, recordSignInEvent } from "./events";
import { HASH_QUEUE_LIMIT, hashPool } from "./hash-pool";
import { loginKeyOf, type Credentials, type IdentityProvider } from "./identity";
import { afterFailedAttempt, afterSuccess, isLocked, lockoutVerdict, throttleSince, type AccountLockState } from "./lockout";
import { dummyHash, hashParameters, hashPassword, verifyPassword } from "./password";
import { supplierSignInSettings, unsetSettings, type SupplierSignInSettings } from "./policy";
import { loadSecurityPolicy } from "./policy-store";
import type { RequestFacts } from "./request";
import { signInRefusedForRole } from "./runtime-role-store";
import { concurrentSessionPlan, cookieMaxAgeSeconds } from "./session-rules";
import { createSupplierSession, openSupplierSessions, revokeSupplierAccountSessions } from "./supplier-session-store";
import { hashToken, looksLikeToken, newToken } from "./token";
import type { SecurityPolicyKey, SupplierActor } from "./types";

/**
 * The supplier store's adapter of the identity façade (ADR 0034 D1, Phase 4a): `SupplierCredentials`. The same rules as the staff store's, for the other table: the
 * password is hashed with the same scrypt and checked after the same one hash whatever went wrong, the address is judged before any hash, a wrong password counts in the
 * database, and a stranger is told "sign-in failed" for a wrong password, a locked account, a held-back address, an account waiting for its code and a name that does not exist.
 *
 * What differs: the account is a contact's, so it also needs the contact not retired; the timeouts are the supplier's; and it signs in on the public copy only (the
 * handlers in `src/app/supplier/sign-in` refuse on the other).
 */

export type SupplierSignInOutcome =
  | { ok: true; token: string; maxAgeSeconds: number; mustChangePassword: boolean; resetNoticePending: boolean; accountId: string }
  | { ok: false; kind: "FAILED" }
  | { ok: false; kind: "SESSION_LIMIT" }
  | { ok: false; kind: "NOT_CONFIGURED" }
  | { ok: false; kind: "UNSAFE_DATABASE_ROLE" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

export type SupplierConfirmOutcome = { ok: true; at: Date } | { ok: false; kind: "WRONG" | "LOCKED" | "THROTTLED" | "POLICY_NOT_SET" };

/// The row lock every change to a supplier account's counters and sessions queues on. `FOR NO KEY UPDATE`, as the staff account's is: a log row and a session name the account by a foreign key.
export async function lockSupplierAccount(tx: Tx, accountId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "SupplierAccount" WHERE id = ${accountId} FOR NO KEY UPDATE`;
}

const MAX_LOGIN_NAME = 128;
const MAX_PASSWORD_INPUT = 1024;

type Found = { id: string; status: string; passwordHash: string; failedAttempts: number; lockedUntil: Date | null; organisationId: string; contact: { retiredOn: Date | null } };

const usable = (account: Found | null) => account != null && account.status === "ACTIVE" && account.contact.retiredOn == null;

async function failAttempt(organisationId: string, account: { id: string; status: string; contact: { retiredOn: Date | null } } | null, verdict: "ALLOW" | "LOCKED" | "THROTTLED", settings: SupplierSignInSettings, request: RequestFacts, now: Date): Promise<void> {
  const fit = account != null && account.status === "ACTIVE" && account.contact.retiredOn == null;
  if (!fit || verdict !== "ALLOW") {
    await recordSignInEvent(db, { organisationId, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: verdict === "LOCKED" ? "LOCKED_OUT" : "FAILED", request, at: now });
    return;
  }
  await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, account.id);
    const row = await tx.supplierAccount.findUniqueOrThrow({ where: { id: account.id }, select: { failedAttempts: true, lockedUntil: true } });
    const next = afterFailedAttempt(row, settings, now);
    if (next.failedAttempts !== row.failedAttempts || next.lockedUntil?.getTime() !== row.lockedUntil?.getTime()) {
      await tx.supplierAccount.update({ where: { id: account.id }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
    }
    await recordSignInEvent(tx, { organisationId, supplierAccountId: account.id, kind: isLocked(next, now) ? "LOCKED_OUT" : "FAILED", request, at: now });
  });
}

export const SupplierCredentials: IdentityProvider<SupplierActor, SupplierSignInOutcome, SupplierConfirmOutcome> = {
  name: "SupplierCredentials",

  async authenticate(credentials, { request, replacingToken }) {
    return authenticateSupplier(credentials, request, replacingToken);
  },

  async confirmPassword(actor, password, request) {
    return confirmSupplierPassword(actor, password, request);
  },
};

export async function authenticateSupplier(credentials: Credentials, request: RequestFacts, replacingToken: string | null, now: Date = new Date()): Promise<SupplierSignInOutcome> {
  const organisation = await signInOrganisation();
  if (!organisation) return { ok: false, kind: "NOT_CONFIGURED" };
  if (await signInRefusedForRole()) return { ok: false, kind: "UNSAFE_DATABASE_ROLE" };

  const policy = await loadSecurityPolicy(db, organisation.id);
  const unset = unsetSettings(policy, "SUPPLIER_SIGN_IN");
  const settings = supplierSignInSettings(policy);
  if (unset.length > 0 || !settings) return { ok: false, kind: "POLICY_NOT_SET", unset };

  const loginKey = loginKeyOf(credentials.loginName);
  if (loginKey === "" || loginKey.length > MAX_LOGIN_NAME || credentials.password.length > MAX_PASSWORD_INPUT) {
    await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", kind: "FAILED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  const since = throttleSince(now, settings.addressThrottleMinutes);
  const recent = await failedSignInsFrom(db, organisation.id, request.sourceAddress, since, "SUPPLIER");
  const found = await db.supplierAccount.findUnique({ where: { loginKey }, include: { contact: { select: { retiredOn: true } } } });
  const account = found && found.organisationId === organisation.id ? found : null;
  const verdict = lockoutVerdict(account, recent, settings, now);
  if (verdict === "THROTTLED") {
    await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  const eligible = usable(account) && verdict === "ALLOW";
  const stored = eligible ? account!.passwordHash : await dummyHash();
  if (hashPool.waiting >= HASH_QUEUE_LIMIT) {
    await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }
  const checked = await hashPool.run(async () => {
    // The count above was taken before this attempt waited for a hash slot: take it again at the front of the queue, so that a burst is held to the limit.
    if ((await failedSignInsFrom(db, organisation.id, request.sourceAddress, since, "SUPPLIER")) >= settings.addressThrottleAttempts) {
      await recordSignInEvent(db, { organisationId: organisation.id, store: "SUPPLIER", supplierAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
      return null;
    }
    const result = await verifyPassword(stored, credentials.password);
    // A failure is written before the slot is given up, or the next attempt in the queue would count without it.
    if (!eligible || !result.ok) {
      await failAttempt(organisation.id, account, verdict === "LOCKED" ? "LOCKED" : "ALLOW", settings, request, now);
      return null;
    }
    return result;
  });
  if (checked === null || !eligible) return { ok: false, kind: "FAILED" };

  const upgraded = checked.needsRehash ? await hashPool.run(() => hashPassword(credentials.password)) : null;
  return completeSignIn({ organisationId: organisation.id, accountId: account!.id, settings, request, replacingToken, upgradedHash: upgraded, previousHash: account!.passwordHash, now });
}

async function completeSignIn(input: {
  organisationId: string;
  accountId: string;
  settings: SupplierSignInSettings;
  request: RequestFacts;
  replacingToken: string | null;
  upgradedHash: string | null;
  previousHash: string;
  now: Date;
}): Promise<SupplierSignInOutcome> {
  const { organisationId, accountId, settings, request, now } = input;
  return db.$transaction(async (tx): Promise<SupplierSignInOutcome> => {
    await lockSupplierAccount(tx, accountId);
    // What was true when the password was checked may not be now: an attempt in flight beside this one may have locked the account, or the contact may have been retired.
    const account = await tx.supplierAccount.findUniqueOrThrow({ where: { id: accountId }, include: { contact: { select: { retiredOn: true, name: true } } } });
    if (account.status !== "ACTIVE" || account.contact.retiredOn != null || isLocked(account, now)) {
      await recordSignInEvent(tx, { organisationId, supplierAccountId: accountId, kind: isLocked(account, now) ? "LOCKED_OUT" : "FAILED", request, at: now });
      return { ok: false, kind: "FAILED" };
    }
    // The password was checked against the hash read before this attempt waited for a hash slot. If it was changed or reset since, that check is of a password that no longer opens the account.
    if (account.passwordHash !== input.previousHash) {
      await recordSignInEvent(tx, { organisationId, supplierAccountId: accountId, kind: "FAILED", request, at: now });
      return { ok: false, kind: "FAILED" };
    }

    const limits = { idleMinutes: settings.supplierIdleMinutes, absoluteMinutes: settings.supplierAbsoluteMinutes };
    const open = await openSupplierSessions(tx, accountId, limits, now);
    const plan = concurrentSessionPlan(open, settings);
    if (!plan.ok) {
      await recordSignInEvent(tx, { organisationId, supplierAccountId: accountId, kind: plan.reason === "REFUSED_AT_LIMIT" ? "SESSION_LIMIT" : "FAILED", request, at: now });
      return { ok: false, kind: plan.reason === "REFUSED_AT_LIMIT" ? "SESSION_LIMIT" : "FAILED" };
    }
    for (const id of plan.revoke) {
      await tx.supplierSession.update({ where: { id }, data: { revokedAt: now, revokedReason: "CONCURRENT_LIMIT" } });
      await recordSignInEvent(tx, { organisationId, supplierAccountId: accountId, kind: "REVOKED", at: now });
    }
    // A cookie the browser already holds is never reused: sign-in always gives a new token (session fixation), and the old session ends.
    if (looksLikeToken(input.replacingToken)) {
      await tx.supplierSession.updateMany({ where: { tokenHash: hashToken(input.replacingToken), revokedAt: null }, data: { revokedAt: now, revokedReason: "REPLACED" } });
    }

    const token = newToken();
    const session = await createSupplierSession(tx, { organisationId, accountId, tokenHash: hashToken(token), absoluteMinutes: settings.supplierAbsoluteMinutes, request, now });
    const cleared = afterSuccess();
    await tx.supplierAccount.update({
      where: { id: accountId },
      data: { failedAttempts: cleared.failedAttempts, lockedUntil: cleared.lockedUntil, lastSignInAt: now, ...(input.upgradedHash ? { passwordHash: input.upgradedHash } : {}) },
    });
    if (input.upgradedHash) {
      await writeAudit(
        tx,
        { organisationId, entity: "SupplierAccount", entityId: accountId, entityLabel: "Supplier portal account", reason: "Password hash re-made with the current parameters at a good sign-in", actor: { kind: "SUPPLIER", supplierAccountId: accountId, sessionId: session.id, sourceAddress: request.sourceAddress } },
        "UPDATE",
        [{ field: "passwordHashParameters", before: hashParameters(input.previousHash), after: hashParameters(input.upgradedHash) }],
      );
    }
    await recordSignInEvent(tx, { organisationId, supplierAccountId: accountId, kind: "SIGNED_IN", request, at: now });

    return {
      ok: true,
      token,
      maxAgeSeconds: cookieMaxAgeSeconds({ createdAt: now, absoluteExpiresAt: session.absoluteExpiresAt }, settings.supplierAbsoluteMinutes, now),
      mustChangePassword: account.mustChangePassword,
      resetNoticePending: account.resetNoticePending,
      accountId,
    };
  });
}

/**
 * The signed-in supplier gives their password again, for an act that asks it (the registration's declarations, a signature of the contractor's: Phase 4b on). The
 * B0 prerequisite of the CPD registration: asked every time, with no window; a wrong one counts towards the account's lockout like any other and is logged
 * (`STEP_UP_FAILED`, which also counts against the address); a right one is logged and stamped on the session.
 */
export async function confirmSupplierPassword(actor: SupplierActor, password: string, request: RequestFacts, now: Date = new Date()): Promise<SupplierConfirmOutcome> {
  const settings = supplierSignInSettings(await loadSecurityPolicy(db, actor.organisationId));
  if (!settings) return { ok: false, kind: "POLICY_NOT_SET" };
  const account = await db.supplierAccount.findUnique({ where: { id: actor.accountId }, select: { passwordHash: true, failedAttempts: true, lockedUntil: true, status: true, organisationId: true, contact: { select: { retiredOn: true } } } });
  const locked = account != null && isLocked(account, now);
  const fit = account != null && account.status === "ACTIVE" && account.contact.retiredOn == null && account.organisationId === actor.organisationId && !locked && password.length <= MAX_PASSWORD_INPUT;

  // The caller is already signed in, so a quick refusal reveals nothing: a locked or unfit account is refused WITHOUT a hash. Otherwise one session could queue a hash per request
  // and fill the pool the public sign-in shares (threat model B2); an address that has failed too often, or a queue that is full, is held back the way the sign-in holds it.
  if (!fit) {
    await failStepUp(actor, settings, request, now);
    return { ok: false, kind: locked ? "LOCKED" : "WRONG" };
  }
  const since = throttleSince(now, settings.addressThrottleMinutes);
  if (hashPool.waiting >= HASH_QUEUE_LIMIT || (await failedSignInsFrom(db, actor.organisationId, request.sourceAddress, since, "SUPPLIER")) >= settings.addressThrottleAttempts) {
    await recordSignInEvent(db, { organisationId: actor.organisationId, store: "SUPPLIER", supplierAccountId: actor.accountId, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "THROTTLED" };
  }
  const checked = await hashPool.run(async () => {
    // The count above was taken before this attempt waited for a hash slot: take it again at the front of the queue, so that a burst is held to the limit.
    if ((await failedSignInsFrom(db, actor.organisationId, request.sourceAddress, since, "SUPPLIER")) >= settings.addressThrottleAttempts) return null;
    const result = await verifyPassword(account!.passwordHash, password);
    // A failure is written before the slot is given up, or the next attempt in the queue would count without it.
    if (!result.ok) await failStepUp(actor, settings, request, now);
    return result;
  });
  if (checked === null) {
    await recordSignInEvent(db, { organisationId: actor.organisationId, store: "SUPPLIER", supplierAccountId: actor.accountId, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "THROTTLED" };
  }
  if (!checked.ok) return { ok: false, kind: "WRONG" };

  await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, actor.accountId);
    const cleared = afterSuccess();
    await tx.supplierAccount.update({ where: { id: actor.accountId }, data: { failedAttempts: cleared.failedAttempts, lockedUntil: cleared.lockedUntil } });
    await tx.supplierSession.updateMany({ where: { id: actor.sessionId, revokedAt: null }, data: { stepUpAt: now } });
    await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: actor.accountId, kind: "STEP_UP_OK", request, at: now });
  });
  return { ok: true, at: now };
}

/// A step-up that failed: counted against the account (a locked account's count does not move) and logged, which also counts against the address.
async function failStepUp(actor: SupplierActor, settings: SupplierSignInSettings, request: RequestFacts, now: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, actor.accountId);
    const row = await tx.supplierAccount.findUniqueOrThrow({ where: { id: actor.accountId }, select: { failedAttempts: true, lockedUntil: true } });
    const next: AccountLockState = afterFailedAttempt(row, settings, now);
    await tx.supplierAccount.update({ where: { id: actor.accountId }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
    await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: actor.accountId, kind: "STEP_UP_FAILED", request, at: now });
  });
}

/// End every session a supplier account has, for the account's own "sign out everywhere". Gives back how many it ended.
export async function supplierSignOutEverywhere(actor: SupplierActor, request: RequestFacts, now: Date = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    await lockSupplierAccount(tx, actor.accountId);
    const count = await revokeSupplierAccountSessions(tx, actor.accountId, "SIGNED_OUT_EVERYWHERE", now);
    await recordSignInEvent(tx, { organisationId: actor.organisationId, supplierAccountId: actor.accountId, kind: "SIGNED_OUT", request, at: now });
    return count;
  });
}

