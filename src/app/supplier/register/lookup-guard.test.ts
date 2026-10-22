import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupRefusal, searchSlot } from "./lookup-guard";

const from = (address: string | null) => new Request("http://portal.example/supplier/register/values", { headers: address ? { "x-forwarded-for": address } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("the public form's small reads (security audit L8)", () => {
  it("are refused per address past the minute's allowance, each route counted apart; never by address while the address is unknown", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    const env = { REGISTER_LOOKUPS_PER_MINUTE: "3" };
    const address = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
    for (let n = 0; n < 3; n++) expect(lookupRefusal(from(address), "values", env)).toBeNull();
    const over = lookupRefusal(from(address), "values", env)!;
    expect(over.status).toBe(429);
    expect((await over.json()).message).toMatch(/Try again/);
    expect(lookupRefusal(from(address), "token", env)).toBeNull();
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    for (let n = 0; n < 10; n++) expect(lookupRefusal(from(address), "values", env)).toBeNull();
  });

  it("the code search has a cap on how many run at once, whatever the address", () => {
    const env = { REGISTER_MAX_CONCURRENT_LOOKUPS: "2" };
    const held: (() => void)[] = [];
    for (let s = searchSlot(env); "release" in s; s = searchSlot(env)) held.push(s.release);
    expect(held.length).toBeGreaterThan(0);
    const refused = searchSlot(env);
    expect("refusal" in refused && refused.refusal.status).toBe(503);
    for (const r of held) r();
    expect("release" in searchSlot(env)).toBe(true);
  });
});
