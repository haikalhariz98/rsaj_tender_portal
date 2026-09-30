/**
 * A requisition received from the finance system (INT-01, ADR 0003).
 *
 * Pure validation of the INT-01-shaped payload. It arrives already approved: its
 * figures and its approval trail are stored as received, never re-routed, and the
 * trail is marked "not checked against the approval matrix". The finance system's
 * numbers are required — they are what the received requisition is.
 */

import { parseSen, type Sen } from "@/lib/money";
import type { CodeFormat } from "@/lib/organisation/types";

import { erpRefFaults, requisitionFaults, type Lookups, type RequisitionDraft } from "./fields";

export interface ReceivedStep {
  roleLabel: string;
  act: "P" | "JP" | "R" | "JR" | "MR" | "MJR" | "A" | "MA";
  /// The actor as the finance system names them. A Person where one is on file.
  actorName: string;
  actorPersonId: string | null;
  /// YYYY-MM-DD.
  decidedOn: string;
}

export interface ExternalRequisition extends RequisitionDraft {
  erpRequisitionNo: string;
  erpNoteNo: string;
  budget: {
    /// YYYY-MM-DD.
    asAt: string;
    actualBudget: string | null;
    balanceAsAt: string;
    approvedAccount: string | null;
    projectedBalance: string | null;
  };
  trail: ReceivedStep[];
}

export type IntakeFault = { field: string; message: string };

const money = (v: string | null): Sen | null => {
  if (v == null || v.trim() === "") return null;
  try {
    return parseSen(v);
  } catch {
    return null;
  }
};

export function intakeFaults(
  p: ExternalRequisition,
  lookups: Lookups,
  formats: readonly CodeFormat[],
  on: Date,
  today: string | null,
): IntakeFault[] {
  const out: IntakeFault[] = [];
  if (today == null) return [{ field: "form", message: "Set the organisation's time zone before receiving a requisition." }];

  for (const f of requisitionFaults(p, lookups, formats, on)) {
    if (f.code === "NO_FORMAT") continue;
    out.push({ field: f.field, message: f.code });
  }
  if (!p.erpRequisitionNo?.trim()) out.push({ field: "erpRequisitionNo", message: "REQUIRED" });
  if (!p.erpNoteNo?.trim()) out.push({ field: "erpNoteNo", message: "REQUIRED" });
  for (const f of erpRefFaults(p.erpRequisitionNo, p.erpNoteNo, formats)) {
    if (f.code !== "NO_FORMAT") out.push({ field: f.field, message: f.code });
  }

  if (!p.budget.asAt) out.push({ field: "budget.asAt", message: "REQUIRED" });
  else if (p.budget.asAt > today) out.push({ field: "budget.asAt", message: "FUTURE_DATE" });
  if (money(p.budget.balanceAsAt) == null) out.push({ field: "budget.balanceAsAt", message: "REQUIRED" });
  for (const k of ["actualBudget", "approvedAccount", "projectedBalance"] as const) {
    if (p.budget[k]?.trim() && money(p.budget[k]) == null) out.push({ field: `budget.${k}`, message: "NOT_AN_AMOUNT" });
  }

  if (p.trail.length === 0) out.push({ field: "trail", message: "TRAIL_REQUIRED" });
  p.trail.forEach((s, i) => {
    if (!s.roleLabel.trim()) out.push({ field: `trail.${i}.roleLabel`, message: "REQUIRED" });
    if (!s.actorName.trim()) out.push({ field: `trail.${i}.actorName`, message: "REQUIRED" });
    if (!s.decidedOn) out.push({ field: `trail.${i}.decidedOn`, message: "REQUIRED" });
    else if (s.decidedOn > today) out.push({ field: `trail.${i}.decidedOn`, message: "FUTURE_DATE" });
  });
  // It arrives approved: the last act on the trail is an approval.
  const last = p.trail.at(-1);
  if (last && last.act !== "A" && last.act !== "MA") out.push({ field: "trail", message: "NOT_APPROVED" });
  return out;
}
