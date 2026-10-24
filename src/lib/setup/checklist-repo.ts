import type { Tx } from "@/lib/audit/record";
import { awardReturnClassFault } from "@/lib/documents/award-return-class";
import { twoPersonOn } from "@/lib/auth/policy-store";
import { loadRegisterSettings } from "@/lib/portal/apply-repo";
import { dayOrNull, organisationDay, todayIn } from "@/lib/dates";

import { buildChecklist, type ChecklistFacts, type MatrixFact } from "./checklist";

const KINDS = ["TERMS_AND_CONDITIONS", "FALSE_DECLARATION", "GIRO_AUTHORISATION"] as const;

/// Reads the facts the checklist judges, for one organisation, and returns the items. Read-only.
export async function loadChecklist(db: Tx, organisationId: string, now = new Date()) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, registrationNo: true, addressLine1: true, timeZone: true, logo: { select: { id: true } } } });
  const today = todayIn(now, org.timeZone) ?? now.toISOString().slice(0, 10);
  const day = organisationDay(now, org.timeZone) ?? now;
  const year = Number(today.slice(0, 4));
  const live = { OR: [{ effectiveTo: null }, { effectiveTo: { gt: day } }] };
  const register = await loadRegisterSettings(db).catch(() => null); // one reader with the public form; a failure reads as closed
  const [matrices, assignments, committees, fees, window, evalModels, docTypes, texts, supplier, awardPolicy, budget, orgUnits, costCentres, two, sulitDecisions, postAward, storePolicy, contractTypes] = await Promise.all([
    db.authorityMatrix.findMany({ where: { organisationId }, select: { issuedAt: true, effectiveFrom: true, effectiveTo: true, issuedByPerson: { select: { name: true } }, rules: { select: { proposerCode: true, approverCode: true } } } }),
    db.roleAssignment.findMany({ where: { person: { organisationId }, effectiveFrom: { lte: day }, ...live }, select: { roleCode: true } }),
    db.committee.findMany({ where: { organisationId, retiredOn: null }, select: { quorum: true, members: { where: { isAlternate: false, effectiveFrom: { lte: day }, ...live }, select: { id: true } } } }),
    db.documentFeeFloor.count({ where: { organisationId } }),
    db.windowPolicy.findUnique({ where: { organisationId }, select: { calendarId: true, documentSaleMode: true, submissionChannel: true, noticeTemplateId: true, invitationTemplateId: true, addendumTemplateId: true } }),
    db.evaluationModel.findMany({ where: { organisationId, status: { in: ["ISSUED", "DRAFT"] } }, orderBy: { issuedAt: "desc" }, select: { status: true, issuedAt: true, issuedBy: { select: { name: true } } } }),
    db.supplierDocumentType.count({ where: { organisationId, retiredOn: null } }),
    db.declarationText.findMany({ where: { organisationId, retiredOn: null }, select: { kind: true, provenance: true } }),
    db.supplierPolicy.findUnique({ where: { organisationId }, select: { personalDataNoticeEn: true, personalDataProvenance: true, helpEmail: true, helpPhone: true } }),
    db.awardPolicy.findUnique({ where: { organisationId }, select: { loaTemplateId: true, declarationTemplateId: true, coveringMemoTemplateId: true } }),
    db.budgetSettings.findUnique({ where: { organisationId }, select: { availabilityCheck: true } }),
    db.orgUnit.count({ where: { organisationId, ...live } }),
    db.costCentre.count({ where: { organisationId, ...live } }),
    twoPersonOn(db, organisationId),
    db.rolePermission.count({ where: { organisationId, permissionKey: "sulit.read.organisation" } }),
    db.postAwardPolicy.findUnique({ where: { organisationId }, select: { contractorPortalSigning: true } }),
    db.documentStorePolicy.findUnique({ where: { organisationId }, select: { awardReturnClass: { select: { classification: true } } } }),
    db.contractType.findMany({ where: { organisationId, retiredOn: null }, select: { paymentRoute: true } }),
  ]);
  const calendar = window?.calendarId
    ? { yearRow: (await db.holidayCalendarYear.count({ where: { calendarId: window.calendarId, year } })) > 0, thisYear: await db.publicHoliday.count({ where: { calendarId: window.calendarId, day: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } }) }
    : { yearRow: false, thisYear: 0 };
  const slots = [window?.noticeTemplateId, window?.invitationTemplateId, window?.addendumTemplateId, awardPolicy?.loaTemplateId, awardPolicy?.declarationTemplateId, awardPolicy?.coveringMemoTemplateId];
  const issuedModels = evalModels.filter((m) => m.status === "ISSUED");
  const facts: ChecklistFacts = {
    today,
    twoPersonOn: two,
    organisation: { name: org.name, registrationNo: org.registrationNo, address: org.addressLine1, hasLogo: !!org.logo },
    orgUnits,
    costCentres,
    matrices: matrices.map((m): MatrixFact => ({
      issued: m.issuedAt != null,
      effectiveFrom: dayOrNull(m.effectiveFrom) ?? "",
      effectiveTo: dayOrNull(m.effectiveTo),
      issuedBy: m.issuedAt && m.issuedByPerson ? { name: m.issuedByPerson.name, at: m.issuedAt } : null,
      offices: [...new Set(m.rules.flatMap((r) => [r.proposerCode, r.approverCode]).filter((c): c is string => !!c))],
    })),
    officesHeldToday: assignments.map((a) => a.roleCode),
    assignmentsToday: assignments.length,
    committees: committees.map((c) => ({ quorum: c.quorum, liveMembers: c.members.length })),
    documentFeeFloors: fees,
    holidays: { calendarSet: !!window?.calendarId, ...calendar },
    evaluation: { issued: issuedModels.length, draft: evalModels.length - issuedModels.length, issuedBy: issuedModels[0]?.issuedAt && issuedModels[0].issuedBy ? { name: issuedModels[0].issuedBy.name, at: issuedModels[0].issuedAt } : null },
    supplierDocumentTypes: docTypes,
    declarationsFirm: KINDS.filter((k) => texts.some((t) => t.kind === k && t.provenance !== "ASSUMED")).length,
    personalDataNoticeFirm: !!supplier?.personalDataNoticeEn?.trim() && !!supplier.personalDataProvenance && supplier.personalDataProvenance !== "ASSUMED",
    helpContact: !!supplier?.helpEmail?.trim() || !!supplier?.helpPhone?.trim(),
    registration: { open: register != null && register.missing.length === 0, missing: register?.missing.map((m) => m.en) ?? [] },
    letterSlotsSet: slots.filter(Boolean).length,
    letterSlots: slots.length,
    budgetCheckSet: !!budget?.availabilityCheck?.trim(),
    saleChannelSet: !!window?.documentSaleMode,
    submissionChannelSet: !!window?.submissionChannel,
    sulitReadersDecided: sulitDecisions > 0,
    contractorPortalSigning: postAward?.contractorPortalSigning === true,
    awardReturnClassSet: awardReturnClassFault(storePolicy?.awardReturnClass ?? null) === null,
    contractTypes: { active: contractTypes.length, withRoute: contractTypes.filter((t) => t.paymentRoute != null).length },
  };
  return { items: buildChecklist(facts), facts };
}
