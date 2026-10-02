import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * X-4 (phase 2 rulings): 6.6's demo owns demo_mt13 / demo_d42, its routes follow 6.5's
 * (demo_ai72–73), and its new exercise is demo_sx20. A source scan of the loader, so a later
 * module's ids cannot slide into 6.6's range unseen. X-10 d: no customer source is cited.
 */

const src = readFileSync(join(process.cwd(), "prisma/demo-bids.ts"), "utf8");
const numbers = (re: RegExp) => [...new Set([...src.matchAll(re)].map((m) => Number(m[1])))].sort((a, b) => a - b);

describe("X-4: 6.6's demo ids", () => {
  it("its routes are demo_ai72 and demo_ai73, after 6.5's demo_ai62–71", () => expect(numbers(/\$\{P\}ai(\d+)`/g)).toEqual([72, 73]));
  it("its sitting and matter are demo_mt13 and demo_d42", () => {
    expect(numbers(/\$\{P\}mt(\d+)`/g)).toEqual([13]);
    expect(numbers(/\$\{P\}d(\d+)`/g)).toEqual([42]);
  });
  it("its only new exercise is demo_sx20", () => expect(numbers(/NEW_EXERCISE = `\$\{P\}sx(\d+)`/g)).toEqual([20]));
});

describe("X-10 d: invented and ASSUMED", () => {
  it("every configured value it writes is ASSUMED, none STATED", () => {
    expect(src).not.toMatch(/Provenance: "STATED"|provenance: "STATED"/);
    expect(src).not.toMatch(/SK00\d|RSAJ|TA 109/);
  });
});
