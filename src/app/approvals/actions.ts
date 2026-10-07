"use server";

import { actStatusFault, actStatusText, certificateAct } from "@/lib/contract/act-status";
import type { ContractStatus } from "@/lib/contract/types";
import type { CertificateKind } from "@/lib/certificate/types";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/record";
import { someoneCanAct } from "@/lib/authority/absence";
import { escalationFaultText, ESCALATION_KIND_LABEL } from "@/lib/authority/escalation-labels";
import { actingOffice, stepEscalation } from "@/lib/authority/escalation";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { contractLabel } from "@/lib/contract/repo";
import { exerciseRouteMatter } from "@/lib/method/approval";
import { pathTo } from "@/lib/organisation/structure";
import type { OrgUnit } from "@/lib/organisation/types";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { MATTER_FAMILY, type ContractMatterKind } from "@/lib/matter/matter";
import { MATTER_KIND_WORDS } from "@/lib/matter/write";
import { holdersFor } from "@/lib/requisition/holders";
import { supplierHolders } from "@/lib/suppliers/route";
import { FormReader } from "@/lib/validate";
import { requireStaff, toAuditActor } from "@/app/_auth/actor";

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
  const actor = await requireStaff();
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const kind = r.choice("kind", "Why", ["NO_AVAILABLE_HOLDER", "CONFLICT_DECLARED"] as const, { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  const declarerId = r.optionalText("declaredByPersonId");
  if (!reason) r.reject("reason", "Say why the step is escalated.");
  if (kind === "CONFLICT_DECLARED" && !declarerId) r.reject("declaredByPersonId", "Name who declares the conflict.");
  if (r.failed || !kind) return { ok: false, errors: r.errors };

  const found = await db.approvalStep.findUnique({
    where: { id: stepId, instance: { organisationId: actor.organisationId } },
    select: { instance: { select: { id: true, requisitionId: true, exerciseId: true, awardId: true, exercise: { select: { requisitionId: true } }, supplierApplicationId: true, supplierApplication: { select: { supplierId: true } }, standingRequestId: true, standingRequest: { select: { supplierId: true } }, specialPermissionId: true, specialPermission: { select: { party: { select: { vendorId: true } } } }, certificateId: true, certificate: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } }, variationId: true, variation: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } }, contractMatterId: true, contractMatter: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } } } } },
  });
  if (!found) return { ok: false, message: "That step no longer exists." };
  const route = found.instance;
  // 6.13 Part A step 3 (614-C4): a certificate's route locks its chain as every certificate act does: the requisition,
  // the exercise and the award behind its contract, then the contract, then the certificate.
  const cert = route.certificate?.contractId ? { id: route.certificateId!, contractId: route.certificate.contractId, awardId: route.certificate.contract.awardId, exerciseId: route.certificate.contract.award.exerciseId } : null;
  // 6.13 Part A step 4 (614-C4): a variation's route locks its chain as every variation act does: the requisition, the
  // exercise and the award behind its contract, then the contract, then the variation.
  const variation = route.variation?.contractId ? { id: route.variationId!, contractId: route.variation.contractId, awardId: route.variation.contract.awardId, exerciseId: route.variation.contract.award.exerciseId } : null;
  // 6.13 Part B run 1b C8b (BD-613-117): a contract matter's route locks its chain as every matter act does: the requisition,
  // the exercise and the award behind its contract, then the contract, then the matter (the first domain row).
  const contractMatter = route.contractMatter?.contractId ? { id: route.contractMatterId!, contractId: route.contractMatter.contractId, awardId: route.contractMatter.contract.awardId, exerciseId: route.contractMatter.contract.award.exerciseId } : null;
  const requisitionId = route.requisitionId ?? route.exercise?.requisitionId ?? route.certificate?.contract.award.exercise.requisitionId ?? route.variation?.contract.award.exercise.requisitionId ?? route.contractMatter?.contract.award.exercise.requisitionId ?? null;
  const exerciseId = route.exerciseId ?? cert?.exerciseId ?? variation?.exerciseId ?? contractMatter?.exerciseId ?? null;
  const awardId = route.awardId ?? cert?.awardId ?? variation?.awardId ?? contractMatter?.awardId ?? null;
  // 6.15 (OD-2 A): a supplier matter's route, locked as the register's acts lock it (the supplier row, then the application).
  // 6.15a: a blacklisting's route locks as the register's standing acts do (the supplier row, then the request);
  // a special permission's locks its permission row (it belongs to an exercise, and touches no supplier row).
  const supplierId = route.supplierApplication?.supplierId ?? route.standingRequest?.supplierId ?? null;
  const permissionId = route.specialPermissionId;
  if (!requisitionId && !supplierId && !permissionId) return { ok: false, message: "That step's matter cannot be found." };

  const result = await db.$transaction(
    async (tx): Promise<FormState & { paths?: string[] }> => {
      if (requisitionId) await tx.$queryRaw`SELECT id FROM "Requisition" WHERE id = ${requisitionId} FOR UPDATE`;
      if (exerciseId) await tx.$queryRaw`SELECT id FROM "SourcingExercise" WHERE id = ${exerciseId} FOR UPDATE`;
      if (awardId) await tx.$queryRaw`SELECT id FROM "Award" WHERE id = ${awardId} FOR UPDATE`;
      if (cert) {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${cert.contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Certificate" WHERE id = ${cert.id} FOR UPDATE`;
      }
      if (variation) {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${variation.contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Variation" WHERE id = ${variation.id} FOR UPDATE`;
      }
      if (contractMatter) {
        await tx.$queryRaw`SELECT id FROM "Contract" WHERE id = ${contractMatter.contractId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${contractMatter.id} FOR UPDATE`;
      }
      if (supplierId) {
        await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${supplierId} FOR UPDATE`;
        if (route.supplierApplicationId) await tx.$queryRaw`SELECT id FROM "SupplierApplication" WHERE id = ${route.supplierApplicationId} FOR UPDATE`;
        if (route.standingRequestId) await tx.$queryRaw`SELECT id FROM "StandingRequest" WHERE id = ${route.standingRequestId} FOR UPDATE`;
      }
      if (permissionId) await tx.$queryRaw`SELECT id FROM "SpecialPermission" WHERE id = ${permissionId} FOR UPDATE`;

      const inst = await tx.approvalInstance.findUnique({
        where: { id: route.id, organisationId: actor.organisationId },
        include: {
          steps: { orderBy: { sequence: "asc" } },
          requisition: { select: { id: true, reference: true } },
          exercise: { select: { id: true, reference: true } },
          award: { select: { id: true, reference: true } },
          supplierApplication: { select: { supplier: { select: { id: true, reference: true } } } },
          standingRequest: { select: { kind: true, supplier: { select: { id: true, reference: true } } } },
          specialPermission: { select: { exercise: { select: { id: true, reference: true } } } },
          certificate: { select: { id: true, kind: true, number: true, status: true, contract: { select: { id: true, number: true, status: true, award: { select: { awardeeName: true } } } } } },
          variation: { select: { id: true, reference: true, status: true, contract: { select: { id: true, number: true, status: true, award: { select: { awardeeName: true } } } } } },
          contractMatter: { select: { id: true, kind: true, reference: true, closedAt: true, closeReason: true, contract: { select: { id: true, number: true, status: true, award: { select: { awardeeName: true } } } } } },
        },
      });
      const step = inst?.steps.find((s) => s.id === stepId);
      if (!inst || !step) return { ok: false, message: "That step no longer exists." };
      // A cancelled contract's certificates are kept as they were (read under the contract's lock, code review run 2 item 5).
      // ADR 0031 (run 1a, BD-613-99): what /approvals allows on a contract's route is what the one act × status table
      // allows the act the route belongs to; it restates nothing. A cancelled contract keeps its words as before.
      const certRefused = inst.certificate?.kind ? actStatusFault(certificateAct(inst.certificate?.kind as CertificateKind, "PRE_ISSUE"), inst.certificate?.contract.status as ContractStatus) : null;
      if (certRefused) return { ok: false, message: certRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its certificates are kept as they were, and their routes are not escalated." : actStatusText(certRefused) };
      const variationRefused = inst.variation?.contract ? actStatusFault("VARIATION", inst.variation?.contract.status as ContractStatus) : null;
      if (variationRefused) return { ok: false, message: variationRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its variations are kept as they were, and their routes are not escalated." : actStatusText(variationRefused) };
      if (inst.variation?.status === "CLOSED") return { ok: false, message: "That variation is closed: its route is not escalated." };
      // 6.13 Part B run 1b C8b (BD-613-117, ADR 0031): a contract matter's route asks its kind's family row of the one table
      // (MATTER_FAMILY), under the matter's lock; it restates no state list. A closed matter's route is not escalated.
      const matterRefused = inst.contractMatter ? actStatusFault(MATTER_FAMILY[inst.contractMatter.kind as ContractMatterKind], inst.contractMatter.contract.status as ContractStatus) : null;
      if (matterRefused) return { ok: false, message: matterRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its matters are kept as they were, and their routes are not escalated." : actStatusText(matterRefused) };
      if (inst.contractMatter?.closedAt) return { ok: false, message: `That matter is closed (${inst.contractMatter.closeReason || "its reason recorded"}): its route is not escalated.` };
      // A certificate past its approval (being signed, issued or void) is not escalated: its route is closed with it.
      if (inst.certificate?.status != null && inst.certificate.status !== "DRAFT" && inst.certificate.status !== "IN_ROUTING") return { ok: false, message: "That certificate is past its approval route." };
      // A supplier matter belongs to no unit: no requisition, and its offices are held organisation-wide.
      const req = requisitionId
        ? await tx.requisition.findUniqueOrThrow({ where: { id: requisitionId, organisationId: actor.organisationId }, select: { organisationId: true, sectionUnitCode: true, requestingUnitCode: true, organisation: { select: { timeZone: true } } } })
        : { organisationId: inst.organisationId, sectionUnitCode: "", requestingUnitCode: "", organisation: await tx.organisation.findUniqueOrThrow({ where: { id: inst.organisationId }, select: { timeZone: true } }) };
      const today = todayIn(new Date(), req.organisation.timeZone);
      const [roles, units, roster, delegations] = await Promise.all([
        tx.authorityRole.findMany({ where: { organisationId: req.organisationId }, select: { code: true, nameEn: true, escalatesToCode: true } }),
        tx.orgUnit.findMany({ where: { organisationId: req.organisationId } }),
        loadRoster(actor.organisationCode, tx),
        loadDelegations(actor.organisationCode, tx),
      ]);
      const office = actingOffice(step);
      const on = today ? dayToDate(today) : new Date();
      const unitPath = requisitionId ? pathTo(units as unknown as OrgUnit[], req.sectionUnitCode || req.requestingUnitCode, on).reverse().map((u) => u.code) : [];
      const holders = office && today ? (supplierId || permissionId ? supplierHolders(office, roster, delegations, today) : holdersFor(office, unitPath, roster, delegations, today)) : { scope: null, holderIds: [], delegates: [] };
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
      const matter = inst.contractMatter?.id ? `${contractLabel({ number: inst.contractMatter.contract.number, award: { awardeeName: inst.contractMatter.contract.award.awardeeName } })} · ${MATTER_KIND_WORDS[inst.contractMatter.kind as ContractMatterKind].en} ${inst.contractMatter.reference ?? "(not yet numbered)"}` : inst.variation?.id ? `${contractLabel({ number: inst.variation.contract.number, award: { awardeeName: inst.variation.contract.award.awardeeName } })} · variation ${inst.variation.reference ?? "(not yet numbered)"}` : inst.certificate?.id ? `${contractLabel({ number: inst.certificate.contract.number, award: { awardeeName: inst.certificate.contract.award.awardeeName } })} · ${KIND_WORDS[inst.certificate.kind].en}${inst.certificate.number ? ` ${inst.certificate.number}` : ""}` : inst.award ? `${inst.award.reference} · appointment` : inst.exercise ? `${inst.exercise.reference} · ${exerciseRouteMatter(inst.domain).auditNoun}` : inst.supplierApplication ? `${inst.supplierApplication.supplier.reference} · Registration approval route` : inst.standingRequest ? `${inst.standingRequest.supplier.reference} · ${inst.standingRequest.kind === "BLACKLIST" ? "Blacklisting route" : "Blacklisting lift route"}` : inst.specialPermission ? `${inst.specialPermission.exercise.reference} · Special permission route` : `${inst.requisition?.reference ?? "Matter"}`;
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: req.organisationId, entity: "ApprovalStep", entityId: step.id, entityLabel: `${matter} · ${step.roleLabel}`, reason }, "UPDATE",
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
      const paths = ["/approvals", ...(requisitionId ? [`/requisitions/${requisitionId}`] : []), ...(inst.exercise ? [`/sourcing/${inst.exercise.id}`] : []), ...(inst.award ? [`/awards/${inst.award.id}`] : []), ...(supplierId ? [`/suppliers/${supplierId}`] : []), ...(route.specialPermission?.party.vendorId ? [`/suppliers/${route.specialPermission.party.vendorId}`] : []), ...(cert ? [`/projects/${cert.contractId}`, `/projects/${cert.contractId}/certificates/${cert.id}`] : []), ...(variation ? [`/projects/${variation.contractId}`, `/projects/${variation.contractId}/variations/${variation.id}`] : []), ...(contractMatter ? [`/projects/${contractMatter.contractId}`] : [])];
      return { ok: true, paths };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  for (const p of result.paths ?? []) revalidatePath(p);
  return { ok: result.ok, message: result.message, errors: result.errors };
}
