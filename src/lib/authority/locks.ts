import type { Tx } from "@/lib/audit/record";

/**
 * The row locks the approval-matrix editor takes, in one place so the editor and the database race check
 * (`scripts/check-config-lock-order.ts`) run the same statements.
 *
 * The order is the organisation, then an issue, then the funding route a rule set names. Two facts make that
 * order safe, and a source scan cannot see either of them:
 *
 * - Every `AuditEntry`, `AuthorityMatrix` and `FundingRoute` row names its organisation by a foreign key, so
 *   inserting one takes `FOR KEY SHARE` on the organisation's row. A writer that has locked an issue (or a funding
 *   route) and then writes its audit row therefore asks for that share lock while holding the issue.
 * - `FOR UPDATE` conflicts with `FOR KEY SHARE`; `FOR NO KEY UPDATE` does not. An organisation lock taken `FOR UPDATE`
 *   and then followed by a wait on the issue closes a cycle with exactly such a writer (deadlock, SQLSTATE 40P01).
 *
 * So the organisation is locked `FOR NO KEY UPDATE`: it still queues two label checks (and two "one draft at a time"
 * checks) behind each other, and behind the other configuration editors' `FOR UPDATE`, but never blocks a writer's audit insert.
 */

/// Lock the organisation's row for the rest of the transaction, so a check that spans the organisation's issues (a
/// label is unique across them) has one thing to queue on. Taken before any issue's row, never after one.
export async function lockOrganisation(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${id} FOR NO KEY UPDATE`;
}

/// Lock an issue's row for the rest of the transaction: every write to an issue, its rules or its core routing takes
/// it, so issuing cannot take a half-made change.
export async function lockIssue(tx: Tx, authorityMatrixId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "AuthorityMatrix" WHERE id = ${authorityMatrixId} FOR UPDATE`;
}

/// Share-lock a funding route's row for the rest of the transaction, so a change to it waits for this write or is
/// seen by it. Taken last, after the organisation and the issue.
export async function shareLockFundingRoute(tx: Tx, organisationId: string, code: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "FundingRoute" WHERE "organisationId" = ${organisationId} AND code = ${code} FOR SHARE`;
}
