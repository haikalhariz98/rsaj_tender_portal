import { describe, expect, it } from "vitest";

import { EXIT_TEXT } from "@/lib/documents/labels";
import { scopeFaultText } from "@/lib/scope/labels";
import { startFaultText } from "@/lib/tender-docs/labels";

/// 6.5: once addenda exist, the accepted modules' refusals stop saying an addendum is "not yet available".
describe("the addendum is available", () => {
  it("the approved pack's, the frozen bill's and the frozen part's words name where it is issued", () => {
    // SR-06 (ruling 9): the Invitation tab is gone; an addendum is issued under Publishing on Tender documents.
    expect(startFaultText({ code: "PACK_APPROVED", level: "block" })).toMatch(/addendum, issued under Publishing on Tender documents/);
    expect(scopeFaultText("PACK_FROZEN")).toMatch(/addendum under Publishing on Tender documents/);
    // 0005, founder 2026-10-19: shortened; it still names where the addendum is issued.
    expect(EXIT_TEXT.PACK_FROZEN).toMatch(/addendum under Publishing on Tender documents/);
    for (const t of [startFaultText({ code: "PACK_APPROVED", level: "block" }), scopeFaultText("PACK_FROZEN"), EXIT_TEXT.PACK_FROZEN]) expect(t).not.toMatch(/not yet available/);
  });
});
