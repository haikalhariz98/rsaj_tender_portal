import { describe, expect, it } from "vitest";

import { classClassificationChoices, classClassificationFault, documentClassificationChoices, isLowering, lowers, reclassifyFault } from "./classification";
import { classificationChoiceText, documentFaultText, REUPLOAD_EXIT } from "./labels";
import { SECURITY_CLASSES, type SecurityClass } from "./types";
import { classificationForm } from "./views";

/**
 * BD-DS-11 as ruled (2026-10-01): every classification downgrade is refused until
 * maker-checker, Internal to Public included; the refusal names "upload again under the
 * right class, then withdraw the old version". A set classification is never unset, on a
 * document or on its class. Security audit C-4: an unset document is not set below its
 * class's classification as it stands now.
 */

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const ALL: (SecurityClass | null)[] = [null, ...SECURITY_CLASSES];
const RANK = { PUBLIC: 0, INTERNAL: 1, SULIT: 2 } as const;
const NO_CODE = /[A-Z]{2,}_[A-Z_]+/;

describe("a document's classification: every lowering is refused", () => {
  it("SULIT to Internal, SULIT to Public and Internal to Public are each refused, with a reason given", () => {
    expect(codes(reclassifyFault("SULIT", "INTERNAL", "Declassified by the owner"))).toEqual(["DOWNGRADE_FROM_SULIT"]);
    expect(codes(reclassifyFault("SULIT", "PUBLIC", "Declassified by the owner"))).toEqual(["DOWNGRADE_FROM_SULIT"]);
    expect(codes(reclassifyFault("INTERNAL", "PUBLIC", "Published on the website"))).toEqual(["DOWNGRADE_FROM_INTERNAL"]);
  });

  it("the refusal names the way out: upload again under the right class, then withdraw the old version", () => {
    for (const [from, to] of [["SULIT", "INTERNAL"], ["SULIT", "PUBLIC"], ["INTERNAL", "PUBLIC"]] as const) {
      const t = documentFaultText(reclassifyFault(from, to, "x")[0]);
      expect(t).toContain(REUPLOAD_EXIT);
      // 0005, founder 2026-10-19: refusal shortened.
      expect(t).toMatch(/Upload it again under the right class, then withdraw the old version/);
      expect(t).toMatch(/needs a second person/);
      expect(t).not.toMatch(NO_CODE);
    }
    expect(documentFaultText(reclassifyFault("INTERNAL", "PUBLIC", "x")[0])).toBe(
      `Lowering from Internal to Public needs a second person. Propose it with “Lower the classification”. ${REUPLOAD_EXIT}`,
    );
  });

  it("raising is allowed, with a reason", () => {
    expect(reclassifyFault("PUBLIC", "INTERNAL", "Holds staff names")).toEqual([]);
    expect(reclassifyFault("PUBLIC", "SULIT", "Holds the estimate")).toEqual([]);
    expect(reclassifyFault("INTERNAL", "SULIT", "Holds the estimate")).toEqual([]);
    expect(codes(reclassifyFault("PUBLIC", "SULIT", " "))).toEqual(["REASON_REQUIRED"]);
  });

  it("a set classification is never unset, from any level", () => {
    for (const c of SECURITY_CLASSES) expect(codes(reclassifyFault(c, null, "x"))).toEqual(["CANNOT_UNSET"]);
  });

  it("exhaustively: allowed exactly where it is set or raised, never unset, never lowered (no class bound)", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = to != null && from !== to && (from == null || RANK[to] > RANK[from]);
        expect(reclassifyFault(from, to, "a reason").length === 0, `${from} -> ${to}`).toBe(allowed);
        if (to != null) expect(lowers(from, to)).toBe(from != null && RANK[to] < RANK[from]);
      }
    }
  });
});

