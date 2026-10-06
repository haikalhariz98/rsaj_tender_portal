import type { SessionRevokeReason } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { organisationDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { inForceOn } from "@/lib/effective";

import { recordSignInEvent } from "./events";
import { loadSecurityPolicy } from "./policy-store";
import type { RequestFacts } from "./request";
import { absoluteEnd, sessionVerdict, touchDue } from "./session-rules";
import { hashToken, looksLikeToken } from "./token";
import type { Office, StaffActor } from "./types";

/**
 * Sessions in the database (ADR 0034 D4). The token lives only in the cookie; a session is found by the hash of it, judged by
 * `sessionVerdict` against the organisation's own limits, and re-checked against its account, its person and their offices on
 * every read: a person made inactive, or an account disabled, loses the session at the next request, not at its end.
 *
 * Reading may write (last-seen, and the revocation of an expired session with its log row) but never touches a cookie, which a
 * page render cannot set. A later read of a revoked session finds it revoked and writes nothing more.
 */

export type SessionReadFailure = "NO_TOKEN" | "UNKNOWN" | "IDLE" | "ABSOLUTE" | "REVOKED" | "POLICY_NOT_SET" | "ACCOUNT_INACTIVE";

export type SessionRead =
  | { ok: true; actor: StaffActor; session: { id: string; createdAt: Date; lastSeenAt: Date; absoluteExpiresAt: Date } }
  | { ok: false; reason: SessionReadFailure };

export async function readStaffSession(token: string | undefined | null, request: Pick<RequestFacts, "sourceAddress">, now: Date = new Date()): Promise<SessionRead> {
  if (!looksLikeToken(token)) return { ok: false, reason: "NO_TOKEN" };

  const session = await db.staffSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      account: {
        include: {
          person: { select: { id: true, name: true, jobTitle: true, isActive: true } },
          organisation: { select: { id: true, code: true, timeZone: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, reason: "UNKNOWN" };
  const { account } = session;

  const policy = await loadSecurityPolicy(db, session.organisationId);
  const verdict = sessionVerdict(session, { idleMinutes: policy?.staffIdleMinutes ?? null, absoluteMinutes: policy?.staffAbsoluteMinutes ?? null }, now);

  if (verdict === "IDLE" || verdict === "ABSOLUTE") {
    await endSession(db, session.id, session.organisationId, account.id, verdict === "IDLE" ? "IDLE" : "ABSOLUTE", now);
    return { ok: false, reason: verdict };
  }
  if (verdict !== "VALID") return { ok: false, reason: verdict };

  // Every request re-checks the account and the person. A change that makes either unfit ends the session now.
  if (account.status !== "ACTIVE" || !account.person.isActive || account.organisationId !== session.organisationId) {
    await endSession(db, session.id, session.organisationId, account.id, "ACCOUNT_DISABLED", now, "REVOKED");
    return { ok: false, reason: "ACCOUNT_INACTIVE" };
  }

  if (touchDue(session.lastSeenAt, now)) {
    await db.staffSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: now } });
  }

  const offices = await officesHeld(db, account.personId, account.organisation.timeZone, now);
  const actor: StaffActor = {
    kind: "STAFF",
    accountId: account.id,
    sessionId: session.id,
    personId: account.personId,
    personName: account.person.name,
    jobTitle: account.person.jobTitle,
    isAdministrator: account.isAdministrator,
    organisationId: account.organisationId,
    organisationCode: account.organisation.code,
    organisationTimeZone: account.organisation.timeZone,
    offices,
    // Phase 2a resolves permissions from roles and grants. Until then none is held, and a permission nobody has decided is refused.
    permissions: new Set(),
    stepUpAt: session.stepUpAt,
    sessionCreatedAt: session.createdAt,
    sourceAddress: request.sourceAddress,
    mustChangePassword: account.mustChangePassword,
  };
  return { ok: true, actor, session: { id: session.id, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, absoluteExpiresAt: session.absoluteExpiresAt } };
}

/// The offices a person holds on the organisation's today. With no time zone set, today is not known and none is claimed.
export async function officesHeld(client: Tx, personId: string, timeZone: string | null, now: Date): Promise<Office[]> {
  const day = organisationDay(now, timeZone);
  if (!day) return [];
  const rows = await client.roleAssignment.findMany({ where: { personId }, select: { roleCode: true, scope: true, effectiveFrom: true, effectiveTo: true } });
  return rows.filter((r) => inForceOn(r, day)).map((r) => ({ roleCode: r.roleCode, scope: r.scope }));
}

/// Revoke one session once, and write its log row only if this call is the one that ended it.
async function endSession(client: Tx, sessionId: string, organisationId: string, accountId: string, reason: SessionRevokeReason, now: Date, kind?: "REVOKED"): Promise<boolean> {
  const { count } = await client.staffSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now, revokedReason: reason } });
  if (count === 0) return false;
  await recordSignInEvent(client, {
    organisationId,
    staffAccountId: accountId,
    kind: kind ?? (reason === "IDLE" ? "IDLE_EXPIRED" : reason === "ABSOLUTE" ? "ABSOLUTE_EXPIRED" : "REVOKED"),
    at: now,
  });
  return true;
}

