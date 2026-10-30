import { Suspense } from "react";

import { ActGate } from "@/components/act-gate";
import { DataList, ListSearch, type Cell, type Column, type Row } from "@/components/data-list";
import { BoardIcon, ClipboardIcon, ListIcon } from "@/components/icons";
import { ListFacets } from "@/components/list-facets";
import { Board, type BoardCard, type BoardColumn } from "@/components/ui/board";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { Segment, Segmented } from "@/components/ui/segmented";
import type { StaffActor } from "@/lib/auth/types";
import { actStatusBlocker } from "@/lib/contract/act-status";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import type { FacetSpec } from "@/lib/list-facets";
import { formatDate } from "@/lib/format";
import { cardMoves } from "@/lib/work/board";
import { typeOfferable } from "@/lib/work/fields";
import { filtersOf, parseWorkQuery, reset, workHref, workServerMode, type WorkQuery } from "@/lib/work/href";
import { itemRefText, LATE_NOT_JUDGED_WORDS, latenessWords, NCR_WORD, NO_WORK_WORDS, STATUS_WORDS, VIEW_EMPTY_WORDS, viewWords, whoCanWords, type WhoNames } from "@/lib/work/labels";
import { lateness } from "@/lib/work/late";
import { assigneeOptions, contractorHasActiveAccount, contractorNameOf, linkOptions, loadBoard, loadWorkContext, loadWorkList, namesOf, WORK_SORT_KEYS, type WorkCardRow, type WorkSortKey } from "@/lib/work/load";
import { CONTRACTOR_ASSIGNEE } from "@/lib/work/fields";
import { personIdOf } from "@/lib/work/party";
import type { WorkActor } from "@/lib/work/types";
import { WORK_VIEWS } from "@/lib/work/views";

import { moveWorkItem, editWorkField } from "./work-actions";
import { NewItemDrawer, QuickAdd } from "./work-editors";
import { WorkItemPanel } from "./work-item-panel";
import { WorkItemSkeleton } from "./work-skeleton";
import { closedWords, editWhy, WORK_PANEL_PAD, IMPACT_OPTIONS, PRIORITY_OPTIONS, QUICK_TYPES, SEVERITY_OPTIONS, shareConfirmWords, STATUS_OPTIONS, TYPE_OPTIONS } from "./work-shared";

type Option = { value: string; label: string };
type Params = Record<string, string | string[] | undefined>;

/// More people than this and the list's assignee is read only (the panel edits it): every row would carry the whole picker.
const INLINE_PEOPLE_MAX = 100;

/**
 * The case's Work tab (workspace 3a, plan §4; design note 0008): one toolbar and one address for the List and the Board, the item panel beside them when `item` names one.
 * Only this tab's readers run; the page calls it only when `?tab=work`. The rules (what a reader may move, edit or see) are `src/lib/work`'s; this file draws what they say.
 */
