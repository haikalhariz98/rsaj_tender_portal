import { describe, expect, it } from "vitest";

import { CASE_SECTION_WORDS, CASE_TAB_WORDS } from "@/lib/contract/case-page-words";
import { CASE_TABS } from "@/lib/contract/case-tabs";
import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";

import { takenUpWhere } from "./taken-up";

/** Where a taken-up kind is recorded (PW-9, PW-24; plan §11 item 3), and that every place named is a real tab and section of the Project stage. */

describe("takenUpWhere", () => {
  it("the programme on Site › Possession and progress; claims and materials on Payments › Valuations; the rest nowhere yet", () => {
    expect(takenUpWhere("WORK_PROGRAMME")).toEqual({ stage: "project", tab: "site", section: "start" });
    expect(takenUpWhere("INTERIM_CLAIM")).toEqual({ stage: "project", tab: "payments", section: "valuations" });
    expect(takenUpWhere("MATERIALS_ON_SITE")).toEqual({ stage: "project", tab: "payments", section: "valuations" });
    expect(takenUpWhere("DELAY_NOTICE")).toBeNull();
    expect(takenUpWhere("DEFECTS_RECTIFIED")).toBeNull();
    expect(takenUpWhere("STATUTORY_DECLARATION")).toBeNull();
  });

  it("every place named is a Project-stage tab with a worded section", () => {
    for (const k of SUBMISSION_KINDS) {
      const w = takenUpWhere(k);
      if (!w) continue;
      expect(CASE_TABS.project, k).toContain(w.tab);
      expect(CASE_TAB_WORDS[w.tab], k).toBeDefined();
      expect(CASE_SECTION_WORDS[`${w.tab}.${w.section}`], k).toBeDefined();
    }
  });
});
