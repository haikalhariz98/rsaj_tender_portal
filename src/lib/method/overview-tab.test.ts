import { describe, expect, it } from "vitest";

import { activeTabOf, invitationRedirect, invitationRedirectHref } from "./overview-tab";

const available = ["overview", "scope", "documents", "award", "history"];

describe("which tab an exercise address names (founder, 2026-10-05)", () => {
  it("the old Classification and Contract type addresses open the Overview", () => {
    expect(activeTabOf("classification", available)).toBe("overview");
    expect(activeTabOf("contract", available)).toBe("overview");
  });
  it("no tab, or the Overview itself, is the Overview", () => {
    expect(activeTabOf(undefined, available)).toBe("overview");
    expect(activeTabOf("", available)).toBe("overview");
    expect(activeTabOf("overview", available)).toBe("overview");
  });
  it("a tab the exercise has is that tab", () => {
    expect(activeTabOf("documents", available)).toBe("documents");
    expect(activeTabOf("history", available)).toBe("history");
  });
  it("a tab it does not have (a Proposal tab on a method that asks for none) is the Overview, as the strip opens it", () => {
    expect(activeTabOf("proposal", available)).toBe("overview");
    expect(activeTabOf("nonsense", available)).toBe("overview");
  });
});

describe("where an old Invitation address lands (SR-06, ruling 9)", () => {
  it("the window, and no section named: Publishing once live, Notice and fee before", () => {
    expect(invitationRedirect(undefined, true)).toEqual({ tab: "documents", section: "publishing" });
    expect(invitationRedirect("window", true)).toEqual({ tab: "documents", section: "publishing" });
    expect(invitationRedirect(undefined, false)).toEqual({ tab: "scope", section: "notice" });
    expect(invitationRedirect("window", false)).toEqual({ tab: "scope", section: "notice" });
  });
  it("the sale register is Sales and briefing, the addenda are Publishing, whatever the stage", () => {
    for (const live of [true, false]) {
      expect(invitationRedirect("sales", live)).toEqual({ tab: "bids", section: "sales" });
      expect(invitationRedirect("addenda", live)).toEqual({ tab: "documents", section: "publishing" });
    }
  });
  it("the briefings are Sales and briefing once live, and Briefing and site visit while they are being prepared", () => {
    expect(invitationRedirect("briefing", true)).toEqual({ tab: "bids", section: "sales" });
    expect(invitationRedirect("briefing", false)).toEqual({ tab: "scope", section: "briefing" });
  });
  it("a section it does not know lands as the window does, and the address is the exercise's own", () => {
    expect(invitationRedirect("nonsense", true)).toEqual({ tab: "documents", section: "publishing" });
    expect(invitationRedirectHref("e1", "sales", true)).toBe("/sourcing/e1?tab=bids&section=sales");
  });
});
