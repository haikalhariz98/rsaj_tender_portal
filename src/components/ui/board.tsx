"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";

import { useSay } from "@/components/i18n/language-context";
import { COMPONENT_WORDS as WORDS } from "@/lib/i18n/catalogues/components";

import { Avatar } from "./avatar";
import { Badge } from "./badge";
import { cx } from "./cx";
import { MoreActions, MoreItem } from "./more-actions";
import { MoreText } from "./more-text";

/**
 * Columns of cards, as data (so a server component can hand them over). A card moves three ways that end in the same call: drag and drop, the card's own
 * "Move to" menu, and the keyboard (the menu is a button). The board never decides what may move: each card carries `moves`, the column ids the caller's rule
 * (`moveFaults`) allows it into, and the board offers only those. The caller's `move` action does the real act and may refuse; the card then returns to
 * its column and the refusal is said. Arrow keys walk the cards (up and down in a column, left and right across columns); Enter on a card opens it, as it is a link.
 */
export interface BoardCard {
  id: string;
  columnId: string;
  title: string;
  /// A reference or a second line under the title.
  sub?: string;
  /// Where Enter and a click go; the board knows no routing.
  href: string;
  badges?: { text: string; tone?: "ok" | "warn" | "err" | "info" | "brand" }[];
  /// The person it is with, as a name.
  assignee?: string;
  /// Column ids this card may move into. Empty: it cannot move, and `stuckWhy` says why (an info popover on the card).
  moves: string[];
  stuckWhy?: string;
  /// Sent with the move: the card's own identifiers (item id, the type…), beside `from` and `to`.
  fields: Record<string, string>;
}

export interface BoardColumn {
  id: string;
  label: string;
  /// The true number in the column; the cards are capped by the reader, so this can be more than `cards`.
  total: number;
  /// Where the rest of a capped column is (the list view filtered to it).
  moreHref?: string;
  /// Done: what closed before the board's window is in the list, whatever the cap. A link shows when `olderCount` is more than none.
  olderHref?: string;
  olderCount?: number;
}

export type BoardMove = (data: FormData) => Promise<{ refused?: string } | void>;

