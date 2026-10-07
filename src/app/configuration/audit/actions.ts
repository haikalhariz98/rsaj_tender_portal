"use server";

import { revalidatePath } from "next/cache";

import { diffFields } from "@/lib/audit/diff";
import { actorDisplayName } from "@/lib/audit/actor";
import { auditCsv, entriesOnDays, EXPORT_FAULT_TEXT, exportFault, exportFileName, sha256Hex } from "@/lib/audit/export";
import { writeAudit } from "@/lib/audit/record";
import { dayToDate, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { staffForPermission, toAuditActor } from "@/app/_auth/actor";

export interface ExportResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  file?: string;
  fileName?: string;
  sha256?: string;
  rowCount?: number;
}

const DAY_MS = 86_400_000;

/**
 * Export the trail for a range of the organisation's days (FR-APR-015). The rows are
 * read, the file built and digested, and the export recorded — with its own audit
 * entry — in one transaction, so the record of what was handed over and the file
 * cannot disagree. The file comes back to the browser to save; the portal keeps only
 * its digest. Needs the permission to read and export the trail: the trail includes the sign-in accounts' history.
 */
export async function exportAuditTrail(_prev: ExportResult, data: FormData): Promise<ExportResult> {
  // The permission to read and export the trail (audit.read), judged by the one gate: its refusal says which permission and why it is not held.
  const gate = await staffForPermission("audit.read");
  if (!gate.ok) return { ok: false, message: gate.state.message };
  const actor = gate.actor;
  const fromDay = String(data.get("fromDay") ?? "").trim() || null;
  const toDay = String(data.get("toDay") ?? "").trim() || null;
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, timeZone: true } });
  if (!org) return { ok: false, message: "No organisation is configured. Run npm run setup first." };
  const today = todayIn(new Date(), org.timeZone);
  const fault = exportFault(fromDay, toDay, today);
  if (fault) {
    return fault === "RANGE_REQUIRED" || fault === "RANGE_REVERSED"
      ? { ok: false, errors: { [fromDay ? "toDay" : "fromDay"]: EXPORT_FAULT_TEXT[fault] } }
      : fault === "RANGE_IN_FUTURE"
        ? { ok: false, errors: { toDay: EXPORT_FAULT_TEXT[fault] } }
        : { ok: false, message: EXPORT_FAULT_TEXT[fault] };
  }
  const zone = org.timeZone!;
  const result = await db.$transaction(
    async (tx) => {
      // A day either side in UTC, then judged on the organisation's day.
      const rows = await tx.auditEntry.findMany({
        where: { organisationId: org.id, at: { gte: new Date(dayToDate(fromDay!).getTime() - DAY_MS), lt: new Date(dayToDate(toDay!).getTime() + 2 * DAY_MS) } },
        include: { actorPerson: { select: { name: true } } },
      });
      const picked = entriesOnDays(rows, fromDay!, toDay!, zone);
      const file = auditCsv(
        picked.map((r) => ({ ...r, actorName: actorDisplayName(r) })),
        zone,
      );
      const sha256 = sha256Hex(file);
      const fileName = exportFileName(fromDay!, toDay!);
      const row = await tx.auditExport.create({ data: { organisationId: org.id, fromDay: dayToDate(fromDay!), toDay: dayToDate(toDay!), rowCount: picked.length, sha256, fileName } });
      await writeAudit(tx, { actor: toAuditActor(actor), organisationId: org.id, entity: "AuditExport", entityId: row.id, entityLabel: `Audit trail export ${fromDay} to ${toDay}` }, "CREATE",
        diffFields(null, { fromDay: dayToDate(fromDay!), toDay: dayToDate(toDay!), rowCount: picked.length, sha256, fileName }));
      return { file, sha256, fileName, rowCount: picked.length };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
  revalidatePath("/configuration/audit");
  return { ok: true, ...result };
}
