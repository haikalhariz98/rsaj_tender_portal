import type { ReactNode } from "react";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";
import { FileIcon, ShieldIcon, SlidersIcon, UsersIcon } from "@/components/icons";
import { Badge, Chip, SulitTag, SulitValue } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { EVALUATION_STATEMENT } from "@/lib/evaluation/labels";
import { evaluationTabView, openDetail, type EvaluationCurrent, type EvaluationSurface, type EvaluationTabView } from "@/lib/evaluation/read";
import { sulitGate } from "@/app/_auth/sulit";
import { estimateCustodyForHistory } from "@/lib/opening/read";
import { mapSulit } from "@/lib/auth/sulit-access";
import { db } from "@/lib/db";
import { SulitWithheld } from "@/components/ui/badge";
import { fieldsOfScope } from "@/lib/sulit-fields";
import type { StaffActor } from "@/lib/auth/types";

import { AppointMemberDrawer, IssueReportDrawer, LogCommunicationDrawer, OpenMeetingDrawer, ProposalSignerDrawer, RecommendDrawer, RenderProposalDrawer, RequestNegotiationDrawer, ShortlistDrawer, StartEvaluationDrawer, SubmitStageDrawer } from "./editors";
import { AspectsList, BiddersList, CommunicationsList, MeetingsList, NegotiationsList, RankingList, StageList } from "./lists";

/// The sections of the exercise's Evaluation tab, in order (plan §5). The strip is the shared Tabs' second level.
export const EVALUATION_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "stages", label: "Stages" },
  { id: "aspects", label: "Aspects" },
  { id: "meetings", label: "Meetings and letters" },
  { id: "recommendation", label: "Recommendation" },
  { id: "report", label: "Report" },
] as const;
export type EvaluationSectionId = (typeof EVALUATION_SECTIONS)[number]["id"];
export const evaluationSectionOf = (v: string | undefined): EvaluationSectionId => EVALUATION_SECTIONS.find((s) => s.id === v)?.id ?? "overview";

export interface EvaluationTabPanel {
  panel: ReactNode;
  actions: ReactNode;
  notes: [string, string][];
}


function Statement() {
  return (
    <Callout tone="info" title={EVALUATION_STATEMENT.title}>
      {EVALUATION_STATEMENT.body}
    </Callout>
  );
}

/**
 * The Evaluation tab (6.8 plan §5): read one section at a time, only while it is the tab looked at.
 * Before the opening is finalised it says where the evaluation opens; an exercise published before
 * models existed says it is never evaluated here and names the exit.
 */
