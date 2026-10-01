import Link from "next/link";
import type { ReactNode } from "react";
import { DOCUMENT_ENTITY_LABEL } from "@/lib/documents/audit-view";
import { notFound } from "next/navigation";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { RecordCrumb } from "@/components/shell/record-crumb";

import { AlertTriangle, CalendarIcon, ClockIcon, FileIcon, UsersIcon } from "@/components/icons";
import { DecisionPanel, type PanelMatter } from "@/components/committee/decision-panel";
import { Tabs } from "@/components/tabs";
import { Avatar } from "@/components/ui/avatar";
import { Badge, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState, Meter } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { fieldLabel } from "@/lib/audit/diff";
import { assessQuorum } from "@/lib/committee/quorum";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { minutingChecks } from "@/lib/committee/assess-sitting";
import { configurationGaps } from "@/lib/committee/gaps";
import {
  blockerShort,
  ORGANISATION_HREF,
  configurationGapLine,
  matterCount,
  attendanceFaultText,
  ROLE_ASSIGNMENTS_HREF,
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
  signedMinutesState,
  MINUTED_CARD_NOTE,
  SIGNED_MINUTES_LABEL,
  SIGNED_MINUTES_TONE,
} from "@/lib/committee/labels";
import { isLive } from "@/lib/documents/evidence";
import { liveOutcomes, MANDATORY_ACTS } from "@/lib/committee/matter";
import { isFrozen, meetingTransition } from "@/lib/committee/meeting";
import type { VotingSeat } from "@/lib/committee/sitting";
import { loadSitting, sittingHistory, type LoadedSitting } from "@/lib/committee/sittings";
import { tablePrefillFromQuery } from "@/lib/committee/table-prefill";
import { tablingAmount } from "@/lib/committee/repo";
import { formatDate, formatOrgDateTime, formatOrgDay } from "@/lib/format";
import { actWithCode, matterLabel } from "@/lib/labels";
import { scopeMatterRecordNote } from "@/lib/scope/labels";
import { formatMoney, parseSen } from "@/lib/money";

