"use client";

import { useState } from "react";

import { Avatar } from "./avatar";
import { cx } from "./cx";

/**
 * A record's history as a feed, as data: comments (a person's words) and events (a field changed, a move, a link). The audience filter is "All" or
 * "Comments". Times arrive already written by the caller, in the organisation's zone. Entries come newest first or oldest first as the caller sorts them.
 */
export interface ActivityEntry {
  id: string;
  kind: "comment" | "event";
  who: string;
  at: string;
  /// A comment's words, or an event's sentence ("moved it to In review").
  text: string;
}

export function Activity({
  entries,
  label,
  allLabel = "All",
  commentsLabel = "Comments",
  empty = "Nothing yet",
}: {
  entries: ActivityEntry[];
  /// The accessible name of the feed.
  label: string;
  allLabel?: string;
  commentsLabel?: string;
  empty?: string;
}) {
  const [only, setOnly] = useState(false);
  const shown = only ? entries.filter((e) => e.kind === "comment") : entries;
  return (
    <section aria-label={label}>
      <div role="group" aria-label={label} className="mb-3 inline-flex rounded-full bg-sunken p-0.5">
        {[
          [false, allLabel],
          [true, commentsLabel],
        ].map(([on, text]) => (
          <button
            key={String(on)}
            type="button"
            aria-pressed={only === on}
            onClick={() => setOnly(on as boolean)}
            className={cx(
              "rounded-full px-3.5 py-1 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
              only === on ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
            )}
          >
            {text as string}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((e) => (
            <li key={e.id} className="flex gap-3">
              <Avatar name={e.who} size="xs" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink-3">
                  <span className="font-semibold text-ink">{e.who}</span> · {e.at}
                </div>
                {e.kind === "comment" ? (
                  <p className="mt-1 rounded-xl bg-sunken px-3.5 py-2.5 text-[14px] whitespace-pre-wrap break-words text-ink">{e.text}</p>
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
