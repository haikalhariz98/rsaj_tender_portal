import { describe, expect, it } from "vitest";

import { rankHits } from "./rank";
import type { SearchHit } from "./types";

const hit = (id: string, exact: boolean): SearchHit => ({ entity: "requisition", id, title: id, sub: "", href: `/${id}`, exact });

describe("rankHits", () => {
  it("puts an exact hit before newer ones", () => {
    expect(rankHits([hit("new", false), hit("old-exact", true)]).map((h) => h.id)).toEqual(["old-exact", "new"]);
  });
  it("keeps the given (newest first) order among exact hits and among the rest", () => {
    expect(rankHits([hit("a", false), hit("b", true), hit("c", false), hit("d", true)]).map((h) => h.id)).toEqual(["b", "d", "a", "c"]);
  });
});
