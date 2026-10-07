"use server";

import { CORE_ROUTING_ENTITIES, CORE_ROUTING_ENTITY_NAME, coreRoutingEntryName, coreRoutingTrailPrefix } from "@/lib/audit/core-routing-trail";
import { isSumAdjustmentTrigger, SUM_ADJUSTMENT_TRIGGER_WORDS } from "@/lib/method/behaviour-twins";
import { VARIANT_WORDS } from "@/lib/supervision/labels";
import { loadAudit } from "@/lib/audit/record";
import {
  MATTER_KIND_LABEL,
  MEETING_STATUS_LABEL,
  NOT_APPROVED_KIND_LABEL,
  OUTCOME_LABEL,
  POSITION_LABEL,
  VOTING_RULE_LABEL,
  CHOICE_LABEL,
} from "@/lib/committee/labels";
import { db } from "@/lib/db";
import { CLASSIFICATION_LABEL, DISPOSAL_METHOD_LABEL, RETENTION_TRIGGER_LABEL } from "@/lib/documents/labels";
import { SOURCE_LABEL, SPLIT_KEY_LABEL, STATUS_LABEL, TIER_LABEL } from "@/lib/requisition/labels";
import { ACT_LABEL } from "@/lib/labels";
import { formatOrgDateTime } from "@/lib/format";
import { requireStaff } from "@/app/_auth/actor";
import { ACCOUNT_STATUS_WORDS } from "@/lib/auth/words";
import type { OrgScope } from "@/lib/org-scope";

/// The entities whose history a screen may ask for. Anything else is refused rather
/// than read, so the action cannot be used to page through the whole trail.
const ENTITIES = new Set([
  "AuthorityMatrix",
  "AuthorityRule",
  "Committee",
  "CommitteeDecision",
  "CommitteeMember",
  "ContractType",
  "DocumentClass",
  "DocumentStorePolicy",
  "DocumentTemplate",
  "FundingRoute",
  "Meeting",
  "NotApprovedOutcome",
  "PostAwardPolicy",
  "NotificationRule",
  "NumberingSeries",
  "SourcingMethod",
  "Requisition",
  "RequisitionPolicy",
  "FinanceIntegration",
  "ScopePolicy",
  "Qualification",
  "PersonQualification",
  "BqTemplate",
  "BqTemplateSection",
  "SpecPanelColumn",
  "ContractBasis",
  "TenderDocumentPart",
  "TenderDocumentPolicy",
  // 6.5: Invitation controls.
  "WindowPolicy",
  "PublicationChannel",
  "DocumentFeeFloor",
  "HolidayCalendar",
  "HolidayCalendarYear",
  "PublicHoliday",
  // 6.14: a form's signature blocks and distribution list, and the routing sheet types, their checks and targets
  // (increment 1 offered their History but the set did not name them, so it read empty); increment 2's printed
  // fields, typing corrections and terms.
  "FormSignatureBlock",
  "FormDistribution",
  "RoutingSheetType",
  "RoutingCheckDef",
  "RoutingTarget",
  "FormField",
  "TextCorrection",
  "Term",
  // Found by the history-entities scan (6.14 inc 2, BD-614-34 as ruled): every entity a Configuration History button
  // asks for, from the other configuration screens, which the set did not name, so their History read empty.
  "AppointmentLetterVariant",
  "ApprovedIssuer",
  "AwardPolicy",
  "ClassificationTaxonomy",
  "ClauseText",
  "ConditionPrecedentKind",
  "ContractDocumentPart",
  "ContractPolicy",
  "ControlledCopyRecipient",
  "DistributionRecipient",
  "EvaluationAspect",
  "EvaluationModel",
  "EvaluationPolicy",
  "InsuranceRequirement",
  "JustificationReason",
  "LiabilityBand",
  "MethodChecklistItem",
  "OpeningPolicy",
  "RateSchedule",
  "RegistrationBody",
  "RegistrationValue",
  "StandingReason",
  "SupplierDocumentType",
  "SupplierListValue",
  "SupplierPolicy",
  // Phase 1b: a sign-in account's trail (who made it, disabled it, issued it a code). Administrators only: see `historyOf`.
  "StaffAccount",
  // Phase 2c: the organisation's sign-in settings, and a two-person change with who proposed and who decided it. Administrators only: see `historyOf`.
  "SecurityPolicy",
  "ConfigurationChange",
]);