export async function loadEvaluationTab(actor: StaffActor, exerciseId: string, section: EvaluationSectionId): Promise<EvaluationTabPanel> {
  const ex = await db.sourcingExercise.findFirst({ where: { id: exerciseId, organisationId: actor.organisationId }, select: { reference: true } });
  // FR-EVL-014: the evaluation is one record read by its team and those named on the exercise, and by whoever the organisation has chosen. One answer, logged, for the
  // whole version; nothing the figures could be read from is built for a reader it is refused to.
  const gate = await sulitGate(actor, { scope: "evaluation", id: exerciseId, label: ex?.reference ?? "" }, fieldsOfScope("evaluation"));
  const v = await evaluationTabView(actor.organisationId, exerciseId, {
    evaluation: gate,
    // The saving and the estimate are the company estimate's own: judged by its custody (FR-EST-008), through the one logged access.
    estimate: async () => mapSulit(await estimateCustodyForHistory(actor, exerciseId), () => true as const),
    // FR-EVL-020: a bidder's name on an anonymised technical scoring stage is a read of its own, logged as the reveal it is.
    identity: () => sulitGate(actor, { scope: "evaluation", id: exerciseId, label: ex?.reference ?? "" }, ["bidderIdentity"]),
  });
  if (!v) return { panel: <Card><EmptyState title="This exercise could not be found">Its organisation may no longer be configured.</EmptyState></Card>, actions: null, notes: [] };
  const h = v.header;
  if (!h.applies) {
    return { actions: null, notes: [], panel: <Card><EmptyState title="Not evaluated here">An exercise is evaluated in the portal once it was published through its invitation window with tender or quotation documents. This one was not.</EmptyState></Card> };
  }
  if (h.neverPinned) {
    return { actions: null, notes: [], panel: <div className="flex flex-col gap-6"><Statement /><Card><EmptyState title="Published before evaluation models existed">It has no pinned model, and none is pinned later. To evaluate it here, cancel it from its Invitation tab and publish a replacement.</EmptyState></Card></div> };
  }
  const startNote: [string, string][] = h.start && !h.start.allowed.allowed ? [["Start the evaluation", h.start.allowed.reason]] : [];
  const actions = h.start ? <StartEvaluationDrawer exerciseId={exerciseId} allowed={h.start.allowed} people={h.people} carried={h.start.carried} /> : null;
  if (!v.current) {
    return {
      actions,
      notes: startNote,
      panel: (
        <div className="flex flex-col gap-6">
          <Statement />
          <ModelCard v={v} />
          <Card>
            <EmptyState title="Not started" action={<ButtonLink href={`/sourcing/${exerciseId}?tab=bids&section=schedule`} variant="secondary" size="sm">Open the schedule</ButtonLink>}>
              {h.start?.allowed.allowed ? "The opening's schedule is finalised: start the evaluation from the header." : `Evaluation opens when the opening's schedule is finalised. ${h.start && !h.start.allowed.allowed ? h.start.allowed.reason : ""}`}
            </EmptyState>
          </Card>
        </div>
      ),
    };
  }
  const c = openDetail(v.current);
  // Refused: the surface of the version is shown (its state, its team, the report's reference) and the evaluation's content is not, with the reason in words.
  if (!c) {
    const d = v.current.detail;
    return { actions: null, notes: [], panel: <div className="flex flex-col gap-6"><Statement /><Withheld v={v} s={v.current} words={d.state === "WITHHELD" ? d.words.en : ""} /></div> };
  }
  const body = section === "overview" ? <Overview v={v} c={c} /> : section === "stages" ? <Stages v={v} c={c} /> : section === "aspects" ? <Aspects v={v} c={c} /> : section === "meetings" ? <Meetings v={v} c={c} /> : section === "recommendation" ? <Recommendation v={v} c={c} /> : <Report v={v} c={c} />;
  return { actions, notes: startNote, panel: <div className="flex flex-col gap-6"><Statement />{body}</div> };
}

