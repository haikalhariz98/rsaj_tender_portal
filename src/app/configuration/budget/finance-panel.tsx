"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useState, useTransition, type ReactNode } from "react";

import { DataList, type Row } from "@/components/data-list";
import { AlertTriangle, CheckIcon, ChartIcon, GlobeIcon, SaveIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { figuresFor, type BudgetCode, type Movement } from "@/lib/budget/codes";
import { ago, lineFor, outstanding, summarise, syncReadiness } from "@/lib/budget/finance";
import type { FinanceData } from "@/lib/budget/load";
import { formatCompactRM } from "@/lib/format";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";

import { acceptPortalFigure, saveFinanceSettings, synchroniseNow } from "./actions";

const DIRECTION_LABEL: Record<string, string> = {
  two_way: "Two way",
  portal_to_finance: "Portal to Finance & Operations",
  finance_to_portal: "Finance & Operations to portal",
};

const SCHEDULE_LABEL: Record<string, string> = {
  hourly: "Every hour",
  nightly: "Nightly",
  weekly: "Weekly",
  manual: "Manual only",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const stamp = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ` +
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Finance & Operations.
 *
 * What the portal holds, what the finance system holds, and where they disagree.
 * The difference on each row is the two figures subtracted from their full amounts
 * — never from the abbreviated ones on screen, which would report a gap of fifty
 * thousand where the real one is forty-seven.
 */
export function FinancePanel({
  finance,
  codes,
  movements,
  on,
}: {
  finance: FinanceData;
  codes: BudgetCode[];
  movements: Movement[];
  on: Date;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ ok: false });
  const [dirty, setDirty] = useState(false);

  const tolerance = finance.varianceTolerance ? parseSen(finance.varianceTolerance) : null;
  const lines = finance.variances.map((v) => lineFor(v, tolerance, on));
  const live = outstanding(lines);
  const { gap } = summarise(lines);

  const portalTotals = codes.reduce(
    (acc, c) => {
      const f = figuresFor(movements, c.id, on);
      return { allocated: acc.allocated + f.allocated, committed: acc.committed + f.committed };
    },
    { allocated: 0n, committed: 0n },
  );

  const readiness = syncReadiness(finance.direction);
  const lastRun = finance.lastRun;

  const act = (run: () => Promise<FormState>) => {
    startTransition(async () => {
      const result = await run();
      setState(result);
    });
  };

  const rows: Row[] = lines.map((l) => ({
    id: l.variance.id,
    views: [...(l.settled ? ["settled"] : ["outstanding"])],
    search: [l.variance.budgetCodeCode, l.variance.accountCode, l.variance.compares].join(" "),
    sortKeys: { difference: Number(l.difference), lastSeen: l.variance.lastSeenAt.getTime() },
    cells: {
      code: { kind: "stack", title: l.variance.budgetCodeCode, sub: l.variance.compares },
      account: { kind: "text", text: l.variance.accountCode || "—", dim: !l.variance.accountCode },
      compares: { kind: "badge", text: l.variance.compares || "Not said" },
      portal: { kind: "text", text: formatCompactRM(l.portal) },
      finance: { kind: "text", text: formatCompactRM(l.finance) },
      // Red means the two differ, not that one went down — the sample paints both
      // directions the same way and it is right to: either is a disagreement.
      difference: { kind: "text", text: formatCompactRM(l.difference) },
      reason: { kind: "text", text: l.variance.reason || "Nobody has said", dim: !l.variance.reason },
      lastSeen: { kind: "text", text: ago(l.variance.lastSeenAt, on) ?? "—" },
    },
  }));

  return (
    <div className="stack stack--lg">
      <div className="grid g2" style={{ gap: 16 }}>
        <HoldingCard
          title="Held in the portal"
          accent
          blurb="Allocations, revisions, transfers, commitments and the availability check."
          rows={[
            ["Allocated", formatSen(portalTotals.allocated)],
            ["Committed", formatSen(portalTotals.committed)],
            ["Budget codes", String(codes.length)],
          ]}
        />
        <HoldingCard
          title="Held in Finance & Operations"
          blurb="The ledger of record for what has actually been paid."
          rows={[
            [
              "Codes that differ",
              live.length === 0 ? "None" : String(live.length),
            ],
            ["Apart by", live.length === 0 ? "—" : formatSen(gap)],
            [
              "Last seen",
              finance.variances.length === 0
                ? "Never compared"
                : (ago(finance.variances[0].lastSeenAt, on) ?? "—"),
            ],
          ]}
        />
      </div>

      <section className="card">
        <div className="card__head">
          <ChartIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">Last synchronised</div>
            <div className="card__sub trunc">
              {/* A run that never happened is not a time. */}
              {lastRun ? stamp(lastRun.startedAt) : "Never"}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={pending}
              onClick={() => act(synchroniseNow)}
            >
              <GlobeIcon size={15} />
              Synchronise now
            </button>
          </div>
        </div>
        <div className="card__body">
          <div className="row wrap" style={{ gap: 12 }}>
            <Kpi
              label="Direction"
              value={finance.direction ? (DIRECTION_LABEL[finance.direction] ?? finance.direction) : "Not set"}
              hint={finance.schedule ? (SCHEDULE_LABEL[finance.schedule] ?? finance.schedule) : undefined}
            />
            <Kpi label="Records in" value={lastRun ? String(lastRun.recordsIn) : "—"} />
            <Kpi label="Records out" value={lastRun ? String(lastRun.recordsOut) : "—"} />
            <Kpi
              label="Variances"
              value={String(live.length)}
              hint={live.length === 0 ? undefined : formatCompactRM(gap)}
              tone={live.length === 0 ? undefined : "warn"}
            />
            <Kpi
              label="Duration"
              value={
                lastRun?.finishedAt
                  ? `${Math.max(0, Math.round((lastRun.finishedAt.getTime() - lastRun.startedAt.getTime()) / 1000))}s`
                  : "—"
              }
            />
          </div>

          {(state.message || lastRun?.problem) && (
            <div className="callout callout--warn" style={{ marginTop: 14 }}>
              <span className="callout__ico">
                <AlertTriangle size={16} />
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="callout__title">
                  {readiness === "NOT_CONFIGURED" ? "nothing configured" : "no adapter"}
                </div>
                <span className="sm">{state.message ?? lastRun?.problem}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <ChartIcon size={17} className="icon dim" />
          <div className="card__titles">
            <div className="h3 trunc">Reconciliation</div>
            <div className="card__sub trunc">
              Where the portal and Finance &amp; Operations disagree on a code.
            </div>
          </div>
          <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
            {live.length > 0 && (
              <span className="badge badge--warn">
                <span className="badge__t">
                  {live.length} {live.length === 1 ? "code differs" : "codes differ"}
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="card__body card__body--flush">
          <DataList
            flat
            selectable={false}
            exportName="reconciliation"
            searchPlaceholder="Search budget codes"
            emptyTitle="Nothing to reconcile"
            emptyBody="The two systems have not been compared, or they agree on every code."
            views={[
              { id: "outstanding", label: "Outstanding" },
              { id: "settled", label: "Settled" },
            ]}
            columns={[
              { key: "code", label: "Budget code", width: "20%", sortable: true },
              { key: "account", label: "Account code", width: "12%" },
              { key: "compares", label: "Compares", width: "10%" },
              { key: "portal", label: "Portal", width: "11%", numeric: true, sortable: true },
              {
                key: "finance",
                label: "Finance & Operations",
                width: "13%",
                numeric: true,
                sortable: true,
              },
              { key: "difference", label: "Difference", width: "11%", numeric: true, sortable: true },
              { key: "reason", label: "Reason", width: "13%" },
              { key: "lastSeen", label: "Last seen", width: "10%", sortable: true },
            ]}
            rows={rows}
            actions={(id) => {
              const l = lines.find((x) => x.variance.id === id);
              if (!l || l.settled) return null;
              return (
                <button
                  type="button"
                  className="iconbtn iconbtn--sm"
                  aria-label="Accept the portal figure"
                  title="Accept the portal figure"
                  disabled={pending}
                  onClick={() => act(() => acceptPortalFigure(id))}
                >
                  <CheckIcon size={14} />
                </button>
              );
            }}
          />
        </div>
      </section>

      <form
        onSubmit={(e) => {
          const data = formDataOf(e);
          startTransition(async () => {
            const result = await saveFinanceSettings({ ok: false }, data);
            setState(result);
            if (result.ok) setDirty(false);
          });
        }}
        onChange={() => setDirty(true)}
      >
        <section className="card">
          <div className="card__head">
            <GlobeIcon size={17} className="icon dim" />
            <div className="card__titles">
              <div className="h3 trunc">Finance &amp; Operations</div>
              <div className="card__sub trunc">
                How and how often the portal reconciles with Finance &amp; Operations.
              </div>
            </div>
          </div>
          <div className="card__body">
            <div>
              <Setting
                title="Synchronisation direction"
                hint="Which way records move between the two systems."
              >
                <select
                  className="select select--sm"
                  name="direction"
                  aria-label="Synchronisation direction"
                  defaultValue={finance.direction ?? ""}
                >
                  <option value="">Not set</option>
                  {Object.entries(DIRECTION_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Setting>

              <Setting title="Schedule" hint="How often the comparison runs on its own.">
                <select
                  className="select select--sm"
                  name="schedule"
                  aria-label="Schedule"
                  defaultValue={finance.schedule ?? ""}
                >
                  <option value="">Not set</option>
                  {Object.entries(SCHEDULE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Setting>

              <Setting
                title="Variance tolerance"
                hint="How far apart the two may be before it counts as a disagreement. Empty means any difference counts."
                error={state.errors?.varianceTolerance}
              >
                <span className="inputwrap inputwrap--pre">
                  <span className="inputwrap__pre">RM</span>
                  <input
                    className="input input--num input--sm"
                    name="varianceTolerance"
                    inputMode="decimal"
                    aria-label="Variance tolerance"
                    style={{ paddingLeft: 36 }}
                    defaultValue={
                      finance.varianceTolerance
                        ? senToDecimalString(parseSen(finance.varianceTolerance))
                        : ""
                    }
                  />
                </span>
              </Setting>
            </div>
          </div>
        </section>

        {dirty && (
          <div className="cfg-savebar" role="status">
            <span className="cfg-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="cfg-savebar__t">Unsaved changes</div>
              <div className="cfg-savebar__s">Leaving this screen will lose them.</div>
            </div>
            <div className="spacer" />
            <button type="submit" className="btn btn--sm btn--primary" disabled={pending}>
              <SaveIcon size={15} />
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function HoldingCard({
  title,
  blurb,
  rows,
  accent,
}: {
  title: string;
  blurb: string;
  rows: [string, string][];
  accent?: boolean;
}) {
  return (
    <div className={`card${accent ? " card--accent" : ""}`}>
      <div className="card__head">
        <ChartIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">{title}</div>
        </div>
      </div>
      <div className="card__body card__body--tight">
        <div style={{ padding: "2px 2px 6px" }}>
          <p className="sm muted" style={{ margin: "0 0 12px" }}>
            {blurb}
          </p>
          <div className="kv kv--rows">
            {rows.map(([k, v]) => (
              <div key={k} className="kv__r">
                <div className="kv__k">{k}</div>
                <div className="kv__v">
                  <span className="num">{v}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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

function Setting({
  title,
  hint,
  error,
  children,
}: {
  title: string;
  hint: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="cfg-set">
      <div className="cfg-set__l">
        <span className="cfg-set__t">{title}</span>
        <span className="cfg-set__h">{hint}</span>
        {error && (
          <span className="field__err">
            <AlertTriangle size={13} />
            {error}
          </span>
        )}
      </div>
      <div className="cfg-set__c">{children}</div>
    </div>
  );
}
