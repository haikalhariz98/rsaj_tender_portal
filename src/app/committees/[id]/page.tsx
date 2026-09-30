import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, CalendarIcon, ClockIcon, FileIcon, UsersIcon } from "@/components/icons";
import { DecisionPanel, type PanelMatter } from "@/components/committee/decision-panel";
import { HistoryButton } from "@/components/history-drawer";
import { Tabs } from "@/components/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, Meter } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { fieldLabel } from "@/lib/audit/diff";
import {
  ATTENDANCE_FAULT_MESSAGE,
  BLOCKER_LABEL,
  CHOICE_LABEL,
  MATTER_KIND_LABEL,
  MEETING_STATUS_LABEL,
  MEETING_STATUS_TONE,
  NOT_APPROVED_KIND_LABEL,
  OUTCOME_LABEL,
  POSITION_LABEL,
  TRANSITION_FAULT_MESSAGE,
  VOTING_RULE_LABEL,
} from "@/lib/committee/labels";
import { MANDATORY_ACTS } from "@/lib/committee/matter";
import { isFrozen, meetingTransition } from "@/lib/committee/meeting";
import type { VotingSeat } from "@/lib/committee/sitting";
import { loadSitting, sittingHistory, type LoadedSitting } from "@/lib/committee/sittings";
import { formatDate } from "@/lib/format";
import { ACT_LABEL, matterLabel } from "@/lib/labels";

import {
  CancelSitting,
  DeclareRecusal,
  EditMinutes,
  EditSitting,
  MinuteSitting,
  RecordAttendanceEditor,
  RecordOutcome,
  StartSitting,
  TableMatter,
} from "../editors";

export const dynamic = "force-dynamic";

const PROVENANCE_LABEL: Record<string, string> = {
  STATED: "stated",
  OBSERVED: "observed",
  ASSUMED: "assumed",
};
const TONE = { info: "info", brand: "brand", ok: "ok", neutral: "neutral" } as const;
const OUTCOMES_HREF = "/configuration/committees#not-approved-outcomes";
const day = (d: Date) => d.toISOString().slice(0, 10);

function seatLabel(s: VotingSeat): string {
  const pos = POSITION_LABEL[s.position];
  return s.officeLabel ? `${pos} · ${s.officeLabel}` : pos;
}

export default async function SittingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const s = await loadSitting(id);
  if (!s) notFound();

  const m = s.meeting;
  const c = m.committee;
  const a = s.assessment;
  const frozen = isFrozen(m.status);
  const history = await sittingHistory(s);
  const nameOf = (pid: string) => s.roster.people.find((p) => p.id === pid)?.name ?? "Not on record";

  const present = a.present.voterIds.length;
  const quorumFact =
    c.quorum == null ? (
      <Badge tone="warn">Quorum not set</Badge>
    ) : (
      <span className="inline-flex items-center gap-2">
        <span>
          {present} of {c.quorum} present
        </span>
        <Meter
          className="w-24"
          showValue={false}
          percent={Math.min(100, (present / c.quorum) * 100)}
          tone={present >= c.quorum ? "brand" : "warn"}
        />
      </span>
    );

  const minuteCheck = meetingTransition(m.status, "MINUTED", {
    minutes: m.minutes,
    reason: "",
    matterOutcomes: m.decisions.map((d) => d.outcome),
  });

  const actions = (
    <>
      {!frozen && <EditSitting meeting={m} />}
      {m.status === "SCHEDULED" && <StartSitting meetingId={m.id} />}
      {m.status === "IN_PROGRESS" && (
        <MinuteSitting
          meetingId={m.id}
          blockers={minuteCheck.ok ? [] : [TRANSITION_FAULT_MESSAGE[minuteCheck.fault]]}
        />
      )}
      {!frozen && <CancelSitting meetingId={m.id} />}
      <HistoryButton entity="Meeting" entityId={m.id} label={m.reference} />
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/committees">Committee sittings</Link>}
        title={m.reference}
        badge={
          <Badge tone={TONE[MEETING_STATUS_TONE[m.status]]} dot>
            {MEETING_STATUS_LABEL[m.status]}
          </Badge>
        }
        subtitle={`A sitting of the ${c.nameEn}.`}
        meta={[
          <Link key="c" href={`/configuration/committees/${c.code}`}>
            {c.nameEn}
          </Link>,
          formatDate(m.meetingDate),
          quorumFact,
          c.votingRule ? VOTING_RULE_LABEL[c.votingRule] : <Badge tone="warn">Voting rule not set</Badge>,
        ]}
        actions={actions}
      />

      <ConfigurationGaps s={s} />

      <Tabs
        initial={tab}
        label="Sitting"
        tabs={[
          {
            id: "agenda",
            label: "Agenda and decisions",
            icon: <FileIcon size={15} />,
            count: m.decisions.length,
            panel: <AgendaPanel s={s} />,
          },
          {
            id: "attendance",
            label: "Attendance",
            icon: <UsersIcon size={15} />,
            count: present,
            panel: <AttendancePanel s={s} />,
          },
          { id: "minutes", label: "Minutes", icon: <CalendarIcon size={15} />, panel: <MinutesPanel s={s} /> },
          {
            id: "history",
            label: "History",
            icon: <ClockIcon size={15} />,
            count: history.length,
            panel: <HistoryPanel s={s} entries={history} nameOf={nameOf} />,
          },
        ]}
      />
    </>
  );
}

