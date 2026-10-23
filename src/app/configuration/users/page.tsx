import { loadDelegations, loadGrants, loadRoster } from "@/lib/people/load";
import { holdingsOn, rosterFaults } from "@/lib/people/roster";
import { inForce } from "@/lib/people/delegation";
import { uploadContext } from "@/lib/documents/read";
import { uploadView } from "@/lib/documents/views";
import { db } from "@/lib/db";
import { PERMISSION_KEYS, PERMISSIONS, isGrantable } from "@/lib/auth/permissions";
import { loadGrants as loadProductGrants } from "@/lib/auth/permission-store";

import { UsersTabs, type SignInView } from "./panels";
import { PageHeader } from "@/components/ui/page-header";
import { permissionGate, requireStaff } from "@/app/_auth/actor";
import { accountActs, signInStanding } from "@/lib/auth/account-acts";
import { loadAccountsView } from "@/lib/auth/administration-view";
import { RUNTIME_ROLE_WORDS, warnsOnly } from "@/lib/auth/db-role";
import { runtimeRoleCheck } from "@/lib/auth/runtime-role-store";
import { settingLabels } from "@/lib/auth/policy";
import { formatOrgDateTime } from "@/lib/format";
import { disableExposure } from "@/lib/sealing/deactivation";
import { hiddenExercises } from "@/app/_auth/sulit";
import { EXPOSURE_WORDS, HIDDEN_EXPOSURE_LINE } from "@/lib/sealing/deactivation";
import { loadHolderExposures } from "@/lib/sealing/substitution-store";
import { loadWorklist } from "@/lib/approvals/load";
import { absenceVerdict, stayText } from "@/lib/approvals/absence-move";
import { loadReportingLines } from "@/lib/people/reporting-line-store";
import { dayToDate } from "@/lib/dates";

const EMPTY_UPLOAD = { classes: [], people: [], allowedMediaTypes: [], maxBytes: null, ceiling: null, cap: null, refusals: [], timeZoneSet: false, statement: "" };

export const dynamic = "force-dynamic";
export const metadata = { title: "Users & roles" };

/**
 * Users & roles: People (each with their sign-in), Roles and their assignments, Delegation, and Advanced (permissions, reporting lines).
 * The sign-in accounts screen was folded into People (simplification 5.3): the account column and its acts show to whoever holds `accounts.manage`.
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

  // ADR 0036 D11, 20t: what marking each person as left would leave unopenable or unfinalisable, in words, beside the act. An exercise the reader may not see is not named.
  const hidden = new Set(await hiddenExercises(actor));
  const leaverExposure: Record<string, string[]> = {};
  for (const [personId, xs] of await loadHolderExposures(db, actor.organisationId, on)) leaverExposure[personId] = xs.map((x) => (hidden.has(x.exerciseId) ? HIDDEN_EXPOSURE_LINE : EXPOSURE_WORDS[x.kind](x)));

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

  const signIn = await loadSignIn(actor, on, hidden);

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
        info={{ title: "Users & roles", text: "Officers, the offices they hold and what each may see." }}
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
        signIn={signIn}
        stuck={stuck}
        mayMarkAway={actor.permissions.has("configuration.draft")}
        leaverExposure={leaverExposure}
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

/// The People list's sign-in column and acts, for whoever may manage accounts; null for everyone else, so the column is not drawn.
async function loadSignIn(actor: Awaited<ReturnType<typeof requireStaff>>, now: Date, hidden: ReadonlySet<string>): Promise<SignInView | null> {
  if (!(await permissionGate(actor, "accounts.manage")).ok) return null;
  const zone = actor.organisationTimeZone;
  const view = await loadAccountsView(actor, now);
  // Database login too broad: a failed check says nothing rather than guessing.
  const role = await runtimeRoleCheck().catch(() => null);
  const exposed = await loadHolderExposures(db, actor.organisationId, now, view.rows.filter((r) => r.status !== "DISABLED").map((r) => r.personId));
  return {
    creatable: view.people,
    warnings: [
      ...(role && !role.safe ? [warnsOnly(role.reason) ? `Database login too broad. Operator reruns role setup. Runs as ${RUNTIME_ROLE_WORDS[role.reason]}.` : `${role.refuseSignIn ? "Sign-in refused: database login too broad. Contact the operator." : "Database login too broad. Production refuses sign-in. Contact the operator."} Runs as ${RUNTIME_ROLE_WORDS[role.reason]}.`] : []),
      ...(view.codeSettingsUnset.length > 0 ? [`Codes cannot be issued. Not set: ${settingLabels(view.codeSettingsUnset).join("; ")}.`] : []),
    ],
    accounts: Object.fromEntries(
      view.rows.map((r) => {
        const exposure = disableExposure(exposed.get(r.personId) ?? [], hidden);
        return [
          r.personId,
          {
            id: r.id,
            loginName: r.loginName,
            standing: signInStanding(r, now),
            detail: [
              r.lockedUntil && r.lockedUntil > now ? `Locked until ${formatOrgDateTime(r.lockedUntil, zone)}` : null,
              r.openCode ? `${r.openCode.purpose === "ACTIVATION" ? "Activation" : "Reset"} code valid until ${formatOrgDateTime(r.openCode.expiresAt, zone)}` : null,
              r.status === "DISABLED" && r.disabledReason ? r.disabledReason : null,
              !r.personActive && r.status !== "DISABLED" ? "The person is no longer active" : null,
              r.lastSignInAt ? `Last signed in ${formatOrgDateTime(r.lastSignInAt, zone)}` : "Never signed in",
            ].filter((x): x is string => x != null).join(" · "),
            isYou: r.isYou,
            isAdministrator: r.isAdministrator,
            acts: accountActs(r, now),
            exposure: exposure.lines,
            blocked: exposure.blocked,
          },
        ];
      }),
    ),
  };
}
