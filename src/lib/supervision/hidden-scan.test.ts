import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FR-SUP-002–004 (Phase 3d): acts outside a representative's delegated scope are hidden from them, mapped from the session. The rule is `hiddenActsFor` (tested in
 * `authority.test.ts`); this holds the screens to it: the pages that offer the acts ask it for the signed-in person (never for a person named in a form), and each drawer that
 * opens a supervision act is left off when its act is hidden. A drawer added for an act without being listed here is a drawer a delegate sees outside their letter.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), ...rel.split("/")), "utf8");
const CONTRACT = "src/app/projects/[id]";

describe("the pages ask for the acts hidden from the signed-in representative", () => {
  for (const file of [`${CONTRACT}/page.tsx`, `${CONTRACT}/variations/[variationId]/page.tsx`]) {
    it(`${file} asks hiddenActsFor for the actor's own person, and not for a system run`, () => {
      const text = read(file);
      expect(text).toMatch(/hiddenActsFor\(actor\.personId,/);
      expect(text).toMatch(/!actor\.system/);
      expect(text).not.toMatch(/hiddenActsFor\(\s*(?!actor\.personId)/);
    });
  }
});

describe("each drawer that opens a supervision act is left off when its act is hidden", () => {
  const SITES: [string, string, string][] = [
    [`${CONTRACT}/supervision-panels.tsx`, "ScrutinyDrawer", "PROGRAMME_SCRUTINY"],
    [`${CONTRACT}/supervision-panels.tsx`, "ProgressDrawer", "PROGRESS"],
    [`${CONTRACT}/supervision-panels.tsx`, "DiaryEntryDrawer", "DIARY"],
    [`${CONTRACT}/supervision-panels.tsx`, "ObservationDrawer", "OBSERVATION"],
    [`${CONTRACT}/payment-panels.tsx`, "OpenValuationDrawer", "VALUATION"],
    [`${CONTRACT}/variation-panels.tsx`, "VariationRecordDrawer", "VARIATION_APPLICATION"],
    [`${CONTRACT}/variation-panels.tsx`, "AdjustmentDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "VariationRecordDrawer", "VARIATION_APPLICATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "InstructionDrawer", "INSTRUCTION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "DayworkDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "MeasurementDrawer", "VALUATION"],
    [`${CONTRACT}/variations/[variationId]/page.tsx`, "OrderDrawer", "VALUATION"],
  ];
  for (const [file, drawer, act] of SITES) {
    it(`${drawer} in ${file.split("/").slice(-2).join("/")} is gated on ${act}`, () => {
      const text = read(file);
      const at = text.indexOf(`<${drawer}`);
      expect(at, `${drawer} is rendered`).toBeGreaterThan(0);
      // The gate stands in the statement that renders the drawer: within the 300 characters before its first use that is not a list item of another drawer.
      expect(text.slice(Math.max(0, at - 300), at)).toContain(`hidden.includes("${act}")`);
    });
  }
});
