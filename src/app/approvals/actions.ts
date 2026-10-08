"use server";

import { exerciseIsHidden, hiddenExercises } from "@/app/_auth/sulit";
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
import { ACT_LABEL } from "@/lib/labels";
import { toAuditActor, staffForAct } from "@/app/_auth/actor";
import type { StaffActor } from "@/lib/auth/types";
import { absenceVerdict, reportWords, stayText, type AbsenceReport } from "@/lib/approvals/absence-move";
import { loadWorklist } from "@/lib/approvals/load";
import { stepEscalatedNotices, stepMovedOnAbsenceNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { loadReportingLines } from "@/lib/people/reporting-line-store";
import { superiorsNote } from "@/lib/people/reporting-lines";
import { attributionRefusalState, beginAct, type PreparedAct } from "@/app/_auth/act";

/**
 * Escalate a pending person step (FR-APR-009, FR-APR-010, FR-APR-012; rulings CO-6,
 * CO-7, C4): for want of anyone able to act, or on a declared conflict of interest. One
 * action for every route — requisition, name approval, appointment — because the step
 * and its rules are the same.
 *
 * It takes the locks every write on the matter takes, in the same order — the
 * requisition, then the exercise, then the award — and re-reads the step, the route, the
 * roster and the offices inside the transaction. The step's own office is never
 * rewritten; the acting office, the reason and, for a conflict, the declarer (the
 * signed-in holder: a conflict is declared by the person who has it, Phase 2b) are
 * written beside it with the audit row.
 */
export async function escalateStep(_prev: FormState, data: FormData): Promise<FormState> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  if (!holderGuard.ok) return holderGuard.state;
  const actor = holderGuard.actor;
  const r = new FormReader(data);
  const stepId = r.text("stepId", "Step", { required: true });
  const kind = r.choice("kind", "Why", ["NO_AVAILABLE_HOLDER", "CONFLICT_DECLARED"] as const, { required: true });
  const reason = r.text("reason", "Reason", { max: 2000 });
  if (!reason) r.reject("reason", "Say why the step is escalated.");
  if (r.failed || !kind) return { ok: false, errors: r.errors };
  // A conflict is declared by the person who has it: the signed-in holder (Phase 2b). Escalating for want of anyone able to act declares nothing.
  let act: PreparedAct | null = null;
  if (kind === "CONFLICT_DECLARED") {
    const begun = await beginAct(actor, data, "ApprovalStep.declaredBy", { personField: "declaredByPersonId" });
    if (!begun.ok) return begun.state;
    act = begun.act;
  }
  const declarerId = act?.subjectPersonId ?? null;
  return escalateOne(actor, { stepId, kind, reason, act, declarerId, mode: "OFFICER" });
}

/// What the escalation was asked for: the officer's own (a conflict declared, or nobody able to act), or the sweep that follows an absence being recorded.
interface EscalateInput {
  stepId: string;
  kind: "NO_AVAILABLE_HOLDER" | "CONFLICT_DECLARED";
  reason: string;
  /// The declaration's attribution, for a conflict; null otherwise.
  act: PreparedAct | null;
  declarerId: string | null;
  mode: "OFFICER" | "ABSENCE";
  /// The people whose absence moved it, for the notice (mode ABSENCE).
  absentNames?: string[];
}

/// Where the step went, for the sweep's report and the notices.
interface EscalateInfo {
  matter: string;
  from: string;
  to: string;
}

/// A form state that also says where the step went, for the sweep. Named, so that the function's return type holds no brace (the source scans find a function by its signature).
interface EscalateOutcome extends FormState {
  info?: EscalateInfo;
}

/**
 * The escalation of one step, under the locks every write on its matter takes (the body escalateStep had, moved here unchanged in order so that the sweep after an absence
 * (`moveStepsOfAbsentHolders`) takes the very same locks, checks and audit, and neither can drift from the other). Not exported: a server action file exports only actions.
 */
