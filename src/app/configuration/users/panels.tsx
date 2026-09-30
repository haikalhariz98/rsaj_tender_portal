"use client";

import { useState, useTransition } from "react";

import {
  AlertTriangle,
  CheckIcon,
  GridIcon,
  SearchIcon,
  ShieldIcon,
  SwapIcon,
  UserIcon,
} from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { Tabs } from "@/components/tabs";
import {
  byGroup,
  capabilitiesForRoles,
  capabilityState,
  decidedRoles,
  type Capability,
  type Grant,
} from "@/lib/people/capabilities";
import { statusOf, type Delegation } from "@/lib/people/delegation";
import type { Assignment, Office, Person, RosterFault } from "@/lib/people/types";

import { setGrant } from "./actions";
import {
  AddAssignment,
  EditAssignment,
  EndAssignment,
  AddDelegation,
  AddOffice,
  AddPerson,
  EditDelegation,
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

const day = (d: Date) => d.toISOString().slice(0, 10);

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
      ]}
    />
  );
}

// ------------------------------------------------------------------------ People

function PeoplePanel({ people, offices, holdings, capabilities, grants, delegations }: UsersData) {
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
    <section className="card">
      <div className="card__head">
        <UserIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">User register</div>
          <div className="card__sub trunc">Everyone on record, and how to reach them.</div>
        </div>
        <div className="row">
          <AddPerson offices={offices} authorityLevels={authorityLevels} />
        </div>
      </div>
      <div className="card__body card__body--flush">
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
            { key: "name", label: "Name", width: "26%", sortable: true },
            { key: "jobTitle", label: "Job title", width: "20%", sortable: true },
            { key: "department", label: "Department", width: "18%", sortable: true },
            { key: "portalRole", label: "Portal role", width: "16%" },
            { key: "availability", label: "Availability", width: "12%" },
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
                />
                <LeaverToggle person={person} />
              </>
            );
          }}
        />
      </div>
    </section>
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
          text: `${day(a.effectiveFrom)} — ${a.effectiveTo ? day(a.effectiveTo) : "open"}`,
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
        title="Assignments"
        subtitle="Who holds each role, and for how long. Ending one keeps it on record."
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
          { key: "person", label: "Person", width: "26%", sortable: true },
          { key: "role", label: "Role", width: "28%", sortable: true },
          { key: "period", label: "Period", width: "22%" },
          { key: "status", label: "Status", width: "14%" },
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
      search: [o.nameEn, o.nameMs, o.code, o.workspace, o.authorityLevel].filter(Boolean).join(" "),
      sortKeys: { capabilities: grants.filter((g) => g.roleCode === o.code).length },
      cells: {
        role: { kind: "stack", title: o.nameEn, sub: o.nameMs ?? undefined },
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
    <section className="card">
      <div className="card__head">
        <ShieldIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Roles</div>
          <div className="card__sub trunc">
            What a role is called in the portal, and the authority it carries.
          </div>
        </div>
        <div className="row">
          <AddOffice offices={offices} />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          exportName="roles"
          searchPlaceholder="Search roles"
          emptyTitle="No role configured"
          emptyBody="An approval rule routes to a role, so nothing routes until one exists."
          columns={[
            { key: "role", label: "Role", width: "28%", sortable: true },
            { key: "workspace", label: "Workspace", width: "14%" },
            { key: "authorityLevel", label: "Authority level", width: "22%", sortable: true },
            { key: "heldBy", label: "Held by", width: "20%" },
            { key: "capabilities", label: "Capabilities", width: "16%", numeric: true, sortable: true },
          ]}
          rows={rows}
          actions={(id) => {
            const office = offices.find((o) => o.id === id);
            return office ? <EditOffice office={office} offices={offices} /> : null;
          }}
        />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- Permissions

function PermissionsPanel({ offices, capabilities, grants }: UsersData) {
  const decided = decidedRoles(grants);
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
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
    setInFlight((m) => new Map(m).set(k, on));
    startTransition(async () => {
      const result = await setGrant(roleCode, capabilityId, on);
      if (result.ok) return;
      setProblem(result.message ?? "That change was not saved.");
      setInFlight((m) => {
        const next = new Map(m);
        next.delete(k);
        return next;
      });
    });
  };

  if (capabilities.length === 0) {
    return (
      <section className="card">
        <div className="card__head">
          <div className="card__titles">
            <div className="h3 trunc">Permissions</div>
          </div>
        </div>
        <div className="card__body">
          <div className="empty">
            <div className="empty__t">No capability has been set</div>
            <p className="empty__d">
              A capability is something a role may do. Until some exist there is nothing to
              grant, and the grid has no rows.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card__head">
        <GridIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Permissions</div>
          <div className="card__sub trunc">
            Tick what each role may do. Approval routing is separate and comes from the
            approval matrix.
          </div>
        </div>
        <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
          <div style={{ width: 240 }}>
            <div className="searchinput">
              <SearchIcon size={14} className="icon searchinput__ico" />
              <input
                className="input input--sm"
                type="search"
                placeholder="Search capabilities"
                aria-label="Search capabilities"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="card__body">
        {problem && (
          <div className="callout callout--err" style={{ marginBottom: 10 }}>
            <span className="callout__ico">
              <AlertTriangle size={17} />
            </span>
            <div className="grow">
              <span className="sm">{problem}</span>
            </div>
          </div>
        )}
        <div className="cfg-gridwrap">
          <table className="cfg-grid">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                {columns.map((o) => (
                  <th key={o.code} scope="col" style={{ minWidth: 74 }}>
                    {/* Truncated rather than wrapped. A role name left to wrap is what
                        pushed the columns out of alignment. */}
                    <span className="trunc" style={{ display: "block" }} title={o.nameEn}>
                      {o.nameEn}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRows key={group.label} label={group.label} span={columns.length}>
                  {group.capabilities.map((capability) => (
                    <tr key={capability.id}>
                      <th scope="row">{capability.nameEn}</th>
                      {columns.map((o) => {
                        const k = key(o.code, capability.id);
                        const on = live.get(k) ?? saved.has(k);
                        const state = capabilityState(grants, o.code, capability.id, decided);
                        // Never decided is not the same as refused. The cell says so
                        // rather than rendering an empty box that looks deliberate.
                        const undecided = !on && state === "UNDECIDED";
                        return (
                          <td key={o.code}>
                            <button
                              type="button"
                              className="cfg-cell"
                              data-on={on ? "true" : "false"}
                              aria-pressed={on}
                              disabled={pending}
                              title={
                                undecided
                                  ? "Nobody has decided about this role yet"
                                  : on
                                    ? "Granted"
                                    : "Not granted"
                              }
                              aria-label={`${capability.nameEn} — ${o.nameEn}`}
                              onClick={() => toggle(o.code, capability.id, !on)}
                            >
                              {on ? (
                                <CheckIcon size={13} strokeWidth={3} />
                              ) : undecided ? (
                                <span className="faint" aria-hidden="true">
                                  ·
                                </span>
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </GroupRows>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/// A group heading spanning the grid, then the capabilities in it. The heading is a
/// row header with tinted filler cells, which is how the sample keeps it aligned.
function GroupRows({
  label,
  span,
  children,
}: {
  label: string;
  span: number;
  children: React.ReactNode;
}) {
  const tint = { background: "var(--n-050)" };
  return (
    <>
      <tr>
        <th
          scope="row"
          style={{
            ...tint,
            fontWeight: 650,
            fontSize: "11.5px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: "var(--ink-3)",
          }}
        >
          {label}
        </th>
        {Array.from({ length: span }, (_, i) => (
          <td key={i} style={tint} />
        ))}
      </tr>
      {children}
    </>
  );
}

// -------------------------------------------------------------------- Delegation

function DelegationPanel({ people, offices, delegations, capabilities }: UsersData) {
  const on = new Date();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Not on record";
  const officeName = (code: string) => offices.find((o) => o.code === code)?.nameEn ?? code;

  const rows: Row[] = delegations.map((d) => {
    const status = statusOf(d, on);
    return {
      id: d.id,
      views: [status.toLowerCase().replace("_", "")],
      search: [nameOf(d.fromPersonId), nameOf(d.toPersonId), officeName(d.roleCode), d.reason].join(
        " ",
      ),
      cells: {
        from: { kind: "person", name: nameOf(d.fromPersonId), sub: officeName(d.roleCode) },
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
          title: `${day(d.effectiveFrom)} — ${d.effectiveTo ? day(d.effectiveTo) : "open"}`,
          sub: d.valueCeiling ? `up to RM${d.valueCeiling}` : "no ceiling set",
        },
        reason: { kind: "text", text: d.reason || "—", dim: !d.reason },
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
    <div className="stack stack--lg">
      <section className="card">
        <div className="card__head">
          <SwapIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">Delegation</div>
            <div className="card__sub trunc">
              One officer acting for another, for a period. Not the same as authority
              passing upward when a holder cannot act.
            </div>
          </div>
          <div className="row">
            <AddDelegation people={people} offices={offices} capabilities={capabilities} />
          </div>
        </div>
        <div className="card__body card__body--flush">
          <DataList
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
              { key: "from", label: "From", width: "20%", sortable: true },
              { key: "to", label: "To", width: "16%", sortable: true },
              { key: "what", label: "What is delegated", width: "20%" },
              { key: "period", label: "Period", width: "18%" },
              { key: "reason", label: "Reason", width: "14%" },
              { key: "status", label: "Status", width: "12%" },
            ]}
            rows={rows}
            rowOpens
            actions={(id) => {
              const delegation = delegations.find((d) => d.id === id);
              if (!delegation) return null;
              return (
                <EditDelegation
                  delegation={delegation}
                  people={people}
                  offices={offices}
                  capabilities={capabilities}
                  status={STATUS_LABEL[statusOf(delegation, on)]}
                />
              );
            }}
          />
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <div className="card__titles">
            <div className="h3 trunc">Out of office</div>
            <div className="card__sub trunc">
              While someone is away their work is routed to the person covering.
            </div>
          </div>
        </div>
        <div className="card__body">
          {away.length === 0 ? (
            <div className="empty empty--sm">
              <div className="empty__t">Everyone is in</div>
              <p className="empty__d">Nobody is marked as away.</p>
            </div>
          ) : (
            <div className="stack stack--sm">
              {away.map((p) => {
                const cover = delegations.find(
                  (d) => d.fromPersonId === p.id && statusOf(d, on) === "IN_FORCE",
                );
                return (
                  <div key={p.id} className="row" style={{ gap: 10 }}>
                    <span className="sm strong grow">{p.name}</span>
                    {cover ? (
                      <span className="sm dim">covered by {nameOf(cover.toPersonId)}</span>
                    ) : (
                      // Away with nobody covering is the case worth surfacing: the work
                      // stops and nobody is expecting it to.
                      <span className="badge badge--warn">nobody covering</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
