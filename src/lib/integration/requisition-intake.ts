/**
 * The requisition intake façade (INT-01, ADR 0003).
 *
 * `RequisitionIntake` is the contract a finance-system adapter implements. The only
 * adapter is `manualIntake`: an officer types the payload from the finance system,
 * and every received field is stored with its source — `erpRefSource = MANUAL`, the
 * budget figures as `MANUAL_ERP_ENTRY`, the trail as a closed approval instance not
 * checked against the matrix. Nothing here contacts an outside system.
 */

import type { Prisma } from "@/generated/prisma/client";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { diffFields } from "@/lib/audit/diff";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { parseSen, senToDecimalString } from "@/lib/money";
import { issueReference } from "@/lib/numbering/issue";
import type { ExternalRequisition } from "@/lib/requisition/intake";

export type { ExternalRequisition };

export type IntakeResult = { ok: true; id: string; reference: string } | { ok: false; message: string };

export interface IntakeContext {
  organisationId: string;
  /// The organisation's today, YYYY-MM-DD.
  today: string;
  /// The funding route as configured, snapshotted as a portal requisition's is at submission.
  funding: { supersedesAuthority: boolean; sourcingPermitted: boolean; posture: string } | null;
}

export interface RequisitionIntake {
  receive(ctx: IntakeContext, p: ExternalRequisition): Promise<IntakeResult>;
}

const dec = (v: string | null) => (v == null || v.trim() === "" ? null : senToDecimalString(parseSen(v)));

export const manualIntake: RequisitionIntake = {
  async receive(ctx, p) {
    return db.$transaction(async (tx: Tx) => {
      const on = dayToDate(ctx.today);
      const reference = await issueReference(tx, ctx.organisationId, "requisition", on);
      const req = await tx.requisition.create({
        data: {
          organisationId: ctx.organisationId,
          reference,
          origin: "EXTERNAL",
          erpRequisitionNo: p.erpRequisitionNo.trim(),
          erpNoteNo: p.erpNoteNo.trim(),
          erpRefSource: "MANUAL",
          erpRefRecordedAt: new Date(),
          requestingUnitCode: p.requestingUnitCode!,
          sectionUnitCode: p.sectionUnitCode,
          requestingPersonId: p.requestingPersonId!,
          title: p.title,
          justification: p.justification,
          needStatement: p.needStatement,
          costCentreCode: p.costCentreCode!,
          accountCode: p.accountCode!,
          budgetCodeId: p.budgetCodeId,
          siteCode: p.siteCode,
          placeOfDelivery: p.placeOfDelivery,
          dateRequired: dayToDate(p.dateRequired!),
          estimatedValue: dec(p.estimatedValue)!,
          raisedOn: on,
          fundingRouteCode: p.fundingRouteCode,
          fundingSupersedesAuthority: ctx.funding?.supersedesAuthority ?? null,
          sourcingPermitted: ctx.funding?.sourcingPermitted ?? null,
          fundingPosture: ctx.funding?.posture ?? null,
          status: "APPROVED",
          lines: {
            create: p.lines.map((l, i) => ({
              lineNo: i + 1,
              description: l.description,
              quantity: l.quantity?.trim() ? l.quantity.trim() : null,
              unit: l.unit?.trim() || null,
              estimatedUnitPrice: dec(l.estimatedUnitPrice),
              estimatedAmount: dec(l.estimatedAmount)!,
            })),
          },
        },
      });
      const balance = parseSen(p.budget.balanceAsAt);
      const requested = parseSen(p.estimatedValue!);
      const check = await tx.requisitionBudgetCheck.create({
        data: {
          requisitionId: req.id,
          asAt: dayToDate(p.budget.asAt),
          source: "MANUAL_ERP_ENTRY",
          budgetCodeId: p.budgetCodeId,
          requestedAmount: senToDecimalString(requested),
          actualBudget: dec(p.budget.actualBudget),
          balanceAsAt: senToDecimalString(balance),
          approvedAccount: dec(p.budget.approvedAccount),
          approvedAccountProvenance: "OBSERVED",
          projectedBalance: dec(p.budget.projectedBalance),
          verdict: requested <= balance ? "WITHIN" : "EXCEEDS",
        },
      });
      const closedAt = dayToDate(p.trail.at(-1)!.decidedOn);
      await tx.approvalInstance.create({
        data: {
          organisationId: ctx.organisationId,
          matterKind: "REQUISITION",
          requisitionId: req.id,
          domain: "requisition",
          value: dec(p.estimatedValue)!,
          fundingRouteCode: p.fundingRouteCode,
          budgetCheckId: check.id,
          budgetVerdict: check.verdict,
          checkedAgainstMatrix: false,
          warnings: [] as Prisma.InputJsonValue,
          status: "APPROVED",
          openedAt: dayToDate(p.trail[0].decidedOn),
          closedAt,
          steps: {
            create: p.trail.map((s, i) => ({
              sequence: i + 1,
              roleLabel: s.roleLabel,
              act: s.act,
              decision: "DONE",
              decidedByPersonId: s.actorPersonId,
              decidedByName: s.actorName,
              decidedOn: dayToDate(s.decidedOn),
              recordedAt: new Date(),
            })),
          },
        },
      });
      await writeAudit(
        tx,
        { organisationId: ctx.organisationId, entity: "Requisition", entityId: req.id, entityLabel: `${reference} · ${p.title}`, reason: "Received by hand from the finance system" },
        "CREATE",
        diffFields(null, {
          reference,
          origin: "EXTERNAL",
          erpRequisitionNo: p.erpRequisitionNo,
          erpNoteNo: p.erpNoteNo,
          title: p.title,
          estimatedValue: p.estimatedValue,
          status: "APPROVED",
          trailSteps: p.trail.length,
        }),
      );
      return { ok: true as const, id: req.id, reference };
    });
  },
};
