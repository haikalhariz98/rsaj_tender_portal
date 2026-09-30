import { loadDelegations, loadGrants, loadRoster } from "@/lib/people/load";
import { holdingsOn } from "@/lib/people/roster";
import { inForce } from "@/lib/people/delegation";
import { ORGANISATION_CODE } from "@/lib/org";

import { UsersTabs } from "./panels";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/**
 * Users & roles, in the prototype's shape: four tabs under a page head whose counts
 * sit in the meta line rather than in stat tiles.
 *
 * The three sections this replaced — Officers, Offices, Assignments — were a
 * different decomposition of the same data, and the fault callouts that sat above
 * them are gone with them.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const on = new Date();
  const { tab } = await searchParams;
  const [roster, grants, delegations] = await Promise.all([
    loadRoster(ORGANISATION_CODE),
    loadGrants(ORGANISATION_CODE),
    loadDelegations(ORGANISATION_CODE),
  ]);

  const holdings = holdingsOn(roster, on).map((h) => ({
    personId: h.person.id,
    roleCode: h.assignment.roleCode,
  }));
  const live = inForce(delegations, on).length;

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle="Officers, the offices they hold and what each may see."
        meta={[
          `${roster.people.length} ${roster.people.length === 1 ? "person" : "people"}`,
          `${roster.offices.length} ${roster.offices.length === 1 ? "role" : "roles"}`,
          `${live} ${live === 1 ? "delegation" : "delegations"} in force`,
        ]}
      />

      <UsersTabs
        initial={tab}
        people={roster.people}
        offices={roster.offices}
        holdings={holdings}
        capabilities={grants.capabilities}
        grants={grants.grants}
        delegations={delegations}
      />
    </>
  );
}
