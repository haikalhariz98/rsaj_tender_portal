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
import { manualSnapshot } from "@/lib/requisition/budget";
import { linkMatchingMatters } from "@/lib/requisition/repo";
import type { ExternalRequisition } from "@/lib/requisition/intake";

export type { ExternalRequisition };

export type IntakeResult = { ok: true; id: string; reference: string } | { ok: false; message?: string; errors?: Record<string, string> };

/// What the settings in force say about this intake, read inside its transaction.
export type IntakeTerms =
  | { ok: true; funding: IntakeContext["funding"]; postCommitment: boolean }
  | { ok: false; message?: string; errors?: Record<string, string> };

export interface IntakeContext {
  organisationId: string;
  /// The organisation's today, YYYY-MM-DD.
  today: string;
  /// The funding route as configured, snapshotted as a portal requisition's is at submission.
  funding: { supersedesAuthority: boolean; sourcingPermitted: boolean; posture: string } | null;
  /// Whether its commitment is posted to the portal ledger (ruling BD-10). The caller
  /// has already refused an intake that cannot be posted.
  postCommitment: boolean;
  /// Where given, reads the controls, the funding route and the budget periods inside
  /// the intake's own transaction and decides `funding` and `postCommitment` from them,
  /// or refuses — so a setting changed meanwhile is never acted on stale (round 3, l).
  terms?: (tx: Tx) => Promise<IntakeTerms>;
}

export interface RequisitionIntake {
  receive(ctx: IntakeContext, p: ExternalRequisition): Promise<IntakeResult>;
}

const dec = (v: string | null) => (v == null || v.trim() === "" ? null : senToDecimalString(parseSen(v)));

export const manualIntake: RequisitionIntake = {
  async receive(ctx, p) {
    return db.$transaction(async (tx: Tx): Promise<IntakeResult> => {
      if (ctx.terms) {
        const t = await ctx.terms(tx);
        if (!t.ok) return t;
        ctx = { ...ctx, funding: t.funding, postCommitment: t.postCommitment };
      }
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
          contractTypeCode: p.contractTypeCode ?? null,
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
      // The figures as typed; the verdict read from the balance alone, by the one rule.
      const sen = (v: string | null) => (v == null || v.trim() === "" ? null : parseSen(v));
      const snapshot = manualSnapshot(
        { actualBudget: sen(p.budget.actualBudget), balanceAsAt: parseSen(p.budget.balanceAsAt), approvedAccount: sen(p.budget.approvedAccount), projectedBalance: sen(p.budget.projectedBalance) },
        parseSen(p.estimatedValue!),
      );
      const d = (v: bigint | null) => (v == null ? null : senToDecimalString(v));
      const check = await tx.requisitionBudgetCheck.create({
        data: {
          requisitionId: req.id,
          asAt: dayToDate(p.budget.asAt),
          source: snapshot.source,
          budgetCodeId: p.budgetCodeId,
          requestedAmount: senToDecimalString(snapshot.requested),
          actualBudget: d(snapshot.actualBudget),
          balanceAsAt: d(snapshot.balanceAsAt),
          approvedAccount: d(snapshot.approvedAccount),
          approvedAccountProvenance: snapshot.approvedAccountProvenance,
          projectedBalance: d(snapshot.projectedBalance),
          verdict: snapshot.verdict,
        },
      });
      const auditOf = (entity: string, entityId: string, entityLabel: string, changes: Record<string, unknown>) =>
        writeAudit(tx, { organisationId: ctx.organisationId, entity, entityId, entityLabel, reason: "Received by hand from the finance system" }, "CREATE", diffFields(null, changes));
      await auditOf("RequisitionBudgetCheck", check.id, `${reference} · budget check`, {
        source: check.source, asAt: check.asAt, verdict: check.verdict, balanceAsAt: check.balanceAsAt?.toString(), requestedAmount: check.requestedAmount.toString(),
      });
      const closedAt = dayToDate(p.trail.at(-1)!.decidedOn);
      const instance = await tx.approvalInstance.create({
        include: { steps: true },
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
      await auditOf("ApprovalInstance", instance.id, `${reference} · approval route`, {
        status: "APPROVED", checkedAgainstMatrix: false, route: p.trail.map((t) => `${t.roleLabel} (${t.actorName})`).join(" → "),
      });
      for (const st of instance.steps) {
        await auditOf("ApprovalStep", st.id, `${reference} · ${st.roleLabel}`, { decision: st.decision, decidedBy: st.decidedByName, decidedOn: st.decidedOn, asReceived: "yes" });
      }
      // Ruling BD-10: the portal ledger must hold the commitment the finance system made.
      let commitmentMovementId: string | null = null;
      if (ctx.postCommitment) {
        const code = await tx.budgetCode.findUniqueOrThrow({ where: { id: p.budgetCodeId! }, select: { code: true } });
        const movement = await tx.budgetMovement.create({
          data: { budgetCodeId: p.budgetCodeId!, kind: "COMMITMENT", reference, description: p.title, amount: dec(p.estimatedValue)!, occurredOn: on },
        });
        commitmentMovementId = movement.id;
        await tx.requisition.update({ where: { id: req.id }, data: { commitmentMovementId } });
        await auditOf("BudgetMovement", movement.id, `${code.code} · commitment for ${reference}`, {
          kind: "COMMITMENT", budgetCode: code.code, reference, committedEstimate: dec(p.estimatedValue), occurredOn: on,
        });
      }
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
          commitmentPosted: commitmentMovementId ? "yes" : "no",
        }),
      );
      // ADR 0002: a matter tabled earlier by this requisition's reference now links.
      await linkMatchingMatters(tx, ctx.organisationId, req.id);
      return { ok: true as const, id: req.id, reference };
    });
  },
};
