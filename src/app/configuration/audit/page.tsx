import { ClockIcon, FileIcon, ShieldIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { InfoChip } from "@/components/ui/info-chip";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { slotOf } from "@/lib/auth/act-slots";
import { ONLINE_RECORDS_NOT_SHOWN_WORDS } from "@/lib/bids/online/audit-mask";
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
const BACKDATED_PAGE = 50;

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<{ backdated?: string }> }) {
  const actor = await requireStaff();
  const requested = Number((await searchParams).backdated ?? "0");
  const offset = Number.isInteger(requested) && requested > 0 ? requested : 0;
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, timeZone: true } });
  if (!org) {
    return (
      <>
        <PageHeader title="Audit trail" info={{ title: "Audit trail", text: "Every change, with what it was before and after, and its export." }} />
        <Card>
          <EmptyState title="No organisation is configured" />
        </Card>
      </>
    );
  }
  const today = todayIn(new Date(), org.timeZone);
  const exportGate = await permissionGate(actor, "audit.read");
  // NFR-AUD-006 (Phase 5a): a signature dated earlier than the day it was recorded is a recorded exception, and it reads as the signer's claim until the person named confirms it. Shown
  // to those who may read the trail, because it names people and their reasons.
  const exception = { organisationId: org.id, effectiveOn: { not: null } } as const;
  const include = { subjectPerson: { select: { name: true } }, backdateAuthorisedByPerson: { select: { name: true } }, confirmation: { select: { confirmedAt: true } } } as const;
  // Those not yet confirmed come first, newest first, then the confirmed: the exceptions the card exists to surface are never behind the page's edge, and the page says how many there are.
  const [backdated, unconfirmed, backdatedTotal] = exportGate.ok
    ? await (async () => {
        const [open, all] = await Promise.all([db.actAttribution.count({ where: { ...exception, confirmation: null } }), db.actAttribution.count({ where: exception })]);
        const first = offset < open ? await db.actAttribution.findMany({ where: { ...exception, confirmation: null }, orderBy: [{ at: "desc" }, { id: "desc" }], skip: offset, take: BACKDATED_PAGE, include }) : [];
        const room = BACKDATED_PAGE - first.length;
        const rest = room > 0 ? await db.actAttribution.findMany({ where: { ...exception, confirmation: { isNot: null } }, orderBy: [{ at: "desc" }, { id: "desc" }], skip: Math.max(0, offset - open), take: room, include }) : [];
        return [[...first, ...rest], open, all] as const;
      })()
    : ([[], 0, 0] as const);
  const [count, first, exports] = await Promise.all([
    db.auditEntry.count({ where: { organisationId: org.id } }),
    db.auditEntry.findFirst({ where: { organisationId: org.id }, orderBy: { at: "asc" }, select: { at: true } }),
    db.auditExport.findMany({ where: { organisationId: org.id }, orderBy: { generatedAt: "desc" }, take: 50 }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit trail"
        info={{ title: "Audit trail", text: "Each export is a CSV with a SHA-256 digest, itself recorded. SULIT values are withheld. The digest proves the file is what the portal produced, not that the database was never altered." }}
        meta={[<InfoChip key="online" tone="warn" detail={ONLINE_RECORDS_NOT_SHOWN_WORDS}>Online held back</InfoChip>, `${count} ${count === 1 ? "entry" : "entries"}`, first ? `since ${formatOrgDay(first.at, org.timeZone)}` : "nothing recorded yet", `${exports.length} ${exports.length === 1 ? "export" : "exports"}`]}
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Export" subtitle="Oldest first" />
          <CardBody>
            {exportGate.ok ? (
              <AuditExportForm today={today} />
            ) : (
              <Callout tone="warn" title="Export not available to you">
                {exportGate.message}
              </Callout>
            )}
          </CardBody>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Exports on record" subtitle="Newest first" actions={<Badge outline>{exports.length}</Badge>} />
          {exports.length === 0 ? (
            <EmptyState size="sm" title="No export yet" />
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
              subtitle="Signer's claim until confirmed"
              actions={<Badge tone={unconfirmed > 0 ? "warn" : "ok"} outline>{unconfirmed} not confirmed</Badge>}
            />
            {backdated.length === 0 ? (
              <EmptyState size="sm" title="No signature has been back-dated" />
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
            {backdatedTotal > BACKDATED_PAGE && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                <span className="text-[13px] text-ink-2">
                  Showing {offset + 1} to {offset + backdated.length} of {backdatedTotal}, the not confirmed first
                </span>
                <span className="flex gap-2">
                  {offset > 0 && (
                    <ButtonLink href={offset - BACKDATED_PAGE > 0 ? `/configuration/audit?backdated=${offset - BACKDATED_PAGE}` : "/configuration/audit"} size="sm" variant="secondary">
                      Newer
                    </ButtonLink>
                  )}
                  {offset + backdated.length < backdatedTotal && (
                    <ButtonLink href={`/configuration/audit?backdated=${offset + BACKDATED_PAGE}`} size="sm" variant="secondary">
                      Older
                    </ButtonLink>
                  )}
                </span>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
