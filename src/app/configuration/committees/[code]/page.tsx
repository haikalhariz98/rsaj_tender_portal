import { notFound } from "next/navigation";

import { AlertTriangle, InfoIcon } from "@/components/icons";
import { DecisionPanel } from "@/components/committee/decision-panel";
import { getCommittee, rulesRoutingTo } from "@/lib/committee/repo";
import { assessQuorum } from "@/lib/committee/quorum";
import { matterLabel } from "@/lib/labels";
import { avatarTone, formatBand, formatDate, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

const POSITION_LABEL: Record<string, string> = {
  CHAIRMAN: "Chairman",
  DEPUTY_CHAIRMAN: "Deputy Chairman",
  MEMBER: "Member",
  SECRETARY: "Secretary",
};

const ACTION_LABEL: Record<string, string> = {
  APPROVES: "Approves",
  RECOMMENDS: "Recommends",
  CONSENTS: "Consents",
  DECIDES: "Decides",
};

export default async function CommitteePage({
  params,
}: PageProps<"/configuration/committees/[code]">) {
  const { code } = await params;
  const committee = await getCommittee(code);
  if (!committee) notFound();

  const rules = await rulesRoutingTo(committee.code);
  const seats = committee.members.filter((m) => m.effectiveTo == null);

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1">{committee.nameEn}</h1>
              <span className="badge badge--outline mono">{committee.code}</span>
              {committee.isExternal && <span className="chip chip--warn">External body</span>}
            </div>
            {committee.nameMs && <p className="pagehead__sub">{committee.nameMs}</p>}
            <div className="pagehead__meta">
              <span>{ACTION_LABEL[committee.action] ?? committee.action}</span>
              <span className="sep">·</span>
              <span>{formatBand(committee.valueScopeMin, committee.valueScopeMax)}</span>
              <span className="sep">·</span>
              <span>
                {seats.length > 0 ? `${seats.length} seats` : "No members"}
                {committee.quorum != null ? `, quorum ${committee.quorum}` : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="stack stack--lg">
        <section className="section">
          <div className="callout callout--info">
            <span className="callout__ico">
              <InfoIcon size={17} />
            </span>
            <div>
              <div className="strong" style={{ marginBottom: 2 }}>
                Mandate
              </div>
              {committee.mandate}
            </div>
          </div>
        </section>

        <div className="grid g2">
          <section className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Membership</h2>
                <div className="card__sub">
                  {seats.length === 0
                    ? "No seats configured"
                    : `${seats.length} seats · ${seats.filter((s) => s.person).length} filled`}
                </div>
              </div>
              <ProvenanceChip value={committee.compositionProvenance} />
            </div>
            <div className="card__body">
              {seats.length === 0 ? (
                <div className="empty empty--sm">
                  <div className="empty__t">No membership set</div>
                  <p className="empty__d">
                    Nobody has been appointed to this committee yet. Add its members before it
                    can record a decision.
                  </p>
                </div>
              ) : (
                <div className="stack stack--sm">
                  {seats.map((seat) => (
                    <div key={seat.id} className="row" style={{ gap: 11 }}>
                      {seat.person ? (
                        <span className={`avatar avatar--sm ${avatarTone(seat.person.id)}`}>
                          {initials(seat.person.name)}
                        </span>
                      ) : (
                        <span className="avatar avatar--sm avatar--muted">—</span>
                      )}
                      <div className="col grow">
                        <span className="sm strong trunc">
                          {seat.person?.name ?? seat.seatLabel ?? "Unnamed seat"}
                        </span>
                        <span className="xs dim trunc">
                          {POSITION_LABEL[seat.position] ?? seat.position}
                          {seat.person && seat.seatLabel ? ` · ${seat.seatLabel}` : ""}
                          {!seat.person && " · vacant"}
                        </span>
                      </div>
                      {seat.provenance === "OBSERVED" && (
                        <span className="badge badge--info">from practice</span>
                      )}
                      {seat.provenance === "STATED" && (
                        <span className="badge badge--ok">by policy</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card__head">
              <div className="card__titles">
                <h2 className="h3">Quorum</h2>
                <div className="card__sub">Required for a sitting to decide.</div>
              </div>
              <ProvenanceChip value={committee.quorumProvenance} />
            </div>
            <div className="card__body">
              <QuorumCard quorum={committee.quorum} seats={seats.length} />
              {committee.notes && (
                <p className="sm dim" style={{ marginTop: 16, lineHeight: "19px" }}>
                  {committee.notes}
                </p>
              )}
            </div>
          </section>
        </div>

        <section className="section">
          <div className="section__head">
            <h2 className="h2">Why this body sits</h2>
            <div className="section__actions">
              <span className="badge badge--outline">{rules.length} authority rows</span>
            </div>
          </div>
          {rules.length === 0 ? (
            <div className="card">
              <div className="card__body">
                <div className="empty empty--sm">
                  <div className="empty__t">Nothing routes here automatically</div>
                  <p className="empty__d">
                    This committee is established by procedure rather than by an authority
                    limit, so no value band sends a matter to it on its own.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="dl">
              <div className="tablewrap">
                <table className="table table--compact">
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "58%" }} />
                    <col style={{ width: "22%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Matter</th>
                      <th>Applies to</th>
                      <th>Acts as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Keyed by position so the internal rule key stays server-side. */}
                    {rules.map((r, i) => (
                      <tr key={i}>
                        <td className="sm">{matterLabel(r.domain)}</td>
                        <td className="sm">{r.labelEn}</td>
                        <td>
                          <span
                            className={`chain__act chain__act--${
                              r.committeeAct ?? (r.approverCode === committee.code ? "A" : "R")
                            }`}
                          >
                            {r.committeeAct ?? (r.approverCode === committee.code ? "A" : "R")}
                          </span>
                          {r.nonDelegable && (
                            <span className="chain__nd" style={{ marginLeft: 6 }}>
                              ND
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section__head">
            <h2 className="h2">Sittings</h2>
            <div className="section__actions">
              <span className="badge badge--outline">{committee.meetings.length}</span>
            </div>
          </div>

          {committee.meetings.length === 0 ? (
            <div className="card">
              <div className="card__body">
                <div className="empty empty--sm">
                  <div className="empty__t">No sittings recorded</div>
                  <p className="empty__d">
                    Meetings, attendance and per-member votes appear here once this body convenes.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="stack">
              {committee.meetings.map((meeting) => (
                <div key={meeting.id} className="card">
                  <div className="card__head">
                    <div className="card__titles">
                      <h3 className="h3 mono">{meeting.reference}</h3>
                      <div className="card__sub">
                        {formatDate(meeting.meetingDate)} ·{" "}
                        {meeting.attendance.filter((a) => a.attended).length} present
                      </div>
                    </div>
                    <span className="badge badge--outline">{meeting.status.replace(/_/g, " ")}</span>
                  </div>
                  {meeting.agenda && (
                    <div className="card__body card__body--tight">
                      <p className="sm dim">{meeting.agenda}</p>
                    </div>
                  )}
                  {meeting.decisions.map((decision) => (
                    <DecisionPanel
                      key={decision.id}
                      decision={{
                        id: decision.id,
                        subject: decision.subject,
                        matterRef: decision.matterRef,
                        amount: decision.amount,
                        act: decision.act,
                        outcome: decision.outcome,
                      }}
                      quorum={committee.quorum}
                      present={meeting.attendance.filter((a) => a.attended).length}
                      members={seats
                        .filter((s) => s.person)
                        .map((s) => ({
                          personId: s.person!.id,
                          name: s.person!.name,
                          position: POSITION_LABEL[s.position] ?? s.position,
                        }))}
                      votes={decision.votes.map((v) => ({
                        personId: v.personId,
                        choice: v.choice,
                        comment: v.comment,
                      }))}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/// How firm a configured fact is. Policy and practice are not the same authority, so
/// they must not look the same on screen.
function ProvenanceChip({ value }: { value: string | null }) {
  if (value === "STATED") return <span className="chip chip--ok">Set by policy</span>;
  if (value === "OBSERVED") return <span className="chip chip--info">From current practice</span>;
  if (value === "ASSUMED") return <span className="chip chip--warn">Assumed</span>;
  return <span className="chip chip--warn">Not set</span>;
}

function QuorumCard({ quorum, seats }: { quorum: number | null; seats: number }) {
  const assessment = assessQuorum({ quorum, present: seats });

  if (quorum == null) {
    return (
      <div className="callout callout--warn">
        <span className="callout__ico">
          <AlertTriangle size={17} />
        </span>
        <div>
          <div className="strong" style={{ marginBottom: 2 }}>
            No quorum set
          </div>
          Sittings of this committee cannot be certified as quorate until one is set. A quorum
          of zero is not assumed in its place.
        </div>
      </div>
    );
  }

  return (
    <div className="stack stack--sm">
      <div className="row" style={{ gap: 12 }}>
        <span className="stat__value stat__value--sm">{quorum}</span>
        <div className="col">
          <span className="sm strong">members required</span>
          <span className="xs dim">of {seats} configured seats</span>
        </div>
      </div>
      <div className="quorum">
        <span className="quorum__bar">
          {Array.from({ length: Math.max(seats, quorum) }, (_, i) => (
            <span
              key={i}
              className={`quorum__pip ${i < quorum ? "quorum__pip--need" : ""}`}
              aria-hidden="true"
            />
          ))}
        </span>
        <span className="xs dim">{assessment.required} needed to sit</span>
      </div>
    </div>
  );
}
