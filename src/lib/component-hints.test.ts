import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTACH_PURPOSE_HINT, DOCUMENT_CLASS_HINT, DOCUMENT_NOTE_HINT, DOCUMENT_TITLE_HINT } from "@/lib/documents/labels";
import { PROVENANCE_HINT, PROVENANCE_NOT_SET_HINT, REASON_HINT, SIMULATOR_HINT } from "@/lib/labels";
import { REGISTRATION_HINT } from "@/lib/portal/labels";

/**
 * Phase 1 carry D6: the shared components' hints live in labels files, not as literals in the
 * components, and read on screen exactly as before (the text-snapshot diff proves it on every route).
 */

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : /\.tsx$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("component hints come from labels (D6)", () => {
  it("no component in src/components passes a hint or a provenance tooltip as a literal", () => {
    for (const f of walk("src/components")) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src, f).not.toMatch(/\bhint="[^"]/);
      expect(src, f).not.toMatch(/\bhint: "[^"]/);
      expect(src, f).not.toMatch(/\bhint=\{\s*"[^"]/);
    }
  });

  it("the moved words are the words the screens showed", () => {
    // Phase 2b: ON_BEHALF_HINT is retired (decisions log, 2026-10-07). The person who acts is the one signed in, and the shared attribution component says so; the
    // words it uses are held by act-text.test.ts.
    expect(DOCUMENT_TITLE_HINT).toBe("What this document is called in lists.");
    expect(DOCUMENT_CLASS_HINT).toBe("Decides its classification and how long it is kept. A SULIT or unclassified document is listed but never opened in the portal.");
    expect(DOCUMENT_NOTE_HINT).toBe("Optional. Anything the next reader should know about this file.");
    expect(ATTACH_PURPOSE_HINT).toBe("Where a purpose is closed, its reason is under it.");
    // Phase 1b: the trail names who made the change, so the reason is the only account of why, not of who.
    expect(REASON_HINT).toBe("Recorded in the audit trail with who made the change. This is the only account of why it was made.");
    expect(PROVENANCE_HINT).toEqual({ STATED: "Written in a governing document", OBSERVED: "Seen in practice, not written down", ASSUMED: "A working default, awaiting sign-off" });
    expect(PROVENANCE_NOT_SET_HINT).toBe("Nobody has said where this came from");
    expect(SIMULATOR_HINT).toEqual({
      contractValue: "For variations",
      percentage: "Of contract sum",
      actingOfficer: "Nobody may approve their own matter",
      absent: "Authority reverts upward, never down",
      noFundingRoute: "No funding route configured yet",
      fundingRoute: "Whether a funder overrides these limits is set per route",
    });
  });

  it("the registration steps' hints, moved into the shared components with the public form (ADR 0041), are the words the signed-in wizard showed", () => {
    expect(REGISTRATION_HINT).toEqual({
      rowTitle: "So it can be told from the others",
      expiryIfAny: "Give the date, if it has one",
      rate: "Per cent, 0 to 100",
      identityNo: "Company or identity card number",
      notEmailed: "Nothing is e-mailed from the portal.",
      oneGrade: "A certificate carries one grade.",
      several: "You may choose several.",
      // The declaration card's own words, moved here with the others (review minor), as both wizards showed them.
      declarationTitle: "Declaration",
      declarationTick: "I have read this declaration and confirm it.",
      declarationNotSet: "Declaration text not set",
      tellTheOffice: "Tell the procurement office.",
    });
  });

  it("the on-behalf hint is one constant wherever its exact words appear", () => {
    for (const f of [...walk("src/components"), ...walk("src/app")]) {
      expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toContain('"Recorded on their behalf, not signed: nobody is signed in."');
    }
  });
});
