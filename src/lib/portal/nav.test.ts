import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { navItemDisabled, SUPPLIER_NAV, workspaceFor } from "@/lib/nav";

import { HOME_LINKS, PORTAL_PATH, SIGN_IN_ITEMS } from "./labels";

const page = (href: string) => existsSync(path.join(__dirname, "../../app", ...href.split("/").filter(Boolean), "page.tsx"));

describe("the signed-in items of the supplier navigation", () => {
  const items = SUPPLIER_NAV.flatMap((g) => g.items);
  it("are inert for anyone who is not a signed-in supplier, and work for one who is", () => {
    for (const i of items.filter((x) => x.needsSupplier)) {
      expect(navItemDisabled(i, false), i.href).toBe(true);
      expect(navItemDisabled(i, true), i.href).toBe(false);
    }
  });
  it("are exactly the With sign-in group; the open items are never inert", () => {
    const group = SUPPLIER_NAV.find((g) => g.label.en === "With sign-in")!;
    expect(items.filter((x) => x.needsSupplier).map((x) => x.href)).toEqual(group.items.map((x) => x.href));
    for (const i of items.filter((x) => !x.needsSupplier)) expect(navItemDisabled(i, false), i.href).toBe(false);
  });
});

describe("the supplier portal's navigation and home links", () => {
  const navHrefs = SUPPLIER_NAV.flatMap((g) => g.items.map((i) => i.href));
  it("every navigation item, home link and sign-in item lands on a page", () => {
    for (const href of [...navHrefs, ...HOME_LINKS.map((l) => l.href), ...SIGN_IN_ITEMS.map((i) => i.href)]) {
      expect(page(href), href).toBe(true);
    }
  });
  it("the navigation offers every portal route once, and all are in the supplier workspace", () => {
    expect([...navHrefs].sort()).toEqual(Object.values(PORTAL_PATH).sort());
    for (const href of navHrefs) expect(workspaceFor(href)).toBe("supplier");
  });
  it("the parts that need sign-in are not marked built; the open ones are", () => {
    const built = (href: string) => SUPPLIER_NAV.flatMap((g) => g.items).find((i) => i.href === href)?.built === true;
    for (const i of SIGN_IN_ITEMS) expect(built(i.href), i.href).toBe(false);
    for (const l of HOME_LINKS) expect(built(l.href), l.href).toBe(true);
  });
});
