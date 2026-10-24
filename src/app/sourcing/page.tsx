import { DataList } from "@/components/data-list";
import { GlobeIcon, PlusIcon } from "@/components/icons";
import { serverMode } from "@/components/server-list";
import { ListFacets } from "@/components/list-facets";
import { db } from "@/lib/db";
import { codeFacet, facetChoices, SOURCING_STAGES, stageFacet } from "@/lib/list-facets";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { LIST_EXPORT_MAX_ROWS, listHref, parseListQuery, sortKeys } from "@/lib/list-query";
import { BOUNDARY_VIEW_ABOUT, boundaryCountNote } from "@/lib/method/boundary-reading";
import { EXERCISE_STATUS_LABEL, TERM } from "@/lib/method/labels";
import { exerciseCandidates, exerciseListFacts, EXERCISE_VIEWS, isJudgedView, listExercises, PUBLISHED_STATUSES, type ExerciseView } from "@/lib/method/repo";
import { CLOSING_SOON_DAYS } from "@/lib/window/closing-soon";
import { windowColumns } from "@/lib/window/read";

import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises, sulitExerciseValues } from "@/app/_auth/sulit";

import { buildExerciseRows, judgedViewIds } from "./rows";

export const metadata = { title: "Tenders & quotations" };
export const dynamic = "force-dynamic";

/// The views' headings and what an empty one says; the chips above are how a reader chooses one.
const VIEWS: { id: ExerciseView; label: string; about?: string; emptyTitle?: string }[] = [
  { id: "drafts", label: EXERCISE_STATUS_LABEL.DRAFT },
  { id: "preparing", label: EXERCISE_STATUS_LABEL.DOCUMENTS_IN_PREPARATION },
  { id: "approval", label: EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING },
  { id: "published", label: "Published" },
  { id: "open", label: "Open for purchase" },
  {
    id: "soon",
    label: `Closing within ${CLOSING_SOON_DAYS} days`,
    about: `Closing today or in the next ${CLOSING_SOON_DAYS - 1} days. Past closings are not counted.`,
    emptyTitle: `Nothing closes within ${CLOSING_SOON_DAYS} days`,
  },
  { id: "boundary", label: "On the boundary", about: BOUNDARY_VIEW_ABOUT },
  { id: "name", label: `${TERM.nameApproval} in progress` },
];

/**
 * Sourcing exercises (6.3): classified here in Phase 1 — bands, method, contract type
 * and basis — while the sourcing itself still runs outside the portal (§13.3).
 */
