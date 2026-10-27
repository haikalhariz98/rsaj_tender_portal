import { describe, expect, it } from "vitest";
import { VALIDITY_ALERT_EVENT } from "@/lib/bids/validity";
import { NOT_CARRIED_EVENT_KEY } from "@/lib/committee/labels";
import { CLOCK_EVENT_KEY } from "@/lib/inbox/clock-plan";
import { DLP_EVENT_KEY } from "@/lib/closeout/dlp";
import { SUPPLIER_EXPIRY_EVENT } from "@/lib/suppliers/expiry";
import { eventLabel, eventOptions, NOTIFICATION_EVENTS } from "./events";

describe("notification events", () => {
  it("lists every key the code reads", () => {
    const keys = NOTIFICATION_EVENTS.map((e) => e.key);
    expect(keys).toEqual(
      expect.arrayContaining([VALIDITY_ALERT_EVENT, NOT_CARRIED_EVENT_KEY, SUPPLIER_EXPIRY_EVENT, "security.expiring", ...Object.values(CLOCK_EVENT_KEY), DLP_EVENT_KEY]),
    );
  });
  it("labels are words, not keys", () => {
    expect(NOTIFICATION_EVENTS.every((e) => /^[A-Z][A-Za-z' ]+$/.test(e.label))).toBe(true);
  });
  it("offers only events without a rule, and names an unlisted one plainly", () => {
    expect(eventOptions(["security.expiring"]).some((o) => o.value === "security.expiring")).toBe(false);
    expect(eventLabel("old.key")).toBe("An event no longer listed");
  });
});
