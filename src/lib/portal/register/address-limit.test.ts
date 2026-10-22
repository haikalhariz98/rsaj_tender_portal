import { describe, expect, it } from "vitest";

import { addressLimitState, createAddressCounter, overAddressLimit } from "./address-limit";

const MIN = 60_000;

describe("the per-address limit on the public registration (RSEC-1(a))", () => {
  it("is not set until both figures are, set but not applied while the address is unknown, and applied otherwise", () => {
    expect(addressLimitState({ attempts: null, minutes: 60 }, true)).toBe("NOT_SET");
    expect(addressLimitState({ attempts: 5, minutes: null }, true)).toBe("NOT_SET");
    expect(addressLimitState({ attempts: 5, minutes: 60 }, false)).toBe("NOT_APPLIED");
    expect(addressLimitState({ attempts: 5, minutes: 60 }, true)).toBe("APPLIED");
  });

  it("refuses the submission past the limit, counting itself; never one from an unknown address or under an unset limit", () => {
    const limit = { attempts: 3, minutes: 60 };
    expect(overAddressLimit(3, limit, "203.0.113.7")).toBe(false);
    expect(overAddressLimit(4, limit, "203.0.113.7")).toBe(true);
    expect(overAddressLimit(400, limit, null)).toBe(false);
    expect(overAddressLimit(400, { attempts: null, minutes: null }, "203.0.113.7")).toBe(false);
  });

  it("counts each address's submissions in the window that ends now, and forgets the older ones", () => {
    const c = createAddressCounter();
    for (let i = 0; i < 3; i++) c.hit("a", i * MIN);
    c.hit("b", 0);
    expect(c.count("a", 2 * MIN, 60 * MIN)).toBe(3);
    expect(c.count("a", 61 * MIN, 60 * MIN)).toBe(1);
    expect(c.count("b", 2 * MIN, 60 * MIN)).toBe(1);
    expect(c.count("nobody", 2 * MIN, 60 * MIN)).toBe(0);
  });

  it("holds at most so many addresses, letting the least recently seen go first", () => {
    const c = createAddressCounter(2);
    c.hit("a", 0);
    c.hit("b", 1);
    c.hit("a", 2);
    c.hit("c", 3);
    expect(c.size()).toBe(2);
    expect(c.count("b", 3, 60 * MIN)).toBe(0);
    expect(c.count("a", 3, 60 * MIN)).toBe(2);
  });
});
