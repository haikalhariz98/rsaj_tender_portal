import { describe, expect, it } from "vitest";

import { figuresFor, type Movement } from "./codes";
import { foldWithheldCommitments } from "./withhold";

const on = new Date("2026-06-30T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let n = 0;
const mv = (o: Partial<Movement>): Movement => ({ id: `m${++n}`, budgetCodeId: "c1", kind: "COMMITMENT", reference: `PR-${n}`, description: `secret ${n}`, amount: "1.00", occurredOn: d("2026-01-10"), releasedOn: null, releaseNote: "", counterpartCode: null, ...o });

const alloc = mv({ id: "a", kind: "ORIGINAL", amount: "100000.00", reference: "", description: "Allocation" });
const u1 = mv({ id: "u1", amount: "10000.00", reference: "PR-U1", description: "estimate ten", releaseNote: "" });
const u2 = mv({ id: "u2", amount: "20000.00", reference: "PR-U2", description: "estimate twenty" });
const r1 = mv({ id: "r1", amount: "5000.00", reference: "PR-R1", description: "readable five" });
const released = mv({ id: "rel", amount: "777.00", reference: "PR-REL", description: "released one", releasedOn: d("2026-02-01"), releaseNote: "no longer needed" });
const future = mv({ id: "fut", amount: "888.00", reference: "PR-FUT", description: "future one", occurredOn: d("2026-12-01") });
const other = mv({ id: "o2", budgetCodeId: "c2", amount: "333.00", reference: "PR-O2", description: "other code" });
const all = [alloc, u1, u2, r1, released, future, other];
const readable = new Set(["r1"]);

describe("foldWithheldCommitments", () => {
  const out = foldWithheldCommitments(all, readable, on);
  it("leaves every code's figures as they were", () => {
    for (const c of ["c1", "c2"]) expect(figuresFor(out, c, on)).toEqual(figuresFor(all, c, on));
  });
  it("matches the spec figures: 30,000.00 folded, 35,000.00 committed before and after", () => {
    const folded = out.find((m) => m.id === "withheld:c1")!;
    expect(folded).toMatchObject({ kind: "COMMITMENT", reference: "", description: "Requisitions not shown (SULIT)", releaseNote: "", counterpartCode: null, amount: "30000.00", releasedOn: null, occurredOn: on });
    expect(figuresFor(all, "c1", on).committed).toBe(3500000n);
    expect(figuresFor(out, "c1", on).committed).toBe(3500000n);
    expect(figuresFor(out, "c1", on).allocated).toBe(10000000n);
  });
  it("names none of the unreadable commitments, nor their individual amounts", () => {
    const json = JSON.stringify(out);
    for (const s of ["u1", "u2", "PR-U1", "PR-U2", "estimate ten", "estimate twenty", "\"10000.00\"", "\"20000.00\"", "PR-REL", "released one", "no longer needed", "777.00", "PR-FUT", "future one", "888.00", "PR-O2", "other code"]) expect(json, s).not.toContain(s);
  });
  it("passes readable commitments and other kinds through unchanged, and drops released and future unreadable ones", () => {
    expect(out).toContain(alloc);
    expect(out).toContain(r1);
    expect(out.map((m) => m.id)).not.toEqual(expect.arrayContaining(["rel"]));
    expect(out.map((m) => m.id)).not.toContain("fut");
    expect(out.map((m) => m.id)).toContain("withheld:c2");
  });
});
