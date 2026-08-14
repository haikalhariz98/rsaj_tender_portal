"use client";

import { useState } from "react";

import { DataList, type Row } from "@/components/data-list";
import { ChartIcon } from "@/components/icons";
import { Tabs } from "@/components/tabs";
import {
  figuresFor,
  ledgerFor,
  thresholdState,
  type BudgetCode,
  type Movement,
} from "@/lib/budget/codes";
import type { BudgetControls } from "@/lib/budget/load";
import type { Period } from "@/lib/budget/periods";
import { formatCompactRM } from "@/lib/format";
import type { Figures } from "@/lib/budget/codes";

import { AddBudgetCode, EditBudgetCode } from "./code-editors";
import { PeriodsPanel } from "./periods-panel";
import { AllocationDetails, TransferBetweenCodes } from "./allocation-overlays";

/**
 * Budget, in the prototype's six tabs.
 *
 * Only the first is built. The rest say so rather than showing an approximation —
 * each is the size of a whole screen and every figure on them is arithmetic over the
 * same movement ledger, so half of one would be worse than none.
 */

export interface BudgetPanelData {
  codes: BudgetCode[];
  movements: Movement[];
  settings: BudgetControls | null;
  units: { code: string; nameEn: string }[];
  people: { id: string; name: string; isActive: boolean }[];
  accountCodes: { code: string; nameEn: string }[];
  periods: Period[];
  rollForwardByYear: Record<number, boolean | null>;
  on: Date;
}

export function BudgetTabs({
  initial,
  initialYear,
  ...data
}: BudgetPanelData & { initial?: string; initialYear?: number }) {
  // The selected year rides in the address bar beside the tab, so a year can be
  // linked to and the screen comparator can read one other than the default.
  const [year, setYear] = useState<number | null>(initialYear ?? null);
  const selectYear = (y: number) => {
    setYear(y);
    const url = new URL(window.location.href);
    url.searchParams.set("year", String(y));
    window.history.replaceState(null, "", url);
  };

  return (
    <Tabs
      initial={initial}
      tabs={[
        { id: "codes", label: "Budget codes", panel: <BudgetCodesPanel {...data} /> },
        {
          id: "periods",
          label: "Periods",
          panel: (
            <PeriodsPanel
              periods={data.periods}
              rollForwardByYear={data.rollForwardByYear}
              year={year}
              onYear={selectYear}
            />
          ),
        },
        {
          id: "allocations",
          label: "Allocations",
          panel: <AllocationsPanel {...data} year={year} />,
        },
        {
          id: "availability",
          label: "Commitment and availability",
          panel: <Pending what="Commitment and availability" />,
        },
        { id: "controls", label: "Controls", panel: <Pending what="Controls" /> },
        {
          id: "finance",
          label: "Finance & Operations",
          panel: <Pending what="Finance & Operations" />,
        },
      ]}
    />
  );
}

