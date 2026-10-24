import Link from "next/link";

import { cx } from "./cx";
import { Disclosure } from "./disclosure";
import { Table, Td, Th, THead, Tr } from "./table";

/**
 * The Dashboard's charts (design note 0007 §8, DB-6): hand-drawn on the server, no chart library and no client script. Only
 * finished figures reach the browser. Three primitives, each followed by a Table toggle that shows the same series with exact
 * figures, which is also the chart's accessible form:
 * - `BarList`: ranked categories or the stage funnel, as HTML rows, so a row that is a link is a link a screen reader reaches
 *   (a link inside `<svg role="img">` is hidden from it);
 * - `MonthColumns`: a figure by month of the year, one or two series, every month a slot;
 * - `TrendLine`: one line through the year against an optional reference line.
 *
 * The palette is the Budget screen's: brand for the first series, amber for the second, emerald for the third. Every series is
 * named in a legend, so identity never rests on colour alone. Money arrives as sen (`bigint`); `Number` is used for geometry only.
 */

export type ChartValue = number | bigint;

const TONES = [
  { fill: "fill-brand-500", bar: "bg-brand-500" },
  { fill: "fill-amber-500", bar: "bg-amber-500" },
  { fill: "fill-emerald-500", bar: "bg-emerald-500" },
] as const;
const GRID = "stroke-line";
const AXIS = "fill-ink-3 text-[10.5px]";
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = (v: ChartValue): number => Number(v);
const sum = (vs: readonly ChartValue[]): ChartValue => (vs.length && typeof vs[0] === "bigint" ? (vs as bigint[]).reduce((a, b) => a + b, 0n) : (vs as number[]).reduce((a, b) => a + b, 0));

/// "2026-03" as an axis reads it ("Mar") and as a table reads it ("Mar 2026").
export const monthShort = (key: string): string => MONTH[Number(key.slice(5, 7)) - 1] ?? key;
export const monthLong = (key: string): string => `${monthShort(key)} ${key.slice(0, 4)}`;

/// What a chart's `aria-label` says: its title, and its highest point with the figure ("Paid by month, highest Oct 2026, RM 2.10M").
/// All nought says so rather than naming a highest.
export function summarise(title: string, points: readonly { label: string; value: ChartValue }[], format: (v: ChartValue) => string): string {
  const top = points.reduce<{ label: string; value: ChartValue } | null>((best, p) => (best == null || num(p.value) > num(best.value) ? p : best), null);
  if (top == null || num(top.value) <= 0) return `${title}, nothing yet`;
  return `${title}, highest ${top.label}, ${format(top.value)}`;
}

function Legend({ series }: { series: readonly string[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
      {series.map((name, i) => (
        <span key={name} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cx("size-2.5 shrink-0 rounded-sm", TONES[i].bar)} />
          {name}
        </span>
      ))}
    </div>
  );
}

/// The Table toggle: the chart's own series with exact figures, folded under the chart. A value not yet come reads "—", not nought.
function ChartTable({ head, series, rows, exact }: { head: string; series: readonly string[]; rows: readonly { label: string; values: readonly (ChartValue | null)[] }[]; exact: (v: ChartValue) => string }) {
  return (
    <Disclosure title="Table" className="mt-3">
      <Table minWidth={series.length > 2 ? 560 : 420}>
        <THead>
          <Th>{head}</Th>
          {series.map((s) => (
            <Th key={s} numeric>
              {s}
            </Th>
          ))}
        </THead>
        <tbody>
          {rows.map((r, i) => (
            <Tr key={`${r.label}-${i}`}>
              <Td label={head}>{r.label}</Td>
              {series.map((s, j) => (
                <Td key={s} label={s} numeric>
                  {r.values[j] == null ? "—" : exact(r.values[j]!)}
                </Td>
              ))}
            </Tr>
          ))}
        </tbody>
      </Table>
    </Disclosure>
  );
}

export interface BarRow {
  label: string;
  /// One value per series, stacked left to right (at most three).
  values: readonly ChartValue[];
  href?: string;
}

/**
 * Horizontal bars, one row per category, in the order given (rank them, or keep a funnel's order). The figure at the right is
 * the row's net total; a negative segment draws nothing but counts in that figure, never clamped. `threshold` draws a tick
 * at that value on every row.
 */
