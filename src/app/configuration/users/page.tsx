import { loadDelegations, loadGrants, loadRoster } from "@/lib/people/load";
import { holdingsOn } from "@/lib/people/roster";
import { inForce } from "@/lib/people/delegation";
import { ORGANISATION_CODE } from "@/lib/org";

import { UsersTabs } from "./panels";

export const dynamic = "force-dynamic";

/**
 * Users & roles, in the prototype's shape: four tabs under a page head whose counts
 * sit in the meta line rather than in stat tiles.
 *
 * The three sections this replaced — Officers, Offices, Assignments — were a
 * different decomposition of the same data, and the fault callouts that sat above
 * them are gone with them.
 */
export default async function UsersPage() {
  const on = new Date();
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
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1 trunc">Users &amp; roles</h1>
            </div>
            <p className="pagehead__sub clamp2">
              Officers, the offices they hold and what each may see.
            </p>
            <div className="pagehead__meta">
              <span className="row">
                {roster.people.length} {roster.people.length === 1 ? "person" : "people"}
              </span>
              <span className="sep">·</span>
              <span className="row">
                {roster.offices.length} {roster.offices.length === 1 ? "role" : "roles"}
              </span>
              <span className="sep">·</span>
              <span className="row">
                {live} {live === 1 ? "delegation" : "delegations"} in force
              </span>
            </div>
          </div>
        </div>
      </div>

      <UsersTabs
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
