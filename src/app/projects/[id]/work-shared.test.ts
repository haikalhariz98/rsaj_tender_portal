import { describe, expect, it } from "vitest";

import { DRAWER_WIDTH } from "@/components/ui/drawer";

import { WORK_PANEL_PAD, WORK_PANEL_SIZE } from "./work-shared";

describe("the Work item panel's width", () => {
  it("is the padding the list keeps clear of it", () => {
    expect(WORK_PANEL_PAD).toBe(DRAWER_WIDTH[WORK_PANEL_SIZE].replace("w-", "xl:pr-"));
  });
});