import {
  CancelSitting,
  DeclareRecusal,
  WithdrawMatter,
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
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab = sp.tab;
  // A record asking for a matter to be tabled (a requisition's gate, an award's committee step)
  // links here with it filled in. The link names the record; its amount is read here, on the
  // server, never carried in the URL (a requisition's is the SULIT department estimate).
  const asked = tablePrefillFromQuery(sp);
  const askedAmount = asked ? await tablingAmount(asked.source) : null;
  const prefill = asked ? { ...asked.values, ...(askedAmount != null ? { amount: askedAmount } : {}) } : undefined;
  const s = await loadSitting(id);
  if (!s) notFound();

  const m = s.meeting;
  const c = m.committee;
  const a = s.assessment;
  const frozen = isFrozen(m.status);
  const history = await sittingHistory(s);
  const nameOf = (pid: string) => s.names[pid] ?? "Not on record";
  // A minuted sitting reads its quorum and rule from its own snapshot.
  const quorum = s.rules.quorum;
  const votingRule = s.rules.votingRule;
  const quorumState = assessQuorum({ quorum, present: a.present.voterIds.length }).state;

  const present = a.present.voterIds.length;
  const cancelled = m.status === "CANCELLED";
  // A cancelled sitting took no register: no quorum count to show.
  const quorumFact = cancelled ? (
    <span>Quorum —</span>
  ) : quorum == null ? (
    <span className="inline-flex items-center gap-1.5">
      Quorum <Badge tone="warn">Not set</Badge>
    </span>
  ) : !a.registerTaken ? (
    // Not started: no register yet, so the requirement only, never "0 of N present".
    <span>Quorum {quorum} required</span>
  ) : (
      <span className="inline-flex items-center gap-2">
        <span>
          {present} of {quorum} present
        </span>
        <Meter
          className="w-24"
          showValue={false}
          percent={Math.min(100, (present / quorum) * 100)}
          tone={quorumState === "MET" ? "brand" : "warn"}
        />
      </span>
    );

  const minuteCheck = meetingTransition(m.status, "MINUTED", {
    minutes: m.minutes,
    reason: "",
    matterOutcomes: liveOutcomes(m.decisions),
    ...minutingChecks(a, s.matters),
  });

  const minuteBlocker =
    m.status === "IN_PROGRESS" && !minuteCheck.ok ? TRANSITION_FAULT_MESSAGE[minuteCheck.fault] : null;

  const actions = (
    <>
      {!frozen && <EditSitting meeting={m} />}
      {m.status === "SCHEDULED" && <StartSitting meetingId={m.id} />}
      {m.status === "IN_PROGRESS" && (
        <MinuteSitting meetingId={m.id} blocker={minuteBlocker} blockerId="sitting-actions-note" />
      )}
      {!frozen && <CancelSitting meetingId={m.id} />}
    </>
  );

  return (
    <>
      <RecordCrumb label={m.reference} />
      <PageHeader
        eyebrow={<Link href="/committees">Committee sitting</Link>}
        title={s.committeeName}
        badge={
          <Badge tone={TONE[MEETING_STATUS_TONE[m.status]]} dot>
            {MEETING_STATUS_LABEL[m.status]}
          </Badge>
        }
        subtitle={cancelled ? `Cancelled: ${m.cancelledReason}` : undefined}
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">{m.reference}</span>,
          <Link key="c" href={`/configuration/committees/${c.code}`}>
            Committee set-up
          </Link>,
          formatDate(m.meetingDate),
          quorumFact,
          votingRule ? (
            VOTING_RULE_LABEL[votingRule]
          ) : (
            <span key="vr" className="inline-flex items-center gap-1.5">
              Voting rule <Badge tone="warn">Not set</Badge>
            </span>
          ),
        ]}
        actions={actions}
        actionsNote={minuteBlocker}
        actionsNoteId="sitting-actions-note"
      />

      {!frozen && s.timeZone == null && (
        <Callout
          tone="warn"
          className="mb-6"
          title="The organisation's time zone is not set"
          action={
            <ButtonLink href={ORGANISATION_HREF} size="sm">
              Set time zone
            </ButtonLink>
          }
        >
          Whether a sitting&apos;s day has come, the tabling day and the date on a voting sheet all depend on it,
          and it is not assumed to be UTC. Until it is set, this sitting cannot start, matters cannot be tabled
          and votes cannot be recorded.
        </Callout>
      )}
      <ConfigurationGaps s={s} />
      {s.fromSnapshot && (
        <Callout tone="info" className="mb-6" title="As minuted">
          This sitting is shown from the register frozen when it was minuted: the seats, holders, quorum and
          voting rule as they stood on the day. Later changes to the committee do not rewrite it.
        </Callout>
      )}
      {m.status === "MINUTED" && !s.fromSnapshot && (
        <Callout tone="warn" className="mb-6" title="Minuted before registers were frozen">
          No register snapshot was taken for this sitting, so its seats and holders are shown as the
          committee is configured today. Each decision still shows the quorum and rule it was recorded under.
        </Callout>
      )}

      <Tabs
        initial={tab}
        label="Sitting"
        tabs={[
          {
            id: "agenda",
            label: "Agenda and decisions",
            icon: <FileIcon size={15} />,
            count: m.decisions.length,
            panel: <AgendaPanel s={s} prefill={prefill} />,
          },
          {
            id: "attendance",
            label: "Attendance",
            icon: <UsersIcon size={15} />,
            // Not started: no register, so no count — never a "0" that reads as nobody came.
            count: a.registerTaken ? present : undefined,
            panel: <AttendancePanel s={s} />,
          },
          { id: "minutes", label: "Minutes", icon: <CalendarIcon size={15} />, panel: <MinutesPanel s={s} /> },
          {
            id: "history",
            label: "History",
            icon: <ClockIcon size={15} />,
            count: history.total,
            panel: <HistoryPanel s={s} entries={history.entries} total={history.total} nameOf={nameOf} />,
          },
        ]}
      />
    </>
  );
}

