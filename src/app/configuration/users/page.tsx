import { loadDelegations, loadGrants, loadRoster } from "@/lib/people/load";
import { holdingsOn, rosterFaults } from "@/lib/people/roster";
import { inForce } from "@/lib/people/delegation";
import { uploadContext } from "@/lib/documents/read";
import { uploadView } from "@/lib/documents/views";
import { db } from "@/lib/db";
import { PERMISSION_KEYS, PERMISSIONS, isGrantable } from "@/lib/auth/permissions";
import { loadGrants as loadProductGrants } from "@/lib/auth/permission-store";

import { UsersTabs } from "./panels";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises } from "@/app/_auth/sulit";
import { loadWorklist } from "@/lib/approvals/load";
import { absenceVerdict, stayText } from "@/lib/approvals/absence-move";
import { loadReportingLines } from "@/lib/people/reporting-line-store";
import { dayToDate } from "@/lib/dates";

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
  const [roster, grants, delegations, upload, units, productDecisions, productPending, lines, worklist] = await Promise.all([
    loadRoster(actor.organisationCode),
    loadGrants(actor.organisationCode),
    loadDelegations(actor.organisationCode),
    uploadContext(actor.organisationId),
    // 6.7 (C-6): the units a person may sit in, for an opening panel's independence rule.
    // A unit with several dated versions appears once, under its latest name.
    db.orgUnit
      .findMany({ where: { organisation: { code: actor.organisationCode } }, orderBy: { effectiveFrom: "desc" }, distinct: ["code"], select: { code: true, nameEn: true } })
      .then((us) => us.sort((a, b) => a.nameEn.localeCompare(b.nameEn))),
    loadProductGrants(db, actor.organisationId),
    db.configurationChange.findMany({ where: { organisationId: actor.organisationId, kind: "PERMISSION_GRANT", status: "PROPOSED" }, select: { payload: true } }),
    loadReportingLines(db, actor.organisationId),
    // The steps waiting on an office nobody is able to act in: the page says why each stays (the sweep's own reasons), and the matter is named only where the reader may see it.
    hiddenExercises(actor).then((hidden) => loadWorklist(actor, hidden)),
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

  const nameOf = new Map(roster.people.map((p) => [p.id, p.name]));
  const lineDay = worklist?.today ? dayToDate(worklist.today) : on;
  const stuck = (worklist?.groups.flatMap((g) => g.items) ?? [])
    .filter((i) => i.noneAvailable && !i.committee)
    .map((i) => {
      const verdict = absenceVerdict({ holderIds: i.holderIds, lines, on: lineDay });
      return { stepId: i.stepId, matter: i.matterLabel, office: i.officeLabel, why: verdict.move ? "The reporting line names who is above its holders, so \"Move steps held by people who are away\" on the worklist will try to move it. It moves it only if that superior holds the office the step would move to; if it stays, the worklist says why." : stayText(verdict.why, verdict.holderIdsWithoutLine.map((id) => nameOf.get(id) ?? "A person no longer on record")) };
    });

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
        lines={lines.map((l) => ({ id: l.id, personId: l.personId, superiorPersonId: l.superiorPersonId, effectiveFrom: l.effectiveFrom, effectiveTo: l.effectiveTo, provenance: l.provenance, note: l.note }))}
        stuck={stuck}
        mayMarkAway={actor.permissions.has("configuration.draft")}
        upload={uploadView(upload ?? EMPTY_UPLOAD)}
        units={units}
        product={{
          keys: PERMISSION_KEYS.map((key) => ({ key, label: PERMISSIONS[key].label.en, lets: PERMISSIONS[key].lets.en, grantable: isGrantable(key) })),
          decisions: productDecisions.flatMap((d) => (d.decision === "GRANTED" || d.decision === "WITHHELD" ? [{ permissionKey: d.permissionKey, roleCode: d.roleCode, decision: d.decision }] : [])),
          pending: productPending.map((c) => c.payload as { permissionKey: string; roleCode: string }),
          canPropose: actor.permissions.has("permissions.grant"),
        }}
      />
    </>
  );
}
