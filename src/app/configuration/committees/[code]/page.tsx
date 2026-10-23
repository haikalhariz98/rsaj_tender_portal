import { notFound } from "next/navigation";

import { RecordCrumb } from "@/components/shell/record-crumb";

import { CalendarIcon, RouteIcon, ScaleIcon, UsersIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { getCommittee, rulesRoutingTo } from "@/lib/committee/repo";
import { AddMember, EditMember, EditOpeningPanel, EditQuorum, VacateSeat } from "../editors";
import { db } from "@/lib/db";
import { OPENING_RULE_UNSET } from "@/lib/opening/config";
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
import { loadRoster } from "@/lib/people/load";
import { formatBand, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Disclosure } from "@/components/ui/disclosure";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { RuleInfo } from "@/components/ui/rule-info";
import { SettingValue } from "@/components/setup/setting-value";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Committee" };

const TONE = { info: "info", brand: "brand", ok: "ok", neutral: undefined } as const;

const ACTION_LABEL = COMMITTEE_ACTION_LABEL;

export default async function CommitteePage({
  params,
}: PageProps<"/configuration/committees/[code]">) {
  const actor = await requireStaff();
  const { code } = await params;
  const committee = await getCommittee(actor.organisationId, code);
  if (!committee) notFound();

  const rules = await rulesRoutingTo(actor.organisationId, committee.code);
  const today = new Date();
  const seats = seatsInForce(committee.members, today);
  const roster = await loadRoster(actor.organisationCode);
  // 6.7: the units an opening panel may exclude, by name (codes never reach the screen).
  const units = await db.orgUnit.findMany({ where: { organisationId: committee.organisationId }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } });
  const excludedUnit = committee.panelExcludesUnitCode ? (units.find((u) => u.code === committee.panelExcludesUnitCode)?.nameEn ?? "A unit no longer in the structure") : null;
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
  const hasSecretary = seats.some((x) => x.position === "SECRETARY");

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
        text: matterCount(m.decisions.filter((d) => !d.withdrawnAt).length, m.decisions.filter((d) => d.outcome === "PENDING" && !d.withdrawnAt).length),
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
        meta={[
          ACTION_LABEL[committee.action] ?? "Decision not set",
          formatBand(committee.valueScopeMin, committee.valueScopeMax),
          `${seats.length > 0 ? `${seats.length} seats` : "No members"}${committee.quorum != null ? `, quorum ${committee.quorum}` : ""}`,
          ...(committee.retiredOn ? [`No longer used from ${formatDate(committee.retiredOn)}`] : []),
        ]}
      />

      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-[13.5px] text-ink-2">
          {committee.mandate}
          {committee.aliases.length > 0 && <span className="mt-1 block text-[12.5px]">Also known as {committee.aliases.join(", ")}.</span>}
        </div>

        {faults.includes("QUORUM_EXCEEDS_VOTING_SEATS") && (
          <Callout tone="err" title="Quorum can never be met">
            {`Quorum ${committee.quorum}; ${voting.length} voting ${voting.length === 1 ? "seat" : "seats"}. Secretary and alternates excluded.`}
          </Callout>
        )}
        {committee.quorum == null && (
          <Callout tone="warn" title="No quorum set">
            Sittings cannot be certified quorate.
          </Callout>
        )}

        <Card className="overflow-hidden">
          <CardHeader
            icon={<UsersIcon size={17} />}
            title="Members"
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
                {committee.compositionProvenance == null ? (
                  <SettingValue value={null} unset="No members are defined yet." />
                ) : (
                  <RuleInfo label="The rule behind the members" rule={`Who sits on ${committee.nameEn}.`} source={committee.compositionProvenance} />
                )}
                {hasSecretary && (
                  <RuleInfo label="About the Secretary seat" rule="The Secretary attends but never votes or counts toward quorum, until the terms of reference say otherwise." source="ASSUMED" />
                )}
                <AddMember committeeId={committee.id} people={people} offices={offices} seats={seatOptions} />
              </>
            }
          />
          {seats.length === 0 ? (
            <EmptyState size="sm" title="No membership set" />
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
                  // One layout for every seat: who and what it is on the first line, the seat's actions on their own line beneath, right-aligned.
                  <li key={seat.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-5 py-3 sm:px-6">
                    {holder ? <Avatar name={holder} /> : <Avatar muted>—</Avatar>}
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold break-words text-ink">{who}</div>
                      <div className="text-[12px] text-ink-3">{role}</div>
                    </div>
                    {seat.provenance && seat.provenance !== "STATED" ? (
                      <RuleInfo label={`The rule behind ${who}'s seat`} rule={`${who}'s seat on ${committee.nameEn}.`} source={seat.provenance} />
                    ) : (
                      <span />
                    )}
                    <div className="col-span-3 flex flex-wrap items-center justify-end gap-1">
                      <EditMember member={seat} label={who} people={people} offices={offices} seats={seatOptions} />
                      {seat.seatRoleCode ? <VacateSeat id={seat.id} label={office ?? who} exOfficio /> : seat.person && <VacateSeat id={seat.id} label={seat.person.name} />}
                    </div>
                  </li>
                );
              })}
            </ul>
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
            divided={false}
          />
          <DataList
            flat
            selectable={false}
            searchable={false}
            toolbar={false}
            exportName={`${committee.code}-sittings`}
            emptyTitle="No sittings recorded"
            rowAction={{ label: "Open", hrefTemplate: "/committees/{id}" }}
            rowOpens
            columns={[
              { key: "reference", label: "Reference", width: "30%", sortable: true, mobile: "primary" },
              { key: "date", label: "Date", width: "20%", sortable: true, mobile: "meta" },
              { key: "status", label: "Status", width: "20%", mobile: "meta" },
              { key: "matters", label: "Items", width: "30%", mobile: "meta" },
            ]}
            rows={sittingRows}
          />
        </Card>

        <Disclosure id="advanced" title="Advanced" summary="Quorum, voting, opening panel" defaultOpen={faults.length > 0}>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                icon={<ScaleIcon size={17} />}
                title="Quorum and voting"
                actions={<EditQuorum id={committee.id} name={committee.nameEn} quorum={committee.quorum} provenance={committee.quorumProvenance} />}
              />
              <CardBody>
                <QuorumCard quorum={committee.quorum} seats={voting.length} provenance={committee.quorumProvenance} name={committee.nameEn} />
                <KeyValues
                  className="mt-5"
                  items={[
                    {
                      label: "Voting rule",
                      value: (
                        <SettingValue
                          value={
                            committee.votingRule ? (
                              <span className="inline-flex items-center gap-1">
                                {VOTING_RULE_LABEL[committee.votingRule]}
                                <RuleInfo label="The rule behind the voting rule" rule="How votes are counted at a sitting." source={committee.votingRuleProvenance} />
                              </span>
                            ) : null
                          }
                          unset="No item can be decided, and no majority is assumed."
                        />
                      ),
                    },
                    {
                      label: "Alternate for a member who stepped aside",
                      value: (
                        <SettingValue
                          value={
                            committee.alternateMayVoteForRecused === false ? (
                              <span className="inline-flex items-center gap-1">
                                May not vote: the seat does not vote on that item
                                <RuleInfo label="The rule behind the alternate" rule="An alternate does not vote for a member who has stepped aside." source={committee.alternateMayVoteForRecusedProvenance} />
                              </span>
                            ) : null
                          }
                          unset="An item where a member with an alternate steps aside cannot be decided."
                        />
                      ),
                    },
                    { label: "Secretariat", value: <SettingValue value={secretariat} unset="Nobody may table an item." /> },
                    { label: "A carried decision is called", value: <SettingValue value={committee.carriedLabelEn} unset="It reads “Carried”." /> },
                  ]}
                />
                {committee.notes && <p className="mt-4 text-[13px] leading-relaxed text-ink-3">{committee.notes}</p>}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                icon={<UsersIcon size={17} />}
                title="Opening panel"
                actions={
                  <EditOpeningPanel
                    id={committee.id}
                    name={committee.nameEn}
                    units={units.map((u) => ({ value: u.code, label: u.nameEn }))}
                    values={{
                      panelSize: committee.panelSize == null ? "" : String(committee.panelSize),
                      panelSizeProvenance: committee.panelSizeProvenance ?? "",
                      panelExclusionRule: committee.panelExclusionRule == null ? "" : committee.panelExclusionRule ? "yes" : "no",
                      panelExcludesUnitCode: committee.panelExcludesUnitCode ?? "",
                      panelExclusionProvenance: committee.panelExclusionProvenance ?? "",
                    }}
                  />
                }
              />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={[
                    {
                      label: "Members on an opening panel",
                      value: (
                        <SettingValue
                          value={
                            committee.panelSize != null ? (
                              <span className="inline-flex items-center gap-1">
                                {committee.panelSize}
                                <RuleInfo label="The rule behind the panel size" rule="How many members open the bids." source={committee.panelSizeProvenance} />
                              </span>
                            ) : null
                          }
                          unset={OPENING_RULE_UNSET.panelSize}
                        />
                      ),
                    },
                    {
                      label: "Excluded from the panel",
                      value: (
                        <SettingValue
                          value={
                            committee.panelExclusionRule != null ? (
                              <span className="inline-flex items-center gap-1">
                                {committee.panelExclusionRule ? `Members of ${excludedUnit ?? "a unit not named"} and the units under it` : "No unit is excluded"}
                                <RuleInfo label="The rule behind the exclusion" rule="Who may not sit on an opening panel." source={committee.panelExclusionProvenance} />
                              </span>
                            ) : null
                          }
                          unset={OPENING_RULE_UNSET.exclusion}
                        />
                      ),
                    },
                  ]}
                />
              </CardBody>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader icon={<RouteIcon size={17} />} title="Approval routes using it" divided={rules.length === 0} />
              {rules.length === 0 ? (
                <EmptyState size="sm" title="No value band routes here" />
              ) : (
                <Table>
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "44%" }} />
                    <col style={{ width: "38%" }} />
                  </colgroup>
                  <THead>
                    <Th>Item</Th>
                    <Th>Applies to</Th>
                    <Th>Decision</Th>
                  </THead>
                  <tbody>
                    {/* Keyed by position so the internal rule key stays server-side. */}
                    {rules.map((r, i) => {
                      const act = committeeActOn(r, committee.code);
                      return (
                        <Tr key={i}>
                          <Td label="Item" className="text-ink-2">{matterLabel(r.domain)}</Td>
                          <Td label="Applies to" className="text-ink">{r.labelEn}</Td>
                          <Td label="Decision">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {act ? <ActWithLabel act={act} /> : <span className="text-[12px] text-ink-3">Not set</span>}
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
          </div>
        </Disclosure>
      </div>
    </>
  );
}

function QuorumCard({ quorum, seats, provenance, name }: { quorum: number | null; seats: number; provenance: string | null; name: string }) {
  // Not set: the page's own warning says it, so here it is plain text.
  if (quorum == null) return <SettingValue value={null} unset="" />;
  const assessment = assessQuorum({ quorum, present: seats });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-[26px] leading-none font-bold tracking-[-0.02em] text-ink tabular-nums">{quorum}</span>
        <div className="flex min-w-0 flex-col">
          <span className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink">
            members required
            <RuleInfo label="The rule behind the quorum" rule={`${quorum} members are needed for ${name} to decide.`} source={provenance} />
          </span>
          <span className="text-[12px] text-ink-3">of {seats} voting seats</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex flex-wrap gap-1">
          {Array.from({ length: Math.max(seats, quorum) }, (_, i) => (
            <span key={i} className={cx("size-2.5 rounded-full", i < quorum ? "bg-amber-400" : "bg-ink/10")} aria-hidden="true" />
          ))}
        </span>
        <span className="text-[12px] text-ink-3">{assessment.required} needed to sit</span>
      </div>
    </div>
  );
}
