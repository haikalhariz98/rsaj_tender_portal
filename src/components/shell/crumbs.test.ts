import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STAFF_NAV } from "@/lib/nav";

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
// AC-63 N1 (NFR-LNG-001, ADR 0040): a crumb's label is `Words`; these assertions read the English, as they always did.
const labels = (c: { label: { en: string } }[]) => c.map((x) => x.label.en);

describe("breadcrumbs of the certificate core's pages (S-1)", () => {
  it("a certificate: Projects › its contract › Certificates (a section of the contract's Documents tab since WS-5) › the certificate", () => {
    const c = trail("/projects/demo_con3/certificates/demo_hct1", "DEMO/CERT/1", "XI202600799");
    expect(labels(c)).toEqual(["Projects", "XI202600799", "Certificates", "DEMO/CERT/1"]);
    expect(c[2].href).toBe("/projects/demo_con3?stage=project&tab=submissions&section=certificates");
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
  });
  it("before the page names them, the crumbs say what kind of record, never a key or \"Details\"", () => {
    expect(labels(trail("/projects/demo_con3/certificates/demo_hct1", null))).toEqual(["Projects", "Contract", "Certificates", "Certificate"]);
  });
  it("a routing sheet type: Settings › Approvals › Routing sheets › the type", () => {
    const c = trail("/configuration/routing-sheets/demo_hrt1", "Demo interim certificate routing sheet");
    expect(labels(c)).toEqual(["Settings", "Approvals", "Routing sheets", "Demo interim certificate routing sheet"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
    expect(labels(trail("/configuration/routing-sheets", null))).toEqual(["Settings", "Approvals", "Routing sheets"]);
  });
  it("a form: Settings › System › Templates › the form (as Committees)", () => {
    const c = trail("/configuration/templates/demo_dt30", "Demo interim certificate");
    expect(labels(c)).toEqual(["Settings", "System", "Templates", "Demo interim certificate"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
    expect(labels(trail("/configuration/committees/TENDER_BOARD", "Tender Board"))).toEqual(["Settings", "Approvals", "Committees", "Tender Board"]);
  });
  it("6.13 Part A step 4, a variation: Projects › its contract › Variations (the contract's tab) › the variation", () => {
    const c = trail("/projects/demo_con3/variations/demo_vvo1", "Variation VO/1", "XI202600799");
    expect(labels(c)).toEqual(["Projects", "XI202600799", "Variations", "Variation VO/1"]);
    expect(c[2].href).toBe("/projects/demo_con3?tab=variations");
    expect(labels(trail("/projects/demo_con3/variations/demo_vvo1", null))).toEqual(["Projects", "Contract", "Variations", "Variation"]);
  });
  it("a Project document: Projects › its contract › Documents (the contract's tab, id `submissions`) › the document", () => {
    const c = trail("/projects/demo_con3/documents/demo_pd1", "Drainage layout", "XI202600799");
    expect(labels(c)).toEqual(["Projects", "XI202600799", "Documents", "Drainage layout"]);
    expect(c[2].href).toBe("/projects/demo_con3?stage=project&tab=submissions");
    expect(labels(trail("/projects/demo_con3/documents/demo_pd1", null))).toEqual(["Projects", "Contract", "Documents", "Document"]);
  });
  it("a Project document in the portal: My Projects › its contract › Documents (the contract's tab) › the document", () => {
    const c = trail("/supplier/projects/demo_con3/documents/demo_pd1", "Drainage layout", "XI202600799");
    expect(labels(c).slice(-3)).toEqual(["XI202600799", "Documents", "Drainage layout"]);
    expect(c.find((x) => x.label.en === "Documents")!.href).toBe("/supplier/projects/demo_con3?tab=submissions");
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
    expect(labels(trail("/supplier/projects/demo_con3/documents/demo_pd1", null)).slice(-2)).toEqual(["Documents", "Document"]);
  });
  it("the contract itself is unchanged: Projects › its number", () => {
    expect(labels(trail("/projects/demo_con3", "XI202600799"))).toEqual(["Projects", "XI202600799"]);
  });
  it("the page check itself finds a missing page", () => {
    expect(hasPage("/projects/demo_con3/certificates")).toBe(false);
  });
});

/// Every page under src/app, as its path segments (route groups and private folders left out).
function pages(dir: string = APP, rel: string[] = []): string[][] {
  const out: string[][] = [];
  if (existsSync(path.join(dir, "page.tsx"))) out.push(rel);
  for (const d of readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith("(") && !d.name.startsWith("_") && d.name !== "api") out.push(...pages(path.join(dir, d.name), [...rel, d.name]));
  return out;
}

describe("breadcrumbs on every page (6.14 residual)", () => {
  const all = pages().map((p) => p.map((s) => (s.startsWith("[") ? `x_${s.slice(1, -1)}` : s)));
  it("the walk finds the app's pages", () => {
    expect(all.length).toBeGreaterThan(60);
  });
  it.each(all.map((p) => [`/${p.join("/")}`, p] as const))("%s: every crumb links to a page, and none reads Details, named or not", (_route, segs) => {
    for (const [name, parent] of [[null, null], ["REC", "PAR"]] as const) {
      const c = crumbTrail(segs, name, parent);
      expect(c.filter((x) => !hasPage(x.href)).map((x) => x.href), `${name ?? "unnamed"}: dead`).toEqual([]);
      expect(c.filter((x) => x.label.en === "Details").map((x) => x.href), `${name ?? "unnamed"}: Details`).toEqual([]);
    }
  });
  it("the root crumb is the sidebar's label of the area, on lists and records alike (plan 6.1)", () => {
    const items = STAFF_NAV.flatMap((g) => g.items).filter((i) => i.href !== "/");
    let checked = 0;
    for (const segs of all) {
      const item = items.find((i) => i.href === `/${segs[0] === "awards" ? "projects" : segs[0]}`);
      if (!item) continue;
      for (const name of [null, "REC"]) expect(crumbTrail(segs, name, null)[0].label.en, `/${segs.join("/")}`).toBe(item.label.en);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });
  it("a page under an exercise names the exercise at the exercise's crumb, and its own section and page in words", () => {
    expect(labels(trail("/sourcing/sx1/evaluation/report", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Evaluation", "Evaluation report"]);
    expect(labels(trail("/sourcing/sx1/evaluation/proposal", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Evaluation", "Proposal paper"]);
    expect(labels(trail("/sourcing/sx1/label/s1", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Sales", "Sale label"]);
    expect(labels(trail("/sourcing/sx1/opening/print", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Bid opening", "Print"]);
    expect(labels(trail("/sourcing/sx1/documents/print", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Tender documents", "Print"]);
    expect(labels(trail("/sourcing/sx1/appendix", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Appendix"]);
    expect(labels(trail("/sourcing/sx1/edit", "EX/1"))).toEqual(["Tenders & quotations", "EX/1", "Edit"]);
    expect(labels(trail("/sourcing/sx1", null))).toEqual(["Tenders & quotations", "Tender or quotation"]);
    expect(labels(trail("/sourcing/new", null))).toEqual(["Tenders & quotations", "New tender or quotation"]);
    expect(trail("/sourcing/sx1/evaluation/report", "EX/1")[2].href).toBe("/sourcing/sx1?tab=evaluation&section=report");
    // SR-06 (ruling 9): the Invitation tab is gone; the sale register is Sales and briefing on Bids and opening.
    expect(trail("/sourcing/sx1/label/s1", "EX/1")[2].href).toBe("/sourcing/sx1?tab=bids&section=sales");
    expect(trail("/sourcing/sx1/opening/print", "EX/1")[2].href).toBe("/sourcing/sx1?tab=bids&section=schedule");
  });
  it("a printed award document's crumb is the page itself; configuration's sections are named", () => {
    const c = trail("/awards/aw1/print/loa", "AW/1");
    // AC-17, AC-23 (C9): Awards left the menu, so the print view's first crumb is the Contracts list.
    expect(labels(c)).toEqual(["Projects", "AW/1", "Print"]);
    expect(c[0].href).toBe("/projects");
    expect(c[2].href).toBe("/awards/aw1/print/loa");
    expect(labels(trail("/configuration/contracts", null))).toEqual(["Settings", "Contracts & payments", "Contract controls"]);
    expect(labels(trail("/configuration/post-award", null))).toEqual(["Settings", "Contracts & payments", "Post-award controls"]);
    expect(labels(trail("/configuration/evaluation", null))).toEqual(["Settings", "Purchasing & tenders", "Evaluation models"]);
    expect(labels(trail("/configuration/evaluation/m1", null))).toEqual(["Settings", "Purchasing & tenders", "Evaluation models", "Evaluation model"]);
    expect(labels(trail("/configuration/evaluation/m1", "Two-envelope model"))).toEqual(["Settings", "Purchasing & tenders", "Evaluation models", "Two-envelope model"]);
  });
});

describe("breadcrumbs of the public portal's opportunity pages", () => {
  it("the board, then an opportunity named by its reference (Opportunity before the page names it)", () => {
    expect(labels(trail("/supplier/opportunities", null))).toEqual(["Supplier portal", "Opportunities"]);
    const c = trail("/supplier/opportunities/demo_sx18", "DEMO/SX/0018/2026");
    expect(labels(c)).toEqual(["Supplier portal", "Opportunities", "DEMO/SX/0018/2026"]);
    expect(labels(trail("/supplier/opportunities/demo_sx18", null))).toEqual(["Supplier portal", "Opportunities", "Opportunity"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
  });
});

describe("breadcrumbs of the supplier's registration (Phase 4b)", () => {
  it("names the page for what it is, and links only to pages that exist", () => {
    const c = trail("/supplier/registration", null);
    expect(labels(c).at(-1)).toBe("Registration");
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
  });
});

describe("breadcrumbs of the Dashboard", () => {
  it("is named, not a record, and links to a page that exists", () => {
    const c = trail("/dashboard", null);
    expect(labels(c)).toEqual(["Dashboard"]);
    for (const x of c) expect(hasPage(x.href), x.href).toBe(true);
  });
});
