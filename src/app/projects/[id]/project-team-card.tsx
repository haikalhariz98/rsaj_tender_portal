import { ActGate } from "@/components/act-gate";
import { UsersIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { MoreText } from "@/components/ui/more-text";
import { TEAM_LOCKED_WORDS, TEAM_ROLE_WORDS, teamFaultText } from "@/lib/work/labels";
import { contractorNameOf, leadOf, loadTeamCard, teamChangersOf } from "@/lib/work/load";
import { teamChangeFaults } from "@/lib/work/team";
import { TEAM_ROLES, type WorkActor } from "@/lib/work/types";

import { AddTeamMember, ChangeManager, RemoveTeamMember } from "./team-editors";

type Option = { value: string; label: string };

/**
 * The Project team (workspace 3b L1; WB-7, WB-8): up to four roles that route work and notices and carry no authority. A card of role and person rows; Add, Change manager
 * and Remove (which asks a reason) are drawers. Without a Project manager the card says so in the warn tone. Who may change the team is `teamChangeFaults` (the act asks the same
 * rule, WSEC-2): the Project manager or an S.O. in force. A reader who may not sees the controls blocked with them named; with neither, the card is locked and the warning's popover
 * says what to set. The contractor may see these names on shared items (WSEC-8), and the card's popover says so.
 */
export async function ProjectTeamCard({ actor, l, people, today }: { actor: StaffActor; l: LoadedContract; people: Option[]; today: string | null }) {
  const contractId = l.contract.id;
  const org = l.org.id;
  const contractor = contractorNameOf(l);
  const shut = actStatusBlocker("PROJECT_TEAM", l.contract.status as ContractStatus);
  const [team, lead, changers] = await Promise.all([loadTeamCard({ organisationId: org, contractId }), leadOf(l, today), teamChangersOf(l, today)]);
  const reader: WorkActor = { side: "STAFF", personId: actor.personId, leadIds: [], mayReadContract: true };
  const blocked = shut ?? (teamChangeFaults(reader, changers.ids).length === 0 ? null : teamFaultText({ code: "NOT_LEAD" }, changers.words));
  const locked = changers.ids.length === 0;
  const manager = team.find((m) => m.role === "PROJECT_MANAGER") ?? null;
  const roles = TEAM_ROLES.filter((r) => r !== "PROJECT_MANAGER" || !manager).map((r) => ({ value: r, label: TEAM_ROLE_WORDS[r].en }));
  return (
    <ActGate blocker={shut}>
    <Card className="overflow-hidden">
      <CardHeader
        icon={<UsersIcon size={17} />}
        title="Project team"
        info={{ label: "About the Project team", text: `People named for a role on this contract. They are told of work and assigned it by default; the role gives no approval authority. ${contractor} may see these names on shared items.` }}
        actions={blocked ? <Blocked label="Add" reason={blocked} /> : <AddTeamMember contractId={contractId} roles={roles} people={people} />}
        divided={team.length > 0 || !manager}
      />
      {!manager && (
        <div className="px-5 pb-3 sm:px-6">
          <Callout
            tone="warn"
            title={
              locked ? (
                <span className="inline-flex items-center gap-1.5">
                  No project manager <MoreText text={TEAM_LOCKED_WORDS.en} label="What to set" />
                </span>
              ) : (
                "No project manager"
              )
            }
          >
            {locked ? null : lead.roleLabel ? `The ${lead.roleLabel} leads until one is named.` : "Nobody leads this contract's work yet."}
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
