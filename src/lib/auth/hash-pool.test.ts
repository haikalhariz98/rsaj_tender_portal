import { describe, expect, it } from "vitest";

import { createPool } from "./hash-pool";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("createPool", () => {
  it("never runs more than its limit at once, and runs everything", async () => {
    const pool = createPool(4);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        pool.run(async () => {
          running++;
          peak = Math.max(peak, running);
          await tick();
          running--;
          return i;
        }),
      ),
    );
    expect(peak).toBe(4);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(pool.active).toBe(0);
    expect(pool.waiting).toBe(0);
  });

  it("starts the waiting in the order they came", async () => {
    const pool = createPool(1);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        pool.run(async () => {
          order.push(n);
          await tick();
        }),
      ),
    );
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("frees its slot when a task fails", async () => {
    const pool = createPool(1);
    await expect(
      pool.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await pool.run(async () => "after")).toBe("after");
    expect(pool.active).toBe(0);
  });

  it("does not let a newcomer take a slot a waiter was handed", async () => {
    const pool = createPool(1);
    let running = 0;
    let peak = 0;
    const job = async () => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      running--;
    };
    const first = pool.run(job);
    const second = pool.run(job);
    await first;
    const third = pool.run(job); // arrives as the first finishes, while the second has been handed the slot
    await Promise.all([second, third]);
    expect(peak).toBe(1);
  });

  it("refuses a pool of no tasks", () => {
    expect(() => createPool(0)).toThrow();
  });
});