export function Board({
  columns,
  cards,
  move,
  label,
  moreLabel,
  moveLabel,
  olderLabel,
  emptyColumn,
  headingLevel = 2,
}: {
  columns: BoardColumn[];
  cards: BoardCard[];
  move: BoardMove;
  /// The accessible name of the whole board.
  label: string;
  moreLabel?: string;
  moveLabel?: string;
  olderLabel?: string;
  emptyColumn?: string;
  /// The level of each column's heading, to sit under the page's own (default 2).
  headingLevel?: 2 | 3 | 4;
}) {
  const say = useSay();
  moreLabel ??= say(WORDS.seeAll);
  moveLabel ??= say(WORDS.moveTo);
  olderLabel ??= say(WORDS.olderInList);
  emptyColumn ??= say(WORDS.nothingHere);
  // A card may only move into a column this board draws: no id that names none reaches the screen or a count.
  const usable = useMemo(() => {
    const ids = new Set(columns.map((k) => k.id));
    return cards.map((c) => (c.moves.every((m) => ids.has(m)) ? c : { ...c, moves: c.moves.filter((m) => ids.has(m)) }));
  }, [cards, columns]);
  const [shown, place] = useOptimistic(usable, (cur, p: { id: string; to: string }) => cur.map((c) => (c.id === p.id ? { ...c, columnId: p.to } : c)));
  const [refused, setRefused] = useState<{ card: BoardCard; text: string } | null>(null);
  // The card being dragged and where it may land: the board shows the landing places and holds still (no text selection) meanwhile.
  const [drag, setDrag] = useState<BoardCard | null>(null);
  const refusedId = useId();
  const Heading = `h${headingLevel}` as "h2";
  const [pending, start] = useTransition();
  // The card whose link takes focus back once it has been drawn: a move (or its revert) re-creates the card in another column and focus would be lost.
  const refocus = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef<BoardCard | null>(null);
  const names = useId();

  function go(card: BoardCard, to: string) {
    if (to === card.columnId || !card.moves.includes(to)) return;
    setRefused(null);
    refocus.current = card.id;
    start(async () => {
      place({ id: card.id, to });
      const data = new FormData();
      for (const [k, v] of Object.entries(card.fields)) data.set(k, v);
      data.set("from", card.columnId);
      data.set("to", to);
      try {
        const r = await move(data);
        if (r?.refused) setRefused({ card, text: r.refused });
      } catch {
        setRefused({ card, text: say(WORDS.didNotSave) });
      }
    });
  }

  // Focus follows the card: after the optimistic drawing, and again once the move has settled (a refusal puts the card back).
  useEffect(() => {
    if (!refocus.current) return;
    const id = refocus.current;
    [...(root.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])].find((el) => el.dataset.cardId === id)?.querySelector("a")?.focus();
    if (!pending) refocus.current = null;
  }, [shown, pending]);

  // Arrow keys: the cards are in DOM order column by column, so up and down are the neighbours in the column, left and right the same row in the next column.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const here = (e.target as HTMLElement).closest<HTMLElement>("[data-board-card]");
    if (!here || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    if ((e.target as HTMLElement) !== here.querySelector("a")) return;
    const col = here.closest<HTMLElement>("[data-board-column]")!;
    const inCol = [...col.querySelectorAll<HTMLElement>("[data-board-card]")];
    const i = inCol.indexOf(here);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowUp") next = inCol[i - 1];
    if (e.key === "ArrowDown") next = inCol[i + 1];
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const cols = [...root.current!.querySelectorAll<HTMLElement>("[data-board-column]")];
      const step = e.key === "ArrowLeft" ? -1 : 1;
      // Skip empty columns: the nearest column in that direction that holds a card.
      for (let j = cols.indexOf(col) + step; j >= 0 && j < cols.length && !next; j += step) {
        const there = [...cols[j].querySelectorAll<HTMLElement>("[data-board-card]")];
        next = there[Math.min(i, there.length - 1)];
      }
    }
    if (!next) return;
    e.preventDefault();
    next.querySelector<HTMLElement>("a")?.focus();
  }

  return (
    <div>
      {refused && (
        <p id={refusedId} role="status" className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[13.5px] text-rose-700">
          <span className="font-semibold">{refused.card.title}</span>: {refused.text}
        </p>
      )}
      <div ref={root} role="group" aria-label={label} onKeyDown={onKeyDown} className={cx("flex gap-3 overflow-x-auto pb-2", drag && "select-none")}>
        {columns.map((col) => {
          const inCol = shown.filter((c) => c.columnId === col.id);
          const headId = `${names}-${col.id}`;
          return (
            <section
              key={col.id}
              data-board-column
              aria-labelledby={headId}
              onDragOver={(e) => {
                if (dragging.current?.moves.includes(col.id) && dragging.current.columnId !== col.id) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging.current) go(dragging.current, col.id);
                dragging.current = null;
                setDrag(null);
              }}
              className={cx("flex w-72 shrink-0 flex-col rounded-2xl bg-sunken p-2.5", drag?.moves.includes(col.id) && drag.columnId !== col.id && "ring-2 ring-brand-300")}
            >
              <Heading id={headId} className="flex items-center justify-between px-1.5 pt-1 pb-2.5 text-[13px] font-semibold text-ink-2">
                {col.label}
                <span className="text-ink-3 tabular-nums">{col.total}</span>
              </Heading>
              <ul className="flex min-h-12 flex-col gap-2">
                {inCol.map((c) => (
                  <li
                    key={c.id}
                    data-board-card
                    data-card-id={c.id}
                    draggable={c.moves.length > 0}
                    onDragStart={(e) => {
                      dragging.current = c;
                      setDrag(c);
                      // Firefox starts no drag without data; the move effect shows the right cursor.
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    inert={drag?.id === c.id}
                    onDragEnd={() => {
                      dragging.current = null;
                      setDrag(null);
                    }}
                    className="relative rounded-xl border border-line/70 bg-surface p-3 shadow-card">
                    <Link href={c.href} scroll={false} draggable={false} aria-describedby={refused?.card.id === c.id ? refusedId : undefined} className="block pr-7 text-[14px] font-semibold break-words text-ink no-underline hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                      {c.title}
                    </Link>
                    {c.sub && <div className="text-[12.5px] break-words text-ink-3">{c.sub}</div>}
                    {(c.badges?.length || c.assignee) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {c.badges?.map((b, i) => (
                          <Badge key={i} tone={b.tone}>
                            {b.text}
                          </Badge>
                        ))}
                        {c.assignee && (
                          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3">
                            <Avatar name={c.assignee} size="xs" decorative />
                            {c.assignee}
                          </span>
                        )}
                      </div>
                    )}
                    {c.moves.length > 0 ? (
                      <div className="absolute top-2 right-2">
                        <MoreActions compact closeOnPick label={`${moveLabel}: ${c.title}`}>
                          {c.moves
                            .filter((to) => to !== c.columnId)
                            .map((to) => (
                              <MoreItem key={to} onClick={() => go(c, to)}>
                                {columns.find((k) => k.id === to)?.label}
                              </MoreItem>
                            ))}
                        </MoreActions>
                      </div>
                    ) : (
                      c.stuckWhy && (
                        <div className="absolute top-2.5 right-2.5">
                          <MoreText text={c.stuckWhy} label={`${say(WORDS.whyNotMoved)}: ${c.title}`} />
                        </div>
                      )
                    )}
                  </li>
                ))}
                {inCol.length === 0 && <li className="px-1.5 py-3 text-[13px] text-ink-3">{emptyColumn}</li>}
              </ul>
              {col.olderHref && !!col.olderCount && (
                <Link href={col.olderHref} className="px-1.5 pt-2.5 text-[13px] font-semibold text-brand-700 no-underline hover:underline">
                  {olderLabel} ({col.olderCount}) <span aria-hidden="true">›</span>
                </Link>
              )}
              {col.moreHref && col.total > inCol.length && (
                <Link href={col.moreHref} className="px-1.5 pt-2.5 text-[13px] font-semibold text-brand-700 no-underline hover:underline">
                  {moreLabel} ({col.total}) <span aria-hidden="true">›</span>
                </Link>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
