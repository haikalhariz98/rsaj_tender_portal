"use client";

import { useState, useTransition } from "react";
import { END_DAY_LABEL } from "@/lib/effective-text";

import { DataList, type Row } from "@/components/data-list";
import { CalendarIcon, CheckIcon, XIcon } from "@/components/icons";
import {
  periodStatus,
  periodsIn,
  summariseYear,
  yearsIn,
  type Period,
} from "@/lib/budget/periods";

import { RecordEditor } from "@/components/record-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/field";

import { changePeriod, setRollForward } from "./actions";

/**
 * Periods, in the sample's shape: a tile per year over a table of that year's
 * periods, with the carry-forward switch in the table card's head.
 *
 * Every figure on the tiles is counted from the periods themselves. "1 of 12 open"
 * and the progress bar are not stored, and the bar measures what is CLOSED — a year
 * with nothing opened yet and a year with everything shut are opposite ends, and
 * counting the open ones would put both at nothing.
 */
export function PeriodsPanel({
  periods,
  rollForwardByYear,
  year,
  onYear,
}: {
  periods: Period[];
  rollForwardByYear: Record<number, boolean | null>;
  year: number | null;
  onYear: (year: number) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const years = yearsIn(periods);

  if (years.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader icon={<CalendarIcon size={17} />} title="Periods" />
        <EmptyState size="sm" title="No period configured">
          A budget year is divided into periods, and a posting is made into one. Until
          some exist there is nothing to open or close.
        </EmptyState>
      </Card>
    );
  }

  const selected = year != null && years.includes(year) ? year : years[years.length - 1];
  const rollForward = rollForwardByYear[selected] ?? null;

  const act = (run: () => Promise<{ ok: boolean; message?: string }>) => {
    setProblem(null);
    startTransition(async () => {
      const result = await run();
      if (!result.ok) setProblem(result.message ?? "That change was not saved.");
    });
  };

  const rows: Row[] = periodsIn(periods, selected).map((p) => {
    const status = periodStatus(p);
    return {
      id: p.id,
      search: [p.code, p.nameEn].join(" "),
      cells: {
        period: { kind: "text", text: p.code },
        name: { kind: "text", text: p.nameEn },
        from: { kind: "text", text: day(p.startsOn) },
        to: { kind: "text", text: day(p.endsOn) },
        status:
          status === "OPEN"
            ? { kind: "chip", text: "Open", tone: "brand" }
            : status === "CLOSED"
              ? { kind: "chip", text: "Closed" }
              : // Never opened is its own state. Rendering it as closed would claim
                // somebody shut it.
                { kind: "chip", text: "Not yet open" },
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {years.map((y) => {
          const s = summariseYear(periods, y);
          const chosen = y === selected;
          return (
            <button
              key={y}
              type="button"
              aria-pressed={chosen}
              onClick={() => onYear(y)}
              className={cx(
                "min-w-0 rounded-card border bg-surface p-4 text-left shadow-card transition hover:shadow-pop",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                chosen ? "border-brand-300 ring-2 ring-brand-100" : "border-line/70",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold tracking-tight text-ink tabular-nums">{y}</span>
                <span className="flex-1" />
                <Badge dot tone={s.status === "OPEN" ? "ok" : "neutral"} title={YEAR_LABEL[s.status]}>
                  {YEAR_LABEL[s.status]}
                </Badge>
              </div>
              <div className="mt-1.5 text-[12.5px] text-ink-3 tabular-nums">
                {s.open} of {s.total} open
              </div>
              <div
                className="relative mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={s.closedPercent == null ? undefined : Math.round(s.closedPercent)}
                aria-label="Progress"
              >
                <span
                  className={cx(
                    "absolute inset-y-0 left-0 rounded-full",
                    s.closedPercent === 100 ? "bg-emerald-500" : "bg-brand-500",
                  )}
                  style={{ width: `${s.closedPercent ?? 0}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarIcon size={17} />}
          title={`${selected} · Periods`}
          subtitle="Unspent allocation carried into the next year, up to the cap."
          actions={
            <Switch
              checked={rollForward === true}
              disabled={pending}
              onChange={(e) => act(() => setRollForward(selected, e.target.checked))}
              label="Roll unspent balance forward"
              // Nobody has decided. Carrying nothing forward is a policy too.
              description={rollForward == null ? `Not set for ${selected}` : undefined}
            />
          }
          divided={false}
        />
        {problem && (
          <Callout tone="err" className="mx-5 mb-3 sm:mx-6">
            {problem}
          </Callout>
        )}
        <DataList
          flat
          selectable={false}
          searchable={false}
          exportName={`periods-${selected}`}
          emptyTitle="No period in this year"
          emptyBody="Nothing can be posted into a year with no periods."
          columns={[
            { key: "period", label: "Period", width: "88px", nowrap: true, sortable: true, mobile: "primary" },
            { key: "name", label: "Name", sortable: true, mobile: "meta" },
            { key: "from", label: "From", width: "128px", nowrap: true, sortable: true, mobile: "meta" },
            { key: "to", label: END_DAY_LABEL, width: "176px", nowrap: true, sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "140px", sortable: true, mobile: "meta" },
          ]}
          rows={rows}
          actions={(id) => {
            const p = periodsIn(periods, selected).find((x) => x.id === id);
            if (!p) return null;
            const status = periodStatus(p);
            const label = `${p.code} ${p.nameEn}`;
            return <PeriodChange id={p.id} label={label} status={status} />;
          }}
        />
      </Card>
    </div>
  );
}

const YEAR_LABEL = {
  OPEN: "Open",
  CLOSED: "Closed",
  IN_PLANNING: "In planning",
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// "01 Jan 2026", as the sample writes a date.
function day(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Close, open or reopen one period. Each asks why: closing stops postings into the
 * month, reopening undoes a decision somebody took.
 */
function PeriodChange({
  id,
  label,
  status,
}: {
  id: string;
  label: string;
  status: "OPEN" | "CLOSED" | "NOT_YET_OPEN";
}) {
  const closing = status === "OPEN";
  const verb = closing ? "Close" : status === "CLOSED" ? "Reopen" : "Open";
  return (
    <RecordEditor
      title={`${verb} ${label}`}
      description={
        closing
          ? "Nothing more may be posted into it once it is closed."
          : status === "CLOSED"
            ? "It was closed on purpose. Reopening lets postings into it again."
            : "Postings into it are allowed once it is open."
      }
      fields={[
        { kind: "hidden", name: "id" },
        { kind: "hidden", name: "open" },
      ]}
      values={{ id, open: closing ? "" : "yes" }}
      action={changePeriod}
      submitLabel={`${verb} period`}
      destructive={closing || status === "CLOSED" ? { reasonLabel: `Why is it being ${closing ? "closed" : "reopened"}?` } : undefined}
      reason={closing || status === "CLOSED" ? undefined : { label: "Why is it being opened?" }}
      trigger={{
        label: `${verb} period`,
        iconOnly: closing ? <XIcon size={15} /> : <CheckIcon size={15} />,
      }}
      size="sm"
    />
  );
}
