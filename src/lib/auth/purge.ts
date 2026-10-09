import { writeAudit, type Tx } from "@/lib/audit/record";

/**
 * The purge of sign-in addresses (ADR 0034 D16, ruling O-1, Phase 5): the one way a `SignInEventDetail` row leaves the database. An operator runs it from the server's
 * command line (`npm run auth:purge-sign-in-detail`); nothing schedules it. It deletes the rows whose sign-in is older than the organisation's retention period and writes
 * one audit row, as the system, saying the cutoff and how many. The permanent `SignInEvent` row stays: only the address and the device go.
 *
 * The database holds the rule too (trigger `SignInEventDetail_guard`, SQLSTATE PA002): it refuses every delete while the retention period is unset, and any delete of a
 * row that is not older than it, for every database login, the table's owner included. This code asks the same question first so that a refusal is said in words, and
 * nothing is deleted on an assumption. The application's login has no DELETE on the table, so the command runs as the owner (`MIGRATE_DATABASE_URL`).
 */

export type PurgeOutcome =
  | { ok: false; kind: "NOT_SET"; message: string }
  | { ok: true; days: number; cutoff: Date; candidates: number; deleted: number; dryRun: boolean };

export const PURGE_LABEL = "sign-in purge command";

export const NOT_SET_WORDS = "The retention period for sign-in addresses is not set, so nothing is purged: sign-in addresses are kept. Set it under Configuration, Sign-in settings (a change a second person decides).";

/// The instant before which a sign-in is past its retention period. Pure: the clock is handed in.
export const purgeCutoff = (now: Date, days: number): Date => new Date(now.getTime() - days * 86_400_000);

export function purgeSummary(o: Extract<PurgeOutcome, { ok: true }>): string {
  const what = `${o.candidates} sign-in ${o.candidates === 1 ? "address is" : "addresses are"} older than ${o.days} ${o.days === 1 ? "day" : "days"}`;
  return o.dryRun ? `Dry run: ${what}. Nothing was deleted.` : `${what}: ${o.deleted} deleted. The sign-in events themselves are kept.`;
}

/// Run inside a transaction on a client that may delete (the owner's). One organisation at a time: an organisation's rows are never counted against another's period.
export async function purgeSignInDetail(tx: Tx, input: { organisationId: string; now: Date; dryRun: boolean }): Promise<PurgeOutcome> {
  const policy = await tx.securityPolicy.findUnique({ where: { organisationId: input.organisationId }, select: { signInDetailRetentionDays: true } });
  const days = policy?.signInDetailRetentionDays ?? null;
  if (days == null) return { ok: false, kind: "NOT_SET", message: NOT_SET_WORDS };
  const cutoff = purgeCutoff(input.now, days);
  const where = { event: { organisationId: input.organisationId, at: { lt: cutoff } } };
  const candidates = await tx.signInEventDetail.count({ where });
  if (input.dryRun) return { ok: true, days, cutoff, candidates, deleted: 0, dryRun: true };
  const { count } = candidates === 0 ? { count: 0 } : await tx.signInEventDetail.deleteMany({ where });
  await auditPurge(tx, input.organisationId, days, cutoff, candidates, count);
  return { ok: true, days, cutoff, candidates, deleted: count, dryRun: false };
}

/// One audit row for each run that deletes (even one that found nothing), so that the gap in the addresses is honest: the cutoff and the count.
async function auditPurge(tx: Tx, organisationId: string, days: number, cutoff: Date, candidates: number, deleted: number): Promise<void> {
  await writeAudit(
    tx,
    {
      organisationId,
      entity: "SecurityPolicy",
      entityId: organisationId,
      entityLabel: "Sign-in addresses",
      reason: `Purged by the ${PURGE_LABEL} under the retention period of ${days} ${days === 1 ? "day" : "days"}`,
      actor: { kind: "SYSTEM", label: PURGE_LABEL },
    },
    "UPDATE",
    [
      { field: "Sign-ins older than", before: null, after: cutoff.toISOString() },
      { field: "Addresses found past the period", before: null, after: String(candidates) },
      { field: "Addresses deleted", before: null, after: String(deleted) },
    ],
  );
}
