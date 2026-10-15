import type { Tx } from "@/lib/audit/record";

import { RATE_LIMITS, RATE_ROW_KEEP_SECONDS, rateVerdict, windowStartOf, type RateVerdict, type RatedAction } from "./limits";

/**
 * The per-account counter behind the throttle (SR-10 review SEC-2). One row per account, action and fixed window, upserted: this is a throttle and not a trail, so it is not append-only
 * and rows older than a day are removed on the way. Every call counts, so a refused call counts too; that is what makes the limit bite. Nothing here writes to a trail.
 */
export async function countAndJudge(tx: Pick<Tx, "portalRateCounter">, i: { organisationId: string; accountId: string; action: RatedAction }, now: Date = new Date()): Promise<RateVerdict> {
  const counted = await countAndJudgeCounted(tx, i, now);
  return counted.limited ? { limited: true, retryAfterSeconds: counted.retryAfterSeconds } : { limited: false };
}

/// The same count, with this request's place in its window (itself included), which `rateRefusalLogged` (20w) needs: only the first refusal in a window is written down.
export async function countAndJudgeCounted(tx: Pick<Tx, "portalRateCounter">, i: { organisationId: string; accountId: string; action: RatedAction }, now: Date = new Date()): Promise<RateVerdict & { count: number }> {
  const windowStart = windowStartOf(now, RATE_LIMITS[i.action].windowSeconds);
  const row = await tx.portalRateCounter.upsert({
    where: { accountId_action_windowStart: { accountId: i.accountId, action: i.action, windowStart } },
    create: { organisationId: i.organisationId, accountId: i.accountId, action: i.action, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  await tx.portalRateCounter.deleteMany({ where: { accountId: i.accountId, windowStart: { lt: new Date(now.getTime() - RATE_ROW_KEEP_SECONDS * 1000) } } });
  return { ...rateVerdict(i.action, row.count, now), count: row.count };
}
