// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildSupplierExport, type SourceRow, type SupplierExport, type SupplierExportSource } from "@/lib/suppliers/data-export";
import { EXPORT_PAGE_WORDS, EXPORT_SECTION_ORDER, EXPORT_SECTION_TITLE, leftOutWords } from "@/lib/suppliers/data-export-words";

import { DataExportView } from "./data-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const NONE: SourceRow[] = [];

/// Real output of `buildSupplierExport`, so the page is tested against real dates, sizes and labels: one document with one file, a sign-in moment late in the UTC evening.
function sample(): SupplierExport {
  const src: SupplierExportSource = {
    organisationName: "Test organisation",
    accountId: "acc1",
    supplier: { id: "s1", reference: "SUP-0001", registeredName: "Acme Sdn Bhd", incorporatedOn: new Date("2019-03-01T00:00:00Z") },
    lists: { entityType: {}, country: {}, state: {}, bumiputeraClaim: {}, bank: {}, bankAccountType: {} },
    contacts: [{ row: { id: "c1", name: "Aini", isPrimary: true }, open: true, account: { id: "acc1", loginName: "aini", status: "ACTIVE", createdAt: new Date("2026-05-05T03:00:00Z"), lastSignInAt: new Date("2026-10-18T23:30:00.000Z") } }],
    declarations: NONE,
    bank: [],
    documents: [
      {
        row: { id: "d1", verification: "NOT_CHECKED", lodgedOn: new Date("2026-10-01T00:00:00Z") },
        values: [],
        files: [{ id: "v1", originalFilename: "ssm.pdf", mediaType: "application/pdf", byteSize: BigInt(245760), storedAt: new Date("2026-10-01T02:00:00Z") }],
      },
    ],
    standing: null,
    standingChanges: NONE,
    applications: [],
    purchases: [],
    bidReceipts: [],
    projectDocuments: [],
    kickOffMeetings: [],
    workItems: [],
  };
  return buildSupplierExport(src, { generatedAt: new Date("2026-10-19T01:00:00Z"), timeZone: "Asia/Kuala_Lumpur", officeName: "" });
}

function draw(token: string | null) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(createElement(DataExportView, { data: sample(), fileToken: token, liveLinks: new Map<string, true>([["v1", true]]), timeZone: "Asia/Kuala_Lumpur" })));
  return el;
}

describe("the printable page of a supplier's own data (N2)", () => {
  it("shows every section title exactly, the left-out line, and no configuration key", () => {
    const el = draw("tok");
    const headings = [...el.querySelectorAll("h2, h3")].map((h) => h.textContent);
    for (const key of EXPORT_SECTION_ORDER) expect(headings).toContain(EXPORT_SECTION_TITLE[key]);
    const text = el.textContent ?? "";
    for (const x of leftOutWords("", "SUP-0001")) expect(text).toContain(x);
    // Keys that cannot be English words; and no UPPER_SNAKE code.
    expect(text).not.toMatch(/standingChanges|bidReceipts/);
    expect(text).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
  });

  it("formats moments in the organisation's zone, days as days, and sizes as sizes, never raw ISO or raw bytes", () => {
    const text = draw("tok").textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(text).not.toContain("245760");
    expect(text).toContain("240 KB");
    // 23:30 UTC on the 18th is 07:30 on the 19th in Kuala Lumpur.
    expect(text).toMatch(/19 Oct 2026/);
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

describe("the page's download control", () => {
  it("is a plain anchor with the download attribute, never a client-side Link (a Link fetches the URL itself, and each fetch is an export)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/supplier/account/data/page.tsx"), "utf8");
    expect(src).not.toMatch(/ButtonLink|from "next\/link"/);
    expect(src).toMatch(/<a [^>]*href=\{`\$\{SUPPLIER_DATA_EXPORT\.file\}[^>]*\bdownload\b/);
    expect(EXPORT_PAGE_WORDS.download).toBeTruthy();
  });
});
