"use client";

import { useState } from "react";

import { DataList, type Row } from "@/components/data-list";
import { BuildingIcon, ChevronDown, ChevronRight, SearchIcon } from "@/components/icons";
import { activeOn } from "@/lib/effective";
import type { CostCentre, OrgUnit, OrgUnitKind, Site, UnitNode } from "@/lib/organisation/types";

import { AddCostCentre, AddOrgUnit, AddSite, EditCostCentre, EditSite, UnitForm } from "./editors";

/**
 * Organisation, in the prototype's shape: the structure on the left, whichever unit
 * is selected beside it, and the cost centres and sites underneath.
 *
 * The three lists this replaced — units, account codes, code formats — were a
 * different decomposition of the same configuration. Account codes belong to Budget,
 * where the sample keeps them.
 */

const KIND_LABEL: Record<OrgUnitKind, string> = {
  COMPANY: "Company",
  DIVISION: "Division",
  DEPARTMENT: "Department",
  SECTION: "Section",
};

export interface OrganisationPanelData {
  roots: UnitNode[];
  detached: UnitNode[];
  units: OrgUnit[];
  costCentres: CostCentre[];
  sites: Site[];
  people: { id: string; name: string; isActive: boolean }[];
  /// The unit whose detail is shown. Read from the address so a node can be linked
  /// to, survives a refresh, and can be compared against the sample one kind at a
  /// time — the detail form is not the same form for a company and a department.
  selected: string | null;
  on: Date;
}

export function OrganisationScreen(data: OrganisationPanelData) {
  const { roots, detached, units, people, selected } = data;
  const all = [...flattenNodes(roots), ...flattenNodes(detached)];
  const [chosen, setChosen] = useState<string | null>(selected);
  const current = all.find((n) => n.unit.code === chosen) ?? all[0] ?? null;

  const select = (code: string) => {
    setChosen(code);
    const url = new URL(window.location.href);
    url.searchParams.set("unit", code);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="stack stack--lg">
      <div className="row wrap" style={{ gap: 20, alignItems: "flex-start" }}>
        <StructureCard
          nodes={[...roots, ...detached]}
          selected={current?.unit.code ?? null}
          units={units}
          onSelect={select}
        />
        <div className="grow" style={{ minWidth: 380 }}>
          {current ? (
            <UnitCard node={current} onSelect={select} {...data} />
          ) : (
            <section className="card">
              <div className="card__body">
                <div className="empty">
                  <div className="empty__t">No structure yet</div>
                  <p className="empty__d">
                    Add a company, and the divisions, departments and sections under it.
                  </p>
                  <AddOrgUnit units={units} people={people} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <CostCentresCard {...data} />
      <SitesCard {...data} />
    </div>
  );
}

function flattenNodes(nodes: readonly UnitNode[]): UnitNode[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children)]);
}

// --------------------------------------------------------------------- structure

