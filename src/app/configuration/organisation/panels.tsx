"use client";

import { useState, type ReactNode } from "react";

import { DataList, type Row } from "@/components/data-list";
import { Tabs } from "@/components/tabs";
import {
  BuildingIcon,
  ChartIcon,
  ChevronDown,
  ChevronRight,
  GlobeIcon,
  SearchIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { formatDate } from "@/lib/format";
import { activeOn } from "@/lib/effective";
import { nextTier } from "@/lib/organisation/structure";
import { DETAIL_LABEL, type Details } from "@/lib/organisation/details";
import type { CostCentre, OrgUnit, OrgUnitKind, Site, UnitNode } from "@/lib/organisation/types";

import {
  AddCostCentre,
  AddOrgUnit,
  AddSite,
  EditCostCentre,
  EditDetails,
  EditOrgUnit,
  EditSite,
  EditTimeZone,
  KIND_LABEL,
} from "./editors";
import { LogoCard, type LogoInfo } from "./logo-card";
import { SignInPageCards, type SignInDarkLogoInfo, type SignInImageInfo } from "./sign-in-cards";
import type { SignInPageSettings } from "@/lib/organisation/sign-in-page";

/**
 * Organisation: the structure, and the cost centres and sites hung off it.
 *
 * It is not decoration. Requisitions record their department, section and cost
 * centre from here; "the Head of Department" in an endorsement chain or an approval
 * route is found by walking this tree. So the screen leads with the thing those rules
 * need — who heads each unit — and says plainly where nobody does.
 */

type Person = { id: string; name: string; isActive: boolean };

export interface OrganisationPanelData {
  details: Details;
  logo: LogoInfo | null;
  signInImage: SignInImageInfo | null;
  signInDarkLogo: SignInDarkLogoInfo | null;
  signInPage: SignInPageSettings;
  /// The zone the organisation keeps its dates in, with its label; null while unset.
  timeZone: { value: string; label: string } | null;
  timeZoneOptions: { value: string; label: string }[];
  roots: UnitNode[];
  detached: UnitNode[];
  units: OrgUnit[];
  costCentres: CostCentre[];
  sites: Site[];
  people: Person[];
  /// The unit whose detail is shown, read from the address so a unit can be linked to
  /// and survives a refresh.
  selected: string | null;
  /// Which tab, likewise from the address.
  view: string | null;
  on: Date;
}

const KIND_TONE: Record<OrgUnitKind, Tone> = {
  COMPANY: "brand",
  DIVISION: "info",
  DEPARTMENT: "ok",
  SECTION: "neutral",
};

/// What a unit's head resolves to. Three states that must not look alike: somebody,
/// nobody named, and somebody named who has gone.
type Head =
  | { state: "NAMED"; person: Person }
  | { state: "NONE" }
  | { state: "LEFT"; person: Person | null };

function headOf(unit: OrgUnit, people: Person[]): Head {
  if (!unit.headPersonId) return { state: "NONE" };
  const person = people.find((p) => p.id === unit.headPersonId) ?? null;
  if (!person || !person.isActive) return { state: "LEFT", person };
  return { state: "NAMED", person };
}

function flattenNodes(nodes: readonly UnitNode[]): UnitNode[] {
  return nodes.flatMap((n) => [n, ...flattenNodes(n.children)]);
}

/// Replace one search parameter without a navigation — every panel is already here.
function setParam(key: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
}

export function OrganisationScreen(data: OrganisationPanelData) {
  return (
    <Tabs
      label="Organisation"
      initial={data.view ?? undefined}
      tabs={[
        { id: "details", label: "Details", panel: <DetailsView details={data.details} logo={data.logo} signInImage={data.signInImage} signInDarkLogo={data.signInDarkLogo} signInPage={data.signInPage} timeZone={data.timeZone} timeZoneOptions={data.timeZoneOptions} /> },
        { id: "structure", label: "Structure", count: data.units.length, panel: <StructureView {...data} /> },
        {
          id: "cost-centres",
          label: "Cost centres",
          count: data.costCentres.length,
          panel: <CostCentresView {...data} />,
        },
        { id: "sites", label: "Sites", count: data.sites.length, panel: <SitesView {...data} /> },
      ]}
    />
  );
}

// ----------------------------------------------------------------------- details

const NOT_SET = <span className="text-ink-4">Not set</span>;

/// The identity the portal, reports and letters carry. Unset reads "Not set", never blank.
function DetailsView({ details, logo, signInImage, signInDarkLogo, signInPage, timeZone, timeZoneOptions }: { details: Details; logo: LogoInfo | null; signInImage: SignInImageInfo | null; signInDarkLogo: SignInDarkLogoInfo | null; signInPage: SignInPageSettings; timeZone: OrganisationPanelData["timeZone"]; timeZoneOptions: OrganisationPanelData["timeZoneOptions"] }) {
  const value = (v: string | null) => v ?? NOT_SET;
  const address = [details.addressLine1, details.addressLine2, [details.postcode, details.city].filter(Boolean).join(" "), details.state, details.country].filter(Boolean);
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Organisation details" subtitle="On reports and letters" actions={<EditDetails details={details} />} />
        <CardBody className="flex flex-col gap-5">
          <KeyValues
            columns={2}
            items={[
              { label: DETAIL_LABEL.name, value: details.name },
              { label: DETAIL_LABEL.shortName, value: value(details.shortName) },
              { label: DETAIL_LABEL.registrationNo, value: value(details.registrationNo) },
              { label: DETAIL_LABEL.taxIdentificationNo, value: value(details.taxIdentificationNo) },
              { label: DETAIL_LABEL.sstRegistrationNo, value: value(details.sstRegistrationNo) },
              { label: "Registered address", value: address.length ? <span className="whitespace-pre-line">{address.join("\n")}</span> : NOT_SET },
              { label: DETAIL_LABEL.phone, value: value(details.phone) },
              { label: DETAIL_LABEL.email, value: value(details.email) },
              { label: DETAIL_LABEL.website, value: value(details.website) },
            ]}
          />
          
        </CardBody>
      </Card>
      {/* Founder, 2026-10-08: the time zone is one of the organisation's settings, here with the others,
          not a notice across the top of the Organisation screen. */}
      <Card>
        <CardHeader
          title="Time zone"
          subtitle="Dates are judged in this zone"
          actions={<EditTimeZone timeZone={timeZone?.value ?? null} options={timeZoneOptions} />}
        />
        <CardBody>
          {timeZone ? (
            <KeyValues items={[{ label: "Dates are judged in", value: timeZone.label }]} />
          ) : (
            <Callout tone="warn" title="Time zone not set">
              Sittings, tabling and votes are blocked.
            </Callout>
          )}
        </CardBody>
      </Card>
      <LogoCard logo={logo} />
      <SignInPageCards image={signInImage} darkLogo={signInDarkLogo} settings={signInPage} />
    </div>
  );
}

