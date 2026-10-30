/**
 * The Project team's acts, as transactional cores (workspace 3b step 3; plan §3.1 "project_team", B-12, B-13, WB-7; ADR 0049 D4): add a member, remove one with a reason,
 * change the Project manager. Roles route work and notices and never carry authority: no approval, certificate, document or delegation act reads this table.
 *
 * Each core runs INSIDE a locked contract handed to it by its caller (`team-actions.ts`, `withLockedContract`), so none takes the contract's lock, and none takes any
 * other: the team acts lock the contract only (the contract lock serialises two people naming a manager; the partial unique index is the backstop). The same steps as the
 * work acts, in order: 1. the `PROJECT_TEAM` act x status row; 2. who may change the team (the lead; with no lead, any staff reader, WB-7); 3. the pure faults (`teamFaults`);
 * 4. the guarded write; 5. `writeAudit` with the before and after, as words and never ids; 6. (no notices); 7. `act.write` for the added row's slot. A refusal throws
 * `WorkRefused` before the first write, so nothing is left.
 */

import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import type { PreparedAct } from "@/lib/auth/act-begin";
import { auditActorOfStaff } from "@/lib/auth/audit-actor";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";

import { teamFaultText, TEAM_ROLE_WORDS } from "./labels";
import { activeAmong, leadOf, loadTeamMembers, namesOf } from "./load";
import { WorkRefused, type WorkCtx } from "./store";
import { teamFaults, type TeamChange, type TeamFault } from "./team";
import type { TeamRole, WorkActor } from "./types";

/// Step 1 of every team act: the contract's status, said in the act x status table's words.
function gate(c: WorkCtx): void {
  const shut = actStatusFault("PROJECT_TEAM", c.l.contract.status as ContractStatus);
  if (shut) throw new WorkRefused(actStatusText(shut));
}

/// The reason a replaced Project manager's row carries (the change is a remove and an add in one act).
const REPLACED = "Replaced by another Project manager.";

/// Steps 2 and 3: who may, then the change against the team as it stands. Throws the refusal in words.
async function judged(c: WorkCtx, who: StaffActor, change: TeamChange): Promise<Awaited<ReturnType<typeof loadTeamMembers>>> {
  const team = await loadTeamMembers(c.tx, c.l.org.id, c.l.contract.id);
  const lead = await leadOf(c.l, c.today, c.tx);
  const actor: WorkActor = { side: "STAFF", personId: who.personId, leadIds: lead.ids, mayReadContract: true };
  const activeIds = await activeAmong(c.tx, c.l.org.id, [change.personId]);
  const faults: TeamFault[] = teamFaults(team, change, actor, activeIds);
  if (faults.length === 0) return team;
  const names = await namesOf(c.tx, c.l.org.id, lead.ids);
  const said = lead.roleLabel ? { roleLabel: lead.roleLabel, names: lead.ids.map((id) => names.get(id) ?? "Someone") } : null;
  throw new WorkRefused([...new Set(faults.map((f) => teamFaultText(f, said)))].join(" "));
}

const label = (c: WorkCtx) => `Contract ${c.l.contract.number} · Project team member`;
const view = (role: TeamRole, name: string) => ({ role: TEAM_ROLE_WORDS[role].en, person: name });

const record = (c: WorkCtx, who: StaffActor, id: string, action: "CREATE" | "DELETE", role: TeamRole, name: string, reason = "") =>
  writeAudit(
    c.tx,
    { actor: auditActorOfStaff(who), organisationId: c.l.org.id, entity: "ProjectTeamMember", entityId: id, entityLabel: label(c), reason },
    action,
    action === "CREATE" ? diffFields(null, view(role, name)) : diffFields(view(role, name), { role: null, person: null }),
  );

const nameOf = async (c: WorkCtx, personId: string): Promise<string> => (await namesOf(c.tx, c.l.org.id, [personId])).get(personId) ?? "Someone";

async function add(c: WorkCtx, who: StaffActor, role: TeamRole, personId: string): Promise<string> {
  const row = await c.tx.projectTeamMember.create({ data: { organisationId: c.l.org.id, contractId: c.l.contract.id, role, personId, addedByPersonId: who.personId, recordedAt: c.now }, select: { id: true } });
  await record(c, who, row.id, "CREATE", role, await nameOf(c, personId));
  return row.id;
}

/// Name someone in a role (a second Project manager is refused: change the manager instead).
export async function addTeamMember(c: WorkCtx, who: StaffActor, i: { role: TeamRole; personId: string }, act: PreparedAct): Promise<{ id: string }> {
  gate(c);
  await judged(c, who, { op: "ADD", role: i.role, personId: i.personId });
  const id = await add(c, who, i.role, i.personId);
  await act.write(c.tx, id);
  return { id };
}

/// Take someone out of a role, with a reason. A delete, and the delete is audited with what it removed.
export async function removeTeamMember(c: WorkCtx, who: StaffActor, i: { role: TeamRole; personId: string; reason: string }): Promise<void> {
  gate(c);
  await judged(c, who, { op: "REMOVE", role: i.role, personId: i.personId, reason: i.reason });
  const found = await c.tx.projectTeamMember.findFirst({ where: { organisationId: c.l.org.id, contractId: c.l.contract.id, role: i.role, personId: i.personId }, select: { id: true } });
  if (!found) throw new WorkRefused("They are not on the team any more.", 409);
  const removed = await c.tx.projectTeamMember.deleteMany({ where: { id: found.id, organisationId: c.l.org.id, contractId: c.l.contract.id } });
  if (removed.count !== 1) throw new WorkRefused("They are not on the team any more.", 409);
  await record(c, who, found.id, "DELETE", i.role, await nameOf(c, i.personId), i.reason.trim());
}

/// Change the Project manager: the old row out and the new one in, in one act (the partial unique index allows one manager, so the delete comes first).
export async function changeProjectManager(c: WorkCtx, who: StaffActor, i: { personId: string }, act: PreparedAct): Promise<{ id: string }> {
  gate(c);
  const team = await judged(c, who, { op: "CHANGE_MANAGER", personId: i.personId });
  const current = team.find((m) => m.role === "PROJECT_MANAGER");
  if (current) {
    const old = await c.tx.projectTeamMember.findFirst({ where: { organisationId: c.l.org.id, contractId: c.l.contract.id, role: "PROJECT_MANAGER", personId: current.personId }, select: { id: true } });
    if (!old) throw new WorkRefused("Someone changed the team a moment ago.", 409);
    const removed = await c.tx.projectTeamMember.deleteMany({ where: { id: old.id, organisationId: c.l.org.id, contractId: c.l.contract.id } });
    if (removed.count !== 1) throw new WorkRefused("Someone changed the team a moment ago.", 409);
    await record(c, who, old.id, "DELETE", "PROJECT_MANAGER", await nameOf(c, current.personId), REPLACED);
  }
  const id = await add(c, who, "PROJECT_MANAGER", i.personId);
  await act.write(c.tx, id);
  return { id };
}