/// What the committee's configuration leaves unset, where it stops this sitting.
function ConfigurationGaps({ s }: { s: LoadedSitting }) {
  const c = s.meeting.committee;
  if (isFrozen(s.meeting.status)) return null;
  const gaps: string[] = [];
  if (c.quorum == null) gaps.push("no quorum is set, so no sitting can be certified quorate");
  if (c.votingRule == null) gaps.push("no voting rule is set, and none is assumed, so no matter can be carried or voted down");
  if (!c.secretariatRoleCode) gaps.push("no Secretariat office is set, so nobody may table a matter");
  if (gaps.length === 0) return null;
  return (
    <Callout
      tone="warn"
      className="mb-6"
      title="This committee's configuration stops the sitting from deciding"
      action={
        <ButtonLink href={`/configuration/committees/${c.code}`} size="sm">
          Configure committee
        </ButtonLink>
      }
    >
      {gaps.map((g, i) => (
        <span key={i} className="block">
          {g.charAt(0).toUpperCase() + g.slice(1)}.
        </span>
      ))}
    </Callout>
  );
}

// ------------------------------------------------------------------ agenda

function AgendaPanel({ s }: { s: LoadedSitting }) {
  const m = s.meeting;
  const a = s.assessment;
  const frozen = isFrozen(m.status);
  const voting = new Map(a.voting.map((v) => [v.seatId, v]));

  const matters = m.decisions.map((d) => {
    const assessment = a.matters[d.id];
    const recused = new Set(d.recusals.map((r) => r.personId));
    const seen = new Set<string>();
    const voters = a.present.occupants
      .filter((o) => (seen.has(o.personId) ? false : (seen.add(o.personId), true)))
      .map((o) => {
        const seat = voting.get(o.seatId);
        const label = seat ? seatLabel(seat) : "Member";
        return {
          personId: o.personId,
          name: s.roster.people.find((p) => p.id === o.personId)?.name ?? "Not on record",
          seat: o.standIn && seat?.name ? `${label} · for ${seat.name}` : label,
          standIn: o.standIn,
          recused: recused.has(o.personId),
        };
      });

    const decided =
      d.outcome === "PENDING"
        ? null
        : {
            date: d.decisionDate,
            quorum: d.quorumRequired == null ? "Not set" : `${d.quorumRequired} required`,
            present: `${d.presentVoters ?? 0} present · ${d.recusedCount ?? 0} recused`,
            rule: d.votingRule
              ? `${VOTING_RULE_LABEL[d.votingRule]}${d.votingRuleProvenance ? ` (${PROVENANCE_LABEL[d.votingRuleProvenance]})` : ""}`
              : "Not applied — deferred",
            note: d.outcomeNote,
            notApproved: d.notApprovedOutcome
              ? `${d.notApprovedOutcome.nameEn} (${NOT_APPROVED_KIND_LABEL[d.notApprovedOutcome.kind].toLowerCase()})`
              : null,
          };

    const matter: PanelMatter = {
      id: d.id,
      subject: d.subject,
      matterLabel: matterLabel(d.domain),
      kindLabel: d.matterKind ? MATTER_KIND_LABEL[d.matterKind] : null,
      matterRef: d.matterRef,
      amount: d.amount,
      act: d.act,
      mandatory: MANDATORY_ACTS.has(d.act),
      outcome: d.outcome,
      outcomeLabel: OUTCOME_LABEL[d.outcome],
      tabledBy: d.tabledBy?.name ?? null,
      tabledAt: d.tabledAt,
      dependsOn: d.dependsOn ? { subject: d.dependsOn.subject, outcomeLabel: OUTCOME_LABEL[d.dependsOn.outcome] } : null,
      recusals: d.recusals.map((r) => ({ name: r.person.name, reason: r.reason })),
      voters,
      votes: d.votes.map((v) => ({ personId: v.personId, choice: v.choice, comment: v.comment, votedAt: day(v.votedAt) })),
      canRecord: assessment.canRecord,
      blockers: assessment.blockers.map((b) => BLOCKER_LABEL[b]),
      messageEn: assessment.messageEn,
      quorumMessage: assessment.quorum.messageEn,
      tally: assessment.tally,
      decided,
    };

    const open = m.status === "IN_PROGRESS" && d.outcome === "PENDING";
    const noOutcomes =
      open && assessment.canRecord && assessment.computed === "NOT_CARRIED" && s.outcomesOffered.length === 0;
    const members = [...a.voting, ...a.alternates]
      .filter((v) => v.personId && !recused.has(v.personId) && !d.votes.some((x) => x.personId === v.personId))
      .map((v) => ({ id: v.personId!, name: v.name ?? "Not on record" }));
    const uniqueMembers = [...new Map(members.map((x) => [x.id, x])).values()];

    return (
      <Card key={d.id} className="overflow-hidden">
        <DecisionPanel
          matter={matter}
          open={open}
          meetingDate={day(m.meetingDate)}
          notice={
            noOutcomes ? (
              <Callout
                tone="err"
                title="The votes do not carry this matter, and it cannot be recorded yet"
                action={
                  <ButtonLink href={OUTCOMES_HREF} size="sm">
                    Configure outcomes
                  </ButtonLink>
                }
              >
                A matter not carried must say what happens next, and no not-approved outcome is configured
                for this committee. Add one under Configuration, Committees, Not-approved outcomes. The
                sitting cannot be minuted until this matter is recorded.
              </Callout>
            ) : undefined
          }
          actions={
            open ? (
              <>
                {uniqueMembers.length > 0 && <DeclareRecusal decisionId={d.id} members={uniqueMembers} />}
                <RecordOutcome
                  decisionId={d.id}
                  offered={s.outcomesOffered}
                  suggested={assessment.computed ? OUTCOME_LABEL[assessment.computed] : null}
                />
              </>
            ) : undefined
          }
        />
      </Card>
    );
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          icon={<FileIcon size={17} />}
          title="Agenda"
          subtitle={
            m.decisions.length === 0
              ? "No matter tabled yet"
              : `${m.decisions.length} ${m.decisions.length === 1 ? "matter" : "matters"} · ${
                  m.decisions.filter((d) => d.outcome === "PENDING").length
                } pending`
          }
          actions={
            !frozen && s.secretariat.code ? (
              <TableMatter
                meetingId={m.id}
                holders={s.secretariat.holders}
                otherMatters={m.decisions.map((d) => ({ id: d.id, subject: d.subject }))}
              />
            ) : undefined
          }
          divided={m.decisions.length === 0 && !m.agenda}
        />
        {m.agenda && (
          <CardBody pad="tight">
            <p className="text-[13.5px] whitespace-pre-line text-ink-2">{m.agenda}</p>
          </CardBody>
        )}
        {m.decisions.length === 0 && (
          <EmptyState size="sm" title="Nothing tabled">
            {s.secretariat.code
              ? `Matters are tabled by a holder of the ${s.secretariat.office?.nameEn ?? "Secretariat"} office.`
              : "No Secretariat office is set for this committee, so nobody may table a matter."}
          </EmptyState>
        )}
      </Card>
      {matters}
    </div>
  );
}

// -------------------------------------------------------------- attendance

function AttendancePanel({ s }: { s: LoadedSitting }) {
  const m = s.meeting;
  const a = s.assessment;
  const editable = m.status === "IN_PROGRESS";
  const record = new Map(m.attendance.map((r) => [r.personId, r]));
  const seatById = new Map(a.voting.map((v) => [v.seatId, v]));
  const coverable = a.voting
    .filter((v) => v.position !== "CHAIRMAN")
    .map((v) => ({ seatId: v.seatId, label: `${seatLabel(v)} — ${v.name ?? "vacant"}` }));

  type Line = { key: string; personId: string | null; name: string; role: string; alternate: boolean; note?: string };
  const lines: Line[] = [
    ...a.voting.map((v) => ({
      key: v.seatId,
      personId: v.personId,
      name: v.name ?? (v.contested ? "Two holders on the date" : "Vacant"),
      role: seatLabel(v),
      alternate: false,
      note: v.contested
        ? "The office has more than one holder on the sitting date. Resolve it in Users & roles; the system will not pick one."
        : v.vacant
          ? "Nobody holds this office on the sitting date."
          : undefined,
    })),
    ...a.alternates.map((v) => ({
      key: v.seatId,
      personId: v.personId,
      name: v.name ?? "Vacant",
      role: `Alternate${v.forSeatId && seatById.get(v.forSeatId) ? ` for ${seatById.get(v.forSeatId)!.name ?? seatLabel(seatById.get(v.forSeatId)!)}` : ` · any ${POSITION_LABEL[v.position].toLowerCase()} seat`}`,
      alternate: true,
    })),
    ...a.nonVotingMemberIds.map((pid) => ({
      key: `sec-${pid}`,
      personId: pid,
      name: s.roster.people.find((p) => p.id === pid)?.name ?? "Not on record",
      role: "Secretary · does not vote",
      alternate: false,
    })),
  ];
  const faults = a.present.faults;

  return (
    <div className="flex flex-col gap-5">
      <Callout tone="info" title="The Secretary attends but never votes">
        The Secretary is not counted toward quorum and casts no vote. This is a product assumption, not a rule
        from the committee&apos;s terms of reference, and is awaiting confirmation.
      </Callout>
      {faults.length > 0 && (
        <Callout tone="err" title="The register has faults" icon={<AlertTriangle size={18} />}>
          {faults.map((f) => (
            <span key={f.personId + f.fault} className="block">
              {s.roster.people.find((p) => p.id === f.personId)?.name ?? "Someone"} {ATTENDANCE_FAULT_MESSAGE[f.fault]}
            </span>
          ))}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Register"
          subtitle={`${a.present.voterIds.length} voting ${a.present.voterIds.length === 1 ? "member" : "members"} present, judged on the seats in force on ${formatDate(m.meetingDate)}`}
        />
        <ul className="divide-y divide-line/70">
          {lines.map((line) => {
            const r = line.personId ? record.get(line.personId) : undefined;
            const standingFor = r?.standingInForSeatId ? seatById.get(r.standingInForSeatId) : undefined;
            return (
              <li key={line.key} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                {line.personId ? <Avatar name={line.name} /> : <Avatar muted>—</Avatar>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-ink">{line.name}</div>
                  <div className="truncate text-[12px] text-ink-3">{line.role}</div>
                  {line.note && <div className="text-[12px] text-amber-700">{line.note}</div>}
                </div>
                {r == null ? (
                  <Badge outline>Not recorded</Badge>
                ) : !r.attended ? (
                  <Badge>Absent</Badge>
                ) : standingFor ? (
                  <Badge tone="info">Standing in for {standingFor.name ?? seatLabel(standingFor)}</Badge>
                ) : (
                  <Badge tone="ok">Present</Badge>
                )}
                {editable && line.personId && (
                  <RecordAttendanceEditor
                    meetingId={m.id}
                    personId={line.personId}
                    name={line.name}
                    current={r ? { attended: r.attended, standingInForSeatId: r.standingInForSeatId } : null}
                    seats={line.alternate ? coverable : []}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------- minutes

function MinutesPanel({ s }: { s: LoadedSitting }) {
  const m = s.meeting;
  return (
    <Card>
      <CardHeader
        icon={<CalendarIcon size={17} />}
        title="Minutes"
        subtitle={m.status === "MINUTED" ? "Minuted. The sitting is frozen." : "Recorded as text."}
        actions={!isFrozen(m.status) ? <EditMinutes meetingId={m.id} minutes={m.minutes} /> : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {m.minutes ? (
          <p className="text-[14px] leading-relaxed whitespace-pre-line text-ink">{m.minutes}</p>
        ) : (
          <p className="text-[13.5px] text-ink-3">No minutes written yet.</p>
        )}
        <KeyValues
          columns={2}
          items={[
            {
              label: "Signed minutes",
              value: <Badge tone="warn">Not attached: document storage not built</Badge>,
            },
            { label: "Minuted on", value: m.minutedAt ? formatDate(m.minutedAt) : "Not minuted" },
            ...(m.status === "CANCELLED" ? [{ label: "Cancelled because", value: m.cancelledReason }] : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}

// ----------------------------------------------------------------- history

const ACTION_LABEL = { CREATE: "Recorded", UPDATE: "Changed", DELETE: "Removed" } as const;
const ENTITY_LABEL: Record<string, string> = {
  Meeting: "Sitting",
  MeetingAttendance: "Attendance",
  CommitteeDecision: "Matter",
  Vote: "Vote",
  DecisionRecusal: "Recusal",
};

function HistoryPanel({
  s,
  entries,
  nameOf,
}: {
  s: LoadedSitting;
  entries: Awaited<ReturnType<typeof sittingHistory>>;
  nameOf: (id: string) => string;
}) {
  const seats = new Map([...s.assessment.voting, ...s.assessment.alternates].map((v) => [v.seatId, v]));
  const subjects = new Map(s.meeting.decisions.map((d) => [d.id, d.subject]));
  const outcomes = new Map(s.outcomesAll.map((o) => [o.id, o.nameEn]));

  // Stored values are codes and ids; the trail shows what they stand for.
  const read = (field: string, value: string | null): string => {
    if (value == null || value === "") return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    if (field === "status") return MEETING_STATUS_LABEL[value as keyof typeof MEETING_STATUS_LABEL] ?? value;
    if (field === "outcome") return OUTCOME_LABEL[value as keyof typeof OUTCOME_LABEL] ?? value;
    if (field === "choice") return CHOICE_LABEL[value] ?? value;
    if (field === "act") return ACT_LABEL[value] ?? value;
    if (field === "domain") return matterLabel(value);
    if (field === "matterKind") return MATTER_KIND_LABEL[value as keyof typeof MATTER_KIND_LABEL] ?? value;
    if (field === "votingRule") return VOTING_RULE_LABEL[value as keyof typeof VOTING_RULE_LABEL] ?? value;
    if (field === "votingRuleProvenance") return PROVENANCE_LABEL[value] ?? value;
    if (field === "standingInForSeatId") {
      const seat = seats.get(value);
      return seat ? `${seat.name ?? "vacant"} (${seatLabel(seat)})` : "A seat no longer in force";
    }
    if (field === "notApprovedOutcomeId") return outcomes.get(value) ?? "A removed outcome";
    if (field === "dependsOnDecisionId") return subjects.get(value) ?? "Another matter";
    if (field === "tabledByPersonId") return nameOf(value);
    return value;
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle="Every change to this sitting and what is under it. Nobody is signed in, so no change is attributed."
        divided={entries.length === 0}
      />
      {entries.length === 0 ? (
        <EmptyState size="sm" title="No recorded changes">
          Changes made through the portal appear here. Records loaded directly have no trail.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge tone={e.action === "CREATE" ? "ok" : e.action === "DELETE" ? "err" : "info"}>
                  {ACTION_LABEL[e.action]}
                </Badge>
                <span className="font-semibold text-ink">{ENTITY_LABEL[e.entity] ?? "Record"}</span>
                <span className="min-w-0 truncate text-ink-2">{e.entityLabel}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatDate(e.at)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] text-ink-3">
                  {e.changes.map((ch) => (
                    <li key={ch.field}>
                      {fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{read(ch.field, ch.before)} → </>}
                      <span className="text-ink-2">{read(ch.field, ch.after)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="text-[12.5px] text-ink-3">Reason: {e.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