describe("an unset document is not set below its class's classification as it stands now (C-4)", () => {
  it("class since made SULIT: Public and Internal refused, SULIT allowed", () => {
    expect(codes(reclassifyFault(null, "PUBLIC", "Old letter", "SULIT"))).toEqual(["BELOW_CLASS_CLASSIFICATION"]);
    expect(codes(reclassifyFault(null, "INTERNAL", "Old letter", "SULIT"))).toEqual(["BELOW_CLASS_CLASSIFICATION"]);
    expect(reclassifyFault(null, "SULIT", "Old letter", "SULIT")).toEqual([]);
  });
  it("class Internal: Public refused; Internal and SULIT allowed", () => {
    expect(codes(reclassifyFault(null, "PUBLIC", "x", "INTERNAL"))).toEqual(["BELOW_CLASS_CLASSIFICATION"]);
    expect(reclassifyFault(null, "INTERNAL", "x", "INTERNAL")).toEqual([]);
    expect(reclassifyFault(null, "SULIT", "x", "INTERNAL")).toEqual([]);
  });
  it("class still unset, or Public: any classification may be set", () => {
    for (const to of SECURITY_CLASSES) {
      expect(reclassifyFault(null, to, "x", null)).toEqual([]);
      expect(reclassifyFault(null, to, "x", "PUBLIC")).toEqual([]);
    }
  });
  it("the refusal names the class's classification and the same way out", () => {
    const t = documentFaultText(reclassifyFault(null, "PUBLIC", "x", "SULIT")[0]);
    expect(t).toMatch(/^Its class is now classified SULIT, so it is not set lower than that by one person/);
    expect(t).toMatch(/Set it to SULIT or higher\./);
    expect(t).toContain(REUPLOAD_EXIT);
    expect(t).not.toMatch(NO_CODE);
  });
  it("a document already set keeps its own rule: the class does not bound it", () => {
    expect(reclassifyFault("INTERNAL", "SULIT", "x", "PUBLIC")).toEqual([]);
    expect(codes(reclassifyFault("INTERNAL", "PUBLIC", "x", "PUBLIC"))).toEqual(["DOWNGRADE_FROM_INTERNAL"]);
  });
});

