import { DataList, type Column, type Row } from "@/components/data-list";
import { AwardIcon, GlobeIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { METHOD_NOT_STATED, OPEN_ROW_ACTION, PORTAL_PATH, RESULTS } from "@/lib/portal/labels";
import { loadResults } from "@/lib/portal/repo";
import { loadShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

/**
 * The public results: advertised exercises that were awarded, with who won and the day. No sign-in.
 * Rows come from `toPublicResult` (src/lib/portal/results.ts), which is also where the awarded value
 * is withheld unless the organisation publishes it: with it withheld the column is not drawn and the
 * figure is never read from the database.
 */
export default async function SupplierResultsPage() {
  const [{ organisation }, { ready, showsValue, results }] = await Promise.all([loadShell(), loadResults()]);

  const rows: Row[] = results.map((r) => ({
    id: r.id,
    search: [r.title, r.reference, r.awardee].filter(Boolean).join(" "),
    sortKeys: { awardedOn: r.awardedDay ?? "" },
    cells: {
      title: { kind: "link", text: r.title, href: `${PORTAL_PATH.opportunities}/${r.id}`, sub: r.reference },
      awardee: { kind: "text", text: r.awardee || RESULTS.awardeeNotStated.en, dim: !r.awardee },
      awardedOn: { kind: "text", text: r.awardedOn ?? "—", dim: r.awardedOn == null },
      method: { kind: "text", text: r.method || METHOD_NOT_STATED.en, dim: !r.method },
      ...(showsValue ? { value: { kind: "money", sen: r.awardedSen } as const } : {}),
    },
  }));

  const columns: Column[] = [
    { key: "title", label: RESULTS.columns.exercise.en, sortable: true, mobile: "primary" },
    { key: "awardee", label: RESULTS.columns.awardee.en, width: "240px", sortable: true, mobile: "meta" },
    { key: "awardedOn", label: RESULTS.columns.awardedOn.en, width: "150px", nowrap: true, sortable: true, mobile: "meta" },
    { key: "method", label: RESULTS.columns.method.en, width: "180px", hideBelow: "lg", mobile: "meta" },
    ...(showsValue ? [{ key: "value", label: RESULTS.columns.value.en, width: "160px", numeric: true, sortable: true, mobile: "meta" } as Column] : []),
  ];

  return (
    <>
      <PageHeader
        title={RESULTS.title.en}
        subtitle={RESULTS.subtitle(organisation.name).en}
        info={{ title: RESULTS.title.en, text: showsValue ? RESULTS.info.en : `${RESULTS.info.en} ${RESULTS.valueNotPublished.en}` }}
        meta={ready ? [RESULTS.count(results.length).en] : undefined}
        actions={
          <ButtonLink href={PORTAL_PATH.opportunities} variant="primary" icon={<GlobeIcon size={16} />}>
            {RESULTS.viewOpportunities.en}
          </ButtonLink>
        }
      />

      {!ready ? (
        <Card>
          <EmptyState title={RESULTS.notSetUp.title.en}>{RESULTS.notSetUp.body.en}</EmptyState>
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
            emptyBody={RESULTS.emptyBody.en}
            rowAction={{ label: OPEN_ROW_ACTION.en, hrefTemplate: `${PORTAL_PATH.opportunities}/{id}` }}
            rowOpens
            columns={columns}
            rows={rows}
          />
        </Card>
      )}
    </>
  );
}
