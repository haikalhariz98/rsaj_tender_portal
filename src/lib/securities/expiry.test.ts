import { describe, expect, it } from "vitest";

import { expiryAlert } from "./expiry";

describe("expiry alerts from the notification rule's offsets", () => {
  it("offsets 30 and 7 with seven days left give the seven-day alert", () => {
    expect(expiryAlert("2026-10-07", [30, 7], "2026-09-30")).toEqual({ state: "DUE", offset: 7, daysLeft: 7 });
  });
  it("twenty days left gives the thirty-day alert", () => {
    expect(expiryAlert("2026-10-20", [30, 7], "2026-09-30")).toEqual({ state: "DUE", offset: 30, daysLeft: 20 });
  });
  it("no offsets: no alert before expiry", () => {
    expect(expiryAlert("2026-10-07", [], "2026-09-30")).toEqual({ state: "NONE", daysLeft: 7 });
  });
  it("past its expiry: expired, whatever the offsets", () => {
    expect(expiryAlert("2026-09-20", [], "2026-09-30")).toEqual({ state: "EXPIRED", daysAgo: 10 });
  });
  it("no expiry recorded is said, not alerted", () => {
    expect(expiryAlert(null, [30], "2026-09-30")).toEqual({ state: "NO_EXPIRY" });
  });
});
