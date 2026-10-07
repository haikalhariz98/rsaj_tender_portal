import { hiddenExercises, sulitGate, sulitGates, sulitMatterAmounts } from "@/app/_auth/sulit";
import { sulitCell } from "@/components/sulit-cell";
import { formatMoney } from "@/lib/money";
import {
  AwardIcon,
  CalendarIcon,
  ClockIcon,
  FilesIcon,
  GavelIcon,
  GlobeIcon,
  PlusIcon,
  SparkleIcon,
  ToolsIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { DataList } from "@/components/data-list";
import { Badge, Dot, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import Link from "next/link";
import type { ActivityKind } from "@/lib/dashboard/activity";
import { WAITING_RULE_TEXT } from "@/lib/approvals/queue";
import { phaseSummary, statusBreakdown } from "@/lib/method/phase";
import { loadDashboard } from "@/lib/dashboard";
import { formatDate, formatOrgDay } from "@/lib/format";
import { matterLabel } from "@/lib/labels";
import { greetingAt } from "@/lib/dates";
import { organisationTimeZone } from "@/lib/org-time";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// Where each kind of line links, and the icon that tells the kinds apart at a glance.
const ACTIVITY_HREF = {
  requisition: (id: string) => `/requisitions/${id}`,
  award: (id: string) => `/awards/${id}`,
  exercise: (id: string) => `/sourcing/${id}`,
  sitting: (id: string) => `/committees/${id}`,
};
const ACTIVITY_ICON: Record<ActivityKind, React.ReactNode> = {
  requisition: <FilesIcon size={15} />,
  approval: <ClockIcon size={15} />,
  exercise: <GlobeIcon size={15} />,
  sitting: <CalendarIcon size={15} />,
  matter: <UsersIcon size={15} />,
  award: <AwardIcon size={15} />,
};

/// Modules the dashboard will report on once they exist. Listed rather than drawn as
/// empty cards: three blank panels read as a broken screen, one honest list does not.
const COMING = [
  {
    icon: <ToolsIcon size={17} />,
    title: "Project health",
    body: "Progress, certified value and time remaining will report here once contract administration lands.",
  },
  {
    icon: <FilesIcon size={17} />,
    title: "Documents awaiting my review",
    body: "Submissions routed to you will land here for review against a service level.",
  },
];

export default async function Dashboard() {
  const actor = await requireStaff();
  const [data, timeZone] = await Promise.all([loadDashboard(actor.organisationId, await hiddenExercises(actor)), organisationTimeZone(actor.organisationId)]);

  if (!data) {
    return (
      <Card>
        <EmptyState title="Nothing configured yet" icon={<SparkleIcon size={24} />}>
          Run <code className="font-mono text-[12.5px]">npm run setup</code> to load the
          organisation.
        </EmptyState>
      </Card>
    );
  }

  // The figures on this page are SULIT (founder, item 26): a matter's amount by what kind of matter it is, a requisition's estimate, and the total of what was approved. Each is
  // judged for the reader and logged; a figure the reader may not read is "SULIT · withheld" with the reason, in the list, the sort and the total.
  const matterGates = await sulitMatterAmounts(actor, data.queue.map((q) => ({ id: q.decisionId, label: q.subject, kind: q.matterKind, hasAmount: q.amount != null })));
  const requisitionGates = await sulitGates(actor, data.requisitions.map((q) => ({ scope: "requisition" as const, entity: "Requisition", id: q.id, label: q.reference })), ["estimatedValue"]);
  const totalGate = await sulitGate(actor, { scope: "requisition", entity: "Dashboard", id: "value-approved", label: "Value approved" }, ["matterAmount"]);
  const now = new Date();
  // Greet by the name of whoever is signed in, from their session. Nobody signed in: the greeting alone.
  const firstName = actor.personName.split(/\s+/)[0];
  const waiting = data.queue.length + data.requisitions.length;
  // Waiting days are shown as a count, with no judgement: there is no configured
  // target to call one "aged" against until FR-APR-018's targets exist (ruling R5).

  return (
    <>
      <PageHeader
        title={firstName ? `${greetingAt(now, timeZone)}, ${firstName}` : greetingAt(now, timeZone)}
        subtitle={
          waiting === 0
            ? "No items are awaiting a decision."
            : `${waiting} ${waiting === 1 ? "item is" : "items are"} awaiting a decision.`
        }
        meta={[
          actor.jobTitle && (
            <>
              <UserIcon size={14} />
              {actor.jobTitle}
            </>
          ),
          <>
            <CalendarIcon size={14} />
            {formatOrgDay(now, timeZone)}
          </>,
        ]}
        actions={
          <>
            <ButtonLink href="/requisitions/new" variant="primary" icon={<PlusIcon size={16} />}>
              New requisition
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Awaiting a decision"
          value={waiting}
          tone="warn"
          icon={<ClockIcon size={17} />}
          hint={
            waiting > 0
              ? data.oldestWaiting == null
                ? "waiting time not counted"
                : `oldest ${data.oldestWaiting} ${data.oldestWaiting === 1 ? "day" : "days"}`
              : "queue is clear"
          }
        />
        <Stat
          label="Sourcing exercises"
          value={data.exercises.open}
          tone="brand"
          icon={<GlobeIcon size={17} />}
          href="/sourcing"
          hint={
            data.exercises.total === 0 ? (
              "none started yet"
            ) : (
              <span title={statusBreakdown(data.exercises.openByStatus, data.exercises.cancelled)}>
                {phaseSummary(data.exercises.openByStatus) || "none open"}
              </span>
            )
          }
        />
        <Stat
          label="Value approved"
          value={totalGate.state === "GRANTED" ? formatMoney(data.committedSen) : <SulitValue of={totalGate} />}
          tone="info"
          icon={<GavelIcon size={17} />}
          hint={`across ${data.decidedCount} decided matters${data.committedWithoutAmount ? ` · ${data.committedWithoutAmount} stated no amount` : ""}`}
        />
        <Stat
          label="Votes outstanding"
          value={data.votesOutstanding}
          tone="ok"
          icon={<UsersIcon size={17} />}
          hint="members yet to record a position"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<ClockIcon size={17} />}
              title="Committee matters waiting"
              subtitle="Matters routed to a committee, oldest first."
              divided={false}
              actions={
                <ButtonLink href="/configuration/committees" variant="ghost" size="sm">
                  View all
                </ButtonLink>
              }
            />
            <DataList
              flat
              exportName="committee-matters-waiting"
              searchPlaceholder="Search matters…"
              emptyTitle="No committee matter is waiting"
              emptyBody="Matters routed to a committee appear here the moment they are raised."
              views={[{ id: "financial", label: "Financial items" }]}
              filters={[
                { key: "type", label: "Type" },
                { key: "with", label: "Committee" },
              ]}
              rowAction={{
                label: "Open the sitting",
                hrefTemplate: "/configuration/committees",
              }}
              columns={[
                { key: "item", label: "Item", sortable: true, mobile: "primary" },
                { key: "type", label: "Type", width: "140px", sortable: true, hideBelow: "lg", mobile: "meta" },
                { key: "value", label: "Value", width: "132px", numeric: true, sortable: true, sulit: true, mobile: "meta" },
                { key: "waiting", label: "Waiting", width: "104px", numeric: true, sortable: true, mobile: "meta" },
                { key: "with", label: "With", width: "190px", hideBelow: "md", mobile: "meta" },
              ]}
              rows={data.queue.map((item) => ({
                id: item.decisionId,
                search: `${item.subject} ${item.matterRef ?? ""} ${item.committeeName}`,
                views: item.amount != null ? ["financial"] : [],
                sortKeys: {
                  ...(item.amount == null ? { value: -1 } : matterGates.get(item.decisionId) && matterGates.get(item.decisionId)!.state !== "GRANTED" ? {} : { value: item.amount }),
                  waiting: item.waitingDays,
                  item: item.subject,
                  type: matterLabel(item.domain),
                },
                cells: {
                  item: {
                    kind: "stack",
                    title: item.subject,
                    sub: item.matterRef ?? item.meetingReference,
                    monoSub: true,
                  },
                  type: { kind: "text", text: matterLabel(item.domain), dim: true },
                  value: matterGates.has(item.decisionId) ? sulitCell(matterGates.get(item.decisionId)!, () => ({ kind: "money" as const, value: item.amount })) : { kind: "money", value: item.amount },
                  waiting: { kind: "badge", text: `${item.waitingDays}d` },
                  with: {
                    kind: "link",
                    text: item.committeeName,
                    href: `/configuration/committees/${item.committeeCode}`,
                    sub: `${item.votesCast} of ${item.entitled} voted`,
                  },
                },
              }))}
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<ClockIcon size={17} />}
              title="Requisitions awaiting approval"
              subtitle={<LeadWithMore lead="Open approval routes, longest wait first." more={`Each step shows the office acting for it. ${WAITING_RULE_TEXT}`} />}
              divided={false}
              actions={
                <ButtonLink href="/approvals" variant="ghost" size="sm">
                  My approvals
                </ButtonLink>
              }
            />
            <DataList
              flat
              toolbar={false}
              selectable={false}
              exportName="requisitions-awaiting-approval"
              emptyTitle="No requisition is awaiting approval"
              emptyBody="A requisition appears here once it is submitted, until its route closes."
              rowAction={{ label: "Open", hrefTemplate: "/requisitions/{id}" }}
              rowOpens
              columns={[
                { key: "item", label: "Requisition", mobile: "primary" },
                { key: "on", label: "Waiting on", width: "200px", hideBelow: "md", mobile: "meta" },
                { key: "value", label: "Value", width: "132px", numeric: true, sulit: true, mobile: "meta" },
                { key: "waiting", label: "Waiting", width: "104px", numeric: true, mobile: "meta" },
              ]}
              rows={data.requisitions.map((q) => ({
                id: q.id,
                search: `${q.title} ${q.reference}`,
                cells: {
                  item: { kind: "link", text: q.title, href: `/requisitions/${q.id}`, sub: q.reference },
                  on: q.waitingOn ? { kind: "stack", title: q.waitingOn, sub: q.escalatedFrom ? `escalated from ${q.escalatedFrom}` : undefined } : { kind: "text", text: "No step pending", dim: true },
                  value: sulitCell(requisitionGates.get(q.id)!, () => ({ kind: "money" as const, value: q.estimatedValue })),
                  waiting: { kind: "badge", text: q.waitingDays == null ? "Not counted" : `${q.waitingDays}d` },
                },
              }))}
            />
          </Card>

          <Card tone="flat" className="border-dashed bg-surface/60">
            <CardHeader
              icon={<SparkleIcon size={17} />}
              title="On the way"
              subtitle="These will report here once their modules are built."
            />
            <CardBody className="grid gap-5 md:grid-cols-2">
              {COMING.map((c) => (
                <div key={c.title} className="min-w-0">
                  <div className="flex items-center gap-2 text-ink-3">
                    {c.icon}
                    <Badge tone="warn">Not built yet</Badge>
                  </div>
                  <div className="mt-2.5 text-[14px] font-bold text-ink">{c.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{c.body}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader
              icon={<CalendarIcon size={17} />}
              title="Upcoming sittings"
              subtitle="Committees scheduled to sit."
            />
            {data.upcoming.length === 0 ? (
              <EmptyState size="sm" title="Nothing scheduled" />
            ) : (
              <ul className="divide-y divide-line/70 px-2 py-1.5">
                {data.upcoming.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <Dot tone="brand" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold break-words text-ink">
                        {m.committeeName}
                      </div>
                      <div className="text-[12px] break-words text-ink-3">{m.reference}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[12.5px] font-bold text-ink tabular-nums">
                        {m.daysAway <= 0 ? "today" : `in ${m.daysAway} days`}
                      </div>
                      <div className="text-[12px] text-ink-4 tabular-nums">
                        {formatDate(m.meetingDate)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={<ClockIcon size={17} />} title="Recent activity" subtitle="Requisitions, sittings and awards as they move." />
            {data.activity.length === 0 ? (
              <EmptyState size="sm" title="Nothing has moved yet">
                Requisitions, sittings and awards appear here as they change.
              </EmptyState>
            ) : (
              <ol className="px-6 py-4">
                {data.activity.map((a) => {
                  const href = a.link ? ACTIVITY_HREF[a.link.kind](a.link.id) : null;
                  return (
                    <li key={a.key} className="relative flex gap-3 pb-4 last:pb-0">
                      <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line last:hidden" />
                      <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-3">
                        {ACTIVITY_ICON[a.kind]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink">
                          {href ? (
                            <Link href={href} className="rounded-sm hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500">
                              {a.headline}
                            </Link>
                          ) : (
                            a.headline
                          )}
                        </div>
                        {(a.title || a.reason) && (
                          <div className="truncate text-[12.5px] text-ink-3">{[a.title, a.reason].filter(Boolean).join(" · ")}</div>
                        )}
                        <div className="text-[12px] text-ink-4">{a.day}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
