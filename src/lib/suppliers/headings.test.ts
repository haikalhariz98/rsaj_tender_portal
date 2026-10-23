import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { asHeading, conditionWords } from "./labels";

/**
 * 6.15a fix S-4 (b) and (c): a registration body's label is written to sit inside a sentence ("registered
 * with the Demo Contractors Board"); as a heading or at the start of a line it starts with a capital. The
 * document types table fits the 944px content column at 1280, so Edit and Retire stay in view.
 */

describe("body labels as headings (fix S-4 c)", () => {
  it("capitalises the first letter only, leaving the rest as configured", () => {
    expect(asHeading("the Demo Contractors Board")).toBe("The Demo Contractors Board");
    expect(asHeading("CIDB")).toBe("CIDB");
    expect(asHeading("")).toBe("");
  });

  it("a condition row that starts with the body starts with a capital", () => {
    expect(conditionWords({ reason: "COVERS_WINDOW", data: { body: "the Demo Contractors Board" } }).en).toBe("The Demo Contractors Board: verified and in force from the advertisement to past the closing.");
    expect(conditionWords({ reason: "NOT_HELD", data: { body: "the Demo Tax Office" } }).en).toBe("The Demo Tax Office: no verified document on file.");
  });

  it("the configuration headings and the value and requirement labels use it (source)", () => {
    const cfg = readFileSync("src/app/configuration/suppliers/page.tsx", "utf8");
    expect(cfg).toMatch(/title=\{<>\{asHeading\(b\.labelEn\)\}/);
    expect(readFileSync("src/app/suppliers/[id]/page.tsx", "utf8")).toMatch(/label: `\$\{asHeading\(b\.labelEn\)\}: \$\{v\.nameEn\}`/);
    expect(readFileSync("src/app/suppliers/link-actions.ts", "utf8")).toMatch(/const reqLabel = `\$\{asHeading\(req\.bodyLabelSnapshot\)\}/);
  });
});

describe("the document types table fits the column at 1280 (fix S-4 b)", () => {
  it("its minimum width is within the 944px content column, with room to spare", () => {
    const cfg = readFileSync("src/app/configuration/suppliers/page.tsx", "utf8");
    const at = cfg.indexOf('id="types"');
    const min = Number(/<Table minWidth=\{(\d+)\}>/.exec(cfg.slice(at))?.[1]);
    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(920);
  });
});
