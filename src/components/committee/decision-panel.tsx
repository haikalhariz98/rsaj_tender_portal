"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AlertTriangle } from "@/components/icons";
import { assessDecision, type VoteChoice } from "@/lib/committee/quorum";
import { avatarTone, formatRM, initials } from "@/lib/format";

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

const ACT_LABEL: Record<string, string> = {
  R: "Recommendation",
  JR: "Joint recommendation",
  MR: "Mandatory recommendation",
  MJR: "Mandatory joint recommendation",
  A: "Approval",
  MA: "Mandatory approval",
};

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
    <div className="card__body" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="row wrap" style={{ gap: 10, marginBottom: 4 }}>
        <span className={`chain__act chain__act--${decision.act}`} title={ACT_LABEL[decision.act]}>
          {ACT_LABEL[decision.act] ?? decision.act}
        </span>
        <span className="sm strong grow">{decision.subject}</span>
        {decision.amount != null && (
          <span className="sm strong num">{formatRM(decision.amount)}</span>
        )}
      </div>
      <div className="row wrap xs dim" style={{ gap: 8, marginBottom: 16 }}>
        {decision.matterRef && <span className="mono">{decision.matterRef}</span>}
        {readiness.mandatory && (
          <>
            {decision.matterRef && <span className="sep">·</span>}
            <span className="chain__nd">non-delegable</span>
          </>
        )}
      </div>

      {members.length === 0 ? (
        <p className="sm dim">No members are appointed, so no vote can be recorded.</p>
      ) : (
        <div className="vote">
          {members.map((member) => {
            const vote = byPerson.get(member.personId);
            const busy = pendingPerson === member.personId;
            return (
              <div className="vote__row" key={member.personId}>
                <span className="vote__who">
                  <span className={`avatar avatar--sm ${avatarTone(member.personId)}`}>
                    {initials(member.name)}
                  </span>
                  <span className="col">
                    <span className="sm strong trunc">{member.name}</span>
                    <span className="xs dim trunc">{member.position}</span>
                  </span>
                </span>

                {vote?.comment && <span className="xs dim grow trunc">“{vote.comment}”</span>}

                <span className="vote__btns">
                  {CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      className="vote__btn"
                      data-v={choice.value === "SETUJU" ? "SETUJU" : "TIDAK SETUJU"}
                      aria-pressed={vote?.choice === choice.value}
                      disabled={busy}
                      onClick={() => cast(member.personId, choice.value)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}

          <div className="vote__foot">
            <span className="quorum">
              <span className="quorum__bar">
                {Array.from({ length: Math.max(members.length, quorum ?? 0) }, (_, i) => (
                  <span
                    key={i}
                    className={`quorum__pip ${
                      i < present ? "quorum__pip--on" : i < (quorum ?? 0) ? "quorum__pip--need" : ""
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </span>
              <span className="xs dim">{readiness.quorum.messageEn}</span>
            </span>

            <span className="grow" />

            <span className="row" style={{ gap: 8 }}>
              <span className="badge badge--ok">{readiness.tally.setuju} setuju</span>
              <span className="badge badge--err">{readiness.tally.tidakSetuju} tidak setuju</span>
              {readiness.tally.notVoted > 0 && (
                <span className="badge">{readiness.tally.notVoted} outstanding</span>
              )}
            </span>
          </div>

          <div style={{ marginTop: 12 }}>
            {readiness.canRecord ? (
              <div className={`callout ${readiness.tally.carried ? "callout--ok" : "callout--err"}`}>
                <div>{readiness.messageEn}</div>
              </div>
            ) : (
              <div className="callout callout--warn">
                <span className="callout__ico">
                  <AlertTriangle size={17} />
                </span>
                <div>{readiness.messageEn}</div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="field__err" style={{ marginTop: 10 }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
