import { describe, expect, it } from "vitest";

import { titleFor } from "./job-title";

describe("titleFor", () => {
  it("uses the Malay title when Malay is chosen and one is recorded", () => {
    expect(titleFor({ jobTitle: "Clerk", jobTitleMs: "Kerani" }, "ms")).toBe("Kerani");
  });
  it("keeps the title as recorded in English, or when no Malay one is recorded or it is blank", () => {
    expect(titleFor({ jobTitle: "Clerk", jobTitleMs: "Kerani" }, "en")).toBe("Clerk");
    expect(titleFor({ jobTitle: "Clerk" }, "ms")).toBe("Clerk");
    expect(titleFor({ jobTitle: "Clerk", jobTitleMs: "  " }, "ms")).toBe("Clerk");
    expect(titleFor({ jobTitle: null, jobTitleMs: null }, "ms")).toBeNull();
  });
});
