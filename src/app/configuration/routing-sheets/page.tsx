import Link from "next/link";

import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { KIND_WORDS, SUBJECT_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { Section, Stat, Stats } from "../records-ui";
import { AddRoutingType, EditRoutingType } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/**
 * Routing sheets (6.14 increment 1, FR-CRT-007, 008; ADR 0023): one generic entity for every CPD/DFA sheet.
 * A tenth sheet is a row here. Ships empty: the spec's ICC targets are the customer's seed.
 */
export default async function RoutingSheetsPage() {
  const actor = await requireStaff();
  const org = await exerciseOrg(actor.organisationId);
  const [types, templates] = org
    ? await Promise.all([
        db.routingSheetType.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], include: { _count: { select: { checks: true, targets: true, certificates: true, awardSheets: true } }, template: { select: { nameEn: true } } } }),
        db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true } }),
      ])
    : [[], []];
  const templateOptions = templates.map((t) => ({ value: t.id, label: t.nameEn }));
  const live = types.filter((t) => !t.retiredOn || (org?.today && storedDay(t.retiredOn) > org.today));
  const untargeted = live.filter((t) => t._count.targets === 0).length;
  const edgeUndecided = live.filter((t) => t.upperEdgeInclusive == null).length;
  return (
    <>
      <PageHeader title="Routing sheets" badge={untargeted ? <Badge tone="warn" dot>{`${untargeted} without a target`}</Badge> : undefined} info={{ title: "Routing sheets", text: "Each routing sheet's checks, and the targets elapsed days are judged against." }} />
      <Stats>
        <Stat label="Types in use" value={live.length || null} hint={live.length ? "Each starts a sheet on a certificate or an award" : "No sheet can start"} />
        <Stat label="Without a target" value={live.length ? untargeted : null} warn={untargeted > 0} hint={untargeted ? "Their sheets read \"Target not set\", never met" : "Every type has a target"} />
        <Stat label="Band edge undecided" value={live.length ? edgeUndecided : null} hint="Only a percentage on an edge" />
      </Stats>
      <Section title="Types" blurb="Open a type for its checks and targets. A sheet freezes its type when it starts: a change here never moves a running sheet." empty="No routing sheet type is configured, so no certificate can be sent for routing and no award keeps a routing sheet." count={types.length} action={<AddRoutingType templates={templateOptions} />}>
        <Table minWidth={640}>
          <colgroup>
            <col />
            <col style={{ width: 200 }} />
            <col style={{ width: 130 }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Type</Th>
            <Th>Drawn over</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {types.map((t) => (
              <Tr key={t.id}>
                <Td label="Type">
                  <CellStack
                    title={<Link href={`/configuration/routing-sheets/${t.id}`} className="font-semibold">{t.labelEn}</Link>}
                    aside={t.retiredOn ? <Badge tone="warn">{org?.today && storedDay(t.retiredOn) > org.today ? `retires ${formatDate(t.retiredOn)}` : "retired"}</Badge> : undefined}
                    sub={[t.labelMs, `${t._count.checks} check${t._count.checks === 1 ? "" : "s"}`, t._count.targets ? `${t._count.targets} target${t._count.targets === 1 ? "" : "s"}` : "no target", t.template?.nameEn ?? null, `${t._count.certificates + t._count.awardSheets} sheet${t._count.certificates + t._count.awardSheets === 1 ? "" : "s"} on it`].filter(Boolean).join(" · ")}
                  />
                </Td>
                <Td label="Drawn over" className="text-ink-2">{t.subject === "CERTIFICATE" ? (t.certificateKind ? KIND_WORDS[t.certificateKind].en : "Any certificate") : SUBJECT_WORDS[t.subject].en}</Td>
                <Td label="Source"><ProvenanceBadge value={t.provenance} /></Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="RoutingSheetType" entityId={t.id} label={t.labelEn} />
                    <EditRoutingType templates={templateOptions} row={t} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
