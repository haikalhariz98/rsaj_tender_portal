import Link from "next/link";
import { notFound } from "next/navigation";

import { HistoryButton } from "@/components/history-drawer";
import { ClockIcon, RouteIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { CHECK_KIND_WORDS, KIND_WORDS, SUBJECT_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { AddCheck, AddTarget, EditCheck, EditRoutingType, EditTarget, RemoveCheck, RemoveTarget, RetireRoutingType } from "../editors";

export const dynamic = "force-dynamic";

/// A band in words, by the type's edge switch: upper inclusive (min, max], lower inclusive [min, max), or not decided.
function band(lo: string | null, hi: string | null, upper: boolean | null): string {
  if (lo == null && hi == null) return "Whatever the percentage";
  const from = lo == null ? null : upper == null ? `from ${lo}%` : upper ? `above ${lo}%` : `from ${lo}%`;
  const to = hi == null ? null : upper == null ? `to ${hi}%` : upper ? `up to and including ${hi}%` : `below ${hi}%`;
  const text = [from, to].filter(Boolean).join(" and ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${upper == null ? " (which side of an edge counts is not decided)" : ""}`;
}

/**
 * One routing sheet type (6.14 increment 1): its internal checks in order, with each stage's printed days, and
 * its ICC targets, banded by an exact percentage where the sheet bands them (ADR 0024).
 */
export default async function RoutingTypePage(props: PageProps<"/configuration/routing-sheets/[id]">) {
  const { id } = await props.params;
  const org = await exerciseOrg();
  if (!org) notFound();
  const t = await db.routingSheetType.findFirst({ where: { id, organisationId: org.id }, include: { checks: { orderBy: { order: "asc" } }, targets: true, template: { select: { nameEn: true } } } });
  if (!t) notFound();
  const [roles, templates] = await Promise.all([
    db.authorityRole.findMany({ where: { organisationId: org.id, isCommittee: false }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } }),
    db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true } }),
  ]);
  const offices = roles.map((r) => ({ value: r.code, label: r.nameEn }));
  const officeName = (c: string | null) => (c ? (roles.find((r) => r.code === c)?.nameEn ?? "An office no longer configured") : "Any officer");
  const targets = t.targets.map((x) => ({ ...x, pctMin: x.pctMin?.toString() ?? null, pctMax: x.pctMax?.toString() ?? null })).sort((a, b) => Number(a.pctMin ?? -1) - Number(b.pctMin ?? -1));
  const parts = t.checks.length && t.checks.every((c) => c.targetDays != null) ? t.checks.reduce((n, c) => n + c.targetDays!, 0) : null;
  const unbanded = targets.length === 1 && targets[0].pctMin == null && targets[0].pctMax == null ? targets[0] : null;
  const retired = t.retiredOn ? storedDay(t.retiredOn) : null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/configuration/routing-sheets">Routing sheets</Link>}
        title={t.labelEn}
        badge={retired ? <Badge tone="warn" dot>{org.today && retired > org.today ? `Retires ${formatDate(retired)}` : `Retired ${formatDate(retired)}`}</Badge> : undefined}
        subtitle={t.labelMs ?? undefined}
        meta={[t.subject === "CERTIFICATE" ? (t.certificateKind ? KIND_WORDS[t.certificateKind].en : "Any certificate") : SUBJECT_WORDS[t.subject].en, t.template?.nameEn ?? "No printed sheet chosen"]}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <HistoryButton entity="RoutingSheetType" entityId={t.id} label={t.labelEn} />
            <EditRoutingType templates={templates.map((x) => ({ value: x.id, label: x.nameEn }))} row={t} />
            {!retired && <RetireRoutingType id={t.id} label={t.labelEn} blocker={org.today ? null : "Set the organisation's time zone first."} />}
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title="How elapsed time is judged" subtitle="Calendar days from DATE (1), the day received, to DATE (2), the day the approving step decided (assumed; a question to the customer)." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "A percentage exactly on a band's edge", value: t.upperEdgeInclusive == null ? "Not decided: such a value has no target (every other value has one)" : t.upperEdgeInclusive ? "Falls in the band it closes (up to and including the edge)" : "Falls in the band it opens (from the edge up)" },
                { label: "The stages' printed days", value: parts == null ? "Not printed for every stage" : unbanded && unbanded.targetDays !== parts ? `${parts} days, against a printed total of ${unbanded.targetDays}: both are shown on each sheet` : `${parts} days` },
                { label: "Where it came from", value: <ProvenanceBadge value={t.provenance} /> },
                { label: "Notes", value: t.notes || "None" },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<RouteIcon size={17} />} title="Checks" subtitle="The sheet's internal steps, recorded in this order before the approval matrix's own steps. Each round of a resubmission records them again." actions={<AddCheck typeId={t.id} offices={offices} />} divided={t.checks.length === 0} />
          {t.checks.length === 0 ? (
            <EmptyState size="sm" title="None">No internal checks: the sheet shows the approval route&apos;s steps only.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 200 }} />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Check</Th>
                <Th>Recorded by</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {t.checks.map((c) => (
                  <Tr key={c.id}>
                    <Td label="Check"><CellStack title={`${c.order}. ${c.labelEn}`} sub={[CHECK_KIND_WORDS[c.kind].en, c.labelMs, c.targetDays ? `${c.targetDays} days printed` : null].filter(Boolean).join(" · ")} /></Td>
                    <Td label="Recorded by" className="text-ink-2">{officeName(c.officeCode)}</Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="RoutingCheckDef" entityId={c.id} label={c.labelEn} />
                        <EditCheck typeId={t.id} offices={offices} row={c} />
                        <RemoveCheck typeId={t.id} id={c.id} label={c.labelEn} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Targets" subtitle="The ICC target, in calendar days: one for every percentage, or one per band of the exact percentage handed in with a certificate's figures." actions={<AddTarget typeId={t.id} />} divided={targets.length === 0} />
          {targets.length === 0 ? (
            <EmptyState size="sm" title="Not set">No target: every sheet on this type reads &quot;Target not set&quot;, never met.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 130 }} />
                <ActionsCol icons={2} labelled={1} />
              </colgroup>
              <THead>
                <Th>Band</Th>
                <Th>Target</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {targets.map((x) => (
                  <Tr key={x.id}>
                    <Td label="Band"><CellStack title={band(x.pctMin, x.pctMax, t.upperEdgeInclusive)} sub={x.notes || undefined} /></Td>
                    <Td label="Target" className="tabular-nums text-ink-2">{`${x.targetDays} days`}</Td>
                    <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="RoutingTarget" entityId={x.id} label="Target" />
                        <EditTarget typeId={t.id} row={x} />
                        <RemoveTarget typeId={t.id} id={x.id} />
                      </RowActions>
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
