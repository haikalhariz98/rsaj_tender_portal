import { describe, expect, it } from "vitest";

import { deeperDisplaced, documentInForce } from "./documents";
import { doc, TYPES } from "./fixture";

/**
 * 615-C7: the watched lists read a renewal chain one link deep. A chain renewed twice with a link between that is waiting for its check (or found not in order, or not yet
 * started) leaves the OLD document looking as if it were still in force, so its older expiry showed on the Expiring list and counted towards a lapse. `deeperDisplaced` names the
 * documents a later link displaces, by the register's own rule (`documentInForce`), never a second reading of it.
 */

const T = "2026-10-03";
const a = doc({ id: "a", typeId: TYPES.works.id, expiresOn: "2026-10-20" });
const b = (o: Parameters<typeof doc>[0] extends infer P ? Partial<P> : never) => doc({ id: "b", typeId: TYPES.works.id, supersedesId: "a", expiresOn: "2027-10-20", lodgedOn: "2026-09-10", ...o });
const c = (o: Partial<Parameters<typeof doc>[0]> = {}) => doc({ id: "c", typeId: TYPES.works.id, supersedesId: "b", expiresOn: "2028-10-20", lodgedOn: "2026-09-20", ...o });

describe("a chain renewed twice (615-C7)", () => {
  it("A verified, B waiting, C verified and started: C is in force and A is displaced", () => {
    const later = [b({ verification: "NOT_CHECKED", verifiedOn: null }), c()];
    expect(documentInForce([a, ...later], T)?.id).toBe("c");
    expect(deeperDisplaced([a], later, T)).toEqual(["a"]);
  });
  it("the same with B found not in order", () => {
    expect(deeperDisplaced([a], [b({ verification: "NOT_IN_ORDER" }), c()], T)).toEqual(["a"]);
  });
  it("A is still in force when C is verified but starts later (M-3: it takes over on its first valid day)", () => {
    const later = [b({ verification: "NOT_CHECKED", verifiedOn: null }), c({ validFrom: "2026-11-01" })];
    expect(deeperDisplaced([a], later, T)).toEqual([]);
    expect(deeperDisplaced([a], later, "2026-11-01")).toEqual(["a"]);
  });
  it("A is still in force when C is not verified either", () => {
    expect(deeperDisplaced([a], [b({ verification: "NOT_CHECKED", verifiedOn: null }), c({ verification: "NOT_CHECKED", verifiedOn: null })], T)).toEqual([]);
  });
  it("one renewal that is waiting displaces nothing (the one-link reading was already right)", () => {
    expect(deeperDisplaced([a], [b({ verification: "NOT_CHECKED", verifiedOn: null })], T)).toEqual([]);
  });
  it("only the candidate asked about is named, and a cycle in corrupt data ends", () => {
    const loop = [doc({ id: "x", typeId: TYPES.works.id, supersedesId: "y" }), doc({ id: "y", typeId: TYPES.works.id, supersedesId: "x" })];
    expect(() => deeperDisplaced([loop[0]], loop, T)).not.toThrow();
    expect(deeperDisplaced([], [b({}), c()], T)).toEqual([]);
  });
});
