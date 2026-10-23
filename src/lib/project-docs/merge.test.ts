import { describe, expect, it } from "vitest";

import { afterFor, decodeMergeCursor, encodeMergeCursor, prismaAfter, walkMerged, type MergeLoader, type MergeSource, type Positioned, type SourceAfter } from "./merge";

/**
 * The one list read from two tables (plan step 6; PW-11): documents and earlier records, newest first, paged by a cursor. The walker is held to the plain sort of every
 * row for many lists with many ties (fixtures with a fixed clock tie instants all the time), so a page never repeats a row and never skips one, whatever the page size,
 * the batch and the filter.
 */

interface Row extends Positioned {
  tag: string;
}

/// A table as the database reads it: newest first, then id descending, after a `SourceAfter`. Ids here are plain ASCII, so JavaScript's order is the database's.
function table(source: MergeSource, rows: readonly Row[]): MergeLoader<Row> & { reads: number } {
  const sorted = [...rows].sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const passes = (r: Row, a: SourceAfter | null) => {
    if (!a) return true;
    const t = r.at.getTime();
    const c = a.at.getTime();
    if (a.kind === "LT") return t < c;
    if (a.kind === "LTE") return t <= c;
    return t < c || (t === c && r.id < a.id);
  };
  const loader = {
    source,
    reads: 0,
    async load(after: SourceAfter | null, take: number) {
      loader.reads++;
      return sorted.filter((r) => passes(r, after)).slice(0, take);
    },
  };
  return loader;
}

/// The merged order, written out plainly: newer first, a document before an earlier record at the same instant, then id descending.
function plain(docs: readonly Row[], earlier: readonly Row[]): string[] {
  const all = [...docs.map((r) => ({ r, rank: 0 })), ...earlier.map((r) => ({ r, rank: 1 }))];
  all.sort((a, b) => b.r.at.getTime() - a.r.at.getTime() || a.rank - b.rank || (a.r.id < b.r.id ? 1 : a.r.id > b.r.id ? -1 : 0));
  return all.map((x) => x.r.tag);
}

/// A small seeded generator, so a failure is reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const T0 = Date.UTC(2026, 9, 1);

async function walkAll(docs: Row[], earlier: Row[], take: number, batch: number, keep: (tag: string) => boolean) {
  const out: string[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const page: { rows: string[]; next: string | null } = await walkMerged(table("DOCUMENT", docs), table("EARLIER", earlier), { cursor, take, batch, keep: (m) => (keep(m.row.tag) ? m.row.tag : null) });
    expect(page.rows.length).toBeLessThanOrEqual(take);
    out.push(...page.rows);
    if (!page.next) return out;
    cursor = page.next;
  }
  throw new Error("did not end");
}

describe("the cursor", () => {
  it("round-trips, and reads a step-4 or step-5 cursor (time|id) as a document's", () => {
    const at = new Date(T0);
    expect(decodeMergeCursor(encodeMergeCursor({ at, source: "EARLIER", id: "cs_1" }))).toEqual({ at, source: "EARLIER", id: "cs_1" });
    expect(decodeMergeCursor(`${at.toISOString()}|doc_9`)).toEqual({ at, source: "DOCUMENT", id: "doc_9" });
    for (const bad of [null, "", "nonsense", "x|y|z", `${at.toISOString()}|NOPE|id`, `${at.toISOString()}|DOCUMENT|`]) expect(decodeMergeCursor(bad), String(bad)).toBeNull();
  });

  it("says where each source starts again: its own keyset; a document's at the same instant comes first; an earlier record's comes after", () => {
    const at = new Date(T0);
    expect(afterFor("DOCUMENT", null)).toBeNull();
    expect(afterFor("DOCUMENT", { at, source: "DOCUMENT", id: "d" })).toEqual({ kind: "KEYSET", at, id: "d" });
    expect(afterFor("EARLIER", { at, source: "EARLIER", id: "e" })).toEqual({ kind: "KEYSET", at, id: "e" });
    // After an earlier record at T: every document at T was handed out before it.
    expect(afterFor("DOCUMENT", { at, source: "EARLIER", id: "e" })).toEqual({ kind: "LT", at });
    // After a document at T: every earlier record at T is still to come.
    expect(afterFor("EARLIER", { at, source: "DOCUMENT", id: "d" })).toEqual({ kind: "LTE", at });
  });

  it("builds the database's where for each, on the source's own time column", () => {
    const at = new Date(T0);
    expect(prismaAfter("createdAt", null)).toEqual({});
    expect(prismaAfter("submittedAt", { kind: "LT", at })).toEqual({ submittedAt: { lt: at } });
    expect(prismaAfter("submittedAt", { kind: "LTE", at })).toEqual({ submittedAt: { lte: at } });
    expect(prismaAfter("createdAt", { kind: "KEYSET", at, id: "d" })).toEqual({ OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: "d" } }] });
  });
});

