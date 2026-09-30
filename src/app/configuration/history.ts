"use server";

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
import { ORGANISATION_CODE } from "@/lib/org";

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
  "DocumentTemplate",
  "FundingRoute",
  "Meeting",
  "NotApprovedOutcome",
  "NotificationRule",
  "NumberingSeries",
  "SourcingMethod",
]);

export interface HistoryEntry {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  at: string;
  reason: string;
  actorName: string | null;
  unattributed: boolean;
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
const OFFICE_FIELDS = new Set(["secretariatRoleCode", "seatRoleCode"]);

/// A reader that turns stored codes and ids into what they stand for.
async function valueReader(): Promise<(field: string, value: string | null) => string | null> {
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
  if (!org) return (_f, v) => v;
  const [offices, people, committees, outcomes] = await Promise.all([
    db.authorityRole.findMany({ where: { organisationId: org.id }, select: { code: true, nameEn: true } }),
    db.person.findMany({ where: { organisationId: org.id }, select: { id: true, name: true } }),
    db.committee.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } }),
    db.notApprovedOutcome.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true } }),
  ]);
  const office = new Map(offices.map((o) => [o.code, o.nameEn]));
  const ids: Record<string, Map<string, string>> = {
    personId: new Map(people.map((p) => [p.id, p.name])),
    tabledByPersonId: new Map(people.map((p) => [p.id, p.name])),
    committeeId: new Map(committees.map((c) => [c.id, c.nameEn])),
    notApprovedOutcomeId: new Map(outcomes.map((o) => [o.id, o.nameEn])),
  };
  return (field, value) => {
    if (value == null) return null;
    if (VALUE_LABEL[field]?.[value]) return VALUE_LABEL[field][value];
    if (/Provenance$|^provenance$/.test(field)) return PROVENANCE[value] ?? value;
    if (OFFICE_FIELDS.has(field)) return office.get(value) ?? "An office no longer configured";
    if (ids[field]) return ids[field].get(value) ?? "A record no longer on file";
    if (/Id$/.test(field)) return "Another record";
    return value;
  };
}

/// One record's history, newest first.
export async function historyOf(entity: string, entityId: string): Promise<HistoryEntry[]> {
  if (!ENTITIES.has(entity) || !entityId) return [];
  const [rows, read] = await Promise.all([
    loadAudit(ORGANISATION_CODE, { entity, entityId, take: 100 }),
    valueReader(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    at: r.at.toISOString(),
    reason: r.reason,
    actorName: r.actorName,
    unattributed: r.unattributed,
    changes: r.changes.map((c) => ({
      field: c.field,
      before: read(c.field, c.before == null ? null : String(c.before)),
      after: read(c.field, c.after == null ? null : String(c.after)),
    })),
  }));
}
