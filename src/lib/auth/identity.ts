import type { Tx } from "@/lib/audit/record";
import { AccountStatus } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit/record";
import { db } from "@/lib/db";

import { signInOrganisation } from "./deployment";
import { failedSignInsFrom, recordSignInEvent } from "./events";
import { HASH_QUEUE_LIMIT, hashPool } from "./hash-pool";
import { afterFailedAttempt, afterSuccess, isLocked, lockoutVerdict, throttleSince, type AccountLockState } from "./lockout";
import { dummyHash, hashParameters, hashPassword, verifyPassword } from "./password";
import { loadSecurityPolicy } from "./policy-store";
import { signInSettings, unsetSettings, type SignInSettings } from "./policy";
import type { RequestFacts } from "./request";
import { signInRefusedForRole } from "./runtime-role-store";
import { officesHeld, openSessions, createStaffSession, revokeAccountSessions } from "./session-store";
import { concurrentSessionPlan, cookieMaxAgeSeconds } from "./session-rules";
import { hashToken, looksLikeToken, newToken } from "./token";
import type { AuditActor, SecurityPolicyKey, StaffActor } from "./types";

/**
 * The identity façade (ADR 0034 D1). Everything above it asks "who is this, and may they in?" and never how that was decided, so a
 * corporate directory can later replace the local store without touching a screen or an action.
 *
 * Only `StaffCredentials` exists: staff accounts, passwords hashed here. `SupplierCredentials` comes with the supplier portal
 * (Phase 4), a separate table and a separate cookie. `DirectoryCredentials` is named and left unconfigured (INT-14: no directory is connected).
 *
 * What a stranger can learn is the same whatever went wrong. A wrong password, a locked account, a held-back address, a disabled
 * account and a name that does not exist all come back as `FAILED`, after the same work (one hash is always computed once an
 * address is allowed), and the sign-in log records which it was.
 */

export interface Credentials {
  loginName: string;
  password: string;
}

export type SignInOutcome =
  | { ok: true; token: string; maxAgeSeconds: number; mustChangePassword: boolean; resetNoticePending: boolean; accountId: string }
  | { ok: false; kind: "FAILED" }
  | { ok: false; kind: "SESSION_LIMIT" }
  | { ok: false; kind: "NOT_CONFIGURED" }
  | { ok: false; kind: "NO_ADMINISTRATOR" }
  | { ok: false; kind: "UNSAFE_DATABASE_ROLE" }
  | { ok: false; kind: "POLICY_NOT_SET"; unset: SecurityPolicyKey[] };

export type ConfirmOutcome = { ok: true; at: Date } | { ok: false; kind: "WRONG" | "LOCKED" | "THROTTLED" | "POLICY_NOT_SET" };

/// One façade, two stores (ADR 0034 D1): `StaffCredentials` (here) and `SupplierCredentials` (`supplier-identity.ts`, Phase 4a) differ in the actor they confirm and in what a refusal can be.
export interface IdentityProvider<A = StaffActor, S = SignInOutcome, C = ConfirmOutcome> {
  readonly name: string;
  authenticate(credentials: Credentials, context: { request: RequestFacts; replacingToken: string | null }): Promise<S>;
  /// The signed-in person gives their password again, for an act that needs it. A second factor, when authorised, attaches here.
  confirmPassword(actor: A, password: string, request: RequestFacts): Promise<C>;
}