describe("a document class's classification (Configuration › Documents)", () => {
  it("a new or unset class may take anything, and stay unset", () => {
    for (const to of ALL) expect(classClassificationFault(null, to)).toEqual([]);
  });
  it("once set it never goes back to Not set", () => {
    for (const c of SECURITY_CLASSES) expect(codes(classClassificationFault(c, null))).toEqual(["CLASS_CLASSIFICATION_UNSET"]);
    expect(documentFaultText(classClassificationFault("INTERNAL", null)[0])).toBe("A class's classification, once set, is not taken away: documents filed under it took it. Keep it at Internal, or raise it.");
  });
  it("lowering is refused the same way, Internal to Public included", () => {
    expect(codes(classClassificationFault("SULIT", "INTERNAL"))).toEqual(["CLASS_DOWNGRADE"]);
    expect(codes(classClassificationFault("SULIT", "PUBLIC"))).toEqual(["CLASS_DOWNGRADE"]);
    expect(codes(classClassificationFault("INTERNAL", "PUBLIC"))).toEqual(["CLASS_DOWNGRADE"]);
    const t = documentFaultText(classClassificationFault("INTERNAL", "PUBLIC")[0]);
    expect(t).toMatch(/^Lowering a class's classification from Internal to Public is not done by one person/);
    expect(t).toMatch(/upload them again under it, then withdraw the old versions/);
    expect(t).not.toMatch(NO_CODE);
  });
  it("unchanged (the editor posts it back on every save) and raising are allowed", () => {
    for (const c of SECURITY_CLASSES) expect(classClassificationFault(c, c)).toEqual([]);
    expect(classClassificationFault("PUBLIC", "SULIT")).toEqual([]);
    expect(classClassificationFault("INTERNAL", "SULIT")).toEqual([]);
  });
});

describe("the screens offer only the allowed choices, the rest with the reason", () => {
  const view = (cs: ReturnType<typeof classClassificationChoices>) => cs.map((c) => [c.value, c.allowed, classificationChoiceText(c)]);

  it("the class editor, once Internal: Not set and Public listed with why, Internal and SULIT offered", () => {
    expect(view(classClassificationChoices("INTERNAL"))).toEqual([
      [null, false, "Not set — a set classification is not taken away"],
      ["PUBLIC", false, "Public — lowering needs a second approver"],
      ["INTERNAL", true, "Internal"],
      ["SULIT", true, "SULIT"],
    ]);
  });
  it("the class editor, unset: everything offered", () => {
    expect(classClassificationChoices(null).every((c) => c.allowed)).toBe(true);
  });
  it("each choice agrees with the check the save runs", () => {
    for (const from of ALL) for (const c of classClassificationChoices(from)) expect(c.allowed).toBe(classClassificationFault(from, c.value).length === 0);
    for (const from of ALL) for (const cls of ALL) for (const c of documentClassificationChoices(from, cls)) expect(c.allowed).toBe(reclassifyFault(from, c.value, "a reason", cls).length === 0);
  });
  it("the document drawer, Internal: Public listed with why, Internal is its classification now, SULIT offered", () => {
    expect(classificationForm("INTERNAL", "INTERNAL")).toEqual({
      classificationChoices: [
        { value: "PUBLIC", label: "Public — lowering needs a second approver", disabled: true },
        { value: "INTERNAL", label: "Internal — its classification now", disabled: true },
        { value: "SULIT", label: "SULIT", disabled: false },
      ],
      classificationLocked: null,
    });
  });
  it("the document drawer, unset under a SULIT class: only SULIT offered", () => {
    expect(classificationForm(null, "SULIT").classificationChoices).toEqual([
      { value: "PUBLIC", label: "Public — below its class's classification, needs a second approver", disabled: true },
      { value: "INTERNAL", label: "Internal — below its class's classification, needs a second approver", disabled: true },
      { value: "SULIT", label: "SULIT", disabled: false },
    ]);
  });
  it("a SULIT document can be changed no way at all: the action is disabled, saying why and the way out", () => {
    const f = classificationForm("SULIT", "SULIT");
    expect(f.classificationChoices.every((c) => c.disabled)).toBe(true);
    expect(f.classificationLocked).toMatch(/^Lowering from SULIT needs a second person/);
    expect(f.classificationLocked).toContain(REUPLOAD_EXIT);
  });
});

// Phase 5a (ADR 0034 D15, BD-DS-11): the lowering a second person decides. The same rules but for the refusal of a lowering, and only a lowering is judged this way.
describe("a lowering that a second person decides", () => {
  it("is allowed for every lowering, with a reason, and for nothing else", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        for (const cls of ALL) {
          const faults = codes(reclassifyFault(from, to, "The owner released it", cls, { viaSecondPerson: true }));
          if (to == null) expect(faults).toEqual(["CANNOT_UNSET"]);
          else if (from === to) expect(faults).toEqual(["UNCHANGED"]);
          else if (isLowering(from, to, cls)) expect(faults).toEqual([]);
          else expect(faults).toEqual(["NOT_A_LOWERING"]);
        }
      }
    }
  });

  it("needs its reason, like every classification change", () => {
    expect(codes(reclassifyFault("SULIT", "INTERNAL", "", undefined, { viaSecondPerson: true }))).toEqual(["REASON_REQUIRED"]);
    expect(codes(reclassifyFault("SULIT", "INTERNAL", "   ", undefined, { viaSecondPerson: true }))).toEqual(["REASON_REQUIRED"]);
  });

  it("reads an unset document set below its class's classification as a lowering, and never as one when it is set at or above it", () => {
    expect(isLowering(null, "PUBLIC", "SULIT")).toBe(true);
    expect(isLowering(null, "SULIT", "SULIT")).toBe(false);
    expect(isLowering(null, "PUBLIC", null)).toBe(false);
    expect(isLowering("INTERNAL", "SULIT", "SULIT")).toBe(false);
    expect(codes(reclassifyFault(null, "PUBLIC", "x", "SULIT", { viaSecondPerson: true }))).toEqual([]);
  });

  it("is, for a class, only a set classification lowered to a lower one", () => {
    for (const from of ALL) for (const to of ALL) expect(classClassificationFault(from, to, { viaSecondPerson: true }).length === 0).toBe(from != null && to != null && lowers(from, to));
    expect(classClassificationFault("SULIT", "INTERNAL", { viaSecondPerson: true })).toEqual([]);
    expect(codes(classClassificationFault("PUBLIC", "SULIT", { viaSecondPerson: true }))).toEqual(["NOT_A_LOWERING"]);
  });

  it("leaves the refusal for one person as it was", () => {
    expect(codes(reclassifyFault("SULIT", "INTERNAL", "x"))).toEqual(["DOWNGRADE_FROM_SULIT"]);
    expect(codes(classClassificationFault("SULIT", "INTERNAL"))).toEqual(["CLASS_DOWNGRADE"]);
  });

  it("says in words, never a code, what a form that lowers refuses", () => {
    const t = documentFaultText(reclassifyFault("PUBLIC", "SULIT", "x", undefined, { viaSecondPerson: true })[0]);
    expect(t).toBe("This form only lowers. Use the classification form to set or raise.");
  });
});
