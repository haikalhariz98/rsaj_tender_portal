"use client";

import { useEffect, useRef, useState } from "react";

import { ChartIcon, XIcon } from "@/components/icons";
import type { MovementRow } from "@/lib/budget/analysis";
import type { BudgetCode, Figures } from "@/lib/budget/codes";
import { formatSen } from "@/lib/money";

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
        className="iconbtn iconbtn--sm"
        aria-label="Movements"
        title="Movements"
        onClick={() => setOpen(true)}
      >
        <ListIcon />
      </button>

      {open && (
        <div
          className="scrim scrim--right"
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside
            className="drawer drawer--xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Movements against ${budgetCode.code}`}
          >
            <div className="ov__head">
              <ChartIcon size={20} className="icon dim" style={{ marginTop: 2 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <div className="h2 trunc">{budgetCode.descriptionEn}</div>
                </div>
                <div className="sm muted" style={{ marginTop: 2 }}>
                  {budgetCode.code}
                  {year != null && ` · ${year}`}
                </div>
              </div>
              <button type="button" className="iconbtn" aria-label="Close" onClick={() => setOpen(false)}>
                <XIcon size={17} />
              </button>
            </div>

            <div className="ov__body">
              <div className="stack stack--lg">
                <div className="row wrap" style={{ gap: 16 }}>
                  <Figure label="Allocated" value={formatSen(figures.allocated)} />
                  <Figure label="Committed" value={formatSen(figures.committed)} />
                  <Figure label="Actual spend" value={formatSen(figures.actualSpend)} />
                  <Figure label="Available" value={formatSen(figures.available)} />
                </div>

                {figures.utilisation == null ? (
                  <span className="xs dim">
                    Nothing allocated, so there is no utilisation to show.
                  </span>
                ) : (
                  <div className="cfg-meter">
                    <span className="cfg-meter__t">
                      <span
                        className="cfg-meter__f"
                        data-tone={
                          threshold != null && figures.utilisation >= threshold ? "warn" : ""
                        }
                        style={{ width: `${Math.min(figures.utilisation, 100)}%` }}
                      />
                      {threshold != null && (
                        <span className="cfg-meter__m" style={{ left: `${threshold}%` }} />
                      )}
                    </span>
                    <span className="cfg-meter__v">{Math.round(figures.utilisation)}%</span>
                  </div>
                )}

                <div className="divider" />

                <div>
                  <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                    <span className="lbl">Movements</span>
                    <div className="spacer" />
                    <span className="xs dim">{rows.length}</span>
                  </div>
                  {rows.length === 0 ? (
                    <span className="xs dim">
                      Nothing has moved against this code yet.
                    </span>
                  ) : (
                    <div className="tablewrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Reference</th>
                            <th>Type</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th className="num">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => {
                            const s = status(r);
                            return (
                              <tr key={r.id}>
                                <td>
                                  <span className="mono sm">{r.reference || "—"}</span>
                                </td>
                                <td>
                                  <span className="badge">
                                    <span className="badge__t">{KIND_LABEL[r.kind]}</span>
                                  </span>
                                </td>
                                <td>
                                  <span className="num">{day(r.occurredOn)}</span>
                                </td>
                                <td>
                                  <span className={`chip${s === "Released" ? "" : " chip--ok"}`} title={s}>
                                    <span className={`dot${s === "Released" ? "" : " dot--ok"}`} />
                                    <span className="badge__t">{s}</span>
                                  </span>
                                </td>
                                <td className="num">
                                  <span className="num">{formatSen(r.amount)}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="ov__foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="lbl">{label}</div>
      <div className="sm strong" style={{ marginTop: 2 }}>
        <span className="num">{value}</span>
      </div>
    </div>
  );
}

/// The row action's glyph — a list, as the sample uses for movements.
function ListIcon() {
  return (
    <svg
      width={14}
      height={14}
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
