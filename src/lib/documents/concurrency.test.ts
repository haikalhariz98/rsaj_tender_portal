import { describe, expect, it } from "vitest";

import { createLimiter, DEFAULT_MAX_CONCURRENT_DOWNLOADS, DEFAULT_MAX_CONCURRENT_UPLOADS, parseConcurrency } from "./concurrency";

describe("the concurrency cap (audit C-1)", () => {
  it("admits up to the cap and refuses the next", () => {
    const l = createLimiter(2);
    const a = l.tryAcquire();
    const b = l.tryAcquire();
    expect(a && b).toBeTruthy();
    expect(l.tryAcquire()).toBeNull();
    expect(l.active()).toBe(2);
  });
  it("a released slot is free again, and releasing twice frees only one", () => {
    const l = createLimiter(1);
    const a = l.tryAcquire()!;
    a();
    a();
    expect(l.active()).toBe(0);
    const b = l.tryAcquire();
    expect(b).not.toBeNull();
    expect(l.tryAcquire()).toBeNull();
  });
  it("reads the environment's value, and anything that is not a whole number of one or more is the default", () => {
    expect(parseConcurrency("3", 4)).toBe(3);
    expect(parseConcurrency(" 12 ", 4)).toBe(12);
    for (const bad of [undefined, null, "", "0", "-1", "2.5", "many", "1e3"]) expect(parseConcurrency(bad, 4), String(bad)).toBe(4);
  });
  it("ships documented defaults", () => {
    expect(DEFAULT_MAX_CONCURRENT_UPLOADS).toBeGreaterThan(0);
    expect(DEFAULT_MAX_CONCURRENT_DOWNLOADS).toBeGreaterThan(0);
  });
});
