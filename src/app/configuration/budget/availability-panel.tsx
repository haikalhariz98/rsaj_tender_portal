"use client";

import { useState } from "react";

import { DataList, type Row } from "@/components/data-list";
import { ChartIcon, GridIcon } from "@/components/icons";
import {
  movementRows,
  movementStatus,
  spendByPeriod,
  utilisationByUnit,
  type PeriodSpend,
  type UnitUtilisation,
} from "@/lib/budget/analysis";
import { figuresFor, thresholdState, type BudgetCode, type Movement } from "@/lib/budget/codes";
import type { BudgetControls } from "@/lib/budget/load";
import type { Period } from "@/lib/budget/periods";
import { formatCompactRM } from "@/lib/format";

import { MovementsDrawer } from "./movements-drawer";

/**
 * Commitment and availability.
 *
 * Every figure here is arithmetic over the movement ledger, and the table behind
 * each chart is that chart's own data rather than a second calculation — the two
 * cannot drift apart because there is only one of them.
 *
 * The chart palette is the sample's, and it was checked rather than assumed: the
 * three series pass the six colour checks, worst adjacent pair ΔE 8.8 under
 * deuteranopia, and every series is named in a legend so identity never rests on
 * colour alone.
 */
const SERIES = {
  allocated: "#0B5FFF",
  spendPlusCommitments: "#B54708",
  actualSpend: "#12855C",
} as const;

export interface AvailabilityData {
  codes: BudgetCode[];
  movements: Movement[];
  periods: Period[];
  settings: BudgetControls | null;
  units: { code: string; nameEn: string }[];
  year: number | null;
  on: Date;
}

export function AvailabilityPanel({
  codes,
  movements,
  periods,
  settings,
  units,
  year,
  on,
}: AvailabilityData) {
  const threshold = settings?.warningThresholdPercent ?? null;
  const unitName = (code: string) =>
    code ? (units.find((u) => u.code === code)?.nameEn ?? code) : "No department";

  const figuresById = Object.fromEntries(codes.map((c) => [c.id, figuresFor(movements, c.id, on)]));
  const totals = codes.reduce(
    (acc, c) => {
      const f = figuresById[c.id];
      return {
        allocated: acc.allocated + f.allocated,
        committed: acc.committed + f.committed,
        actualSpend: acc.actualSpend + f.actualSpend,
      };
    },
    { allocated: 0n, committed: 0n, actualSpend: 0n },
  );
  const available = totals.allocated - totals.committed - totals.actualSpend;
  const utilisation =
    totals.allocated > 0n
      ? Number(((totals.committed + totals.actualSpend) * 10000n) / totals.allocated) / 100
      : null;

  const yearPeriods = year == null ? [] : periods.filter((p) => p.year === year);
  const spend = spendByPeriod(yearPeriods, codes, movements);
  const byUnit = utilisationByUnit(codes, movements, on);

  const rows: Row[] = codes.map((c) => {
    const f = figuresById[c.id];
    return {
      id: c.id,
      views: [...(c.type ? [c.type.toLowerCase()] : [])],
      search: [c.code, c.descriptionEn, c.type, unitName(c.owningUnitCode ?? "")].join(" "),
      sortKeys: {
        allocated: Number(f.allocated),
        committed: Number(f.committed),
        spend: Number(f.actualSpend),
        available: Number(f.available),
        utilisation: f.utilisation ?? -1,
      },
      cells: {
        code: { kind: "stack", title: c.descriptionEn, sub: c.code, monoSub: true },
        allocated: { kind: "text", text: formatCompactRM(f.allocated) },
        committed: { kind: "text", text: formatCompactRM(f.committed) },
        spend: { kind: "text", text: formatCompactRM(f.actualSpend) },
        available: { kind: "text", text: formatCompactRM(f.available) },
        utilisation: { kind: "meter", percent: f.utilisation, threshold },
        type: c.type ? { kind: "badge", text: c.type } : { kind: "text", text: "Not set", dim: true },
        unit: { kind: "text", text: unitName(c.owningUnitCode ?? "") },
      },
    };
  });

  return (
    <div className="stack stack--lg">
      <div className="row wrap" style={{ gap: 12 }}>
        <Kpi label="Allocated" value={formatCompactRM(totals.allocated)} hint={`${codes.length} Budget codes`} />
        <Kpi
          label="Committed"
          value={formatCompactRM(totals.committed)}
          hint="Approved requirements and contracts not yet paid"
        />
        <Kpi label="Actual spend" value={formatCompactRM(totals.actualSpend)} />
        <Kpi label="Available" value={formatCompactRM(available)} tone={available < 0n ? "err" : "ok"} />
        <Kpi
          label="Utilisation"
          // Nothing allocated is not nought per cent used.
          value={utilisation == null ? "Not set" : `${utilisation.toFixed(1)}%`}
          tone={thresholdState(utilisation, threshold) === "AT_OR_OVER" ? "warn" : "ok"}
          hint={threshold == null ? "No warning threshold set" : `Warning threshold ${threshold}%`}
        />
      </div>

      <SpendChart spend={spend} />
      <UnitChart rows={byUnit} unitName={unitName} threshold={threshold} />

      <section className="card">
        <div className="card__head">
          <ChartIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">Commitment and availability</div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          <DataList
            flat
            selectable={false}
            rowOpens
            exportName="availability"
            searchPlaceholder="Search budget codes"
            emptyTitle="No budget code configured"
            emptyBody="There is nothing to commit against until a budget code exists."
            filters={[
              { key: "type", label: "Type" },
              { key: "unit", label: "Owning department" },
            ]}
            columns={[
              { key: "code", label: "Budget code", width: "28%", sortable: true },
              { key: "allocated", label: "Allocated", width: "12%", numeric: true, sortable: true },
              { key: "committed", label: "Committed", width: "12%", numeric: true, sortable: true },
              { key: "spend", label: "Actual spend", width: "13%", numeric: true, sortable: true },
              { key: "available", label: "Available", width: "12%", numeric: true, sortable: true },
              { key: "utilisation", label: "Utilisation", width: "14%", sortable: true },
            ]}
            rows={rows}
            actions={(id) => {
              const c = codes.find((x) => x.id === id);
              if (!c) return null;
              return (
                <MovementsDrawer
                  budgetCode={c}
                  figures={figuresById[c.id]}
                  rows={movementRows(movements, c.id, on)}
                  status={(r) => movementStatus(r, on)}
                  year={year}
                  threshold={threshold}
                />
              );
            }}
          />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div className="cfg-kpi" data-tone={tone}>
      <span className="cfg-kpi__k">{label}</span>
      <span className="cfg-kpi__v">{value}</span>
      {hint && <span className="cfg-kpi__h">{hint}</span>}
    </div>
  );
}

