/**
 * What the Expenditure Request Form says, worked out from a loaded requisition: the words
 * to print, with money and dates written by the product's own helpers and every figure
 * taken from the record. A figure the record does not hold is "Not recorded", never
 * worked out here. The approvals table reads as the requisition's Approval and History
 * tabs do, from the same labels. Pure.
 */

import { OUTCOME_LABEL } from "@/lib/committee/labels";
import { RECORDED_ON_BEHALF_SENTENCE } from "@/lib/documents/labels";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { ACT_DONE_LABEL, ACT_LABEL } from "@/lib/labels";
import { addSen, formatSen, parseSen } from "@/lib/money";
import type { PrPdfData } from "@/lib/requisition/pr-pdf";
import { DECISION_LABEL, TIER_LABEL } from "@/lib/requisition/labels";
import type { OrgUnitKind } from "@/lib/requisition/types";
import type { RequisitionStatus } from "@/lib/requisition/types";

type Dec = { toString(): string };

/// The product's own rule, printed at the foot of the form (not the customer's paper form).
export const PR_FOOTER_RULE = "No purchase order, indent, letter of acceptance or contract may be issued before this requisition is approved.";
/// How figures are marked: the estimated value is SULIT wherever it is shown.
export const PR_SULIT_MARK = "SULIT";
const NOT_RECORDED = "Not recorded";
const NONE = "-";

/// The states from which the form may be downloaded: approved, and every state after it.
export const PR_STATES: readonly RequisitionStatus[] = ["APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"];

/// Why the form is not offered yet, in words; null when it is. A closed requisition is offered
/// only if it was approved first (it holds an approved route); one cancelled or rejected is not.
export function prRefusal(status: RequisitionStatus, approvedRoute: boolean): string | null {
  if (PR_STATES.includes(status)) return null;
  if (status === "CLOSED" && approvedRoute) return null;
  return "The expenditure request form is available once the requisition is approved. This one has not been approved.";
}

