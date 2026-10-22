import { describe, expect, it } from "vitest";

import { ctx, NOTICE, TERMS_SHA } from "@/lib/portal/registration/fixture";

import type { PublicApplicationBody } from "./contract";
import { blockingPublicFaults, firstPublicBlockedStep, publicApplicationFaults, publicFaultViews, type PublicFault } from "./faults";
import { body, FILES, step1 } from "./fixture";
import { heldDraft } from "./held-draft";

/// Every rule of the one submission, as the server judges it at Submit and the browser at each Next (ADR 0041 D1, REG-1, plan 8.1).
const judge = (b: PublicApplicationBody, files: ReadonlyMap<string, number> = FILES, statements = 1, c = ctx(), s = step1()): PublicFault[] => publicApplicationFaults(b, heldDraft(b, files, statements), c, s);
const blocks = (fs: readonly PublicFault[]) => blockingPublicFaults(fs).map((f) => [f.step, f.code, f.field ?? null]);

describe("the whole application, judged at once", () => {
  it("a complete application has nothing in its way", () => {
    expect(blocks(judge(body()))).toEqual([]);
    expect(firstPublicBlockedStep(judge(body()))).toBeNull();
  });

  it("the browser and the server give the same faults for the same input: one pure function", () => {
    const b = body({ signatory: { name: "", designation: "" } });
    expect(judge(b)).toEqual(judge(structuredClone(b)));
  });

  it("returns a fault from each of the five steps, each with its step and field", () => {
    const b = body({
      company: { ...body().company, registeredName: "" },
      documents: [body().documents[0]!, { ...body().documents[1]!, valueIds: ["v-g1", "v-g2"] }],
      creditor: { ...body().creditor, bankCode: "" },
      agreements: body().agreements.map((a) => (a.kind === "TERMS_AND_CONDITIONS" ? { ...a, confirmed: false } : a)),
    });
    const fs = blocks(judge(b, new Map([["new:works", 1]])));
    expect(fs).toEqual(expect.arrayContaining([
      ["company", "NAME_REQUIRED", "registeredName"],
      ["documents", "FILE_REQUIRED", expect.stringContaining("new:reg")],
      ["codes", "ONE_GRADE_ONLY", expect.stringContaining("new:works")],
      ["epayment", "FIELD_REQUIRED", "creditor.bankCode"],
      ["review", "NOT_CONFIRMED", "terms"],
    ]));
    expect(firstPublicBlockedStep(judge(b))).toBe("company");
  });

  it("a text past the form's length is named beside its field, on its step", () => {
    const b = body({ company: { ...body().company, registeredName: "x".repeat(241) }, documents: [{ ...body().documents[0]!, reference: "r".repeat(121) }, body().documents[1]!] });
    const fs = blocks(judge(b));
    expect(fs).toEqual(expect.arrayContaining([["company", "TOO_LONG", "registeredName"], ["documents", "TOO_LONG", "documents.new:reg.reference"]]));
    const words = publicFaultViews(judge(b)).find((v) => v.field === "registeredName")!;
    expect(words.message).toBe("Registered name must be 240 characters or fewer.");
  });

  it("the statement and the files are counted from what was sent, never from what the body says", () => {
    expect(blocks(judge(body(), FILES, 0))).toEqual([["epayment", "STATEMENT_REQUIRED", expect.anything()]]);
    // No file sent for either row: each is refused for its missing file (the mandatory rule says so as well).
    expect(blocks(judge(body(), new Map(), 1)).filter((f) => f[1] === "FILE_REQUIRED").map((f) => f[2])).toEqual([expect.stringContaining("new:reg"), expect.stringContaining("new:works")]);
  });
});

