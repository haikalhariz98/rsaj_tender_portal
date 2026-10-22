/**
 * The organisation's side on a day, read (PW-16): `organisationSide` (`side.ts`) over the contract's S.O. office (`soOfficeOn`) and delegations
 * (`delegationFactsOf`), with each person's name. A reader, not pure: called by the approver picker (step 4), the store's PW-5 check, and the portal's
 * read-only list of the S.O. and representatives (step 7), inside the act's transaction where there is one (`client`).
 */

import type { Tx } from "@/lib/audit/record";
import type { LoadedContract } from "@/lib/contract/repo";
import { delegationFactsOf, soOfficeOn, type SupervisionRows } from "@/lib/supervision/load";

import { organisationSide, type SideCapacity } from "./side";

export async function organisationSideOn(
  l: LoadedContract,
  s: SupervisionRows,
  day: string,
  client: Tx,
): Promise<{ personId: string; name: string; capacity: SideCapacity; officeLabel: string; mayAct: boolean }[]> {
  const so = await soOfficeOn(l, s, day, client);
  const members = organisationSide(so?.office ?? null, delegationFactsOf(s), day);
  if (members.length === 0) return [];
  const people = await client.person.findMany({ where: { organisationId: l.org.id, id: { in: members.map((m) => m.personId) } }, select: { id: true, name: true } });
  const name = new Map(people.map((p) => [p.id, p.name]));
  // A person of another organisation is never on this side: the roster and the delegations are the organisation's own, so none is expected.
  return members.flatMap((m) => {
    const n = name.get(m.personId);
    return n === undefined ? [] : [{ ...m, name: n }];
  });
}
