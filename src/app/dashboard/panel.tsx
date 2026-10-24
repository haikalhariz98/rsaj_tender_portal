import Form from "next/form";

import { ChartIcon } from "@/components/icons";
import { BarList, MonthColumns, TrendLine } from "@/components/ui/chart";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/stat";
import { insightsHref, type InsightsQuery } from "@/lib/insights/query";

import { money as compact, moneyExact, type ChartBody, type TabView } from "./view";

const count = (v: number | bigint) => String(v);
const percent = (v: number | bigint) => `${Number(Number(v).toFixed(1))}%`;

function Chart({ body, title, q, canSetYear }: { body: ChartBody; title: string; q: InsightsQuery; canSetYear: boolean }) {
  const reset = <ButtonLink href={insightsHref({ tab: q.tab, year: q.year })} variant="ghost" size="sm">Reset filters</ButtonLink>;
  switch (body.kind) {
    case "unset":
      return (
        <div className="py-6 text-center text-[14px] text-ink-2">
          <p className="font-semibold">Financial year not set</p>
          {canSetYear && <ButtonLink href="/configuration/budget?tab=periods" variant="ghost" size="sm" className="mt-2">Set budget periods</ButtonLink>}
        </div>
      );
    case "bars":
      return body.rows.length === 0 ? (
        <div className="py-6 text-center text-[14px] text-ink-2">
          <p className="mb-2 font-semibold">Nothing for these filters</p>
          {reset}
        </div>
      ) : (
        <BarList title={title} head={body.head} rows={body.rows} series={body.series} format={body.unit ? percent : body.money ? compact : count} exact={body.unit ? percent : body.money ? moneyExact : count} threshold={body.threshold} max={body.unit ? 100 : undefined} />
      );
    case "months":
      return <MonthColumns title={title} months={body.months} series={body.series} format={body.money ? compact : count} exact={body.money ? moneyExact : count} />;
    case "trend":
      return <TrendLine title={title} points={body.points} series={body.series} format={compact} exact={moneyExact} />;
  }
}

/// One tab's tiles and charts. Only finished figures arrive here.
export function Panel({ view, q, canSetYear }: { view: TabView; q: InsightsQuery; canSetYear: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
        {view.tiles.map((t) => (
          <Stat key={t.label} label={t.label} value={t.value} hint={t.hint} href={t.href} tone={t.tone} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {view.charts.map((c) => (
          <Card key={c.title}>
            <CardHeader icon={<ChartIcon size={17} />} title={c.title} />
            <CardBody>
              <Chart body={c.body} title={c.title} q={q} canSetYear={canSetYear} />
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

export interface Choice {
  value: string;
  label: string;
}

/// Year, Department and the tab's one extra filter, as a GET form so the view lives in the address.
export function Filters({ q, years, units, extra }: { q: InsightsQuery; years: Choice[]; units: Choice[]; extra: { name: "route" | "method"; label: string; all: string; choices: Choice[]; value: string | null } | null }) {
  return (
    <Form action="/dashboard" className="mb-6 flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value={q.tab} />
      {years.length === 0 ? (
        <span className="rounded-full border border-line px-3 py-2 text-[13px] text-ink-2">Financial year not set</span>
      ) : (
        <Select variant="chip" searchable={false} name="year" aria-label="Financial year" defaultValue={q.year == null ? "" : String(q.year)}>
          {years.map((y) => (
            <option key={y.value} value={y.value}>{y.label}</option>
          ))}
        </Select>
      )}
      <Select variant="chip" name="unit" aria-label="Department" defaultValue={q.unit ?? ""}>
        <option value="">All departments</option>
        {units.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </Select>
      {extra && (
        <Select variant="chip" name={extra.name} aria-label={extra.label} defaultValue={extra.value ?? ""}>
          <option value="">{extra.all}</option>
          {extra.choices.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </Select>
      )}
      <Button type="submit" variant="secondary" size="sm">Apply</Button>
      <ButtonLink href={insightsHref({ tab: q.tab })} variant="ghost" size="sm">Reset</ButtonLink>
    </Form>
  );
}
