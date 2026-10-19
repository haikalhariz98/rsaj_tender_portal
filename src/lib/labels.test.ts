import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { actLabel } from "@/components/ui/act";

import { AUTHORITY_ACTS } from "./authority/types";
import { ACT_LABEL, actWithCode, condLabel, hasMatterLabel, matterLabel, routedOnLabel } from "./labels";
import { toPosix } from "@/lib/scan/files";

describe("an authority act reads as words with its DAL code (ruling CO-9, FR-APR-003)", () => {
  it("names every act and shows the manual's code beside it", () => {
    expect(actWithCode("MR")).toBe("Mandatory recommendation (MR)");
    expect(actWithCode("A")).toBe("Approve (A)");
    for (const code of Object.keys(ACT_LABEL)) expect(actWithCode(code)).toBe(`${ACT_LABEL[code]} (${code})`);
  });
  it("tells a mandatory recommendation from a recommendation at a glance", () => {
    expect(actLabel("MR")).not.toBe(actLabel("R"));
    expect(actLabel("R")).toBe("Recommend (R)");
  });
  it("never shows a code it does not know as if it were one", () => {
    expect(actWithCode("ZZ")).toBe("Unknown act");
  });
});

describe("what a route was chosen on (Phase 1 carry 4)", () => {
  it("names the condition when the rule has one", () => {
    expect(routedOnLabel("over_budget")).toBe(condLabel("over_budget"));
    expect(routedOnLabel("over_budget")).toBe("When over budget");
  });
  it("says the value alone when it has none, never a vague pronoun", () => {
    for (const none of [null, undefined, ""]) expect(routedOnLabel(none)).toBe("The requisition's value alone");
  });
});

describe("one act vocabulary: the grammar's list and the words agree", () => {
  it("every act in AUTHORITY_ACTS has words, and ACT_LABEL names no other", () => {
    expect([...AUTHORITY_ACTS].sort()).toEqual(Object.keys(ACT_LABEL).sort());
    for (const a of AUTHORITY_ACTS) expect(ACT_LABEL[a]).toBeTruthy();
  });
});

describe("every product matter-domain constant has a label (6.6 review S-4)", () => {
  /// Every `export const X_DOMAIN = "…"` the product declares, found by scanning src/lib, so a new one without words fails here.
  const domains = (() => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : /\.ts$/.test(n) && !/\.test\.ts$/.test(n) ? [toPosix(join(dir, n))] : []));
    return [...new Set(walk("src/lib").flatMap((f) => [...readFileSync(f, "utf8").matchAll(/export const [A-Z_]+_DOMAIN = "([a-z_]+)"/g)].map((m) => m[1])))].sort();
  })();
  it("the scan finds the domains, the late-admission one included", async () => {
    const { LATE_DOMAIN } = await import("@/lib/bids/late");
    expect(domains).toContain(LATE_DOMAIN);
    expect(domains.length).toBeGreaterThanOrEqual(9);
  });
  it.each(domains)("%s has its own words in English and Malay, never the code's fallback", (code) => {
    expect(hasMatterLabel(code)).toBe(true);
    for (const lang of ["en", "ms"] as const) {
      const label = matterLabel(code, lang);
      expect(label.trim()).not.toBe("");
      expect(label).not.toMatch(/_/);
    }
  });
  it("late tender admission reads as words in both languages", async () => {
    const { LATE_DOMAIN } = await import("@/lib/bids/late");
    expect(matterLabel(LATE_DOMAIN)).toBe("Late tender admission");
    expect(matterLabel(LATE_DOMAIN, "ms")).toBe("Kemasukan tender lewat");
  });
});
