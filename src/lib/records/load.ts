import { db } from "@/lib/db";

/**
 * Document classes, the templates that render them, and what the portal sends.
 *
 * Three small configuration lists that share a loader because every screen that shows
 * one wants at least one of the others: a template belongs to a class, and a
 * notification names the offices a class is released to.
 */

export interface DocumentClass {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  /// Null means nobody has set a retention period. Not the same as zero — the portal
  /// must never dispose of a record on an assumption.
  retentionMonths: number | null;
  controlledCopy: boolean;
  releaseNeedsApproval: boolean;
  provenance: string;
  notes: string;
  sortOrder: number;
}

export interface DocumentTemplate {
  id: string;
  code: string;
  nameEn: string;
  nameMs: string | null;
  formCode: string;
  revisionDate: Date | null;
  bilingual: boolean;
  documentClassId: string | null;
  provenance: string;
  notes: string;
  sortOrder: number;
  /// The body as configured (ADR 0008); null is not configured.
  bodyMs: string | null;
  bodyEn: string | null;
  primaryLanguage: "MS" | "EN" | null;
  bodyVersion: number;
}

export interface NotificationRule {
  id: string;
  eventKey: string;
  nameEn: string;
  recipientRoleCodes: string[];
  reminderOffsetDays: number[];
  escalatesToRoleCode: string | null;
  isActive: boolean;
  provenance: string;
  notes: string;
  sortOrder: number;
}

export async function loadDocumentClasses(organisationCode: string): Promise<DocumentClass[]> {
  const org = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!org) return [];

  const rows = await db.documentClass.findMany({
    where: { organisationId: org.id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nameEn: r.nameEn,
    nameMs: r.nameMs,
    retentionMonths: r.retentionMonths,
    controlledCopy: r.controlledCopy,
    releaseNeedsApproval: r.releaseNeedsApproval,
    provenance: r.provenance as string,
    notes: r.notes,
    sortOrder: r.sortOrder,
  }));
}

export async function loadTemplates(organisationCode: string): Promise<DocumentTemplate[]> {
  const org = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!org) return [];

  const rows = await db.documentTemplate.findMany({
    where: { organisationId: org.id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nameEn: r.nameEn,
    nameMs: r.nameMs,
    formCode: r.formCode,
    revisionDate: r.revisionDate,
    bilingual: r.bilingual,
    documentClassId: r.documentClassId,
    provenance: r.provenance as string,
    notes: r.notes,
    sortOrder: r.sortOrder,
    bodyMs: r.bodyMs,
    bodyEn: r.bodyEn,
    primaryLanguage: r.primaryLanguage as "MS" | "EN" | null,
    bodyVersion: r.bodyVersion,
  }));
}

export async function loadNotificationRules(
  organisationCode: string,
): Promise<NotificationRule[]> {
  const org = await db.organisation.findUnique({
    where: { code: organisationCode },
    select: { id: true },
  });
  if (!org) return [];

  const rows = await db.notificationRule.findMany({
    where: { organisationId: org.id },
    orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    eventKey: r.eventKey,
    nameEn: r.nameEn,
    recipientRoleCodes: r.recipientRoleCodes,
    reminderOffsetDays: r.reminderOffsetDays,
    escalatesToRoleCode: r.escalatesToRoleCode,
    isActive: r.isActive,
    provenance: r.provenance as string,
    notes: r.notes,
    sortOrder: r.sortOrder,
  }));
}
