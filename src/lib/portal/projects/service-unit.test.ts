import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OPERATIONS } from "@/app/configuration/_editors/operations";

import * as labels from "./labels";
import { serviceWords } from "./labels";

// Founder, 2026-10-19: English only.
//
// Rewritten for plan step 6 (PW-27). This file held the service-level editor to saying its unit (calendar days) was an assumption (decisions log, 2026-10-09, ruling on
// 1924(B)). PW-27 took that editor off Configuration in the step that moved the six kinds into the Project workspace, which has no due days (PW-4); the table and its rows stay.
// The guarantee that still applies is the honesty behind 1924(B): no screen states a service level the product no longer sets. So this file now holds that the editor, its
// operation and its words are gone, that nothing reads the settings to show a live service level or a "not set" prompt, and that an earlier row with no stored due day says so
// plainly.
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("the service-level editor has left Configuration (PW-27)", () => {
  it("no editor, no action, no operation a change can carry, and no section on the page", () => {
    expect(read("src/app/configuration/post-award/editors.tsx")).not.toMatch(/EditSubmissionServiceLevel|serviceLevelDays/);
    expect(read("src/app/configuration/post-award/actions.ts")).not.toMatch(/saveSubmissionServiceLevel/);
    expect(read("src/app/configuration/post-award/core.ts")).not.toMatch(/export async function saveSubmissionServiceLevel|contractorSubmissionSetting\./);
    expect(Object.keys(OPERATIONS)).not.toContain("post-award.saveSubmissionServiceLevel");
    const page = read("src/app/configuration/post-award/page.tsx");
    expect(page).not.toMatch(/contractorSubmissionSetting|serviceLevel|Answer times by kind/);
    // The words that qualified the unit went with it: no screen states a service level now.
    expect(Object.keys(labels)).not.toContain("SERVICE_UNIT_ASSUMED");
    expect(Object.keys(labels)).not.toContain("SERVICE_NOT_SET");
  });

  it("nothing reads the settings to show a live service level or a 'not set' prompt: the queue and the portal tab read only what each row stored", () => {
    // Plan step 6: `src/app/projects/submissions-panel.tsx` left with the earlier queue's screen (the one Documents list holds earlier records now), so the guard follows to the screens that show an earlier record: the shared card, the contract's Documents tab, the Documents waiting view and the portal's panels.
    const readers = ["src/lib/portal/projects/review-store.ts", "src/lib/portal/projects/workspace-store.ts", "src/components/earlier-record-card.tsx", "src/app/projects/[id]/submissions-tab.tsx", "src/app/projects/documents-waiting-view.tsx", "src/app/supplier/projects/[id]/panels.tsx"];
    for (const f of readers) {
      const src = read(f);
      expect(src, f).not.toMatch(/contractorSubmissionSetting|unsetKinds|serviceLevels|SERVICE_NOT_SET|post-award/);
    }
  });

  it("a row with no stored due day says 'No due day', never a setting", () => {
    expect(serviceWords({ state: "NOT_SET" }).text).toBe("No due day");
    expect(serviceWords({ state: "NOT_SET" }).text).not.toMatch(/service level|not set|configuration/i);
  });
});
