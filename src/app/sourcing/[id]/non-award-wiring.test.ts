import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

// AC-22 (C-5): regret letters belong to the sourcing exercise's Award tab, not to the award.
describe("the notices to unsuccessful tenderers live on the exercise", () => {
  it("the action revalidates the exercise and no longer the award", () => {
    const src = read("src/app/sourcing/[id]/non-award-actions.ts");
    expect(src).toContain("revalidatePath(`/sourcing/" + "$" + "{exerciseId}`)");
    expect(src).not.toContain("/awards/");
    expect(src).toContain("withLockedAwardFor");
  });
  it("the exercise's Award tab renders the live award's notices and the earlier ones, only while that tab is open", () => {
    const src = read("src/app/sourcing/[id]/page.tsx");
    expect(src).toMatch(/tab === "award" \? \(\s*<>[\s\S]*NonAwardPanel[\s\S]*EarlierNoticesPanel/);
  });
  it("the award page has no notices tab", () => {
    const src = read("src/app/awards/[id]/page.tsx");
    expect(src).not.toContain("NonAwardPanel");
    expect(src).not.toContain('id: "notices"');
  });
  it("the earlier notices have no way to issue one", () => {
    const src = read("src/app/sourcing/[id]/non-award-panel.tsx");
    const earlier = src.slice(src.indexOf("export async function EarlierNoticesPanel"));
    expect(earlier).not.toContain("IssueNoticeDrawer");
  });
});