/// The file name for a reference: slashes (and anything else a file name cannot hold) become hyphens.
export const prFileName = (reference: string) => `${reference.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;

export interface PrSource {
  reference: string;
  title: string;
  justification: string;
  needStatement: string;
  placeOfDelivery: string;
  raisedOn: Date;
  estimatedValue: Dec;
  erpRequisitionNo: string | null;
  erpNoteNo: string | null;
  requestingPerson: { name: string };
  lines: { lineNo: number; description: string; quantity: Dec | null; unit: string | null; estimatedUnitPrice: Dec | null; estimatedAmount: Dec }[];
  endorsements: { tier: string; person: { name: string }; endorsedOn: Date; note: string }[];
  /// Latest first.
  budgetChecks: { asAt: Date; actualBudget: Dec | null; balanceAsAt: Dec | null; approvedAccount: Dec | null; projectedBalance: Dec | null }[];
  /// Latest first.
  approvalInstances: {
    status: string;
    checkedAgainstMatrix: boolean;
    steps: {
      sequence: number;
      roleLabel: string;
      act: string;
      decision: string;
      decidedByName: string | null;
      decidedOn: Date | null;
      recordedAt: Date | null;
      reason: string;
      carriedFromStepId: string | null;
      delegation: { fromPerson: { name: string } } | null;
      committee: { committee: string; meetingReference: string; outcome: keyof typeof OUTCOME_LABEL; date: Date; notApprovedName: string | null } | null;
    }[];
  }[];
}

export interface PrContext {
  organisationName: string;
  logo: PrPdfData["logo"];
  timeZone: string | null;
  /// The contract type's label, or null where none is set.
  purchaseType: string | null;
  /// "code · name" of the requisition's cost centre and account code, and their bare codes.
  costCentre: { code: string; label: string } | null;
  account: { code: string; label: string } | null;
  generatedAt: Date;
}

const money = (v: Dec | null) => (v == null ? NOT_RECORDED : formatSen(parseSen(v.toString()), ""));
/// A quantity as written for a person: 5.0000 → "5", 2.5000 → "2.5".
const quantity = (v: Dec | null) => {
  if (v == null) return NONE;
  const s = v.toString();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

export function prDataOf(r: PrSource, c: PrContext): PrPdfData {
  const check = r.budgetChecks[0] ?? null;
  const total = addSen(...r.lines.map((l) => parseSen(l.estimatedAmount.toString())));
  const cc = c.costCentre?.code ?? NOT_RECORDED;
  const ac = c.account?.code ?? NOT_RECORDED;

  const route = r.approvalInstances.find((i) => i.status === "APPROVED") ?? r.approvalInstances[0] ?? null;
  const approvals: string[][] = [];
  const add = (process: string, status: string, when: string, by: string, comment: string) => approvals.push([String(approvals.length + 1), process, status, when, by, comment]);

  add("Registration", "Raised", formatDate(r.raisedOn), r.requestingPerson.name, "");
  for (const e of r.endorsements) {
    add(`${TIER_LABEL[e.tier as OrgUnitKind] ?? "Endorsement"} endorsement`, "Endorsed", formatDate(e.endorsedOn), e.person.name, e.note || RECORDED_ON_BEHALF_SENTENCE);
  }
  for (const s of route?.steps ?? []) {
    const process = `${s.roleLabel} · ${ACT_LABEL[s.act] ?? "Decision"}`;
    if (s.decision === "PENDING") {
      add(process, DECISION_LABEL.PENDING, NONE, NONE, "");
      continue;
    }
    const status = s.decision === "REJECTED" ? DECISION_LABEL.REJECTED : (ACT_DONE_LABEL[s.act] ?? DECISION_LABEL.DONE);
    const when = s.recordedAt ? formatOrgDateTime(s.recordedAt, c.timeZone) : s.decidedOn ? formatDate(s.decidedOn) : NOT_RECORDED;
    if (s.carriedFromStepId) {
      add(process, status, when, s.decidedByName ?? NOT_RECORDED, "Decided on the earlier route and carried onto this one");
    } else if (s.committee) {
      const k = s.committee;
      add(
        process,
        status,
        s.recordedAt ? when : formatDate(k.date),
        k.committee,
        `${OUTCOME_LABEL[k.outcome]} by the ${k.committee} at ${k.meetingReference} on ${formatDate(k.date)}${k.notApprovedName ? ` · ${k.notApprovedName}` : ""}${s.reason ? ` · “${s.reason}”` : ""}`,
      );
    } else {
      const by = `${s.decidedByName ?? NOT_RECORDED}${s.delegation ? ` (under delegation from ${s.delegation.fromPerson.name})` : ""}`;
      add(process, status, when, by, s.reason);
    }
  }

  return {
    organisationName: c.organisationName,
    logo: c.logo,
    title: "EXPENDITURE REQUEST FORM",
    reference: r.reference,
    raisedOn: formatDate(r.raisedOn),
    // The finance system's numbers were removed from the product; shown only where a requisition still has them.
    financeNumbers: [
      ...(r.erpRequisitionNo ? ([["Finance system requisition no.", r.erpRequisitionNo]] as [string, string][]) : []),
      ...(r.erpNoteNo ? ([["Requisition note no.", r.erpNoteNo]] as [string, string][]) : []),
    ],
    sulitMark: PR_SULIT_MARK,
    purchaseType: c.purchaseType ?? "Not set",
    purpose: {
      title: r.title,
      estimatedCost: formatSen(parseSen(r.estimatedValue.toString()), ""),
      supplier: "Not yet chosen",
      receivingLocation: r.placeOfDelivery || "Not set",
      justification: r.justification || "Not set",
      needStatement: r.needStatement || "Not set",
    },
    budget: {
      headers: ["Cost centre", "Account code", "Actual budget (RM)", check ? `Balance as at ${formatDate(check.asAt)} (RM)` : "Balance as at (RM)", "Approved account (RM)", "Projected balance (RM)"],
      row: [c.costCentre?.label ?? NOT_RECORDED, c.account?.label ?? NOT_RECORDED, money(check?.actualBudget ?? null), money(check?.balanceAsAt ?? null), money(check?.approvedAccount ?? null), money(check?.projectedBalance ?? null)],
    },
    items: {
      headers: ["No", "Cost centre", "Account code", "Description", "Per unit (RM)", "Qty", "Unit", "Total (RM)"],
      rows: [
        ...r.lines.map((l) => ({
          cells: [String(l.lineNo), cc, ac, l.description, l.estimatedUnitPrice == null ? NONE : money(l.estimatedUnitPrice), quantity(l.quantity), l.unit || NONE, money(l.estimatedAmount)],
        })),
        { cells: ["", "", "", "TOTAL", "", "", "", formatSen(total, "")], strong: true },
      ],
    },
    approvals: { headers: ["No", "Process", "Status", "Date/Time", "By", "Comment"], rows: approvals },
    notesLabel: "Notes:",
    footerRule: PR_FOOTER_RULE,
    generated: `Generated ${formatOrgDateTime(c.generatedAt, c.timeZone)} · Generated by the procurement portal`,
  };
}