/// Entities whose configuration key is not part of what their history shows (the name is); older rows carry it.
const CODE_HIDDEN = new Set(["PublicationChannel", "HolidayCalendar"]);

export interface HistoryEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  at: string;
  /// The moment, as the organisation reads it (its day and its clock).
  when: string;
  reason: string;
  actorName: string | null;
  unattributed: boolean;
  /// For an entry about a part of the record rather than the record itself (an issue's
  /// core routing row or step): which part, in words. Null for the record's own entries.
  part: string | null;
  changes: { field: string; before: string | null; after: string | null }[];
}

/// Stored values that are codes, and how they read. Codes never reach a screen.
const VALUE_LABEL: Record<string, Record<string, string>> = {
  status: MEETING_STATUS_LABEL,
  outcome: OUTCOME_LABEL,
  votingRule: VOTING_RULE_LABEL,
  kind: NOT_APPROVED_KIND_LABEL,
  matterKind: MATTER_KIND_LABEL,
  position: POSITION_LABEL,
  choice: CHOICE_LABEL,
  action: { APPROVES: "Approves", RECOMMENDS: "Recommends", CONSENTS: "Consents", DECIDES: "Decides" },
  // 6.13 Part A: a contract type's delegation letters.
  delegationVariant: Object.fromEntries(Object.entries(VARIANT_WORDS).map(([k, v]) => [k, v.en])),
};
const PROVENANCE: Record<string, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };

/// Where one entity stores a code under a field name another uses for something else —
/// a requisition's status is not a sitting's — the entity's own labels win.
const ENTITY_VALUE_LABEL: Record<string, Record<string, Record<string, string>>> = {
  Requisition: { status: STATUS_LABEL, origin: { PORTAL: "Raised in the portal", EXTERNAL: "Received from the finance system" } },
  FinanceIntegration: { budgetCheckSource: SOURCE_LABEL },
  DocumentClass: { classification: CLASSIFICATION_LABEL, retentionTrigger: RETENTION_TRIGGER_LABEL, disposalMethod: DISPOSAL_METHOD_LABEL },
  SourcingMethod: { scopeAct: ACT_LABEL },
  StaffAccount: { status: ACCOUNT_STATUS_WORDS },
};
/// Yes or No where a stored flag is a boolean.
const FLAG_FIELDS = new Set(["requiresCompanyEstimate", "requiresBq", "scopeApprovalRequired", "completenessEliminates"]);
const DELIVERABLE_VALUE: Record<string, string> = { GOODS_DELIVERED: "Goods delivered", MEASURED_CONSTRUCTION: "Measured construction", TERM_PERFORMANCE: "Performance over a term" };
const OFFICE_FIELDS = new Set(["secretariatRoleCode", "seatRoleCode", "disposalAuthorityRoleCode"]);

