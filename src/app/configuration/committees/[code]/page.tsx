import { notFound } from "next/navigation";

import { CalendarIcon, RouteIcon, ScaleIcon, UsersIcon } from "@/components/icons";
import { DecisionPanel } from "@/components/committee/decision-panel";
import { getCommittee, rulesRoutingTo } from "@/lib/committee/repo";
import { AddMember, EditMember, VacateSeat } from "../editors";
import { assessQuorum } from "@/lib/committee/quorum";
import { seatsInForce } from "@/lib/committee/seats";
import { committeeActOn } from "@/lib/authority/resolve";
import { matterLabel } from "@/lib/labels";
import { ActWithLabel } from "@/components/ui/act";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadRoster } from "@/lib/people/load";
import { formatBand, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";

const MEETING_STATUS: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  MINUTED: "Minuted",
  CANCELLED: "Cancelled",
};

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
  const seats = seatsInForce(committee.members, new Date());
  const roster = await loadRoster(ORGANISATION_CODE);
  const people = roster.people.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }));
  const offices = roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }));

  return (
    <>
      <PageHeader
        eyebrow="Committee"
        title={committee.nameEn}
        actions={<HistoryButton entity="Committee" entityId={committee.id} label={committee.nameEn} />}
        badge={committee.isExternal ? <Badge tone="warn">External body</Badge> : undefined}
        subtitle={committee.nameMs ?? undefined}
        meta={[
          ACTION_LABEL[committee.action] ?? "Act not set",
          formatBand(committee.valueScopeMin, committee.valueScopeMax),
          `${seats.length > 0 ? `${seats.length} seats` : "No members"}${
            committee.quorum != null ? `, quorum ${committee.quorum}` : ""
          }`,
        ]}
      />

      <div className="flex flex-col gap-6">
        <Callout tone="info" title="Mandate">
          {committee.mandate}
        </Callout>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<UsersIcon size={17} />}
              title="Membership"
              subtitle={
                seats.length === 0
                  ? "No seats configured"
                  : `${seats.length} seats · ${seats.filter((s) => s.person).length} filled`
              }
              actions={
                <>
                  <ProvenanceBadge value={committee.compositionProvenance} />
                  <AddMember committeeId={committee.id} people={people} offices={offices} />
                </>
              }
            />
            {seats.length === 0 ? (
              <EmptyState size="sm" title="No membership set">
                Nobody has been appointed to this committee yet. Add its members before it can
                record a decision.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line/70">
                {seats.map((seat) => {
                  const who = seat.person?.name ?? seat.seatLabel ?? "Unnamed seat";
                  const role = `${POSITION_LABEL[seat.position] ?? seat.position}${
                    seat.person && seat.seatLabel ? ` · ${seat.seatLabel}` : ""
                  }${!seat.person ? " · vacant" : ""}`;
                  return (
                    <li key={seat.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                      {seat.person ? (
                        <Avatar name={seat.person.name} />
                      ) : (
                        <Avatar muted>—</Avatar>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-ink" title={who}>
                          {who}
                        </div>
                        <div className="truncate text-[12px] text-ink-3" title={role}>
                          {role}
                        </div>
                      </div>
                      <ProvenanceBadge value={seat.provenance} />
                      <div className="flex shrink-0 items-center gap-1">
                        <EditMember member={seat} label={who} people={people} offices={offices} />
                        {seat.person && <VacateSeat id={seat.id} label={seat.person.name} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={<ScaleIcon size={17} />}
              title="Quorum"
              subtitle="Required for a sitting to decide."
              actions={<ProvenanceBadge value={committee.quorumProvenance} />}
            />
            <CardBody>
              <QuorumCard quorum={committee.quorum} seats={seats.length} />
              {committee.notes && (
                <p className="mt-4 text-[13px] leading-relaxed text-ink-3">{committee.notes}</p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            icon={<RouteIcon size={17} />}
            title="Why this body sits"
            actions={
              <Badge outline>
                {rules.length} {rules.length === 1 ? "authority row" : "authority rows"}
              </Badge>
            }
            divided={rules.length === 0}
          />
          {rules.length === 0 ? (
            <EmptyState size="sm" title="Nothing routes here automatically">
              This committee is established by procedure rather than by an authority limit, so
              no value band sends a matter to it on its own.
            </EmptyState>
          ) : (
            <Table>
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "50%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <THead>
                <Th>Matter</Th>
                <Th>Applies to</Th>
                <Th>Acts as</Th>
              </THead>
              <tbody>
                {/* Keyed by position so the internal rule key stays server-side. */}
                {rules.map((r, i) => {
                  const act = committeeActOn(r, committee.code);
                  return (
                    <Tr key={i}>
                      <Td className="text-ink-2">{matterLabel(r.domain)}</Td>
                      <Td className="text-ink">{r.labelEn}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {act ? (
                            <ActWithLabel act={act} />
                          ) : (
                            <span className="text-[12px] text-ink-3">Not set</span>
                          )}
                          {r.nonDelegable && <Badge tone="warn">Cannot be delegated</Badge>}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            icon={<CalendarIcon size={17} />}
            title="Sittings"
            actions={<Badge outline>{committee.meetings.length}</Badge>}
            divided={committee.meetings.length === 0}
          />
          {committee.meetings.length === 0 ? (
            <EmptyState size="sm" title="No sittings recorded">
              Meetings, attendance and per-member votes appear here once this body convenes.
            </EmptyState>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {committee.meetings.map((meeting) => (
                <section key={meeting.id}>
                  <CardHeader
                    divided={false}
                    className="bg-sunken/60"
                    title={<span className="font-mono">{meeting.reference}</span>}
                    subtitle={`${formatDate(meeting.meetingDate)} · ${
                      meeting.attendance.filter((a) => a.attended).length
                    } present`}
                    actions={
                      <Badge outline>{MEETING_STATUS[meeting.status] ?? "Unknown"}</Badge>
                    }
                  />
                  {meeting.agenda && (
                    <CardBody pad="tight" className="border-t border-line/70">
                      <p className="text-[13px] text-ink-3">{meeting.agenda}</p>
                    </CardBody>
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
                      members={seatsInForce(committee.members, meeting.meetingDate)
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
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function QuorumCard({ quorum, seats }: { quorum: number | null; seats: number }) {
  const assessment = assessQuorum({ quorum, present: seats });

  if (quorum == null) {
    return (
      <Callout tone="warn" title="No quorum set">
        Sittings of this committee cannot be certified as quorate until one is set. A quorum of
        zero is not assumed in its place.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">
          {quorum}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[13.5px] font-semibold text-ink">members required</span>
          <span className="text-[12px] text-ink-3">of {seats} configured seats</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex flex-wrap gap-1">
          {Array.from({ length: Math.max(seats, quorum) }, (_, i) => (
            <span
              key={i}
              className={cx("size-2.5 rounded-full", i < quorum ? "bg-amber-400" : "bg-ink/10")}
              aria-hidden="true"
            />
          ))}
        </span>
        <span className="text-[12px] text-ink-3">{assessment.required} needed to sit</span>
      </div>
    </div>
  );
}
