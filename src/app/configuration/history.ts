"use server";

import { CORE_ROUTING_ENTITIES, CORE_ROUTING_ENTITY_NAME, coreRoutingEntryName, coreRoutingTrailPrefix } from "@/lib/audit/core-routing-trail";
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
import { ORGANISATION_CODE } from "@/lib/org";
import { ACT_LABEL } from "@/lib/labels";
import { formatOrgDateTime } from "@/lib/format";

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
]);

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
};
const PROVENANCE: Record<string, string> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };

/// Where one entity stores a code under a field name another uses for something else —
/// a requisition's status is not a sitting's — the entity's own labels win.
const ENTITY_VALUE_LABEL: Record<string, Record<string, Record<string, string>>> = {
  Requisition: { status: STATUS_LABEL, origin: { PORTAL: "Raised in the portal", EXTERNAL: "Received from the finance system" } },
  FinanceIntegration: { budgetCheckSource: SOURCE_LABEL },
  DocumentClass: { classification: CLASSIFICATION_LABEL, retentionTrigger: RETENTION_TRIGGER_LABEL, disposalMethod: DISPOSAL_METHOD_LABEL },
  SourcingMethod: { scopeAct: ACT_LABEL },
};
/// Yes or No where a stored flag is a boolean.
const FLAG_FIELDS = new Set(["requiresCompanyEstimate", "requiresBq", "scopeApprovalRequired"]);
const DELIVERABLE_VALUE: Record<string, string> = { GOODS_DELIVERED: "Goods delivered", MEASURED_CONSTRUCTION: "Measured construction", TERM_PERFORMANCE: "Performance over a term" };
const OFFICE_FIELDS = new Set(["secretariatRoleCode", "seatRoleCode", "disposalAuthorityRoleCode"]);

/// A reader that turns stored codes and ids into what they stand for.
async function valueReader(entity = ""): Promise<(field: string, value: string | null) => string | null> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
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
    if (FLAG_FIELDS.has(field)) return value === "true" ? "Yes" : value === "false" ? "No" : value;
    if (field === "deliverableKind" && DELIVERABLE_VALUE[value]) return DELIVERABLE_VALUE[value];
    if (field === "orgUnitCode") return units.get(value) ?? "A unit no longer in the structure";
    if (field === "scopeCommitteeCode") return committees.find((c) => c.code === value)?.nameEn ?? "A committee no longer configured";
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
  if (!ENTITIES.has(entity) || !entityId) return [];
  const issue = entity === "AuthorityMatrix" ? await db.authorityMatrix.findUnique({ where: { id: entityId }, select: { label: true } }) : null;
  const [own, core, read, org] = await Promise.all([
    loadAudit(ORGANISATION_CODE, { entity, entityId, take: 100 }),
    issue
      ? loadAudit(ORGANISATION_CODE, { entities: CORE_ROUTING_ENTITIES, labelPrefix: coreRoutingTrailPrefix(issue.label), take: 100 })
      : Promise.resolve([]),
    valueReader(entity),
    db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { timeZone: true } }),
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
    changes: r.changes.map((c) => ({
      field: c.field,
      before: read(c.field, c.before == null ? null : String(c.before)),
      after: read(c.field, c.after == null ? null : String(c.after)),
    })),
  }));
}
