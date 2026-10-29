import { DataList, type Row } from "@/components/data-list";
import { ChartIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { SulitTag } from "@/components/ui/badge";
import type { Sulit } from "@/lib/auth/sulit-access";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { fixedOf } from "@/lib/evaluation/fixed";
import { formatOrgDay } from "@/lib/format";
import { totalText } from "@/lib/performance/labels";
import { formSnapshotOf } from "@/lib/performance/load";
import { sulitCell } from "@/components/sulit-cell";
import { sulitGate } from "@/app/_auth/sulit";

/**
 * Supplier › Performance (Phase 2 close-out stage D; plan closeout-plan.md §4.8, D3): the contractor performance reports filed on this supplier's
 * contracts, verified by a second person. The total and the grade are SULIT (supplier scope), read behind the page's gate, and logged when read;
 * the supplier never sees them. Read only while this tab is open.
 */
export async function PerformancePanel({ actor, supplier }: { actor: StaffActor; supplier: { id: string; reference: string; organisationId: string; timeZone: string | null } }) {
  const gate: Sulit<true> = await sulitGate(actor, { scope: "supplier", entity: "Supplier", id: supplier.id, label: supplier.reference }, ["scoreTotal", "gradeLabel"]);
  const reports = await db.performanceReport.findMany({
    where: { supplierId: supplier.id, organisationId: supplier.organisationId, verifiedAt: { not: null } },
    include: { contract: { select: { id: true, number: true } } },
    orderBy: { verifiedAt: "desc" },
  });
  const rows: Row[] = reports.map((r) => {
    const snap = formSnapshotOf(r);
    const total = fixedOf(r.scoreTotal);
    return {
      id: r.id,
      search: `${r.contract.number} ${snap.name}`,
      cells: {
        contract: { kind: "link", text: r.contract.number, href: `/projects/${r.contract.id}?stage=close-out&tab=closure`, sub: `${snap.name}, version ${snap.version}` },
        result: sulitCell(gate, () => ({ kind: "text", text: total != null ? `${totalText(total)} · grade ${r.gradeLabel}` : "Not assessed" })),
        filed: { kind: "text", text: formatOrgDay(r.verifiedAt, supplier.timeZone) },
      },
    };
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ChartIcon size={17} />} title="Contractor performance" actions={<SulitTag />} divided={false} />
      <DataList flat selectable={false} toolbar={false} searchable={false} exportName="performance" emptyTitle="No reports filed" columns={[{ key: "contract", label: "Contract", mobile: "primary" }, { key: "result", label: "Total and grade", width: "220px", mobile: "meta", sulit: true }, { key: "filed", label: "Filed", width: "140px", mobile: "meta" }]} rows={rows} />
    </Card>
  );
}
