import { ActGate } from "@/components/act-gate";
import { UsersIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { TEAM_ROLE_WORDS, teamFaultText } from "@/lib/work/labels";
import { leadOf, loadTeamCard, namesOf } from "@/lib/work/load";
import { db } from "@/lib/db";
import { mayChangeTeam } from "@/lib/work/team";
import { TEAM_ROLES, type WorkActor } from "@/lib/work/types";

import { AddTeamMember, ChangeManager, RemoveTeamMember } from "./team-editors";

type Option = { value: string; label: string };

/**
 * The Project team (workspace 3b L1; WB-7, WB-8): up to four roles that route work and notices and carry no authority. A card of role and person rows; Add, Change manager
 * and Remove (which asks a reason) are drawers. Without a Project manager the card says so in the warn tone. Who may change the team is `mayChangeTeam`'s; a reader who may
 * not sees the controls blocked with the lead named.
 */
export async function ProjectTeamCard({ actor, l, people, today }: { actor: StaffActor; l: LoadedContract; people: Option[]; today: string | null }) {
  const contractId = l.contract.id;
  const org = l.org.id;
  const shut = actStatusBlocker("PROJECT_TEAM", l.contract.status as ContractStatus);
  const [team, lead] = await Promise.all([loadTeamCard({ organisationId: org, contractId }), leadOf(l, today)]);
  const leadNames = await namesOf(db, org, lead.ids);
  const reader: WorkActor = { side: "STAFF", personId: actor.personId, leadIds: lead.ids, mayReadContract: true };
  const leadWords = lead.roleLabel ? { roleLabel: lead.roleLabel, names: lead.ids.map((id) => leadNames.get(id) ?? "Someone") } : null;
  const blocked = shut ?? (mayChangeTeam(reader) ? null : teamFaultText({ code: "NOT_LEAD" }, leadWords));
  const manager = team.find((m) => m.role === "PROJECT_MANAGER") ?? null;
  const roles = TEAM_ROLES.filter((r) => r !== "PROJECT_MANAGER" || !manager).map((r) => ({ value: r, label: TEAM_ROLE_WORDS[r].en }));
  return (
    <ActGate blocker={shut}>
    <Card className="overflow-hidden">
      <CardHeader
        icon={<UsersIcon size={17} />}
        title="Project team"
        info={{ label: "About the Project team", text: "People named for a role on this contract. They are told of work and assigned it by default; the role gives no approval authority." }}
        actions={blocked ? <Blocked label="Add" reason={blocked} /> : <AddTeamMember contractId={contractId} roles={roles} people={people} />}
        divided={team.length > 0 || !manager}
      />
      {!manager && (
        <div className="px-5 pb-3 sm:px-6">
          <Callout tone="warn" title="No project manager">
            {lead.roleLabel ? `The ${lead.roleLabel} leads until one is named.` : "Nobody leads this contract's work yet."}
          </Callout>
        </div>
      )}
      {team.length === 0 ? (
        <EmptyState size="sm" title="Nobody named yet" />
      ) : (
        <ul className="divide-y divide-line/70">
          {team.map((m) => (
            <li key={`${m.role}-${m.personId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <span className="min-w-0">
                <span className="block text-[12.5px] text-ink-3">{m.roleLabel}</span>
                <span className="block text-[14px] font-semibold break-words text-ink">{m.name}</span>
              </span>
              {!blocked && (
                <span className="flex items-center gap-1">
                  {m.role === "PROJECT_MANAGER" && <ChangeManager contractId={contractId} people={people} currentId={m.personId} />}
                  <RemoveTeamMember contractId={contractId} role={m.role} roleLabel={m.roleLabel} personId={m.personId} name={m.name} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
    </ActGate>
  );
}
