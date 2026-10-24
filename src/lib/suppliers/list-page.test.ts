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
  it("the watched lists are a bounded number of suppliers", () => {
    expect(SUPPLIERS_PAGE).toBeGreaterThan(0);
    expect(SUPPLIERS_PAGE).toBeLessThanOrEqual(100);
  });

  it("the register: one page under the search and the view, in the list's order, skipped and taken; a page past the end shows the last (7.4)", () => {
    expect(body).toMatch(/orderBy: listOrderBy\("supplier", register\),\s*\.\.\.\(opts\.all === "register" \? \{ take: LIST_EXPORT_MAX_ROWS \+ 1 \} : \{ skip: at \* register\.size, take: register\.size \}\)/);
    expect(body).toMatch(/const at = opts\.all === "register" \? 0 : Math\.min\(Math\.max\(0, register\.page\), Math\.max\(0, Math\.ceil\(total \/ register\.size\) - 1\)\)/);
    expect(body).toMatch(/wordsWhere\("supplier", register\.words\)/);
  });

  it("selects, never includes whole rows; the register reads only its open application", () => {
    expect(body).not.toMatch(/include:/);
    expect(body).toMatch(/applications: \{ where: OPEN_APPLICATION, orderBy: .*, take: 1,/);
    expect(body).not.toMatch(/standingEvents: true/);
  });

  it("the applications are searched, judged and paged in the list's own order; the derived lists are bounded and counted in the database", () => {
    expect(body).toMatch(/wordsWhere\("application", apps\.words\)/);
    expect(body).toMatch(/orderBy: listOrderBy\("application", apps\)/);
    expect(body.match(/take: SUPPLIERS_PAGE/g)?.length).toBe(4);
    expect(body).toMatch(/client\.supplierApplication\.count\(/);
    expect(body).toMatch(/client\.supplier\.count\(\{ where: barredWhere \}\)/);
    // The Expiring list reaches no further than the furthest band.
    expect(body).toMatch(/expiresOn: horizon \? \{ not: null, lte: dayToDate\(horizon\) \} : \{ not: null \}/);
  });

  it("the page reads the register's query from the address, judges the documents to see to over the whole register, and links the tab's pages through the list", () => {
    // Phase 1c (ADR 0034 D10): the list is the signed-in person's organisation's; the page and the day are as pinned.
    expect(page).toMatch(/listSuppliers\(actor\.organisationId, registerQ, today, /);
    expect(page).toMatch(/documentsToSeeToIds\(org0\.id, cfg\.typeFacts, today\)/);
    expect(page).toMatch(/server=\{tabMode\("register", registerQ, /);
    expect(page).toMatch(/server=\{tabMode\("applications", applicationsQ, /);
    // The tab is kept across the search and the paging: the form carries it, and every link is made on the tab's own address.
    expect(page).toMatch(/serverMode\(`\/suppliers\?tab=\$\{id\}`, q, /);
    expect(page).toMatch(/keep: \{ tab: id, \.\.\.m\.keep \}/);
  });
});
