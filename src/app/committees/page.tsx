import { hiddenExercises, sulitGates, type GateSubject } from "@/app/_auth/sulit";
import { sulitCell } from "@/components/sulit-cell";
import type { StaffActor } from "@/lib/auth/types";
import type { WaitingEntry } from "@/lib/committee/waiting-load";
import { CalendarIcon, ClockIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { serverMode } from "@/components/server-list";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCounts } from "@/components/ui/status-counts";
import { SCHEDULE_WORDS, WAITING_KIND_WORDS, WAITING_WORDS } from "@/lib/committee/labels";
import { loadWaiting } from "@/lib/committee/waiting-load";
import { listSittings, SITTING_VIEWS } from "@/lib/committee/sittings";
import { LIST_EXPORT_MAX_ROWS, listHref, parseListQuery, sortKeys } from "@/lib/list-query";
import { db } from "@/lib/db";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { ACT_LABEL } from "@/lib/labels";
import { patternFaults } from "@/lib/numbering/series";

import { ScheduleSitting, type ProposedItem } from "./editors";
import { buildSittingRows } from "./rows";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committees" };


/**
 * Committees: the running of committees, apart from their setup.
 *
 * Not in the prototype, which only shows a committee's votes on each matter's own
 * record. That view arrives with the modules that own the matters; this list works
 * before them (ruling 5.1).
 */
export default async function SittingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStaff();
  const q = parseListQuery(await searchParams, SITTING_VIEWS, sortKeys("sitting"));
  const { sittings, committees, total, page, counts } = await listSittings(actor, q);
  const orgId = actor.organisationId;
  const series = orgId
    ? await db.numberingSeries.findUnique({ where: { organisationId_key: { organisationId: orgId, key: "meeting" } } })
    : null;
  const numbered = series != null && patternFaults(series).length === 0;
  const waiting = await loadWaiting(actor.organisationId, await hiddenExercises(actor));
  // Founder, 2026-10-05: what the schedule drawer proposes for each committee. It is tabled by the signed-in holder of the Secretariat office (Phase 2b).
  const proposed: Record<string, ProposedItem[]> = {};
  for (const e of waiting?.entries ?? []) {
    if (e.tabledAt !== "SITTING" || !e.committeeId) continue;
    (proposed[e.committeeId] ??= []).push({
      value: e.stepId,
      label: `${WAITING_KIND_WORDS[e.kind].en} ${e.reference} · ${e.title}`,
      description: `${ACT_LABEL[e.act] ?? "Not on record"} · ${e.waitingDays == null ? WAITING_WORDS.daysUnset.en : `${WAITING_WORDS.waiting.en} ${WAITING_WORDS.days.en(e.waitingDays)}`}`,
    });
  }
  const fromRecord = (waiting?.entries ?? []).some((e) => e.tabledAt === "RECORD");

  // Counted across every sitting, not only this page.
  const { upcoming, awaiting, pending } = counts;
  const view = (v: (typeof SITTING_VIEWS)[number] | null) => listHref("/committees", { q: q.q, view: v, sort: q.sort, dir: q.dir, size: q.size });
  const schedulable = committees.filter((c) => c.retiredOn == null || c.retiredOn > new Date());

  const rows = buildSittingRows(sittings, { forExport: false });

  return (
    <>
      <PageHeader
        title="Committees"
        info={{ title: "Committees", text: "Registers, tabled matters, votes and minutes. A sitting tables the items waiting for its committee when scheduled." }}
        actions={schedulable.length > 0 ? <ScheduleSitting committees={schedulable} numbered={numbered} proposed={proposed} fromRecord={fromRecord} /> : undefined}
      />

      <StatusCounts
        label="Where sittings stand"
        className="mb-6"
        items={[
          { label: "Upcoming", count: upcoming, href: view("upcoming"), tone: "info", active: q.view === "upcoming" },
          { label: "Awaiting minutes", count: awaiting, href: view("awaiting"), tone: "warn", active: q.view === "awaiting" },
          // Matters, not sittings: it counts the tabled items still undecided, so it is not a view of the list.
          { label: "Matters pending", count: pending, href: view(null) },
        ]}
      />

      <WaitingToBeTabled actor={actor} waiting={waiting} />

      <Card className="overflow-hidden">
        <CardHeader
          icon={<CalendarIcon size={17} />}
          title="Sittings"
          subtitle={committees.length === 0 ? "Set up a committee first." : undefined}
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="sittings"
          searchPlaceholder="Search sittings"
          emptyTitle="No sittings yet. Schedule one to table the waiting items."
          rowAction={{ label: "Open", hrefTemplate: "/committees/{id}" }}
          rowOpens
          columns={[
            { key: "committee", label: "Committee", mobile: "meta" },
            { key: "reference", label: SCHEDULE_WORDS.sittingNumber.en, width: "176px", nowrap: true, mobile: "primary" },
            { key: "date", label: "Date", width: "128px", nowrap: true, mobile: "meta" },
            { key: "status", label: "Status", width: "128px", mobile: "meta" },
            { key: "matters", label: "Matters", width: "176px", mobile: "meta" },
            { key: "quorum", label: "Quorum", width: "96px", mobile: "meta" },
          ]}
          rows={rows}
          server={serverMode("/committees", q, { total, page, sortColumns: { committee: "name", reference: "reference", date: "date" }, exportBlocked: total > LIST_EXPORT_MAX_ROWS ? "This view cannot be exported" : undefined })}
        />
      </Card>
    </>
  );
}

