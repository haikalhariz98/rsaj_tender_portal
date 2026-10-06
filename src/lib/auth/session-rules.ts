/**
 * When a session is still good (ADR 0034 D4), and what to do when an account is at its limit of sessions.
 *
 * Pure: the caller passes the clock. The limits are the organisation's settings and are null until the customer sets
 * them. A session cannot be judged against a limit nobody has set, so it is refused (`POLICY_NOT_SET`), never given a default.
 */

const MINUTE = 60_000;

/// Last-seen is written at most once a minute: a page that reads the session ten times does not write ten times.
export const TOUCH_INTERVAL_MS = MINUTE;

export interface SessionTimes {
  createdAt: Date;
  lastSeenAt: Date;
  /// Fixed when the session was made.
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionLimits {
  idleMinutes: number | null;
  absoluteMinutes: number | null;
}

export type SessionVerdict = "VALID" | "IDLE" | "ABSOLUTE" | "REVOKED" | "POLICY_NOT_SET";

/**
 * The absolute end is the earlier of the end fixed at creation and creation plus today's absolute limit, so shortening
 * the setting shortens sessions already open but lengthening it never extends one. An absolute end is checked before idle:
 * a session past both says why it can never come back.
 */
export function sessionVerdict(session: SessionTimes, limits: SessionLimits, now: Date): SessionVerdict {
  if (session.revokedAt) return "REVOKED";
  if (limits.idleMinutes == null || limits.absoluteMinutes == null) return "POLICY_NOT_SET";
  const absoluteEnd = Math.min(session.absoluteExpiresAt.getTime(), session.createdAt.getTime() + limits.absoluteMinutes * MINUTE);
  if (now.getTime() >= absoluteEnd) return "ABSOLUTE";
  // `lastSeenAt` is up to one touch interval behind the last request, so that interval is allowed on top of the limit: a person who was active inside the
  // limit is never signed out for being idle. The cost is that a session can outlive the limit by up to one touch interval (the absolute limit is exact).
  if (now.getTime() >= session.lastSeenAt.getTime() + limits.idleMinutes * MINUTE + TOUCH_INTERVAL_MS) return "IDLE";
  return "VALID";
}

/// The end of a session made at `now`, which is then never moved.
export function absoluteEnd(now: Date, absoluteMinutes: number): Date {
  return new Date(now.getTime() + absoluteMinutes * MINUTE);
}

/// How long the cookie lives: what is left of the session's life, never more, never negative. Whole seconds, rounded down.
export function cookieMaxAgeSeconds(session: Pick<SessionTimes, "createdAt" | "absoluteExpiresAt">, absoluteMinutes: number, now: Date): number {
  const end = Math.min(session.absoluteExpiresAt.getTime(), session.createdAt.getTime() + absoluteMinutes * MINUTE);
  return Math.max(0, Math.floor((end - now.getTime()) / 1000));
}

export function touchDue(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
}

export interface OpenSession {
  id: string;
  createdAt: Date;
}

export type ConcurrentPlan =
  | { ok: true; revoke: string[] }
  | { ok: false; reason: "REFUSED_AT_LIMIT" | "POLICY_NOT_SET" };

/**
 * A new session is about to be made for an account that has `open` sessions in force. At its limit, what happens is the
 * customer's choice (`concurrentSessionAction`): the oldest are ended to make room, or the new one is refused.
 */
export function concurrentSessionPlan(
  open: readonly OpenSession[],
  policy: { maxConcurrentSessions: number | null; concurrentSessionAction: "REVOKE_OLDEST" | "REFUSE_NEW" | null },
): ConcurrentPlan {
  const { maxConcurrentSessions: max, concurrentSessionAction: action } = policy;
  if (max == null || action == null) return { ok: false, reason: "POLICY_NOT_SET" };
  if (open.length < max) return { ok: true, revoke: [] };
  if (action === "REFUSE_NEW") return { ok: false, reason: "REFUSED_AT_LIMIT" };
  // Room for one more: at most max - 1 stay, the oldest first to go. Ties on time fall to the id, so the order is stable.
  const oldestFirst = [...open].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return { ok: true, revoke: oldestFirst.slice(0, open.length - (max - 1)).map((s) => s.id) };
}
