import { ClockIcon, FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { EXPORT_NOT_ADMINISTRATOR_TEXT } from "@/lib/audit/export";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";

import { AuditExportForm } from "./export-form";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/**
 * The audit trail and its export (FR-APR-015, partly met by ruling). Every write records
 * its before and after in the same transaction, and no screen or action edits or
 * deletes an entry. The export is what an outside auditor takes away.
 */
export default async function AuditTrailPage() {
  const actor = await requireStaff();
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, timeZone: true } });
  if (!org) {
    return (
      <>
        <PageHeader title="Audit trail" subtitle="Every change, with what it was before and after, and its export." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const today = todayIn(new Date(), org.timeZone);
  const [count, first, exports] = await Promise.all([
    db.auditEntry.count({ where: { organisationId: org.id } }),
    db.auditEntry.findFirst({ where: { organisationId: org.id }, orderBy: { at: "asc" }, select: { at: true } }),
    db.auditExport.findMany({ where: { organisationId: org.id }, orderBy: { generatedAt: "desc" }, take: 50 }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Every change, its before and after, recorded in the same act as the change."
        meta={[`${count} ${count === 1 ? "entry" : "entries"}`, first ? `since ${formatOrgDay(first.at, org.timeZone)}` : "nothing recorded yet", `${exports.length} ${exports.length === 1 ? "export" : "exports"}`]}
      />
      <div className="flex flex-col gap-6">
        <Callout tone="info" title="What the digest proves, and what it does not">
          Each export is a CSV file with a SHA-256 digest of its exact bytes, and the export is itself recorded on the trail. A SULIT value (a price as read, the company estimate, the figure on its paper copy, a withdrawal letter&rsquo;s quote) is not in the file: the change is listed with its values withheld. The digest proves that a file is the one the portal produced on that day. It does not prove the database was never altered: no screen or action edits or deletes an entry, but the database does not yet refuse one itself — that waits for sign-in.
        </Callout>
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Export" subtitle="Every entry recorded on the organisation's days chosen, oldest first." />
          <CardBody>
            {actor.isAdministrator ? (
              <AuditExportForm today={today} />
            ) : (
              <Callout tone="info" title="For an administrator">
                {EXPORT_NOT_ADMINISTRATOR_TEXT}
              </Callout>
            )}
          </CardBody>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Exports on record" subtitle="Newest first. A file handed over can be checked against its digest here." actions={<Badge outline>{exports.length}</Badge>} />
          {exports.length === 0 ? (
            <EmptyState size="sm" title="No export yet">Nothing has been exported.</EmptyState>
          ) : (
            <Table minWidth={720}>
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "12%" }} />
                <col />
              </colgroup>
              <THead>
                <Th>Exported</Th>
                <Th>Days</Th>
                <Th className="text-right">Entries</Th>
                <Th>SHA-256 of the file</Th>
              </THead>
              <tbody>
                {exports.map((x) => (
                  <Tr key={x.id}>
                    <Td label="Exported" className="text-ink-2">{formatOrgDay(x.generatedAt, org.timeZone)}</Td>
                    <Td label="Days" className="text-ink-2">
                      {formatDate(x.fromDay)} to {formatDate(x.toDay)}
                    </Td>
                    <Td label="Entries" className="text-right tabular-nums text-ink-2">{x.rowCount}</Td>
                    <Td label="SHA-256 of the file">
                      <span className="font-mono text-[12px] break-all text-ink-2">{x.sha256}</span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
