import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decisionFaults, warningFaults } from "@/lib/lad/non-completion";
import { paymentFaultWords } from "@/lib/payment/labels";
import { variationFaultWords } from "@/lib/variation/labels";

import { formNeedFault, noFormFault, raiseFormFault } from "./form-needs";
import { KIND_WORDS } from "./labels";

/**
 * 6.14 increment 2 intake 1 (BD-613-96): one form rule at raise, `raiseFormFault`. Only TEMPLATE_NOT_SET refuses at raise
 * (a form with no text is the not-ready callout, refused at the first signature and issue: BD-614-23). Part A's raise acts
 * go through it (against accepted Part A): FORM_NOT_SET is retired, and its refusal now names the need and where its form
 * is chosen, in English and Malay (614b-C6).
 */

describe("raiseFormFault (intake 1)", () => {
  const need = KIND_WORDS.INTERIM_PAYMENT;
  it("a form chosen passes at raise, whether or not it has text yet", () => {
    expect(raiseFormFault({ id: "t1" }, need)).toBeNull();
  });
  it("none chosen refuses TEMPLATE_NOT_SET, the same finding as formNeedFault's", () => {
    expect(raiseFormFault(null, need)).toEqual(formNeedFault(null, need));
    expect(raiseFormFault(null, need)).toEqual({ code: "TEMPLATE_NOT_SET", level: "block", data: { need: "Interim payment certificate", needMs: "Perakuan bayaran interim", setAt: "POST_AWARD" } });
    expect(noFormFault("VARIATION")).toEqual(raiseFormFault(null, KIND_WORDS.VARIATION));
  });
  it("never TEMPLATE_BODY_EMPTY at raise", () => {
    expect(raiseFormFault({ id: "t1" }, need)?.code).toBeUndefined();
  });
});

describe("Part A's raises through it (flagged against accepted Part A)", () => {
  const LAD = { dateForCompletion: "2026-08-31", rate: 26938n, eotClause: "43", ladClause: "40", extendedCompletion: "2026-08-31", liveWarning: false };
  it("the damages warning letter and the Certificate of Non-Completion refuse naming their need", () => {
    const w = warningFaults({ ...LAD, formSet: false }).find((f) => f.code === "TEMPLATE_NOT_SET");
    expect(w?.data).toEqual({ need: KIND_WORDS.LAD_WARNING.en, needMs: KIND_WORDS.LAD_WARNING.ms, setAt: "POST_AWARD" });
    expect(warningFaults({ ...LAD, formSet: true }).some((f) => f.code === "TEMPLATE_NOT_SET")).toBe(false);
    const d = decisionFaults({ outcome: "LAD_APPLIES", reason: "x", dateForCompletion: "2026-08-31", today: "2026-10-01", scope: null, section: null, wholeRate: null, warning: null, eotClause: "", ladClause: "", insuranceExpiry: null, expectedCompletion: null, windowFrom: null, windowUntil: null, pack: [], formSet: false });
    expect(d.find((f) => f.code === "TEMPLATE_NOT_SET")?.data).toEqual({ need: KIND_WORDS.NON_COMPLETION.en, needMs: KIND_WORDS.NON_COMPLETION.ms, setAt: "POST_AWARD" });
  });
  it.each(["INTERIM_PAYMENT", "ADVANCE_PAYMENT", "LAD_WARNING", "NON_COMPLETION"] as const)("payment's words for %s name the need and where it is set, EN and MS", (k) => {
    const words = paymentFaultWords(noFormFault(k));
    expect(words.en).toBe(`No form is chosen for “${KIND_WORDS[k].en}”. Choose it under Configuration › Post-award controls.`);
    expect(words.ms).toBe(`Tiada borang dipilih bagi “${KIND_WORDS[k].ms}”. Pilih di Konfigurasi › Kawalan selepas setuju terima.`);
  });
  it.each(["SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] as const)("variation's words for %s name the need and where it is set, EN and MS", (k) => {
    const words = variationFaultWords(noFormFault(k));
    expect(words.en).toBe(`No form is chosen for “${KIND_WORDS[k].en}”. Choose it under Configuration › Post-award controls.`);
    expect(words.ms).toBe(`Tiada borang dipilih bagi “${KIND_WORDS[k].ms}”. Pilih di Konfigurasi › Kawalan selepas setuju terima.`);
  });
});

describe("FORM_NOT_SET is retired (source scan)", () => {
  const ROOT = path.join(__dirname, "../../..");
  const files = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir)).flatMap((f) => {
      const rel = path.join(dir, f);
      if (rel === path.normalize("src/generated")) return [];
      return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
    });
  it("no product file raises or words it; the schedule-form and routing-sheet refusals stay their own (not merged, with the reason)", () => {
    const hits = [...files("src"), ...files("prisma")].filter((f) => /["']FORM_NOT_SET["']/.test(readFileSync(path.join(ROOT, f), "utf8")));
    expect(hits).toEqual([]);
  });
});
