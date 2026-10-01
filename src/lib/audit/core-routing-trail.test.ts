import { describe, expect, it } from "vitest";

import {
  CORE_ROUTING_ENTITIES,
  CORE_ROUTING_ENTITY_NAME,
  coreRoutingEntryLabel,
  coreRoutingEntryName,
  coreRoutingTrailPrefix,
} from "./core-routing-trail";

describe("core routing trail labels", () => {
  it("names a row and a step beneath it", () => {
    expect(coreRoutingEntryLabel("Issue 3", "Director")).toBe("Issue 3 — core routing: Director");
    expect(coreRoutingEntryLabel("Issue 3", "Director", "Treasurer")).toBe("Issue 3 — core routing: Director — Treasurer");
  });

  it("every label written is found again by the issue's prefix, and by no other issue's", () => {
    const label = coreRoutingEntryLabel("Issue 3", "Director", "Treasurer");
    expect(label.startsWith(coreRoutingTrailPrefix("Issue 3"))).toBe(true);
    expect(label.startsWith(coreRoutingTrailPrefix("Issue 2"))).toBe(false);
    expect(coreRoutingEntryName(label, "Issue 2")).toBeNull();
  });

  it("reads which part an entry is about, without the issue", () => {
    expect(coreRoutingEntryName("Issue 3 — core routing: Director — Treasurer", "Issue 3")).toBe("Core routing: Director — Treasurer");
    expect(coreRoutingEntryName("Issue 3 — core routing:", "Issue 3")).toBe("Core routing");
  });

  it("has a plain name for each record type", () => {
    for (const e of CORE_ROUTING_ENTITIES) expect(CORE_ROUTING_ENTITY_NAME[e]).toMatch(/^Core routing \w+$/);
  });
});
