import { DataList, type Row } from "@/components/data-list";
import { serverMode } from "@/components/server-list";
import { ListFacets } from "@/components/list-facets";
import { codeFacet, facetChoices } from "@/lib/list-facets";
import { FileIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { CASE_LIST_VIEWS, listCases, type CaseListView, type CaseRowView } from "@/lib/contract/case-load";
import { CASE_WORK_VIEWS } from "@/lib/contract/case-work-views";
import { CASE_VIEW_WORDS } from "@/lib/contract/case-list-words";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { commencedPendingAll } from "@/lib/variation/view";
import { requireStaff } from "@/app/_auth/actor";
import { ENGLISH } from "@/lib/i18n/language";
import { CASES_LIST_WORDS as L } from "@/lib/contract/case-page-words";
import type { Words } from "@/lib/contract/labels";
import type { Language } from "@/lib/i18n/language";
import { LIST_EXPORT_MAX_ROWS, listHref, parseListQuery, sortKeys } from "@/lib/list-query";
import { say, sayWith } from "@/lib/i18n/say";
import { hiddenExercises } from "@/app/_auth/sulit";
import { listRegister } from "@/lib/award/repo";
import { db } from "@/lib/db";

import { CaseViewSelect, type ViewGroup } from "./case-view-select";
import { SecuritiesView } from "./securities-view";
import { documentsWaitingCount } from "@/lib/project-docs/waiting-read";

import { DocumentsWaitingView } from "./documents-waiting-view";
import { loadCaseContext } from "./context";
import { buildCaseRows, buildCommencedRows, type CommencedVariation } from "./rows";

export const metadata = { title: "Projects" };

export const dynamic = "force-dynamic";

/// Variations commenced pending approval shown per page; the set is judged whole first.
const COMMENCED_PAGE = 50;

/// The server-side views of the case list, in the order of their buttons (AC-17). The wave G views are their own readers (F0-8).
const STAGE_VIEWS = ["awarding", "signing", "on_site", "completed", "closed", "ended"] as const;
/// The old Awards list's organisation-wide work views, over the whole organisation (FR-AWD-006 for the indents).
const WORK_VIEWS = CASE_WORK_VIEWS;

/**
 * The case list (Award and Contract Requirements v2, C-1; design note 0004 C9; AC-17, AC-18): every award from the day it is started,
 * with its contract once there is one, in five stages and a sixth view for the cancelled and terminated. Paging, counts and the
 * views are taken in the database by `listCases` (restricted exercises left out as `caseVisibility` says); a restricted case that is
 * issued shows only the columns the contracts list always had. The derived phases "awaiting conditions" and "ready to sign" are read
 * from each legally endorsed contract's gate and its company resolution, never stored (6.12 review).
 */
export default async function ProjectsPage(props: PageProps<"/projects">) {
  const actor = await requireStaff();
  const lang = ENGLISH;
  const t = (words: Words) => say(words, lang);
  const n = (words: Words, count: number) => sayWith(words, lang, { count: String(count) });
  const sp = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const { sv, waiting, waitingAfter } = sp as { sv?: string; waiting?: string; waitingAfter?: string };
  const q = parseListQuery(sp, CASE_LIST_VIEWS, sortKeys("project"));
  // AC-15: the organisation-wide securities view (the old Securities menu) stands alone, so no other view's data is read.
  if (q.view === "securities") return <SecuritiesView actor={actor} sv={sv} query={q} lang={lang} />;
  // AC-16, PW-11: "Documents waiting" (the old Submissions waiting view; its address keeps `view=submissions`) stands alone as well: both sources, filtered and paged by the loader.
  if (q.view === "submissions") return <DocumentsWaitingView actor={actor} filterParam={waiting} afterParam={waitingAfter} />;
  const page = q.page;
  const parsed: CaseListView | null = q.view;
  // 6.13 Part A review 14: In Delay is a view over the whole set, judged across every possessed contract, then paged.
  const { org: org0, today, delayIds, derived, policy } = await loadCaseContext(actor.organisationId);
  const delayView = parsed === "delay";
  // 6.13 Part A step 4 (FR-VAR-014): every variation commenced pending approval, across contracts, with its estimate
  // and age, judged over the whole set and then paged.
  const commencedView = parsed === "commenced";
  const commenced = org0 ? await commencedPendingAll(org0.id) : [];
  const exposure = commenced.reduce((a, v) => a + senFromDecimal(v.estimate), 0n);
  const hidden = await hiddenExercises(actor);
  // The two organisation-wide views' buttons carry their counts, as the others do (AC-15, AC-16); the same readings as the views, by count queries alone. Neither leaves out a contract's
  // rows for a restricted exercise (AC-45, AC-18, AC-19): a security is listed with the contract's own cells and nothing of the tender.
  const [securitiesCount, submissionsWaiting] = await Promise.all([
    listRegister(actor.organisationId, 0, "attention", true).then((r) => r.counts.attention),
    // Plan step 6 (PW-11): "Documents waiting" counts both sources, the documents waiting on the organisation and the earlier submissions not yet answered.
    documentsWaitingCount(db, actor.organisationId),
  ]);
  // "commenced" is the variations' exposure report above, not a view over cases; every other view is one `listCases` pages.
  const rowView: CaseRowView | undefined = parsed && parsed !== "commenced" ? parsed : undefined;
  const data = await listCases(actor.organisationId, hidden, { view: rowView, page, size: q.size, words: q.words, sort: q.sort, dir: q.dir, unit: q.unit, delayIds, commencedContractIds: [...new Set(commenced.map((v) => v.contract.id))] });
  const ready = [...derived.values()].filter((x) => x === "READY_TO_SIGN").length;
  const awaiting = [...derived.values()].filter((x) => x === "AWAITING_CONDITIONS").length;
  // 6.13 Part A (FR-SUP-010): In Delay, derived, never stored. Tagged ASSUMED (the shared badge) only where the
  // reading rests on the straight-line assumption (BD-613-12, narrowed by the residual review); a lapsed date for
  // completion does not.
  const inDelay = new Set(delayIds);

  const rows: Row[] = commencedView ? [] : buildCaseRows(data.rows, { derived, inDelay, policy, today: org0?.today ?? null, lang }, { forExport: false });
  // A view's address keeps the search, the sort and the page size; the page starts again.
  const at = (v: CaseRowView | undefined) => listHref("/projects", { ...q, view: v ?? null, page: 0 });

  const choices = await facetChoices(db, actor.organisationId);
  const countLabel = (label: string, count: number) => sayWith(L.viewCount, lang, { label, count: String(count) });
  // The plain name of each view, for the card heading (the option's own label carries its count).
  const plainNames = new Map<string, string>();
  const option = (value: CaseRowView | "all", label: string, count: number) => {
    plainNames.set(value, label);
    return { value, label: countLabel(label, count), href: at(value === "all" ? undefined : value) };
  };
  const viewGroups: ViewGroup[] = [
    {
      label: t(L.groupStage),
      options: [
        option("all", t(L.all), data.counts.all),
        ...STAGE_VIEWS.map((v) => option(v, t(CASE_VIEW_WORDS[v]), data.counts[v])),
      ],
    },
    {
      label: t(L.groupAttention),
      options: [
        option("delay", t(L.inDelay), data.counts.delay),
        ...WORK_VIEWS.map((v) => (v === "expired" && !data.indentRuleSet ? { value: v, label: sayWith(L.validityNotSet, lang, { label: t(CASE_VIEW_WORDS[v]) }), href: at(v) } : option(v, t(CASE_VIEW_WORDS[v]), data.counts[v]))),
        { value: "commenced", label: n(L.commencedPending, commenced.length), href: "/projects?view=commenced" },
      ],
    },
    {
      label: t(L.groupRegisters),
      options: [
        { value: "securities", label: n(L.securitiesExpiring, securitiesCount), href: "/projects?view=securities" },
        { value: "submissions", label: n(L.submissionsWaiting, submissionsWaiting), href: "/projects?view=submissions" },
      ],
    },
  ];

  const current = delayView ? "delay" : (rowView ?? "all");
  // The heading names the list showing, as Sourcing's does: "All contracts" until a view narrows it.
  const chosenTitle = current === "all" ? t(L.allContracts) : (plainNames.get(current) ?? t(L.allContracts));

  return (
    <>
      <PageHeader
        title={t(L.title)}
        info={{ title: t(L.infoTitle), text: t(L.infoText) }}
      />
      <StatusCounts
        label={t(L.statusCountsLabel)}
        className="mb-6"
        items={[
          { label: t(L.awarding), count: data.counts.awarding, href: at("awarding"), tone: "info", active: current === "awarding" },
          { label: t(L.signing), count: data.counts.signing, href: at("signing"), tone: "info", active: current === "signing" },
          { label: t(L.onSite), count: data.counts.on_site, href: at("on_site"), tone: "ok", active: current === "on_site" },
          { label: t(L.awaitingConditions), count: awaiting, href: at("signing"), tone: "warn" },
          { label: t(L.readyToSign), count: ready, href: at("signing"), tone: "ok" },
        ]}
      />
      {commencedView ? (
        <CommencedCard rows={commenced} hidden={new Set(hidden)} exposure={exposure} page={page} today={today} lang={lang} />
      ) : (
      <Card className="overflow-hidden">
        <CardHeader icon={<FileIcon size={17} />} title={chosenTitle} divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="cases"
          searchPlaceholder={t(L.search)}
          emptyTitle={t(delayView ? L.noneInDelay : rowView ? L.noneHere : L.noCasesYet)}
          toolbarFilters={
            <>
              <CaseViewSelect groups={viewGroups} current={current} label={t(L.showCases)} chipLabel={t(L.viewChip)} />
              <ListFacets facets={[codeFacet("/projects", q, "unit", "Department", "Any department", choices.units, "A unit no longer configured")]} />
            </>
          }
          rowAction={{ label: t(L.open), hrefTemplate: "/projects/{id}" }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "contract", label: t(L.colProject), mobile: "primary" },
            { key: "contractor", label: t(L.colContractor), width: "200px", hideBelow: "2xl", mobile: "meta" },
            { key: "sum", label: t(L.colValue), width: "140px", numeric: true, mobile: "meta" },
            { key: "phase", label: t(L.colStatus), width: "240px", mobile: "meta" },
            { key: "dates", label: t(L.colDates), width: "220px", mobile: "meta" },
          ]}
          rows={rows}
          server={serverMode("/projects", q, { total: data.total, page: data.page, sortColumns: { contract: "reference" }, exportHref: data.total > LIST_EXPORT_MAX_ROWS ? undefined : listHref("/projects/export", { ...q, page: 0, size: undefined }), exportBlocked: data.total > LIST_EXPORT_MAX_ROWS ? "This view cannot be exported" : undefined })}
        />
      </Card>
      )}
    </>
  );
}

