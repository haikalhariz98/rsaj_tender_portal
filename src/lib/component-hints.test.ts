import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTACH_PURPOSE_HINT, DOCUMENT_CLASS_HINT, DOCUMENT_NOTE_HINT, DOCUMENT_TITLE_HINT, ON_BEHALF_HINT } from "@/lib/documents/labels";
import { PROVENANCE_HINT, PROVENANCE_NOT_SET_HINT, REASON_HINT, SIMULATOR_HINT } from "@/lib/labels";

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
    // Phase 1b: someone is signed in now, and the history names them, so the hint no longer says nobody is. The person picked is still only recorded, not signing.
    expect(ON_BEHALF_HINT).toBe("Recorded on their behalf, not signed: the officer who is signed in records it, and the history names them.");
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

  it("the on-behalf hint is one constant wherever its exact words appear", () => {
    for (const f of [...walk("src/components"), ...walk("src/app")]) {
      expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toContain('"Recorded on their behalf, not signed: nobody is signed in."');
    }
  });
});
