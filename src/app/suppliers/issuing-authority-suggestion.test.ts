import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Dropdown sweep 2 (founder 2026-10-24): "Issued by" offers the document type's registration body as a suggestion where one is set, and stays typed (a certificate may come
 * from any authority). Nothing is pre-filled, so an untouched row is still an untouched row.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("issuing authority is suggested from the document type's registration body", () => {
  it("the officer's lodge drawer follows the chosen type", () => {
    expect(read("src/app/suppliers/[id]/editors.tsx")).toMatch(/name: "issuingAuthority"[^\n]*suggestBy: \{ name: "typeId", options: authorityByType \}/);
    expect(read("src/app/suppliers/[id]/page.tsx")).toMatch(/b\.labelEn/);
  });

  it("the portal's rows and replace drawer carry the body and offer it in a list", () => {
    expect(read("src/components/registration/documents-fields.tsx")).toMatch(/body: string \| null/);
    expect(read("src/components/registration/documents-fields.tsx")).toMatch(/<datalist id=\{fid\("authority-list"\)\}>/);
    expect(read("src/app/supplier/company/replace-drawer.tsx")).toMatch(/<datalist id=\{id\("authority-list"\)\}>/);
    expect(read("src/app/supplier/register/registration-wizard.tsx")).toMatch(/body: config\.context\.bodies\.find/);
    expect(read("src/app/supplier/registration/page.tsx")).toMatch(/body: ctx\.bodies\.find/);
  });
});