describe("walking the two tables", () => {
  it("a worked example: ties at one instant read documents first, then earlier records, each by id descending", async () => {
    const at = (m: number) => new Date(T0 + m * 60_000);
    const docs = [{ at: at(5), id: "d1", tag: "D1@5" }, { at: at(3), id: "d2", tag: "D2@3" }, { at: at(3), id: "d3", tag: "D3@3" }];
    const earlier = [{ at: at(3), id: "e1", tag: "E1@3" }, { at: at(4), id: "e2", tag: "E2@4" }, { at: at(1), id: "e3", tag: "E3@1" }];
    expect(await walkAll(docs, earlier, 100, 100, () => true)).toEqual(["D1@5", "E2@4", "D3@3", "D2@3", "E1@3", "E3@1"]);
    // Two at a time, the same list, nothing twice.
    expect(await walkAll(docs, earlier, 2, 1, () => true)).toEqual(["D1@5", "E2@4", "D3@3", "D2@3", "E1@3", "E3@1"]);
  });

  it("an empty list is one empty page with no next; one source alone is that source's own order", async () => {
    expect(await walkMerged(table("DOCUMENT", []), table("EARLIER", []), { cursor: null, take: 5, batch: 3, keep: (m) => m.row.id })).toEqual({ rows: [], next: null });
    const docs = [0, 1, 2].map((n) => ({ at: new Date(T0 + n), id: `d${n}`, tag: `D${n}` }));
    expect(await walkAll(docs, [], 2, 2, () => true)).toEqual(["D2", "D1", "D0"]);
  });

  it("for many lists with many ties, every page size, batch and filter hands out the plain sort exactly once", async () => {
    const random = rng(20261023);
    for (let trial = 0; trial < 150; trial++) {
      const n = Math.floor(random() * 30);
      const m = Math.floor(random() * 30);
      const instants = 1 + Math.floor(random() * 6);
      const mk = (prefix: string, k: number): Row[] => Array.from({ length: k }, (_, j) => ({ at: new Date(T0 + Math.floor(random() * instants) * 1000), id: `${prefix}${String(j).padStart(3, "0")}`, tag: `${prefix}${j}` }));
      const docs = mk("d", n);
      const earlier = mk("e", m);
      const take = 1 + Math.floor(random() * 7);
      const batch = 1 + Math.floor(random() * 5);
      const drop = random() < 0.5 ? new Set<string>() : new Set([...docs, ...earlier].filter(() => random() < 0.4).map((r) => r.tag));
      const keep = (tag: string) => !drop.has(tag);
      const want = plain(docs, earlier).filter(keep);
      expect(await walkAll(docs, earlier, take, batch, keep), `trial ${trial}`).toEqual(want);
    }
  });

  it("reads in batches: a long list costs about one page of reads, not the whole table", async () => {
    const docs = Array.from({ length: 500 }, (_, j) => ({ at: new Date(T0 - j * 1000), id: `d${String(j).padStart(4, "0")}`, tag: `D${j}` }));
    const earlier = Array.from({ length: 500 }, (_, j) => ({ at: new Date(T0 - j * 1000 - 500), id: `e${String(j).padStart(4, "0")}`, tag: `E${j}` }));
    const d = table("DOCUMENT", docs);
    const e = table("EARLIER", earlier);
    const page = await walkMerged(d, e, { cursor: null, take: 10, batch: 100, keep: (m) => m.row.tag });
    expect(page.rows).toEqual(["D0", "E0", "D1", "E1", "D2", "E2", "D3", "E3", "D4", "E4"]);
    expect(page.next).not.toBeNull();
    expect(d.reads + e.reads).toBe(2);
  });
});
