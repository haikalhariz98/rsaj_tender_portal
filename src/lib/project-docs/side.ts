/**
 * The organisation's side of a contract on a day (PW-5, PW-16; ADR 0042 D2, D9): the S.O. office's holders, those acting in it, and the representatives in
 * force, each once, with whether they may act in the Project workspace. The rule is PW-5's, and it is `capacityFor` with the act CONTRACTOR_COMMUNICATION:
 * a holder or an acting holder may; a representative may when a delegation in force lists contractor communication; nobody else may, so other staff read
 * only. `side-store.ts` reads the rows and names the people; the rule is here, tested without a database. Pure.
 *
 * Not `recorderFaultToday`: that judges only a representative who records an act, and lets through a person with no office and no delegation (and anyone
 * where no S.O. is resolved), which PW-5 refuses.
 */

import { capacityFor, inForce, type DelegationFacts, type SoOffice } from "@/lib/supervision/authority";
import { DELEGATE_KIND_WORDS } from "@/lib/supervision/labels";
import type { Day } from "@/lib/supervision/types";

export type SideCapacity = "SO" | "ACTING" | "REPRESENTATIVE";

export interface SideMember {
  personId: string;
  capacity: SideCapacity;
  /// The office's configured name, or the representative's kind of delegation, in words.
  officeLabel: string;
  mayAct: boolean;
}

const NEED = { act: "CONTRACTOR_COMMUNICATION" } as const;

/// PW-5 for one person on a day: may they act in the Project workspace for the organisation?
export const mayActForOrganisation = (personId: string, so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day): boolean =>
  capacityFor(personId, NEED, so, delegations, day).capacity !== null;

/**
 * Everyone on the organisation's side on the day, holders first, then acting holders, then representatives, each person once (a holder who is also a
 * representative is listed as the holder). With no S.O. resolved on the day, the representatives in force are still listed, and none may act.
 */
export function organisationSide(so: SoOffice | null, delegations: readonly DelegationFacts[], day: Day): SideMember[] {
  const out: SideMember[] = [];
  const seen = new Set<string>();
  const push = (personId: string, capacity: SideCapacity, officeLabel: string) => {
    if (seen.has(personId)) return;
    seen.add(personId);
    out.push({ personId, capacity, officeLabel, mayAct: mayActForOrganisation(personId, so, delegations, day) });
  };
  if (so) {
    for (const id of so.holderIds) push(id, "SO", so.roleLabel);
    for (const id of so.actingIds) push(id, "ACTING", so.roleLabel);
  }
  const live = delegations.filter((d) => inForce(d, day));
  // A representative with several letters in force is labelled by the one that lets them act, where one does.
  const covering = (personId: string) => live.find((d) => d.delegatePersonId === personId && d.scope.includes(NEED.act));
  for (const d of live) push(d.delegatePersonId, "REPRESENTATIVE", DELEGATE_KIND_WORDS[(covering(d.delegatePersonId) ?? d).kind].en);
  return out;
}
