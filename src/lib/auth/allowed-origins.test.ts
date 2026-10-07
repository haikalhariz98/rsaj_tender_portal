import { describe, expect, it } from "vitest";

import { allowedOriginsOrThrow, parseAllowedOrigins } from "./allowed-origins";

describe("the hosts a server action may be called from", () => {
  it("is empty where nothing is set, and lists exact hosts, lower-cased, trimmed and without repeats", () => {
    expect(parseAllowedOrigins(undefined).hosts).toEqual([]);
    expect(parseAllowedOrigins("").hosts).toEqual([]);
    expect(parseAllowedOrigins(" Perolehan.Example.org , ,perolehan.example.org,intranet:8443 ").hosts).toEqual(["perolehan.example.org", "intranet:8443"]);
  });

  it("refuses a pattern, a URL and a path, so a whole domain is never named", () => {
    const { hosts, refused } = parseAllowedOrigins("*.example.org,https://a.example.org,a.example.org/x,ok.example.org,a b");
    expect(hosts).toEqual(["ok.example.org"]);
    expect(refused.map((r) => r.entry)).toEqual(["*.example.org", "https://a.example.org", "a.example.org/x", "a b"]);
  });

  it("stops the server from starting on a refused entry, and says which", () => {
    expect(() => allowedOriginsOrThrow("*.example.org")).toThrow(/\*\.example\.org/);
    expect(allowedOriginsOrThrow("a.example.org")).toEqual(["a.example.org"]);
  });
});