async function escalateOne(actor: StaffActor, i: EscalateInput): Promise<EscalateOutcome> {
  const { stepId, kind, reason, act, declarerId } = i;
  const found = await db.approvalStep.findUnique({
    where: { id: stepId, instance: { organisationId: actor.organisationId } },
    select: { instance: { select: { id: true, requisitionId: true, exerciseId: true, awardId: true, exercise: { select: { requisitionId: true } }, supplierApplicationId: true, supplierApplication: { select: { supplierId: true } }, standingRequestId: true, standingRequest: { select: { supplierId: true } }, specialPermissionId: true, specialPermission: { select: { party: { select: { vendorId: true } } } }, certificateId: true, certificate: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } }, variationId: true, variation: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } }, contractMatterId: true, contractMatter: { select: { contractId: true, contract: { select: { awardId: true, award: { select: { exerciseId: true, exercise: { select: { requisitionId: true } } } } } } } } } } },
  });
  if (!found) return { ok: false, message: "That step no longer exists." };
  const route = found.instance;
  // FR-MTD-007: a step on the route of a restricted exercise (its name, its award, a special permission on it) reads as gone to anyone not named on the
  // exercise, and the attempt is logged. A route behind a contract is the contract's, which is not hidden.
  const behind = route.exerciseId ?? (route.specialPermissionId ? ((await db.specialPermission.findFirst({ where: { id: route.specialPermissionId, exercise: { organisationId: actor.organisationId } }, select: { exerciseId: true } }))?.exerciseId ?? null) : null);
  // The sweep after an absence (mode ABSENCE) moves a step on a restricted exercise without showing it to whoever recorded the absence: it names nothing of it in its report, and the notices it raises are
  // hidden from anyone not named on the exercise like every other record of it.
  if (behind && i.mode !== "ABSENCE" && (await exerciseIsHidden(actor, behind))) return { ok: false, message: "That step no longer exists." };
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

  let result: FormState & { paths?: string[]; info?: EscalateInfo };
  try {
  result = await db.$transaction(
    async (tx): Promise<FormState & { paths?: string[]; info?: EscalateInfo }> => {
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
            escalatedOn: after.escalatedOn,
          },
        ));
      if (act) await act.write(tx, step.id);
      // Phase 3c: the people the step now waits on are told, in the portal (the staff inbox), and the immediate superior on record is named where reporting lines
      // are recorded; where they are not, the notice says "Reporting line not set". Written in this transaction with a key that a retry meets and skips.
      const lines = await loadReportingLines(tx, req.organisationId);
      const superiors = superiorsNote(lines, holders.holderIds, on, (id) => people.get(id)?.name ?? "A person no longer on record");
      const toHolders = today ? (supplierId || permissionId ? supplierHolders(verdict.toRoleCode, roster, delegations, today) : holdersFor(verdict.toRoleCode, unitPath, roster, delegations, today)) : null;
      const told = toHolders ? [...toHolders.holderIds, ...toHolders.delegates.map((d) => d.personId)].filter((id) => people.get(id)?.isActive) : [];
      const ref = { label: matter, href: "/approvals?tab=mine", exerciseId: behind ?? null };
      const by = actor.system ? null : actor.personId;
      await writeNotices(
        tx,
        req.organisationId,
        by,
        i.mode === "ABSENCE"
          ? stepMovedOnAbsenceNotices({ stepId: step.id, escalationCount: after.escalationCount, matter: ref, actLabel: ACT_LABEL[step.act]?.toLowerCase() ?? "decision", fromOffice: step.actingRoleLabel ?? step.roleLabel, toOffice: after.actingRoleLabel, absentName: (i.absentNames ?? []).join(", ") || "the holder", recipients: told, by, superiorNote: superiors.text })
          : stepEscalatedNotices({ stepId: step.id, escalationCount: after.escalationCount, matter: ref, actLabel: ACT_LABEL[step.act]?.toLowerCase() ?? "decision", fromOffice: step.actingRoleLabel ?? step.roleLabel, toOffice: after.actingRoleLabel, whyLabel: ESCALATION_KIND_LABEL[kind], reason, recipients: told, by, superiorNote: superiors.text }),
      );
      const paths = ["/approvals", ...(requisitionId ? [`/requisitions/${requisitionId}`] : []), ...(inst.exercise ? [`/sourcing/${inst.exercise.id}`] : []), ...(inst.award ? [`/awards/${inst.award.id}`] : []), ...(supplierId ? [`/suppliers/${supplierId}`] : []), ...(route.specialPermission?.party.vendorId ? [`/suppliers/${route.specialPermission.party.vendorId}`] : []), ...(cert ? [`/projects/${cert.contractId}`, `/projects/${cert.contractId}/certificates/${cert.id}`] : []), ...(variation ? [`/projects/${variation.contractId}`, `/projects/${variation.contractId}/variations/${variation.id}`] : []), ...(contractMatter ? [`/projects/${contractMatter.contractId}`] : [])];
      return { ok: true, paths, info: { matter, from: step.actingRoleLabel ?? step.roleLabel, to: after.actingRoleLabel } };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
  } catch (e) {
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  for (const p of result.paths ?? []) revalidatePath(p);
  return { ok: result.ok, message: result.message, errors: result.errors, info: result.info };
}

