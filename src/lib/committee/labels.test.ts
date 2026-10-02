import { describe, expect, it } from "vitest";

import { MATTER_KIND_LABEL, MATTER_KINDS, RECORD_TABLED_DOMAIN_TEXT, SITTING_TABLED_MATTER_KINDS, sittingTablesDomain } from "./labels";
import { SCOPE_DOMAIN } from "@/lib/scope/scope-matter";

describe("matter kinds (ruling 5.3, 6.2 OD-9)", () => {
  it("every kind has words, the scope matter included", () => {
    for (const k of MATTER_KINDS) expect(MATTER_KIND_LABEL[k]).toBeTruthy();
    expect(MATTER_KIND_LABEL.SCOPE).toBe("Scope (bill of quantities)");
  });
  it("a scope matter is tabled from the exercise, which names the bill version; the sitting's drawer neither offers nor accepts it", () => {
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("SCOPE");
    // 6.6 CR-1 (flagged edit to accepted 6.10): LATE_TENDER joins SCOPE as tabled only from its record.
    expect(SITTING_TABLED_MATTER_KINDS).toEqual(MATTER_KINDS.filter((k) => k !== "SCOPE" && k !== "LATE_TENDER"));
  });
});

describe("domains tabled only from their record (6.2 OD-9)", () => {
  it("scope approval is not tabled from the sitting, and the refusal says where it is", () => {
    expect(sittingTablesDomain(SCOPE_DOMAIN)).toBe(false);
    expect(sittingTablesDomain("committee_gate")).toBe(true);
    expect(sittingTablesDomain("appointment")).toBe(true);
    expect(RECORD_TABLED_DOMAIN_TEXT).toMatch(/Scope and estimate, Scope/);
  });
});

describe("late tender admission is tabled only from the Bids received tab (6.6 CR-1)", () => {
  it("the sitting's drawer neither offers the kind nor the domain", async () => {
    const { LATE_DOMAIN } = await import("@/lib/bids/late");
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("LATE_TENDER");
    expect(sittingTablesDomain(LATE_DOMAIN)).toBe(false);
  });
  it("the refusal names Bids received, for the kind and for the domain; scope's still names Scope", async () => {
    const { LATE_DOMAIN } = await import("@/lib/bids/late");
    const { recordTabledText } = await import("./labels");
    expect(recordTabledText("LATE_TENDER")).toMatch(/Bids received tab/);
    expect(recordTabledText(LATE_DOMAIN)).toBe(recordTabledText("LATE_TENDER"));
    expect(recordTabledText("SCOPE")).toBe(RECORD_TABLED_DOMAIN_TEXT);
    expect(recordTabledText(SCOPE_DOMAIN)).toBe(RECORD_TABLED_DOMAIN_TEXT);
    expect(recordTabledText("REQUISITION")).toBeNull();
    expect(recordTabledText("committee_gate")).toBeNull();
  });
  it("tableMatter refuses the kind and the domain server-side, with those words, whatever the drawer posts", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/committees/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function tableMatter("));
    expect(body).toMatch(/if \(domain && !sittingTablesDomain\(domain\)\) r\.reject\("domain", recordTabledText\(domain\)/);
    expect(body).toMatch(/const kindTabledElsewhere = recordTabledText\(String\(data\.get\("matterKind"\)/);
    expect(body).toMatch(/if \(kindTabledElsewhere\) r\.reject\("matterKind", kindTabledElsewhere\);/);
    // The drawer's options come from the same filters.
    const drawer = readFileSync("src/app/committees/editors.tsx", "utf8");
    expect(drawer).toMatch(/Object\.keys\(matters\)\.filter\(sittingTablesDomain\)/);
    expect(drawer).toMatch(/SITTING_TABLED_MATTER_KINDS\.map/);
  });
});
