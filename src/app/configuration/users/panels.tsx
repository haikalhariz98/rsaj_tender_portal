"use client";

import { OwnerDocumentsButton } from "@/components/attachments/owner-documents-button";
import type { UploadView } from "@/lib/documents/views";
import { delegationCeilingText, delegationPeriodText, recommendationLabel } from "@/lib/people/labels";
import { periodText } from "@/lib/effective-text";
import { formatDate } from "@/lib/format";
import { useState, useTransition } from "react";

import {
  CalendarIcon,
  ClockIcon,
  GridIcon,
  SearchIcon,
  ShieldIcon,
  SwapIcon,
  UserIcon,
} from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { InfoChip } from "@/components/ui/info-chip";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/field";
import { Tabs } from "@/components/tabs";
import {
  byGroup,
  capabilitiesForRoles,
  capabilityState,
  decidedRoles,
  type Capability,
  type Grant,
} from "@/lib/people/capabilities";
import { BEFORE_SUPERIOR_RULE, BEFORE_SUPERIOR_RULE_SHORT, delegationNotes, holderOf, statusOf, type Delegation } from "@/lib/people/delegation";
import { REPORTING_LINE_NOT_SET } from "@/lib/people/reporting-lines";
import type { Assignment, Office, Person, RosterFault } from "@/lib/people/types";

import { setGrant } from "./actions";
import { ProductPermissionRow, type ProductPermissions } from "./product-permissions";
import {
  AddAssignment,
  EditAssignment,
  EndAssignment,
  AddDelegation,
  AddOffice,
  AddPerson,
  AddReportingLine,
  EditDelegation,
  EditReportingLine,
  type ReportingLineRow,
  EditOffice,
  EditPerson,
  LeaverToggle,
} from "./editors";

/**
 * The four tabs of Users & roles, in the prototype's own order and shape.
 *
 * Client-side because the tab strip holds the selection and each list carries its own
 * search and filters. The data is loaded on the server and handed down whole; nothing
 * here queries.
 */


/// How each delegation status reads. Derived from the period, never stored.
const STATUS_LABEL = {
  IN_FORCE: "In force",
  SCHEDULED: "Scheduled",
  ENDED: "Ended",
} as const;

export interface UsersData {
  people: Person[];
  offices: Office[];
  holdings: { personId: string; roleCode: string }[];
  /// Assignments in force or yet to begin, for editing and ending.
  assignments: Assignment[];
  faults: RosterFault[];
  capabilities: Capability[];
  grants: Grant[];
  delegations: Delegation[];
  /// What the delegation form needs to attach the signed recommendation.
  upload: UploadView;
  /// 6.7: the units a person may sit in, by name.
  units: { code: string; nameEn: string }[];
  /// The product's own permissions and the organisation's decisions about them (Phase 2c).
  product: ProductPermissions;
  /// Reporting lines (FR-APR-010/011): empty as shipped, which the tab says in words.
  lines: ReportingLineRow[];
  /// Steps waiting on an office with nobody able to act because its holders are away, and why each stays (the sweep's reasons).
  stuck: { stepId: string; matter: string; office: string; why: string }[];
  /// The viewer may record a person as away (`configuration.draft`, ruling on log line 1770).
  mayMarkAway: boolean;
  /// By person: what marking them as left would leave unopenable or unfinalisable (ADR 0036 D11, 20t), in words. Absent: nothing.
  leaverExposure: Record<string, string[]>;
}

export function UsersTabs({ initial, ...data }: UsersData & { initial?: string }) {
  return (
    <Tabs
      initial={initial}
      tabs={[
        { id: "people", label: "People", panel: <PeoplePanel {...data} /> },
        { id: "roles", label: "Roles", panel: <RolesPanel {...data} /> },
        { id: "permissions", label: "Permissions", panel: <PermissionsPanel {...data} /> },
        { id: "delegation", label: "Delegation", panel: <DelegationPanel {...data} /> },
        { id: "lines", label: "Reporting lines", count: data.lines.length, panel: <ReportingLinesPanel {...data} /> },
      ]}
    />
  );
}