/// A tab that is not built. NotBuilt renders a whole page with its own head, which
/// inside a tab panel would put a second one on the screen.
function Pending({ what }: { what: string }) {
  return (
    <section className="card">
      <div className="card__head">
        <div className="card__titles">
          <div className="h3 trunc">{what}</div>
        </div>
      </div>
      <div className="card__body">
        <div className="empty">
          <div className="empty__t">Not built yet</div>
          <p className="empty__d">
            Budget codes is, and the movement ledger under it is what this tab reads.
            Anything shown here before that would be a figure nobody could stand behind.
          </p>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ budget codes

function BudgetCodesPanel({
  codes,
  movements,
  settings,
  units,
  people,
  accountCodes,
  on,
}: BudgetPanelData) {
  const unitName = (code: string | null) =>
    code ? (units.find((u) => u.code === code)?.nameEn ?? code) : "";
  const threshold = settings?.warningThresholdPercent ?? null;

  const rows: Row[] = codes.map((c) => {
    const f = figuresFor(movements, c.id, on);
    const over = thresholdState(f.utilisation, threshold) === "AT_OR_OVER";

    return {
      id: c.id,
      views: [
        ...(c.type ? [c.type.toLowerCase()] : []),
        ...(over ? ["running-low"] : []),
      ],
      search: [c.code, c.descriptionEn, c.type, unitName(c.owningUnitCode), c.accountCode]
        .filter(Boolean)
        .join(" "),
      sortKeys: {
        allocated: Number(f.allocated),
        available: Number(f.available),
        utilisation: f.utilisation ?? -1,
      },
      cells: {
        code: { kind: "stack", title: c.descriptionEn, sub: c.code, monoSub: true },
        type: c.type
          ? { kind: "badge", text: c.type, tone: c.type.toLowerCase() === "capital" ? "info" : undefined }
          : { kind: "text", text: "Not set", dim: true },
        unit: { kind: "text", text: unitName(c.owningUnitCode) || "—", dim: !c.owningUnitCode },
        allocated: { kind: "text", text: formatCompactRM(f.allocated) },
        available: { kind: "text", text: formatCompactRM(f.available) },
        utilisation: { kind: "meter", percent: f.utilisation, threshold },
        // Read from the record and its period, never stored as a word.
        status: c.isActive
          ? { kind: "chip", text: "Active", tone: "ok" }
          : { kind: "chip", text: "Withdrawn" },
      },
    };
  });

  return (
    <section className="card">
      <div className="card__head">
        <ChartIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Budget codes</div>
        </div>
        <div className="row">
          <AddBudgetCode units={units} people={people} accountCodes={accountCodes} />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          rowOpens
          exportName="budget-codes"
          searchPlaceholder="Search budget codes"
          emptyTitle="No budget code configured"
          emptyBody="A requirement is charged to a budget code, so nothing can be checked until one exists."
          views={[
            { id: "capital", label: "Capital" },
            { id: "operating", label: "Operating" },
            { id: "running-low", label: "Running low" },
          ]}
          filters={[
            { key: "type", label: "Type" },
            { key: "unit", label: "Owning department" },
          ]}
          columns={[
            { key: "code", label: "Budget code", width: "26%", sortable: true },
            { key: "type", label: "Type", width: "10%", sortable: true },
            { key: "unit", label: "Owning department", width: "16%", sortable: true },
            { key: "allocated", label: "Allocated", width: "12%", numeric: true, sortable: true },
            { key: "available", label: "Available", width: "12%", numeric: true, sortable: true },
            { key: "utilisation", label: "Utilisation", width: "14%", sortable: true },
            { key: "status", label: "Status", width: "10%" },
          ]}
          rows={rows}
          actions={(id) => {
            const budgetCode = codes.find((c) => c.id === id);
            if (!budgetCode) return null;
            return (
              <EditBudgetCode
                budgetCode={budgetCode}
                figures={figuresFor(movements, budgetCode.id, on)}
                threshold={threshold}
                units={units}
                people={people}
                accountCodes={accountCodes}
              />
            );
          }}
        />
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- allocations

/**
 * What each code's allocation is made of.
 *
 * Original, revisions and transfers are read off the ledger and totalled here; the
 * current allocation is their sum and is stored nowhere. A dash rather than a zero
 * where a code has never been revised — nothing happened, which is not the same as
 * something happening to the value of nought.
 */
function AllocationsPanel({
  codes,
  movements,
  on,
  year,
}: BudgetPanelData & { year: number | null }) {
  const figuresById: Record<string, Figures> = {};
  for (const c of codes) figuresById[c.id] = figuresFor(movements, c.id, on);

  const rows: Row[] = codes.map((c) => {
    const l = ledgerFor(movements, c.id, on);
    return {
      id: c.id,
      views: [
        ...(l.revisions !== 0n ? ["revisions"] : []),
        ...(l.transfers !== 0n ? ["transfers"] : []),
      ],
      search: [c.code, c.descriptionEn, c.type].filter(Boolean).join(" "),
      sortKeys: {
        original: Number(l.original),
        revisions: Number(l.revisions),
        transfers: Number(l.transfers),
        current: Number(l.current),
      },
      cells: {
        code: { kind: "stack", title: c.descriptionEn, sub: c.code, monoSub: true },
        original: { kind: "text", text: formatCompactRM(l.original) },
        revisions: signed(l.revisions),
        transfers: signed(l.transfers),
        current: { kind: "text", text: formatCompactRM(l.current) },
        type: c.type ? { kind: "badge", text: c.type } : { kind: "text", text: "Not set", dim: true },
      },
    };
  });

  return (
    <section className="card">
      <div className="card__head">
        <ChartIcon size={17} className="icon dim" />
        <div className="card__titles">
          <div className="h3 trunc">Allocations</div>
          {year != null && <div className="card__sub trunc">{year}</div>}
        </div>
        <div className="row" style={{ gap: 6, flex: "0 0 auto" }}>
          <TransferBetweenCodes codes={codes} figuresById={figuresById} />
        </div>
      </div>
      <div className="card__body card__body--flush">
        <DataList
          flat
          selectable={false}
          rowOpens
          exportName="allocations"
          searchPlaceholder="Search budget codes"
          emptyTitle="Nothing allocated"
          emptyBody="An allocation starts with an original amount on a budget code."
          views={[
            { id: "revisions", label: "Revisions" },
            { id: "transfers", label: "Transfers" },
          ]}
          filters={[{ key: "type", label: "Type" }]}
          columns={[
            { key: "code", label: "Budget code", width: "30%", sortable: true },
            { key: "original", label: "Original", width: "16%", numeric: true, sortable: true },
            { key: "revisions", label: "Revisions", width: "15%", numeric: true, sortable: true },
            { key: "transfers", label: "Transfers", width: "15%", numeric: true, sortable: true },
            {
              key: "current",
              label: "Current allocation",
              width: "18%",
              numeric: true,
              sortable: true,
            },
          ]}
          rows={rows}
          actions={(id) => {
            const c = codes.find((x) => x.id === id);
            if (!c) return null;
            return (
              <AllocationDetails budgetCode={c} movements={movements} year={year} on={on} />
            );
          }}
        />
      </div>
    </section>
  );
}

/// A movement that never happened reads as a dash, not as nought.
function signed(amount: bigint) {
  if (amount === 0n) return { kind: "text" as const, text: "—", dim: true };
  return {
    kind: "text" as const,
    text: `${amount > 0n ? "+" : ""}${formatCompactRM(amount)}`,
  };
}
