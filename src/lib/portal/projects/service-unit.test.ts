import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SERVICE_UNIT_ASSUMED, SERVICE_UNIT_ASSUMED_NOTE } from "./labels";

// Decisions log, 2026-10-09, ruling on 1924(B): the service level's unit is an ASSUMPTION (calendar days), said so on the editor and on the configuration page.
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("the service level's unit is shown as assumed", () => {
  it("is worded as an assumption in both languages", () => {
    expect(SERVICE_UNIT_ASSUMED.en).toMatch(/assumed/i);
    expect(SERVICE_UNIT_ASSUMED_NOTE.en).toMatch(/assumption/i);
    expect(SERVICE_UNIT_ASSUMED.ms).toMatch(/andaian/i);
    expect(SERVICE_UNIT_ASSUMED_NOTE.ms).toMatch(/andaian/i);
  });
  it("is what the editor and the configuration page say, not a bare 'calendar days'", () => {
    const editor = read("src/app/configuration/post-award/editors.tsx");
    const editorFn = editor.slice(editor.indexOf("export function EditSubmissionServiceLevel"), editor.indexOf("export function EditContractorPortalSigning"));
    expect(editorFn).toContain("SERVICE_UNIT_ASSUMED_NOTE.en");
    expect(editorFn).toContain("SERVICE_UNIT_ASSUMED.en");
    expect(editorFn).not.toMatch(/label: "Calendar days"/);
    const page = read("src/app/configuration/post-award/page.tsx");
    expect(page).toContain("SERVICE_UNIT_ASSUMED_NOTE.en");
    expect(page).toContain("SERVICE_UNIT_ASSUMED.en.toLowerCase()");
    expect(page).not.toMatch(/\$\{x\.serviceLevelDays\} calendar days/);
  });
});
