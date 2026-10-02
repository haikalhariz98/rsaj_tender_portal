import { describe, expect, it } from "vitest";

import { packReadiness } from "./pack";
import { partFaultText } from "./labels";
import type { PackPartFacts, TemplateFacts } from "./types";

/**
 * Phase 2 close-out 67-C1 (flagged against accepted 6.4): which mandatory parts a bidder returns is
 * frozen with the approved documents and read at the bid opening (6.7), where an unset answer refuses
 * finalising (CHECKLIST_NOT_JUDGED; the exit is to cancel the exercise). The Approval for Tendering
 * readiness says so beforehand, while it can still be set: a warning on each mandatory part whose
 * answer is unset, never a refusal. The declaration is returned by definition.
 */

const template: TemplateFacts = { id: "t", code: "t", nameEn: "T", formCode: "F", revisionDate: null, bodyEn: "Text.", bodyMs: null, primaryLanguage: null, bodyVersion: 1 };
const part = (x: Partial<PackPartFacts> = {}): PackPartFacts => ({
  partCode: "p2", printedNumber: "2", sortOrder: 20, label: "Form of tender", role: "FORM_OF_TENDER", content: "STANDARD", source: "TEMPLATE", mandatory: true, inTableDocument: true, templateCode: "t", template, state: "READY", omittedReason: "", liveUploads: 0, ...x,
});
const declaration = part({ partCode: "p9", printedNumber: "9", label: "Declaration", role: "DECLARATION", returnedByBidder: null });
const CTX = { bqFinalised: true, appendixComplete: true };
const warn = (parts: PackPartFacts[]) => packReadiness(parts, CTX).filter((f) => f.code === "RETURN_NOT_SET");

describe("a mandatory part's 'returned by the bidder' unset at approval (67-C1)", () => {
  it("warns for each mandatory part whose answer is unset, naming it", () => {
    const fs = warn([part({ returnedByBidder: null }), part({ partCode: "p3", printedNumber: "3", label: "Bill of quantities", returnedByBidder: undefined }), declaration]);
    expect(fs).toEqual([
      { code: "RETURN_NOT_SET", level: "warn", data: { part: "2. Form of tender" } },
      { code: "RETURN_NOT_SET", level: "warn", data: { part: "3. Bill of quantities" } },
    ]);
  });

  it("is a warning only: nothing else in the readiness changes, and submission is not refused by it", () => {
    const fs = packReadiness([part({ returnedByBidder: null }), declaration], CTX);
    expect(fs.filter((f) => f.level === "block")).toEqual([]);
  });

  it("asks nothing of a part set either way, a part not mandatory, or the declaration", () => {
    expect(warn([part({ returnedByBidder: true }), part({ partCode: "p4", returnedByBidder: false }), declaration])).toEqual([]);
    expect(warn([part({ mandatory: false, returnedByBidder: null, state: "OMITTED", omittedReason: "Not needed" }), declaration])).toEqual([]);
  });

  it("says it will block the opening, where to set it, and that approved documents keep the answer", () => {
    const [f] = warn([part({ returnedByBidder: null }), declaration]);
    expect(partFaultText(f)).toBe(
      "Whether a bidder returns part 2. Form of tender with the bid is not set. Approved like this, these documents keep it unset, and the bid opening will be refused when it is finalised: completeness cannot be judged against an unset answer, and the only way on then is to cancel the exercise. Set it under Configuration, Tender documents, then choose Refresh from configuration under Parts below.",
    );
    expect(partFaultText(f)).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
});
