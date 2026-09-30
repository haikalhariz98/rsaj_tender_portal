"use server";

import { loadAudit } from "@/lib/audit/record";
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

/// One record's history, newest first.
export async function historyOf(entity: string, entityId: string): Promise<HistoryEntry[]> {
  if (!ENTITIES.has(entity) || !entityId) return [];
  const rows = await loadAudit(ORGANISATION_CODE, { entity, entityId, take: 100 });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    at: r.at.toISOString(),
    reason: r.reason,
    actorName: r.actorName,
    unattributed: r.unattributed,
    changes: r.changes.map((c) => ({
      field: c.field,
      before: c.before == null ? null : String(c.before),
      after: c.after == null ? null : String(c.after),
    })),
  }));
}