/**
 * Waiting to be tabled (founder, 2026-10-05): the open routes whose current step is a committee's, with no matter
 * tabled for it yet (`waiting.ts`). Grouped by committee through the filter; scheduling a sitting of the committee
 * offers the ones a sitting tables. The value is SULIT, so its column carries the lock and the list exports without it.
 */
/// What the value of a waiting route is read as: the record it belongs to and whose scope judges it. Null where it is not SULIT (an appointment's awarded value).
function waitingSubject(e: WaitingEntry): GateSubject | null {
  switch (e.kind) {
    case "REQUISITION":
      return { scope: "requisition", entity: "Requisition", id: e.recordId, label: e.reference };
    case "NAME":
      return { scope: "exercise", id: e.recordId, label: e.reference };
    case "VARIATION":
      return { scope: "contract", entity: "Variation", id: e.recordId, label: e.reference };
    case "CONTRACT":
      return { scope: "contract", entity: "ContractMatter", id: e.recordId, label: e.reference };
    case "APPOINTMENT":
      return null;
  }
}

async function WaitingToBeTabled({ actor, waiting }: { actor: StaffActor; waiting: Awaited<ReturnType<typeof loadWaiting>> }) {
  const W = WAITING_WORDS;
  const entries = waiting?.entries ?? [];
  // The value a route waits on is SULIT (founder, 2026-10-05; Phase 3b): a requisition's is the department estimate, a name approval's the exercise's, a variation's or a contract matter's
  // a figure of the contract. An appointment's is the awarded value, ruled not SULIT. Judged for each entry by the record it belongs to, and logged.
  const gates = await sulitGates(actor, entries.flatMap((e) => { const g = waitingSubject(e); return g ? [g] : []; }), ["waitingValue"], { list: true });
  const rows: Row[] = entries.map((e) => ({
    id: e.stepId,
    search: [e.reference, e.title, e.committeeName, WAITING_KIND_WORDS[e.kind].en].join(" "),
    sortKeys: { waiting: e.waitingDays ?? -1, record: e.reference },
    cells: {
      record: { kind: "link", text: e.reference, href: e.href, sub: e.title },
      kind: { kind: "text", text: WAITING_KIND_WORDS[e.kind].en },
      committee: { kind: "text", text: e.committeeName },
      act: { kind: "text", text: ACT_LABEL[e.act] ?? "Not on record" },
      amount: waitingSubject(e) ? sulitCell(gates.get(e.recordId)!, () => ({ kind: "money" as const, sen: e.waitingValue })) : { kind: "money", sen: e.waitingValue },
      waiting:
        e.waitingDays == null
          ? { kind: "text", text: W.daysUnset.en, dim: true }
          : { kind: "badge", text: W.days.en(e.waitingDays) },
      tabled: { kind: "text", text: e.tabledAt === "SITTING" ? W.tabledAtSitting.en : W.tabledFromRecord.en, dim: true },
    },
    note: e.waitingDays == null ? `${W.since.en(formatDate(dayToDate(e.waitingSince)))}. ${W.daysUnsetWhy.en}` : undefined,
  }));
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader icon={<ClockIcon size={17} />} title={W.title.en} subtitle={W.subtitle.en} divided={false} />
      <DataList
        flat
        selectable={false}
        exportName="waiting-to-be-tabled"
        searchPlaceholder={W.search.en}
        emptyTitle={W.emptyTitle.en}
        filters={[
          { key: "committee", label: W.committee.en },
          { key: "kind", label: W.kind.en },
        ]}
        columns={[
          { key: "record", label: W.record.en, sortable: true, mobile: "primary" },
          { key: "kind", label: W.kind.en, width: "136px", mobile: "meta" },
          { key: "committee", label: W.committee.en, width: "176px", mobile: "meta" },
          { key: "act", label: W.act.en, width: "156px", hideBelow: "xl", mobile: "meta" },
          { key: "amount", label: W.amount.en, width: "140px", numeric: true, sulit: true, mobile: "meta" },
          { key: "waiting", label: W.waiting.en, width: "104px", sortable: true, mobile: "meta" },
          { key: "tabled", label: W.how.en, width: "200px", hideBelow: "2xl", mobile: "hide" },
        ]}
        rows={rows}
      />
    </Card>
  );
}
