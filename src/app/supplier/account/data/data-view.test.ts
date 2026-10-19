// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { SupplierExport } from "@/lib/suppliers/data-export";
import { EXPORT_PAGE_WORDS, EXPORT_SECTION_ORDER, EXPORT_SECTION_TITLE, leftOutWords } from "@/lib/suppliers/data-export-words";
import { w } from "@/lib/contract/labels";

import { DataExportView } from "./data-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

/// A small export built by hand: every section present, one with a row holding a file and a nested row, the rest empty.
function sample(): SupplierExport {
  return {
    format: "perolehan-supplier-export",
    version: 1,
    generatedAt: "2026-10-19T01:00:00.000Z",
    organisation: "Test organisation",
    supplier: { reference: "SUP-0001", name: "Acme Sdn Bhd" },
    sections: EXPORT_SECTION_ORDER.map((key) => ({
      key,
      title: EXPORT_SECTION_TITLE[key],
      rows: key === "documents" ? [{ label: w("Document", "Dokumen"), value: w("In order", "Teratur"), files: [{ name: "ssm.pdf", type: "PDF", size: "10 KB", lodgedOn: "2026-10-01", versionId: "v1", path: "/x" }], rows: [{ label: w("Expires", "Tamat"), value: "2027-01-01" }] }] : [],
    })),
    leftOut: leftOutWords("", "SUP-0001"),
  } as SupplierExport;
}

function draw(token: string | null) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(createElement(DataExportView, { data: sample(), fileToken: token, liveLinks: new Map<string, true>([["v1", true]]) })));
  return el;
}

describe("the printable page of a supplier's own data (N2)", () => {
  it("shows every section title and the left-out notice in English, and no configuration key", () => {
    const text = draw("tok").textContent ?? "";
    for (const key of EXPORT_SECTION_ORDER) {
      expect(text).toContain(EXPORT_SECTION_TITLE[key].en);
    }
    expect(text).toContain(EXPORT_PAGE_WORDS.leftOutTitle);
    for (const x of leftOutWords("", "SUP-0001")) {
      expect(text).toContain(x.en);
    }
    expect(text).toContain("the procurement office");
    for (const key of EXPORT_SECTION_ORDER) if (key !== "company") expect(text).not.toMatch(new RegExp(`\b${key}\b`));
    expect(text).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
  });

  it("links a document only with the page's token, and says its name without a link when there is none", () => {
    const withToken = draw("tok").querySelector("a");
    expect(withToken?.getAttribute("href")).toBe("/supplier/registration/file?id=v1&t=tok");
    act(() => root?.unmount());
    document.body.innerHTML = "";
    const el = draw(null);
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toContain("ssm.pdf");
  });
});
