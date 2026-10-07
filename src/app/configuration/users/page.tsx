import { loadDelegations, loadGrants, loadRoster } from "@/lib/people/load";
import { holdingsOn, rosterFaults } from "@/lib/people/roster";
import { inForce } from "@/lib/people/delegation";
import { uploadContext } from "@/lib/documents/read";
import { uploadView } from "@/lib/documents/views";
import { db } from "@/lib/db";

import { UsersTabs } from "./panels";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/app/_auth/actor";

const EMPTY_UPLOAD = { classes: [], people: [], allowedMediaTypes: [], maxBytes: null, ceiling: null, cap: null, refusals: [], timeZoneSet: false, statement: "" };

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
  const actor = await requireStaff();
  const on = new Date();
  const { tab } = await searchParams;
  const [roster, grants, delegations, upload, units] = await Promise.all([
    loadRoster(actor.organisationCode),
    loadGrants(actor.organisationCode),
    loadDelegations(actor.organisationCode),
    uploadContext(actor.organisationId),
    // 6.7 (C-6): the units a person may sit in, for an opening panel's independence rule.
    // A unit with several dated versions appears once, under its latest name.
    db.orgUnit
      .findMany({ where: { organisation: { code: actor.organisationCode } }, orderBy: { effectiveFrom: "desc" }, distinct: ["code"], select: { code: true, nameEn: true } })
      .then((us) => us.sort((a, b) => a.nameEn.localeCompare(b.nameEn))),
  ]);

  const holdings = holdingsOn(roster, on).map((h) => ({
    personId: h.person.id,
    roleCode: h.assignment.roleCode,
  }));
  const live = inForce(delegations, on).length;
  // In force or yet to begin: an assignment that has ended is history, not something
  // to edit. Faults are reported, never repaired — who should hold a vacant office is
  // the organisation's decision.
  const assignments = roster.assignments.filter((a) => a.effectiveTo == null || a.effectiveTo > on);
  const faults = rosterFaults(roster, on, roster.routedToCodes);

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
        assignments={assignments}
        faults={faults}
        capabilities={grants.capabilities}
        grants={grants.grants}
        delegations={delegations}
        upload={uploadView(upload ?? EMPTY_UPLOAD)}
        units={units}
      />
    </>
  );
}
