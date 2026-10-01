import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * X-4 (phase 2 rulings): 6.4's demo routes are `demo_ai60`–`61`; 6.5 owns `demo_ai62` and
 * above. BD-64-30: the third route 6.4 needs is `demo_ai61b`. Every route id the 6.4 demo
 * loader writes stays in that range, so 6.5's ids never collide with it.
 */

describe("X-4: 6.4's demo route ids stay in its range", () => {
  const src = readFileSync(join(process.cwd(), "prisma/demo-tender-docs.ts"), "utf8");
  const ids = [...src.matchAll(/routeId: `\$\{P\}ai(\w+)`/g)].map((m) => m[1]);

  it("the loader opens its three routes", () => {
    expect(ids).toEqual(["60", "61b", "61"]);
  });
  it("each is 60 or 61, with at most a letter after it; never 62 or above", () => {
    for (const id of ids) expect(id, `demo_ai${id}`).toMatch(/^6[01][a-z]?$/);
    expect(src).not.toMatch(/ai6[2-9]/);
  });
});
