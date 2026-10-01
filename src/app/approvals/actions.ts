"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { someoneCanAct } from "@/lib/authority/absence";
import { escalationFaultText, ESCALATION_KIND_LABEL } from "@/lib/authority/escalation-labels";
import { actingOffice, stepEscalation } from "@/lib/authority/escalation";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { holdersFor } from "@/lib/requisition/holders";
import { FormReader } from "@/lib/validate";

/**
 * Escalate a pending person step (FR-APR-009, FR-APR-010, FR-APR-012; rulings CO-6,
 * CO-7, C4): for want of anyone able to act, or on a declared conflict of interest. One
 * action for every route — requisition, name approval, appointment — because the step
 * and its rules are the same.
 *
 * It takes the locks every write on the matter takes, in the same order — the
 * requisition, then the exercise, then the award — and re-reads the step, the route, the
 * roster and the offices inside the transaction. The step's own office is never
 * rewritten; the acting office, the reason and, for a conflict, the declarer (recorded
 * on their behalf, not signed) are written beside it with the audit row.
 */
export async function escalateStep(_prev: FormState, data: FormData): Promise<FormState> {
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const kind = r.choice("kind", "Why", ["NO_AVAILABLE_HOLDER", "CONFLICT_DECLARED"] as const, { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  const declarerId = r.optionalText("declaredByPersonId");
  if (!reason) r.reject("reason", "Say why the step is escalated.");
  if (kind === "CONFLICT_DECLARED" && !declarerId) r.reject("declaredByPersonId", "Name who declares the conflict.");
  if (r.failed || !kind) return { ok: false, errors: r.errors };

  const found = await db.approvalStep.findUnique({
    where: { id: stepId },
    select: { instance: { select: { id: true, requisitionId: true, exerciseId: true, awardId: true, exercise: { select: { requisitionId: true } } } } },
  });
  if (!found) return { ok: false, message: "That step no longer exists." };
  const route = found.instance;
  const requisitionId = route.requisitionId ?? route.exercise?.requisitionId ?? null;
  if (!requisitionId) return { ok: false, message: "That step's matter cannot be found." };

  const result = await db.$transaction(
    async (tx): Promise<FormState & { paths?: string[] }> => {
      await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${requisitionId} FOR UPDATE`;
      if (route.exerciseId) await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${route.exerciseId} FOR UPDATE`;
      if (route.awardId) await tx.$queryRaw`SELECT id FROM "Award" WHERE id = ${route.awardId} FOR UPDATE`;

      const inst = await tx.approvalInstance.findUnique({
        where: { id: route.id },
        include: {
          steps: { orderBy: { sequence: "asc" } },
          requisition: { select: { id: true, reference: true } },
          exercise: { select: { id: true, reference: true } },
          award: { select: { id: true, reference: true } },
        },
      });
      const step = inst?.steps.find((s) => s.id === stepId);
      if (!inst || !step) return { ok: false, message: "That step no longer exists." };
      const req = await tx.requisition.findUniqueOrThrow({ where: { id: requisitionId }, select: { organisationId: true, sectionUnitCode: true, requestingUnitCode: true, organisation: { select: { timeZone: true } } } });
      const today = todayIn(new Date(), req.organisation.timeZone);
      const [roles, units, roster, delegations] = await Promise.all([
        tx.authorityRole.findMany({ where: { organisationId: req.organisationId }, select: { code: true, nameEn: true, escalatesToCode: true } }),
        tx.orgUnit.findMany({ where: { organisationId: req.organisationId } }),
        loadRoster(ORGANISATION_CODE, tx),
        loadDelegations(ORGANISATION_CODE, tx),
      ]);
      const office = actingOffice(step);
      const on = today ? dayToDate(today) : new Date();
      const unitPath = pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, on).reverse().map((u) => u.code);
      const holders = office && today ? holdersFor(office, unitPath, roster, delegations, today) : { scope: null, holderIds: [], delegates: [] };
      const people = new Map(roster.people.map((p) => [p.id, p]));
      const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
      const declarer = declarerId ? (people.get(declarerId) ?? null) : null;
      const verdict = stepEscalation(step, {
        kind,
        reason,
        today,
        routeOpen: inst.status === "PENDING",
        roles: Object.fromEntries(roles.map((x) => [x.code, { escalatesToCode: x.escalatesToCode }])),
        routeSteps: inst.steps,
        holderAvailable: someoneCanAct(holders, available),
        declarerEntitled: kind === "CONFLICT_DECLARED" ? (declarer ? holders.holderIds.includes(declarer.id) || holders.delegates.some((d) => d.personId === declarer.id) : null) : null,
      });
      const nameOf = (code: string | null) => (code ? (roles.find((x) => x.code === code)?.nameEn ?? "An office no longer configured") : null);
      if (!verdict.ok) {
        const text = escalationFaultText(verdict.fault, nameOf(verdict.office ?? null));
        return verdict.fault === "DECLARER_NOT_ENTITLED" ? { ok: false, errors: { declaredByPersonId: text } } : verdict.fault === "REASON_REQUIRED" ? { ok: false, errors: { reason: text } } : { ok: false, message: text };
      }
      const after = {
        actingRoleCode: verdict.toRoleCode,
        actingRoleLabel: nameOf(verdict.toRoleCode)!,
        escalation: kind,
        escalationReason: reason,
        escalatedOn: dayToDate(today!),
        escalationCount: step.escalationCount + 1,
        declaredByPersonId: kind === "CONFLICT_DECLARED" ? declarer!.id : step.declaredByPersonId,
      };
      const moved = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
      if (moved.count !== 1) return { ok: false, message: "The step changed while this was being saved. Reload and try again." };
      const matter = inst.award ? `${inst.award.reference} · appointment` : inst.exercise ? `${inst.exercise.reference} · name approval` : `${inst.requisition?.reference ?? "Matter"}`;
      await writeAudit(tx, { organisationId: req.organisationId, entity: "ApprovalStep", entityId: step.id, entityLabel: `${matter} · ${step.roleLabel}`, reason }, "UPDATE",
        diffFields(
          { actingOffice: step.actingRoleLabel ?? step.roleLabel },
          {
            actingOffice: after.actingRoleLabel,
            escalation: ESCALATION_KIND_LABEL[kind],
            declaredBy: kind === "CONFLICT_DECLARED" ? declarer!.name : undefined,
            recordedOnBehalf: kind === "CONFLICT_DECLARED" ? "not signed" : undefined,
            escalatedOn: after.escalatedOn,
          },
        ));
      const paths = ["/approvals", `/requisitions/${requisitionId}`, ...(inst.exercise ? [`/sourcing/${inst.exercise.id}`] : []), ...(inst.award ? [`/awards/${inst.award.id}`] : [])];
      return { ok: true, paths };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  for (const p of result.paths ?? []) revalidatePath(p);
  return { ok: result.ok, message: result.message, errors: result.errors };
}
