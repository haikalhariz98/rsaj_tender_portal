import { describe, expect, it } from "vitest";

import { at, S } from "./fixture";
import { initialStale } from "./initials";
import { standingConfirmations } from "./matrix";

/**
 * Review M-2: an initial stands only on the reading it was taken on, by the correction counter, not
 * by comparing stamps. The stamps below are deliberately unhelpful: equal, or reversed.
 */

const initial = (personId: string, correctionNo: number, recordedAt: Date) => ({ personId, correctionNo, columnRevision: 0, recordedAt });
/// Ruling 22 replaced the reading-only rule with `standingConfirmations`; these columns never changed revision, so what these cases judge is the reading alone.
const freshInitials = (bid: { asReadCorrections: number }, initials: ReturnType<typeof initial>[]) => standingConfirmations(false, { ...bid, columnRevision: 0 }, initials);

describe("initials and corrections (FR-OPN-006, OD-10)", () => {
  it("before any correction, every initial stands", () => {
    expect(freshInitials({ asReadCorrections: 0 }, [initial("p1", 0, at(S)), initial("p2", 0, at(2 * S))]).map((i) => i.personId)).toEqual(["p1", "p2"]);
  });
  it("same second: an initial and a correction stamped in one second — the initial taken on the old reading is stale", () => {
    const sameSecond = at(10 * S);
    const bid = { asReadCorrections: 1, asReadCorrectedAt: sameSecond };
    const old = initial("p1", 0, sameSecond);
    expect(initialStale(bid, old)).toBe(true);
    expect(freshInitials(bid, [old])).toEqual([]);
    // Re-initialled in that same second, on the corrected reading: it stands.
    expect(freshInitials(bid, [initial("p1", 1, sameSecond)]).map((i) => i.personId)).toEqual(["p1"]);
  });
  it("out of order: an initial stamped after the correction but taken on the reading before it stays stale", () => {
    // The initial's transaction read the offer before the correction committed, and stamped later.
    const bid = { asReadCorrections: 1, asReadCorrectedAt: at(10 * S) };
    expect(initialStale(bid, initial("p2", 0, at(11 * S)))).toBe(true);
    // And one stamped before the correction's stamp, but taken on the corrected reading, stands.
    expect(initialStale(bid, initial("p2", 1, at(9 * S)))).toBe(false);
  });
  it("a second correction stales the initials of the first", () => {
    const bid = { asReadCorrections: 2 };
    expect(freshInitials(bid, [initial("p1", 1, at(S)), initial("p2", 2, at(S))]).map((i) => i.personId)).toEqual(["p2"]);
  });
});

describe("no reader decides staleness by stamps (M-2)", () => {
  it("the actions, the read and the demo compare the counter, never recordedAt with asReadCorrectedAt", async () => {
    const { readFileSync } = await import("node:fs");
    for (const p of ["src/app/sourcing/[id]/opening/actions.ts", "src/lib/opening/read.ts", "prisma/demo-opening.ts"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/recordedAt\s*[<>]=?\s*\w+\.asReadCorrectedAt|asReadCorrectedAt\s*[<>]=?\s*\w+\.recordedAt/);
    }
    const actions = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    expect(actions).toMatch(/asReadCorrections: bid\.asReadCorrections \+ 1/);
    expect(actions.match(/correctionNo: bid\.asReadCorrections/g)?.length).toBe(2);
  });
});
