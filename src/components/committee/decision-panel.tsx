"use client";

import { ActWithLabel } from "@/components/ui/act";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardBody } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { Callout } from "@/components/ui/feedback";
import { assessDecision, type VoteChoice } from "@/lib/committee/quorum";
import { formatRM } from "@/lib/format";

interface Member {
  personId: string;
  name: string;
  position: string;
}

interface Vote {
  personId: string;
  choice: string;
  comment: string;
}

interface Decision {
  id: string;
  subject: string;
  matterRef: string | null;
  amount: number | null;
  act: string;
  outcome: string;
}

const CHOICES: { value: VoteChoice; label: string }[] = [
  { value: "SETUJU", label: "Setuju" },
  { value: "TIDAK_SETUJU", label: "Tidak Setuju" },
];

export function DecisionPanel({
  decision,
  quorum,
  present,
  members,
  votes,
}: {
  decision: Decision;
  quorum: number | null;
  present: number;
  members: Member[];
  votes: Vote[];
}) {
  const router = useRouter();
  const [pendingPerson, setPendingPerson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const byPerson = new Map(votes.map((v) => [v.personId, v]));

  // The same pure function the tests cover — the screen never re-derives the rule.
  const readiness = assessDecision({
    act: decision.act,
    quorum,
    present,
    entitledCount: members.length,
    votes: votes
      .filter((v) => v.choice !== "ABSTAIN" || true)
      .map((v) => ({ choice: v.choice as VoteChoice })),
  });

  async function cast(personId: string, choice: VoteChoice) {
    setPendingPerson(personId);
    setError(null);
    try {
      const res = await fetch(`/api/committees/decisions/${decision.id}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, choice }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the vote");
    } finally {
      setPendingPerson(null);
    }
  }

  return (
    <CardBody className="border-t border-line/70">
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <ActWithLabel act={decision.act} />
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
          {decision.subject}
        </span>
        {decision.amount != null && (
          <span className="text-[13.5px] font-semibold text-ink tabular-nums">
            {formatRM(decision.amount)}
          </span>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
        {decision.matterRef && <span className="font-mono">{decision.matterRef}</span>}
        {readiness.mandatory && (
          <>
            {decision.matterRef && <span aria-hidden="true">·</span>}
            <Badge tone="warn">non-delegable</Badge>
          </>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-[13px] text-ink-3">
          No members are appointed, so no vote can be recorded.
        </p>
      ) : (
        <div>
          <ul className="divide-y divide-line/70 rounded-2xl border border-line">
            {members.map((member) => {
              const vote = byPerson.get(member.personId);
              const busy = pendingPerson === member.personId;
              return (
                <li className="flex flex-wrap items-center gap-3 px-4 py-2.5" key={member.personId}>
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={member.name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-semibold text-ink" title={member.name}>
                        {member.name}
                      </span>
                      <span className="truncate text-[12px] text-ink-3" title={member.position}>
                        {member.position}
                      </span>
                    </span>
                  </span>

                  {vote?.comment && (
                    <span
                      className="min-w-0 flex-1 truncate text-[12px] text-ink-3"
                      title={vote.comment}
                    >
                      “{vote.comment}”
                    </span>
                  )}

                  <span className="inline-flex shrink-0 rounded-full border border-line-2 bg-surface p-0.5">
                    {CHOICES.map((choice) => {
                      const pressed = vote?.choice === choice.value;
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          className={cx(
                            "h-7 rounded-full px-3 text-[12.5px] font-semibold transition",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                            "disabled:cursor-not-allowed disabled:opacity-45",
                            pressed
                              ? choice.value === "SETUJU"
                                ? "bg-emerald-600 text-white"
                                : "bg-rose-600 text-white"
                              : "text-ink-2 hover:bg-ink/5 hover:text-ink",
                          )}
                          data-v={choice.value === "SETUJU" ? "SETUJU" : "TIDAK SETUJU"}
                          aria-pressed={pressed}
                          disabled={busy}
                          onClick={() => cast(member.personId, choice.value)}
                        >
                          {choice.label}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex flex-wrap items-center gap-3">
              <span className="inline-flex flex-wrap gap-1">
                {Array.from({ length: Math.max(members.length, quorum ?? 0) }, (_, i) => (
                  <span
                    key={i}
                    className={cx(
                      "size-2.5 rounded-full",
                      i < present
                        ? "bg-emerald-500"
                        : i < (quorum ?? 0)
                          ? "bg-amber-400"
                          : "bg-ink/10",
                    )}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <span className="text-[12px] text-ink-3">{readiness.quorum.messageEn}</span>
            </span>

            <span className="flex-1" />

            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone="ok">{readiness.tally.setuju} setuju</Badge>
              <Badge tone="err">{readiness.tally.tidakSetuju} tidak setuju</Badge>
              {readiness.tally.notVoted > 0 && (
                <Badge>{readiness.tally.notVoted} outstanding</Badge>
              )}
            </span>
          </div>

          <div className="mt-3">
            {readiness.canRecord ? (
              <Callout tone={readiness.tally.carried ? "ok" : "err"}>{readiness.messageEn}</Callout>
            ) : (
              <Callout tone="warn">{readiness.messageEn}</Callout>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-medium text-rose-600">
              {error}
            </p>
          )}
        </div>
      )}
    </CardBody>
  );
}