export async function WorkPanel({ actor, l, sp }: { actor: StaffActor; l: LoadedContract; sp: Params }) {
  const org = actor.organisationId;
  const contractId = l.contract.id;
  const q = parseWorkQuery(sp, WORK_SORT_KEYS);
  const loaded = await loadWorkContext({ organisationId: org, contractId, now: new Date() });
  if (!loaded) return null;
  const { context: ctx } = loaded;
  // The act x status table's row for Work, stated once to every drawer and control beneath (ActGate); the acts ask it again under the lock.
  const shut = actStatusBlocker("WORK_ITEM", ctx.contractStatus);
  const reader: WorkActor = { side: "STAFF", personId: actor.personId, leadIds: ctx.lead.ids, mayReadContract: true };
  const base = { organisationId: org, contractId, viewerId: actor.personId, view: q.view, filters: filtersOf(q), today: ctx.today, timeZone: ctx.timeZone };
  const notJudged = q.view === "late" && ctx.today === null;
  const [people, linkOpts, leadNames] = await Promise.all([assigneeOptions({ organisationId: org, contractId }), linkOptions({ organisationId: org, contractId }), namesOf(db, org, ctx.lead.ids)]);
  const peopleOptions: Option[] = [...people.filter((p) => p.value === actor.personId).map((p) => ({ ...p, label: `${p.label} (me)` })), ...people.filter((p) => p.value !== actor.personId)];
  const contractor = contractorNameOf(l);
  // Read once, for the New item drawer, the list's assignee picker and the item panel (the chip beside a contractor assignee).
  const noAccount = !(await contractorHasActiveAccount(db, l));
  const who = (r: WorkCardRow): WhoNames => ({ raiser: r.raisedByName, assignee: r.assigneeName, lead: ctx.lead.roleLabel ? { roleLabel: ctx.lead.roleLabel, names: ctx.lead.ids.map((id) => leadNames.get(id) ?? "Someone") } : null });
  const at = (change: Partial<WorkQuery>) => workHref(contractId, q, change);

  // ---------------------------------------------------------------- the toolbar, the same above the List and the Board
  const views = (
    <Segmented as="nav" aria-label="Work views" className="flex-wrap">
      {WORK_VIEWS.map((v) => (
        <Segment key={v} on={q.view === v} href={at({ view: v, ...reset })} scroll={false}>
          {viewWords(v, l.award.awardeeName).en}
        </Segment>
      ))}
    </Segmented>
  );
  const facet = (key: "type" | "assignee" | "priority" | "shared", label: string, any: string, options: Option[]): FacetSpec => ({
    key,
    label,
    value: q[key] ?? "",
    options: [{ value: "", label: any }, ...options].map((o) => ({ ...o, href: at({ [key]: o.value || null, ...reset }) })),
  });
  const filters = (
    <>
      <ListFacets facets={[facet("type", "Type", "Any type", TYPE_OPTIONS), facet("assignee", "Assignee", "Anyone", peopleOptions), facet("priority", "Priority", "Any priority", PRIORITY_OPTIONS), facet("shared", "Sharing", "Shared or not", [{ value: "yes", label: `Shared with ${contractor}` }, { value: "no", label: "Not shared" }])]} />
      <Segmented as="nav" aria-label="Layout" className="ml-auto">
        {([["list", "List", <ListIcon key="l" size={15} />], ["board", "Board", <BoardIcon key="b" size={15} />]] as const).map(([mode, label, icon]) => (
          <Segment key={mode} on={q.mode === mode} href={at({ mode, page: 0 })} scroll={false} icon={icon}>
            {label}
          </Segment>
        ))}
      </Segmented>
    </>
  );
  const itemHrefBase = at({ item: null });
  const newItem = ctx.open ? (
    <NewItemDrawer
      contractId={contractId}
      contractor={contractor}
      itemHrefBase={itemHrefBase}
      types={TYPE_OPTIONS.filter((t) => typeOfferable(t.value, ctx.contractStatus))}
      priorities={PRIORITY_OPTIONS}
      impacts={IMPACT_OPTIONS}
      severities={SEVERITY_OPTIONS}
      people={[{ value: "", label: "Unassigned" }, ...peopleOptions]}
      documents={linkOpts.documents}
      noAccount={noAccount}
    />
  ) : null;

  // ---------------------------------------------------------------- the body
  let body: React.ReactNode;
  if (notJudged) {
    body = (
      <EmptyState
        title={LATE_NOT_JUDGED_WORDS.en}
        action={
          <ButtonLink href="/configuration/organisation" size="sm" variant="secondary">
            Set time zone
          </ButtonLink>
        }
      />
    );
  } else if (q.mode === "board") {
    const columns = await loadBoard(base);
    const cards: BoardCard[] = columns.flatMap((c) => c.items).map((r) => {
      const m = cardMoves(r, reader, { contractOpen: ctx.open, who: who(r) });
      const late = lateness(r.dueOn, r.status, ctx.today);
      const lateText = latenessWords(late);
      return {
        id: r.id,
        columnId: r.status,
        title: r.title,
        sub: itemRefText(r.type, r.number),
        href: at({ item: r.ref }),
        badges: [
          ...(r.dueOn ? [{ text: lateText ? `${formatDate(dayToDate(r.dueOn))} · ${lateText}` : formatDate(dayToDate(r.dueOn)), tone: lateText ? ("err" as const) : undefined }] : []),
          ...(r.sharedAt ? [{ text: "Shared" }] : []),
          ...(r.priority === "HIGH" ? [{ text: "▲ High", tone: "warn" as const }] : r.priority === "URGENT" ? [{ text: "▲▲ Urgent", tone: "err" as const }] : []),
          ...(r.type === "INSPECTION" && r.inspectionResult === "FAILED" ? [{ text: NCR_WORD.en, tone: "err" as const }] : []),
        ],
        assignee: r.assigneeName ?? undefined,
        moves: m.moves,
        stuckWhy: m.stuckWhy ?? undefined,
        fields: { contractId, itemId: r.id },
      };
    });
    const cols: BoardColumn[] = columns.map((c) => ({
      id: c.column,
      label: STATUS_WORDS[c.column].en,
      total: c.total,
      moreHref: at({ mode: "list", ...reset }),
      olderHref: c.column === "DONE" ? at({ mode: "list", view: "done", ...reset }) : undefined,
      olderCount: c.column === "DONE" ? c.older : undefined,
    }));
    body = (
      <div className="px-5 pb-5 sm:px-6">
        <Board columns={cols} cards={cards} move={moveWorkItem} label="Work board" headingLevel={3} moreLabel="See all" moveLabel="Move to" olderLabel="Older: in the list" emptyColumn="Nothing here" />
      </div>
    );
  } else {
    const { rows: found, total, page } = await loadWorkList({ ...base, page: q.page, size: q.size, sort: q.sort as WorkSortKey | null, dir: q.dir });
    const inline = people.length <= INLINE_PEOPLE_MAX;
    const rows: Row[] = found.map((r) => {
      const w = who(r);
      const why = editWhy(ctx, r, reader, w);
      const moves = cardMoves(r, reader, { contractOpen: ctx.open, who: w });
      const reachable: string[] = [r.status, ...moves.moves];
      const lateText = latenessWords(lateness(r.dueOn, r.status, ctx.today));
      const dueText = r.dueOn ? formatDate(dayToDate(r.dueOn)) : "";
      const fields = { contractId, itemId: r.id };
      const edit = (field: string, value: string, options: Option[], label: string): Cell => ({ kind: "select", name: "value", value, options, label: `${label} of ${itemRefText(r.type, r.number)}`, action: editWorkField, fields: { ...fields, field }, disabledWhy: why, ...(field === "assigneePersonId" ? { ...(noAccount ? { flag: { value: CONTRACTOR_ASSIGNEE, text: "No active portal account" } } : {}), confirm: { when: CONTRACTOR_ASSIGNEE, ...shareConfirmWords(contractor, noAccount), confirmLabel: "Share", cancelLabel: "Keep it internal" } } : {}) });
      return {
        id: r.id,
        search: `${itemRefText(r.type, r.number)} ${r.title}`,
        cells: {
          item: { kind: "link", text: r.title, sub: r.sharedAt ? `${itemRefText(r.type, r.number)} · Shared` : itemRefText(r.type, r.number), href: at({ item: r.ref }), scroll: false },
          type: { kind: "text", text: TYPE_OPTIONS.find((t) => t.value === r.type)?.label ?? "" },
          status: {
            kind: "select",
            name: "to",
            value: r.status,
            options: STATUS_OPTIONS.filter((o) => reachable.includes(o.value)),
            label: `Status of ${itemRefText(r.type, r.number)}`,
            action: moveWorkItem,
            fields: { ...fields, from: r.status },
            disabledWhy: moves.moves.length === 0 ? (moves.stuckWhy ?? (ctx.open ? whoCanWords("MARK_DONE", w).en : why)) : undefined,
          },
          assignee: inline ? edit("assigneePersonId", r.assignee?.kind === "CONTRACTOR" ? CONTRACTOR_ASSIGNEE : (personIdOf(r.assignee) ?? ""), [{ value: "", label: "Unassigned" }, ...peopleOptions], "Assignee") : r.assigneeName ? { kind: "person", name: r.assigneeName } : { kind: "text", text: "Unassigned", dim: true },
          due: lateText ? { kind: "chip", text: `${dueText} · ${lateText}`, tone: "err" } : { kind: "text", text: dueText || "No due date", dim: !dueText },
          priority: edit("priority", r.priority, PRIORITY_OPTIONS, "Priority"),
        },
      };
    });
    const columns: Column[] = [
      { key: "item", label: "Item", sortable: true, mobile: "primary" },
      { key: "type", label: "Type", width: "140px", sortable: true, hideBelow: "xl", mobile: "meta" },
      { key: "status", label: "Status", width: "170px", sortable: true, mobile: "meta" },
      { key: "assignee", label: "Assignee", width: "190px", sortable: true, mobile: "meta" },
      { key: "due", label: "Due", width: "190px", sortable: true, mobile: "meta" },
      { key: "priority", label: "Priority", width: "130px", sortable: true, mobile: "meta" },
    ];
    const narrowed = q.view !== "open" || q.type || q.assignee || q.priority || q.shared || q.q;
    body = (
      <>
        {ctx.open && <QuickAdd contractId={contractId} itemHrefBase={itemHrefBase} types={QUICK_TYPES.filter((t) => typeOfferable(t.value, ctx.contractStatus))} />}
        <DataList
          flat
          selectable={false}
          exportName="work-items"
          searchPlaceholder="Search title or number"
          emptyTitle={narrowed ? VIEW_EMPTY_WORDS[q.view].en : NO_WORK_WORDS.en}
          toolbarLead={views}
          toolbarFilters={filters}
          stackBelow={q.item ? "2xl" : "xl"}
          columns={columns}
          rows={rows}
          server={workServerMode(contractId, q, { total, page, columns: { item: "item", type: "type", status: "status", assignee: "assignee", due: "due", priority: "priority" } })}
        />
      </>
    );
  }

  return (
    <ActGate blocker={shut}>
      <div className={q.item ? WORK_PANEL_PAD : undefined}>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title="Work"
          info={{ label: "About work items", text: "RFIs, site instructions, inspections, safety incidents, action items, defects and tasks on this contract. Each is numbered by type and can be assigned, moved, discussed and filed against." }}
          actions={newItem}
          divided={false}
        />
        {!ctx.open && (
          <div className="px-5 pb-3 sm:px-6">
            <Note>{closedWords(ctx.contractStatus)}</Note>
          </div>
        )}
        {q.mode === "board" || notJudged ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3 sm:px-6">
              {views}
              {!notJudged && <ListSearch server={workServerMode(contractId, q, { total: 0, page: 0, columns: {} })} placeholder="Search title or number" />}
              {filters}
            </div>
            {body}
          </>
        ) : (
          body
        )}
      </Card>
      </div>
      {q.item && (
        <Suspense key={q.item} fallback={<WorkItemSkeleton />}>
          <WorkItemPanel l={l} ctx={ctx} hrefs={{ close: at({ item: null }), item: (ref) => at({ item: ref }) }} personId={actor.personId} address={q.item} people={people} linkOpts={linkOpts} noAccount={noAccount} />
        </Suspense>
      )}
    </ActGate>
  );
}
