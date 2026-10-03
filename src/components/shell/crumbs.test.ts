import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { crumbTrail } from "./topbar";

/**
 * 6.14 inc 1 fix S-1: the certificate's, the routing sheet type's and the form's breadcrumbs name their
 * records and their sections, and no crumb links to a page that does not exist.
 */

const APP = path.join(__dirname, "../../app");

/// Whether a path (its query dropped) has a page: each segment a folder of that name, or a dynamic [folder].
function hasPage(href: string): boolean {
  const segs = href.split("?")[0].split("/").filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segs.length) return existsSync(path.join(dir, "page.tsx"));
    const exact = path.join(dir, segs[i]);
    if (existsSync(exact) && walk(exact, i + 1)) return true;
    return readdirSync(dir, { withFileTypes: true }).some((d) => d.isDirectory() && /^\[[^.]+\]$/.test(d.name) && walk(path.join(dir, d.name), i + 1));
  };
  return walk(APP, 0);
}

const trail = (p: string, name: string | null, parent: string | null = null) => crumbTrail(p.split("/").filter(Boolean), name, parent);
const labels = (c: { label: string }[]) => c.map((x) => x.label);

describe("breadcrumbs of the certificate core's pages (S-1)", () => {
  it("a certificate: Projects › its contract › Documents (the contract's tab) › the certificate", () => {
    const c = trail("/projects/demo_con3/certificates/demo_hct1", "DEMO/CERT/1", "XI202600799");
    expect(labels(c)).toEqual(["Projects", "XI202600799", "Documents", "DEMO/CERT/1"]);
    expect(c[2].href).toBe("/projects/demo_con3?tab=documents");
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
  });
  it("before the page names them, the crumbs say what kind of record, never a key or \"Details\"", () => {
    expect(labels(trail("/projects/demo_con3/certificates/demo_hct1", null))).toEqual(["Projects", "Contract", "Documents", "Certificate"]);
  });
  it("a routing sheet type: Configuration › Routing sheets › the type", () => {
    const c = trail("/configuration/routing-sheets/demo_hrt1", "Demo interim certificate routing sheet");
    expect(labels(c)).toEqual(["Configuration", "Routing sheets", "Demo interim certificate routing sheet"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
    expect(labels(trail("/configuration/routing-sheets", null))).toEqual(["Configuration", "Routing sheets"]);
  });
  it("a form: Configuration › Templates › the form (as Committees)", () => {
    const c = trail("/configuration/templates/demo_dt30", "Demo interim certificate");
    expect(labels(c)).toEqual(["Configuration", "Templates", "Demo interim certificate"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
    expect(labels(trail("/configuration/committees/TENDER_BOARD", "Tender Board"))).toEqual(["Configuration", "Committees", "Tender Board"]);
  });
  it("the contract itself is unchanged: Projects › its number", () => {
    expect(labels(trail("/projects/demo_con3", "XI202600799"))).toEqual(["Projects", "XI202600799"]);
  });
  it("the page check itself finds a missing page", () => {
    expect(hasPage("/projects/demo_con3/certificates")).toBe(false);
  });
});
