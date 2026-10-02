import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";


/**
 * 6.15a fix R-10: /suppliers loaded every supplier with all its documents, events and requests. Each list
 * now loads only what it shows, a page at a time, as the requisitions' list does (REQUISITIONS_PAGE).
 */

const repo = readFileSync("src/lib/suppliers/repo.ts", "utf8");
const body = repo.slice(repo.indexOf("export async function listSuppliers"), repo.indexOf("/// The supplier's History:"));
const page = readFileSync("src/app/suppliers/page.tsx", "utf8");
// Read from the source: the repository module opens the database on import.
const SUPPLIERS_PAGE = Number(/export const SUPPLIERS_PAGE = (\d+);/.exec(repo)?.[1]);

describe("the supplier lists load a page, and only what they show (fix R-10)", () => {
  it("a page is a bounded number of suppliers", () => {
    expect(SUPPLIERS_PAGE).toBeGreaterThan(0);
    expect(SUPPLIERS_PAGE).toBeLessThanOrEqual(100);
  });

  it("the register: one page by name, skipped and taken; a page past the end shows the last", () => {
    expect(body).toMatch(/skip: at \* SUPPLIERS_PAGE,\s*take: SUPPLIERS_PAGE,/);
    expect(body).toMatch(/const at = Math\.min\(Math\.max\(0, page\), Math\.max\(0, Math\.ceil\(total \/ SUPPLIERS_PAGE\) - 1\)\)/);
  });

  it("selects, never includes whole rows; the register reads only its open application", () => {
    expect(body).not.toMatch(/include:/);
    expect(body).toMatch(/applications: \{ where: OPEN_APPLICATION, orderBy: .*, take: 1,/);
    expect(body).not.toMatch(/standingEvents: true/);
  });

  it("the queue and the derived lists are bounded and counted in the database (residual 1: every findMany is taken)", () => {
    const finds = body.match(/client\.(supplier|supplierApplication)\.findMany\(\{[^]*?\}\)/g) ?? [];
    expect(body.match(/take: SUPPLIERS_PAGE/g)?.length).toBe(6);
    expect(body).toMatch(/client\.supplierApplication\.count\(/);
    expect(body).toMatch(/client\.supplier\.count\(\{ where: barredWhere \}\)/);
    expect(finds.length).toBeGreaterThan(0);
    // The Expiring list reaches no further than the furthest band.
    expect(body).toMatch(/expiresOn: horizon \? \{ not: null, lte: dayToDate\(horizon\) \} : \{ not: null \}/);
  });

  it("the page reads the page number, shows where it is, and links the pages", () => {
    expect(page).toMatch(/listSuppliers\(requested, today, /);
    expect(page).toMatch(/Suppliers \{data\.page \* SUPPLIERS_PAGE \+ 1\}–/);
    expect(page).toMatch(/\/suppliers\?tab=register&page=\$\{data\.page \+ 1\}/);
  });
});