/// Sessions of an account that are still in force by the organisation's limits. Takes the account's row lock first where the caller holds one.
export async function openSessions(client: Tx, accountId: string, limits: { idleMinutes: number | null; absoluteMinutes: number | null }, now: Date) {
  const rows = await client.staffSession.findMany({ where: { accountId, revokedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.filter((s) => sessionVerdict(s, limits, now) === "VALID");
}

/// Make a session and give back the token, which is shown to nobody but the cookie. `absoluteMinutes` fixes its end for good.
export async function createStaffSession(
  client: Tx,
  input: { organisationId: string; accountId: string; tokenHash: string; absoluteMinutes: number; request: RequestFacts; now: Date },
): Promise<{ id: string; absoluteExpiresAt: Date }> {
  const absoluteExpiresAt = absoluteEnd(input.now, input.absoluteMinutes);
  const row = await client.staffSession.create({
    data: {
      organisationId: input.organisationId,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      createdAt: input.now,
      lastSeenAt: input.now,
      absoluteExpiresAt,
      sourceAddress: input.request.sourceAddress,
      userAgent: input.request.userAgent,
    },
    select: { id: true },
  });
  return { id: row.id, absoluteExpiresAt };
}

/// Revoke every session of an account but (optionally) one. Gives back how many it ended.
export async function revokeAccountSessions(client: Tx, accountId: string, reason: SessionRevokeReason, now: Date, except?: string): Promise<number> {
  const { count } = await client.staffSession.updateMany({
    where: { accountId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

/// Sign out the session a cookie carries. Quiet where it is already over or never was.
export async function signOutToken(token: string | undefined | null, request: RequestFacts, now: Date = new Date()): Promise<void> {
  if (!looksLikeToken(token)) return;
  const session = await db.staffSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, organisationId: true, accountId: true } });
  if (!session) return;
  const { count } = await db.staffSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "SIGNED_OUT" } });
  if (count === 1) await recordSignInEvent(db, { organisationId: session.organisationId, staffAccountId: session.accountId, kind: "SIGNED_OUT", request, at: now });
}

export interface SessionListing {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  sourceAddress: string | null;
  userAgent: string;
  current: boolean;
}

/// The sessions an account has open, newest first, for the account's own page.
export async function listOpenSessions(accountId: string, organisationId: string, currentSessionId: string, now: Date = new Date()): Promise<SessionListing[]> {
  const policy = await loadSecurityPolicy(db, organisationId);
  const limits = { idleMinutes: policy?.staffIdleMinutes ?? null, absoluteMinutes: policy?.staffAbsoluteMinutes ?? null };
  const open = await openSessions(db, accountId, limits, now);
  return open
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((s) => ({ id: s.id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, sourceAddress: s.sourceAddress, userAgent: s.userAgent, current: s.id === currentSessionId }));
}

export interface PreviousSignIn {
  /// Null on an account's first sign-in: there is no previous one to show.
  previous: { at: Date; sourceAddress: string | null } | null;
  /// Wrong passwords (and locked attempts) against this account since that sign-in. Null where there is no previous sign-in.
  failedSince: number | null;
}

/**
 * The compensating control for the missing second factor (ruling O-2): show a person when and from where their account was last signed in,
 * and how many times someone failed to get in since, so that a stolen password is noticed. "Previous" is the sign-in before the one that
 * made the current session. Failures against a name that matched no account cannot be attributed and are not counted.
 */
export async function previousSignIn(accountId: string, currentSessionCreatedAt: Date): Promise<PreviousSignIn> {
  const previous = await db.signInEvent.findFirst({
    where: { staffAccountId: accountId, kind: "SIGNED_IN", at: { lt: currentSessionCreatedAt } },
    orderBy: { at: "desc" },
    select: { at: true, detail: { select: { sourceAddress: true } } },
  });
  if (!previous) return { previous: null, failedSince: null };
  const failedSince = await db.signInEvent.count({
    where: { staffAccountId: accountId, kind: { in: ["FAILED", "LOCKED_OUT"] }, at: { gt: previous.at } },
  });
  return { previous: { at: previous.at, sourceAddress: previous.detail?.sourceAddress ?? null }, failedSince };
}