/// The row lock every change to an account's counters and sessions queues on. `FOR NO KEY UPDATE`, never `FOR UPDATE`: a sign-in log row and a session name the account by a foreign key, and `FOR UPDATE` would conflict with the key-share lock their inserts take (the lesson of Phase 0's organisation lock).
export async function lockAccount(tx: Tx, accountId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "StaffAccount" WHERE id = ${accountId} FOR NO KEY UPDATE`;
}

export async function hasAdministrator(organisationId: string): Promise<boolean> {
  return (await db.staffAccount.count({ where: { organisationId, isAdministrator: true, status: AccountStatus.ACTIVE } })) > 0;
}

const MAX_LOGIN_NAME = 128;
/// Longer than any password accepted (256): what lies beyond is refused without being hashed.
const MAX_PASSWORD_INPUT = 1024;

export const loginKeyOf = (loginName: string) => loginName.trim().toLowerCase();

async function failAttempt(
  organisationId: string,
  account: { id: string; status: string; person: { isActive: boolean } } | null,
  verdict: "ALLOW" | "LOCKED" | "THROTTLED",
  settings: SignInSettings,
  request: RequestFacts,
  now: Date,
): Promise<void> {
  const usable = account != null && account.status === "ACTIVE" && account.person.isActive;
  if (!usable || verdict !== "ALLOW") {
    await recordSignInEvent(db, { organisationId, staffAccountId: account?.id ?? null, kind: verdict === "LOCKED" ? "LOCKED_OUT" : "FAILED", request, at: now });
    return;
  }
  await db.$transaction(async (tx) => {
    await lockAccount(tx, account.id);
    const row = await tx.staffAccount.findUniqueOrThrow({ where: { id: account.id }, select: { failedAttempts: true, lockedUntil: true } });
    const next = afterFailedAttempt(row, settings, now);
    if (next.failedAttempts !== row.failedAttempts || next.lockedUntil?.getTime() !== row.lockedUntil?.getTime()) {
      await tx.staffAccount.update({ where: { id: account.id }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
    }
    const lockedNow = isLocked(next, now);
    await recordSignInEvent(tx, { organisationId, staffAccountId: account.id, kind: lockedNow ? "LOCKED_OUT" : "FAILED", request, at: now });
  });
}

export const StaffCredentials: IdentityProvider = {
  name: "StaffCredentials",

  async authenticate(credentials, { request, replacingToken }) {
    return authenticateStaff(credentials, request, replacingToken);
  },

  async confirmPassword(actor, password, request) {
    return confirmStaffPassword(actor, password, request);
  },
};

/// Named, not configured: no corporate directory is connected (INT-14), so nothing here signs anyone in.
export const DirectoryCredentials: IdentityProvider = {
  name: "DirectoryCredentials",
  async authenticate() {
    return { ok: false, kind: "NOT_CONFIGURED" };
  },
  async confirmPassword() {
    return { ok: false, kind: "POLICY_NOT_SET" };
  },
};

export async function authenticateStaff(credentials: Credentials, request: RequestFacts, replacingToken: string | null, now: Date = new Date()): Promise<SignInOutcome> {
  const organisation = await signInOrganisation();
  if (!organisation) return { ok: false, kind: "NOT_CONFIGURED" };
  // Phase 1d: in production nobody signs in while the app is connected as the owner or a superuser (the trail's grants would mean nothing).
  if (await signInRefusedForRole()) return { ok: false, kind: "UNSAFE_DATABASE_ROLE" };

  const policy = await loadSecurityPolicy(db, organisation.id);
  const unset = unsetSettings(policy, "SIGN_IN");
  const settings = signInSettings(policy);
  if (unset.length > 0 || !settings) return { ok: false, kind: "POLICY_NOT_SET", unset };
  if (!(await hasAdministrator(organisation.id))) return { ok: false, kind: "NO_ADMINISTRATOR" };

  const loginKey = loginKeyOf(credentials.loginName);
  if (loginKey === "" || loginKey.length > MAX_LOGIN_NAME || credentials.password.length > MAX_PASSWORD_INPUT) {
    await recordSignInEvent(db, { organisationId: organisation.id, kind: "FAILED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  // The address is judged first, from the database, before any hash is computed.
  const recent = await failedSignInsFrom(db, organisation.id, request.sourceAddress, throttleSince(now, settings.addressThrottleMinutes));
  const found = await db.staffAccount.findUnique({ where: { loginKey }, include: { person: { select: { isActive: true } } } });
  const account = found && found.organisationId === organisation.id ? found : null;
  const verdict = lockoutVerdict(account, recent, settings, now);
  if (verdict === "THROTTLED") {
    await recordSignInEvent(db, { organisationId: organisation.id, staffAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }

  // One hash for every attempt that gets this far: against the real hash where the account can sign in, else against a dummy.
  const eligible = account != null && account.status === "ACTIVE" && account.person.isActive && verdict === "ALLOW";
  const stored = eligible ? account.passwordHash : await dummyHash();
  const since = throttleSince(now, settings.addressThrottleMinutes);
  // The queue for a hash slot has a limit: past it the attempt is refused as a held-back one, at once and with no hash. No `await` lies between this check and `run`.
  if (hashPool.waiting >= HASH_QUEUE_LIMIT) {
    await recordSignInEvent(db, { organisationId: organisation.id, staffAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "FAILED" };
  }
  const checked = await hashPool.run(async () => {
    // The count above was taken before this attempt waited for a hash slot, and a burst of attempts all take it before any has failed. Take it
    // again at the front of the queue, so that a burst is held to the limit (and the slots in flight) rather than all passing a count of nothing.
    if ((await failedSignInsFrom(db, organisation.id, request.sourceAddress, since)) >= settings.addressThrottleAttempts) {
      await recordSignInEvent(db, { organisationId: organisation.id, staffAccountId: account?.id ?? null, kind: "THROTTLED", request, at: now });
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
  return completeSignIn({ organisationId: organisation.id, accountId: account.id, settings, request, replacingToken, upgradedHash: upgraded, previousHash: account.passwordHash, now });
}

async function completeSignIn(input: {
  organisationId: string;
  accountId: string;
  settings: SignInSettings;
  request: RequestFacts;
  replacingToken: string | null;
  upgradedHash: string | null;
  previousHash: string;
  now: Date;
}): Promise<SignInOutcome> {
  const { organisationId, accountId, settings, request, now } = input;
  return db.$transaction(async (tx): Promise<SignInOutcome> => {
    await lockAccount(tx, accountId);
    // What was true when the password was checked may not be now: an attempt in flight beside this one may have locked the account.
    const account = await tx.staffAccount.findUniqueOrThrow({ where: { id: accountId }, include: { person: { select: { isActive: true, name: true } } } });
    if (account.status !== "ACTIVE" || !account.person.isActive || isLocked(account, now)) {
      await recordSignInEvent(tx, { organisationId, staffAccountId: accountId, kind: isLocked(account, now) ? "LOCKED_OUT" : "FAILED", request, at: now });
      return { ok: false, kind: "FAILED" };
    }
    // The password was checked against the hash read before this attempt waited for a hash slot. If the password was changed or reset since (which also
    // ended every session), this check is of a password that no longer opens the account: no session, and the new hash is not written over.
    if (account.passwordHash !== input.previousHash) {
      await recordSignInEvent(tx, { organisationId, staffAccountId: accountId, kind: "FAILED", request, at: now });
      return { ok: false, kind: "FAILED" };
    }

    const limits = { idleMinutes: settings.staffIdleMinutes, absoluteMinutes: settings.staffAbsoluteMinutes };
    const open = await openSessions(tx, accountId, limits, now);
    const plan = concurrentSessionPlan(open, settings);
    if (!plan.ok) {
      await recordSignInEvent(tx, { organisationId, staffAccountId: accountId, kind: plan.reason === "REFUSED_AT_LIMIT" ? "SESSION_LIMIT" : "FAILED", request, at: now });
      return { ok: false, kind: plan.reason === "REFUSED_AT_LIMIT" ? "SESSION_LIMIT" : "FAILED" };
    }
    for (const id of plan.revoke) {
      await tx.staffSession.update({ where: { id }, data: { revokedAt: now, revokedReason: "CONCURRENT_LIMIT" } });
      await recordSignInEvent(tx, { organisationId, staffAccountId: accountId, kind: "REVOKED", at: now });
    }
    // A cookie the browser already holds is never reused: sign-in always gives a new token (session fixation), and the old session ends.
    if (looksLikeToken(input.replacingToken)) {
      await tx.staffSession.updateMany({ where: { tokenHash: hashToken(input.replacingToken), revokedAt: null }, data: { revokedAt: now, revokedReason: "REPLACED" } });
    }

    const token = newToken();
    const session = await createStaffSession(tx, { organisationId, accountId, tokenHash: hashToken(token), absoluteMinutes: settings.staffAbsoluteMinutes, request, now });
    const cleared = afterSuccess();
    await tx.staffAccount.update({
      where: { id: accountId },
      data: { failedAttempts: cleared.failedAttempts, lockedUntil: cleared.lockedUntil, lastSignInAt: now, ...(input.upgradedHash ? { passwordHash: input.upgradedHash } : {}) },
    });
    if (input.upgradedHash) {
      const actor = await auditActorOf(tx, account.personId, session.id, account.organisationId, request, now);
      await writeAudit(
        tx,
        { organisationId, entity: "StaffAccount", entityId: accountId, entityLabel: `Sign-in account of ${account.person.name}`, reason: "Password hash re-made with the current parameters at a good sign-in", actor },
        "UPDATE",
        [{ field: "passwordHashParameters", before: hashParameters(input.previousHash), after: hashParameters(input.upgradedHash) }],
      );
    }
    await recordSignInEvent(tx, { organisationId, staffAccountId: accountId, kind: "SIGNED_IN", request, at: now });

    return {
      ok: true,
      token,
      maxAgeSeconds: cookieMaxAgeSeconds({ createdAt: now, absoluteExpiresAt: session.absoluteExpiresAt }, settings.staffAbsoluteMinutes, now),
      mustChangePassword: account.mustChangePassword,
      resetNoticePending: account.resetNoticePending,
      accountId,
    };
  });
}

/// The actor of an audit row written for a person's own account. Offices are those held on the organisation's today.
export async function auditActorOf(client: Tx, personId: string, sessionId: string | null, organisationId: string, request: Pick<RequestFacts, "sourceAddress">, now: Date): Promise<AuditActor> {
  const organisation = await client.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  return { kind: "STAFF", personId, sessionId, offices: await officesHeld(client, personId, organisation.timeZone, now), sourceAddress: request.sourceAddress };
}

/**
 * The signed-in person gives their password again (NFR-SEC-006). A wrong one counts towards the account's lockout like any other and
 * is logged; a right one is logged and stamped on the session. There is no window: whoever asks, asks every time.
 */
export async function confirmStaffPassword(actor: StaffActor, password: string, request: RequestFacts, now: Date = new Date()): Promise<ConfirmOutcome> {
  const settings = signInSettings(await loadSecurityPolicy(db, actor.organisationId));
  if (!settings) return { ok: false, kind: "POLICY_NOT_SET" };
  const account = await db.staffAccount.findUnique({ where: { id: actor.accountId }, select: { passwordHash: true, failedAttempts: true, lockedUntil: true, status: true } });
  const locked = account != null && isLocked(account, now);
  const usable = account != null && account.status === "ACTIVE" && !locked && password.length <= MAX_PASSWORD_INPUT;
  const fail = () =>
    db.$transaction(async (tx) => {
      await lockAccount(tx, actor.accountId);
      const row = await tx.staffAccount.findUniqueOrThrow({ where: { id: actor.accountId }, select: { failedAttempts: true, lockedUntil: true } });
      const next: AccountLockState = afterFailedAttempt(row, settings, now);
      await tx.staffAccount.update({ where: { id: actor.accountId }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil } });
      await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: actor.accountId, kind: "STEP_UP_FAILED", request, at: now });
    });

  // The caller is already signed in, so a quick refusal reveals nothing: a locked or unfit account is refused WITHOUT a hash, and a full queue is refused at once (as the supplier's is),
  // or one session could queue a hash per request and fill the pool the public sign-in shares.
  if (!usable) {
    await fail();
    return { ok: false, kind: locked ? "LOCKED" : "WRONG" };
  }
  if (hashPool.waiting >= HASH_QUEUE_LIMIT) {
    await recordSignInEvent(db, { organisationId: actor.organisationId, staffAccountId: actor.accountId, kind: "THROTTLED", request, at: now });
    return { ok: false, kind: "THROTTLED" };
  }
  const checked = await hashPool.run(() => verifyPassword(account.passwordHash, password));
  if (!checked.ok) {
    await fail();
    return { ok: false, kind: "WRONG" };
  }

  await db.$transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    const cleared = afterSuccess();
    await tx.staffAccount.update({ where: { id: actor.accountId }, data: { failedAttempts: cleared.failedAttempts, lockedUntil: cleared.lockedUntil } });
    await tx.staffSession.updateMany({ where: { id: actor.sessionId, revokedAt: null }, data: { stepUpAt: now } });
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: actor.accountId, kind: "STEP_UP_OK", request, at: now });
  });
  return { ok: true, at: now };
}

/// End every session an account has, for the account's own "sign out everywhere". Gives back how many it ended.
export async function signOutEverywhere(actor: StaffActor, request: RequestFacts, now: Date = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    await lockAccount(tx, actor.accountId);
    const count = await revokeAccountSessions(tx, actor.accountId, "SIGNED_OUT_EVERYWHERE", now);
    await recordSignInEvent(tx, { organisationId: actor.organisationId, staffAccountId: actor.accountId, kind: "SIGNED_OUT", request, at: now });
    return count;
  });
}
