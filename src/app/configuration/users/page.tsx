import { AlertTriangle } from "@/components/icons";
import { loadRoster } from "@/lib/people/load";
import { holdingsOn, officeReadiness, rosterFaults } from "@/lib/people/roster";
import type { RosterFault } from "@/lib/people/types";
import { ORGANISATION_CODE } from "@/lib/org";

import {
  AddAssignment,
  AddOffice,
  AddPerson,
  EditAssignment,
  EditOffice,
  EditPerson,
  EndAssignment,
} from "./editors";

export const dynamic = "force-dynamic";

const READINESS = {
  READY: { label: "Held", chip: "chip--ok" },
  VACANT: { label: "Vacant", chip: "chip--warn" },
  CONTESTED: { label: "Held twice", chip: "chip--warn" },
} as const;

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function UsersPage() {
  const on = new Date();
  const roster = await loadRoster(ORGANISATION_CODE);

  const holdings = holdingsOn(roster, on);
  const faults = rosterFaults(roster, on, roster.routedToCodes);
  const blocking = faults.filter((f) => f.kind === "VACANT" && f.routedTo);
  const active = roster.people.filter((p) => p.isActive);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Users &amp; roles</h1>
              {blocking.length > 0 && (
                <span className="badge badge--warn">
                  {blocking.length === 1
                    ? "1 office unfilled"
                    : `${blocking.length} offices unfilled`}
                </span>
              )}
            </div>
            <p className="pagehead__sub">Officers, the offices they hold and what each may see.</p>
          </div>
        </div>
      </div>

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <Stat
          label="Officers"
          value={active.length}
          hint={
            roster.people.length === active.length
              ? "Everyone on record is current"
              : `${roster.people.length - active.length} have left, kept for the record`
          }
        />
        <Stat
          label="Offices"
          value={roster.offices.length}
          hint={
            roster.routedToCodes.length > 0
              ? `${roster.routedToCodes.length} routed to by an approval rule`
              : "No approval matrix is in force to route to them"
          }
        />
        <Stat
          label="Assignments in force"
          value={holdings.length}
          warn={blocking.length > 0}
          hint={
            blocking.length > 0
              ? `${blocking.length} routed office${blocking.length === 1 ? "" : "s"} nobody holds`
              : "Every routed office has a holder"
          }
        />
      </div>

      {faults.length > 0 && <Faults faults={faults} />}

      <Section
        title="Officers"
        blurb="People on record. Identity, held separately from sign-in."
        empty="No officer has been added. Until one is, no office can be assigned and no approval chain resolves to a person."
        count={roster.people.length}
        action={<AddPerson />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Name</th>
              <th>Staff no.</th>
              <th>Job title</th>
              <th>Offices held</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roster.people.map((p) => {
              const held = holdings.filter((h) => h.person.id === p.id);
              return (
                <tr key={p.id}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t">
                        {p.name}
                        {!p.isActive && (
                          <span className="badge badge--outline" style={{ marginLeft: 8 }}>
                            left
                          </span>
                        )}
                      </span>
                      {p.email && <span className="cellstack__s">{p.email}</span>}
                    </div>
                  </td>
                  <td className="sm num">{p.staffNo ?? "—"}</td>
                  <td className="sm dim">{p.jobTitle ?? "—"}</td>
                  <td className="sm dim">
                    {held.length === 0
                      ? "None"
                      : held.map((h) => h.office?.nameEn ?? h.assignment.roleCode).join(", ")}
                  </td>
                  <td className="right">
                    <EditPerson person={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section
        title="Offices"
        blurb="What an approval rule routes to, and where authority goes when the holder cannot act."
        empty="No office has been set. Approval rules route to offices, so nothing routes until one exists."
        count={roster.offices.length}
        action={<AddOffice offices={roster.offices} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Office</th>
              <th>Status</th>
              <th>Absence passes to</th>
              <th>Self-approval passes to</th>
              <th>Routed to</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roster.offices.map((o) => {
              const readiness = READINESS[officeReadiness(roster, o.code, on)];
              const nameOf = (code: string | null) =>
                code == null ? "—" : (roster.offices.find((x) => x.code === code)?.nameEn ?? code);
              return (
                <tr key={o.id}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t">
                        {o.nameEn}
                        {o.isCommittee && (
                          <span className="badge badge--outline" style={{ marginLeft: 8 }}>
                            committee
                          </span>
                        )}
                      </span>
                      <span className="cellstack__s">{o.nameMs}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${readiness.chip}`}>{readiness.label}</span>
                  </td>
                  <td className="sm dim">{nameOf(o.escalatesToCode)}</td>
                  <td className="sm dim">{nameOf(o.selfApprovalEscalatesToCode)}</td>
                  <td className="sm dim">{roster.routedToCodes.includes(o.code) ? "Yes" : "No"}</td>
                  <td className="right">
                    <EditOffice office={o} offices={roster.offices} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section
        title="Assignments"
        blurb="Who holds which office, and over what period."
        empty="No office has been assigned. An approval chain resolves to offices, and without an assignment none of them resolves to a person."
        count={roster.assignments.length}
        action={<AddAssignment people={roster.people} offices={roster.offices} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Officer</th>
              <th>Office</th>
              <th>Scope</th>
              <th>Period</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {roster.assignments.map((a) => {
              const person = roster.people.find((p) => p.id === a.personId);
              const office = roster.offices.find((o) => o.code === a.roleCode);
              const ended = a.effectiveTo != null && a.effectiveTo <= on;
              return (
                <tr key={a.id}>
                  <td className="sm">{person?.name ?? "Not on record"}</td>
                  <td className="sm">
                    {office?.nameEn ?? (
                      <span className="badge badge--warn">{a.roleCode} — no such office</span>
                    )}
                  </td>
                  <td className="sm dim">{a.scope ?? "Organisation-wide"}</td>
                  <td className="sm dim">
                    {day(a.effectiveFrom)} — {a.effectiveTo ? day(a.effectiveTo) : "in force"}
                  </td>
                  <td className="right">
                    <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <EditAssignment
                        assignment={a}
                        people={roster.people}
                        offices={roster.offices}
                      />
                      {!ended && (
                        <EndAssignment
                          id={a.id}
                          label={`${person?.name ?? "this"} as ${office?.nameEn ?? a.roleCode}`}
                        />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

/// Faults are shown and never repaired: which of two holders is right, and who should
/// fill a vacancy, are decisions only the organisation can take.
function Faults({ faults }: { faults: RosterFault[] }) {
  const blocking = faults.filter((f) => f.kind === "VACANT" && f.routedTo);
  const overlaps = faults.filter((f) => f.kind === "OVERLAP");
  const unknown = faults.filter((f) => f.kind === "UNKNOWN_OFFICE");
  const leavers = faults.filter((f) => f.kind === "INACTIVE_HOLDER");

  return (
    <div className="stack stack--md" style={{ marginBottom: 24 }}>
      {blocking.length > 0 && (
        <div className="callout callout--warn">
          <div>
            <strong>An approval rule routes to an office nobody holds</strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {blocking.map((f) => f.roleCode).join(", ")} — a matter routed there reaches an
              office with no signatory. Who should hold it is a decision for you.
            </p>
          </div>
        </div>
      )}
      {overlaps.length > 0 && (
        <div className="callout callout--err">
          <div>
            <strong>An office is held by two people at once</strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {overlaps.map((f) => `${f.roleCode}: ${f.personNames.join(" and ")}`).join("; ")} —
              the approval chain would resolve to two signatories. End one assignment.
            </p>
          </div>
        </div>
      )}
      {unknown.length > 0 && (
        <div className="callout callout--warn">
          <div>
            <strong>Someone is assigned to an office that does not exist</strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {unknown.map((f) => `${f.personName} → ${f.roleCode}`).join("; ")}.
            </p>
          </div>
        </div>
      )}
      {leavers.length > 0 && (
        <div className="callout callout--warn">
          <div>
            <strong>An office is held by someone who has left</strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {leavers.map((f) => `${f.personName} still holds ${f.roleCode}`).join("; ")}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {warn && (
          <span className="stat__ico stat__ico--warn">
            <AlertTriangle size={15} />
          </span>
        )}
      </div>
      <div className="stat__value">{value === 0 ? <span className="dim">None</span> : value}</div>
      <div className="stat__foot">
        <span className="stat__hint">{hint}</span>
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
