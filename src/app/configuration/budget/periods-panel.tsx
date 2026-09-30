"use client";

import { useState, useTransition } from "react";

import { DataList, type Row } from "@/components/data-list";
import { AlertTriangle, CalendarIcon, CheckIcon, XIcon } from "@/components/icons";
import {
  periodStatus,
  periodsIn,
  summariseYear,
  yearsIn,
  type Period,
} from "@/lib/budget/periods";

import { RecordEditor } from "@/components/record-editor";
import { iconButtonClass } from "@/components/ui/button";

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
      <section className="card">
        <div className="card__head">
          <CalendarIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">Periods</div>
          </div>
        </div>
        <div className="card__body">
          <div className="empty">
            <div className="empty__t">No period configured</div>
            <p className="empty__d">
              A budget year is divided into periods, and a posting is made into one. Until
              some exist there is nothing to open or close.
            </p>
          </div>
        </div>
      </section>
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
    <div className="stack stack--lg">
      <div className="grid g4" style={{ gap: 16 }}>
        {years.map((y) => {
          const s = summariseYear(periods, y);
          return (
            <div
              key={y}
              className={`card${y === selected ? " card--accent" : ""}`}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              onClick={() => onYear(y)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onYear(y);
              }}
            >
              <div className="card__body card__body--tight">
                <div className="row" style={{ gap: 8 }}>
                  <span className="h3">{y}</span>
                  <div className="spacer" />
                  <span
                    className={`chip${s.status === "OPEN" ? " chip--ok" : ""}`}
                    title={YEAR_LABEL[s.status]}
                  >
                    <span className={`dot${s.status === "OPEN" ? " dot--ok" : ""}`} />
                    <span className="badge__t">{YEAR_LABEL[s.status]}</span>
                  </span>
                </div>
                <div className="xs dim" style={{ marginTop: 6 }}>
                  {s.open} of {s.total} open
                </div>
                <div style={{ marginTop: 10 }}>
                  <div
                    className="bar bar--sm"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={s.closedPercent == null ? undefined : Math.round(s.closedPercent)}
                    aria-label="Progress"
                  >
                    <div
                      className={`bar__fill${s.closedPercent === 100 ? " bar__fill--ok" : ""}`}
                      style={{ width: `${s.closedPercent ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="card__head">
          <CalendarIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">{selected} · Periods</div>
            <div className="card__sub trunc">
              Unspent allocation carried into the next year, up to the cap.
            </div>
          </div>
          <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
            <div className="row" style={{ gap: 12 }}>
              <label className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={rollForward === true}
                  disabled={pending}
                  onChange={(e) => act(() => setRollForward(selected, e.target.checked))}
                />
                <span className="switch__track">
                  <span className="switch__knob" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="check__txt">Roll unspent balance forward</span>
                  {rollForward == null && (
                    // Nobody has decided. Carrying nothing forward is a policy too.
                    <span className="check__hint">Not set for {selected}</span>
                  )}
                </span>
              </label>
            </div>
          </div>
        </div>
        <div className="card__body card__body--flush">
          {problem && (
            <div className="callout callout--err" style={{ margin: "0 14px 10px" }}>
              <span className="callout__ico">
                <AlertTriangle size={17} />
              </span>
              <div className="grow">
                <span className="sm">{problem}</span>
              </div>
            </div>
          )}
          <DataList
            flat
            selectable={false}
            searchable={false}
            exportName={`periods-${selected}`}
            emptyTitle="No period in this year"
            emptyBody="Nothing can be posted into a year with no periods."
            columns={[
              { key: "period", label: "Period", width: "14%", sortable: true },
              { key: "name", label: "Name", width: "25%", sortable: true },
              { key: "from", label: "From", width: "16%", sortable: true },
              { key: "to", label: "To", width: "16%", sortable: true },
              { key: "status", label: "Status", width: "19%", sortable: true },
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
        </div>
      </section>
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
        iconOnly: closing ? <XIcon size={14} /> : <CheckIcon size={14} />,
        className: iconButtonClass("sm"),
      }}
      size="sm"
    />
  );
}
