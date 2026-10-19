import { describe, expect, it } from "vitest";

import { inOrder } from "./series";

describe("inOrder", () => {
  it("runs one query at a time, in order, and returns the results in order", async () => {
    const log: string[] = [];
    let running = 0;
    const q = (name: string, value: number) => async () => {
      running++;
      expect(running).toBe(1);
      log.push(`start ${name}`);
      await new Promise((r) => setTimeout(r, 2));
      log.push(`end ${name}`);
      running--;
      return value;
    };
    const [a, b, c] = await inOrder(q("a", 1), q("b", 2), q("c", 3));
    expect([a, b, c]).toEqual([1, 2, 3]);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("keeps each result's own type", async () => {
    const [n, s] = await inOrder(async () => 1, () => "x");
    expect(n + 1).toBe(2);
    expect(s.toUpperCase()).toBe("X");
  });

  it("stops at the first failure and starts nothing after it", async () => {
    let later = false;
    await expect(inOrder(async () => { throw new Error("no"); }, async () => { later = true; })).rejects.toThrow("no");
    expect(later).toBe(false);
  });
});
