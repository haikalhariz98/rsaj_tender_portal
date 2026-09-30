import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";

import { CalendarIcon, RouteIcon, ScaleIcon, UsersIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { getCommittee, rulesRoutingTo } from "@/lib/committee/repo";
import { AddMember, EditMember, VacateSeat } from "../editors";
import { assessQuorum, quorumFaults } from "@/lib/committee/quorum";
import { seatsInForce } from "@/lib/committee/seats";
import { alternatesOn, votingSeatsOn } from "@/lib/committee/sitting";
import {
  COMMITTEE_ACTION_LABEL,
  matterCount,
  MEETING_STATUS_LABEL,
  MEETING_STATUS_TONE,
  POSITION_LABEL,
  VOTING_RULE_LABEL,
} from "@/lib/committee/labels";
import { KeyValues } from "@/components/ui/stat";
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

export const dynamic = "force-dynamic";

const TONE = { info: "info", brand: "brand", ok: "ok", neutral: undefined } as const;

const ACTION_LABEL = COMMITTEE_ACTION_LABEL;

export default async function CommitteePage({
  params,
}: PageProps<"/configuration/committees/[code]">) {
  const { code } = await params;
  const committee = await getCommittee(code);
  if (!committee) notFound();

  const rules = await rulesRoutingTo(committee.code);
  const today = new Date();
  const seats = seatsInForce(committee.members, today);
  const roster = await loadRoster(ORGANISATION_CODE);
  const people = roster.people.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }));
  const offices = roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }));

  // Ex-officio seats resolve to whoever holds the office today (D1): the seat is the
  // office's, and its holder votes. The Secretary and alternates never count.
  const voting = votingSeatsOn(committee.members, roster, today);
  const resolved = new Map([...voting, ...alternatesOn(committee.members, roster, today)].map((v) => [v.seatId, v]));
  const faults = quorumFaults({ quorum: committee.quorum, votingSeats: voting.length });
  const seatOptions = seats
    .filter((x) => !x.isAlternate && x.position !== "CHAIRMAN" && x.position !== "SECRETARY")
    .map((x) => ({
      id: x.id,
      label: `${POSITION_LABEL[x.position]} · ${resolved.get(x.id)?.name ?? resolved.get(x.id)?.officeLabel ?? x.seatLabel ?? "vacant"}`,
    }));
  const secretariat = committee.secretariatRoleCode
    ? (roster.offices.find((o) => o.code === committee.secretariatRoleCode)?.nameEn ?? "An office no longer configured")
    : null;

  const sittingRows: Row[] = committee.meetings.map((m) => ({
    id: m.id,
    search: `${m.reference} ${MEETING_STATUS_LABEL[m.status]}`,
    sortKeys: { date: m.meetingDate.getTime() },
    cells: {
      reference: { kind: "link", text: m.reference, href: `/committees/${m.id}` },
      date: { kind: "text", text: formatDate(m.meetingDate) },
      status: { kind: "badge", text: MEETING_STATUS_LABEL[m.status], tone: TONE[MEETING_STATUS_TONE[m.status]] },
      matters: {
        kind: "text",
        text: matterCount(m.decisions.length, m.decisions.filter((d) => d.outcome === "PENDING").length),
        dim: m.decisions.length === 0,
      },
    },
  }));

  return (
    <>
      <RecordCrumb label={committee.nameEn} />
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
          ...(committee.retiredOn ? [`Retired ${formatDate(committee.retiredOn)}`] : []),
        ]}
      />

      <div className="flex flex-col gap-6">
        <Callout tone="info" title="Mandate">
          {committee.mandate}
          {committee.aliases.length > 0 && (
            <span className="mt-1 block text-[12.5px]">Also known as {committee.aliases.join(", ")}.</span>
          )}
        </Callout>

        {faults.includes("QUORUM_EXCEEDS_VOTING_SEATS") && (
          <Callout tone="err" title="This quorum can never be met">
            The quorum is {committee.quorum}, but the committee has {voting.length} voting{" "}
            {voting.length === 1 ? "seat" : "seats"} today. The Secretary and alternates do not count. Every
            sitting would be inquorate however many attend. Either the quorum or the membership is wrong.
          </Callout>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<UsersIcon size={17} />}
              title="Membership"
              subtitle={
                seats.length === 0
                  ? "No seats configured"
                  : (() => {
                      const vacant = seats.filter((s) => !s.person && !resolved.get(s.id)?.personId).length;
                      return `${seats.length} seats · ${voting.length} voting${vacant ? ` · ${vacant} vacant` : ""}`;
                    })()
              }
              actions={
                <>
                  <ProvenanceBadge value={committee.compositionProvenance} />
                  <AddMember committeeId={committee.id} people={people} offices={offices} seats={seatOptions} />
                </>
              }
            />
            {seats.length > 0 && (
              <p className="border-b border-line/70 px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
                The Secretary attends but never votes or counts toward quorum. This is a product assumption
                awaiting the committee&apos;s terms of reference.
              </p>
            )}
            {seats.length === 0 ? (
              <EmptyState size="sm" title="No membership set">
                Nobody has been appointed to this committee yet. Add its members before it can
                record a decision.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line/70">
                {seats.map((seat) => {
                  const r = resolved.get(seat.id);
                  const holder = seat.person?.name ?? r?.name ?? null;
                  const office = seat.seatRoleCode ? (r?.officeLabel ?? seat.seatLabel) : seat.seatLabel;
                  const who = holder ?? office ?? "Unnamed seat";
                  const covers = seat.alternateForId ? resolved.get(seat.alternateForId) : undefined;
                  const role = [
                    seat.isAlternate
                      ? `Alternate${covers ? ` for ${covers.name ?? covers.officeLabel ?? "a seat"}` : ` · any ${POSITION_LABEL[seat.position].toLowerCase()} seat`}`
                      : POSITION_LABEL[seat.position],
                    seat.seatRoleCode && holder ? `ex officio · ${office}` : null,
                    seat.position === "SECRETARY" ? "does not vote" : null,
                    r?.contested ? "two holders today, none chosen" : !holder ? "vacant" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    // One layout for every seat: who and where it came from on the first
                    // line, the seat's actions on their own line beneath, right-aligned.
                    <li key={seat.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:px-6">
                      {holder ? <Avatar name={holder} /> : <Avatar muted>—</Avatar>}
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold break-words text-ink">
                          {who}
                        </div>
                        <div className="text-[12px] text-ink-3">
                          {role}
                        </div>
                      </div>
                      <ProvenanceBadge value={seat.provenance} />
                      <div className="col-span-3 flex flex-wrap items-center justify-end gap-1">
                        <EditMember member={seat} label={who} people={people} offices={offices} seats={seatOptions} />
                        {seat.seatRoleCode ? (
                          <VacateSeat id={seat.id} label={office ?? who} exOfficio />
                        ) : (
                          seat.person && <VacateSeat id={seat.id} label={seat.person.name} />
                        )}
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
              <QuorumCard quorum={committee.quorum} seats={voting.length} />
              <KeyValues
                className="mt-5"
                items={[
                  {
                    label: "Voting rule",
                    value: committee.votingRule ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {VOTING_RULE_LABEL[committee.votingRule]}
                        <ProvenanceBadge value={committee.votingRuleProvenance} />
                      </span>
                    ) : (
                      <GapValue text="No matter can be decided, and no majority is assumed." />
                    ),
                  },
                  {
                    label: "Alternate for a recused member",
                    value:
                      committee.alternateMayVoteForRecused === false ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          May not vote: the seat does not vote on that matter
                          <ProvenanceBadge value={committee.alternateMayVoteForRecusedProvenance} />
                        </span>
                      ) : (
                        <GapValue text="A matter where a member with an alternate recuses cannot be decided." />
                      ),
                  },
                  {
                    label: "Secretariat",
                    value: secretariat ?? <GapValue text="Nobody may table a matter." />,
                  },
                ]}
              />
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
                <col style={{ width: "18%" }} />
                <col style={{ width: "44%" }} />
                <col style={{ width: "38%" }} />
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
            title={
              <span className="inline-flex items-center gap-2">
                Sittings
                {committee.meetings.length > 0 && <Badge outline>{committee.meetings.length}</Badge>}
              </span>
            }
            subtitle="Held and scheduled. Open one to take its register and record its decisions."

            divided={false}
          />
          <DataList
            flat
            selectable={false}
            searchable={false}
            toolbar={false}
            exportName={`${committee.code}-sittings`}
            emptyTitle="No sittings recorded"
            emptyBody="Schedule one under Committee sittings."
            rowAction={{ label: "Open", hrefTemplate: "/committees/{id}" }}
            rowOpens
            columns={[
              { key: "reference", label: "Reference", width: "30%", sortable: true },
              { key: "date", label: "Date", width: "20%", sortable: true },
              { key: "status", label: "Status", width: "20%" },
              { key: "matters", label: "Matters", width: "30%" },
            ]}
            rows={sittingRows}
          />
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
          <span className="text-[12px] text-ink-3">of {seats} voting seats</span>
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

/// A setting nobody has made: a short badge, and the consequence as readable text
/// rather than squeezed into the badge.
function GapValue({ text }: { text: string }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{text}</span>
    </span>
  );
}
