import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveComposition } from "./composition";
import { partConfigFaults, PART_CONFIG_FAULT_TEXT } from "./config";
import { changeListKey, flagChanges, refreshView } from "./refresh";
import type { ConfiguredPart } from "./types";

/**
 * 6.7, flagged against accepted 6.4 (the 6.6 review's ruling): whether a bidder returns a part with
 * its bid is a configured answer with its own provenance, snapshotted onto the pack part when the
 * pack starts, as `mandatory` is, and refreshed on a draft as `mandatory` is. Unset is not set:
 * never read as "returned" or "not returned".
 */

const part = (code: string, x: Partial<ConfiguredPart> = {}): ConfiguredPart => ({
  code,
  packKind: "TENDER",
  contractBasisCode: null,
  printedNumber: code,
  sortOrder: 1,
  labelEn: `Part ${code}`,
  labelMs: null,
  role: "OTHER",
  content: "STANDARD",
  source: "UPLOAD",
  mandatory: true,
  inTableDocument: true,
  ownerOrgUnitCode: null,
  templateCode: null,
  governingSource: "",
  provenance: "ASSUMED",
  retiredOn: null,
  ...x,
});

describe("the composition carries the return answer to the pack", () => {
  it("as configured, with its provenance; unset stays unset", () => {
    const parts = [part("form", { role: "FORM_OF_TENDER", returnedByBidder: true, returnedByBidderProvenance: "STATED" }), part("conditions", { role: "CONDITIONS", returnedByBidder: false, returnedByBidderProvenance: "ASSUMED" }), part("spec", { role: "SPECIFICATION" })];
    const c = resolveComposition(parts, "TENDER", "bq", "2026-10-01");
    if (!("parts" in c)) throw new Error("no parts");
    const by = (code: string) => c.parts.find((p) => p.code === code)!;
    expect([by("form").returnedByBidder, by("form").returnedByBidderProvenance]).toEqual([true, "STATED"]);
    expect([by("conditions").returnedByBidder, by("conditions").returnedByBidderProvenance]).toEqual([false, "ASSUMED"]);
    expect([by("spec").returnedByBidder, by("spec").returnedByBidderProvenance]).toEqual([null, null]);
  });
});

describe("configuring it", () => {
  const ctx = { others: [], bases: [], templates: [], units: [], today: "2026-10-01" };
  it("an answer says where it came from", () => {
    const f = partConfigFaults(part("form", { returnedByBidder: true, returnedByBidderProvenance: null }), ctx);
    expect(f.map((x) => x.code)).toEqual(["RETURN_PROVENANCE_REQUIRED"]);
    expect(PART_CONFIG_FAULT_TEXT.RETURN_PROVENANCE_REQUIRED).toMatch(/returns this part/);
    expect(partConfigFaults(part("form", { returnedByBidder: true, returnedByBidderProvenance: "ASSUMED" }), ctx)).toEqual([]);
    expect(partConfigFaults(part("form", { returnedByBidder: null }), ctx)).toEqual([]);
  });
});

describe("refreshing a draft takes the answer configuration now gives (BD-64-39's exit)", () => {
  const draft = (returned: boolean | null) => ({ partCode: "form", printedNumber: "2", label: "Form", mandatory: true, inTableDocument: true, returnedByBidder: returned });
  it("unset on the draft, set in configuration: refreshed with its provenance, and said", () => {
    const changes = flagChanges([draft(null)], [{ code: "form", mandatory: true, inTableDocument: true, returnedByBidder: true, returnedByBidderProvenance: "STATED" }]);
    expect(changes).toEqual([{ partCode: "form", part: "2. Form", returnedByBidder: { from: null, to: true, provenance: "STATED" } }]);
    const view = refreshView([draft(null)], [{ code: "form", mandatory: true, inTableDocument: true, returnedByBidder: true, returnedByBidderProvenance: "STATED" }]);
    expect(view).toEqual({ allowed: true, changes: ["2. Form: returned by the bidder, not set to yes"] });
  });
  it("a not-set answer in configuration never replaces the draft's", () => {
    expect(flagChanges([draft(true)], [{ code: "form", mandatory: true, inTableDocument: true, returnedByBidder: null }])).toEqual([]);
  });
  it("the confirmation key tells a return change from the others", () => {
    const a = changeListKey([{ partCode: "f", part: "F", returnedByBidder: { from: null, to: true, provenance: "ASSUMED" } }]);
    const b = changeListKey([{ partCode: "f", part: "F", mandatory: { from: null, to: true } }]);
    expect(a).not.toBe(b);
  });
});

describe("the pack part snapshots it when the pack starts", () => {
  it("startPack writes both columns from the composition", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/actions.ts"), "utf8");
    expect(src).toMatch(/returnedByBidder: p\.returnedByBidder \?\? null,\s*\n\s*returnedByBidderProvenance: p\.returnedByBidderProvenance \?\? null,/);
  });
});
