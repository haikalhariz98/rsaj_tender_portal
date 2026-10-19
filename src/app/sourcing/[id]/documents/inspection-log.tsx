import { EyeIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { exerciseOrg } from "@/lib/method/repo";
import { inspectionLogOf } from "@/lib/portal/bids/staff-read";

/**
 * The inspection log of the Tender Table Document (FR-DOC-010, Phase 4d): who opened it, or the documents released to them, from a supplier portal account, and when. It is the portal's own record, written
 * before anything was shown, and nobody can change it. It holds suppliers' openings only: an officer's print is not a supplier's inspection, and a visit to the tender table is not logged here.
 * Every opening is listed, on the shared DataList (search, sort, paging and export), not cut off at a count: the log is the record, and a record that stops at 25 is not one.
 */
export async function InspectionLogCard({ organisationId, exerciseId }: { organisationId: string; exerciseId: string }) {
  const window = await db.exerciseWindow.findUnique({ where: { exerciseId, organisationId }, select: { id: true } });
  if (!window) return null;
  const org = await exerciseOrg(organisationId);
  const log = await inspectionLogOf(db, organisationId, window.id, org?.timeZone ?? null);
  const rows: Row[] = log.rows.map((r) => ({
    id: r.id,
    search: `${r.supplier} ${r.kind} version ${r.version} ${r.at}`,
    sortKeys: { at: r.sort, supplier: r.supplier },
    cells: {
      supplier: { kind: "stack", title: r.supplier },
      document: { kind: "text", text: r.kind },
      version: { kind: "text", text: `Version ${r.version}` },
      at: { kind: "text", text: r.at },
    },
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<EyeIcon size={17} />}
        title="Inspection log"
        subtitle={log.total === 0 ? "Not opened yet" : `${log.total} ${log.total === 1 ? "opening" : "openings"} by ${log.suppliers} ${log.suppliers === 1 ? "supplier" : "suppliers"}`}
        divided={log.rows.length > 0}
      />
      {log.rows.length > 0 && (
        <DataList
          flat
          selectable={false}
          exportName="inspection-log"
          searchPlaceholder="Search by supplier"
          emptyTitle="No openings"
          stackBelow="xl"
          columns={[
            { key: "supplier", label: "Supplier", sortable: true, mobile: "primary" },
            { key: "document", label: "Opened", width: "240px", mobile: "meta" },
            { key: "version", label: "Version", width: "110px", nowrap: true, mobile: "meta" },
            { key: "at", label: "When", width: "190px", sortable: true, nowrap: true, mobile: "meta" },
          ]}
          rows={rows}
        />
      )}
      {log.total === 0 && (
        <div className="px-5 pb-5 sm:px-6">
          <p className="text-[13px] text-ink-3">Fills once published and opened.</p>
        </div>
      )}
    </Card>
  );
}
