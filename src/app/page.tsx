import Link from "next/link";

import { AlertTriangle, ClockIcon, GavelIcon, UsersIcon } from "@/components/icons";
import { loadDashboard } from "@/lib/dashboard";
import { formatDate, formatRM } from "@/lib/format";
import { matterLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const data = await loadDashboard();

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

  const waiting = data.queue.length;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">Dashboard</h1>
            </div>
            <p className="pagehead__sub">
              {waiting === 0
                ? "Nothing is waiting on you right now. Here is where everything stands."
                : `${waiting} ${waiting === 1 ? "item needs" : "items need"} a decision.`}
            </p>
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
            <span className="stat__label">Votes outstanding</span>
          </div>
          <div className="stat__value">{data.votesOutstanding}</div>
          <div className="stat__foot">
            <span className="stat__hint">members yet to record a position</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__top">
            <span className="stat__label">Value approved</span>
            <span className="stat__ico stat__ico--ok">
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
            <span className="stat__label">Committees</span>
            <span className="stat__ico stat__ico--brand">
              <UsersIcon size={15} />
            </span>
          </div>
          <div className="stat__value">{data.committees}</div>
          <div className="stat__foot">
            <span className="stat__hint">{data.withoutQuorum} without a quorum set</span>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,340px)", gap: 24 }}>
        <div className="stack stack--lg">
          <section className="dl">
            <div className="dl__bar">
              <div className="card__titles">
                <h2 className="h3">Approvals and tasks</h2>
                <div className="card__sub">Everything routed to a committee, oldest first.</div>
              </div>
            </div>
            {data.queue.length === 0 ? (
              <div className="empty empty--sm">
                <div className="empty__t">The queue is clear</div>
                <p className="empty__d">
                  Matters routed to a committee appear here the moment they are raised.
                </p>
              </div>
            ) : (
              <div className="tablewrap">
                <table className="table">
                  <colgroup>
                    <col style={{ width: "44%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th className="num">Value</th>
                      <th>Waiting</th>
                      <th>With</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queue.map((item) => (
                      <tr key={item.decisionId}>
                        <td>
                          <div className="cellstack">
                            <span className="cellstack__t">{item.subject}</span>
                            <span className="cellstack__s">
                              {item.matterRef ?? item.meetingReference}
                            </span>
                          </div>
                        </td>
                        <td className="sm dim">{matterLabel(item.domain)}</td>
                        <td className="num sm">{formatRM(item.amount)}</td>
                        <td>
                          <span className={`badge ${item.waitingDays > 14 ? "badge--err" : ""}`}>
                            {item.waitingDays}d
                          </span>
                        </td>
                        <td>
                          <Link
                            href={`/configuration/committees/${item.committeeCode}`}
                            className="sm"
                          >
                            {item.committeeCode}
                          </Link>
                          <span className="xs dim">
                            {" "}
                            {item.votesCast}/{item.entitled}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Sourcing pipeline</h2>
                <div className="card__sub">Live events by stage</div>
              </div>
            </div>
            <div className="card__body">
              <div className="empty empty--sm">
                <div className="empty__t">Sourcing is not built yet</div>
                <p className="empty__d">
                  Planning, invitation, bids, opening, evaluation and award will report here once
                  the sourcing module lands.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="stack stack--lg">
          <section className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Upcoming sittings</h2>
              </div>
            </div>
            <div className="card__body">
              {data.upcoming.length === 0 ? (
                <p className="sm dim">Nothing scheduled.</p>
              ) : (
                <div className="stack stack--sm">
                  {data.upcoming.map((m) => (
                    <div key={m.id} className="row" style={{ gap: 10 }}>
                      <span className="dot dot--brand" />
                      <div className="col grow">
                        <span className="sm strong trunc">{m.committeeName}</span>
                        <span className="xs dim trunc">
                          {m.reference} · {formatDate(m.meetingDate)}
                        </span>
                      </div>
                      <span className="badge badge--outline">
                        {m.daysAway <= 0 ? "today" : `${m.daysAway}d`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {data.withoutQuorum > 0 && (
            <div className="callout callout--warn">
              <span className="callout__ico">
                <AlertTriangle size={17} />
              </span>
              <div>
                <div className="strong" style={{ marginBottom: 2 }}>
                  {data.withoutQuorum} committees have no quorum
                </div>
                Their sittings cannot be certified as quorate.{" "}
                <Link href="/configuration/committees">Review committees</Link>
              </div>
            </div>
          )}

          <section className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Recent activity</h2>
              </div>
            </div>
            <div className="card__body">
              {data.activity.length === 0 ? (
                <p className="sm dim">No activity yet.</p>
              ) : (
                <div className="feed">
                  {data.activity.map((a, i) => (
                    <div key={i} className="feed__i">
                      <div className="feed__t">
                        <span className="strong">{a.who}</span> {a.what}
                      </div>
                      <div className="feed__b sm dim trunc">{a.detail}</div>
                      <div className="feed__ts xs faint">{formatDate(a.at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
