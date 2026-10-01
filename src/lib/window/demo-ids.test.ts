import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * X-4 (phase 2 rulings): 6.5's demo owns demo_mt12 / demo_d41, its routes start at demo_ai62
 * (6.4 holds 60–61, 6.6 follows 6.5's), and its exercises are demo_sx16–19. A source scan of the
 * loader, so a later module's ids cannot slide into 6.5's range unseen, nor 6.5's into theirs.
 */

const src = readFileSync(join(process.cwd(), "prisma/demo-window.ts"), "utf8");
const numbers = (re: RegExp) => [...src.matchAll(re)].map((m) => Number(m[1]));

describe("X-4: 6.5's demo ids", () => {
  it("every route id it writes is demo_ai62 to demo_ai71", () => {
    // Literal ids (the name route and the two changes), the tendering routes by exercise, and the requisitions' (id + 30).
    const literal = numbers(/\$\{P\}ai(\d+)`/g);
    const tendering = Object.values(JSON.parse(src.match(/const TENDERING_ROUTE: Record<number, number> = (\{[^}]*\});/)![1].replace(/(\d+):/g, '"$1":')) as Record<string, number>);
    expect(src).toMatch(/const route = `\$\{P\}ai\$\{r\.id \+ 30\}`;/);
    const requisitions = numbers(/^  \{ id: (\d+), n: \d+, title:/gm).map((id) => id + 30);
    const all = [...new Set([...literal, ...tendering, ...requisitions])].sort((a, b) => a - b);
    expect(all).toEqual([62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
  });
  it("its exercises are sx16 to sx19 and its sitting and matter are mt12 and d41", () => {
    expect(src).toMatch(/export const WINDOW_EXERCISES = \[`\$\{P\}sx19`, `\$\{P\}sx16`, `\$\{P\}sx17`, `\$\{P\}sx18`\] as const;/);
    expect(numbers(/\$\{P\}mt(\d+)/g)).toEqual([12]);
    expect([...new Set(numbers(/\$\{P\}d(\d+)`/g))]).toEqual([41]);
  });
});