/// A reader that turns stored codes and ids into what they stand for.
async function valueReader(scope: OrgScope, entity = ""): Promise<(field: string, value: string | null) => string | null> {
  const org = await db.organisation.findUnique({ where: { id: scope.organisationId }, select: { id: true } });
  if (!org) return (_f, v) => v;
  const [offices, people, committees, outcomes, orgUnits] = await Promise.all([
    db.authorityRole.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } }),
    db.person.findMany({ where: { organisationId: org.id }, select: { id: true, name: true } }),
    db.committee.findMany({ where: { organisationId: org.id }, select: { id: true, code: true, nameEn: true } }),
    db.notApprovedOutcome.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } }),
    db.orgUnit.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } }),
  ]);
  const units = new Map(orgUnits.map((u) => [u.code, u.nameEn]));
  const office = new Map(offices.map((o) => [o.code, o.nameEn]));
  const ids: Record<string, Map<string, string>> = {
    personId: new Map(people.map((p) => [p.id, p.name])),
    tabledByPersonId: new Map(people.map((p) => [p.id, p.name])),
    committeeId: new Map(committees.map((c) => [c.id, c.nameEn])),
    notApprovedOutcomeId: new Map(outcomes.map((o) => [o.id, o.nameEn])),
  };
  return (field, value) => {
    if (value == null) return null;
    if (ENTITY_VALUE_LABEL[entity]?.[field]?.[value]) return ENTITY_VALUE_LABEL[entity][field][value];
    if (entity === "RequisitionPolicy" && field === "endorsementTiers") {
      return value ? value.split(", ").map((t) => TIER_LABEL[t as keyof typeof TIER_LABEL] ?? t).join(", ") : "Not set";
    }
    if (entity === "RequisitionPolicy" && field === "splittingMatchOn") {
      return value ? value.split(", ").map((k) => SPLIT_KEY_LABEL[k as keyof typeof SPLIT_KEY_LABEL] ?? k).join(", ") : "Not set";
    }
    // 6.13 Part A step 1: a contract type's typed adjustment triggers, a list of codes, in words.
    if (entity === "ContractType" && field === "sumAdjustmentTriggers") {
      return value ? value.split(",").map((t) => t.trim()).map((t) => (isSumAdjustmentTrigger(t) ? SUM_ADJUSTMENT_TRIGGER_WORDS[t].en : "—")).join(", ") : "Not set";
    }
    if (FLAG_FIELDS.has(field)) return value === "true" ? "Yes" : value === "false" ? "No" : value;
    if (field === "deliverableKind" && DELIVERABLE_VALUE[value]) return DELIVERABLE_VALUE[value];
    if (field === "orgUnitCode") return units.get(value) ?? "A unit no longer in the structure";
    if (field === "scopeCommitteeCode" || field === "lateAdmissionCommitteeCode") return committees.find((c) => c.code === value)?.nameEn ?? "A committee no longer configured";
    if (VALUE_LABEL[field]?.[value]) return VALUE_LABEL[field][value];
    if (/Provenance$|^provenance$/.test(field)) return PROVENANCE[value] ?? value;
    if (OFFICE_FIELDS.has(field)) return office.get(value) ?? "An office no longer configured";
    if (ids[field]) return ids[field].get(value) ?? "A record no longer on file";
    if (/Id$/.test(field)) return "Another record";
    return value;
  };
}

/// One record's history, newest first. An issue's history also holds the entries of its
/// core routing rows and steps (found by their label, which begins with the issue's), so
/// a row or step that has since been removed is still reachable.
export async function historyOf(entity: string, entityId: string): Promise<HistoryEntry[]> {
  const actor = await requireStaff();
  if (!ENTITIES.has(entity) || !entityId) return [];
  // A sign-in account's trail names sign-in names and why codes were issued: for the people who administer accounts.
  if ((entity === "StaffAccount" || entity === "SecurityPolicy" || entity === "ConfigurationChange") && !actor.isAdministrator) return [];
  const issue = entity === "AuthorityMatrix" ? await db.authorityMatrix.findUnique({ where: { id: entityId, organisationId: actor.organisationId }, select: { label: true } }) : null;
  const [own, core, read, org] = await Promise.all([
    loadAudit(actor.organisationCode, { entity, entityId, take: 100 }),
    issue
      ? loadAudit(actor.organisationCode, { entities: CORE_ROUTING_ENTITIES, labelPrefix: coreRoutingTrailPrefix(issue.label), take: 100 })
      : Promise.resolve([]),
    valueReader(actor, entity),
    db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { timeZone: true } }),
  ]);
  const rows = [...own, ...core].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 100);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    at: r.at.toISOString(),
    when: formatOrgDateTime(r.at, org?.timeZone ?? null),
    reason: r.reason,
    actorName: r.actorName,
    unattributed: r.unattributed,
    part: issue && r.entity in CORE_ROUTING_ENTITY_NAME ? (coreRoutingEntryName(r.entityLabel, issue.label) ?? "Core routing") : null,
    changes: r.changes.filter((c) => !(c.field === "code" && CODE_HIDDEN.has(entity))).map((c) => ({
      field: c.field,
      before: read(c.field, c.before == null ? null : String(c.before)),
      after: read(c.field, c.after == null ? null : String(c.after)),
    })),
  }));
}