/// FR-VAR-014: the exposure report (`buildCommencedRows`). `hidden`: the restricted exercises this reader is not named on, whose titles are not shown (L8).
function CommencedCard({ rows, hidden, exposure, page, today, lang }: { rows: CommencedVariation[]; hidden: ReadonlySet<string>; exposure: bigint; page: number; today: string | null; lang: Language }) {
  const t = (words: Words) => say(words, lang);
  const pages = Math.ceil(rows.length / COMMENCED_PAGE);
  const at = Math.min(page, Math.max(0, pages - 1));
  const shown = rows.slice(at * COMMENCED_PAGE, (at + 1) * COMMENCED_PAGE);
  const list: Row[] = buildCommencedRows(shown, hidden, today, lang);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FileIcon size={17} />}
        title={t(L.commencedTitle)}
        subtitle={sayWith(L.commencedSubtitle, lang, { count: String(rows.length), amount: formatMoney(exposure) })}
        actions={<ButtonLink href="/projects" size="sm" variant="secondary">{t(L.allContracts)}</ButtonLink>}
        divided={false}
      />
      <DataList
        flat
        selectable={false}
        exportName="commenced-pending-approval"
        searchPlaceholder={t(L.commencedSearch)}
        emptyTitle={t(L.none)}
        stackBelow="xl"
        columns={[
          { key: "variation", label: t(L.colVariation), mobile: "primary" },
          { key: "contract", label: t(L.colContract), width: "260px", hideBelow: "2xl", mobile: "meta" },
          { key: "estimate", label: t(L.colEstimate), width: "140px", numeric: true, sortable: true, mobile: "meta" },
          { key: "age", label: t(L.colAge), width: "160px", sortable: true, mobile: "meta" },
        ]}
        rows={list}
      />
      {pages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>{sayWith(L.variationsRange, lang, { from: String(at * COMMENCED_PAGE + 1), to: String(Math.min(rows.length, (at + 1) * COMMENCED_PAGE)), total: String(rows.length) })}</span>
          <span className="flex gap-2">
            {at > 0 && <ButtonLink href={`/projects?view=commenced&page=${at - 1}`} size="sm" variant="ghost">{t(L.previous)}</ButtonLink>}
            {at + 1 < pages && <ButtonLink href={`/projects?view=commenced&page=${at + 1}`} size="sm" variant="ghost">{t(L.next)}</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
