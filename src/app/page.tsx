import Link from "next/link";

import {
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  FilesIcon,
  GavelIcon,
  GlobeIcon,
  PlusIcon,
  ToolsIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { DataList } from "@/components/data-list";
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

export default async function Dashboard() {
  const [data, shell] = await Promise.all([loadDashboard(), loadShell()]);

  if (!data) {
    return (
      <div className="empty">
        <div className="empty__t">Nothing configured yet</div>
        <p className="empty__d">
          Run <code className="mono">npm run setup</code> to load the organisation.
        </p>
      </div>
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
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1 trunc">
                {firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
              </h1>
            </div>
            <p className="pagehead__sub clamp2">
              {waiting === 0
                ? "Nothing is waiting on you."
                : `${waiting} ${waiting === 1 ? "item needs" : "items need"} you today.`}
            </p>
            <div className="pagehead__meta">
              {shell.user && (
                <>
                  <span className="row">
                    <UserIcon size={14} />
                    {shell.user.jobTitle}
                  </span>
                  <span className="sep">·</span>
                </>
              )}
              <span className="row">
                <CalendarIcon size={14} />
                {formatDate(now)}
              </span>
              {overdue > 0 && (
                <>
                  <span className="sep">·</span>
                  <span className="row">
                    <span className="badge badge--err">{overdue} aged over 14 days</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="pagehead__actions">
            <button type="button" className="btn" disabled>
              <DownloadIcon size={15} />
              Export
            </button>
            <button type="button" className="btn btn--primary" disabled>
              <PlusIcon size={15} />
              New request
            </button>
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Awaiting a decision</span>
            <span className="stat__ico stat__ico--warn">
              <ClockIcon size={15} />
            </span>
          </div>
          <div className="stat__value">{waiting}</div>
          <div className="stat__foot">
            <span className="stat__hint">
              {waiting > 0 ? `oldest ${data.queue[0].waitingDays} days` : "queue is clear"}
            </span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Sourcing pipeline</span>
            <span className="stat__ico stat__ico--brand">
              <GlobeIcon size={15} />
            </span>
          </div>
          <div className="stat__value">—</div>
          <div className="stat__foot">
            <span className="stat__hint">sourcing is not built yet</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Value approved</span>
            <span className="stat__ico stat__ico--info">
              <GavelIcon size={15} />
            </span>
          </div>
          <div className="stat__value stat__value--sm">{formatRM(data.committedValue)}</div>
          <div className="stat__foot">
            <span className="stat__hint">across {data.decidedCount} decided matters</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Votes outstanding</span>
            <span className="stat__ico stat__ico--ok">
              <UsersIcon size={15} />
            </span>
          </div>
          <div className="stat__value">{data.votesOutstanding}</div>
          <div className="stat__foot">
            <span className="stat__hint">members yet to record a position</span>
          </div>
        </div>
      </div>

      <div className="record">
        <div className="stack stack--lg">
          <div className="card">
            <div className="card__head">
              <ClockIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">My approvals &amp; tasks</div>
                <div className="card__sub trunc">
                  Everything routed to a committee, oldest first.
                </div>
              </div>
              <div className="row">
                <Link href="/configuration/committees" className="btn btn--ghost btn--sm">
                  View all
                </Link>
              </div>
            </div>
            <div className="card__body card__body--flush">
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
                  { key: "item", label: "Item", width: "40%", sortable: true },
                  { key: "type", label: "Type", width: "15%", sortable: true },
                  { key: "value", label: "Value", width: "14%", numeric: true, sortable: true },
                  { key: "waiting", label: "Waiting", width: "11%", numeric: true, sortable: true },
                  { key: "with", label: "With", width: "20%" },
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
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <ToolsIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">Project health</div>
                <div className="card__sub trunc">Live contracts that most want attention</div>
              </div>
            </div>
            <div className="card__body">
              <div className="empty empty--sm">
                <div className="empty__t">Projects is not built yet</div>
                <p className="empty__d">
                  Progress, certified value and time remaining will report here once contract
                  administration lands.
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <FilesIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">Documents awaiting my review</div>
                <div className="card__sub trunc">Submitted by contractors, routed to you</div>
              </div>
            </div>
            <div className="card__body">
              <div className="empty empty--sm">
                <div className="empty__t">Documents is not built yet</div>
                <p className="empty__d">
                  Submissions routed to you will land here for review against a service level.
                </p>
              </div>
            </div>
          </div>
        </div>

        <aside className="rrail">
          <div className="card">
            <div className="card__head">
              <GlobeIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">Sourcing pipeline</div>
                <div className="card__sub trunc">Live events by stage</div>
              </div>
            </div>
            <div className="card__body card__body--tight">
              {["Planning", "Invited", "Open for bids", "Evaluating", "Awaiting approval", "Awarded"].map(
                (stage) => (
                  <div className="pipestage" key={stage}>
                    <span className="pipestage__dot" style={{ background: "var(--n-200)" }} />
                    <span className="pipestage__n trunc">{stage}</span>
                    <span className="pipestage__c">—</span>
                    <span className="pipestage__v">—</span>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <CalendarIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">Upcoming sittings</div>
                <div className="card__sub trunc">Committees due to convene</div>
              </div>
            </div>
            <div className="card__body card__body--tight">
              {data.upcoming.length === 0 ? (
                <p className="sm dim" style={{ padding: "8px 0" }}>
                  Nothing scheduled.
                </p>
              ) : (
                data.upcoming.map((m) => (
                  <div className="hoverrow" key={m.id}>
                    <span
                      className={`tl__dot ${m.daysAway <= 2 ? "tl__dot--warn" : "tl__dot--brand"}`}
                    />
                    <div className="grow col">
                      <span className="sm strong trunc">{m.committeeName}</span>
                      <span className="xs dim trunc">{m.reference}</span>
                    </div>
                    <div className="col right">
                      <div className="xs strong num">
                        {m.daysAway <= 0 ? "today" : `in ${m.daysAway} days`}
                      </div>
                      <div className="xs faint num">{formatDate(m.meetingDate)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <UsersIcon size={17} />
              <div className="card__titles">
                <div className="h3 trunc">Recent activity</div>
              </div>
            </div>
            <div className="card__body card__body--tight">
              {data.activity.length === 0 ? (
                <p className="sm dim" style={{ padding: "8px 0" }}>
                  No activity yet.
                </p>
              ) : (
                <div className="feed">
                  {data.activity.map((a, i) => (
                    <div className="feed__i" key={i}>
                      <div className="feed__b">
                        <div className="feed__t">
                          <b>{a.who}</b> {a.what}
                        </div>
                        <div className="feed__m xs dim trunc">{a.detail}</div>
                        <div className="feed__ts xs faint">{formatDate(a.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
