"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { useActorPersonId } from "@/components/auth/actor-context";
import { ActWithLabel } from "@/components/ui/act";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardBody } from "@/components/ui/card";
import { Callout, ToneNote } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { KeyValues } from "@/components/ui/stat";
import { Toggle } from "@/components/ui/toggle";
import { VOTE_LABEL } from "@/lib/committee/labels";
import type { Sulit } from "@/lib/auth/sulit-access";
import { formatDate } from "@/lib/format";

/**
 * One matter at a sitting: who may vote on it, how each voted, and whether it may be
 * decided.
 *
 * Everything it shows is computed on the server by the same pure functions the votes
 * route enforces; this component re-derives nothing. A vote is posted to the route
 * with the date on the member's signed sheet, which is entered, never assumed.
 */

export interface PanelVoter {
  personId: string;
  name: string;
  /// The seat they sit in, as it reads — "Chairman · Chief Executive".
  seat: string;
  standIn: boolean;
  recused: boolean;
  /// Present, but the seat does not vote on this matter (its holder recused).
  excused?: boolean;
}

export interface PanelVote {
  personId: string;
  /// How the vote was recorded, in words, read from its attribution: the member's own, or recorded for them from their signed sheet.
  acted: string;
  choice: "SETUJU" | "TIDAK_SETUJU" | "ABSTAIN";
  comment: string;
  votedAt: string;
}

export interface PanelMatter {
  id: string;
  subject: string;
  matterLabel: string;
  /// The kind of record, by label. Null for a manual matter.
  kindLabel: string | null;
  matterRef: string | null;
  /// Where the linked record opens, when the matter names one on record.
  matterHref?: string | null;
  /// What of the record the matter concerns, in words, after its reference (a scope
  /// matter's bill version). Null where the reference says it all.
  recordNote?: string | null;
  /// The matter's amount, formatted on the server: `text` where it is not SULIT, `sulit` (a `Sulit<string>`, judged for the reader and carrying no figure when withheld) where it is. Null: no amount.
  amount: { text: string; sulit?: undefined } | { sulit: Sulit<string>; text?: undefined } | null;
  act: string;
  mandatory: boolean;
  outcome: "PENDING" | "CARRIED" | "NOT_CARRIED" | "DEFERRED";
  outcomeLabel: string;
  /// Who tabled it, in words, read from its attribution ("Tabled by A"), or null where it is not tabled.
  tabledBy: string | null;
  tabledAt: Date | null;
  dependsOn: { subject: string; outcomeLabel: string } | null;
  recusals: { name: string; reason: string }[];
  voters: PanelVoter[];
  votes: PanelVote[];
  canRecord: boolean;
  blockers: string[];
  /// One sentence where the committee's configuration is what stops the matter.
  gapLine: string | null;
  messageEn: string;
  quorumMessage: string;
  tally: { setuju: number; tidakSetuju: number; notVoted: number };
  /// False while the sitting has not started: no register yet, so no quorum count,
  /// no tally and no shortfall are shown.
  registerTaken: boolean;
  /// Votes on record that do not count, with why. Shown so INELIGIBLE_VOTE never
  /// blocks invisibly.
  ineligibleVotes: { name: string; why: string }[];
  decided: {
    dateLabel: string;
    date: Date | null;
    quorum: string;
    present: string;
    rule: string;
    note: string;
    notApproved: string | null;
    /// What became of the not-approved memo when the matter was decided (FR-CTE-009), in words; null for an outcome that has none.
    memo: { short: string; text: string; tone: "ok" | "warn" | "neutral" } | null;
  } | null;
}

const CHOICES = [
  { value: "SETUJU", label: VOTE_LABEL.SETUJU.en, tone: "ok" },
  { value: "TIDAK_SETUJU", label: VOTE_LABEL.TIDAK_SETUJU.en, tone: "err" },
] as const;

const OUTCOME_TONE = { PENDING: "warn", CARRIED: "ok", NOT_CARRIED: "err", DEFERRED: "neutral" } as const;

