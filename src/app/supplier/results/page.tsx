import { DataList, type Column, type Row } from "@/components/data-list";
import { AwardIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { METHOD_NOT_STATED, PORTAL_PATH, RESULTS } from "@/lib/portal/labels";
import { loadResults } from "@/lib/portal/repo";
import { loadPublicShell } from "@/lib/portal/deployment";

export const dynamic = "force-dynamic";

/**
 * The public results: advertised exercises that were awarded, and when. No sign-in. No award party and
 * no figure (founder, 2026-10-20; ruling R3): rows come from `toPublicResult`, whose read selects
 * neither. The schedule of tenders is the office's own document, published when it chooses.
 */
export default async function SupplierResultsPage() {
  const [{ organisation }, { ready, results }] = await Promise.all([loadPublicShell(), loadResults()]);

  const rows: Row[] = results.map((r) => ({
    id: r.id,
    search: [r.title, r.reference].join(" "),
    sortKeys: { awardedOn: r.awardedDay ?? "" },
    cells: {
      title: { kind: "stack", title: r.title, sub: r.reference },
      method: { kind: "text", text: r.method || METHOD_NOT_STATED.en, dim: !r.method },
      closing: { kind: "text", text: r.closing ?? "—", dim: r.closing == null },
      awardedOn: { kind: "text", text: r.awardedOn ?? "—", dim: r.awardedOn == null },
      schedule: r.schedulePublishedOn
        ? { kind: "download", text: RESULTS.scheduleDownload.en, href: `${PORTAL_PATH.results}/${r.id}/schedule`, label: `${RESULTS.columns.schedule.en}: ${r.title}`, sub: RESULTS.schedulePublished(r.schedulePublishedOn).en }
        : { kind: "text", text: RESULTS.scheduleNotPublished.en, dim: true },
    },
  }));

  const columns: Column[] = [
    { key: "title", label: RESULTS.columns.exercise.en, sortable: true, mobile: "primary" },
    { key: "method", label: RESULTS.columns.method.en, width: "180px", hideBelow: "lg", mobile: "meta" },
    { key: "closing", label: RESULTS.columns.closing.en, width: "150px", nowrap: true, mobile: "meta" },
    { key: "awardedOn", label: RESULTS.columns.awardedOn.en, width: "150px", nowrap: true, sortable: true, mobile: "meta" },
    { key: "schedule", label: RESULTS.columns.schedule.en, width: "180px", mobile: "meta" },
  ];

  return (
    <>
      <PageHeader
        title={RESULTS.title.en}
        subtitle={RESULTS.subtitle(organisation.name).en}
        info={{ title: RESULTS.title.en, text: RESULTS.info.en }}
        meta={ready ? [RESULTS.count(results.length).en] : undefined}
      />

      {!ready ? (
        <Card>
          <EmptyState title={RESULTS.notSetUp.title.en} action={<span className="text-[13.5px] text-ink-2">{RESULTS.notSetUp.body.en}</span>} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader icon={<AwardIcon size={17} />} title={RESULTS.listTitle.en} subtitle={RESULTS.listSubtitle.en} divided={false} />
          <DataList
            flat
            selectable={false}
            exportName="results"
            searchPlaceholder={RESULTS.search.en}
            emptyTitle={RESULTS.emptyTitle.en}
            columns={columns}
            rows={rows}
          />
        </Card>
      )}
    </>
  );
}
