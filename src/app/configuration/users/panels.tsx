"use client";

import { DataList, type Row } from "@/components/data-list";
import { Tabs } from "@/components/tabs";
import { byGroup, capabilityState, decidedRoles, type Capability, type Grant } from "@/lib/people/capabilities";
import { statusOf, type Delegation } from "@/lib/people/delegation";
import type { Office, Person } from "@/lib/people/types";

import { AddAssignment, AddOffice, AddPerson, EditOffice, EditPerson } from "./editors";

/**
 * The four tabs of Users & roles, in the prototype's own order and shape.
 *
 * Client-side because the tab strip holds the selection and each list carries its own
 * search and filters. The data is loaded on the server and handed down whole; nothing
 * here queries.
 */

const day = (d: Date) => d.toISOString().slice(0, 10);

export interface UsersData {
  people: Person[];
  offices: Office[];
  holdings: { personId: string; roleCode: string }[];
  capabilities: Capability[];
  grants: Grant[];
  delegations: Delegation[];
}

export function UsersTabs(data: UsersData) {
  return (
    <Tabs
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

function PeoplePanel({ people, offices }: UsersData) {
  const officeName = (code: string | null) =>
    code ? (offices.find((o) => o.code === code)?.nameEn ?? code) : "";

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
        <div className="card__titles">
          <div className="h3 trunc">User register</div>
          <div className="card__sub trunc">Everyone on record, and how to reach them.</div>
        </div>
        <div className="row">
          <AddPerson />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          exportName="people"
          searchPlaceholder="Search people"
          emptyTitle="Nobody on record"
          emptyBody="Add an officer before assigning an office."
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
          actions={(id) => {
            const person = people.find((p) => p.id === id);
            return person ? <EditPerson person={person} /> : null;
          }}
        />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------- Roles

function RolesPanel({ offices, people, holdings, grants }: UsersData) {
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
        role: { kind: "stack", title: o.nameEn, sub: o.code, monoSub: true },
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
  const groups = byGroup(capabilities);
  const decided = decidedRoles(grants);

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
        <div className="card__titles">
          <div className="h3 trunc">Permissions</div>
          <div className="card__sub trunc">
            Tick what each role may do. Approval routing is separate and comes from the
            approval matrix.
          </div>
        </div>
      </div>
      <div className="card__body card__body--flush">
        <div className="tablewrap">
          <table className="table cfg-grid">
            <thead>
              <tr>
                <th>Capability</th>
                {offices.map((o) => (
                  <th key={o.code}>{o.nameEn}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.label} label={group.label} span={offices.length + 1}>
                  {group.capabilities.map((capability) => (
                    <tr key={capability.id}>
                      <td>{capability.nameEn}</td>
                      {offices.map((o) => {
                        const state = capabilityState(grants, o.code, capability.id, decided);
                        return (
                          <td key={o.code} className="cfg-cell">
                            {state === "GRANTED" ? (
                              <span className="chip chip--ok">Yes</span>
                            ) : state === "WITHHELD" ? (
                              <span className="dim">—</span>
                            ) : (
                              // Nobody has decided about this role. Rendering it as a
                              // refusal would claim a decision that was never taken.
                              <span className="xs dim">not set</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Fragment({
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
        <td colSpan={span} className="lbl">
          {label}
        </td>
      </tr>
      {children}
    </>
  );
}

// -------------------------------------------------------------------- Delegation

function DelegationPanel({ people, offices, delegations }: UsersData) {
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
            ? { kind: "badge", text: "The whole office", tone: "warn" }
            : { kind: "badges", items: d.capabilityCodes },
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
          <div className="card__titles">
            <div className="h3 trunc">Delegation</div>
            <div className="card__sub trunc">
              One officer acting for another, for a period. Not the same as authority
              passing upward when a holder cannot act.
            </div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          <DataList
            flat
            selectable={false}
            exportName="delegations"
            searchPlaceholder="Search delegations"
            emptyTitle="Nothing is delegated"
            emptyBody="Every office is exercised by whoever holds it."
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

export { AddAssignment };