export function DecisionPanel({
  matter,
  open,
  meetingDate,
  today,
  actions,
  notice,
}: {
  matter: PanelMatter;
  /// True while votes may still be recorded: the sitting is in progress and the
  /// matter is undecided.
  open: boolean;
  meetingDate: string;
  /// Today in the organisation's zone: the latest date a sheet can bear. Null while
  /// no zone is set, when no vote can be recorded.
  today: string | null;
  /// Controls composed by the page: record outcome, declare recusal.
  actions?: ReactNode;
  /// A callout composed by the page, for a blocker that points somewhere else.
  notice?: ReactNode;
}) {
  const byPerson = new Map(matter.votes.map((v) => [v.personId, v]));

  return (
    <CardBody className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <ActWithLabel act={matter.act} />
        <span className="min-w-0 basis-full text-[14px] font-semibold text-ink sm:basis-auto sm:flex-1">
          {matter.subject}
        </span>
        {matter.amount != null && (
          // A requisition's gate matter carries its department estimate, which is SULIT: the kind of matter says whose figure the amount is, and the server has judged it.
          <span className="text-[13.5px] font-semibold text-ink">{matter.amount.sulit ? <SulitValue of={matter.amount.sulit} /> : matter.amount.text}</span>
        )}
        <Badge tone={OUTCOME_TONE[matter.outcome]} dot>
          {matter.outcomeLabel}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
        <span>{matter.matterLabel}</span>
        <span aria-hidden="true">·</span>
        {matter.kindLabel ? (
          <span>
            {matter.kindLabel}{" "}
            {matter.matterRef &&
              (matter.matterHref ? (
                <Link href={matter.matterHref} className="font-mono text-[12px] text-brand-700 underline decoration-brand-700/35 underline-offset-2 hover:decoration-current">
                  {matter.matterRef}
                </Link>
              ) : (
                <span className="font-mono text-[12px]">{matter.matterRef}</span>
              ))}
            {matter.recordNote ? `, ${matter.recordNote}` : ""}
          </span>
        ) : (
          <span>Not linked to a record{matter.matterRef ? ` · ${matter.matterRef}` : ""}</span>
        )}
        {matter.mandatory && <Badge tone="warn">Full voting body required</Badge>}
        {matter.recusals.map((r) => (
          <Chip key={r.name} tone="warn" title={r.reason}>
            {r.name} recused
          </Chip>
        ))}
      </div>

      <div className="text-[12.5px] text-ink-3">
        {matter.tabledBy ? (
          <>
            <span className="font-semibold text-ink-2">{matter.tabledBy}</span>
            {matter.tabledAt && <> on {formatDate(matter.tabledAt)}</>}
          </>
        ) : (
          "Not tabled"
        )}
        {matter.dependsOn && (
          <>
            {" "}
            · waits on “{matter.dependsOn.subject}” ({matter.dependsOn.outcomeLabel.toLowerCase()})
          </>
        )}
      </div>

      {!matter.registerTaken ? null : matter.voters.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          No voting member is recorded as present, so no vote can be recorded.
        </p>
      ) : (
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {matter.voters.map((voter) => (
            <VoterRow
              key={voter.personId}
              matterId={matter.id}
              voter={voter}
              vote={byPerson.get(voter.personId)}
              open={open && today != null && !voter.recused && !voter.excused}
              meetingDate={meetingDate}
              today={today}
            />
          ))}
        </ul>
      )}

      {/* While configuration makes the matter undecidable, a tally reads as progress
          toward a result the body cannot reach: one sentence instead. */}
      {matter.registerTaken && (!matter.gapLine || matter.decided) ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] text-ink-3">{matter.quorumMessage}</span>
          <span className="flex-1" />
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="ok">
              {matter.tally.setuju} {VOTE_LABEL.SETUJU.en.toLowerCase()}
            </Badge>
            <Badge tone="err">
              {matter.tally.tidakSetuju} {VOTE_LABEL.TIDAK_SETUJU.en.toLowerCase()}
            </Badge>
            {matter.tally.notVoted > 0 && <Badge>{matter.tally.notVoted} outstanding</Badge>}
          </span>
        </div>
      ) : null}

      {matter.ineligibleVotes.length > 0 && (
        <Callout tone="err" title="A vote on record does not count on this matter">
          {matter.ineligibleVotes.map((v) => (
            <span key={v.name} className="block">
              {v.name}: {v.why}.
            </span>
          ))}
        </Callout>
      )}

      {matter.decided ? (
        <KeyValues
          columns={2}
          items={[
            { label: matter.decided.dateLabel, value: matter.decided.date ? formatDate(matter.decided.date) : "—" },
            { label: "Voting rule", value: matter.decided.rule },
            { label: "Quorum at recording", value: matter.decided.quorum },
            { label: "Quorum judged on", value: matter.decided.present },
            ...(matter.decided.notApproved
              ? [
                  { label: "Next step", value: matter.decided.notApproved },
                  ...(matter.decided.memo
                    ? [
                        {
                          label: "Not-approved memo",
                          value: (
                            <span className="flex flex-col items-start gap-1">
                              <Badge tone={matter.decided.memo.tone}>{matter.decided.memo.short}</Badge>
                              <span className="text-[12.5px] text-ink-3">{matter.decided.memo.text}</span>
                            </span>
                          ),
                        },
                      ]
                    : []),
                ]
              : []),
            ...(matter.decided.note ? [{ label: "Note", value: matter.decided.note }] : []),
          ]}
        />
      ) : matter.canRecord ? (
        <Callout tone="ok">{matter.messageEn}</Callout>
      ) : matter.gapLine ? (
        <p className="text-[13px] font-medium text-amber-800">{matter.gapLine}</p>
      ) : (
        <ToneNote tone={matter.registerTaken ? "warn" : "info"}>
          {matter.messageEn}
          {matter.blockers.length > 1 && (
            <span className="mt-1 block text-[12.5px]">Also: {matter.blockers.slice(1).join(", ").toLowerCase()}.</span>
          )}
        </ToneNote>
      )}

      {notice}
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </CardBody>
  );
}

