import { AlertTriangle } from "@/components/icons";
import {
  AddCoded,
  AddOrgUnit,
  CloseRecord,
  EditCoded,
  EditCodeFormat,
  EditOrgUnit,
} from "./editors";
import { loadOrganisationData } from "@/lib/organisation/load";
import {
  activeOn,
  assessList,
  buildStructure,
  checkCode,
  findFormat,
  flatten,
  type ListReadiness,
} from "@/lib/organisation/structure";
import type { CodeFormat, OrgUnitKind, Provenance, UnitNode } from "@/lib/organisation/types";
import { ORGANISATION_CODE } from "@/lib/org";

export const dynamic = "force-dynamic";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  STATED: "Stated",
  OBSERVED: "Observed",
  ASSUMED: "Assumed",
};

const PROVENANCE_CHIP: Record<Provenance, string> = {
  STATED: "chip--ok",
  OBSERVED: "chip--info",
  ASSUMED: "chip--warn",
};

const KIND_LABEL: Record<OrgUnitKind, string> = {
  COMPANY: "Company",
  DIVISION: "Division",
  DEPARTMENT: "Department",
  SECTION: "Section",
};

export default async function OrganisationPage() {
  const on = new Date();
  const data = await loadOrganisationData(ORGANISATION_CODE);

  const { roots, detached, faults } = buildStructure(data.units, on);
  const rows = [...flatten(roots), ...flatten(detached)];

  const activeUnits = activeOn(data.units, on);
  const costCentres = activeOn(data.costCentres, on);
  const accountCodes = activeOn(data.accountCodes, on);
  const sites = activeOn(data.sites, on);

  const units = assessList(data.units, on);
  const centres = assessList(data.costCentres, on);
  const accounts = assessList(data.accountCodes, on);

  const costCentreFormat = findFormat(data.formats, "cost_centre");
  const accountCodeFormat = findFormat(data.formats, "account_code");

  const detachedCodes = new Set(detached.map((d) => d.unit.code));
  const cycles = faults.filter((f) => f.kind === "CYCLE");

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Organisation</h1>
              {faults.length > 0 && (
                <span className="badge badge--warn">
                  {faults.length === 1 ? "1 fault" : `${faults.length} faults`}
                </span>
              )}
            </div>
            <p className="pagehead__sub">
              Companies, divisions, departments, sections, cost centres and sites.
            </p>
          </div>
        </div>
      </div>

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <ReadinessStat label="Units in force" readiness={units} />
        <ReadinessStat label="Cost centres" readiness={centres} />
        <ReadinessStat label="Account codes" readiness={accounts} />
      </div>

      {cycles.length > 0 && (
        <div className="callout callout--err" style={{ marginBottom: 24 }}>
          <div>
            <strong>
              {cycles.length === 1
                ? "The reporting lines form a loop"
                : `${cycles.length} loops in the reporting lines`}
            </strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {cycles.map((c) => c.codes.join(" → ")).join("; ")} — these cannot be drawn as
              a structure, so they are left out of the chart below. Where they belong is a
              question only you can answer.
            </p>
          </div>
        </div>
      )}

      {detached.length > 0 && (
        <div className="callout callout--warn" style={{ marginBottom: 24 }}>
          <div>
            <strong>
              {detached.length === 1
                ? "One unit reports to a unit that is no longer in force"
                : `${detached.length} units report to units no longer in force`}
            </strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              Listed at the foot of the chart, marked detached. They have not been moved to
              the top of the structure — where they now sit is a decision, not something the
              portal may infer.
            </p>
          </div>
        </div>
      )}

      <Section
        title="Structure"
        blurb="Units in force today, with their reporting lines."
        empty="No unit has been set. Until the structure exists, a requisition cannot say which department raised it and the approval matrix has nothing to route on."
        count={rows.length}
        action={<AddOrgUnit units={activeUnits} centres={costCentres} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Tier</th>
              <th>Cost centre</th>
              <th>In force from</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((node) => (
              <UnitRow
                key={node.unit.code}
                node={node}
                detached={detachedCodes.has(node.unit.code)}
                format={costCentreFormat}
                units={activeUnits}
                centres={costCentres}
              />
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Cost centres"
        blurb="Cost centres available for charging and budget checks."
        empty="No cost centre has been set."
        count={costCentres.length}
        action={<AddCoded entity="CostCentre" />}
      >
        <CodeTable
          rows={costCentres}
          format={costCentreFormat}
          formatKey="cost_centre"
          heading="Cost centre"
          entity="CostCentre"
        />
      </Section>

      <Section
        title="Account codes"
        blurb="Account codes used in budget checks."
        empty="No account code has been set."
        count={accountCodes.length}
        action={<AddCoded entity="AccountCode" />}
      >
        <CodeTable
          rows={accountCodes}
          format={accountCodeFormat}
          formatKey="account_code"
          heading="Account code"
          entity="AccountCode"
        />
      </Section>

      <Section
        title="Sites"
        blurb="Sites named on requisitions and certificates."
        empty="No site has been set."
        count={sites.length}
        action={<AddCoded entity="Site" units={activeUnits} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Site</th>
              <th>Address</th>
              <th>Responsible unit</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.code}>
                <td>
                  <div className="cellstack">
                    <span className="cellstack__t">{s.nameEn}</span>
                    {s.nameMs && <span className="cellstack__s">{s.nameMs}</span>}
                  </div>
                </td>
                <td className="sm dim">{s.address || "—"}</td>
                <td className="sm dim">{unitName(rows, s.orgUnitCode)}</td>
                <td>
                  <ProvenanceChip value={s.provenance} source="" />
                </td>
                <td className="right">
                  <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                    <EditCoded entity="Site" id={s.id} row={s} units={activeUnits} />
                    {s.effectiveTo == null && (
                      <CloseRecord entity="Site" id={s.id} label={s.nameEn} />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Code formats"
        blurb="Required formats for cost centres and account codes."
        empty="No code format has been set. Cost centres and account codes will be accepted as typed — the portal cannot say a code is well formed when nobody has said what well formed means."
        count={data.formats.length}
        action={
          <span className="row" style={{ gap: 6 }}>
            <EditCodeFormat formatKey="cost_centre" format={costCentreFormat ?? undefined} />
            <EditCodeFormat formatKey="account_code" format={accountCodeFormat ?? undefined} />
          </span>
        }
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "42%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Applies to</th>
              <th>Example</th>
              <th>Requirement</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {data.formats.map((f) => (
              <tr key={f.key}>
                <td className="cellstack__t">{FORMAT_LABEL[f.key] ?? readable(f.key)}</td>
                <td className="sm num">{f.example || "—"}</td>
                <td className="sm dim">{f.description || "—"}</td>
                <td>
                  <ProvenanceChip value={f.provenance} source="" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

/// Formats are keyed for lookup; the key is configuration and never reaches a screen.
const FORMAT_LABEL: Record<string, string> = {
  cost_centre: "Cost centre",
  account_code: "Account code",
};

function readable(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function unitName(rows: UnitNode[], code: string | null): string {
  if (!code) return "—";
  return rows.find((r) => r.unit.code === code)?.unit.nameEn ?? "Not in force";
}

function UnitRow({
  node,
  detached,
  format,
  units,
  centres,
}: {
  node: UnitNode & { unit: { id?: string } };
  detached: boolean;
  format: CodeFormat | null;
  units: Parameters<typeof EditOrgUnit>[0]["units"];
  centres: Parameters<typeof EditOrgUnit>[0]["centres"];
}) {
  const { unit, depth } = node;
  const check = unit.costCentreCode ? checkCode(unit.costCentreCode, format) : null;

  return (
    <tr>
      <td>
        <div className="cellstack" style={{ paddingLeft: depth * 18 }}>
          <span className="cellstack__t">
            {unit.nameEn}
            {detached && (
              <span className="badge badge--warn" style={{ marginLeft: 8 }}>
                detached
              </span>
            )}
          </span>
          {unit.nameMs && <span className="cellstack__s">{unit.nameMs}</span>}
        </div>
      </td>
      <td>
        <span className="chip">{KIND_LABEL[unit.kind]}</span>
      </td>
      <td className="sm">
        {unit.costCentreCode ? (
          <span className="num">
            {unit.costCentreCode}
            {check?.state === "MALFORMED" && (
              <span className="badge badge--warn" style={{ marginLeft: 8 }}>
                not the configured shape
              </span>
            )}
          </span>
        ) : (
          <span className="dim">Holds no budget</span>
        )}
      </td>
      <td className="sm dim">{unit.effectiveFrom.toISOString().slice(0, 10)}</td>
      <td>
        <ProvenanceChip value={unit.provenance} source={unit.governingSource} />
      </td>
      <td className="right">
        <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
          <EditOrgUnit unit={unit} id={unit.id!} units={units} centres={centres} />
          {unit.effectiveTo == null && (
            <CloseRecord entity="OrgUnit" id={unit.id!} label={unit.nameEn} />
          )}
        </span>
      </td>
    </tr>
  );
}

function CodeTable({
  rows,
  format,
  formatKey,
  heading,
  entity,
}: {
  rows: (Parameters<typeof EditCoded>[0]["row"] & { id: string })[];
  format: CodeFormat | null;
  formatKey: string;
  heading: string;
  entity: "CostCentre" | "AccountCode";
}) {
  return (
    <table className="table">
      <colgroup>
        <col style={{ width: "18%" }} />
        <col style={{ width: "34%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "20%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>{heading}</th>
          <th>Name</th>
          <th>Shape</th>
          <th>Source</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const check = checkCode(r.code, format);
          return (
            <tr key={r.code}>
              <td className="sm num">{r.code}</td>
              <td>
                <div className="cellstack">
                  <span className="cellstack__t">{r.nameEn}</span>
                  {r.nameMs && <span className="cellstack__s">{r.nameMs}</span>}
                </div>
              </td>
              <td>
                <ShapeBadge check={check} formatKey={formatKey} />
              </td>
              <td>
                <ProvenanceChip value={r.provenance} source="" />
              </td>
              <td className="right">
                <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                  <EditCoded entity={entity} id={r.id} row={r} />
                  {r.effectiveTo == null && (
                    <CloseRecord entity={entity} id={r.id} label={r.nameEn} />
                  )}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/// Not checked is not the same as correct, and the badge says which it is.
function ShapeBadge({
  check,
  formatKey,
}: {
  check: ReturnType<typeof checkCode>;
  formatKey: string;
}) {
  if (check.state === "OK") return <span className="badge badge--ok">Matches</span>;
  if (check.state === "MALFORMED") {
    return <span className="badge badge--warn">Does not match</span>;
  }
  if (check.state === "BAD_PATTERN") {
    return <span className="badge badge--warn">Format unusable</span>;
  }
  return (
    <span className="sm dim" title={`No format configured for ${formatKey}`}>
      Not checked
    </span>
  );
}

function ReadinessStat({ label, readiness }: { label: string; readiness: ListReadiness }) {
  const unset = readiness.state === "UNSET";
  return (
    <div className="stat">
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {readiness.needsSignOff && (
          <span className="stat__ico stat__ico--warn">
            <AlertTriangle size={15} />
          </span>
        )}
      </div>
      <div className="stat__value">
        {unset ? <span className="dim">Not set</span> : readiness.active}
      </div>
      <div className="stat__foot">
        <span className="stat__hint">
          {unset
            ? "Nobody has configured this. That is not the same as none."
            : readiness.needsSignOff
              ? `${readiness.assumed} resting on a working default, awaiting sign-off`
              : "Every entry traced to a source"}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  blurb,
  empty,
  count,
  action,
  children,
}: {
  title: string;
  blurb: string;
  empty: string;
  count: number;
  /// Present even on an empty section: that is where the first entry gets added.
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section" style={{ marginBottom: 24 }}>
      <div className="section__head">
        <h2 className="h3">{title}</h2>
        {count > 0 && <span className="badge badge--outline">{count}</span>}
        <div className="spacer" />
        {action}
      </div>
      <p className="sm muted" style={{ margin: "0 0 12px" }}>
        {blurb}
      </p>
      {count === 0 ? (
        <div className="card">
          <div className="card__body">
            <div className="empty">
              <div className="empty__t">Not set</div>
              <p className="empty__d">{empty}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dl">
          <div className="tablewrap">{children}</div>
        </div>
      )}
    </section>
  );
}

function ProvenanceChip({ value, source }: { value: Provenance; source: string }) {
  return (
    <div className="cellstack">
      <span className={`chip ${PROVENANCE_CHIP[value]}`}>{PROVENANCE_LABEL[value]}</span>
      {source && <span className="cellstack__s">{source}</span>}
    </div>
  );
}
