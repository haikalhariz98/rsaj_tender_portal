import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, type OwnerFacts } from "./attach";
import { documentFaultText } from "./labels";
import { tenderPackPartFacts } from "./owner-facts";

/**
 * 6.4: a tender pack's part keeps the file that is the part (drawings, a specification)
 * while its pack is a draft; submitted, approved or returned it stands as frozen (ADR 0013).
 */

const part = (packStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | "VOID", source: "UPLOAD" | "TEMPLATE" | "APPENDIX" | "BQ_UNPRICED" = "UPLOAD", exerciseStatus: "DOCUMENTS_IN_PREPARATION" | "CANCELLED" = "DOCUMENTS_IN_PREPARATION", onScreenBillUsed: boolean | null = true, liveFiles = 0): OwnerFacts =>
  tenderPackPartFacts({ source, pack: { status: packStatus, exercise: { status: exerciseStatus, onScreenBillUsed } }, _count: { attachments: liveFiles } });
const filed = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };

describe("a tender pack part as an attachment owner", () => {
  it("keeps a file where its content is uploaded, or where a file replaces its merged text (SR-11); never the Appendix, which stays a form", () => {
    expect(purposeFits("TENDER_PART", part("DRAFT"))).toBe(true);
    // SR-11, ADR 0035 (was: a merged-text part took no file): an uploaded file replaces the merged text as the issued part.
    expect(purposeFits("TENDER_PART", part("DRAFT", "TEMPLATE"))).toBe(true);
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "TEMPLATE"), ...filed })).toEqual([]);
    expect(purposeFits("TENDER_PART", part("DRAFT", "APPENDIX"))).toBe(false);
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "APPENDIX"), ...filed }).map((f) => f.code)).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    // No other purpose belongs on a part.
    expect(purposeFits("DOSSIER_EVIDENCE", part("DRAFT"))).toBe(false);
  });

  it("the bill part keeps a file only where the exercise does not build its bill on screen (SR-09), and the bill is one file", () => {
    expect(purposeFits("TENDER_PART", part("DRAFT", "BQ_UNPRICED", "DOCUMENTS_IN_PREPARATION", true))).toBe(false);
    expect(purposeFits("TENDER_PART", part("DRAFT", "BQ_UNPRICED", "DOCUMENTS_IN_PREPARATION", null))).toBe(false);
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "BQ_UNPRICED", "DOCUMENTS_IN_PREPARATION", false), ...filed })).toEqual([]);
    // One file: a second is refused and told to replace; the same file again is the ordinary refusal.
    const f = attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "BQ_UNPRICED", "DOCUMENTS_IN_PREPARATION", false, 1), ...filed });
    expect(f.map((x) => x.code)).toEqual(["BILL_IS_ONE_FILE"]);
    expect(documentFaultText(f[0])).toMatch(/Use Replace/);
    // Other uploaded parts may hold several files, as before.
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "UPLOAD", "DOCUMENTS_IN_PREPARATION", true, 3), ...filed })).toEqual([]);
  });

  it("is open while its pack is a draft, and frozen once it was submitted", () => {
    expect(ownerState("TENDER_PART", part("DRAFT"))).toEqual({ state: "OPEN" });
    for (const s of ["SUBMITTED", "APPROVED", "RETURNED", "VOID"] as const) {
      expect(ownerState("TENDER_PART", part(s))).toEqual({ state: "FROZEN", exit: "PACK_FROZEN" });
      expect(attachFault({ purpose: "TENDER_PART", owner: part(s), ...filed }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
      expect(detachFault({ purpose: "TENDER_PART", owner: part(s), reason: "wrong file", reliedOn: null }).map((f) => f.code)).toEqual(["OWNER_FROZEN"]);
    }
  });

  it("is frozen with a cancelled exercise, saying so", () => {
    expect(ownerState("TENDER_PART", part("DRAFT", "UPLOAD", "CANCELLED"))).toEqual({ state: "FROZEN", exit: "EXERCISE_CANCELLED" });
  });

  it("attaches a filed version to a draft pack's uploaded part", () => {
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT"), ...filed })).toEqual([]);
  });
});
