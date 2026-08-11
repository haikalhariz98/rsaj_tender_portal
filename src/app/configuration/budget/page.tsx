import { AlertTriangle } from "@/components/icons";
import { availabilityOf, liveCommitments, totalsOn } from "@/lib/budget/availability";
import { loadBudget } from "@/lib/budget/load";
import { inForceOn } from "@/lib/effective";
import { formatSen, parseSen } from "@/lib/money";
import { loadOrganisationData } from "@/lib/organisation/load";
import { activeOn } from "@/lib/organisation/structure";
import { ORGANISATION_CODE } from "@/lib/org";

import {
  AddAllocation,
  AddCommitment,
  EditAllocation,
  EndAllocation,
  ReleaseCommitment,
} from "./editors";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function BudgetPage() {
  const on = new Date();
  const [{ allocations, commitments }, org] = await Promise.all([
    loadBudget(ORGANISATION_CODE),
    loadOrganisationData(ORGANISATION_CODE),
  ]);

  const live = allocations.filter((a) => inForceOn(a, on));
  const totals = totalsOn(allocations, commitments, on);
  const overcommitted = live.filter((a) => availabilityOf(a, commitments, on).overcommitted);

  const centres = activeOn(org.costCentres, on);
  const accounts = activeOn(org.accountCodes, on);
  const nameOf = (rows: { code: string; nameEn: string }[], code: string) =>
    rows.find((r) => r.code === code)?.nameEn ?? null;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Budget</h1>
              {overcommitted.length > 0 && (
                <span className="badge badge--warn">
                  {overcommitted.length === 1
                    ? "1 allocation overcommitted"
                    : `${overcommitted.length} allocations overcommitted`}
                </span>
              )}
            </div>
            <p className="pagehead__sub">
              Allocations, commitments and the balance a requirement is checked against.
            </p>
          </div>
        </div>
      </div>

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <Stat
          label="Allocated"
          value={live.length === 0 ? null : formatSen(totals.allocated)}
          hint={
            live.length === 0
              ? "Nobody has set an allocation. That is not the same as nothing available."
              : `Across ${live.length} allocation${live.length === 1 ? "" : "s"} in force`
          }
        />
        <Stat
          label="Committed"
          value={live.length === 0 ? null : formatSen(totals.committed)}
          hint="Money already spoken for"
        />
        <Stat
          label="Balance"
          value={live.length === 0 ? null : formatSen(totals.balance)}
          warn={totals.overcommitted}
          hint={totals.overcommitted ? "More is committed than allocated" : "Left to commit"}
        />
      </div>

      {overcommitted.length > 0 && (
        <div className="callout callout--err" style={{ marginBottom: 24 }}>
          <div>
            <strong>More is committed than allocated</strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {overcommitted.map((a) => `${a.costCentreCode} / ${a.accountCodeCode}`).join("; ")} —
              the balance shows as negative rather than as zero, because a requirement checked
              against a floor of zero would appear to pass.
            </p>
          </div>
        </div>
      )}

      <Section
        title="Allocations"
        blurb="Money set aside, against a cost centre and an account code."
        empty="No allocation has been set. A requisition checked now reports that nobody has allocated anything — which is not the same as reporting no money."
        count={allocations.length}
        action={<AddAllocation centres={centres} accounts={accounts} />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Charged to</th>
              <th>Period</th>
              <th className="right">Allocated</th>
              <th className="right">Committed</th>
              <th className="right">Balance</th>
              <th>In force</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => {
              const availability = availabilityOf(a, commitments, on);
              const current = inForceOn(a, on);
              return (
                <tr key={a.id}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t num">{a.costCentreCode}</span>
                      <span className="cellstack__s">
                        {nameOf(centres, a.costCentreCode) ?? "cost centre not in force"} ·{" "}
                        {a.accountCodeCode}
                      </span>
                    </div>
                  </td>
                  <td className="sm dim">{a.periodLabel}</td>
                  <td className="right num sm">{formatSen(availability.allocated)}</td>
                  <td className="right num sm">{formatSen(availability.committed)}</td>
                  <td className="right num sm">
                    {availability.overcommitted ? (
                      <span className="badge badge--err">{formatSen(availability.balance)}</span>
                    ) : (
                      formatSen(availability.balance)
                    )}
                  </td>
                  <td className="sm dim">
                    {current ? day(a.effectiveFrom) : `ended ${day(a.effectiveTo!)}`}
                  </td>
                  <td className="right">
                    <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <EditAllocation allocation={a} centres={centres} accounts={accounts} />
                      {current && (
                        <EndAllocation
                          id={a.id}
                          label={`${a.costCentreCode} / ${a.accountCodeCode}`}
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

      <Section
        title="Commitments"
        blurb="Money already spoken for. Released rather than deleted, so a balance can always be reconstructed."
        empty="Nothing is committed. The whole of every allocation is available."
        count={commitments.length}
        action={live.length > 0 ? <AddCommitment allocations={live} /> : undefined}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Against</th>
              <th className="right">Amount</th>
              <th>Committed</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {commitments.map((c) => {
              const allocation = allocations.find((a) => a.id === c.allocationId);
              const held = liveCommitments(commitments, c.allocationId, on).some(
                (x) => x.id === c.id,
              );
              return (
                <tr key={c.id}>
                  <td className="sm">{c.reference}</td>
                  <td className="sm dim">
                    {allocation
                      ? `${allocation.costCentreCode} / ${allocation.accountCodeCode}`
                      : "—"}
                  </td>
                  <td className="right num sm">{formatSen(parseSen(c.amount))}</td>
                  <td className="sm dim">{day(c.committedOn)}</td>
                  <td>
                    {held ? (
                      <span className="chip chip--info">Holding</span>
                    ) : (
                      <span className="chip">
                        Released {c.releasedOn ? day(c.releasedOn) : ""}
                      </span>
                    )}
                  </td>
                  <td className="right">
                    {held && <ReleaseCommitment id={c.id} reference={c.reference} />}
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

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string | null;
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
      <div className="stat__value stat__value--sm num">
        {value ?? <span className="dim">Not set</span>}
      </div>
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
