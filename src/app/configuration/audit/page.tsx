import { ClockIcon, FileIcon, ShieldIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { slotOf } from "@/lib/auth/act-slots";
import { storedDay, todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDate, formatOrgDay } from "@/lib/format";

import { AuditExportForm } from "./export-form";
import { permissionGate, requireStaff } from "@/app/_auth/actor";

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
  const exportGate = await permissionGate(actor, "audit.read");
  // NFR-AUD-006 (Phase 5a): a signature dated earlier than the day it was recorded is a recorded exception, and it reads as the signer's claim until the person named confirms it. Shown
  // to those who may read the trail, because it names people and their reasons.
  const exception = { organisationId: org.id, effectiveOn: { not: null } } as const;
  const [backdated, unconfirmed] = exportGate.ok
    ? await Promise.all([
        db.actAttribution.findMany({ where: exception, orderBy: { at: "desc" }, take: 50, include: { subjectPerson: { select: { name: true } }, backdateAuthorisedByPerson: { select: { name: true } }, confirmation: { select: { confirmedAt: true } } } }),
        db.actAttribution.count({ where: { ...exception, confirmation: null } }),
      ])
    : [[], 0];
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
            {exportGate.ok ? (
              <AuditExportForm today={today} />
            ) : (
              <Callout tone="info" title="For those who may read and export the trail">
                {exportGate.message}
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
        {exportGate.ok && (
          <Card className="overflow-hidden">
            <CardHeader
              icon={<ShieldIcon size={17} />}
              title="Back-dated signatures"
              subtitle="A signature dated earlier than the day it was recorded is a recorded exception. The signer names who authorised it; it reads as the signer's claim until that person confirms it, in a signature of their own."
              actions={<Badge tone={unconfirmed > 0 ? "warn" : "ok"} outline>{unconfirmed} not confirmed</Badge>}
            />
            {backdated.length === 0 ? (
              <EmptyState size="sm" title="No signature has been back-dated">Nothing is dated earlier than the day it was recorded.</EmptyState>
            ) : (
              <Table minWidth={820}>
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "18%" }} />
                  <col />
                </colgroup>
                <THead>
                  <Th>Signed by</Th>
                  <Th>What</Th>
                  <Th>Dated</Th>
                  <Th>Recorded</Th>
                  <Th>Named as authorising it</Th>
                  <Th>Standing</Th>
                </THead>
                <tbody>
                  {backdated.map((a) => (
                    <Tr key={a.id}>
                      <Td label="Signed by">{a.subjectPerson?.name ?? "A person no longer on record"}</Td>
                      <Td label="What" className="text-ink-2">{slotOf(a.entity, a.slot)?.label ?? "A signature"}</Td>
                      <Td label="Dated" className="text-ink-2">{a.effectiveOn ? formatDate(storedDay(a.effectiveOn)) : ""}</Td>
                      <Td label="Recorded" className="text-ink-2">{formatOrgDay(a.at, org.timeZone)}</Td>
                      <Td label="Named as authorising it" className="text-ink-2">{a.backdateAuthorisedByPerson?.name ?? "No one"}</Td>
                      <Td label="Standing">
                        {a.confirmation ? <Badge tone="ok">Confirmed {formatOrgDay(a.confirmation.confirmedAt, org.timeZone)}</Badge> : <Badge tone="warn">Not confirmed</Badge>}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
