import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen as s } from "@/lib/money";

import { openingReleaseLine } from "./opening";

/**
 * Acceptance S-4, the condition of BD-613-51: retention released before the system is listed on the Releases card as
 * released before the system and read as the first release, with its figures; the card says nothing has been released
 * only where neither the opening position nor the system released anything. Worked example: RM5,000.00 released to
 * the main contractor before the system, up to interim certificate 7 (IPC-OLD-0007).
 */
const T = (m: string, n = "0.00", ns = "0.00") => ({ MAIN: s(m), NSC: s(n), NS: s(ns) });
const base = { provenance: "STATED" as const, note: "IPC-OLD-0007", lastCertificateNumber: "IPC-OLD-0007", lastSequence: 7 };

describe("the opening position's release on the Releases card", () => {
  it("is listed as released before the system, read as the first release, with its figures and source", () => {
    const l = openingReleaseLine({ ...base, released: T("5000.00") })!;
    expect(l.head.en).toBe("Released before the system (opening position, entered), read as the first release · RM5,000");
    expect(l.sub.en).toBe("Main contractor RM5,000, nominated sub-contractors RM0, nominated suppliers RM0; up to interim certificate 7 (IPC-OLD-0007); stated on IPC-OLD-0007.");
    expect(l.head.ms).toMatch(/^Dilepaskan sebelum sistem .* pelepasan pertama · RM5,000$/);
    expect(l.provenance).toBe("STATED");
  });
  it("sums the three tiers and says an assumed figure is assumed", () => {
    const l = openingReleaseLine({ ...base, provenance: "ASSUMED", note: "no certificate found; the site records", released: T("1000.00", "200.50", "0.25") })!;
    expect(l.head.en).toMatch(/· RM1,200\.75$/);
    expect(l.sub.en).toMatch(/assumed: no certificate found; the site records\.$/);
  });
  it("is null with no opening position or nothing released before the system", () => {
    expect(openingReleaseLine(null)).toBeNull();
    expect(openingReleaseLine({ ...base, released: T("0.00") })).toBeNull();
  });
  it("the card never says nothing was released while the opening position released some", () => {
    const src = readFileSync(path.join(__dirname, "../../app/projects/[id]/payment-panels.tsx"), "utf8");
    expect(src).toContain("v.p.retentionReleases.length === 0 && !openingRelease ? (");
    expect(src).toContain("{openingRelease.head.en}");
  });
});
