"use client";

import { useState } from "react";

import { DataList, type Row } from "@/components/data-list";
import {
  AlertTriangle,
  ChartIcon,
  CheckIcon,
  ClockIcon,
  GridIcon,
  ScaleIcon,
  ShieldIcon,
} from "@/components/icons";
import type { Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/feedback";
import { Stat } from "@/components/ui/stat";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
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
 * The chart palette is the product's own: brand for what was allocated, amber for
 * what is spoken for, emerald for what has been paid. Every series is named in a
 * legend, so identity never rests on colour alone.
 */
const SERIES = {
  allocated: { stroke: "stroke-brand-600", swatch: "bg-brand-600", fill: "fill-brand-500", bar: "bg-brand-500" },
  spendPlusCommitments: {
    stroke: "stroke-amber-600",
    swatch: "bg-amber-600",
    fill: "fill-amber-500",
    bar: "bg-amber-500",
  },
  actualSpend: { stroke: "stroke-emerald-600", swatch: "bg-emerald-600", fill: "fill-emerald-500", bar: "bg-emerald-500" },
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

  const utilisationOver = thresholdState(utilisation, threshold) === "AT_OR_OVER";

  return (
    <div className="flex flex-col gap-6">
      {/* Five tiles: a full row of five on wide screens, pairs below that with the last
          one spanning, so the row is always filled edge to edge. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Allocated"
          icon={<ScaleIcon size={17} />}
          value={formatCompactRM(totals.allocated)}
          hint={`${codes.length} Budget codes`}
        />
        <Tile
          label="Committed"
          icon={<ClockIcon size={17} />}
          value={formatCompactRM(totals.committed)}
          hint="Approved requirements and contracts not yet paid"
        />
        <Tile label="Actual spend" icon={<CheckIcon size={17} />} value={formatCompactRM(totals.actualSpend)} />
        <Tile
          label="Available"
          icon={available < 0n ? <AlertTriangle size={17} /> : <ShieldIcon size={17} />}
          value={formatCompactRM(available)}
          tone={available < 0n ? "err" : "ok"}
        />
        <Tile
          label="Utilisation"
          icon={<ChartIcon size={17} />}
          // Nothing allocated is not nought per cent used.
          value={utilisation == null ? "Not set" : `${utilisation.toFixed(1)}%`}
          tone={utilisationOver ? "warn" : "ok"}
          hint={threshold == null ? "No warning threshold set" : `Warning threshold ${threshold}%`}
          className="sm:col-span-2 xl:col-span-1"
        />
      </div>

      <SpendChart spend={spend} />
      <UnitChart rows={byUnit} unitName={unitName} threshold={threshold} />

      <Card className="overflow-hidden">
        <CardHeader icon={<ChartIcon size={17} />} title="Commitment and availability" divided={false} />
        <DataList stackBelow="xl"
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
            { key: "code", label: "Budget code", sortable: true, mobile: "primary" },
            { key: "allocated", label: "Allocated", width: "120px", numeric: true, sortable: true, mobile: "meta" },
            { key: "committed", label: "Committed", width: "120px", numeric: true, sortable: true, hideBelow: "md", mobile: "meta" },
            { key: "spend", label: "Actual spend", width: "120px", numeric: true, sortable: true, hideBelow: "md", mobile: "meta" },
            { key: "available", label: "Available", width: "120px", numeric: true, sortable: true, mobile: "meta" },
            // A meter needs room for its bar and its figure: pixels, not a share.
            { key: "utilisation", label: "Utilisation", width: "140px", sortable: true, mobile: "meta" },
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
      </Card>
    </div>
  );
}

const VALUE_TONE: Partial<Record<Tone, string>> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  err: "text-rose-700",
};

/// A headline figure whose colour carries its state: green in hand, amber past the
/// threshold, red overdrawn.
function Tile({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "ok" | "warn" | "err";
  className?: string;
}) {
  return (
    <Stat
      label={label}
      icon={icon}
      tone={tone ?? "brand"}
      value={
        <span title={value} className={tone ? VALUE_TONE[tone] : undefined}>
          {value}
        </span>
      }
      hint={hint}
      className={className}
    />
  );
}

// ------------------------------------------------------------------------ charts

const PLOT = { w: 760, h: 300, left: 62, right: 668, top: 18, bottom: 266 };

/// Grid lines and axis labels, the same on both charts.
const GRID = "stroke-line";
const AXIS = "fill-ink-3 text-[10.5px]";

/// The show/hide control under a chart. The table it reveals is the chart's
/// accessible form, and sits flush in the card below it.
function FiguresToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-3">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
        {open ? "Hide the figures" : "Show the figures"}
      </Button>
    </div>
  );
}

function Legend({
  items,
  line,
}: {
  items: { label: string; swatch: string }[];
  line?: boolean;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cx("shrink-0", line ? "h-0.5 w-4 rounded-full" : "size-2.5 rounded-sm", i.swatch)}
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
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ChartIcon size={17} />}
        title="Spend against allocation"
        subtitle="Cumulative across the financial year."
      />
      {spend.length === 0 ? (
        <EmptyState size="sm" title="No period to plot">
          A year needs periods before spend can be drawn against it.
        </EmptyState>
      ) : (
        <>
          <CardBody>
            <svg
              viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
              role="img"
              aria-label="Spend against allocation"
              className="block h-auto w-full"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const gy = PLOT.bottom - f * (PLOT.bottom - PLOT.top);
                return (
                  <g key={f}>
                    <line x1={PLOT.left} y1={gy} x2={PLOT.right} y2={gy} className={GRID} strokeWidth={1} />
                    <text x={PLOT.left - 10} y={gy + 3.5} textAnchor="end" className={AXIS}>
                      {formatCompactRM((top * BigInt(Math.round(f * 1000))) / 1000n)}
                    </text>
                  </g>
                );
              })}
              {spend.map((s, i) => (
                <text key={s.period.id} x={x(i)} y={PLOT.h - 12} textAnchor="middle" className={AXIS}>
                  {s.period.nameEn.split(" ")[0].slice(0, 3)}
                </text>
              ))}
              <path d={path((s) => s.allocated)} fill="none" className={SERIES.allocated.stroke} strokeWidth={2} />
              <path
                d={path((s) => s.spendPlusCommitments)}
                fill="none"
                className={SERIES.spendPlusCommitments.stroke}
                strokeWidth={2}
              />
              <path d={path((s) => s.actualSpend)} fill="none" className={SERIES.actualSpend.stroke} strokeWidth={2} />
            </svg>
            <Legend
              line
              items={[
                { label: "Allocated", swatch: SERIES.allocated.swatch },
                { label: "Spend plus commitments", swatch: SERIES.spendPlusCommitments.swatch },
                { label: "Actual spend", swatch: SERIES.actualSpend.swatch },
              ]}
            />
            <FiguresToggle open={open} onToggle={() => setOpen(!open)} />
          </CardBody>
          {open && (
            <Table minWidth={480}>
              <THead>
                <Th>Period</Th>
                <Th numeric>Allocated</Th>
                <Th numeric>Actual spend</Th>
                <Th numeric>Spend plus commitments</Th>
              </THead>
              <tbody>
                {spend.map((s) => (
                  <Tr key={s.period.id}>
                    <Td label="Period">{s.period.nameEn.split(" ")[0].slice(0, 3)}</Td>
                    <Td label="Allocated" numeric>{formatCompactRM(s.allocated)}</Td>
                    <Td label="Actual spend" numeric>{formatCompactRM(s.actualSpend)}</Td>
                    <Td label="Spend plus commitments" numeric>{formatCompactRM(s.spendPlusCommitments)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Card>
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
    <Card className="overflow-hidden">
      <CardHeader
        icon={<GridIcon size={17} />}
        title="Utilisation by department"
        subtitle="Committed and paid, by department"
      />
      {drawn.length === 0 ? (
        <EmptyState size="sm" title="Nothing to compare">
          No department holds a code with an allocation, so there is no share to draw.
        </EmptyState>
      ) : (
        <>
          <CardBody>
            <svg
              viewBox={`0 0 ${PLOT.w} ${PLOT.h}`}
              role="img"
              aria-label="Utilisation by department"
              className="block h-auto w-full"
            >
              {[0, 25, 50, 75, 100].map((pct) => {
                const gy = PLOT.bottom - (pct / 100) * (PLOT.bottom - PLOT.top);
                return (
                  <g key={pct}>
                    <line x1={PLOT.left} y1={gy} x2={PLOT.right} y2={gy} className={GRID} strokeWidth={1} />
                    <text x={PLOT.left - 10} y={gy + 3.5} textAnchor="end" className={AXIS}>
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
                  className={SERIES.spendPlusCommitments.stroke}
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
                      className={over ? SERIES.spendPlusCommitments.fill : SERIES.allocated.fill}
                    />
                    <text x={bx + width / 2} y={PLOT.h - 12} textAnchor="middle" className={AXIS}>
                      {unitName(r.unitCode).slice(0, 12)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <Legend
              items={[
                { label: "Within the threshold", swatch: SERIES.allocated.bar },
                { label: "Over the threshold", swatch: SERIES.spendPlusCommitments.bar },
              ]}
            />
            <FiguresToggle open={open} onToggle={() => setOpen(!open)} />
          </CardBody>
          {open && (
            <Table minWidth={560}>
              <THead>
                <Th>Department</Th>
                <Th numeric>Allocated</Th>
                <Th numeric>Committed</Th>
                <Th numeric>Actual spend</Th>
                <Th numeric>Utilisation</Th>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.unitCode || "none"}>
                    <Td label="Department" className="truncate" title={unitName(r.unitCode)}>
                      {unitName(r.unitCode)}
                    </Td>
                    <Td label="Allocated" numeric>{formatCompactRM(r.allocated)}</Td>
                    <Td label="Committed" numeric>{formatCompactRM(r.committed)}</Td>
                    <Td label="Actual spend" numeric>{formatCompactRM(r.actualSpend)}</Td>
                    <Td label="Utilisation" numeric>
                      {r.utilisation == null ? (
                        <span className="text-ink-3">Not set</span>
                      ) : (
                        `${r.utilisation.toFixed(1)}%`
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
}
