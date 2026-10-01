import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, type OwnerFacts } from "./attach";
import { tenderPackPartFacts } from "./owner-facts";

/**
 * 6.4: a tender pack's part keeps the file that is the part (drawings, a specification)
 * while its pack is a draft; submitted, approved or returned it stands as frozen (ADR 0013).
 */

const part = (packStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED" | "VOID", source: "UPLOAD" | "TEMPLATE" = "UPLOAD", exerciseStatus: "DOCUMENTS_IN_PREPARATION" | "CANCELLED" = "DOCUMENTS_IN_PREPARATION"): OwnerFacts =>
  tenderPackPartFacts({ source, pack: { status: packStatus, exercise: { status: exerciseStatus } } });
const filed = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };

describe("a tender pack part as an attachment owner", () => {
  it("keeps a file only where its content is uploaded", () => {
    expect(purposeFits("TENDER_PART", part("DRAFT"))).toBe(true);
    expect(purposeFits("TENDER_PART", part("DRAFT", "TEMPLATE"))).toBe(false);
    expect(attachFault({ purpose: "TENDER_PART", owner: part("DRAFT", "TEMPLATE"), ...filed }).map((f) => f.code)).toEqual(["PURPOSE_NOT_FOR_OWNER"]);
    // No other purpose belongs on a part.
    expect(purposeFits("DOSSIER_EVIDENCE", part("DRAFT"))).toBe(false);
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
