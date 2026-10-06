import { db } from "@/lib/db";

import { loadSecurityPolicy } from "./policy-store";
import { trustedProxyHops } from "./request";
import { listOpenSessions, previousSignIn, type PreviousSignIn, type SessionListing } from "./session-store";
import type { StaffActor } from "./types";

/**
 * What the account page and the page after sign-in show about the signed-in person's own account. Read on this request, from the database:
 * the sessions are the ones in force by the organisation's limits, and the last sign-in is the one before the session now in use.
 */
export interface AccountView {
  loginName: string;
  passwordChangedAt: Date;
  resetNoticePending: boolean;
  mustChangePassword: boolean;
  last: PreviousSignIn;
  sessions: SessionListing[];
  /// How long sign-in addresses are kept (O-1): null while the organisation has not said, and they are kept.
  retentionDays: number | null;
  /// Whether this copy knows how to read a request's source address. Without it no address is recorded or throttled.
  addressesRecorded: boolean;
}

export async function loadAccountView(actor: StaffActor): Promise<AccountView> {
  const [account, last, sessions, policy] = await Promise.all([
    db.staffAccount.findUniqueOrThrow({ where: { id: actor.accountId }, select: { loginName: true, passwordChangedAt: true, resetNoticePending: true, mustChangePassword: true } }),
    previousSignIn(actor.accountId, actor.sessionCreatedAt),
    listOpenSessions(actor.accountId, actor.organisationId, actor.sessionId),
    loadSecurityPolicy(db, actor.organisationId),
  ]);
  return { ...account, last, sessions, retentionDays: policy?.signInDetailRetentionDays ?? null, addressesRecorded: trustedProxyHops(process.env.TRUSTED_PROXY_HOPS) != null };
}