export function BarList({
  title,
  head,
  rows,
  series,
  format,
  exact = format,
  threshold,
  max,
}: {
  title: string;
  /// The table's first column heading ("Department").
  head: string;
  rows: readonly BarRow[];
  series: readonly string[];
  format: (v: ChartValue) => string;
  exact?: (v: ChartValue) => string;
  threshold?: ChartValue | null;
  /// The scale's top; by default the largest row total.
  max?: ChartValue;
}) {
  // Scaled on each row's positive segments, so an overspent row (a negative available) still fits its bar; the figure stays the net total.
  const top = Math.max(max != null ? num(max) : 0, ...rows.map((r) => r.values.reduce<number>((a, v) => a + Math.max(0, num(v)), 0)), threshold != null ? num(threshold) : 0, 1e-9);
  const pct = (v: ChartValue) => `${(Math.max(0, num(v)) / top) * 100}%`;
  return (
    <div>
      <ul aria-label={title} className="space-y-1">
        {rows.map((r, i) => {
          const body = (
            <>
              <span className="truncate text-ink-2" title={r.label}>
                {r.label}
              </span>
              <span aria-hidden="true" className="relative flex h-2.5 overflow-hidden rounded-full bg-sunken">
                {r.values.map((v, j) => (
                  <span key={j} className={cx("h-full", TONES[j].bar)} style={{ width: pct(v) }} />
                ))}
                {threshold != null && <span data-threshold className="absolute inset-y-0 w-0.5 bg-ink-2" style={{ left: pct(threshold) }} />}
              </span>
              <span className="text-right font-semibold whitespace-nowrap text-ink tabular-nums">{format(sum(r.values))}</span>
            </>
          );
          const cls = "grid grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-[13px]";
          return (
            <li key={`${r.label}-${i}`}>
              {r.href ? (
                <Link href={r.href} className={cx(cls, "transition hover:bg-brand-50/60 hover:no-underline focus-visible:outline-2 focus-visible:outline-brand-500")}>
                  {body}
                </Link>
              ) : (
                <div className={cls}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      <Legend series={series} />
      <ChartTable head={head} series={series} rows={rows} exact={exact} />
    </div>
  );
}

const PLOT = { w: 760, h: 260, left: 62, right: 744, top: 14, bottom: 226 };

/// A linear scale from the values to the plot's height, always including nought, so a negative value draws down from the axis.
function scale(values: readonly number[]) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => PLOT.bottom - ((v - lo) / span) * (PLOT.bottom - PLOT.top);
  return { lo, hi, y };
}

function Gridlines({ lo, hi, y, format, asValue }: { lo: number; hi: number; y: (v: number) => number; format: (v: ChartValue) => string; asValue: (v: number) => ChartValue }) {
  const ticks = [...new Set([lo, 0, hi / 2, hi])];
  return (
    <>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PLOT.left} y1={y(v)} x2={PLOT.right} y2={y(v)} className={GRID} strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={PLOT.left - 10} y={y(v) + 3.5} textAnchor="end" className={AXIS}>
            {format(asValue(v))}
          </text>
        </g>
      ))}
    </>
  );
}

/// Turns a geometry number back into the series' kind for an axis label: sen stay whole sen.
const kindOf = (sample: ChartValue | undefined) => (v: number): ChartValue => (typeof sample === "bigint" ? BigInt(Math.round(v)) : v);

/**
 * Columns by month: one or two series side by side, every month of the year a slot (`monthSlots`), so an empty month reads as
 * a gap. Each column carries its exact figure in a `<title>`.
 */
export function MonthColumns({
  title,
  months,
  series,
  format,
  exact = format,
}: {
  title: string;
  /// One entry per month slot ("2026-03"), one value per series.
  months: readonly { month: string; values: readonly ChartValue[] }[];
  series: readonly string[];
  format: (v: ChartValue) => string;
  exact?: (v: ChartValue) => string;
}) {
  const all = months.flatMap((m) => m.values.map(num));
  const { lo, hi, y } = scale(all);
  const slot = (PLOT.right - PLOT.left) / Math.max(1, months.length);
  const width = Math.max(4, (slot * 0.7) / Math.max(1, series.length));
  const peak = (j: number) => months.map((m) => ({ label: monthLong(m.month), value: m.values[j] ?? 0 }));
  const label = series.length > 1 ? `${title}: ${series.map((s, j) => summarise(s, peak(j), format)).join("; ")}` : summarise(title, peak(0), format);
  return (
    <div>
      <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} role="img" aria-label={label} className="block h-auto w-full">
        <Gridlines lo={lo} hi={hi} y={y} format={format} asValue={kindOf(months[0]?.values[0])} />
        {months.map((m, i) => {
          const x0 = PLOT.left + slot * i + (slot - width * series.length) / 2;
          return (
            <g key={m.month} data-slot={m.month}>
              {series.map((s, j) => {
                const v = m.values[j] ?? 0;
                const top = Math.min(y(num(v)), y(0));
                return (
                  <rect key={s} x={x0 + j * width} y={top} width={width - 1} height={Math.abs(y(num(v)) - y(0))} rx={2} className={TONES[j].fill}>
                    <title>{`${monthLong(m.month)} · ${s}: ${exact(v)}`}</title>
                  </rect>
                );
              })}
              <text x={PLOT.left + slot * i + slot / 2} y={PLOT.h - 12} textAnchor="middle" className={AXIS}>
                {monthShort(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      <ChartTable head="Month" series={series} rows={months.map((m) => ({ label: monthLong(m.month), values: m.values }))} exact={exact} />
    </div>
  );
}

/**
 * One line through the periods of the year against an optional reference line (cumulative spent and committed against the
 * allocation). A point with no value (a period not yet come) is not drawn, and the line stops there.
 */
export function TrendLine({
  title,
  points,
  series,
  format,
  exact = format,
}: {
  title: string;
  /// Per period: its label, the line's value (null: not yet), and the reference line's.
  points: readonly { label: string; value: ChartValue | null; reference?: ChartValue }[];
  /// The line's name, then the reference's.
  series: readonly [string] | readonly [string, string];
  format: (v: ChartValue) => string;
  exact?: (v: ChartValue) => string;
}) {
  const { lo, hi, y } = scale(points.flatMap((p) => [p.value, p.reference].filter((v): v is ChartValue => v != null).map(num)));
  const x = (i: number) => (points.length <= 1 ? PLOT.left : PLOT.left + (i * (PLOT.right - PLOT.left)) / (points.length - 1));
  const path = (pick: (p: (typeof points)[number]) => ChartValue | null | undefined) =>
    points
      .map((p, i) => [i, pick(p)] as const)
      .filter((e): e is readonly [number, ChartValue] => e[1] != null)
      .map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(num(v)).toFixed(1)}`)
      .join(" ");
  const drawn = points.filter((p) => p.value != null);
  const last = drawn[drawn.length - 1];
  const label = last ? `${title}, ${last.label}, ${format(last.value!)}` : `${title}, nothing yet`;
  const sample = points.find((p) => p.value != null)?.value ?? points[0]?.reference;
  return (
    <div>
      <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} role="img" aria-label={label} className="block h-auto w-full">
        <Gridlines lo={lo} hi={hi} y={y} format={format} asValue={kindOf(sample ?? undefined)} />
        {points.map((p, i) => (
          <text key={`${p.label}-${i}`} x={x(i)} y={PLOT.h - 12} textAnchor="middle" className={AXIS}>
            {p.label}
          </text>
        ))}
        {series[1] && <path data-reference d={path((p) => p.reference)} fill="none" className="stroke-ink-4" strokeWidth={1.5} strokeDasharray="4 4" />}
        <path data-line d={path((p) => p.value)} fill="none" className="stroke-brand-600" strokeWidth={2} />
      </svg>
      {series[1] && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 shrink-0 rounded-full bg-brand-600" />
            {series[0]}
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 shrink-0 rounded-full bg-ink-4" />
            {series[1]}
          </span>
        </div>
      )}
      <ChartTable
        head="Period"
        series={series}
        rows={points.map((p) => ({ label: p.label, values: series[1] ? [p.value, p.reference ?? null] : [p.value] }))}
        exact={exact}
      />
    </div>
  );
}