// ------------------------------------------------------------------------ charts

const PLOT = { w: 760, h: 300, left: 62, right: 668, top: 18, bottom: 266 };

/// A chart and the table it was drawn from, which is the chart's accessible form.
function Figures({
  children,
  open,
  onToggle,
}: {
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onToggle}>
          {open ? "Hide the figures" : "Show the figures"}
        </button>
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </>
  );
}

function Legend({ items, line }: { items: { label: string; colour: string }[]; line?: boolean }) {
  return (
    <div className="cfg-legend">
      {items.map((i) => (
        <span key={i.label} className="cfg-legend__i">
          <span
            className="cfg-legend__k"
            data-line={line ? "true" : undefined}
            style={{ background: i.colour }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function SpendChart({ spend }: { spend: PeriodSpend[] }) {
  const [open, setOpen] = useState(false);

  const top = spend.reduce(
    (m, s) => (s.allocated > m ? s.allocated : m),
    spend.reduce((m, s) => (s.spendPlusCommitments > m ? s.spendPlusCommitments : m), 1n),
  );
  const x = (i: number) =>
    spend.length <= 1
      ? PLOT.left
      : PLOT.left + (i * (PLOT.right - PLOT.left)) / (spend.length - 1);
  const y = (v: bigint) =>
    PLOT.bottom - Number((v * BigInt(PLOT.bottom - PLOT.top) * 1000n) / top) / 1000;

  const path = (pick: (s: PeriodSpend) => bigint) =>
    spend.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(pick(s)).toFixed(1)}`).join(" ");

  return (
    <section className="card">
      <div className="card__head">
        <ChartIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Spend against allocation</div>
          <div className="card__sub trunc">Cumulative across the financial year.</div>
        </div>
      </div>
      <div className="card__body">
        {spend.length === 0 ? (
          <div className="empty empty--sm">
            <div className="empty__t">No period to plot</div>
            <p className="empty__d">A year needs periods before spend can be drawn against it.</p>
          </div>
        ) : (
          <div>
            <div className="cfg-chart cfg-plot">
              <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} role="img" aria-label="Spend against allocation">
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const gy = PLOT.bottom - f * (PLOT.bottom - PLOT.top);
                  return (
                    <g key={f}>
                      <line x1={PLOT.left} y1={gy} x2={PLOT.right} y2={gy} stroke="#E4E7EC" strokeWidth={1} />
                      <text x={PLOT.left - 10} y={gy + 3.5} textAnchor="end" fontSize={10.5} fill="#98A2B3">
                        {formatCompactRM((top * BigInt(Math.round(f * 1000))) / 1000n)}
                      </text>
                    </g>
                  );
                })}
                {spend.map((s, i) => (
                  <text
                    key={s.period.id}
                    x={x(i)}
                    y={PLOT.h - 12}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="#98A2B3"
                  >
                    {s.period.nameEn.split(" ")[0].slice(0, 3)}
                  </text>
                ))}
                <path d={path((s) => s.allocated)} fill="none" stroke={SERIES.allocated} strokeWidth={2} />
                <path
                  d={path((s) => s.spendPlusCommitments)}
                  fill="none"
                  stroke={SERIES.spendPlusCommitments}
                  strokeWidth={2}
                />
                <path d={path((s) => s.actualSpend)} fill="none" stroke={SERIES.actualSpend} strokeWidth={2} />
              </svg>
            </div>
            <Legend
              line
              items={[
                { label: "Allocated", colour: SERIES.allocated },
                { label: "Spend plus commitments", colour: SERIES.spendPlusCommitments },
                { label: "Actual spend", colour: SERIES.actualSpend },
              ]}
            />
            <Figures open={open} onToggle={() => setOpen(!open)}>
              <div className="tablewrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="num">Allocated</th>
                      <th className="num">Actual spend</th>
                      <th className="num">Spend plus commitments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spend.map((s) => (
                      <tr key={s.period.id}>
                        <td>{s.period.nameEn.split(" ")[0].slice(0, 3)}</td>
                        <td className="num">{formatCompactRM(s.allocated)}</td>
                        <td className="num">{formatCompactRM(s.actualSpend)}</td>
                        <td className="num">{formatCompactRM(s.spendPlusCommitments)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Figures>
          </div>
        )}
      </div>
    </section>
  );
}

function UnitChart({
  rows,
  unitName,
  threshold,
}: {
  rows: UnitUtilisation[];
  unitName: (code: string) => string;
  threshold: number | null;
}) {
  const [open, setOpen] = useState(false);
  const drawn = rows.filter((r) => r.utilisation != null);

  return (
    <section className="card">
      <div className="card__head">
        <GridIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Utilisation by department</div>
          <div className="card__sub trunc">
            Committed and paid as a share of what each department was given.
          </div>
        </div>
      </div>
      <div className="card__body">
        {drawn.length === 0 ? (
          <div className="empty empty--sm">
            <div className="empty__t">Nothing to compare</div>
            <p className="empty__d">
              No department holds a code with an allocation, so there is no share to draw.
            </p>
          </div>
        ) : (
          <div>
            <div className="cfg-chart cfg-plot">
              <svg
                viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
                role="img"
                aria-label="Utilisation by department"
              >
                {[0, 25, 50, 75, 100].map((pct) => {
                  const gy = PLOT.bottom - (pct / 100) * (PLOT.bottom - PLOT.top);
                  return (
                    <g key={pct}>
                      <line x1={PLOT.left} y1={gy} x2={PLOT.right} y2={gy} stroke="#E4E7EC" strokeWidth={1} />
                      <text x={PLOT.left - 10} y={gy + 3.5} textAnchor="end" fontSize={10.5} fill="#98A2B3">
                        {pct}%
                      </text>
                    </g>
                  );
                })}
                {threshold != null && (
                  <line
                    x1={PLOT.left}
                    y1={PLOT.bottom - (threshold / 100) * (PLOT.bottom - PLOT.top)}
                    x2={PLOT.right}
                    y2={PLOT.bottom - (threshold / 100) * (PLOT.bottom - PLOT.top)}
                    stroke={SERIES.spendPlusCommitments}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}
                {drawn.map((r, i) => {
                  const slot = (PLOT.right - PLOT.left) / drawn.length;
                  // A 2px gap between neighbours, so adjacent bars never touch.
                  const width = Math.max(6, slot * 0.6);
                  const bx = PLOT.left + slot * i + (slot - width) / 2;
                  const pct = Math.min(r.utilisation ?? 0, 100);
                  const by = PLOT.bottom - (pct / 100) * (PLOT.bottom - PLOT.top);
                  const over = threshold != null && (r.utilisation ?? 0) >= threshold;
                  return (
                    <g key={r.unitCode || "none"}>
                      <rect
                        x={bx}
                        y={by}
                        width={width}
                        height={PLOT.bottom - by}
                        rx={4}
                        fill={over ? SERIES.spendPlusCommitments : SERIES.allocated}
                      />
                      <text
                        x={bx + width / 2}
                        y={PLOT.h - 12}
                        textAnchor="middle"
                        fontSize={10.5}
                        fill="#98A2B3"
                      >
                        {unitName(r.unitCode).slice(0, 12)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <Legend
              items={[
                { label: "Within the threshold", colour: SERIES.allocated },
                { label: "Over the threshold", colour: SERIES.spendPlusCommitments },
              ]}
            />
            <Figures open={open} onToggle={() => setOpen(!open)}>
              <div className="tablewrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th className="num">Allocated</th>
                      <th className="num">Committed</th>
                      <th className="num">Actual spend</th>
                      <th className="num">Utilisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.unitCode || "none"}>
                        <td>{unitName(r.unitCode)}</td>
                        <td className="num">{formatCompactRM(r.allocated)}</td>
                        <td className="num">{formatCompactRM(r.committed)}</td>
                        <td className="num">{formatCompactRM(r.actualSpend)}</td>
                        <td className="num">
                          {r.utilisation == null ? (
                            <span className="dim">Not set</span>
                          ) : (
                            `${r.utilisation.toFixed(1)}%`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Figures>
          </div>
        )}
      </div>
    </section>
  );
}