// --------------------------------------------------------------------- structure

function StructureView(data: OrganisationPanelData) {
  const { roots, detached, people, units } = data;
  const all = [...flattenNodes(roots), ...flattenNodes(detached)];
  const [chosen, setChosen] = useState<string | null>(data.selected);
  const current = all.find((n) => n.unit.code === chosen) ?? all[0] ?? null;

  const select = (code: string) => {
    setChosen(code);
    setParam("unit", code);
  };

  if (all.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<BuildingIcon size={24} />}
          title="No structure yet"
          action={<AddOrgUnit kind="COMPANY" parent={null} people={people} variant="primary" />}
        />
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <StructureTree
        roots={roots}
        detached={detached}
        people={people}
        selected={current?.unit.code ?? null}
        onSelect={select}
        hasCompany={units.some((u) => u.kind === "COMPANY")}
      />
      {current && <UnitPanel node={current} onSelect={select} {...data} />}
    </div>
  );
}

function StructureTree({
  roots,
  detached,
  people,
  selected,
  onSelect,
  hasCompany,
}: {
  roots: UnitNode[];
  detached: UnitNode[];
  people: Person[];
  selected: string | null;
  onSelect: (code: string) => void;
  hasCompany: boolean;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const nodes = [...roots, ...detached];

  const needle = query.trim().toLowerCase();
  // Searching flattens the tree: a match three levels down whose parents do not match
  // would otherwise be invisible.
  const visible = needle
    ? flattenNodes(nodes).filter(
        (n) =>
          n.unit.nameEn.toLowerCase().includes(needle) ||
          n.unit.code.toLowerCase().includes(needle),
      )
    : shown(nodes, collapsed);

  const detachedCodes = new Set(flattenNodes(detached).map((n) => n.unit.code));

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader
        icon={<BuildingIcon size={17} />}
        title="Structure"
        subtitle="Choose a unit"
        actions={
          !hasCompany ? <AddOrgUnit kind="COMPANY" parent={null} people={people} /> : undefined
        }
      />
      <div className="px-4 pt-3.5 pb-2">
        <div className="relative">
          <SearchIcon
            size={15}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4"
          />
          <input
            type="search"
            placeholder="Search units"
            aria-label="Search the structure"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-full border border-line-2 bg-surface pr-3 pl-9 text-[13px] outline-none placeholder:text-ink-4 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
      </div>
      <div role="tree" aria-label="Organisation structure" className="max-h-[60vh] overflow-y-auto px-2 pb-3">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-ink-3">No unit matches.</p>
        ) : (
          visible.map((node) => {
            const hasChildren = node.children.length > 0;
            const expanded = !collapsed.has(node.unit.code);
            const head = headOf(node.unit, people);
            const isSelected = node.unit.code === selected;
            return (
              <div
                key={node.unit.code}
                role="treeitem"
                aria-selected={isSelected}
                aria-expanded={hasChildren ? expanded : undefined}
                className={cx(
                  "group flex items-center gap-1.5 rounded-xl py-1.5 pr-2 transition",
                  isSelected ? "bg-brand-50" : "hover:bg-ink/[0.04]",
                )}
                style={{ paddingLeft: needle ? 8 : 8 + Math.min(node.depth, 4) * 18 }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden={!hasChildren}
                  onClick={() =>
                    hasChildren &&
                    setCollapsed((c) => {
                      const next = new Set(c);
                      if (next.has(node.unit.code)) next.delete(node.unit.code);
                      else next.add(node.unit.code);
                      return next;
                    })
                  }
                  className={cx(
                    "grid size-5 shrink-0 place-items-center rounded text-ink-4",
                    hasChildren ? "hover:bg-ink/5 hover:text-ink" : "invisible",
                  )}
                >
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(node.unit.code)}
                  title={KIND_LABEL[node.unit.kind]}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cx(
                      "min-w-0 flex-1 truncate text-[13.5px]",
                      isSelected ? "font-semibold text-brand-800" : "font-medium text-ink",
                    )}
                  >
                    {node.unit.nameEn}
                  </span>
                  {detachedCodes.has(node.unit.code) && node.depth === 0 && (
                    <Badge tone="err">Detached</Badge>
                  )}
                  {head.state === "NAMED" ? (
                    <Avatar name={head.person.name} size="xs" />
                  ) : (
                    <span
                      title={head.state === "LEFT" ? "Head has left" : "No head named"}
                      className={cx(
                        "size-2 shrink-0 rounded-full",
                        head.state === "LEFT" ? "bg-rose-500" : "bg-amber-400",
                      )}
                    />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

/// The nodes a collapsed tree actually shows, depth-first.
function shown(nodes: readonly UnitNode[], collapsed: ReadonlySet<string>): UnitNode[] {
  return nodes.flatMap((n) =>
    collapsed.has(n.unit.code) ? [n] : [n, ...shown(n.children, collapsed)],
  );
}

function UnitPanel({
  node,
  units,
  costCentres,
  sites,
  people,
  on,
  onSelect,
}: OrganisationPanelData & { node: UnitNode; onSelect: (code: string) => void }) {
  const unit = node.unit;
  const head = headOf(unit, people);
  const childKind = nextTier(unit.kind);
  const path = ancestors(unit, units);
  const parent = path.at(-1) ?? null;
  const ownCentres = costCentres.filter((c) => c.orgUnitCode === unit.code);
  const ownSites = sites.filter((s) => s.orgUnitCode === unit.code);
  const centre = costCentres.find((c) => c.code === unit.costCentreCode) ?? null;
  const headTitle =
    unit.kind === "COMPANY" ? "Chief executive" : `Head of ${KIND_LABEL[unit.kind].toLowerCase()}`;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card>
        <div className="flex flex-col gap-4 px-5 pt-5 pb-4 sm:flex-row sm:items-start sm:px-6">
          <div className="min-w-0 flex-1">
            {path.length > 0 && (
              <nav aria-label="Sits under" className="mb-2 flex flex-wrap items-center gap-1 text-[12.5px] text-ink-3">
                {path.map((p) => (
                  <span key={p.code} className="flex items-center gap-1">
                    <button type="button" onClick={() => onSelect(p.code)} className="hover:text-ink hover:underline">
                      {p.nameEn}
                    </button>
                    <ChevronRight size={12} className="text-ink-4" />
                  </span>
                ))}
              </nav>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[22px] leading-tight font-bold tracking-tight text-ink">{unit.nameEn}</h2>
              <Badge tone={KIND_TONE[unit.kind]}>{KIND_LABEL[unit.kind]}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <EditOrgUnit unit={unit} people={people} />
            {childKind && <AddOrgUnit kind={childKind} parent={unit} people={people} variant="primary" />}
          </div>
        </div>

        <div className="border-t border-line px-5 py-4 sm:px-6">
          <div className="mb-2 text-[12px] font-semibold text-ink-3">{headTitle}</div>
          {head.state === "NAMED" ? (
            <div className="flex items-center gap-3">
              <Avatar name={head.person.name} size="md" />
              <div className="text-[15px] font-semibold text-ink">{head.person.name}</div>
            </div>
          ) : head.state === "LEFT" ? (
            <Callout tone="err" title={head.person ? `${head.person.name} has left` : "The head named here is no longer on record"}>
              Name a new head with Edit.
            </Callout>
          ) : (
            <Callout tone="warn" title="Nobody is named as head">
              Approvals to the {headTitle.toLowerCase()} have nobody to go to.
            </Callout>
          )}
        </div>

        <CardBody className="border-t border-line">
          <KeyValues
            columns={3}
            items={[
              { label: "Code", value: <span className="font-mono text-[13px]">{unit.code}</span> },
              {
                label: "Sits under",
                value: parent ? (
                  <button type="button" onClick={() => onSelect(parent.code)} className="font-medium text-brand-700 hover:underline">
                    {parent.nameEn}
                  </button>
                ) : unit.kind === "COMPANY" ? (
                  "Nothing — it is the top"
                ) : (
                  <span className="font-medium text-rose-700">Nothing in force — it is detached</span>
                ),
              },
              { label: "In force from", value: formatDate(unit.effectiveFrom) },
              ...(unit.kind !== "COMPANY"
                ? [
                    {
                      label: "Charged to",
                      value: centre ? (
                        <span>
                          {centre.nameEn}{" "}
                          <span className="font-mono text-[12px] whitespace-nowrap text-ink-3">{centre.code}</span>
                        </span>
                      ) : (
                        <span className="text-ink-3">No cost centre set</span>
                      ),
                    },
                  ]
                : []),
              ...(unit.kind === "COMPANY" ? companyFacts(unit) : []),
            ]}
          />
        </CardBody>
      </Card>

      {childKind && (
        <Card>
          <CardHeader
            title={`${pluralTier(childKind)} under ${unit.nameEn}`}
            subtitle={node.children.length === 0 ? "None yet." : undefined}
            divided={node.children.length > 0}
          />
          {node.children.length > 0 && (
            <ul className="divide-y divide-line/70 px-2 py-1.5">
              {node.children.map((child) => {
                const h = headOf(child.unit, people);
                return (
                  <li key={child.unit.code}>
                    <button
                      type="button"
                      onClick={() => onSelect(child.unit.code)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-ink/[0.03]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-ink">{child.unit.nameEn}</span>
                        <span className="block text-[12.5px] text-ink-3">
                          {h.state === "NAMED" ? h.person.name : h.state === "LEFT" ? "Head has left" : "No head named"}
                          {child.children.length > 0 &&
                            ` · ${child.children.length} ${pluralTier(nextTier(child.unit.kind) ?? "SECTION").toLowerCase()}`}
                        </span>
                      </span>
                      <Badge tone={KIND_TONE[child.unit.kind]}>{KIND_LABEL[child.unit.kind]}</Badge>
                      {!activeOn([child.unit], on).length && <Badge>Closed</Badge>}
                      <ChevronRight size={16} className="text-ink-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-5 2xl:grid-cols-2">
        <Linked
          title="Cost centres"
          subtitle="Charged to"
          action={<AddCostCentre units={units} sites={sites} people={people} unit={unit} variant="ghost" />}
          empty="No cost centre belongs to this unit."
          items={ownCentres.map((c) => ({
            key: c.code,
            title: c.nameEn,
            sub: c.code,
            extra: people.find((p) => p.id === c.ownerPersonId)?.name,
          }))}
        />
        <Linked
          title="Sites"
          subtitle="Where this unit's work happens."
          action={<AddSite units={units} unit={unit} variant="ghost" />}
          empty="This unit looks after no site."
          items={ownSites.map((s) => ({
            key: s.code,
            title: s.nameEn,
            sub: [s.kind, s.town].filter(Boolean).join(" · ") || s.code,
          }))}
        />
      </div>
    </div>
  );
}

function Linked({
  title,
  subtitle,
  action,
  empty,
  items,
}: {
  title: string;
  subtitle: string;
  action: ReactNode;
  empty: string;
  items: { key: string; title: string; sub: string; extra?: string }[];
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} actions={action} divided={items.length > 0} />
      {items.length === 0 ? (
        <p className="px-6 pb-5 text-[13px] text-ink-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/70 px-6 pb-2">
          {items.map((it) => (
            <li key={it.key} className="flex items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{it.title}</span>
                <span className="block truncate font-mono text-[12px] text-ink-3">{it.sub}</span>
              </span>
              {it.extra && <Avatar name={it.extra} size="xs" />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function companyFacts(unit: OrgUnit): { label: string; value: ReactNode }[] {
  const notSet = <span className="text-ink-3">Not set</span>;
  return [
    { label: "Registration number", value: unit.registrationNumber || notSet },
    { label: "Tax reference", value: unit.taxReference || notSet },
    { label: "Telephone", value: unit.telephone || notSet },
    { label: "Financial year starts", value: unit.financialYearStart || notSet },
    { label: "Operating licence", value: unit.operatingLicence || notSet },
    { label: "Address", value: unit.address || notSet },
  ];
}

/// The unit's ancestors, root first, not including itself.
function ancestors(unit: OrgUnit, units: OrgUnit[]): OrgUnit[] {
  const chain: OrgUnit[] = [];
  const seen = new Set<string>([unit.code]);
  let parentCode = unit.parentCode;
  while (parentCode && !seen.has(parentCode)) {
    const parent = units.find((u) => u.code === parentCode);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parent.code);
    parentCode = parent.parentCode;
  }
  return chain;
}

function pluralTier(kind: OrgUnitKind): string {
  return { COMPANY: "Companies", DIVISION: "Divisions", DEPARTMENT: "Departments", SECTION: "Sections" }[kind];
}

// ------------------------------------------------------------------ cost centres

/// Read from the period, never stored: a status that can disagree with its own dates
/// is a record nobody can answer for. Not yet begun is not closed.
function datedStatus(
  entry: { effectiveFrom: Date; effectiveTo: Date | null },
  on: Date,
): { views: string[]; cell: Row["cells"][string] } {
  if (entry.effectiveFrom > on) {
    return {
      views: ["upcoming"],
      cell: { kind: "badge", text: `Starts ${formatDate(entry.effectiveFrom)}`, tone: "info" },
    };
  }
  if (entry.effectiveTo != null && entry.effectiveTo <= on) {
    return { views: ["closed"], cell: { kind: "badge", text: "Closed" } };
  }
  return { views: [], cell: { kind: "badge", text: "Active", tone: "ok" } };
}

function CostCentresView({ costCentres, units, sites, people, on }: OrganisationPanelData) {
  const unitName = (code: string | null) =>
    code ? (units.find((u) => u.code === code)?.nameEn ?? "Unit not in force") : "";
  const siteName = (code: string | null) =>
    code ? (sites.find((s) => s.code === code)?.nameEn ?? "Site not in force") : "";
  const personName = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? "") : "");

  const rows: Row[] = costCentres.map((c) => {
    const status = datedStatus(c, on);
    const owner = personName(c.ownerPersonId);
    return {
      id: c.code,
      views: status.views,
      search: [c.code, c.nameEn, unitName(c.orgUnitCode), siteName(c.siteCode), c.activity, owner]
        .filter(Boolean)
        .join(" "),
      cells: {
        centre: { kind: "stack", title: c.nameEn, sub: c.code, monoSub: true },
        unit: {
          kind: "stack",
          title: unitName(c.orgUnitCode) || "Not set",
          sub: c.activity || undefined,
        },
        site: { kind: "text", text: siteName(c.siteCode) || "Not set", dim: !c.siteCode },
        owner: owner ? { kind: "person", name: owner } : { kind: "text", text: "Nobody named", dim: true },
        status: status.cell,
      },
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ChartIcon size={17} />}
        title="Cost centres"
        subtitle="Charged to · who answers"
        actions={<AddCostCentre units={units} sites={sites} people={people} variant="primary" />}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        rowOpens
        exportName="cost-centres"
        searchPlaceholder="Search cost centres"
        emptyTitle="No cost centre yet"
        views={[
          { id: "closed", label: "Closed" },
          { id: "upcoming", label: "Not yet in force" },
        ]}
        filters={[
          { key: "unit", label: "Unit" },
          { key: "site", label: "Site" },
        ]}
        columns={[
          { key: "centre", label: "Cost centre", sortable: true, mobile: "primary" },
          { key: "unit", label: "Belongs to · activity", width: "180px", sortable: true, mobile: "meta" },
          { key: "site", label: "Site", width: "140px", sortable: true, mobile: "meta" },
          { key: "owner", label: "Owner", width: "168px", mobile: "meta" },
          { key: "status", label: "Status", width: "104px", mobile: "meta" },
        ]}
        rows={rows}
        actions={(code) => {
          const centre = costCentres.find((c) => c.code === code);
          return centre ? <EditCostCentre centre={centre} units={units} sites={sites} people={people} /> : null;
        }}
      />
    </Card>
  );
}

// -------------------------------------------------------------------------- sites

function SitesView({ sites, costCentres, units, on }: OrganisationPanelData) {
  const rows: Row[] = sites.map((s) => {
    const status = datedStatus(s, on);
    const centres = costCentres.filter((c) => c.siteCode === s.code).length;
    const unit = units.find((u) => u.code === s.orgUnitCode);
    return {
      id: s.code,
      views: status.views,
      search: [s.nameEn, s.code, s.kind, s.town, s.district, unit?.nameEn].filter(Boolean).join(" "),
      cells: {
        site: { kind: "stack", title: s.nameEn, sub: s.code, monoSub: true },
        kind: s.kind ? { kind: "badge", text: s.kind } : { kind: "text", text: "Not set", dim: true },
        where: {
          kind: "stack",
          title: s.town || "Town not set",
          sub: s.district || undefined,
        },
        unit: { kind: "text", text: unit?.nameEn ?? "Not set", dim: !unit },
        centres: { kind: "text", text: String(centres) },
        status: status.cell,
      },
    };
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<GlobeIcon size={17} />}
        title="Sites"
        subtitle="Where work happens"
        actions={<AddSite units={units} variant="primary" />}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        rowOpens
        exportName="sites"
        searchPlaceholder="Search sites"
        emptyTitle="No site yet"
        views={[
          { id: "closed", label: "Closed" },
          { id: "upcoming", label: "Not yet in force" },
        ]}
        filters={[
          { key: "kind", label: "Kind" },
          { key: "unit", label: "Unit" },
        ]}
        columns={[
          { key: "site", label: "Site", sortable: true, mobile: "primary" },
          { key: "kind", label: "Kind", width: "96px", mobile: "meta" },
          { key: "where", label: "Town", width: "132px", sortable: true, mobile: "meta" },
          { key: "unit", label: "Looked after by", width: "164px", mobile: "meta" },
          { key: "centres", label: "Cost centres", width: "104px", numeric: true, sortable: true, mobile: "meta" },
          { key: "status", label: "Status", width: "104px", mobile: "meta" },
        ]}
        rows={rows}
        actions={(code) => {
          const site = sites.find((s) => s.code === code);
          return site ? <EditSite site={site} units={units} /> : null;
        }}
      />
    </Card>
  );
}
