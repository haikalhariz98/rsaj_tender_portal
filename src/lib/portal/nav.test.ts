import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPLIER_NAV, workspaceFor } from "@/lib/nav";

import { HOME_LINKS, PORTAL_PATH, SIGN_IN_ITEMS } from "./labels";

const page = (href: string) => existsSync(path.join(__dirname, "../../app", ...href.split("/").filter(Boolean), "page.tsx"));

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
