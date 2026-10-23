/**
 * Reporting lines, read (FR-APR-010, FR-APR-011). Reads only: the writer is `saveReportingLine` (src/app/configuration/users/actions.ts), which locks and audits.
 */

import type { Tx } from "@/lib/audit/record";

import type { ReportingLine } from "./reporting-lines";

/// Whether the organisation has recorded any line at all (`anyLineRecorded`, from one row rather than all of them).
export async function anyReportingLine(client: Tx, organisationId: string): Promise<boolean> {
  return (await client.reportingLine.findFirst({ where: { organisationId }, select: { id: true } })) != null;
}

/// Every line the organisation has recorded, in force or not: a rule that asks about a past or future day needs the ones that are not in force today.
export async function loadReportingLines(client: Tx, organisationId: string): Promise<(ReportingLine & { provenance: "STATED" | "OBSERVED" | "ASSUMED"; note: string })[]> {
  const rows = await client.reportingLine.findMany({
    where: { organisationId },
    select: { id: true, personId: true, superiorPersonId: true, effectiveFrom: true, effectiveTo: true, provenance: true, note: true },
    orderBy: [{ personId: "asc" }, { effectiveFrom: "asc" }],
  });
  return rows;
}
