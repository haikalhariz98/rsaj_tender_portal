import { describe, expect, it } from "vitest";

import { EXIT_TEXT } from "@/lib/documents/labels";
import { scopeFaultText } from "@/lib/scope/labels";
import { startFaultText } from "@/lib/tender-docs/labels";

/// 6.5: once addenda exist, the accepted modules' refusals stop saying an addendum is "not yet available".
describe("the addendum is available", () => {
  it("the approved pack's, the frozen bill's and the frozen part's words name where it is issued", () => {
    expect(startFaultText({ code: "PACK_APPROVED", level: "block" })).toMatch(/addendum, issued on the Invitation tab/);
    expect(scopeFaultText("PACK_FROZEN")).toMatch(/addendum on the Invitation tab/);
    expect(EXIT_TEXT.PACK_FROZEN).toMatch(/addendum, issued on the Invitation tab/);
    for (const t of [startFaultText({ code: "PACK_APPROVED", level: "block" }), scopeFaultText("PACK_FROZEN"), EXIT_TEXT.PACK_FROZEN]) expect(t).not.toMatch(/not yet available/);
  });
});
