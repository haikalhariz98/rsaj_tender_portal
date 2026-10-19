"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

import { moveStepsOfAbsentHolders } from "./actions";

/**
 * "Move steps held by people who are away" (FR-APR-012). The same sweep that runs when someone is marked absent, run again on request: it moves a step only
 * while its office has nobody able to act and the reporting line says who is above the holders, and says, for each step it leaves, why. It can be pressed as
 * often as wanted; a step already moved is not moved twice.
 */
export function MoveAwayButton({ waiting }: { waiting: number }) {
  const [pending, start] = useTransition();
  const [words, setWords] = useState<string[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || waiting === 0}
        onClick={() =>
          start(async () => {
            const r = await moveStepsOfAbsentHolders();
            setWords(r.words);
            setRefused(r.refused ?? null);
          })
        }
      >
        {pending ? "Moving…" : "Move absentees' steps"}
      </Button>
      {waiting === 0 && <span className="text-[12px] text-ink-3">Nothing stuck.</span>}
      {refused && (
        <Callout tone="warn" title="Nothing was moved">
          {refused}
        </Callout>
      )}
      {words && !refused && (
        <Callout tone="ok" title="Done">
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            {words.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
