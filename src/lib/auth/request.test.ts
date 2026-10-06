import { describe, expect, it } from "vitest";

import { clientAddress, requestFacts, trustedProxyHops } from "./request";
import { hashToken, looksLikeToken, newToken } from "./token";

describe("trustedProxyHops", () => {
  it("is a count of at least one, and null while unset or not a count", () => {
    expect(trustedProxyHops("1")).toBe(1);
    expect(trustedProxyHops(" 2 ")).toBe(2);
    expect(trustedProxyHops(undefined)).toBeNull();
    expect(trustedProxyHops("")).toBeNull();
    expect(trustedProxyHops("0")).toBeNull();
    expect(trustedProxyHops("true")).toBeNull();
    expect(trustedProxyHops("-1")).toBeNull();
    expect(trustedProxyHops("1.5")).toBeNull();
  });
});

describe("clientAddress", () => {
  it("is unknown while the deployment says nothing about its proxies, whatever the header says", () => {
    expect(clientAddress("203.0.113.9", null)).toBeNull();
  });

  it("takes the entry the outermost trusted proxy appended, counted from the right", () => {
    expect(clientAddress("203.0.113.9", 1)).toBe("203.0.113.9");
    // The client sent "6.6.6.6" itself: behind one proxy the last entry is the proxy's own record of who it saw.
    expect(clientAddress("6.6.6.6, 203.0.113.9", 1)).toBe("203.0.113.9");
    expect(clientAddress("6.6.6.6, 203.0.113.9, 10.0.0.2", 2)).toBe("203.0.113.9");
  });

  it("is unknown where there are fewer entries than proxies, or the entry is not an address", () => {
    expect(clientAddress("203.0.113.9", 2)).toBeNull();
    expect(clientAddress("not-an-address", 1)).toBeNull();
    expect(clientAddress("<script>", 1)).toBeNull();
    expect(clientAddress(null, 1)).toBeNull();
    expect(clientAddress("", 1)).toBeNull();
  });

  it("reads IPv6, lower-cased", () => {
    expect(clientAddress("2001:DB8::1", 1)).toBe("2001:db8::1");
  });
});

describe("requestFacts", () => {
  const headers = { "x-forwarded-for": "198.51.100.4", "user-agent": "Mozilla/5.0" } as Record<string, string>;
  const header = (n: string) => headers[n] ?? null;

  it("holds the address only when proxies are declared, and always the user agent", () => {
    expect(requestFacts(header, undefined)).toEqual({ sourceAddress: null, userAgent: "Mozilla/5.0" });
    expect(requestFacts(header, "1")).toEqual({ sourceAddress: "198.51.100.4", userAgent: "Mozilla/5.0" });
  });

  it("cuts a very long user agent", () => {
    expect(requestFacts(() => "x".repeat(5000), undefined).userAgent).toHaveLength(300);
  });
});

describe("session tokens", () => {
  it("is 256 random bits that the cookie can carry", () => {
    const token = newToken();
    expect(token).toHaveLength(43);
    expect(looksLikeToken(token)).toBe(true);
    expect(newToken()).not.toBe(token);
    expect(newToken(() => Buffer.alloc(32, 1))).toBe(Buffer.alloc(32, 1).toString("base64url"));
  });

  it("is stored only as its SHA-256", () => {
    const token = newToken();
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it("does not look up anything that cannot be a token", () => {
    for (const bad of [undefined, null, "", "short", "x".repeat(44), "x".repeat(42) + "!", "x".repeat(42) + " "]) expect(looksLikeToken(bad)).toBe(false);
  });
});
