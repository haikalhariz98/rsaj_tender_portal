import type { SessionRevokeReason } from "@/generated/prisma/client";
import type { Tx } from "@/lib/audit/record";
import { db } from "@/lib/db";
import { deploymentOrganisation } from "@/lib/portal/deployment";

import { recordSignInEvent } from "./events";
import { loadSecurityPolicy } from "./policy-store";
import type { RequestFacts } from "./request";
import { absoluteEnd, sessionVerdict, touchDue } from "./session-rules";
import { hashToken, looksLikeToken } from "./token";
import type { SupplierActor } from "./types";

/**
 * Supplier sessions in the database (ADR 0034 D4), the staff store's twin for the other store: the token lives only in the cookie, a session is found by the hash of
 * it, judged by `sessionVerdict` against the organisation's own SUPPLIER limits, and re-checked on every read against its account, its contact and the deployment.
 *
 * What a read re-checks, every time, so that a change takes effect at the next request and not at the end of the session:
 * - the account is active (a disabled one, or one waiting for its code, signs nobody in);
 * - the contact has not been retired (retiring a contact also disables the account in its own transaction, so this is the second line);
 * - the session and the account belong to the deployment's one organisation (ADR 0034 D10: the portal serves it and no other).
 * A supplier whose registration was rejected, or who stands suspended or blacklisted, can still sign in: they need to see where their application stands.
 */

export type SupplierSessionFailure = "NO_TOKEN" | "UNKNOWN" | "IDLE" | "ABSOLUTE" | "REVOKED" | "POLICY_NOT_SET" | "ACCOUNT_INACTIVE";

export type SupplierSessionRead =
  | { ok: true; actor: SupplierActor; session: { id: string; createdAt: Date; lastSeenAt: Date; absoluteExpiresAt: Date } }
  | { ok: false; reason: SupplierSessionFailure };

export async function readSupplierSession(token: string | undefined | null, request: Pick<RequestFacts, "sourceAddress">, now: Date = new Date()): Promise<SupplierSessionRead> {
  if (!looksLikeToken(token)) return { ok: false, reason: "NO_TOKEN" };

  const session = await db.supplierSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      account: {
        include: {
          contact: { select: { id: true, name: true, retiredOn: true } },
          supplier: { select: { id: true, registeredName: true, organisationId: true } },
          organisation: { select: { id: true, timeZone: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, reason: "UNKNOWN" };
  const { account } = session;

  const policy = await loadSecurityPolicy(db, session.organisationId);
  const verdict = sessionVerdict(session, { idleMinutes: policy?.supplierIdleMinutes ?? null, absoluteMinutes: policy?.supplierAbsoluteMinutes ?? null }, now);

  if (verdict === "IDLE" || verdict === "ABSOLUTE") {
    await endSupplierSession(db, session.id, session.organisationId, account.id, verdict === "IDLE" ? "IDLE" : "ABSOLUTE", now);
    return { ok: false, reason: verdict };
  }
  if (verdict !== "VALID") return { ok: false, reason: verdict };

  const deployment = await deploymentOrganisation();
  const unfit =
    account.status !== "ACTIVE" ||
    account.contact.retiredOn != null ||
    account.organisationId !== session.organisationId ||
    account.supplier.organisationId !== account.organisationId ||
    deployment == null ||
    deployment.id !== account.organisationId;
  if (unfit) {
    await endSupplierSession(db, session.id, session.organisationId, account.id, "ACCOUNT_DISABLED", now, "REVOKED");
    return { ok: false, reason: "ACCOUNT_INACTIVE" };
  }

  if (touchDue(session.lastSeenAt, now)) {
    await db.supplierSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: now } });
  }

  const actor: SupplierActor = {
    kind: "SUPPLIER",
    accountId: account.id,
    sessionId: session.id,
    contactId: account.contact.id,
    displayName: account.contact.name,
    // The supplier comes from the account, which comes from the session: never from anything the request says.
    supplierId: account.supplier.id,
    supplierName: account.supplier.registeredName,
    loginName: account.loginName,
    organisationId: account.organisationId,
    organisationTimeZone: account.organisation.timeZone,
    stepUpAt: session.stepUpAt,
    sessionCreatedAt: session.createdAt,
    sourceAddress: request.sourceAddress,
    mustChangePassword: account.mustChangePassword,
    resetNoticePending: account.resetNoticePending,
  };
  return { ok: true, actor, session: { id: session.id, createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, absoluteExpiresAt: session.absoluteExpiresAt } };
}

