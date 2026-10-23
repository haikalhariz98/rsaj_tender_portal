import { standingBarFinding } from "@/lib/portal/standing-gate";
import { portalStandingBarOf } from "@/lib/portal/standing-gate-store";
import type { Tx } from "@/lib/audit/record";
import type { AuditActor, SupplierActor } from "@/lib/auth/types";
import { withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import { dayOf } from "@/lib/dates";

import { ProjectRefused, type ProjectFinding } from "./types";
import { supplierHoldsContract } from "./visibility";

/**
 * My Projects' held contract for a contractor's act (Phase 4e): `inHeldContract` locks the contract in the canonical order (requisition, exercise, award, contract:
 * `withLockedContract`), reads it as this supplier may hold it (the same "not found" for every other case), asks the supplier's standing, and reads the organisation's day. The
 * diary store and the Project workspace's portal acts (`project-docs/portal-acts.ts`) act inside it.
 *
 * The earlier `sendSubmission` is gone (plan step 6; PW-11, PW-23): the six kinds are sent from the Documents list, and `POST /supplier/projects/submit` answers 410. Its rows
 * (`ContractorSubmission`) stay, read-only once answered, in the one Documents list; an unanswered one is still answered by `answerContractorSubmission`.
 */

export const supplierAuditActor = (a: SupplierActor): AuditActor => ({ kind: "SUPPLIER", supplierAccountId: a.accountId, sessionId: a.sessionId, sourceAddress: a.sourceAddress });

/// The signing contact's designation as the supplier gave it, for the record of a signature (4e review fix: the paper path records the signatory, and the portal path now says who in the company signed).
export async function signatoryDesignation(tx: Tx, actor: SupplierActor): Promise<string> {
  const c = await tx.supplierContact.findFirst({ where: { id: actor.contactId, supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { designation: true } });
  return c?.designation.trim() || "designation not given";
}

const refuse = (fs: readonly ProjectFinding[], status: 404 | 409 | 422 | 429 = 422): never => {
  throw new ProjectRefused(fs, status);
};
const NOT_FOUND = () => refuse([{ code: "NOT_FOUND", level: "block" }], 404);

/// The contract, locked, as this supplier holds it, or not found (the same answer for every other case). `today` is the organisation's day of `now`, the one moment the
/// caller read the clock at (PW-55: a portal act reads it once, so a delay notice's day and moment never disagree near midnight).
export async function inHeldContract<T>(actor: SupplierActor, contractId: string, fn: (tx: Tx, l: LoadedContract, today: string) => Promise<T>, now: Date = new Date()): Promise<T> {
  const result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
    if (!supplierHoldsContract({ awardVendorId: l.award.vendorId, awardStatus: l.award.status, supplierId: actor.supplierId })) return NOT_FOUND();
    // Decisions log, 2026-10-09, ruling on 1875(3): a supplier whose standing bars it may read its contract and does nothing else here; paper remains a lawful channel for what has a time limit.
    const bar = await portalStandingBarOf(tx, actor, "TRANSACT");
    if (bar) return refuse([standingBarFinding(bar)]);
    const today = dayOf(now, l.org.timeZone);
    if (!today) return refuse([{ code: "DAY_NOT_KNOWN", level: "block" }]);
    return fn(tx, l, today);
  });
  if (result === null) return NOT_FOUND();
  return result;
}
