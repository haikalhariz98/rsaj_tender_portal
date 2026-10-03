import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/// BD-613-40 (approved with condition): a guarantee below the advance is said, not refused, and shown on the
/// approving step of the advance certificate's route, not only on the contract.
describe("the guarantee shortfall on the approving step", () => {
  const page = readFileSync(path.join(__dirname, "../../app/projects/[id]/certificates/[certId]/page.tsx"), "utf8");
  it("read for an advance certificate, shown on the step whose act is approve, and above the route", () => {
    expect(page).toMatch(/cert\.kind === "ADVANCE_PAYMENT" \? await advanceGuaranteeShortfall\(cert\.id\) : null/);
    expect(page).toMatch(/\{apgShort && step\.act === "A" && <Chip tone="warn">\{apgShort\.en\}<\/Chip>\}/);
    expect(page.match(/\{apgCard\}/g)).toHaveLength(2);
  });
  it("a warning, never a refusal", () => {
    expect(page).toMatch(/paymentFaultWords\(\{ code: "APG_BELOW_ADVANCE", level: "warn"/);
  });
});
