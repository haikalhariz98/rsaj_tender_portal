import { describe, expect, it } from "vitest";

import { demoInstant, kl, onDemoClock, RealDate } from "../../../prisma/demo-clock";

/**
 * Run 3 residual C4: the demo's clock (prisma/demo-clock.ts) is re-entrant. A nested act answers its own instant and
 * the outer one comes back on return; the real clock is restored only when the outermost call ends, also on a throw.
 */
describe("the demo's clock", () => {
  it("answers the act's instant inside, the real clock outside, and any date stays a Date", async () => {
    const before = new Date();
    const seen = await onDemoClock("2026-06-09T10:00", async () => ({ now: new Date().toISOString(), ms: Date.now(), real: before instanceof Date }));
    expect(seen).toEqual({ now: "2026-06-09T02:00:00.000Z", ms: kl("2026-06-09T10:00").getTime(), real: true });
    expect(globalThis.Date).toBe(RealDate);
    expect(demoInstant()).toBeNull();
  });

  it("is re-entrant: the nested instant inside, the outer one back after it, the real clock only at the end", async () => {
    const trail: string[] = [];
    await onDemoClock("2026-06-09T10:00", async () => {
      trail.push(new Date().toISOString());
      await onDemoClock("2026-06-10T08:30", async () => {
        trail.push(new Date().toISOString());
      });
      trail.push(new Date().toISOString());
      expect(globalThis.Date).not.toBe(RealDate);
    });
    expect(trail).toEqual(["2026-06-09T02:00:00.000Z", "2026-06-10T00:30:00.000Z", "2026-06-09T02:00:00.000Z"]);
    expect(globalThis.Date).toBe(RealDate);
  });

  it("restores both clocks when a nested act throws", async () => {
    await expect(
      onDemoClock("2026-06-09T10:00", async () => {
        await expect(onDemoClock("2026-06-10T08:30", async () => { throw new Error("refused"); })).rejects.toThrow("refused");
        expect(new Date().toISOString()).toBe("2026-06-09T02:00:00.000Z");
        throw new Error("outer refused");
      }),
    ).rejects.toThrow("outer refused");
    expect(globalThis.Date).toBe(RealDate);
    expect(demoInstant()).toBeNull();
  });
});