/// The evaluation as a reader it is withheld from sees it: where it stands and who is on the team, and in place of the bids, scores, prices and letters the lock with
/// the reason. No count of bids, no ranking and no name of a bidder is given: those are read from the evaluation.
function Withheld({ v, s, words }: { v: EvaluationTabView; s: EvaluationSurface; words: string }) {
  return (
    <>
      <ModelCard v={v} />
      <Card>
        <CardHeader title={`Version ${s.version}`} subtitle={s.open ? "In progress." : s.state} actions={<Badge tone={s.open ? "brand" : "ok"}>{s.state}</Badge>} />
        <CardBody>
          <KeyValues columns={2} items={s.team.map((t) => ({ label: t.label, value: t.members.length ? t.members.map((m) => m.name).join("; ") : <Badge tone="warn">Nobody appointed</Badge> }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<ShieldIcon size={17} />} title="The evaluation" subtitle="Scores, prices, the ranking, what was said to a tenderer and the recommendation are SULIT." />
        <CardBody>
          <SulitWithheld words={words} compact />
          <p className="mt-2 text-[13px] text-ink-3">{words}</p>
          {s.report.issued && <p className="mt-2 text-[13px] text-ink-3">{`The report is issued as ${s.report.issued.reference}.`}</p>}
        </CardBody>
      </Card>
    </>
  );
}

function ModelCard({ v }: { v: EvaluationTabView }) {
  const m = v.header.model!;
  return (
    <Card>
      <CardHeader icon={<SlidersIcon size={17} />} title="The evaluation model" subtitle={m.pinnedAt ? `Pinned when the exercise was published, ${m.pinnedAt}: the evaluation runs from it as it stood then.` : "Pinned when the exercise was published."} actions={<Badge tone={v.header.phase.tone} dot>{v.header.phase.label}</Badge>} />
      <CardBody>
        <KeyValues columns={3} items={[{ label: "Model", value: m.name }, { label: "Route", value: m.route }, { label: "Stages", value: String(m.stages) }]} />
      </CardBody>
    </Card>
  );
}

function Overview({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  return (
    <>
      <ModelCard v={v} />
      <Card className="overflow-hidden">
        <CardHeader title={`Version ${c.version}`} subtitle={c.open ? "In progress: scores, inputs, meetings and the recommendation are recorded on this version." : c.state} actions={<Badge tone={c.open ? "brand" : "ok"}>{c.state}</Badge>} divided={v.header.versions.length <= 1} />
        {v.header.versions.length > 1 && (
          <CardBody className="border-t border-line">
            <ul className="flex flex-col gap-2 text-[13px]">
              {v.header.versions.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{`Version ${x.version}`}</span>
                  <Badge tone={x.tone}>{x.state}</Badge>
                  <span className="text-ink-3">{`${x.trigger}${x.loop ? `: ${x.loop.toLowerCase()}` : ""}, ${x.startedAt}, ${x.startedBy}${x.report ? ` · report ${x.report}` : ""}`}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>
      <Card>
        <CardHeader icon={<UsersIcon size={17} />} title="The team" subtitle="Appointed on both sides. Only a member appointed to a stage's side scores or submits it." actions={<AppointMemberDrawer exerciseId={v.exerciseId} allowed={c.act} people={v.header.people} />} />
        <CardBody>
          <KeyValues columns={2} items={c.team.map((t) => ({ label: t.label, value: t.members.length ? t.members.map((m) => `${m.name} (from ${m.appointedOn})`).join("; ") : <Badge tone="warn">Nobody appointed</Badge> }))} />
        </CardBody>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="The bids evaluated" subtitle={<span className="inline-flex flex-wrap items-center gap-2">Carried from the opening. A price is corrected only before the first stage is submitted. <SulitTag /></span>} />
        <BiddersList exerciseId={v.exerciseId} c={c} people={v.header.people} />
      </Card>
      {c.cprInputs &&
        c.bidders.filter((b) => !b.excluded).map((b) => (
          <OwnerAttachments key={b.id} owner={{ kind: "evaluationBidder", id: b.id }} only={["CPR_REPORT"]} title={`Contractor performance report, bid No. ${b.listingNo}`} subtitle="The percentage is entered from this report, not from a register. SULIT: downloadable to the people the evaluation is open to, and every download is logged." />
        ))}
    </>
  );
}

function Stages({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  return (
    <>
      {c.stages.map((s) => (
        <Card key={s.code} className="overflow-hidden">
          <CardHeader
            title={<span className="inline-flex flex-wrap items-center gap-2"><span>{`${s.order}. ${s.label}`}</span><Chip tone="info">{s.kindLabel}</Chip></span>}
            subtitle={[s.sideLabel, s.passMark ? `pass mark ${s.passMark}` : null, s.submitted ?? s.locked ?? (s.kind === "RECOMMENDATION" ? "Formed on the Recommendation section." : s.kind === "COMMITTEE_DECISION" ? "Each bid is tabled at a sitting of the committee, which decides it there." : "Open")].filter(Boolean).join(" · ")}
            actions={
              c.open && !s.submitted && !s.locked ? (
                s.kind === "SHORTLIST" ? (
                  <ShortlistDrawer exerciseId={v.exerciseId} stage={s} bidders={s.rows.filter((r) => r.inRunning).map((r) => ({ value: r.id, label: `No. ${r.listingNo}, ${r.bidder}` }))} people={v.header.people} />
                ) : s.kind === "COMMITTEE_DECISION" || s.kind === "RECOMMENDATION" ? undefined : (
                  <SubmitStageDrawer exerciseId={v.exerciseId} stage={s} notBanded={s.notBanded} pending={s.pending} people={v.header.people} />
                )
              ) : s.submitted ? <Badge tone="ok">Submitted</Badge> : undefined
            }
          />
          {s.kind !== "RECOMMENDATION" && <StageList exerciseId={v.exerciseId} s={s} open={c.open} sittings={c.sittings} people={v.header.people} />}
        </Card>
      ))}
    </>
  );
}

function Aspects({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  if (!c.aspects) return <Card><EmptyState title="No aspects stage">The pinned model assesses no aspects.</EmptyState></Card>;
  return (
    <Card className="overflow-hidden">
      <CardHeader title={c.aspects.stage} subtitle={c.aspects.submitted ? "Submitted: the verdicts stand." : "A verdict and a narrative for each bid in the running, on each aspect. Submitted on the Stages section."} />
      <AspectsList exerciseId={v.exerciseId} a={c.aspects} open={c.open} people={v.header.people} />
    </Card>
  );
}

function Meetings({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader title="Clarifications and negotiations" subtitle={<span className="inline-flex flex-wrap items-center gap-2">Each held, then closed on its minutes and the tenderer&apos;s written confirmation. <SulitTag /></span>} actions={c.open ? <OpenMeetingDrawer exerciseId={v.exerciseId} bidders={c.allBidders} people={v.header.people} allowed={c.recommendation.formed ? { allowed: false, reason: "The recommendation is formed: no meeting after it." } : c.act} /> : undefined} />
        <MeetingsList exerciseId={v.exerciseId} c={c} people={v.header.people} />
      </Card>
      {c.meetings.map((m) => (
        <OwnerAttachments key={m.id} owner={{ kind: "evaluationMeeting", id: m.id }} only={["TENDERER_CONFIRMATION", "MEETING_MINUTES"]} title={`${m.kind}, round ${m.round}, bid No. ${m.listingNo}: its papers`} subtitle="The tenderer's written confirmation is attached before the meeting is closed." collapseWhenEmpty={!!m.closed} />
      ))}
      <Card className="overflow-hidden">
        <CardHeader title="Negotiations asked for" subtitle="A negotiation is held only once its route is approved." actions={c.open ? <RequestNegotiationDrawer exerciseId={v.exerciseId} bidders={c.runningBidders} people={v.header.people} allowed={c.recommendation.formed ? { allowed: false, reason: "The recommendation is formed." } : c.act} /> : undefined} />
        <NegotiationsList exerciseId={v.exerciseId} c={c} people={v.header.people} today={v.header.today} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Letters, emails and faxes" subtitle={<span className="inline-flex flex-wrap items-center gap-2">Recorded, never sent from here. <SulitTag /></span>} actions={c.open ? <LogCommunicationDrawer exerciseId={v.exerciseId} bidders={c.allBidders} people={v.header.people} allowed={c.act} /> : undefined} />
        <CommunicationsList c={c} />
      </Card>
    </>
  );
}

function Recommendation({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  const r = c.recommendation;
  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader title="The bids in the running, ranked" subtitle={<span className="inline-flex flex-wrap items-center gap-2">{r.composite ? `By ${r.composite}, highest first; a tie by the lower price.` : "By evaluated price, lowest first."} <SulitTag /></span>} actions={c.open && !r.formed ? <RecommendDrawer exerciseId={v.exerciseId} bidders={r.ranked.map((x) => ({ value: x.id, label: `Rank ${x.rank}: No. ${x.listingNo}, ${x.bidder}` }))} topId={r.topId} allowed={r.form} people={v.header.people} /> : undefined} />
        {r.incomplete.length > 0 && <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3 sm:px-6">{`Still to complete: ${r.incomplete.join(", ")}.`}</p>}
        <RankingList c={c} />
      </Card>
      <Card>
        <CardHeader title="The recommendation" subtitle={<span className="inline-flex flex-wrap items-center gap-2">{r.formed ? `Formed ${r.formed.formedAt} · ${r.formed.formedActed}.` : "Not formed yet."} <SulitTag /></span>} />
        <CardBody>
          {r.formed ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Recommended tenderer", value: `No. ${r.formed.listingNo}, ${r.formed.bidder}` },
                { label: "Price", value: r.formed.recommendedPrice },
                { label: "Completion period", value: r.formed.period },
                { label: "Top-ranked", value: r.formed.topRanked ? "Yes" : "No" },
                ...(r.formed.justification ? [{ label: "Why this one", value: r.formed.justification }] : []),
                { label: "Saving against the company estimate", value: r.savingAmount == null ? "—" : typeof r.savingAmount === "string" ? r.savingAmount : <SulitValue of={r.savingAmount} /> },
              ]}
            />
          ) : (
            <p className="text-[13px] text-ink-3">{r.form.allowed ? "Every stage is complete: form it from the ranking's header." : r.form.reason}</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Report({ v, c }: { v: EvaluationTabView; c: EvaluationCurrent }) {
  const r = c.report;
  return (
    <>
      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="The evaluation report" subtitle={r.issued ? `Issued ${r.issued.issuedAt ?? ""}${r.issued.issuedBy ? ` by ${r.issued.issuedBy}` : ""}. Frozen: a later version supersedes it, nothing edits it.` : "Issued once, frozen, its reference drawn from the configured series."} actions={r.issued ? <ButtonLink href={`/sourcing/${v.exerciseId}/evaluation/report`} variant="secondary" size="sm">Print the report</ButtonLink> : c.open ? <IssueReportDrawer exerciseId={v.exerciseId} allowed={r.issue} people={v.header.people} /> : undefined} />
        <CardBody>
          {r.issued ? (
            <KeyValues columns={2} items={[{ label: "Reference", value: <span className="font-mono text-[13px]">{r.issued.reference}</span> }, { label: "Text", value: r.issued.template ?? "—" }, { label: "Annexes", value: r.issued.annexes.map((a) => `${a.key}. ${a.label}`).join("; ") }, ...(r.issued.stale ? [{ label: "Stands?", value: <Badge tone="err">No: a late tender was opened since</Badge> }] : [])]} />
          ) : (
            <p className="text-[13px] text-ink-3">{r.issue.allowed ? "Nothing holds it back: issue it from this card's header." : r.issue.reason}</p>
          )}
        </CardBody>
      </Card>
      {r.issued && (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Kertas Cadangan" subtitle={r.proposal ? `Produced and frozen ${r.proposal.frozenAt}.` : "Produced from the issued report through the configured template, then checked and recommended by the two offices' holders."} actions={r.proposal ? <ButtonLink href={`/sourcing/${v.exerciseId}/evaluation/proposal`} variant="secondary" size="sm">Print the paper</ButtonLink> : <RenderProposalDrawer exerciseId={v.exerciseId} allowed={r.render} people={v.header.people} />} />
          {r.proposal && (
            <CardBody className="flex flex-col gap-4">
              <KeyValues
                columns={2}
                items={[
                  { label: `Checked by (${r.proposal.checker ?? "the checking office"})`, value: r.proposal.checkedBy ?? (r.sign.allowed ? <ProposalSignerDrawer exerciseId={v.exerciseId} role="CHECKER" office={r.proposal.checker ?? "the checking office"} people={v.header.people} today={v.header.today} /> : "Not recorded") },
                  { label: `Recommended by (${r.proposal.recommender ?? "the recommending office"})`, value: r.proposal.recommendedBy ?? (r.sign.allowed ? <ProposalSignerDrawer exerciseId={v.exerciseId} role="RECOMMENDER" office={r.proposal.recommender ?? "the recommending office"} people={v.header.people} today={v.header.today} /> : "Not recorded") },
                ]}
              />
            </CardBody>
          )}
        </Card>
      )}
      <OwnerAttachments owner={{ kind: "evaluation", id: c.id }} title="The evaluation's documents" subtitle="The signed report and paper, and the drawings annex F lists. SULIT: downloadable to the people the evaluation is open to, and every download is logged." />
    </>
  );
}
