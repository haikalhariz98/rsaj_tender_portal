import Link from "next/link";

import { DataList, type Cell, type Row } from "@/components/data-list";
import { WalletIcon } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, Meter } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import type { ProceedsFigures, ProceedsRow } from "@/lib/funding/store";
import { insightsHref } from "@/lib/insights/query";
import { formatMoney, type Sen } from "@/lib/money";

/**
 * Dashboard › Use of proceeds (SF-03, RP-03; ADR 0046 FS-8 to FS-10): per source, the envelope and what is committed, certified, paid and unallocated,
 * to date. A source opens its projects. Figures only arrive here; a source's code is an address key, never shown.
 */

const sen = (v: Sen): Cell => ({ kind: "money", sen: v.toString() });
const UNREADABLE: Cell = { kind: "text", text: "Cannot be read", dim: true };
const NOT_SET: Cell = { kind: "text", text: "Not set", dim: true };

function figures(r: ProceedsRow): Record<string, Cell> {
  if (r.refused.length > 0) return { committed: UNREADABLE, certified: UNREADABLE, paid: UNREADABLE, unallocated: r.envelope == null ? NOT_SET : UNREADABLE };
  return {
    committed: sen(r.committed),
    certified: r.certifiedPartial ? { kind: "stack", title: formatMoney(r.certified), sub: "Partial" } : sen(r.certified),
    paid: sen(r.paid),
    unallocated: r.unallocated == null ? NOT_SET : r.unallocated < 0n ? { kind: "badge", text: `Over by ${formatMoney(-r.unallocated)}`, tone: "warn" } : sen(r.unallocated),
  };
}

export function ProceedsPanel({ f }: { f: ProceedsFigures }) {
  const rows: Row[] = f.rows.map((r) => ({
    id: r.code ?? "not-set",
    search: r.label,
    cells: {
      source: r.code ? { kind: "link", text: r.label, href: insightsHref({ tab: "proceeds", source: r.code }) } : { kind: "text", text: r.label, dim: true },
      envelope: r.envelope == null ? NOT_SET : sen(r.envelope),
      ...figures(r),
    },
  }));
  const refused = f.rows.flatMap((r) => r.refused.map((x) => ({ ...x, source: r.label })));
  const partial = f.rows.some((r) => r.certifiedPartial);
  return (
    <div className="flex flex-col gap-6">
      {f.selected && <SourceDetail s={f.selected} />}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<WalletIcon size={17} />}
          title="Use of proceeds"
          subtitle="To date"
          divided={false}
          actions={
            <span className="flex flex-wrap items-center gap-2">
              <InfoChip detail="Certified is net of retention held." label="About Certified">Certified</InfoChip>
              <InfoChip detail="Unallocated does not include approved requisitions." label="About Unallocated">Unallocated</InfoChip>
              {partial && <InfoChip tone="warn" detail="Supply contracts carry no certified figure. Their payments count under Paid." label="About Partial">Partial</InfoChip>}
            </span>
          }
        />
        <DataList
          flat
          selectable={false}
          toolbar={false}
          paging={false}
          exportName="use-of-proceeds"
          emptyTitle="No funding source yet"
          columns={[
            { key: "source", label: "Source", mobile: "primary" },
            { key: "envelope", label: "Envelope", width: "150px", numeric: true, mobile: "meta" },
            { key: "committed", label: "Committed", width: "150px", numeric: true, mobile: "meta" },
            { key: "certified", label: "Certified", width: "150px", numeric: true, mobile: "meta" },
            { key: "paid", label: "Paid", width: "150px", numeric: true, mobile: "meta" },
            { key: "unallocated", label: "Unallocated", width: "170px", numeric: true, mobile: "meta" },
          ]}
          rows={rows}
        />
      </Card>
      {refused.length > 0 && (
        <Callout tone="warn" title="Some figures cannot be read">
          <ul className="list-disc pl-5">
            {refused.map((x) => (
              <li key={`${x.source}-${x.contractId}`}>
                <Link href={`/projects/${x.contractId}`}>{x.label}</Link>: {x.reason}
              </li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}

function SourceDetail({ s }: { s: NonNullable<ProceedsFigures["selected"]> }) {
  const percent = s.envelope == null || s.envelope === 0n || s.refused.length > 0 ? null : Number((s.committed * 10000n) / s.envelope) / 100;
  const rows: Row[] = s.projects.map((p) => ({
    id: p.href,
    search: p.label,
    cells: { project: { kind: "link", text: p.label, href: p.href }, share: { kind: "text", text: `${p.percent}%` }, committed: sen(p.committed), certified: sen(p.certified), paid: sen(p.paid) },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<WalletIcon size={17} />}
        title={s.label}
        subtitle={s.awaitingAward.count > 0 ? undefined : "No requisition awaiting award"}
        actions={s.awaitingAward.count > 0 ? <Link href={s.awaitingAward.href} className="text-[13px] font-semibold">{`${s.awaitingAward.count} ${s.awaitingAward.count === 1 ? "requisition" : "requisitions"} awaiting award`}</Link> : undefined}
      />
      {s.envelope != null && (
        <CardBody className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-ink-2">
            <span>Committed of the envelope</span>
            <span className="tabular-nums">{s.refused.length > 0 ? "Cannot be read" : `${formatMoney(s.committed)} of ${formatMoney(s.envelope)}`}</span>
          </div>
          <Meter percent={percent} tone={percent != null && percent > 100 ? "err" : "brand"} label="Committed of the envelope" />
          {s.unallocated != null && s.unallocated < 0n && s.refused.length === 0 && <Callout tone="warn" title={`Committed exceeds the envelope by ${formatMoney(-s.unallocated)}`} />}
        </CardBody>
      )}
      <DataList
        flat
        selectable={false}
        toolbar={false}
        exportName="use-of-proceeds-projects"
        emptyTitle="No project yet"
        columns={[
          { key: "project", label: "Project", mobile: "primary" },
          { key: "share", label: "Share", width: "90px", numeric: true, mobile: "meta" },
          { key: "committed", label: "Committed", width: "150px", numeric: true, mobile: "meta" },
          { key: "certified", label: "Certified", width: "150px", numeric: true, mobile: "meta" },
          { key: "paid", label: "Paid", width: "150px", numeric: true, mobile: "meta" },
        ]}
        rows={rows}
      />
    </Card>
  );
}
