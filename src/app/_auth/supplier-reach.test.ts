import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPLIER_AUTH_PAGES, SUPPLIER_AUTH_POSTS, SUPPLIER_POST_PATHS } from "@/lib/auth/routes";
import { lex } from "@/lib/scan/source";

/**
 * What the supplier portal promises, held by a source scan (Phase 4a, ADR 0034 D7 and D8, threat model F4 and F5):
 *
 * - every POST handler of the portal asks the portal's guard FIRST (`readPortalPost` for the doors a stranger reaches, `supplierPost` behind an account), before it reads
 *   a field or touches a store, and the doors are exactly the literal paths `publicAllows` lists;
 * - the supplier an act is for is the SESSION's, and only the session's: no page, handler or portal loader reads a `supplierId` from the request (a path parameter, a
 *   query string, a form field), so another supplier's record cannot be asked for by naming it;
 * - the portal's guard is in the order that keeps a stranger's request cheap: the copy, the Origin guard, the bounded body, then the form token;
 * - the supplier store and the staff store do not reach into each other's tables.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");

const PORTAL = walk(path.join(SRC, "app", "supplier")).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
const HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && !f.file.startsWith("app/supplier/register/"));
const PAGES = PORTAL.filter((f) => /\/page\.tsx$/.test(f.file));

/// The text of a handler's POST function with strings and comments blanked.
function postBody(src: string): string {
  const m = lex(src);
  const at = m.search(/export\s+async\s+function\s+POST\b/);
  expect(at).toBeGreaterThanOrEqual(0);
  const open = m.indexOf("{", m.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === "{") depth++;
    else if (m[i] === "}" && --depth === 0) return m.slice(open, i + 1);
  }
  throw new Error("unbalanced");
}

describe("the portal's handlers", () => {
  it("are exactly the literal paths the public copy lists, and nothing else", () => {
    const urls = HANDLERS.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`).sort();
    expect(urls).toEqual([...SUPPLIER_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_AUTH_POSTS)).toHaveLength(7);
    for (const p of SUPPLIER_AUTH_PAGES) expect(PAGES.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`)).toContain(p);
  });

  it("each answers a POST and no other method, so nothing is reachable by a GET", () => {
    for (const f of HANDLERS) {
      expect([...f.src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]), f.file).toEqual(["POST"]);
    }
  });

  it("ask the portal's guard before anything else is awaited", () => {
    for (const f of HANDLERS) {
      const body = postBody(f.src);
      const first = body.slice(body.search(/\bawait\b/));
      if (f.file === "app/supplier/sign-out/route.ts") {
        // Signing out works for whoever holds a cookie: the copy and the Origin guard, then it ends the session the cookie carries.
        expect(body, f.file).toMatch(/surfaceOf\(process\.env\[SURFACE_ENV\]\) !== "\s*"/);
        expect(body.indexOf("foreignRequestFault(")).toBeGreaterThan(body.indexOf("surfaceOf("));
        expect(body.indexOf("signOutSupplierToken(")).toBeGreaterThan(body.indexOf("foreignRequestFault("));
        continue;
      }
      const behindAccount = f.file.startsWith("app/supplier/account/");
      expect(first.startsWith(behindAccount ? "await supplierPost(request" : "await readPortalPost(request"), f.file).toBe(true);
      // Nothing is read from the request, started or awaited, before the guard.
      expect(body.slice(0, body.search(/\bawait\b/)).trim(), f.file).toMatch(/^\{\s*(?:const (?:first|guard) =)?$/);
      // And what comes back is returned as it is when it refuses.
      expect(body, f.file).toMatch(/if \(!(?:first|guard)\.ok\) return (?:first|guard)\.response;/);
    }
  });

  it("answer with a cookie only as a Set-Cookie header, and never touch next/headers", () => {
    for (const f of HANDLERS) {
      expect(f.src, f.file).not.toMatch(/from "next\/headers"/);
      expect(f.src, f.file).not.toMatch(/\bcookies\(\)/);
    }
  });

  it("hold no server action: the public copy refuses every one", () => {
    for (const f of PORTAL) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
  });
});

describe("the supplier is the session's", () => {
  /// The files that act for a signed-in supplier: the portal's pages and handlers, the portal's guard and its loaders.
  const ACTING = [
    ...PORTAL.filter((f) => !f.file.startsWith("app/supplier/register/")),
    ...["app/_auth/supplier.ts", "lib/portal/registration-status-repo.ts", "lib/auth/supplier-session-store.ts"].map((file) => ({ file, src: read(file) })),
  ];

  /// Where a supplier id is read from something the request says: a path or query parameter, a form field or a body, by name or by index.
  const readsSupplierFromRequest = (src: string): string[] => {
    // Comments are taken out and strings kept: a field is named in a string (`data.get("supplierId")`).
    const code = lex(src, { only: "comments" });
    const found: string[] = [];
    for (const m of code.matchAll(/(?:searchParams|params|fields|body|formData|data|query|request|req)\??\.\s*supplierId\b|\[\s*["']supplierId["']\s*\]|\.get\(\s*["']supplierId["']\s*\)|["']supplierId["']\s*in\s+(?:fields|body|params)|const\s*\{[^}]*\bsupplierId\b[^}]*\}\s*=\s*(?:await\s+)?(?:props\.)?(?:params|searchParams|fields|body)/g)) {
      found.push(m[0]);
    }
    return found;
  };

  it("sees a supplier id taken from the request (self-test)", () => {
    for (const bad of ["const id = fields.supplierId;", "const { supplierId } = await props.params;", "const id = searchParams.supplierId;", "const x = data.get('supplierId');", "const x = body['supplierId'];"]) {
      expect(readsSupplierFromRequest(bad), bad).toHaveLength(1);
    }
    for (const fine of ["where: { id: actor.supplierId, organisationId: actor.organisationId }", "supplierId: account.supplier.id,"]) expect(readsSupplierFromRequest(fine), fine).toEqual([]);
  });

  it("no page, handler or loader reads a supplier id from the request", () => {
    for (const f of ACTING) expect(readsSupplierFromRequest(f.src), f.file).toEqual([]);
    // The ids they do use are the actor's.
    expect(ACTING.some((f) => /actor\.supplierId/.test(f.src))).toBe(true);
  });

  it("the account page reads its supplier through the signed-in actor and nothing else", () => {
    const page = read("app/supplier/account/page.tsx");
    expect(page).toMatch(/const actor = await requireSupplier\(\);/);
    expect(page).not.toMatch(/props\.params|searchParams/);
    const loader = read("lib/portal/registration-status-repo.ts");
    expect(loader).toMatch(/export async function loadRegistrationStatus\(actor: SupplierActor\)/);
    expect(loader).toMatch(/where: \{ id: actor\.supplierId, organisationId: actor\.organisationId \}/);
  });

  it("the session read re-checks the account, the contact and the deployment on every request", () => {
    const src = read("lib/auth/supplier-session-store.ts");
    expect(src).toMatch(/account\.status !== "ACTIVE"/);
    expect(src).toMatch(/account\.contact\.retiredOn != null/);
    expect(src).toMatch(/deployment\.id !== account\.organisationId/);
    expect(src).toMatch(/account\.supplier\.organisationId !== account\.organisationId/);
    // The supplier comes from the account, which comes from the session.
    expect(src).toMatch(/supplierId: account\.supplier\.id/);
  });
});

describe("the portal's guard", () => {
  const guard = lex(read("app/_auth/supplier.ts"));
  const post = guard.slice(guard.indexOf("export async function readPortalPost"), guard.indexOf("export async function supplierPost"));

  it("judges a request in the order that keeps a stranger's cheap: the copy, the Origin guard, the bounded body, then the form token", () => {
    const at = (needle: string) => post.indexOf(needle);
    expect(at("surfaceOf(")).toBeGreaterThanOrEqual(0);
    expect(at("foreignRequestFault(")).toBeGreaterThan(at("surfaceOf("));
    expect(at("readJsonBody(")).toBeGreaterThan(at("foreignRequestFault("));
    expect(at("checkFormToken(")).toBeGreaterThan(at("readJsonBody("));
  });

  it("accepts a JSON body and nothing a cross-site form can send", () => {
    expect(read("app/_auth/supplier.ts")).toMatch(/foreignRequestFault\(request, \["application\/json"\], env\)/);
    expect(read("app/_auth/supplier.ts")).not.toMatch(/text\/plain|multipart/);
  });

  it("a behind-the-account post asks who is signed in only after the form checks, and answers 401 to nobody", () => {
    const sp = guard.slice(guard.indexOf("export async function supplierPost"));
    expect(sp.indexOf("readPortalPost(")).toBeLessThan(sp.indexOf("readSupplierSession("));
    expect(read("app/_auth/supplier.ts")).toMatch(/refuse\("NOT_SIGNED_IN"\)/);
  });
});

describe("the two stores stay apart", () => {
  const STAFF_FILES = ["lib/auth/session-store.ts", "lib/auth/account-store.ts", "lib/auth/administration.ts", "lib/auth/identity.ts"];
  const SUPPLIER_FILES = ["lib/auth/supplier-session-store.ts", "lib/auth/supplier-identity.ts", "lib/auth/supplier-account-store.ts", "lib/auth/supplier-administration.ts"];

  it("a staff module never reads or writes a supplier table, and a supplier module never reads or writes a staff one", () => {
    for (const f of STAFF_FILES) expect(lex(read(f)), f).not.toMatch(/\.supplier(Account|Session)\b|SupplierAccount|SupplierSession/);
    for (const f of SUPPLIER_FILES) expect(lex(read(f)), f).not.toMatch(/\.staff(Account|Session)\b|StaffAccount|StaffSession/);
  });

  it("a supplier module does not import the staff session store or the staff cookie", () => {
    for (const f of SUPPLIER_FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/from "\.\/session-store"/);
      expect(src, f).not.toMatch(/STAFF_COOKIE|staffToken/);
    }
    expect(read("app/_auth/supplier.ts")).not.toMatch(/STAFF_COOKIE|staffToken|currentStaffOrNull/);
  });

  it("the supplier cookie is read nowhere on the staff side", () => {
    for (const f of ["app/_auth/actor.ts", "app/_auth/route.ts", "lib/auth/session-store.ts"]) expect(read(f), f).not.toMatch(/SUPPLIER_COOKIE|supplierToken/);
  });
});
