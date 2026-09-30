"use client";

import { ChartIcon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";

import type { MovementRow } from "@/lib/budget/analysis";
import type { BudgetCode, Figures } from "@/lib/budget/codes";
import { formatSen } from "@/lib/money";
import { Badge, Chip, Dot } from "@/components/ui/badge";
import { Button, iconButtonClass } from "@/components/ui/button";
import { Meter } from "@/components/ui/feedback";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { DRAWER_SCRIM, DrawerHeader, drawerPanelClass } from "@/components/ui/drawer";


const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const KIND_LABEL: Record<MovementRow["kind"], string> = {
  ORIGINAL: "Allocation",
  REVISION: "Revision",
  TRANSFER_IN: "Transfer",
  TRANSFER_OUT: "Transfer",
  COMMITMENT: "Requisition",
  ACTUAL_SPEND: "Payment",
};

/**
 * Everything that has moved against one budget code.
 *
 * Read-only. The figures at the top are the same arithmetic the list behind this
 * drawer runs, over the same rows shown underneath — so what the balance is and how
 * it got there can be checked against each other on one screen.
 */
export function MovementsDrawer({
  budgetCode,
  figures,
  rows,
  status,
  year,
  threshold,
}: {
  budgetCode: BudgetCode;
  figures: Figures;
  rows: MovementRow[];
  status: (row: MovementRow) => string;
  year: number | null;
  threshold: number | null;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      opener.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={opener}
        className={iconButtonClass("sm")}
        aria-label="Movements"
        title="Movements"
        onClick={() => setOpen(true)}
      >
        <ListIcon />
      </button>

      {open && (
        <div
          className={DRAWER_SCRIM}
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            className={drawerPanelClass("xl")}
            role="dialog"
            aria-modal="true"
            aria-label={`Movements against ${budgetCode.code}`}
          >
            <DrawerHeader
              icon={<ChartIcon size={17} />}
              title={budgetCode.descriptionEn}
              subtitle={
                <>
                  <span className="font-mono text-[12.5px]">{budgetCode.code}</span>
                  {year != null && ` · ${year}`}
                </>
              }
              onClose={() => setOpen(false)}
            />

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Figure label="Allocated" value={formatSen(figures.allocated)} />
                  <Figure label="Committed" value={formatSen(figures.committed)} />
                  <Figure label="Actual spend" value={formatSen(figures.actualSpend)} />
                  <Figure label="Available" value={formatSen(figures.available)} />
                </dl>

                {figures.utilisation == null ? (
                  <p className="text-[12.5px] text-ink-3">
                    Nothing allocated, so there is no utilisation to show.
                  </p>
                ) : (
                  <Meter percent={figures.utilisation} threshold={threshold} />
                )}

                <hr className="border-line" />

                <div>
                  <div className="mb-3 flex items-center gap-2.5">
                    <h3 className="text-[14px] font-bold text-ink">Movements</h3>
                    <span className="flex-1" />
                    <span className="text-[12.5px] text-ink-3 tabular-nums">{rows.length}</span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-[12.5px] text-ink-3">Nothing has moved against this code yet.</p>
                  ) : (
                    // Flush to the drawer's edges, so the cells line up with its head.
                    <div className="-mx-6">
                      <Table minWidth={640}>
                        <THead>
                          <Th>Reference</Th>
                          <Th>Type</Th>
                          <Th>Date</Th>
                          <Th>Status</Th>
                          <Th numeric>Amount</Th>
                        </THead>
                        <tbody>
                          {rows.map((r) => {
                            const s = status(r);
                            const tone = s === "Released" ? "neutral" : "ok";
                            return (
                              <Tr key={r.id}>
                                <Td>
                                  <span
                                    className="block truncate font-mono text-[12.5px] text-ink"
                                    title={r.reference || undefined}
                                  >
                                    {r.reference || "—"}
                                  </span>
                                </Td>
                                <Td>
                                  <Badge>{KIND_LABEL[r.kind]}</Badge>
                                </Td>
                                <Td className="tabular-nums">{day(r.occurredOn)}</Td>
                                <Td>
                                  <Chip tone={tone} icon={<Dot tone={tone} />} title={s}>
                                    {s}
                                  </Chip>
                                </Td>
                                <Td numeric className="font-semibold">
                                  {formatSen(r.amount)}
                                </Td>
                              </Tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-ink tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}

/// The row action's glyph — a list, as the sample uses for movements.
function ListIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
