import { requireStaff } from "@/app/_auth/actor";
import { DataList, type Column, type Row } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState, Note } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { itemRefText, LATE_NOT_JUDGED_WORDS, latenessWords, STATUS_WORDS } from "@/lib/work/labels";
import { lateness } from "@/lib/work/late";
import { loadMyWork, type MyWorkRow } from "@/lib/work/load";
import { MY_WORK_EMPTY_WORDS, MY_WORK_SECTIONS, MY_WORK_WORDS, myWorkHref, parseMyWorkAddress } from "@/lib/work/my-work";
import { organisationToday } from "@/lib/org-time";
import { SECTION_HEADING, WORK_PANEL_PAD } from "../projects/[id]/work-shared";

import { MyWorkItemPanel } from "./item-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "My work" };

const COLUMNS: Column[] = [
  { key: "item", label: "Item", mobile: "primary" },
  { key: "project", label: "Project", width: "260px", hideBelow: "xl", mobile: "meta" },
  { key: "status", label: "Status", width: "130px", mobile: "meta" },
  { key: "due", label: "Due", width: "190px", mobile: "meta" },
];

/**
 * My work (`/my-work`; workspace 3b-ii, 0008 §5.6, WB-10): the work items on the signed-in person across every project, in six groups, as a list. The groups and who an item is
 * on are `src/lib/work/my-work.ts`'s; the rows are `loadMyWork`'s. An item opens in the same side panel as the project's Work tab, in place; moving it revalidates this page.
 */
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireStaff();
  const open = parseMyWorkAddress(await searchParams);
  const { today } = await organisationToday(actor.organisationId);
  const { rows: found, more } = await loadMyWork({ organisationId: actor.organisationId, personId: actor.personId, today });

  const rowOf = (r: MyWorkRow): Row => {
    const dueText = r.dueOn ? formatDate(dayToDate(r.dueOn)) : "";
    const lateText = latenessWords(lateness(r.dueOn, r.status, today));
    return {
      id: r.id,
      search: `${itemRefText(r.type, r.number)} ${r.title}`,
      cells: {
        item: { kind: "link", text: r.title, sub: itemRefText(r.type, r.number), href: myWorkHref({ contract: r.contractId, item: r.ref }), scroll: false },
        project: { kind: "text", text: r.contractLabel },
        status: { kind: "text", text: STATUS_WORDS[r.status].en },
        due: lateText ? { kind: "chip", text: `${dueText} · ${lateText}`, tone: "err" } : { kind: "text", text: dueText || "No due date", dim: !dueText },
      },
    };
  };
  const groups = MY_WORK_SECTIONS.map((section) => ({ section, rows: found.filter((r) => r.group === section) })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader title="My work" info={{ title: "My work", text: "Open items assigned to you on every project, and items you raised that are waiting for you to check. Formal approvals are in My approvals." }} />
      {today === null && found.some((r) => r.dueOn) && <Callout tone="warn" className="mb-6" title={LATE_NOT_JUDGED_WORDS.en} action={<ButtonLink href="/configuration/organisation" size="sm" variant="secondary">Set time zone</ButtonLink>} />}
      <div className={open.item ? WORK_PANEL_PAD : undefined}>
        {groups.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState title={MY_WORK_EMPTY_WORDS} action={<ButtonLink href="/projects" size="sm" variant="secondary">Go to projects</ButtonLink>} />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((g) => (
              <section key={g.section} aria-labelledby={`my-work-${g.section}`}>
                <h2 id={`my-work-${g.section}`} className={`mb-2 ${SECTION_HEADING}`}>
                  {MY_WORK_WORDS[g.section]} <span className="ml-1 text-ink-4 tabular-nums">{g.rows.length}</span>
                </h2>
                <Card className="overflow-hidden">
                  <DataList flat selectable={false} toolbar={false} stackBelow={open.item ? "2xl" : "xl"} columns={COLUMNS} rows={g.rows.map(rowOf)} emptyTitle={MY_WORK_EMPTY_WORDS} />
                </Card>
              </section>
            ))}
            {more > 0 && <Note>{`Showing the first ${found.length} of ${found.length + more}. Open a project's Work tab for the rest.`}</Note>}
          </div>
        )}
      </div>
      {open.contract && open.item && <MyWorkItemPanel organisationId={actor.organisationId} personId={actor.personId} contractId={open.contract} item={open.item} />}
    </>
  );
}