// ------------------------------------------------------------------------ People

function PeoplePanel({ people, offices, holdings, capabilities, grants, delegations, units, mayMarkAway, leaverExposure }: UsersData) {
  const officeName = (code: string | null) =>
    code ? (offices.find((o) => o.code === code)?.nameEn ?? code) : "";
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on record";

  // The vocabulary of authority levels is whatever the customer has put on their
  // roles. Never a list in code — a level nobody configured is not a level.
  const authorityLevels = [...new Set(offices.map((o) => o.authorityLevel).filter(Boolean))].sort();

  const rows: Row[] = people.map((p) => ({
    id: p.id,
    views: [...(p.isAvailable ? [] : ["away"]), ...(p.isActive ? [] : ["left"])],
    search: [p.name, p.email, p.jobTitle, p.department, officeName(p.portalRoleCode)]
      .filter(Boolean)
      .join(" "),
    cells: {
      name: { kind: "person", name: p.name, sub: p.email ?? undefined },
      jobTitle: { kind: "text", text: p.jobTitle ?? "—", dim: !p.jobTitle },
      department: { kind: "text", text: p.department ?? "—", dim: !p.department },
      portalRole: p.portalRoleCode
        ? { kind: "badge", text: officeName(p.portalRoleCode) }
        : { kind: "text", text: "Not set", dim: true },
      availability: p.isAvailable
        ? { kind: "badge", text: "In", tone: "ok" }
        : { kind: "badge", text: "Away", tone: "warn" },
    },
  }));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<UserIcon size={17} />}
        title="User register"
        subtitle="Everyone on record"
        actions={<AddPerson offices={offices} authorityLevels={authorityLevels} units={units} />}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        exportName="people"
        searchPlaceholder="Search people"
        emptyTitle="Nobody on record"
        emptyBody="Add a person before assigning a role."
        views={[
          { id: "away", label: "Away" },
          { id: "left", label: "Left the organisation" },
        ]}
        filters={[
          { key: "portalRole", label: "Portal role" },
          { key: "department", label: "Department" },
        ]}
        columns={[
          { key: "name", label: "Name", width: "26%", sortable: true, mobile: "primary" },
          { key: "jobTitle", label: "Job title", width: "20%", sortable: true, mobile: "meta" },
          { key: "department", label: "Department", width: "18%", sortable: true, mobile: "meta" },
          { key: "portalRole", label: "Portal role", width: "16%", mobile: "meta" },
          { key: "availability", label: "Availability", width: "12%", mobile: "meta" },
        ]}
        rows={rows}
        rowOpens
        actions={(id) => {
          const person = people.find((p) => p.id === id);
          if (!person) return null;
          const roleCodes = [
            ...holdings.filter((h) => h.personId === id).map((h) => h.roleCode),
            ...(person.portalRoleCode ? [person.portalRoleCode] : []),
          ];
          return (
            <>
              <EditPerson
                person={person}
                offices={offices}
                authorityLevels={authorityLevels}
                capabilities={capabilitiesForRoles(capabilities, grants, roleCodes)}
                delegations={delegations.filter(
                  (d) => d.fromPersonId === id || d.toPersonId === id,
                )}
                nameOf={nameOf}
                units={units}
                mayMarkAway={mayMarkAway}
              />
              <LeaverToggle person={person} exposure={leaverExposure[person.id] ?? []} />
            </>
          );
        }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------------- Roles

function RolesPanel(data: UsersData) {
  return (
    <div className="flex flex-col gap-5">
      <RosterFaults {...data} />
      <RolesList {...data} />
      <AssignmentsList {...data} />
    </div>
  );
}

/// What stops a role resolving to a signatory. Listed, not repaired.
function RosterFaults({ faults, offices }: UsersData) {
  if (faults.length === 0) return null;
  const name = (code: string) => offices.find((o) => o.code === code)?.nameEn ?? "An unknown role";
  const blocking = faults.some(
    (f) => f.kind === "INACTIVE_HOLDER" || f.kind === "OVERLAP" || (f.kind === "VACANT" && f.routedTo),
  );
  return (
    <Callout
      tone={blocking ? "err" : "warn"}
      title={blocking ? "Some roles cannot resolve to a signatory" : "Some roles are not held"}
    >
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {faults.map((f, i) => (
          <li key={i}>
            {f.kind === "VACANT"
              ? `${name(f.roleCode)} is not held${f.routedTo ? " — and an approval rule routes to it" : ""}.`
              : f.kind === "INACTIVE_HOLDER"
                ? `${name(f.roleCode)} is held by ${f.personName}, who has left. End the assignment below and assign someone else.`
                : f.kind === "OVERLAP"
                  ? `${name(f.roleCode)} is held by both ${f.personNames[0]} and ${f.personNames[1]} at the same time${f.scope ? ` (${f.scope})` : ""}.`
                  : `${f.personName} holds a role that is no longer configured.`}
          </li>
        ))}
      </ul>
    </Callout>
  );
}

function AssignmentsList({ assignments, people, offices }: UsersData) {
  const on = new Date();
  const rows: Row[] = assignments.map((a) => {
    const person = people.find((p) => p.id === a.personId);
    const office = offices.find((o) => o.code === a.roleCode);
    const upcoming = a.effectiveFrom > on;
    return {
      id: a.id,
      search: [person?.name, office?.nameEn, a.scope].filter(Boolean).join(" "),
      cells: {
        person: person
          ? { kind: "person", name: person.name }
          : { kind: "text", text: "Somebody no longer on record", dim: true },
        role: { kind: "stack", title: office?.nameEn ?? "Role no longer configured", sub: a.scope ?? undefined },
        period: {
          kind: "text",
          text: periodText(a),
        },
        status:
          person && !person.isActive
            ? { kind: "badge", text: "Holder has left", tone: "err" }
            : upcoming
              ? { kind: "badge", text: "Scheduled", tone: "info" }
              : { kind: "badge", text: "In force", tone: "ok" },
      },
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<CalendarIcon size={17} />}
        title="Assignments"
        subtitle="Ending one keeps it on record"
        divided={false}
        actions={<AddAssignment people={people} offices={offices} />}
      />
      <DataList
        flat
        selectable={false}
        exportName="assignments"
        searchPlaceholder="Search assignments"
        emptyTitle="Nobody holds a role"
        emptyBody="A rule routes to a role; only an assignment turns it into somebody who can sign."
        columns={[
          { key: "person", label: "Person", width: "26%", sortable: true, mobile: "primary" },
          { key: "role", label: "Role", width: "28%", sortable: true, mobile: "meta" },
          { key: "period", label: "Period", width: "22%", mobile: "meta" },
          { key: "status", label: "Status", width: "14%", mobile: "meta" },
        ]}
        rows={rows}
        actions={(id) => {
          const a = assignments.find((x) => x.id === id);
          if (!a) return null;
          const label = `${people.find((p) => p.id === a.personId)?.name ?? "this"}'s assignment`;
          return (
            <>
              <EditAssignment assignment={a} people={people} offices={offices} />
              <EndAssignment id={a.id} label={label} />
            </>
          );
        }}
      />
    </Card>
  );
}

function RolesList({ offices, people, holdings, grants }: UsersData) {
  const rows: Row[] = offices.map((o) => {
    const holders = holdings
      .filter((h) => h.roleCode === o.code)
      .map((h) => people.find((p) => p.id === h.personId)?.name)
      .filter((n): n is string => Boolean(n));

    return {
      id: o.id,
      search: [o.nameEn, o.code, o.workspace, o.authorityLevel].filter(Boolean).join(" "),
      sortKeys: { capabilities: grants.filter((g) => g.roleCode === o.code).length },
      cells: {
        role: { kind: "stack", title: o.nameEn },
        workspace: o.workspace
          ? { kind: "badge", text: o.workspace }
          : { kind: "text", text: "Not set", dim: true },
        authorityLevel: {
          kind: "text",
          text: o.authorityLevel || "Not set",
          dim: !o.authorityLevel,
        },
        heldBy: { kind: "avatars", names: holders },
        capabilities: {
          kind: "text",
          text: String(grants.filter((g) => g.roleCode === o.code).length),
        },
      },
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ShieldIcon size={17} />}
        title="Roles"
        subtitle="Role names and authority"
        actions={<AddOffice offices={offices} />}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        exportName="roles"
        searchPlaceholder="Search roles"
        emptyTitle="No role configured"
        emptyBody="An approval rule routes to a role, so nothing routes until one exists."
        columns={[
          { key: "role", label: "Role", width: "28%", sortable: true, mobile: "primary" },
          { key: "workspace", label: "Workspace", width: "14%", mobile: "meta" },
          { key: "authorityLevel", label: "Authority level", width: "22%", sortable: true, mobile: "meta" },
          { key: "heldBy", label: "Held by", width: "20%", mobile: "meta" },
          { key: "capabilities", label: "Capabilities", width: "16%", numeric: true, sortable: true, mobile: "meta" },
        ]}
        rows={rows}
        actions={(id) => {
          const office = offices.find((o) => o.id === id);
          return office ? <EditOffice office={office} offices={offices} /> : null;
        }}
      />
    </Card>
  );
}

// ------------------------------------------------------------------- Permissions

function PermissionsPanel({ offices, capabilities, grants, product }: UsersData) {
  const decided = decidedRoles(grants);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  // Phase 5b: a click on a cell is a proposal. The grid shows what is in force, so the click is dropped once it is accepted, and the screen says what happens next.
  const [proposed, setProposed] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Searching narrows the capabilities, not the roles. A group with nothing left in
  // it goes too, rather than sitting there as an empty heading.
  const needle = query.trim().toLowerCase();
  const groups = byGroup(capabilities)
    .map((g) => ({
      ...g,
      capabilities: needle
        ? g.capabilities.filter((c) => c.nameEn.toLowerCase().includes(needle))
        : g.capabilities,
    }))
    .filter((g) => g.capabilities.length > 0);
  // The product's permissions are searched by their words too, and a group with none left goes as the others do.
  const productKeys = product.keys.filter((k) => !needle || k.label.toLowerCase().includes(needle) || k.lets.toLowerCase().includes(needle));

  // A column per role that a person can actually hold in the portal. Committees are
  // left out: nobody signs in as one, so a capability granted to it means nothing.
  // The grid scrolls sideways with the capability column pinned, so a new role adds
  // a column rather than breaking the layout.
  const columns = offices.filter((o) => !o.isCommittee);

  // A click has to land before the round trip, so a cell in flight is held here and
  // read in preference to what the server last said. Once the reloaded grants agree
  // with the override it is dropped, which happens during render — no effect, and
  // nothing to get out of step.
  const key = (roleCode: string, capabilityId: string) => `${roleCode}|${capabilityId}`;
  const saved = new Set(grants.map((g) => key(g.roleCode, g.capabilityId)));
  const [inFlight, setInFlight] = useState<Map<string, boolean>>(new Map());
  const live = new Map([...inFlight].filter(([k, on]) => saved.has(k) !== on));

  const toggle = (roleCode: string, capabilityId: string, on: boolean) => {
    const k = key(roleCode, capabilityId);
    setProblem(null);
    setProposed(null);
    setInFlight((m) => new Map(m).set(k, on));
    startTransition(async () => {
      const result = await setGrant(roleCode, capabilityId, on);
      if (result.ok && !result.notice) return;
      if (result.ok) setProposed(result.notice ?? null);
      else setProblem(result.message ?? "That change was not saved.");
      setInFlight((m) => {
        const next = new Map(m);
        next.delete(k);
        return next;
      });
    });
  };

  const anyUndecided = columns.some((o) =>
    capabilities.some(
      (c) =>
        !(live.get(key(o.code, c.id)) ?? saved.has(key(o.code, c.id))) &&
        capabilityState(grants, o.code, c.id, decided) === "UNDECIDED",
    ),
  );

  // With no capability set the grid still holds the product's own permissions, which are not the customer's to define.
  const noCapabilities = capabilities.length === 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<GridIcon size={17} />}
        title="Permissions"
        subtitle="Approval routing is separate"
        actions={
          <div className="w-60">
            <Input
              size="sm"
              type="search"
              icon={<SearchIcon size={14} />}
              placeholder="Search capabilities"
              aria-label="Search capabilities"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        }
      />
      {proposed && (
        <Callout tone="ok" className="mx-5 mt-4 sm:mx-6">
          {proposed}
        </Callout>
      )}
      {problem && (
        <Callout tone="err" className="mx-5 mt-4 sm:mx-6">
          {problem}
        </Callout>
      )}
      {noCapabilities && (
        <Callout tone="warn" title="No capability set. Nothing to tick." className="mx-5 mt-4 sm:mx-6" />
      )}
      {/* The grid scrolls sideways under a pinned capability column, so a new role adds
          a column rather than squeezing the others. On a phone it is a list instead:
          each capability, then one line per role with its tick. */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13.5px] max-md:block [&_tbody]:max-md:block [&_tr]:max-md:block">
          <thead className="max-md:hidden">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 min-w-64 border-y border-r border-line bg-sunken py-2.5 pr-4 pl-5 text-left align-bottom text-[12px] font-semibold text-ink-3 sm:pl-6"
              >
                Capability
              </th>
              {columns.map((o) => (
                <th
                  key={o.code}
                  scope="col"
                  title={o.nameEn}
                  className="w-28 min-w-28 border-y border-line bg-sunken px-2 py-2.5 text-center align-bottom text-[12px] leading-snug font-semibold text-ink-2 last:pr-5 sm:last:pr-6"
                >
                  {/* Wrapped over at most three lines, at a fixed column width, so a long
                      role name cannot push the columns out of alignment. */}
                  <span className="line-clamp-3 break-words">{o.nameEn}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows key={group.label} label={group.label} span={columns.length}>
                {group.capabilities.map((capability) => (
                  <tr key={capability.id} className="group">
                    <th
                      scope="row"
                      title={capability.nameEn}
                      className="sticky left-0 z-10 border-r border-b border-line/70 bg-surface py-2.5 pr-4 pl-5 text-left font-medium text-ink transition group-hover:bg-brand-50 max-md:static max-md:block max-md:border-r-0 max-md:pb-1 max-md:break-words sm:pl-6"
                    >
                      {capability.nameEn}
                    </th>
                    {columns.map((o) => {
                      const k = key(o.code, capability.id);
                      const on = live.get(k) ?? saved.has(k);
                      const state = capabilityState(grants, o.code, capability.id, decided);
                      // Never decided is not the same as refused. The cell says so
                      // rather than rendering an empty box that looks deliberate.
                      const undecided = !on && state === "UNDECIDED";
                      return (
                        <td
                          key={o.code}
                          className="border-b border-line/70 px-2 py-2.5 text-center transition group-hover:bg-brand-50/40 max-md:flex max-md:items-center max-md:justify-between max-md:gap-3 max-md:border-b-0 max-md:py-1.5 max-md:pr-5 max-md:pl-5 max-md:text-left"
                        >
                          <span className="min-w-0 text-[13px] text-ink-2 md:hidden">{o.nameEn}</span>
                          <span
                            className={cx(
                              "inline-grid place-items-center rounded-md p-0.5",
                              undecided && "outline-1 outline-offset-1 outline-ink-4 outline-dashed",
                            )}
                            title={
                              undecided
                                ? "Nobody has decided about this role yet"
                                : on
                                  ? "Granted"
                                  : "Not granted"
                            }
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={pending}
                              aria-label={`${capability.nameEn} — ${o.nameEn}`}
                              aria-describedby={undecided ? "permissions-undecided" : undefined}
                              onChange={() => toggle(o.code, capability.id, !on)}
                              className={cx(
                                "size-4.5 cursor-pointer rounded-md accent-brand-600 disabled:cursor-wait",
                                undecided && "opacity-60",
                              )}
                            />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </GroupRows>
            ))}
            {productKeys.length > 0 && (
              <GroupRows label="Product permissions" span={columns.length}>
                {productKeys.map((permission) => (
                  <ProductPermissionRow key={permission.key} permission={permission} columns={columns} product={product} />
                ))}
              </GroupRows>
            )}
          </tbody>
        </table>
      </div>
      {anyUndecided && (
        <span id="permissions-undecided" className="sr-only">
          Nobody has decided about this role yet
        </span>
      )}
    </Card>
  );
}

/// A group heading spanning the grid, then the capabilities in it. The heading is a
/// pinned row header with tinted filler cells, so it stays put when the grid scrolls.
function GroupRows({
  label,
  span,
  children,
}: {
  label: string;
  span: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <th
          scope="row"
          className="sticky left-0 z-10 border-r border-b border-line/70 bg-sunken pt-4 pr-4 pb-2 pl-5 text-left max-md:static max-md:block max-md:border-r-0 text-[11.5px] font-bold tracking-[0.04em] text-ink-3 uppercase sm:pl-6"
        >
          {label}
        </th>
        {Array.from({ length: span }, (_, i) => (
          <td key={i} className="border-b border-line/70 bg-sunken max-md:hidden" />
        ))}
      </tr>
      {children}
    </>
  );
}

// -------------------------------------------------------------------- Delegation

function DelegationPanel({ people, offices, delegations, capabilities, upload, lines }: UsersData) {
  const on = new Date();
  // FR-APR-011: what the rule checks is said, and what it does not: with no line recorded the subordinate rule is not applied and the screen says so.
  const notes = delegationNotes({ reportingLines: lines.map((l) => ({ ...l, superiorPersonId: l.superiorPersonId })) });
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on record";
  const officeName = (code: string) => offices.find((o) => o.code === code)?.nameEn ?? code;

  const rows: Row[] = delegations.map((d) => {
    const status = statusOf(d, on);
    const recommendation = recommendationLabel(d);
    return {
      id: d.id,
      views: [status.toLowerCase().replace("_", "")],
      note: d.jobholderPersonId ? undefined : BEFORE_SUPERIOR_RULE,
      search: [nameOf(d.fromPersonId), d.jobholderPersonId ? nameOf(d.jobholderPersonId) : "", nameOf(d.toPersonId), officeName(d.roleCode), d.reason].join(
        " ",
      ),
      cells: {
        // The grantor, and under it whose authority it is: the jobholder, or on a delegation recorded before the superior rule the words that say so (log line 1773).
        from: { kind: "person", name: nameOf(d.fromPersonId), sub: d.jobholderPersonId ? `${officeName(d.roleCode)} · authority of ${nameOf(d.jobholderPersonId)}` : `${officeName(d.roleCode)} · ${BEFORE_SUPERIOR_RULE_SHORT}` },
        to: { kind: "person", name: nameOf(d.toPersonId) },
        what:
          d.capabilityCodes.length === 0
            ? { kind: "badge", text: "The whole role", tone: "warn" }
            : {
                kind: "badges",
                items: d.capabilityCodes.map(
                  (code) => capabilities.find((c) => c.code === code)?.nameEn ?? "Unknown capability",
                ),
              },
        period: {
          kind: "stack",
          title: delegationPeriodText(d),
          sub: delegationCeilingText(d.valueCeiling),
        },
        reason: recommendation
          ? { kind: "stack", title: d.reason || "No reason recorded", sub: `On the absent holder's recommendation${d.holderRecommendedOn ? ` of ${formatDate(d.holderRecommendedOn)}` : ""} · ${recommendation}` }
          : { kind: "text", text: d.reason || "—", dim: !d.reason },
        status:
          status === "IN_FORCE"
            ? { kind: "chip", text: "In force", tone: "ok" }
            : status === "SCHEDULED"
              ? { kind: "chip", text: "Scheduled", tone: "info" }
              : { kind: "chip", text: "Ended" },
      },
    };
  });

  const away = people.filter((p) => p.isActive && !p.isAvailable);

  return (
    <div className="flex flex-col gap-5">
      {notes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {notes.map((n) => (
            <InfoChip key={n.code} tone="warn" detail={n.en}>{n.code === "REPORTING_LINES_NOT_SET" ? REPORTING_LINE_NOT_SET : "Not fully checked"}</InfoChip>
          ))}
        </div>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<SwapIcon size={17} />}
          title="Delegation"
          subtitle="One officer acting for another"
          actions={<AddDelegation people={people} offices={offices} capabilities={capabilities} upload={upload} />}
          divided={false}
        />
        <DataList stackBelow="xl"
          flat
          selectable={false}
          exportName="delegations"
          searchPlaceholder="Search delegations"
          emptyTitle="Nothing is delegated"
          emptyBody="Every role is exercised by whoever holds it."
          views={[
            { id: "inforce", label: "In force" },
            { id: "scheduled", label: "Scheduled" },
            { id: "ended", label: "Ended" },
          ]}
          columns={[
            // Pixels, with the reason left to take what remains: percentages beside a fixed
            // actions column added up to more than the card.
            { key: "from", label: "From", width: "132px", sortable: true, mobile: "primary" },
            { key: "to", label: "To", width: "132px", sortable: true, mobile: "meta" },
            { key: "what", label: "What is delegated", width: "148px", mobile: "meta" },
            { key: "period", label: "Period", width: "152px", mobile: "meta" },
            { key: "reason", label: "Reason", mobile: "meta" },
            { key: "status", label: "Status", width: "112px", mobile: "meta" },
          ]}
          actionsWidth={96}
          rows={rows}
          rowOpens
          actions={(id) => {
            const delegation = delegations.find((d) => d.id === id);
            if (!delegation) return null;
            return (
              <>
                <EditDelegation
                  delegation={delegation}
                  people={people}
                  offices={offices}
                  capabilities={capabilities}
                  status={STATUS_LABEL[statusOf(delegation, on)]}
                  upload={upload}
                />
                <OwnerDocumentsButton owner={{ kind: "delegation", id }} label={`${nameOf(delegation.fromPersonId)} to ${nameOf(delegation.toPersonId)}`} iconOnly />
              </>
            );
          }}
        />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClockIcon size={17} />}
          title="Out of office"
          subtitle="Work routes to the cover"
          divided={away.length > 0}
        />
        {away.length === 0 ? (
          <EmptyState size="sm" title="Everyone is in" />
        ) : (
          <ul className="divide-y divide-line/70 px-5 pb-2 sm:px-6">
            {away.map((p) => {
              const cover = delegations.find(
                (d) => holderOf(d) === p.id && statusOf(d, on) === "IN_FORCE",
              );
              return (
                <li key={p.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Avatar name={p.name} size="sm" />
                  <span className="min-w-0 flex-1 basis-32 text-[13.5px] font-semibold break-words text-ink">
                    {p.name}
                  </span>
                  {cover ? (
                    <span className="text-[13px] text-ink-3">
                      covered by {nameOf(cover.toPersonId)}
                    </span>
                  ) : (
                    // Away with nobody covering is the case worth surfacing: the work
                    // stops and nobody is expecting it to.
                    <Badge tone="warn" dot>
                      nobody covering
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------- Reporting lines

function ReportingLinesPanel({ people, lines, stuck }: UsersData) {
  const on = new Date();
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? "Not on record") : "Nobody (head of the line)");
  const state = (l: ReportingLineRow) => (l.effectiveFrom > on ? "scheduled" : l.effectiveTo && l.effectiveTo <= on ? "ended" : "inforce");

  const rows: Row[] = lines.map((l) => ({
    id: l.id,
    views: [state(l)],
    search: [nameOf(l.personId), nameOf(l.superiorPersonId), l.note].join(" "),
    cells: {
      person: { kind: "person", name: nameOf(l.personId) },
      superior: l.superiorPersonId ? { kind: "person", name: nameOf(l.superiorPersonId) } : { kind: "text", text: "Nobody: head of the line", dim: true },
      period: { kind: "text", text: periodText(l) },
      source: { kind: "chip", text: l.provenance === "STATED" ? "Stated" : l.provenance === "OBSERVED" ? "Observed" : "Assumed", tone: l.provenance === "STATED" ? "ok" : l.provenance === "OBSERVED" ? "info" : "warn" },
      status: state(l) === "inforce" ? { kind: "chip", text: "In force", tone: "ok" } : state(l) === "scheduled" ? { kind: "chip", text: "Scheduled", tone: "info" } : { kind: "chip", text: "Ended" },
    },
  }));
  const withoutLine = people.filter((p) => p.isActive && !lines.some((l) => l.personId === p.id && l.effectiveFrom <= on && (!l.effectiveTo || l.effectiveTo > on)));

  return (
    <div className="flex flex-col gap-5">
      {lines.length === 0 && (
        <Callout tone="warn" title={REPORTING_LINE_NOT_SET}>
          Delegations are not checked to a subordinate. Absent steps do not move.
        </Callout>
      )}
      {stuck.length > 0 && (
        <Callout tone="warn" title={`${stuck.length} ${stuck.length === 1 ? "step is" : "steps are"} waiting on an office whose holders are away`}>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {stuck.map((s) => (
              <li key={s.stepId}>
                {s.matter}, waiting on {s.office}. {s.why}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UserIcon size={17} />}
          title="Reporting lines"
          subtitle="Not derived from unit heads"
          actions={<AddReportingLine people={people} />}
          divided={false}
        />
        <DataList
          stackBelow="xl"
          flat
          selectable={false}
          exportName="reporting-lines"
          searchPlaceholder="Search reporting lines"
          emptyTitle="Reporting line not set"
          emptyBody="No reporting line is recorded for anyone."
          views={[
            { id: "inforce", label: "In force" },
            { id: "scheduled", label: "Scheduled" },
            { id: "ended", label: "Ended" },
          ]}
          columns={[
            { key: "person", label: "Person", width: "180px", sortable: true, mobile: "primary" },
            { key: "superior", label: "Reports to", width: "180px", sortable: true, mobile: "meta" },
            { key: "period", label: "Period", mobile: "meta" },
            { key: "source", label: "Source", width: "112px", mobile: "meta" },
            { key: "status", label: "Status", width: "112px", mobile: "meta" },
          ]}
          actionsWidth={64}
          rows={rows}
          rowOpens
          actions={(id) => {
            const line = lines.find((l) => l.id === id);
            return line ? <EditReportingLine line={line} people={people} /> : null;
          }}
        />
      </Card>
      {lines.length > 0 && withoutLine.length > 0 && (
        <Callout tone="warn" title={`${withoutLine.length} ${withoutLine.length === 1 ? "person has" : "people have"} no reporting line`}>
          {withoutLine.map((p) => p.name).join(", ")}. No delegation to them.
        </Callout>
      )}
    </div>
  );
}
