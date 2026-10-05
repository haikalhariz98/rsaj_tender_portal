"use client";

import { DataList, type Row } from "@/components/data-list";
import type { EvaluationCurrent, StageView } from "@/lib/evaluation/read";

import { AssessDrawer, CloseMeetingDrawer, CorrectPriceDrawer, InputsDrawer, NegotiationDecisionDrawer, ScoreDrawer, TableStageOneDrawer } from "./editors";

/**
 * The Evaluation tab's lists, on the shared DataList (6.8 plan §5). A row's acts open drawers, so the
 * lists are client components; the acts sit on the line under the row. Every figure is SULIT (E-3):
 * its column is flagged, which labels it and removes the list's export. The bidder's column keeps at
 * least its width and the list scrolls in its card rather than squeezing it; the lists stack below
 * 2xl, where their columns need more than a laptop's card beside the sidebar (6.7 review S-1).
 */

type Option = { value: string; label: string };
const STAGE_ONE: Record<string, string> = { CARRIED: "Carried by the committee", NOT_CARRIED: "Not carried by the committee", PENDING: "With the committee", DEFERRED: "Deferred by the committee", NOT_TABLED: "Not tabled yet" };

export function BiddersList({ exerciseId, c, people }: { exerciseId: string; c: EvaluationCurrent; people: Option[] }) {
  const byId = new Map(c.bidders.map((b) => [b.id, b]));
  const rows: Row[] = c.bidders.map((b) => ({
    id: b.id,
    search: `${b.listingNo} ${b.bidder} ${b.registrationNo}`,
    sortKeys: { bid: b.listingNo },
    note: [b.excluded, b.carried ? "Carried from the version before: its scores are labelled so." : null].filter(Boolean).join(" ") || undefined,
    cells: {
      bid: { kind: "stack", title: `No. ${b.listingNo}`, sub: b.registrationNo },
      bidder: { kind: "stack", title: b.bidder, sub: b.period },
      evaluatedPrice: { kind: "stack", title: b.evaluatedPrice, sub: b.corrected ? `Corrected; ${b.asRead} as read` : "As read" },
      running: { kind: "chip", text: b.running, tone: b.runningTone },
      // S-2: an excluded bid takes no inputs, and the column says so; where none is taken now, it says why.
      inputs: b.excluded
        ? { kind: "stack", title: "None: an excluded bid takes no inputs" }
        : { kind: "stack", title: [b.factor, b.cprPercent ? `CPR ${b.cprPercent}` : null].filter(Boolean).join(" · ") || "None recorded", sub: [b.monthlyBalances, c.open && !b.inputs.allowed ? b.inputs.reason : null].filter(Boolean).join(" · ") || undefined },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-bidders"
      emptyTitle="No bid"
      emptyBody="No bid was carried to evaluation."
      actionsPlacement="below"
      columns={[
        { key: "bid", label: "Bid", width: "120px", sortable: true, mobile: "primary" },
        { key: "bidder", label: "Bidder", minWidth: "200px", mobile: "meta" },
        { key: "evaluatedPrice", label: "Evaluated price", width: "200px", sulit: true, mobile: "meta" },
        { key: "running", label: "Status", width: "220px", mobile: "meta" },
        ...(c.capitalInputs || c.cprInputs ? [{ key: "inputs", label: "Inputs", width: "220px", mobile: "meta" as const }] : []),
      ]}
      rows={rows}
      actions={(id) => {
        const b = byId.get(id)!;
        if (!c.open) return null;
        return (
          <>
            {c.correct.allowed && <CorrectPriceDrawer exerciseId={exerciseId} bidder={b} people={people} />}
            {(c.capitalInputs || c.cprInputs) && b.inputs.allowed && <InputsDrawer exerciseId={exerciseId} bidder={b} factors={c.factors} capital={c.capitalInputs} cpr={c.cprInputs} people={people} />}
          </>
        );
      }}
    />
  );
}

export function StageList({ exerciseId, s, open, sittings, people }: { exerciseId: string; s: StageView; open: boolean; sittings: (Option & { committeeCode: string })[]; people: Option[] }) {
  const byId = new Map(s.rows.map((r) => [r.id, r]));
  const committee = s.kind === "COMMITTEE_DECISION";
  const rows: Row[] = s.rows.map((r) => ({
    id: r.id,
    search: `${r.listingNo} ${r.bidder}`,
    sortKeys: { bid: r.listingNo },
    note: [r.scoreRows.length ? r.scoreRows.map((x) => `${x.label}: ${x.value ?? "not scored"}${x.by ? ` (${x.by}${x.carried ? ", carried" : ""})` : ""}`).join(" · ") : null, r.notYet ? `Not judged yet: ${r.notYet}` : null].filter(Boolean).join(" ") || undefined,
    cells: {
      bid: { kind: "stack", title: `No. ${r.listingNo}`, sub: r.bidder },
      running: { kind: "chip", text: committee ? STAGE_ONE[r.stageOne ?? "NOT_TABLED"] : r.running, tone: committee ? (r.stageOne === "CARRIED" ? "ok" : r.stageOne === "NOT_CARRIED" ? "err" : "warn") : r.inRunning ? "ok" : "err" },
      stageFigure: { kind: "text", text: r.stageFigure ?? "—", dim: !r.stageFigure },
      outcome: { kind: "chips", items: [...(r.outcome ? [{ text: r.outcome, tone: r.notYet ? ("warn" as const) : r.outcome === "Passes" ? ("ok" as const) : ("err" as const) }] : []), ...(r.band ? [{ text: r.band, tone: "info" as const }] : []), ...(r.shortlisted != null ? [{ text: r.shortlisted ? "Shortlisted" : "Not shortlisted", tone: r.shortlisted ? ("ok" as const) : ("err" as const) }] : []), ...(r.out ? [{ text: "Out of the running", tone: "err" as const }] : [])] },
    },
  }));
  const scorable = open && !s.submitted && !s.locked && s.criteria.length > 0;
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-stage"
      emptyTitle="No bid"
      actionsPlacement="below"
      columns={[
        { key: "bid", label: "Bid", minWidth: "200px", sortable: true, mobile: "primary" },
        { key: "running", label: committee ? "The committee" : "Status", width: "220px", mobile: "meta" },
        ...(s.hasFigure ? [{ key: "stageFigure", label: "Figure", width: "120px", numeric: true, sulit: true, mobile: "meta" as const }] : []),
        { key: "outcome", label: "Result", width: "240px", sulit: true, mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const r = byId.get(id)!;
        // R-2: a deferred matter is tabled again, at any open sitting of its committee (stageOneTablingFaults allows it).
        if (committee && open && (r.stageOne === "NOT_TABLED" || r.stageOne === "DEFERRED")) return <TableStageOneDrawer exerciseId={exerciseId} bidder={r} sittings={sittings.filter((x) => x.committeeCode === s.committee)} people={people} again={r.stageOne === "DEFERRED"} />;
        if (scorable && r.inRunning) return <ScoreDrawer exerciseId={exerciseId} stage={s} bidder={r} criteria={s.criteria} people={people} />;
        return null;
      }}
    />
  );
}

export function AspectsList({ exerciseId, a, open, people }: { exerciseId: string; a: NonNullable<EvaluationCurrent["aspects"]>; open: boolean; people: Option[] }) {
  const byId = new Map(a.bidders.map((b) => [b.id, b]));
  const rows: Row[] = a.bidders.map((b) => ({
    id: b.id,
    search: `${b.listingNo} ${b.bidder}`,
    sortKeys: { bid: b.listingNo },
    note: b.verdicts.filter((v) => v.narrative).map((v) => `${v.label}: ${v.narrative}`).join(" · ") || undefined,
    cells: {
      bid: { kind: "stack", title: `No. ${b.listingNo}`, sub: b.bidder },
      verdicts: { kind: "chips", items: b.verdicts.map((v) => ({ text: `${v.label}: ${v.verdict ?? "not assessed"}`, tone: v.tone ?? "warn" })) },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-aspects"
      emptyTitle="No bid"
      actionsPlacement="below"
      columns={[
        { key: "bid", label: "Bid", minWidth: "200px", sortable: true, mobile: "primary" },
        { key: "verdicts", label: "Verdicts", width: "520px", sulit: true, mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const b = byId.get(id)!;
        if (!open || a.submitted || !b.inRunning) return null;
        return (
          <>
            {b.verdicts.map((v) => (
              <AssessDrawer key={v.code} exerciseId={exerciseId} bidder={b} aspect={{ code: v.code, label: v.label }} suggestion={v.suggestion} people={people} />
            ))}
          </>
        );
      }}
    />
  );
}

export function MeetingsList({ exerciseId, c, people }: { exerciseId: string; c: EvaluationCurrent; people: Option[] }) {
  const byId = new Map(c.meetings.map((m) => [m.id, m]));
  const rows: Row[] = c.meetings.map((m) => ({
    id: m.id,
    search: `${m.listingNo} ${m.bidder} ${m.kind}`,
    note: [m.meetingMinutes ? `Minutes: ${m.meetingMinutes}` : null, m.closed ? null : m.confirmations ? "The tenderer's confirmation is attached." : "Attach the tenderer's written confirmation, then close it."].filter(Boolean).join(" ") || undefined,
    cells: {
      meeting: { kind: "stack", title: `${m.kind}, round ${m.round}`, sub: `No. ${m.listingNo}, ${m.bidder}` },
      held: { kind: "stack", title: m.heldOn, sub: m.place },
      state: { kind: "chip", text: m.closed ?? "Held, not closed", tone: m.closed ? "ok" : "warn" },
      priceAfterRound: { kind: "stack", title: m.priceAfterRound ?? "—", sub: m.priceBeforeRound ? `From ${m.priceBeforeRound}` : undefined },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-meetings"
      emptyTitle="No meeting"
      emptyBody="No clarification or negotiation is recorded."
      actionsPlacement="below"
      columns={[
        { key: "meeting", label: "Meeting", minWidth: "220px", mobile: "primary" },
        { key: "held", label: "Held", width: "200px", mobile: "meta" },
        { key: "state", label: "Status", width: "260px", mobile: "meta" },
        { key: "priceAfterRound", label: "Price after the round", width: "200px", sulit: true, mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const m = byId.get(id)!;
        return !m.closed && c.open ? <CloseMeetingDrawer exerciseId={exerciseId} meeting={{ id: m.id, label: `${m.kind.toLowerCase()} round ${m.round} with No. ${m.listingNo}`, isNegotiation: m.isNegotiation }} people={people} /> : null;
      }}
    />
  );
}

export function NegotiationsList({ exerciseId, c, people, today }: { exerciseId: string; c: EvaluationCurrent; people: Option[]; today: string | null }) {
  const byId = new Map(c.negotiations.map((n) => [n.id, n]));
  const rows: Row[] = c.negotiations.map((n) => ({
    id: n.id,
    search: `${n.listingNo} ${n.reason}`,
    note: `Why: ${n.reason} Route: ${n.steps.map((s) => `${s.office} (${s.decision === "DONE" ? "approved" : s.decision === "REJECTED" ? "refused" : "pending"})`).join(" → ")}`,
    cells: {
      bid: { kind: "stack", title: `Negotiation with No. ${n.listingNo}`, sub: `Asked by ${n.requestedBy}, ${n.requestedAt}` },
      state: { kind: "chip", text: n.statusLabel, tone: n.status === "APPROVED" ? "ok" : n.status === "PENDING" ? "warn" : "err" },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-negotiations"
      emptyTitle="No negotiation asked for"
      actionsPlacement="below"
      columns={[
        { key: "bid", label: "Negotiation", minWidth: "260px", mobile: "primary" },
        { key: "state", label: "Approval", width: "240px", mobile: "meta" },
      ]}
      rows={rows}
      actions={(id) => {
        const n = byId.get(id)!;
        const next = n.status === "PENDING" ? n.steps.find((s) => s.pending && !s.committee) : null;
        return next && c.open ? <NegotiationDecisionDrawer exerciseId={exerciseId} stepId={next.id} office={next.office} people={people} today={today} /> : null;
      }}
    />
  );
}

export function CommunicationsList({ c }: { c: EvaluationCurrent }) {
  const rows: Row[] = c.communications.map((m) => ({
    id: m.id,
    search: `${m.listingNo} ${m.subject}`,
    note: m.communicationContent,
    cells: {
      what: { kind: "stack", title: m.subject, sub: `No. ${m.listingNo} · ${m.direction}` },
      on: { kind: "stack", title: m.on, sub: m.channel },
      by: { kind: "person", name: m.recordedBy, sub: "Recorded on their behalf" },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-letters"
      emptyTitle="No letter recorded"
      columns={[
        { key: "what", label: "Communication", minWidth: "260px", sulit: true, mobile: "primary" },
        { key: "on", label: "On", width: "160px", mobile: "meta" },
        { key: "by", label: "Recorded by", width: "220px", mobile: "meta" },
      ]}
      rows={rows}
    />
  );
}

export function RankingList({ c }: { c: EvaluationCurrent }) {
  const r = c.recommendation;
  const rows: Row[] = r.ranked.map((x) => ({
    id: x.id,
    search: `${x.listingNo} ${x.bidder}`,
    sortKeys: { rank: x.rank },
    // Q1: a price above the quotation's ceiling is said before the recommendation is formed on it.
    note: x.ceiling ?? undefined,
    cells: {
      rank: { kind: "text", text: String(x.rank) },
      bid: { kind: "stack", title: `No. ${x.listingNo}, ${x.bidder}`, sub: x.period },
      compositeScore: { kind: "text", text: x.compositeScore ? `${x.compositeScore}%` : "—", dim: !x.compositeScore },
      recommendedPrice: { kind: "stack", title: x.recommendedPrice, sub: x.negotiated ? `After negotiation; ${x.evaluatedPrice} evaluated` : undefined },
    },
  }));
  return (
    <DataList
      flat
      selectable={false}
      searchable={false}
      toolbar={false}
      stackBelow="2xl"
      exportName="evaluation-ranking"
      emptyTitle="No bid in the running"
      emptyBody="No bid is in the running after the stages submitted."
      columns={[
        { key: "rank", label: "Rank", width: "80px", sortable: true, mobile: "meta" },
        { key: "bid", label: "Bid", minWidth: "220px", mobile: "primary" },
        ...(r.composite ? [{ key: "compositeScore", label: r.composite, width: "160px", numeric: true, sulit: true, mobile: "meta" as const }] : []),
        { key: "recommendedPrice", label: "Price", width: "220px", sulit: true, mobile: "meta" },
      ]}
      rows={rows}
    />
  );
}