/// What the committee's configuration leaves unset, and which matters it stops. The
/// count and the subjects come from `configurationGaps`, read off the same assessment.
function ConfigurationGaps({ s }: { s: LoadedSitting }) {
  const c = s.meeting.committee;
  const report = configurationGaps({
    status: s.meeting.status,
    rules: s.rules,
    secretariatRoleCode: c.secretariatRoleCode,
    matters: s.meeting.decisions.map((d) => ({ id: d.id, subject: d.subject, outcome: d.outcome, withdrawn: d.withdrawnAt != null })),
    assessment: s.assessment,
  });
  if (!report) return null;
  return (
    <Callout
      tone="warn"
      className="mb-6"
      title={report.title}
      action={
        <ButtonLink href={`/configuration/committees/${c.code}`} size="sm">
          Configure committee
        </ButtonLink>
      }
    >
      {report.gaps.map((g) => (
        <span key={g.key} className="block">
          {g.text}
        </span>
      ))}
    </Callout>
  );
}

// ------------------------------------------------------------------ agenda

function AgendaPanel({ s, prefill }: { s: LoadedSitting; prefill?: Record<string, string> }) {
  const m = s.meeting;
  const a = s.assessment;
  const frozen = isFrozen(m.status);
  const voting = new Map(a.voting.map((v) => [v.seatId, v]));

  const matters = m.decisions.map((d) => {
    // Withdrawn before the sitting opened (6.10 follow-up): on record, off the agenda.
    if (d.withdrawnAt) {
      return (
        <Card key={d.id} className="overflow-hidden">
          <CardBody className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Withdrawn from the agenda</Badge>
              <span className="min-w-0 font-semibold break-words text-ink">{d.subject}</span>
            </div>
            <p className="text-[12.5px] text-ink-2">
              Withdrawn {formatOrgDay(d.withdrawnAt, s.timeZone)} before the sitting opened{d.withdrawnReason ? ` — “${d.withdrawnReason}”` : ""}. Nothing is voted or decided on it.
            </p>
          </CardBody>
        </Card>
      );
    }
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
          name: s.names[o.personId] ?? "Not on record",
          seat: o.standIn && seat?.name ? `${label} · standing in for ${seat.name}` : label,
          standIn: o.standIn,
          recused: recused.has(o.personId),
          // Their seat does not vote on this matter because its holder recused,
          // whoever sits in it (send-back 8.5).
          excused: !recused.has(o.personId) && !assessment.entitledIds.includes(o.personId),
        };
      });
    const entitled = new Set(assessment.entitledIds);
    const ineligibleVotes = d.votes
      .filter((v) => assessment.ineligibleVoterIds.includes(v.personId))
      .map((v) => ({
        name: s.names[v.personId] ?? "Not on record",
        why:
          v.choice === "ABSTAIN"
            ? "an abstention, which is not recorded"
            : recused.has(v.personId)
              ? "recused on this matter"
              : a.present.voterIds.includes(v.personId) && !entitled.has(v.personId)
                ? "sits in a seat that does not vote on this matter"
                : "not recorded as a present voting member",
      }));

    const decided =
      d.outcome === "PENDING"
        ? null
        : {
            dateLabel: d.outcome === "DEFERRED" ? "Deferred on" : "Decided on",
            date: d.decisionDate,
            // Carried or not carried needs a quorum, so a missing one was not recorded; a
            // deferral records the committee's quorum, which may genuinely be unset.
            quorum:
              d.quorumRequired != null
                ? `${d.quorumRequired} required`
                : d.outcome === "DEFERRED"
                  ? "Not set"
                  : "Not recorded",
            // A snapshot that was never written reads as not recorded, never as nought.
            present:
              d.presentVoters == null && d.recusedCount == null
                ? "Not recorded"
                : `${d.presentVoters ?? "Not recorded"} counted toward quorum · ${d.recusedCount ?? "not recorded"} recused among those present`,
            rule: d.votingRule
              ? `${VOTING_RULE_LABEL[d.votingRule]}${d.votingRuleProvenance ? ` (${PROVENANCE_LABEL[d.votingRuleProvenance]})` : ""}`
              : d.outcome === "DEFERRED"
                ? "Not applied — deferred"
                : "Not recorded",
            note: d.outcomeNote,
            notApproved: d.notApprovedOutcomeNameEn
              ? `${d.notApprovedOutcomeNameEn}${d.notApprovedOutcomeKind ? ` (${NOT_APPROVED_KIND_LABEL[d.notApprovedOutcomeKind].toLowerCase()})` : ""}`
              : null,
          };

    const matter: PanelMatter = {
      id: d.id,
      subject: d.subject,
      matterLabel: matterLabel(d.domain),
      kindLabel: d.matterKind ? MATTER_KIND_LABEL[d.matterKind] : null,
      matterRef: d.matterRef,
      matterHref: d.bqVersion ? `/sourcing/${d.bqVersion.exerciseId}?tab=scope&section=scope` : d.exerciseId ? `/sourcing/${d.exerciseId}` : d.requisitionId ? `/requisitions/${d.requisitionId}` : null,
      recordNote: d.bqVersion ? scopeMatterRecordNote(d.bqVersion) : null,
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
      // Where the committee's configuration is what stops it, one sentence for the
      // matter; the sitting's callout already names what to set.
      gapLine: configurationGapLine(assessment.blockers),
      messageEn: assessment.messageEn,
      quorumMessage: assessment.quorum.messageEn,
      tally: assessment.tally,
      registerTaken: assessment.registerTaken,
      ineligibleVotes,
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
          today={s.today}
          notice={
            open && assessment.blockers.includes("ALTERNATE_FOR_RECUSED_UNCONFIGURED") ? (
              <Callout
                tone="warn"
                title="Whether an alternate may vote for a recused member is not set"
                action={
                  <ButtonLink href={`/configuration/committees/${m.committee.code}`} size="sm">
                    Set it
                  </ButtonLink>
                }
              >
                A member with an alternate has recused on this matter. The committee&apos;s configuration does not
                say whether an alternate may vote in their place, and the system will not assume it.
              </Callout>
            ) : noOutcomes ? (
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
            m.status === "SCHEDULED" && d.outcome === "PENDING" ? (
              <WithdrawMatter decisionId={d.id} subject={d.subject} />
            ) : open ? (
              <>
                {uniqueMembers.length > 0 && <DeclareRecusal decisionId={d.id} members={uniqueMembers} />}
                <RecordOutcome
                  decisionId={d.id}
                  offered={s.outcomesOffered}
                  suggested={assessment.canRecord && assessment.computed ? OUTCOME_LABEL[assessment.computed] : null}
                  blocker={assessment.canRecord ? null : blockerShort(assessment)}
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
            m.status === "CANCELLED" && m.decisions.length === 0
              ? "Cancelled"
              : matterCount(m.decisions.filter((d) => !d.withdrawnAt).length, m.decisions.filter((d) => d.outcome === "PENDING" && !d.withdrawnAt).length)
          }
          actions={
            !frozen && s.secretariat.code ? (
              <TableMatter
                meetingId={m.id}
                holders={s.secretariat.holders}
                otherMatters={m.decisions.map((d) => ({ id: d.id, subject: d.subject }))}
                prefill={prefill}
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
            {m.status === "CANCELLED"
              ? "This sitting was cancelled; nothing was tabled."
              : m.status === "MINUTED"
                ? "Nothing was tabled at this sitting."
                : s.secretariat.code
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

  type Line = {
    key: string;
    personId: string | null;
    name: string;
    role: string;
    alternate: boolean;
    note?: string;
    contested?: boolean;
    /// The Secretary-never-votes rule is a product assumption (ruling 5.8).
    assumption?: boolean;
  };
  const lines: Line[] = [
    ...a.voting.map((v) => ({
      key: v.seatId,
      personId: v.personId,
      name: v.name ?? (v.contested ? "Two holders on the date" : "Vacant"),
      role: seatLabel(v),
      alternate: false,
      contested: v.contested,
      note: v.contested
        ? `${v.contestedHolderIds.map((id) => s.names[id] ?? "Not on record").join(" and ")} both hold ${v.officeLabel ?? "this office"} on the sitting date. The system will not pick one, so neither can be recorded in this seat.`
        : v.vacant
          ? "Nobody holds this office on the sitting date."
          : undefined,
    })),
    ...a.alternates.map((v) => ({
      key: v.seatId,
      personId: v.personId,
      name: v.name ?? "Vacant",
      role: `${POSITION_LABEL[v.position]} · alternate ${v.forSeatId && seatById.get(v.forSeatId) ? `for ${seatById.get(v.forSeatId)!.name ?? seatLabel(seatById.get(v.forSeatId)!)}` : `for any ${POSITION_LABEL[v.position].toLowerCase()} seat`}`,
      alternate: true,
    })),
    ...a.nonVotingMemberIds.map((pid) => ({
      key: `sec-${pid}`,
      personId: pid,
      name: s.names[pid] ?? "Not on record",
      role: "Secretary · does not vote",
      alternate: false,
      assumption: true,
    })),
  ];
  const faults = a.present.faults;

  if (m.status === "CANCELLED") {
    return (
      <Card>
        <EmptyState size="sm" title="No register">
          This sitting was cancelled; no register was taken.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {faults.length > 0 && (
        <Callout tone="err" title="The register has faults" icon={<AlertTriangle size={18} />}>
          {faults.map((f) => (
            <span key={f.personId + f.fault} className="block">
              {(() => {
                const seat = f.seatId ? a.voting.find((v) => v.seatId === f.seatId) : undefined;
                return attendanceFaultText(
                  s.names[f.personId] ?? "Someone",
                  f.fault,
                  seat ? { office: seat.officeLabel, holders: seat.contestedHolderIds.map((id) => s.names[id] ?? "Not on record") } : undefined,
                );
              })()}
            </span>
          ))}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Register"
          subtitle={
            a.registerTaken
              ? `${a.present.voterIds.length} voting ${a.present.voterIds.length === 1 ? "member" : "members"} present, judged on the seats in force on ${formatDate(m.meetingDate)}`
              : `The sitting has not started: the register is taken when it starts. Members on the seats in force on ${formatDate(m.meetingDate)}.`
          }
        />
        <ul className="divide-y divide-line/70">
          {lines.map((line) => {
            const r = line.personId ? record.get(line.personId) : undefined;
            const standingFor = r?.standingInForSeatId ? seatById.get(r.standingInForSeatId) : undefined;
            return (
              <li key={line.key} className="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
                {line.personId ? <Avatar name={line.name} /> : <Avatar muted>—</Avatar>}
                <div className="min-w-40 flex-1">
                  <div className="break-words text-[13.5px] font-semibold text-ink">{line.name}</div>
                  <div className="break-words text-[12px] text-ink-3">{line.role}</div>
                  {line.note && <div className="text-[12px] text-amber-700">{line.note}</div>}
                  {line.contested && (
                    <Link href={ROLE_ASSIGNMENTS_HREF} className="text-[12px] font-semibold text-brand-700">
                      Fix the role assignments
                    </Link>
                  )}
                </div>
                {line.assumption && (
                  <span title="The Secretary never votes or counts toward quorum. A product assumption awaiting the committee's terms of reference.">
                    <ProvenanceBadge value="ASSUMED" />
                  </span>
                )}
                {r == null ? (
                  <span className="text-[12.5px] text-ink-3">{a.registerTaken ? "Not recorded" : "Taken when the sitting starts"}</span>
                ) : !r.attended ? (
                  <Badge>Absent</Badge>
                ) : standingFor ? (
                  <Badge tone="info">Present · standing in for {standingFor.name ?? seatLabel(standingFor)}</Badge>
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
  const minutesState = signedMinutesState(m.status, m.attachments.filter(isLive).length);
  return (
    <div className="flex flex-col gap-6">
    <Card>
      <CardHeader
        icon={<CalendarIcon size={17} />}
        title="Minutes"
        subtitle={m.status === "MINUTED" ? MINUTED_CARD_NOTE : "Recorded as text."}
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
              value: <Badge tone={SIGNED_MINUTES_TONE[minutesState]}>{SIGNED_MINUTES_LABEL[minutesState]}</Badge>,
            },
            // An instant: read as the organisation's day.
            { label: "Minuted on", value: m.minutedAt ? formatOrgDay(m.minutedAt, s.timeZone) : "Not minuted" },
            ...(m.status === "CANCELLED" ? [{ label: "Cancelled because", value: m.cancelledReason }] : []),
          ]}
        />
      </CardBody>
    </Card>
    <OwnerAttachments
      owner={{ kind: "meeting", id: m.id }}
      title="Signed minutes"
      subtitle="The wet-signed copy, scanned and attached once the sitting is minuted. Minuting does not wait for it."
      required={{ SIGNED_MINUTES: true }}
    />
    </div>
  );
}

// ----------------------------------------------------------------- history

const ACTION_LABEL = { CREATE: "Recorded", UPDATE: "Changed", DELETE: "Removed" } as const;
const ENTITY_LABEL: Record<string, string> = {
  // Attachments and the documents behind them (document store).
  ...DOCUMENT_ENTITY_LABEL,
  Meeting: "Sitting",
  MeetingAttendance: "Attendance",
  CommitteeDecision: "Matter",
  Vote: "Vote",
  DecisionRecusal: "Recusal",
};

/// A reference recorded beside the name it was read as: the name says it once.
const NAMED_BY: Record<string, string> = { tabledByPersonId: "tabledBy", notApprovedOutcomeId: "notApprovedOutcomeNameEn" };
const shownChanges = <C extends { field: string }>(changes: C[]): C[] =>
  changes.filter((ch) => !(NAMED_BY[ch.field] && changes.some((c) => c.field === NAMED_BY[ch.field])));

function HistoryPanel({
  s,
  entries,
  total,
  nameOf,
}: {
  s: LoadedSitting;
  entries: Awaited<ReturnType<typeof sittingHistory>>["entries"];
  total: number;
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
    if (field === "act") return actWithCode(value);
    // Money is recorded as typed; it reads as the portal writes money everywhere.
    if (field === "amount" && /^\d+(\.\d{1,2})?$/.test(value)) return formatMoney(parseSen(value));
    if (field === "domain") return matterLabel(value);
    if (field === "matterKind") return MATTER_KIND_LABEL[value as keyof typeof MATTER_KIND_LABEL] ?? value;
    if (field === "votingRule") return VOTING_RULE_LABEL[value as keyof typeof VOTING_RULE_LABEL] ?? value;
    if (field === "votingRuleProvenance") return PROVENANCE_LABEL[value] ?? value;
    if (field === "standingInForSeatId") {
      const seat = seats.get(value);
      return seat ? `${seat.name ?? "vacant"} (${seatLabel(seat)})` : "A seat no longer in force";
    }
    if (field === "notApprovedOutcomeId") return outcomes.get(value) ?? "A removed outcome";
    if (field === "notApprovedOutcomeKind") return NOT_APPROVED_KIND_LABEL[value as keyof typeof NOT_APPROVED_KIND_LABEL] ?? value;
    if (field === "attended") return value === "yes" ? "Present" : value === "no" ? "Absent" : value;
    if (field === "dependsOnDecisionId") return subjects.get(value) ?? "Another matter";
    if (field === "tabledByPersonId") return nameOf(value);
    return value;
  };
  // A matter's amount may be a requisition's department estimate (SULIT); the trail cannot tell
  // one matter's amount from another's, so every amount it shows carries the chip, as on the agenda.
  const shown = (field: string, value: string | null): ReactNode => (field === "amount" && value ? <SulitValue>{read(field, value)}</SulitValue> : read(field, value));

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClockIcon size={17} />}
        title="History"
        subtitle={
          total > entries.length
            ? `Showing the latest ${entries.length} of ${total} changes. Nobody is signed in, so no change is attributed.`
            : "Every change to this sitting and what is under it. Nobody is signed in, so no change is attributed."
        }
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
                <span className="min-w-0 break-words text-ink-2">{e.entityLabel}</span>
                <span className="flex-1" />
                <span className="text-[12px] text-ink-3">{formatOrgDateTime(e.at, s.timeZone)}</span>
              </div>
              {e.changes.length > 0 && (
                <ul className="text-[12.5px] text-ink-3">
                  {shownChanges(e.changes).map((ch) => (
                    <li key={ch.field}>
                      {fieldLabel(ch.field)}: {e.action === "UPDATE" && <>{shown(ch.field, ch.before)} → </>}
                      <span className="text-ink-2">{shown(ch.field, ch.after)}</span>
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
