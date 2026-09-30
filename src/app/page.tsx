import {
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
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
import { Avatar } from "@/components/ui/avatar";
import { Badge, Dot } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { loadDashboard } from "@/lib/dashboard";
import { formatDate, formatRM } from "@/lib/format";
import { matterLabel } from "@/lib/labels";
import { loadShell } from "@/lib/shell";

export const dynamic = "force-dynamic";

/// The prototype greets by time of day; Malaysia is UTC+8 wherever the server sits.
function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-MY", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kuala_Lumpur",
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
  {
    icon: <GlobeIcon size={17} />,
    title: "Sourcing pipeline",
    body: "Active sourcing events by stage: planning, invited, open for bids, evaluating, awaiting approval and awarded.",
  },
];

export default async function Dashboard() {
  const [data, shell] = await Promise.all([loadDashboard(), loadShell()]);

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

  const now = new Date();
  // Greet by name only when there is a name. Splitting the old placeholder produced
  // "Good afternoon, Signed".
  const firstName = shell.user?.name.split(/\s+/)[0] ?? null;
  const waiting = data.queue.length;
  const overdue = data.queue.filter((q) => q.waitingDays > 14).length;

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        subtitle={
          waiting === 0
            ? "No items are awaiting a decision."
            : `${waiting} ${waiting === 1 ? "item is" : "items are"} awaiting a decision.`
        }
        meta={[
          shell.user && (
            <>
              <UserIcon size={14} />
              {shell.user.jobTitle}
            </>
          ),
          <>
            <CalendarIcon size={14} />
            {formatDate(now)}
          </>,
          overdue > 0 && (
            <Badge tone="err" dot>
              {overdue} aged over 14 days
            </Badge>
          ),
        ]}
        actions={
          <>
            <Button icon={<DownloadIcon size={16} />} disabled title="Export is not built yet">
              Export
            </Button>
            <Button
              variant="primary"
              icon={<PlusIcon size={16} />}
              disabled
              title="Raising a request is not built yet"
            >
              New request
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Awaiting a decision"
          value={waiting}
          tone="warn"
          icon={<ClockIcon size={17} />}
          hint={waiting > 0 ? `oldest ${data.queue[0].waitingDays} days` : "queue is clear"}
        />
        <Stat
          label="Sourcing pipeline"
          value={null}
          tone="brand"
          icon={<GlobeIcon size={17} />}
          hint="sourcing is not built yet"
        />
        <Stat
          label="Value approved"
          value={formatRM(data.committedValue)}
          tone="info"
          icon={<GavelIcon size={17} />}
          hint={`across ${data.decidedCount} decided matters`}
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
              title="My approvals & tasks"
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
              exportName="approvals-and-tasks"
              searchPlaceholder="Search my queue…"
              emptyTitle="Your queue is clear"
              emptyBody="Matters routed to a committee appear here the moment they are raised."
              views={[
                { id: "aged", label: "Aged over 14 days" },
                { id: "financial", label: "Financial items" },
              ]}
              filters={[
                { key: "type", label: "Type" },
                { key: "with", label: "Committee" },
              ]}
              rowAction={{
                label: "Open the sitting",
                hrefTemplate: "/configuration/committees",
              }}
              columns={[
                { key: "item", label: "Item", sortable: true },
                { key: "type", label: "Type", width: "140px", sortable: true, hideBelow: "lg" },
                { key: "value", label: "Value", width: "132px", numeric: true, sortable: true },
                { key: "waiting", label: "Waiting", width: "104px", numeric: true, sortable: true },
                { key: "with", label: "With", width: "190px", hideBelow: "md" },
              ]}
              rows={data.queue.map((item) => ({
                id: item.decisionId,
                search: `${item.subject} ${item.matterRef ?? ""} ${item.committeeName}`,
                views: [
                  ...(item.waitingDays > 14 ? ["aged"] : []),
                  ...(item.amount != null ? ["financial"] : []),
                ],
                sortKeys: {
                  value: item.amount ?? -1,
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
                  value: { kind: "money", value: item.amount },
                  waiting: {
                    kind: "badge",
                    text: `${item.waitingDays}d`,
                    tone: item.waitingDays > 14 ? "err" : undefined,
                  },
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

          <Card tone="flat" className="border-dashed bg-surface/60">
            <CardHeader
              icon={<SparkleIcon size={17} />}
              title="On the way"
              subtitle="These will report here once their modules are built."
            />
            <CardBody className="grid gap-5 md:grid-cols-3">
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
                    <Dot tone={m.daysAway <= 2 ? "warn" : "brand"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">
                        {m.committeeName}
                      </div>
                      <div className="truncate text-[12px] text-ink-3">{m.reference}</div>
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
            <CardHeader icon={<UsersIcon size={17} />} title="Recent activity" />
            {data.activity.length === 0 ? (
              <EmptyState size="sm" title="No activity yet" />
            ) : (
              <ol className="px-6 py-4">
                {data.activity.map((a, i) => (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="absolute top-8 bottom-0 left-[13px] w-px bg-line last:hidden" />
                    <Avatar name={a.who} size="xs" className="mt-0.5 size-7" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] text-ink">
                        <b className="font-semibold">{a.who}</b> {a.what}
                      </div>
                      <div className="truncate text-[12.5px] text-ink-3">{a.detail}</div>
                      <div className="text-[12px] text-ink-4">{formatDate(a.at)}</div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