function StructureCard({
  nodes,
  selected,
  units,
  onSelect,
}: {
  nodes: UnitNode[];
  selected: string | null;
  units: OrgUnit[];
  onSelect: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const needle = query.trim().toLowerCase();
  // Searching flattens the tree rather than filtering it in place: a match three
  // levels down whose parents do not match would otherwise be invisible.
  const visible = needle
    ? flattenNodes(nodes).filter(
        (n) =>
          n.unit.nameEn.toLowerCase().includes(needle) ||
          n.unit.code.toLowerCase().includes(needle),
      )
    : shown(nodes, collapsed);

  const anyOpen = flattenNodes(nodes).some(
    (n) => n.children.length > 0 && !collapsed.has(n.unit.code),
  );

  return (
    <section className="card" style={{ flex: "0 0 340px", minWidth: 300 }}>
      <div className="card__head">
        <BuildingIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Structure</div>
        </div>
        <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() =>
              setCollapsed(
                anyOpen
                  ? new Set(flattenNodes(nodes).filter((n) => n.children.length).map((n) => n.unit.code))
                  : new Set(),
              )
            }
          >
            <ChevronDown size={13} />
            {anyOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>
      <div className="card__body card__body--tight">
        <div style={{ padding: "0 8px 8px" }}>
          <div className="searchinput">
            <SearchIcon size={14} className="icon searchinput__ico" />
            <input
              className="input input--sm"
              type="search"
              placeholder="Search the structure"
              aria-label="Search the structure"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {units.length === 0 ? (
          <div className="empty empty--sm">
            <div className="empty__t">Nothing configured</div>
          </div>
        ) : (
          <div className="cfg-tree" role="tree">
            {visible.map((node) => (
              <TreeNode
                key={node.unit.code}
                node={node}
                selected={selected}
                onSelect={onSelect}
                expanded={!collapsed.has(node.unit.code)}
                onToggle={() =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(node.unit.code)) next.delete(node.unit.code);
                    else next.add(node.unit.code);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/// The nodes a collapsed tree actually shows, depth-first.
function shown(nodes: readonly UnitNode[], collapsed: ReadonlySet<string>): UnitNode[] {
  return nodes.flatMap((n) =>
    collapsed.has(n.unit.code) ? [n] : [n, ...shown(n.children, collapsed)],
  );
}

function TreeNode({
  node,
  selected,
  expanded,
  onToggle,
  onSelect,
}: {
  node: UnitNode;
  selected: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (code: string) => void;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <button
      type="button"
      role="treeitem"
      className="cfg-tnode"
      data-depth={Math.min(node.depth, 3)}
      // The stylesheet keys the selected node off aria-current, as the sample does;
      // aria-selected is what a tree is actually meant to announce.
      aria-current={node.unit.code === selected ? true : undefined}
      aria-selected={node.unit.code === selected}
      aria-expanded={hasChildren ? expanded : undefined}
      onClick={() => onSelect(node.unit.code)}
    >
      <span
        className="cfg-tnode__c"
        onClick={(e) => {
          if (!hasChildren) return;
          // The chevron opens and closes; the rest of the node selects. Two acts on
          // one row, so the inner one has to stop before it reaches the outer.
          e.stopPropagation();
          onToggle();
        }}
      >
        {hasChildren && (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
      </span>
      <span className="trunc">
        {node.unit.code} · {node.unit.nameEn}
      </span>
      {hasChildren && <span className="cfg-tnode__n">{node.children.length}</span>}
    </button>
  );
}

// ------------------------------------------------------------------- unit detail

function UnitCard({
  node,
  units,
  costCentres,
  people,
  on,
  onSelect,
}: OrganisationPanelData & { node: UnitNode; onSelect: (code: string) => void }) {
  const unit = node.unit;
  const parent = units.find((u) => u.code === unit.parentCode) ?? null;
  const centre = costCentres.find((c) => c.code === unit.costCentreCode) ?? null;

  return (
    <section className="card">
      <div className="card__head">
        <BuildingIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">{unit.nameEn}</div>
          <div className="card__sub trunc">{KIND_LABEL[unit.kind]}</div>
        </div>
        <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
          <span className="badge badge--brand">
            <span className="badge__t">{unit.code}</span>
          </span>
        </div>
      </div>
      <div className="card__body">
        <div className="stack stack--lg">
          <UnitForm key={unit.code} unit={unit} units={units} people={people} />

          {unit.kind !== "COMPANY" && (
            <>
              <div className="divider" />
              <div className="kv kv--3">
                <div>
                  <div className="kv__k">{parent ? KIND_LABEL[parent.kind] : "Sits under"}</div>
                  <div className="kv__v">{parent ? parent.nameEn : "Nothing — it is detached"}</div>
                </div>
                <div>
                  <div className="kv__k">{childLabel(unit.kind)}</div>
                  <div className="kv__v">{node.children.length}</div>
                </div>
                <div>
                  <div className="kv__k">Cost centre</div>
                  <div className="kv__v">
                    {centre ? (
                      <span className="mono sm">{centre.code}</span>
                    ) : (
                      <span className="sm dim">Not set</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {node.children.length > 0 && (
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                <span className="lbl">{childLabel(unit.kind)}</span>
                <div className="spacer" />
                <span className="xs dim">{node.children.length}</span>
              </div>
              <div className="stack stack--sm">
                {node.children.map((child) => (
                  <button
                    key={child.unit.code}
                    type="button"
                    className="row hoverrow"
                    style={{ gap: 10, padding: "9px 10px", width: "100%", textAlign: "left" }}
                    onClick={() => onSelect(child.unit.code)}
                  >
                    <span className="sm grow trunc">{child.unit.nameEn}</span>
                    <span className="xs dim mono">{child.unit.code}</span>
                    {!activeOn([child.unit], on).length && (
                      <span className="chip">
                        <span className="dot" />
                        <span className="badge__t">Closed</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/// What sits under a tier. The customer's own vocabulary decides the tiers; this only
/// names the one below.
function childLabel(kind: OrgUnitKind): string {
  switch (kind) {
    case "COMPANY":
      return "Divisions";
    case "DIVISION":
      return "Departments";
    default:
      return "Sections";
  }
}

// ------------------------------------------------------------------ cost centres

function CostCentresCard({ costCentres, units, sites, people, on }: OrganisationPanelData) {
  const unitName = (code: string | null) =>
    code ? (units.find((u) => u.code === code)?.nameEn ?? code) : "";
  const siteName = (code: string | null) =>
    code ? (sites.find((s) => s.code === code)?.nameEn ?? code) : "";
  const personName = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? "") : "";

  const rows: Row[] = costCentres.map((c) => {
    const active = activeOn([c], on).length > 0;
    const owner = personName(c.ownerPersonId);
    return {
      id: c.code,
      views: active ? [] : ["closed"],
      search: [c.code, c.nameEn, unitName(c.orgUnitCode), siteName(c.siteCode), c.activity, owner]
        .filter(Boolean)
        .join(" "),
      cells: {
        code: { kind: "stack", title: c.code, sub: c.nameEn, monoTitle: true },
        unit: { kind: "text", text: unitName(c.orgUnitCode) || "—", dim: !c.orgUnitCode },
        site: { kind: "text", text: siteName(c.siteCode) || "—", dim: !c.siteCode },
        activity: { kind: "text", text: c.activity || "Not set", dim: !c.activity },
        owner: owner
          ? { kind: "person", name: owner }
          : { kind: "text", text: "Nobody named", dim: true },
        // Read from the period, never stored: a status that can disagree with its own
        // dates is a record nobody can answer for.
        status: active
          ? { kind: "chip", text: "Active", tone: "ok" }
          : { kind: "chip", text: "Closed" },
      },
    };
  });

  return (
    <section className="card">
      <div className="card__head">
        <div className="card__titles">
          <div className="h3 trunc">Cost centres</div>
          <div className="card__sub trunc">
            What spending is charged to, and who answers for it.
          </div>
        </div>
        <div className="row">
          <AddCostCentre units={units} sites={sites} people={people} />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          rowOpens
          exportName="cost-centres"
          searchPlaceholder="Cost centres"
          emptyTitle="No cost centre configured"
          emptyBody="Nothing can be charged anywhere until one exists."
          views={[{ id: "closed", label: "Closed" }]}
          filters={[
            { key: "unit", label: "Department" },
            { key: "site", label: "Site" },
            { key: "activity", label: "Activity" },
          ]}
          columns={[
            { key: "code", label: "Code", width: "24%", sortable: true },
            { key: "unit", label: "Department", width: "16%", sortable: true },
            { key: "site", label: "Site", width: "16%", sortable: true },
            { key: "activity", label: "Activity", width: "14%" },
            { key: "owner", label: "Cost centre owner", width: "18%" },
            { key: "status", label: "Status", width: "12%" },
          ]}
          rows={rows}
          actions={(code) => {
            const centre = costCentres.find((c) => c.code === code);
            return centre ? (
              <EditCostCentre centre={centre} units={units} sites={sites} people={people} />
            ) : null;
          }}
        />
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------- sites

function SitesCard({ sites, costCentres, units, on }: OrganisationPanelData) {
  const rows: Row[] = sites.map((s) => {
    const active = activeOn([s], on).length > 0;
    const centres = costCentres.filter((c) => c.siteCode === s.code).length;
    return {
      id: s.code,
      views: active ? [] : ["closed"],
      search: [s.nameEn, s.code, s.kind, s.town, s.district].filter(Boolean).join(" "),
      cells: {
        site: { kind: "stack", title: s.nameEn, sub: s.code, monoSub: true },
        kind: s.kind
          ? { kind: "badge", text: s.kind }
          : { kind: "text", text: "Not set", dim: true },
        town: { kind: "text", text: s.town || "—", dim: !s.town },
        district: { kind: "text", text: s.district || "—", dim: !s.district },
        centres: { kind: "text", text: String(centres) },
        status: active
          ? { kind: "chip", text: "Active", tone: "ok" }
          : { kind: "chip", text: "Closed" },
      },
    };
  });

  return (
    <section className="card">
      <div className="card__head">
        <div className="card__titles">
          <div className="h3 trunc">Sites</div>
          <div className="card__sub trunc">Where the work happens, and who looks after it.</div>
        </div>
        <div className="row">
          <AddSite units={units} />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          rowOpens
          exportName="sites"
          searchPlaceholder="Sites"
          emptyTitle="No site configured"
          emptyBody="A cost centre names the site its spending belongs to."
          views={[{ id: "closed", label: "Closed" }]}
          filters={[
            { key: "kind", label: "Kind" },
            { key: "district", label: "District" },
          ]}
          columns={[
            { key: "site", label: "Site", width: "26%", sortable: true },
            { key: "kind", label: "Kind", width: "16%" },
            { key: "town", label: "Town", width: "16%", sortable: true },
            { key: "district", label: "District", width: "16%" },
            { key: "centres", label: "Cost centres", width: "14%", numeric: true, sortable: true },
            { key: "status", label: "Status", width: "12%" },
          ]}
          rows={rows}
          actions={(code) => {
            const site = sites.find((s) => s.code === code);
            return site ? <EditSite site={site} units={units} /> : null;
          }}
        />
      </div>
    </section>
  );
}
