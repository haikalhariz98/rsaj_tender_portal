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
    // 6.8 (flagged, stricter): so does EVALUATION_STAGE, tabled from the Evaluation tab.
    // 6.15 (flagged, stricter): a SUPPLIER matter is never tabled at all. 6.14 (flagged, stricter): nor a CERTIFICATE matter.
    // 6.13 Part A step 4 (stricter, flagged): a variation's matter is tabled from the variation, never a sitting's drawer.
    // 6.13 Part B run 1a (stricter, flagged against Part A, BD-613-73): so is a contract matter, from the matter.
    expect(SITTING_TABLED_MATTER_KINDS).toEqual(MATTER_KINDS.filter((k) => k !== "SCOPE" && k !== "LATE_TENDER" && k !== "EVALUATION_STAGE" && k !== "SUPPLIER" && k !== "CERTIFICATE" && k !== "VARIATION" && k !== "CONTRACT"));
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
    expect(recordTabledText("LATE_TENDER")).toMatch(/the Received section of Bids and opening/);
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

describe("domains no sitting decides: window change and award signatory (6.6 review S-9)", () => {
  it("the sitting's drawer does not offer them, and the refusal says where each is decided", async () => {
    const { WINDOW_CHANGE_DOMAIN } = await import("@/lib/method/types");
    const { SIGNATORY_DOMAIN } = await import("@/lib/award/types");
    const { recordTabledText } = await import("./labels");
    expect(sittingTablesDomain(WINDOW_CHANGE_DOMAIN)).toBe(false);
    expect(sittingTablesDomain(SIGNATORY_DOMAIN)).toBe(false);
    expect(recordTabledText(WINDOW_CHANGE_DOMAIN)).toMatch(/approved on its own route, from the exercise's Invitation tab; that route takes no committee step/);
    expect(recordTabledText(SIGNATORY_DOMAIN)).toMatch(/office the approval matrix names for the award/);
  });
  it("the drawer's domain options, as built from the labels, leave out every domain a sitting does not table", async () => {
    const matters = (await import("@/lib/labels.json")).default as Record<string, unknown>;
    const { WINDOW_CHANGE_DOMAIN } = await import("@/lib/method/types");
    const { SIGNATORY_DOMAIN } = await import("@/lib/award/types");
    const { LATE_DOMAIN } = await import("@/lib/bids/late");
    const offered = Object.keys(matters).filter(sittingTablesDomain);
    for (const d of [WINDOW_CHANGE_DOMAIN, SIGNATORY_DOMAIN, LATE_DOMAIN, SCOPE_DOMAIN]) {
      expect(Object.keys(matters)).toContain(d);
      expect(offered).not.toContain(d);
    }
    expect(offered).toContain("committee_gate");
  });
  it("tableMatter's server refusal for a domain uses those words (the same reject CR-1 scans)", async () => {
    const { readFileSync } = await import("node:fs");
    const body = readFileSync("src/app/committees/actions.ts", "utf8").slice(readFileSync("src/app/committees/actions.ts", "utf8").indexOf("export async function tableMatter("));
    expect(body).toMatch(/if \(domain && !sittingTablesDomain\(domain\)\) r\.reject\("domain", recordTabledText\(domain\) \?\? RECORD_TABLED_DOMAIN_TEXT\);/);
  });
});

describe("6.15a (flagged, new test): a supplier's blacklisting and a special permission are never tabled", () => {
  it("no sitting decides either domain, and the refusal says where each is decided", async () => {
    const { recordTabledText, SUPPLIER_NOT_TABLED_TEXT } = await import("./labels");
    for (const d of ["supplier_blacklist", "special_permission", "supplier_registration"]) {
      expect(sittingTablesDomain(d), d).toBe(false);
      expect(recordTabledText(d), d).toBe(SUPPLIER_NOT_TABLED_TEXT);
    }
  });
});

describe("6.14 (flagged, new test): a certificate matter is never tabled", () => {
  it("no sitting tables a CERTIFICATE matter, and the refusal says where it is decided", async () => {
    const { recordTabledText, CERTIFICATE_NOT_TABLED_TEXT, NEVER_TABLED_MATTER_KINDS } = await import("./labels");
    expect(NEVER_TABLED_MATTER_KINDS).toContain("CERTIFICATE");
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("CERTIFICATE");
    expect(MATTER_KIND_LABEL.CERTIFICATE).toBe("Certificate");
    expect(recordTabledText("CERTIFICATE")).toBe(CERTIFICATE_NOT_TABLED_TEXT);
  });
});

describe("6.13 Part A step 4: a variation's matter is tabled from the variation", () => {
  it("neither the kind nor its domains are tabled from a sitting, and the refusal names where", async () => {
    const { recordTabledText, VARIATION_TABLED_TEXT } = await import("./labels");
    expect(SITTING_TABLED_MATTER_KINDS).not.toContain("VARIATION");
    for (const d of ["vo", "vo_increase", "vo_agreed_rate", "remeasurement", "vo_funder_consent"]) {
      expect(sittingTablesDomain(d), d).toBe(false);
      expect(recordTabledText(d), d).toBe(VARIATION_TABLED_TEXT);
    }
    expect(recordTabledText("VARIATION")).toMatch(/Variations tab/);
    // 6.13 Part B run 1b C8b (flagged against accepted 6.10, stricter; BD-613-117, trace T9): "eot" is a contract
    // matter's domain, tabled from the matter, never from a sitting; every contract-matter domain is asserted below.
    expect(sittingTablesDomain("eot")).toBe(false);
  });
});

describe("6.13 Part B run 1b C8b (BD-613-117): every contract-matter domain is tabled from its matter", () => {
  it("no sitting tables any of them, and the refusal names where, in the contract matter's words", async () => {
    const { CONTRACT_MATTER_DOMAINS } = await import("@/lib/matter/matter");
    const { recordTabledText, CONTRACT_TABLED_WORDS, RECORD_TABLED_DOMAINS } = await import("./labels");
    expect(CONTRACT_MATTER_DOMAINS).toEqual(["eot", "contract_period_extension", "lad_waiver", "termination", "nominated_increase", "nomination", "loss_expense"]);
    for (const d of CONTRACT_MATTER_DOMAINS) {
      expect(sittingTablesDomain(d), d).toBe(false);
      expect(RECORD_TABLED_DOMAINS, d).toContain(d);
      expect(recordTabledText(d), d).toBe(CONTRACT_TABLED_WORDS.en);
    }
    expect(recordTabledText("CONTRACT")).toBe(CONTRACT_TABLED_WORDS.en);
  });
  it("the sitting's drawer, built from the labels, offers none of them", async () => {
    const { CONTRACT_MATTER_DOMAINS } = await import("@/lib/matter/matter");
    const matters = (await import("@/lib/labels.json")).default as Record<string, unknown>;
    const offered = Object.keys(matters).filter(sittingTablesDomain);
    for (const d of CONTRACT_MATTER_DOMAINS) {
      expect(Object.keys(matters), d).toContain(d);
      expect(offered, d).not.toContain(d);
    }
  });
});
