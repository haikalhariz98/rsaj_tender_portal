/**
 * The I/O around a recall (FR-APR-017): who the recalled route's waiting step was waiting on, and telling them.
 *
 * The rule (`recall.ts`) and the notice (`inbox/notices.ts`) are pure; this reads the roster the way the worklist does (the nearest holder of the acting office for
 * the matter's unit, and the delegates of the whole office) and writes the notices in the recall's own transaction, so a notice exists if and only if the recall does.
 */

import type { Tx } from "@/lib/audit/record";
import type { StaffActor } from "@/lib/auth/types";
import { dayToDate } from "@/lib/dates";
import { routeRecalledNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { supplierHolders } from "@/lib/suppliers/route";

import { nextStep } from "./queue";

/// The active people who could decide a step today: those who hold the office acting for it for the unit, and the delegates of the whole office.
export async function deciderIdsOfStep(
  tx: Tx,
  actor: Pick<StaffActor, "organisationCode" | "organisationId">,
  i: { unitCode: string | null; today: string | null; roleCode: string | null; actingRoleCode: string | null },
): Promise<string[]> {
  const office = i.actingRoleCode ?? i.roleCode;
  if (!office || !i.today) return [];
  const [roster, delegations] = await Promise.all([loadRoster(actor.organisationCode, tx), loadDelegations(actor.organisationCode, tx)]);
  const on = dayToDate(i.today);
  let path: string[] = [];
  if (i.unitCode) {
    const units = (await tx.orgUnit.findMany({ where: { organisationId: actor.organisationId } })) as unknown as OrgUnit[];
    path = pathTo(units, i.unitCode, on).reverse().map((u) => u.code);
  }
  const holders = i.unitCode ? holdersFor(office, path, roster, delegations, i.today) : supplierHolders(office, roster, delegations, i.today);
  const active = new Set(roster.people.filter((p) => p.isActive).map((p) => p.id));
  return [...new Set([...holders.holderIds, ...holders.delegates.map((d) => d.personId)])].filter((id) => active.has(id));
}

/**
 * Tell the people the recalled route's waiting step was waiting on that it is withdrawn. Called inside the recall's transaction, after the route is marked
 * recalled; the person who recalled is never told of their own act. `steps` are the route's steps as they stood (the recall is refused once any is decided,
 * so the next pending step is the first).
 */
export async function noticeRecall(
  tx: Tx,
  actor: StaffActor,
  i: {
    routeId: string;
    steps: readonly { id: string; sequence: number; decision: string; roleCode: string | null; actingRoleCode: string | null; committeeCode: string | null }[];
    matter: { label: string; href: string; exerciseId: string | null };
    unitCode: string | null;
    today: string | null;
    reason: string;
  },
): Promise<number> {
  const step = nextStep(i.steps.map((s) => ({ ...s })));
  if (!step || step.committeeCode) return 0;
  const recipients = await deciderIdsOfStep(tx, actor, { unitCode: i.unitCode, today: i.today, roleCode: step.roleCode, actingRoleCode: step.actingRoleCode });
  const by = actor.system ? null : actor.personId;
  return writeNotices(tx, actor.organisationId, by, routeRecalledNotices({ routeId: i.routeId, matter: i.matter, recalledBy: actor.personName, reason: i.reason, recipients, by }));
}