/// What the sweep after an absence did, for the caller to say in words.
export interface AbsenceSweep {
  /// What it did, as sentences (`reportWords`). A step on a record the reader may not see is counted and not named.
  words: string[];
  /// How many steps it moved, and how many stay where they are. Counts only: nothing here names a person or a restricted record.
  moved: number;
  stayed: number;
  /// Set where nothing was looked at because the person asking may not move approval steps (an administrator account); what it says is for them to read.
  refused?: string;
}

/**
 * Move the pending steps whose office has nobody able to act, now that a holder is away (FR-APR-012). Called when someone is marked absent, and again from the
 * worklist ("Move steps held by people who are away"): it can be run as often as wanted and does the same thing, because a step is moved only while its acting
 * office has nobody able to act, and a retry writes no notice twice.
 *
 * It moves a step only where the reporting line says who is above the people who hold the office (`absenceVerdict`). Otherwise the step stays put and the report
 * says why. It is `escalateOne`'s, so every check of an officer's escalation applies: never a committee's step, never a mandatory act for a vacancy, never down,
 * never onto an office already on the route. The audit row is the signed-in person's who recorded the absence, with the reason "Moved automatically".
 *
 * Moving a step is an escalation, and an administrator account is kept apart from transactions (ADR 0034 D9, threat model F7) exactly as `escalateStep` keeps it: asked first,
 * so no way into `escalateOne` skips the refusal. `onlyFor` limits what is looked at, not only what is reported: marking one person away moves the steps that person holds
 * and no one else's; the organisation-wide sweep is the worklist button's.
 */
export async function moveStepsOfAbsentHolders(onlyFor?: string): Promise<AbsenceSweep> {
  const holderGuard = await staffForAct("HOLDER_CHECKED");
  const empty: AbsenceSweep = { words: [], moved: 0, stayed: 0 };
  if (!holderGuard.ok) return { ...empty, refused: holderGuard.state.message ?? "An administrator account does not move approval steps." };
  const actor = holderGuard.actor;
  // Everything pending is looked at, so a step is not left because the person recording the absence cannot see its record; the report names only what they can see.
  const [all, visible] = await Promise.all([loadWorklist(actor, []), loadWorklist(actor, await hiddenExercises(actor))]);
  if (!all || !all.today) return empty;
  const visibleSteps = new Set(visible?.groups.flatMap((g) => g.items.map((i) => i.stepId)) ?? []);
  const [lines, roster] = await Promise.all([loadReportingLines(db, actor.organisationId), loadRoster(actor.organisationCode)]);
  const nameOf = new Map(roster.people.map((p) => [p.id, p.name]));
  const on = dayToDate(all.today);
  const report: AbsenceReport = { moved: [], stayed: [] };
  // Limited to one person's steps when the caller asks (the sweep after that person was marked away): the others are not looked at, let alone moved.
  const items = all.groups
    .flatMap((g) => g.items)
    .filter((i) => i.noneAvailable && !i.committee && (!onlyFor || i.holderIds.includes(onlyFor)))
    .sort((a, b) => a.stepId.localeCompare(b.stepId));
  for (const item of items) {
    const name = visibleSteps.has(item.stepId) ? item.matterLabel : null;
    const verdict = absenceVerdict({ holderIds: item.holderIds, lines, on });
    if (!verdict.move) {
      report.stayed.push({ stepId: item.stepId, matter: name, why: stayText(verdict.why, verdict.holderIdsWithoutLine.map((id) => nameOf.get(id) ?? "A person no longer on record")) });
      continue;
    }
    const away = item.holderIds.filter((id) => roster.people.some((p) => p.id === id && (!p.isAvailable || !p.isActive)));
    const absentNames = away.map((id) => nameOf.get(id) ?? "A person no longer on record");
    const moved = await escalateOne(actor, {
      stepId: item.stepId,
      kind: "NO_AVAILABLE_HOLDER",
      reason: `Moved automatically: ${absentNames.join(", ") || "the holder"} ${absentNames.length === 1 ? "is" : "are"} marked absent, and nobody able to act holds the office.`,
      act: null,
      declarerId: null,
      mode: "ABSENCE",
      absentNames,
    });
    if (moved.ok && moved.info) report.moved.push({ stepId: item.stepId, matter: name, from: moved.info.from, to: moved.info.to });
    else report.stayed.push({ stepId: item.stepId, matter: name, why: moved.message ?? Object.values(moved.errors ?? {})[0] ?? "It could not be moved." });
  }
  return { words: reportWords(report), moved: report.moved.length, stayed: report.stayed.length };
}
