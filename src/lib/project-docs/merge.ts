/**
 * One list read from two tables, newest first, paged by a cursor (plan step 6 §7; PW-11): the Project workspace's documents and the earlier contractor submissions
 * (`ContractorSubmission`, read-only, not migrated) sit in the same Documents list, the same portal list and the same "Documents waiting". Each table is read in its own
 * order by the database, in bounded batches; the two are interleaved here. Pure: the walker takes two loaders, so it is tested without a database.
 *
 * The order of the merged list:
 * 1. the newer first (a document's `createdAt`, a submission's `submittedAt`);
 * 2. at the same instant, a document before an earlier record (the source's rank);
 * 3. within one source at the same instant, the database's own order of its ids, descending.
 * Ids are never compared here: Postgres's collation and JavaScript's `<` disagree on `_` and on case, so an id is only ever compared by the database, inside one table.
 *
 * The cursor is `time|source|id`, the position of the last row handed out. A step-4 or step-5 cursor (`time|id`, documents only) is still read, as a document's.
 */

export const MERGE_SOURCES = ["DOCUMENT", "EARLIER"] as const;
export type MergeSource = (typeof MERGE_SOURCES)[number];
const RANK: Readonly<Record<MergeSource, number>> = { DOCUMENT: 0, EARLIER: 1 };

export interface MergeCursor {
  at: Date;
  source: MergeSource;
  id: string;
}

export const encodeMergeCursor = (c: MergeCursor): string => `${c.at.toISOString()}|${c.source}|${c.id}`;

/// The cursor, or null where it is absent or not one this list wrote. A two-part cursor is a document's (the step-4 and step-5 lists wrote those).
export function decodeMergeCursor(s: string | null | undefined): MergeCursor | null {
  if (!s) return null;
  const parts = s.split("|");
  if (parts.length < 2) return null;
  const at = new Date(parts[0]!);
  if (Number.isNaN(at.getTime())) return null;
  if (parts.length === 2) return parts[1] ? { at, source: "DOCUMENT", id: parts[1] } : null;
  const source = parts[1] as MergeSource;
  const id = parts.slice(2).join("|");
  return (MERGE_SOURCES as readonly string[]).includes(source) && id ? { at, source, id } : null;
}

/**
 * Where one source's next read starts, after a position in the merged list. The database applies it: strictly older; or as old or older (every row of this source at the
 * cursor's instant comes after a row of a higher-ranked source there); or older, or at the same instant with a smaller id (a keyset within the source itself).
 */
export type SourceAfter = { kind: "LT"; at: Date } | { kind: "LTE"; at: Date } | { kind: "KEYSET"; at: Date; id: string };

export function afterFor(source: MergeSource, c: MergeCursor | null): SourceAfter | null {
  if (!c) return null;
  if (c.source === source) return { kind: "KEYSET", at: c.at, id: c.id };
  // Another source's row at the cursor: this source's rows at the same instant come before it when this source ranks first, after it when it ranks second.
  return RANK[source] < RANK[c.source] ? { kind: "LT", at: c.at } : { kind: "LTE", at: c.at };
}

/// The `where` a Prisma read adds for a `SourceAfter`, on the source's time column. Pure: it builds the object and reads nothing.
export function prismaAfter(timeField: string, a: SourceAfter | null): Record<string, unknown> {
  if (!a) return {};
  if (a.kind === "LT") return { [timeField]: { lt: a.at } };
  if (a.kind === "LTE") return { [timeField]: { lte: a.at } };
  return { OR: [{ [timeField]: { lt: a.at } }, { [timeField]: a.at, id: { lt: a.id } }] };
}

/// A row as the walker sees it: its instant and its id. The rest is the caller's.
export interface Positioned {
  at: Date;
  id: string;
}

/// One source of the list: it loads up to `take` rows after a position, newest first, in the database's order. A source that returns fewer than `take` is exhausted.
export interface MergeLoader<T extends Positioned> {
  source: MergeSource;
  load(after: SourceAfter | null, take: number): Promise<readonly T[]>;
}

export type Merged<A, B> = { source: "DOCUMENT"; row: A } | { source: "EARLIER"; row: B };

/// The first of two heads in the merged order: the newer, then the higher-ranked source. Two heads of one source never meet here.
const firstOf = (a: { at: Date; source: MergeSource }, b: { at: Date; source: MergeSource }): boolean =>
  a.at.getTime() !== b.at.getTime() ? a.at.getTime() > b.at.getTime() : RANK[a.source] < RANK[b.source];

/**
 * One page of the merged list after `cursor`: up to `take` rows that `keep` turns into a row (null: left out, as a filter leaves it), and the cursor of the page after it, or
 * null at the end. Each source is read in batches of `batch`, its own keyset continuing where its last batch stopped, so a list with a great many rows still costs one page.
 * When a page fills, its cursor is the last row handed out; the next page starts after it, so no row is handed out twice and none is skipped.
 */
export async function walkMerged<A extends Positioned, B extends Positioned, R>(
  documents: MergeLoader<A>,
  earlier: MergeLoader<B>,
  i: { cursor: string | null; take: number; batch: number; keep: (m: Merged<A, B>) => R | null | Promise<R | null> },
): Promise<{ rows: R[]; next: string | null }> {
  const start = decodeMergeCursor(i.cursor);
  const state = [documents, earlier].map((loader) => ({ loader, buffer: [] as Positioned[], after: afterFor(loader.source, start), done: false }));
  const fill = async (s: (typeof state)[number]) => {
    if (s.buffer.length > 0 || s.done) return;
    const got = await s.loader.load(s.after, i.batch);
    s.buffer = [...got];
    if (got.length < i.batch) s.done = true;
    const last = got[got.length - 1];
    if (last) s.after = { kind: "KEYSET", at: last.at, id: last.id };
  };
  const rows: R[] = [];
  for (;;) {
    await fill(state[0]!);
    await fill(state[1]!);
    const heads = state.filter((s) => s.buffer.length > 0);
    if (heads.length === 0) return { rows, next: null };
    const pick = heads.length === 1 ? heads[0]! : firstOf({ at: heads[0]!.buffer[0]!.at, source: heads[0]!.loader.source }, { at: heads[1]!.buffer[0]!.at, source: heads[1]!.loader.source }) ? heads[0]! : heads[1]!;
    const item = pick.buffer.shift()!;
    const source = pick.loader.source;
    const kept = await i.keep((source === "DOCUMENT" ? { source, row: item as A } : { source, row: item as B }) as Merged<A, B>);
    if (kept === null) continue;
    rows.push(kept);
    if (rows.length === i.take) {
      // A full page: there may be more, so the next page is offered from here (the caller asks for it to find out, as the one-table lists did).
      return { rows, next: encodeMergeCursor({ at: item.at, source, id: item.id }) };
    }
  }
}
