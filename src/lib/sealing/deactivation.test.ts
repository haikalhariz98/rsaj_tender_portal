import { describe, expect, it } from "vitest";

import { DISABLE_BLOCKED_LINE, disableExposure, HIDDEN_DISABLE_LINE, hiddenDisableLines, deactivationGate, EXPOSURE_WORDS, exposureLines, exposureOf, exposuresOf, SECOND_APPROVER_WORDS, type HeldExercise } from "./deactivation";

const NOW = new Date("2026-11-02T10:00:00Z");
const BEFORE = new Date("2026-11-03T10:00:00Z");
const AFTER = new Date("2026-11-01T10:00:00Z");
const ex = (over: Partial<HeldExercise>): HeldExercise => ({ exerciseId: "e1", reference: "TND/0001", title: "Road works", closing: BEFORE, openings: [], lateBidWaiting: false, ...over });

describe("who is left stranded when a share-holder leaves (D11, 20t)", () => {
  it("before the closing the officer can still be replaced, and the line says so and says what follows if not", () => {
    const x = exposureOf(ex({}), NOW)!;
    expect(x.kind).toBe("SUBSTITUTE_BEFORE_CLOSING");
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/can still be replaced/);
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/re-tendered/);
    expect(exposureOf(ex({ closing: null }), NOW)!.kind).toBe("SUBSTITUTE_BEFORE_CLOSING");
  });

  it("20ce (a): a finalised main opening with a late bid waiting is exposed, and needs the second approver; with none waiting it is not", () => {
    const main = [{ kind: "MAIN" as const, unsealed: true, finalised: true }];
    const x = exposureOf(ex({ closing: AFTER, openings: main, lateBidWaiting: true }), NOW)!;
    expect(x.kind).toBe("LATE_BID_WAITING");
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/supplementary opening/);
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/re-tendered/);
    expect(exposureOf(ex({ closing: AFTER, openings: main, lateBidWaiting: false }), NOW)).toBeNull();
    expect(deactivationGate({ exposures: [x], mode: null }).allowed).toBe(false);
    expect(deactivationGate({ exposures: [x], mode: "APPLY" }).allowed).toBe(true);
  });

  it("after the closing and before the unseal the bids can never be opened: re-tender, with cancellation the way out", () => {
    const x = exposureOf(ex({ closing: AFTER }), NOW)!;
    expect(x.kind).toBe("UNOPENABLE");
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/must be re-tendered/);
    expect(EXPOSURE_WORDS[x.kind](x)).toMatch(/cancel/);
  });

  it("between the unseal and finalising the opening is left unfinalisable, in words that say re-tender (20t)", () => {
    const x = exposureOf(ex({ closing: AFTER, openings: [{ kind: "MAIN", unsealed: true, finalised: false }] }), NOW)!;
    expect(x.kind).toBe("UNFINALISABLE");
    const words = EXPOSURE_WORDS[x.kind](x);
    expect(words).toMatch(/never be finalised/);
    expect(words).toMatch(/must be re-tendered/);
    expect(words).toMatch(/cancel it, with its authority/);
  });

  it("a finalised main opening is not listed, and a sitting part-way outranks it", () => {
    expect(exposureOf(ex({ closing: AFTER, openings: [{ kind: "MAIN", unsealed: true, finalised: true }] }), NOW)).toBeNull();
    expect(exposureOf(ex({ closing: AFTER, openings: [{ kind: "MAIN", unsealed: true, finalised: true }, { kind: "SUPPLEMENTARY", unsealed: true, finalised: false }] }), NOW)!.kind).toBe("UNFINALISABLE");
    expect(exposuresOf([ex({ exerciseId: "a", openings: [{ kind: "MAIN", unsealed: true, finalised: true }] }), ex({ exerciseId: "b" })], NOW).map((x) => x.exerciseId)).toEqual(["b"]);
    expect(exposureLines([])).toEqual([]);
  });

  it("one person alone cannot mark a share-holder as left between the unseal and finalising, but a proposal and a second person's decision can", () => {
    const h3 = exposuresOf([ex({ closing: AFTER, openings: [{ kind: "MAIN", unsealed: true, finalised: false }] })], NOW);
    expect(deactivationGate({ exposures: h3, mode: null })).toEqual({ allowed: false, message: SECOND_APPROVER_WORDS });
    expect(deactivationGate({ exposures: h3, mode: "REHEARSAL" })).toEqual({ allowed: true });
    expect(deactivationGate({ exposures: h3, mode: "APPLY" })).toEqual({ allowed: true });
    // Outside the window the act is not refused: it lists what it leaves, and asks a reason.
    expect(deactivationGate({ exposures: exposuresOf([ex({})], NOW), mode: null })).toEqual({ allowed: true });
  });
});

describe("the Accounts disable drawer's lines (20ci a)", () => {
  const x = (kind: "UNFINALISABLE" | "UNOPENABLE" | "LATE_BID_WAITING" | "SUBSTITUTE_BEFORE_CLOSING", id = "e1") => ({ exerciseId: id, reference: "TND/0001", title: "Road works", kind });
  it("says nothing for a person who is no officer", () => {
    expect(disableExposure([], new Set())).toEqual({ lines: [], blocked: false });
  });
  it("lists one line per exercise and is not blocked where the gate allows", () => {
    const r = disableExposure([x("UNOPENABLE"), x("SUBSTITUTE_BEFORE_CLOSING", "e2")], new Set());
    expect(r.blocked).toBe(false);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatch(/TND\/0001 \(Road works\)/);
  });
  it("is blocked, and says so last, exactly where deactivationGate refuses a run with no two-person mode", () => {
    for (const kind of ["UNFINALISABLE", "LATE_BID_WAITING"] as const) {
      const r = disableExposure([x(kind)], new Set());
      expect(r.blocked).toBe(!deactivationGate({ exposures: [x(kind)], mode: null }).allowed);
      expect(r.blocked).toBe(true);
      expect(r.lines.at(-1)).toBe(DISABLE_BLOCKED_LINE);
    }
  });
  it("does not name an exercise the reader may not see", () => {
    const r = disableExposure([x("UNFINALISABLE", "secret")], new Set(["secret"]));
    expect(r.lines[0]).toBe(HIDDEN_DISABLE_LINE);
    expect(r.lines.join(" ")).not.toMatch(/TND|Road/);
  });
  it("collapses several hidden exercises into one line, so no two lines are equal", () => {
    const r = disableExposure([x("UNOPENABLE", "h1"), x("SUBSTITUTE_BEFORE_CLOSING", "h2"), x("UNOPENABLE", "e3")], new Set(["h1", "h2"]));
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1]).toBe(hiddenDisableLines(2));
    expect(new Set(r.lines).size).toBe(r.lines.length);
    expect(hiddenDisableLines(2)).toMatch(/^2 exercises/);
  });
});
