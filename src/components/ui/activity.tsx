"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { LockIcon } from "@/components/icons";
import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";

import { Avatar } from "./avatar";
import { Segment, Segmented } from "./segmented";

/**
 * A record's history as a feed, as data: comments (a person's words) and events (a field changed, a move, a link). The audience filter is "All" or
 * "Comments", kept in the address as `?activity=comments` (as Tabs keeps `?tab=`). Times arrive already written by the caller, in the organisation's zone. Entries come newest first or oldest first as the caller sorts them.
 */
export interface ActivityEntry {
  id: string;
  kind: "comment" | "event";
  who: string;
  at: string;
  /// The same moment as an ISO string, for the `<time>` element; the written `at` is what is read.
  iso?: string;
  /// A comment's words, or an event's sentence ("moved it to In review").
  text: string;
  /// A comment only staff can read, drawn on the amber tint with a lock. Set only where the other side could have read it (a shared item).
  internal?: boolean;
}

export function Activity({
  entries,
  label,
  allLabel,
  commentsLabel,
  empty,
}: {
  entries: ActivityEntry[];
  /// The accessible name of the feed.
  label: string;
  allLabel?: string;
  commentsLabel?: string;
  empty?: string;
}) {
  const say = useSay();
  const params = useSearchParams();
  const [only, setOnlyState] = useState(params?.get("activity") === "comments");
  const setOnly = (on: boolean) => {
    setOnlyState(on);
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("activity", "comments");
    else url.searchParams.delete("activity");
    window.history.replaceState(null, "", url);
  };
  const shown = only ? entries.filter((e) => e.kind === "comment") : entries;
  return (
    <section aria-label={label}>
      <Segmented role="group" aria-label={say(WORDS.activityShow)} className="mb-3">
        {[
          [false, allLabel ?? say(WORDS.activityAll)],
          [true, commentsLabel ?? say(WORDS.activityComments)],
        ].map(([on, text]) => (
          <Segment key={String(on)} on={only === on} onClick={() => setOnly(on as boolean)}>
            {text as string}
          </Segment>
        ))}
      </Segmented>
      {shown.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">{empty ?? say(WORDS.activityNothingYet)}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((e) => (
            <li key={e.id} className="flex gap-3">
              <Avatar name={e.who} size="xs" decorative />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink-3">
                  <span className="font-semibold text-ink">{e.who}</span> · {e.iso ? <time dateTime={e.iso}>{e.at}</time> : e.at}
                </div>
                {e.kind === "comment" ? (
                  <p className={`mt-1 rounded-xl px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words text-ink ${e.internal ? "border border-amber-200 bg-amber-50" : "bg-sunken"}`}>
                    {e.internal && (
                      <span className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-amber-800">
                        <LockIcon size={12} /> Internal note
                      </span>
                    )}
                    {e.text}
                  </p>
                ) : (
                  <p className="text-[13.5px] break-words text-ink-2">{e.text}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