export default async function SourcingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStaff();
  const q = parseListQuery(await searchParams, EXERCISE_VIEWS, sortKeys("exercise"));
  // FR-MTD-007: a restricted exercise the reader is not named on is not in the list, the counts or the search.
  const hidden = await hiddenExercises(actor);
  const facts = await exerciseListFacts(actor.organisationId, hidden, q);
  const { org, byStatus, awaitingName } = facts;
  const today = org?.today ?? null;
  // "On the boundary" states the estimate (ruling of 2026-10-08 on log line 1716), so it counts, lists and shows only the rows whose estimate this reader may read: the whole boundary set is judged here, for the chip and for the view.
  const boundaryValues = await sulitExerciseValues(actor, facts.onBoundary.map((r) => ({ id: r.id, reference: r.reference })), "estimatedValue", () => true, "exercise", { list: true });
  const granted = new Set(facts.onBoundary.filter((r) => boundaryValues.get(r.id)?.state === "GRANTED").map((r) => r.id));
  const boundaryLeftOut = facts.onBoundary.length - granted.size;
  // 6.5: each published exercise's closing and phase, derived now from the stored instants (ADR 0014): the open and closing-soon counts, and those two views, are judged from them.
  const judged = { windows: org ? await windowColumns(org.id, facts.publishedIds) : new Map(), today, granted };
  const published = facts.publishedIds.map((id) => ({ id }));
  const openCount = judgedViewIds("open", published, judged).length;
  const soonCount = judgedViewIds("soon", published, judged).length;
  // A judged view is paged over the ids that passed, in the list's order (ST-7), so the count and the sort are the judged ones.
  const ids = isJudgedView(q.view) && org ? judgedViewIds(q.view, await exerciseCandidates(org.id, hidden, q), judged) : undefined;
  const { rows, total, page } = await listExercises(actor.organisationId, hidden, q, { ids });
  const list = await buildExerciseRows(actor, rows, { forExport: false });
  const allCount = [...byStatus.values()].reduce((n, c) => n + c, 0);
  const publishedCount = PUBLISHED_STATUSES.reduce((n, st) => n + (byStatus.get(st) ?? 0), 0);
  const view = (v: ExerciseView | null) => listHref("/sourcing", { ...q, view: v, page: 0 });
  // I-6: the dashboard's filters, as dropdowns.
  const choices = await facetChoices(db, actor.organisationId);
  const facets = [
    codeFacet("/sourcing", q, "unit", "Department", "Any department", choices.units, "A unit no longer configured"),
    codeFacet("/sourcing", q, "method", "Method", "Any method", choices.methods, "A method no longer configured"),
    stageFacet("/sourcing", q, "Stage", "Any stage", SOURCING_STAGES),
  ];
  const chosen = VIEWS.find((v) => v.id === q.view) ?? null;
  // ST-8: the boundary view's rows state the estimate, so exporting them would disclose it: no export there; nor over the cap.
  const exportBlocked = q.view === "boundary" || total > LIST_EXPORT_MAX_ROWS ? "This view cannot be exported" : undefined;

  return (
    <>
      <PageHeader
        title="Tenders & quotations"
        /* Founder, 2026-10-05: what the screen covers sits behind the information button beside the title,
           not as a notice across the top. Brought up to date: bids, opening and evaluation are recorded here now. */
        info={{
          title: "What is recorded here",
          text: "Tenders and quotations are classified here, with their tender documents, window, bids, opening and evaluation.",
        }}
        actions={
          org ? (
            <ButtonLink href="/sourcing/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              {TERM.newExercise}
            </ButtonLink>
          ) : undefined
        }
      />

      <StatusCounts
        label="Where they stand"
        className="mb-6"
        items={[
          { label: "All", count: allCount, href: view(null), active: !q.view },
          { label: EXERCISE_STATUS_LABEL.DRAFT, count: byStatus.get("DRAFT") ?? 0, href: view("drafts"), active: q.view === "drafts" },
          { label: EXERCISE_STATUS_LABEL.DOCUMENTS_IN_PREPARATION, count: byStatus.get("DOCUMENTS_IN_PREPARATION") ?? 0, href: view("preparing"), tone: "info", active: q.view === "preparing" },
          { label: EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING, count: byStatus.get("PENDING_APPROVAL_FOR_TENDERING") ?? 0, href: view("approval"), tone: "info", active: q.view === "approval" },
          { label: "Published", count: publishedCount, href: view("published"), tone: "ok", active: q.view === "published" },
          { label: "Open for purchase", count: openCount, href: view("open"), tone: "ok", active: q.view === "open" },
          { label: `Closing within ${CLOSING_SOON_DAYS} days`, count: soonCount, href: view("soon"), tone: "warn", active: q.view === "soon" },
          { label: `${TERM.nameApproval} in progress`, count: awaitingName, href: view("name"), tone: "info", active: q.view === "name" },
          { label: "On the boundary", count: granted.size, href: view("boundary"), tone: "warn", active: q.view === "boundary" },
        ]}
      />
      {/* Said in words, so that a count of zero is never read as "none are": the rows whose estimate is withheld from this reader are not counted. */}
      {boundaryCountNote(boundaryLeftOut) && <p className="-mt-3 mb-6 text-[12.5px] text-ink-3">{boundaryCountNote(boundaryLeftOut)}</p>}

      <Card className="overflow-hidden">
        <CardHeader icon={<GlobeIcon size={17} />} title={chosen ? chosen.label : "All tenders and quotations"} subtitle={chosen?.about} divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="sourcing-exercises"
          searchPlaceholder="Search by title or reference"
          emptyTitle={chosen ? (chosen.emptyTitle ?? "Nothing in this view") : "No tenders or quotations yet"}
          rowAction={{ label: "Open", hrefTemplate: "/sourcing/{id}" }}
          rowOpens
          columns={[
            // Founder, 2026-10-05: the exercise's title was squeezed to a sliver by the fixed columns. It keeps
            // at least 260px (the table scrolls in its card rather than squeeze it) and the others are narrower.
            { key: "title", label: "Tender or quotation", minWidth: "260px", mobile: "primary" },
            { key: "method", label: "Method and contract type", width: "18%", hideBelow: "2xl" },
            { key: "value", label: "Value", width: "132px", numeric: true, sulit: true, sulitLabel: "SULIT. Shown to people named on the exercise and chosen roles. Not exported.", mobile: "meta" },
            { key: "window", label: "Closing", width: "168px", hideBelow: "lg", mobile: "meta" },
            { key: "status", label: "Status", width: "200px", mobile: "meta" },
            { key: "checks", label: "Band and checks", width: "168px", hideBelow: "2xl", mobile: "meta" },
          ]}
          toolbarFilters={<ListFacets facets={facets} />}
          rows={list}
          server={serverMode("/sourcing", q, { total, page, sortColumns: { title: "title" }, exportHref: exportBlocked ? undefined : listHref("/sourcing/export", { ...q, page: 0, size: undefined }), exportBlocked })}
        />
      </Card>
    </>
  );
}