/// Revoke one session once, and write its log row only if this call is the one that ended it.
async function endSupplierSession(client: Tx, sessionId: string, organisationId: string, accountId: string, reason: SessionRevokeReason, now: Date, kind?: "REVOKED"): Promise<boolean> {
  const { count } = await client.supplierSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now, revokedReason: reason } });
  if (count === 0) return false;
  await recordSignInEvent(client, {
    organisationId,
    supplierAccountId: accountId,
    kind: kind ?? (reason === "IDLE" ? "IDLE_EXPIRED" : reason === "ABSOLUTE" ? "ABSOLUTE_EXPIRED" : "REVOKED"),
    at: now,
  });
  return true;
}

/// Sessions of an account that are still in force by the organisation's limits.
export async function openSupplierSessions(client: Tx, accountId: string, limits: { idleMinutes: number | null; absoluteMinutes: number | null }, now: Date) {
  const rows = await client.supplierSession.findMany({ where: { accountId, revokedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.filter((s) => sessionVerdict(s, limits, now) === "VALID");
}

/// Make a session. `absoluteMinutes` fixes its end for good.
export async function createSupplierSession(
  client: Tx,
  input: { organisationId: string; accountId: string; tokenHash: string; absoluteMinutes: number; request: RequestFacts; now: Date },
): Promise<{ id: string; absoluteExpiresAt: Date }> {
  const absoluteExpiresAt = absoluteEnd(input.now, input.absoluteMinutes);
  const row = await client.supplierSession.create({
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
export async function revokeSupplierAccountSessions(client: Tx, accountId: string, reason: SessionRevokeReason, now: Date, except?: string): Promise<number> {
  const { count } = await client.supplierSession.updateMany({
    where: { accountId, revokedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

/// Sign out the session a cookie carries. Quiet where it is already over or never was.
export async function signOutSupplierToken(token: string | undefined | null, request: RequestFacts, now: Date = new Date()): Promise<void> {
  if (!looksLikeToken(token)) return;
  const session = await db.supplierSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, organisationId: true, accountId: true } });
  if (!session) return;
  const { count } = await db.supplierSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "SIGNED_OUT" } });
  if (count === 1) await recordSignInEvent(db, { organisationId: session.organisationId, supplierAccountId: session.accountId, kind: "SIGNED_OUT", request, at: now });
}

export interface SupplierSessionListing {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  sourceAddress: string | null;
  userAgent: string;
  current: boolean;
}

/// The sessions an account has open, newest first, for the account's own page.
export async function listOpenSupplierSessions(accountId: string, organisationId: string, currentSessionId: string, now: Date = new Date()): Promise<SupplierSessionListing[]> {
  const policy = await loadSecurityPolicy(db, organisationId);
  const limits = { idleMinutes: policy?.supplierIdleMinutes ?? null, absoluteMinutes: policy?.supplierAbsoluteMinutes ?? null };
  const open = await openSupplierSessions(db, accountId, limits, now);
  return open
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((s) => ({ id: s.id, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, sourceAddress: s.sourceAddress, userAgent: s.userAgent, current: s.id === currentSessionId }));
}

export interface PreviousSupplierSignIn {
  /// Null on an account's first sign-in: there is no previous one to show.
  previous: { at: Date; sourceAddress: string | null } | null;
  /// Wrong passwords (and locked attempts) against this account since that sign-in. Null where there is no previous sign-in.
  failedSince: number | null;
}

/// The compensating control for the missing second factor (ruling O-2), for the supplier store: when and from where the account was last signed in, and how many failed since.
export async function previousSupplierSignIn(accountId: string, currentSessionCreatedAt: Date): Promise<PreviousSupplierSignIn> {
  const previous = await db.signInEvent.findFirst({
    where: { supplierAccountId: accountId, kind: "SIGNED_IN", at: { lt: currentSessionCreatedAt } },
    orderBy: { at: "desc" },
    select: { at: true, detail: { select: { sourceAddress: true } } },
  });
  if (!previous) return { previous: null, failedSince: null };
  const failedSince = await db.signInEvent.count({ where: { supplierAccountId: accountId, kind: { in: ["FAILED", "LOCKED_OUT"] }, at: { gt: previous.at } } });
  return { previous: { at: previous.at, sourceAddress: previous.detail?.sourceAddress ?? null }, failedSince };
}