describe("the agreements (REG-4)", () => {
  const terms = (o: Partial<PublicApplicationBody["agreements"][number]>) => body({ agreements: body().agreements.map((a) => (a.kind === "TERMS_AND_CONDITIONS" ? { ...a, ...o } : a)) });

  it("refuses the terms unticked, missing, on a stale text, or with a stale notice, at step 5 beside the terms card", () => {
    expect(blocks(judge(terms({ confirmed: false })))).toEqual([["review", "NOT_CONFIRMED", "terms"]]);
    expect(blocks(judge(body({ agreements: body().agreements.filter((a) => a.kind !== "TERMS_AND_CONDITIONS") })))).toEqual([["review", "NOT_CONFIRMED", "terms"]]);
    expect(blocks(judge(terms({ textVersionId: "text-terms-0" })))).toEqual([["review", "TEXT_STALE", "terms"]]);
    expect(blocks(judge(terms({ textSha256: "0".repeat(64) })))).toEqual([["review", "TEXT_STALE", "terms"]]);
    expect(blocks(judge(body({ noticeSha256: TERMS_SHA })))).toEqual([["review", "TEXT_STALE", "terms"]]);
    expect(blocks(judge(body({ noticeSha256: "" })))).toEqual([["review", "TEXT_STALE", "terms"]]);
    expect(publicFaultViews(judge(terms({ confirmed: false })))).toContainEqual({ step: "review", field: "terms", level: "block", message: "Tick the agreement to submit." });
  });

  it("with no terms text or no Personal Data Notice, step 5 names what is missing", () => {
    const noTerms = ctx({ texts: { ...ctx().texts, TERMS_AND_CONDITIONS: null } });
    expect(blocks(judge(body(), FILES, 1, noTerms))).toEqual([["review", "TEXT_NOT_SET", "terms"]]);
    expect(publicFaultViews(judge(body(), FILES, 1, noTerms)).map((v) => v.message)).toContain("The Terms and Conditions text is not set. Tell the procurement office.");
    expect(blocks(judge(body(), FILES, 1, ctx({ personalDataNotice: null })))).toEqual([["review", "PRIVACY_NOTICE_NOT_SET", "terms"]]);
  });

  it("the false declaration keeps its own tick, and the GIRO tick stays on step 4", () => {
    const fd = body({ agreements: body().agreements.map((a) => (a.kind === "FALSE_DECLARATION" ? { ...a, confirmed: false } : a)) });
    expect(blocks(judge(fd))).toEqual([["review", "NOT_CONFIRMED", "declaration.confirmed"]]);
    const giro = body({ agreements: body().agreements.map((a) => (a.kind === "GIRO_AUTHORISATION" ? { ...a, confirmed: false } : a)) });
    expect(blocks(judge(giro)).every((f) => f[0] === "epayment")).toBe(true);
  });

  it("the notice in force is the one the fixture shows", () => {
    expect(ctx().personalDataNotice).toEqual(NOTICE);
  });
});

describe("a wording changed during the visit (review SHOULD 3)", () => {
  const stale = (kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION") => body({ agreements: body().agreements.map((a) => (a.kind === kind ? { ...a, textVersionId: `${a.textVersionId}-old` } : a)) });
  it("is found on the tick, once, so it goes when the box is ticked again on the wording now shown", () => {
    expect(blocks(judge(stale("FALSE_DECLARATION")))).toEqual([["review", "TEXT_STALE", "declaration.confirmed"]]);
    expect(blocks(judge(stale("GIRO_AUTHORISATION"))).filter((f) => f[1] === "TEXT_STALE")).toEqual([["epayment", "TEXT_STALE", "giro.confirmed"]]);
  });
  it("is said without asking for a reload, which would lose everything held", () => {
    for (const k of ["GIRO_AUTHORISATION", "FALSE_DECLARATION"] as const) {
      const words = publicFaultViews(judge(stale(k))).filter((v) => v.level === "block").map((v) => v.message);
      expect(words.length).toBeGreaterThan(0);
      for (const m of words) expect(m).not.toMatch(/reload/i);
    }
    expect(publicFaultViews(judge(body({ noticeSha256: TERMS_SHA }))).map((v) => v.message).join(" ")).not.toMatch(/reload/i);
  });
});
