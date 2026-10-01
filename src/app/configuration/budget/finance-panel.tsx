"use client";

import { formDataOf } from "@/components/ui/form-submit";
import { useState, useTransition } from "react";

import { DataList, type Row } from "@/components/data-list";
import { CheckIcon, ChartIcon, GlobeIcon } from "@/components/icons";
import type { FormState } from "@/components/record-editor";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { AffixInput, Field, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/stat";
import { figuresFor, type BudgetCode, type Movement } from "@/lib/budget/codes";
import { ago, lineFor, outstanding, summarise, syncReadiness } from "@/lib/budget/finance";
import type { FinanceData } from "@/lib/budget/load";
import { formatCompactRM } from "@/lib/format";
import { formatSen, parseSen, senToDecimalString } from "@/lib/money";

import { acceptPortalFigure, saveFinanceSettings, synchroniseNow } from "./actions";
import { SaveBar } from "./controls-panel";

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

  const duration = lastRun?.finishedAt
    ? `${Math.max(0, Math.round((lastRun.finishedAt.getTime() - lastRun.startedAt.getTime()) / 1000))}s`
    : "—";
  const direction = finance.direction
    ? (DIRECTION_LABEL[finance.direction] ?? finance.direction)
    : "Not set";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
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

      <Card>
        <CardHeader
          icon={<ChartIcon size={17} />}
          title="Last synchronised"
          // A run that never happened is not a time.
          subtitle={lastRun ? stamp(lastRun.startedAt) : "Never"}
          actions={
            <Button
              variant="primary"
              size="sm"
              disabled={pending}
              icon={<GlobeIcon size={15} />}
              onClick={() => act(synchroniseNow)}
            >
              Synchronise now
            </Button>
          }
        />
        <CardBody className="flex flex-col gap-4">
          {/* Five tiles: a row of five when wide, pairs below that with the first
              spanning, so every row is filled edge to edge. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              tone="neutral"
              label="Direction"
              value={
                <span className="block text-[17px] leading-snug whitespace-normal" title={direction}>
                  {direction}
                </span>
              }
              hint={finance.schedule ? (SCHEDULE_LABEL[finance.schedule] ?? finance.schedule) : undefined}
              variant="inset" size="sm" className="sm:col-span-2 xl:col-span-1"
            />
            <Stat
              tone="neutral"
              label="Records in"
              value={lastRun ? String(lastRun.recordsIn) : "—"}
              variant="inset" size="sm"
            />
            <Stat
              tone="neutral"
              label="Records out"
              value={lastRun ? String(lastRun.recordsOut) : "—"}
              variant="inset" size="sm"
            />
            <Stat
              tone="neutral"
              label="Variances"
              value={
                <span className={live.length === 0 ? undefined : "text-amber-700"}>{live.length}</span>
              }
              hint={live.length === 0 ? undefined : formatCompactRM(gap)}
              variant="inset" size="sm"
            />
            <Stat tone="neutral" label="Duration" value={duration} variant="inset" size="sm" />
          </div>

          {(state.message || lastRun?.problem) && (
            <Callout
              tone="warn"
              title={readiness === "NOT_CONFIGURED" ? "nothing configured" : "no adapter"}
            >
              {state.message ?? lastRun?.problem}
            </Callout>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ChartIcon size={17} />}
          title="Reconciliation"
          subtitle="Where the portal and Finance & Operations disagree on a code."
          actions={
            live.length > 0 ? (
              <Badge tone="warn">
                {live.length} {live.length === 1 ? "code differs" : "codes differ"}
              </Badge>
            ) : undefined
          }
          divided={false}
        />
        <DataList stackBelow="xl"
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
            { key: "code", label: "Budget code", sortable: true, mobile: "primary" },
            { key: "account", label: "Account code", width: "104px", mobile: "meta" },
            // The code's own line already says what it compares; the column repeats it, so
            // it waits for a wide screen.
            { key: "compares", label: "Compares", width: "120px", hideBelow: "2xl", mobile: "meta" },
            { key: "portal", label: "Portal", width: "104px", numeric: true, sortable: true, mobile: "meta" },
            { key: "finance", label: "Finance & Operations", width: "112px", numeric: true, sortable: true, mobile: "meta" },
            { key: "difference", label: "Difference", width: "112px", numeric: true, sortable: true, mobile: "meta" },
            { key: "reason", label: "Reason", width: "144px", mobile: "meta" },
            { key: "lastSeen", label: "Last seen", width: "96px", sortable: true, mobile: "meta" },
          ]}
          rows={rows}
          actionsWidth={72}
          actions={(id) => {
            const l = lines.find((x) => x.variance.id === id);
            if (!l || l.settled) return null;
            return (
              <IconButton
                size="sm"
                label="Accept the portal figure"
                disabled={pending}
                onClick={() => act(() => acceptPortalFigure(id))}
              >
                <CheckIcon size={15} />
              </IconButton>
            );
          }}
        />
      </Card>

      <form
        className="flex flex-col gap-6"
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
        <Card>
          <CardHeader
            icon={<GlobeIcon size={17} />}
            title="Finance & Operations"
            subtitle="How and how often the portal reconciles with Finance & Operations."
          />
          <CardBody>
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <Field
                label="Synchronisation direction"
                htmlFor="fin-direction"
                hint="Which way records move between the two systems."
              >
                <Select id="fin-direction" name="direction" defaultValue={finance.direction ?? ""}>
                  <option value="">Not set</option>
                  {Object.entries(DIRECTION_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Schedule" htmlFor="fin-schedule" hint="How often the comparison runs on its own.">
                <Select id="fin-schedule" name="schedule" defaultValue={finance.schedule ?? ""}>
                  <option value="">Not set</option>
                  {Object.entries(SCHEDULE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Variance tolerance"
                htmlFor="fin-varianceTolerance"
                hint="How far apart the two may be before it counts as a disagreement. Empty means any difference counts."
                error={state.errors?.varianceTolerance}
              >
                <AffixInput
                  id="fin-varianceTolerance"
                  prefix="RM"
                  name="varianceTolerance"
                  inputMode="decimal"
                  className="[&_input]:text-right"
                  aria-invalid={state.errors?.varianceTolerance ? true : undefined}
                  defaultValue={
                    finance.varianceTolerance
                      ? senToDecimalString(parseSen(finance.varianceTolerance))
                      : ""
                  }
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        {dirty && <SaveBar message="Leaving this screen will lose them." pending={pending} />}
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
    <Card tone={accent ? "brand" : "default"}>
      <CardHeader icon={<ChartIcon size={17} />} title={title} divided={false} />
      <CardBody className="pt-0">
        <p className="mb-3 text-[13px] text-ink-3">{blurb}</p>
        <dl className="flex flex-col">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5 last:border-b-0"
            >
              <dt className="text-[13px] text-ink-3">{k}</dt>
              <dd className="min-w-0 truncate text-right text-[14px] font-semibold text-ink tabular-nums" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