function VoterRow({
  matterId,
  voter,
  vote,
  open,
  meetingDate,
  today,
}: {
  matterId: string;
  voter: PanelVoter;
  vote: PanelVote | undefined;
  open: boolean;
  meetingDate: string;
  today: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [votedAt, setVotedAt] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // The vote is the signed-in member's own. Another member's, from their signed sheet, is recorded for them by the Secretariat (Phase 2b, F1): the sheet's day
  // is the reason it is recorded, and the vote reads as recorded on their behalf, not signed.
  const me = useActorPersonId();
  const forAnother = me != null && voter.personId !== me;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/committees/decisions/${matterId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, comment, votedAt, ...(forAnother ? { onBehalfOf: voter.personId, reason: `Recorded from the member's signed voting sheet dated ${votedAt}.` } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `The vote was not recorded (${res.status}).`);
        return;
      }
      setChoice(null);
      setVotedAt("");
      setComment("");
      router.refresh();
    });
  };

  const shown = choice ?? vote?.choice ?? null;

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-48 flex-1 items-center gap-3">
          <Avatar name={voter.name} />
          <span className="flex min-w-0 flex-col">
            <span className="break-words text-[13.5px] font-semibold text-ink" title={voter.name}>
              {voter.name}
            </span>
            <span className="break-words text-[12px] text-ink-3" title={voter.seat}>
              {voter.seat}

            </span>
          </span>
        </span>

        {voter.recused ? (
          <Badge tone="warn">Recused — not counted</Badge>
        ) : voter.excused ? (
          <Badge tone="warn">Seat does not vote: its holder recused</Badge>
        ) : (
          <>
            {vote && (
              <span className="min-w-0 text-[12px] break-words text-ink-3">
                {vote.acted} · sheet dated {formatDate(vote.votedAt)}
                {vote.comment && <> · “{vote.comment}”</>}
              </span>
            )}
            {/* Founder, 2026-10-05: English only on the buttons. */}
            <Toggle
              label={`Vote of ${voter.name}`}
              options={CHOICES}
              value={shown as (typeof CHOICES)[number]["value"] | null}
              onChange={setChoice}
              disabled={!open || busy}
            />
          </>
        )}
      </div>

      {open && choice && (
        <div className="flex flex-wrap items-end gap-2 pl-11">
          <Field label="Date on the signed sheet" htmlFor={`${uid}-date`}>
            <Input
              id={`${uid}-date`}
              type="date"
              size="sm"
              min={meetingDate}
              max={today ?? undefined}
              value={votedAt}
              onChange={(e) => setVotedAt(e.target.value)}
              required
            />
          </Field>
          <Field label="Comment" htmlFor={`${uid}-comment`} className="min-w-48 flex-1">
            <Input id={`${uid}-comment`} size="sm" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <Button variant="primary" size="sm" disabled={busy || !votedAt} onClick={save}>
            {busy ? "Saving…" : "Save vote"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setChoice(null)}>
            Cancel
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="pl-11 text-[12.5px] font-medium text-rose-600">
          {error}
        </p>
      )}
    </li>
  );
}
