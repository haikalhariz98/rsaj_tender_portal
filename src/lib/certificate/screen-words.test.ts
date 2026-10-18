import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { certificateFaultWords } from "./fault-text";

/**
 * 6.14 inc 1 fix S-2: the printed routing sheet's own words stay off the product's screens. "DATE (1)",
 * "DATE (2)", "TARIKH (1)", the "CPD/DFA" form series and the "ICC" column are the printed form's labels
 * (increment 2's label pairs print them); a screen says "received", "approved" and "target". Comments, which
 * cite the spec, are not screen text.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const PRINTED = /DATE \(\d\)|DATE \d\b|TARIKH \(\d\)|CPD\/DFA|\bICC\b/;
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");

const SCREENS = [
  "src/components/certificate/routing-sheet.tsx",
  "src/app/projects/[id]/certificates/[certId]/page.tsx",
  "src/app/projects/[id]/certificates/[certId]/editors.tsx",
  "src/app/projects/[id]/certificates/[certId]/actions.ts",
  "src/app/projects/[id]/award/routing-sheet-panel.tsx",
  "src/app/awards/[id]/routing-actions.ts",
  "src/app/projects/[id]/documents-panel.tsx",
  "src/lib/nav.ts",
  "src/lib/certificate/sheet-words.ts",
  "src/lib/certificate/labels.ts",
  ...readdirSync(path.join(ROOT, "src/app/configuration/routing-sheets"), { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/app/configuration/routing-sheets/${f}`),
];

describe("the printed sheet's labels stay off the screens (S-2)", () => {
  it.each(SCREENS)("%s", (f) => {
    expect(code(read(f))).not.toMatch(PRINTED);
  });
  it("no refusal says them either, in English or Malay", () => {
    const src = read("src/lib/certificate/fault-text.ts");
    const codes = [...src.matchAll(/case "([A-Z_]+)":/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(80);
    for (const c of codes) {
      const w = certificateFaultWords({ code: c, level: "block", data: { day: "2026-10-02", form: "F", fields: "{{contract.date}}" } });
      expect(w.en, c).not.toMatch(PRINTED);
      expect(w.ms, c).not.toMatch(PRINTED);
      expect(w.en, c).not.toMatch(/key "certificate"|kunci "certificate"/);
    }
  });
  // Changed at 6.13 Part A step 2 as the facts changed: a delegation now raises its letters, so the tab says what
  // raises a certificate and what is not built yet, rather than that nothing does. Changed again at 6.13 Part A's
  // acceptance (S-3), faithfully, as the facts changed: Payments and Variations now raise the others, so the tab names
  // them and no longer says they are not built (its empty message too).
  it("the contract's Documents tab names no module number and says what raises a certificate (S-3)", () => {
    const src = code(read("src/app/projects/[id]/documents-panel.tsx"));
    expect(src).toMatch(/A delegation to a representative raises its letters under Team; the advance payment, the interim payment certificates, the warning letter and the Certificate of Non-Completion are raised under Payments; a variation's application, the S\.O\.'s instruction, the Variation Order Certificate and the adjustments of the contract sum under Variations\./);
    expect(src).toMatch(/None is raised on this contract\. A delegation under Team raises its letters; Payments raises the advance, interim, warning and non-completion certificates; Variations raises a variation's application, instruction and order, and the adjustments of the contract sum\./);
    expect(src).not.toMatch(/not built yet/);
    expect(src).not.toMatch(/\b6\.1\d\b|post-award module/);
  });
});
