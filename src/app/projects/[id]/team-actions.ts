"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import type { StaffActor } from "@/lib/auth/types";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf } from "@/lib/dates";
import { WorkRefused, type WorkCtx } from "@/lib/work/store";
import { addTeamMember, changeProjectManager, removeTeamMember } from "@/lib/work/team-store";
import { TEAM_ROLES, type TeamRole } from "@/lib/work/types";

/**
 * The Project team card's staff acts (workspace 3b step 3; plan B-12, WB-7): name someone in a role, remove them with a reason, change the Project manager. This file owns
 * only the edge: who is asking (`staffForAct`: an administrator account is refused, NFR-SEC-004), the form read by hand once per act (nothing the client sends is trusted: the
 * role is one of four, a person is an id the core checks against the organisation), the attribution begun BEFORE the contract is locked, the contract's lock and its
 * `PROJECT_TEAM` row, and the words of a refusal. It restates no rule: `src/lib/work/team.ts` judges and `team-store.ts` writes.
 *
 * Every act answers `{ refused?: string }`, never throws a rule. The team acts lock the contract and nothing else.
 *
 * Form fields (all acts take `contractId`):
 *   addTeamMember          `role`, `personId`.
 *   removeTeamMember       `role`, `personId`, `reason`.
 *   changeProjectManager   `personId`.
 */

export type TeamResult = { refused?: string };

const GONE: TeamResult = { refused: "That contract no longer exists." };
const UNREADABLE: TeamResult = { refused: "That didn't go through. Reload and try again." };

/// The contract, locked (requisition, exercise, award, contract: `withLockedContract`), the PROJECT_TEAM row asked first, then the act.
async function inContract(actor: StaffActor, contractId: string, now: Date, fn: (c: WorkCtx) => Promise<TeamResult>): Promise<TeamResult> {
  let result: TeamResult | null;
  try {
    result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
      // The act x status table, first and under the lock: the team can be named from Executed through the final certificate.
      const shut = actStatusFault("PROJECT_TEAM", l.contract.status as ContractStatus);
      if (shut) return { refused: actStatusText(shut) };
      // The organisation's day, never UTC's; null when no time zone is set (the Project manager needs none, the S.O. fallback does).
      const today = dayOf(now, l.org.timeZone);
      return fn({ tx, l, now, today });
    });
  } catch (e) {
    if (e instanceof WorkRefused) {
      revalidatePath(`/projects/${contractId}`);
      return { refused: e.words };
    }
    const attribution = attributionRefusalState(e);
    if (attribution) return { refused: stateWords(attribution) };
    throw e;
  }
  if (result === null) return GONE;
  revalidatePath(`/projects/${contractId}`);
  return result;
}

const stateWords = (s: FormState): string => s.message ?? (Object.values(s.errors ?? {}).join(" ") || "Not recorded.");

// ------------------------------------------------------------------ the form, read once

const text = (data: FormData, name: string): string => {
  const v = data.get(name);
  return typeof v === "string" ? v.trim() : "";
};
/// An id the form names: a non-empty string of a sane length, else "" (which every act refuses as unreadable).
const idOf = (data: FormData, name: string): string => {
  const v = text(data, name);
  return v.length <= 100 ? v : "";
};
const roleOf = (data: FormData): TeamRole | null => {
  const v = text(data, "role");
  return (TEAM_ROLES as readonly string[]).includes(v) ? (v as TeamRole) : null;
};

// ------------------------------------------------------------------ the acts

/// Name someone in a role. The attribution is "Recorded by" (the signed-in officer's own act).
export async function addTeamMemberAction(data: FormData): Promise<TeamResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const personId = idOf(data, "personId");
  const role = roleOf(data);
  if (!contractId || !personId || !role) return UNREADABLE;
  const begun = await beginAct(actor, data, "ProjectTeamMember.addedBy", { personField: "addedByPersonId", onBehalf: false });
  if (!begun.ok) return { refused: stateWords(begun.state) };
  const act = begun.act;
  return inContract(actor, contractId, now, async (c) => {
    await addTeamMember(c, actor, { role, personId }, act);
    return {};
  });
}

/// Take someone out of a role, with a reason. A delete, audited; no attribution slot.
export async function removeTeamMemberAction(data: FormData): Promise<TeamResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const personId = idOf(data, "personId");
  const role = roleOf(data);
  if (!contractId || !personId || !role) return UNREADABLE;
  const reason = text(data, "reason");
  return inContract(actor, contractId, now, async (c) => {
    await removeTeamMember(c, actor, { role, personId, reason });
    return {};
  });
}

/// Change the Project manager: the old row out and the new one in, in one act.
export async function changeProjectManagerAction(data: FormData): Promise<TeamResult> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return { refused: stateWords(guard.state) };
  const actor = guard.actor;
  const now = toSecond(new Date());
  const contractId = idOf(data, "contractId");
  const personId = idOf(data, "personId");
  if (!contractId || !personId) return UNREADABLE;
  const begun = await beginAct(actor, data, "ProjectTeamMember.addedBy", { personField: "addedByPersonId", onBehalf: false });
  if (!begun.ok) return { refused: stateWords(begun.state) };
  const act = begun.act;
  return inContract(actor, contractId, now, async (c) => {
    await changeProjectManager(c, actor, { personId }, act);
    return {};
  });
}
