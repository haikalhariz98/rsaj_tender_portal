import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPLIER_ANNOUNCEMENTS_PAGE, SUPPLIER_AUTH_PAGES, SUPPLIER_AUTH_POSTS, SUPPLIER_BIDS_PAGE, SUPPLIER_BIDS_POST_PATHS, SUPPLIER_BIDS_POSTS, SUPPLIER_COMPANY_PAGE, SUPPLIER_COMPANY_POST_PATHS, SUPPLIER_COMPANY_POSTS, SUPPLIER_DATA_EXPORT, SUPPLIER_POST_PATHS, SUPPLIER_PROJECT_DOCUMENT_FILE, SUPPLIER_PROJECT_DOCUMENTS_POST_PATHS, SUPPLIER_PROJECT_DOCUMENTS_POSTS, SUPPLIER_PROJECTS_PAGE, SUPPLIER_PROJECTS_POST_PATHS, SUPPLIER_PROJECTS_POSTS, SUPPLIER_REGISTRATION_GET_PATHS, SUPPLIER_REGISTRATION_GETS, SUPPLIER_REGISTRATION_PAGE, SUPPLIER_REGISTRATION_POST_PATHS, SUPPLIER_REGISTRATION_POSTS } from "@/lib/auth/routes";
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
// Phase 4b: the registration wizard's handlers are held by the section below (`app/supplier/registration/`): six, of which two are reads and one is a multipart upload.
// Phase 4c: the Company workspace's two uploads are held by the section below (`app/supplier/company/`).
// Phase 4d: My Bids' three JSON posts are held by the section further down (`app/supplier/bids/`), as the registration's and the Company workspace's are: this first section is for the doors a stranger reaches.
// Phase 4e: My Projects' three JSON posts are held by their own section (`app/supplier/projects/`).
const HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && !f.file.startsWith("app/supplier/register/") && !f.file.startsWith("app/supplier/registration/") && !f.file.startsWith("app/supplier/company/") && !f.file.startsWith("app/supplier/bids/") && !f.file.startsWith("app/supplier/projects/") && !f.file.startsWith("app/supplier/account/data/") && !f.file.startsWith("app/supplier/results/"));
// Wave 3a (SR-10): the one GET under a dynamic segment (`app/supplier/bids/[id]/download`) is a read of a released file, held by its own test below; the others are the JSON posts.
// Wave 3b step 9 (plan section 1.5): the part upload is a multipart post, guarded by `supplierUploadPost` like the registration's and the Company workspace's uploads, so it is held by its own test below.
const BIDS_UPLOAD = "app/supplier/bids/part/route.ts";
const BIDS_ALL_POSTS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/bids/") && !f.file.includes("/[id]/"));
const BIDS_HANDLERS = BIDS_ALL_POSTS.filter((f) => f.file !== BIDS_UPLOAD);
const BIDS_DOWNLOADS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/bids/") && f.file.includes("/[id]/"));
const BIDS_PAGES = PORTAL.filter((f) => /\/page\.tsx$/.test(f.file) && f.file.startsWith("app/supplier/bids"));
// Project workspace (plan step 5): the contractor's documents have four posts (three JSON acts and one multipart staging) and one download, held by their own section below, as the bids' part
// upload and download are. This first section keeps its three JSON posts and is not loosened: it only stops counting the routes of the section that holds the others to the same rules and more.
const PROJECT_DOCUMENT_ROUTES = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/projects/documents/"));
const PROJECTS_HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/projects/") && !f.file.startsWith("app/supplier/projects/documents/"));
const PROJECTS_PAGES = PORTAL.filter((f) => /\/page\.tsx$/.test(f.file) && (f.file.startsWith("app/supplier/projects") || f.file.startsWith("app/supplier/announcements")));
const COMPANY_HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/company/"));
const REGISTRATION_HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/registration/"));
// N2: the supplier's export of its own data is one GET at a literal path, held by its own test below.
const DATA_EXPORT_HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/account/data/"));
// Go-live R4a: the schedule of tenders a result publishes is one public GET, held by its own test below.
const RESULT_SCHEDULE_HANDLERS = PORTAL.filter((f) => /\/route\.ts$/.test(f.file) && f.file.startsWith("app/supplier/results/"));
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

describe("the registration wizard's handlers (Phase 4b)", () => {
  const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const methods = (src: string) => [...src.matchAll(HTTP)].map((m) => m[1]);
  const bodyOf = (src: string, method: string): string => {
    const m = lex(src);
    const at = m.search(new RegExp(String.raw`export\s+async\s+function\s+${method}\b`));
    expect(at, method).toBeGreaterThanOrEqual(0);
    const open = m.indexOf("{", m.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < m.length; i++) {
      if (m[i] === "{") depth++;
      else if (m[i] === "}" && --depth === 0) return m.slice(open, i + 1);
    }
    throw new Error("unbalanced");
  };

  it("are exactly the literal paths the public copy lists, and the page is there", () => {
    expect(REGISTRATION_HANDLERS.map(FILE).sort()).toEqual([...SUPPLIER_REGISTRATION_POST_PATHS, ...SUPPLIER_REGISTRATION_GET_PATHS.filter((p) => p !== SUPPLIER_REGISTRATION_PAGE)].sort());
    expect(Object.values(SUPPLIER_REGISTRATION_POSTS)).toHaveLength(4);
    expect(Object.values(SUPPLIER_REGISTRATION_GETS)).toHaveLength(2);
    expect(PAGES.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`)).toContain(SUPPLIER_REGISTRATION_PAGE);
  });

  it("each POST asks the portal's guard before anything else is awaited, and returns its refusal as it is", () => {
    for (const f of REGISTRATION_HANDLERS.filter((x) => methods(x.src).includes("POST"))) {
      const body = bodyOf(f.src, "POST");
      const first = body.slice(body.search(/\bawait\b/));
      const want = f.file === "app/supplier/registration/upload/route.ts" ? "await supplierUploadPost(request, " : "await supplierPost(request, ";
      expect(first.startsWith(want), f.file).toBe(true);
      expect(body, f.file).toMatch(/^\{\s*const guard =/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      // A POST answers only a POST; a read only a GET.
      expect(methods(f.src), f.file).toEqual(["POST"]);
    }
  });

  it("each read asks the portal's read guard first, and the file's HEAD reads and logs nothing", () => {
    for (const f of REGISTRATION_HANDLERS.filter((x) => methods(x.src).includes("GET"))) {
      const body = bodyOf(f.src, "GET");
      expect(/^await supplierGet\(request, "[^"]*"\)/.test(body.slice(body.search(/\bawait\b/))), f.file).toBe(true);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      expect(methods(f.src), f.file).toEqual(f.file.endsWith("/file/route.ts") ? ["GET", "HEAD"] : ["GET"]);
    }
    const head = bodyOf(REGISTRATION_HANDLERS.find((f) => f.file.endsWith("/file/route.ts"))!.src, "HEAD");
    expect(head).not.toMatch(/\bawait\b|\bdb\./);
  });

  it("the upload's guard is judged in the order that keeps a stranger's request cheap: the copy, the Origin guard, the token, then who is signed in", () => {
    const g = lex(read("app/_auth/supplier.ts"));
    const upload = g.slice(g.indexOf("export async function supplierUploadPost"), g.indexOf("export async function supplierGet"));
    const at = (needle: string) => upload.indexOf(needle);
    expect(at("surfaceOf(")).toBeGreaterThanOrEqual(0);
    expect(at("foreignRequestFault(")).toBeGreaterThan(at("surfaceOf("));
    expect(at("tokenRefusal(")).toBeGreaterThan(at("foreignRequestFault("));
    expect(at("readSupplierSession(")).toBeGreaterThan(at("tokenRefusal("));
    // The body is not read by the guard at all: the route reads it after the settings.
    expect(upload).not.toMatch(/formData|\.body\b|readJsonBody/);
    const read1 = g.slice(g.indexOf("export async function supplierGet"));
    expect(read1.indexOf("downloadRequestFault(")).toBeGreaterThanOrEqual(0);
    expect(read1.indexOf("tokenRefusal(")).toBeGreaterThan(read1.indexOf("downloadRequestFault("));
    expect(read1.indexOf("readSupplierSession(")).toBeGreaterThan(read1.indexOf("tokenRefusal("));
  });

  it("no handler reads a supplier, an organisation, an account or a day from the request", () => {
    for (const f of REGISTRATION_HANDLERS) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId)["']\s*\)/);
      expect(code, f.file).not.toMatch(/(?:fields|body|post\.fields|params|searchParams)\??\.\s*(?:supplierId|organisationId|accountId|supplierAccountId|signedOn|signedAt|receivedOn)\b/);
    }
    // The parsers of the bodies read none either.
    const api = lex(read("lib/portal/registration/api.ts"), { only: "comments" });
    expect(api).not.toMatch(/["'](?:supplierId|organisationId|accountId|supplierAccountId|signedOn|signedAt|receivedOn)["']/);
  });

  it("the export of the supplier's own data is one GET at its literal path that asks the portal's guard first with its own purpose, and a HEAD that reads nothing (N2)", () => {
    expect(DATA_EXPORT_HANDLERS.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`)).toEqual([SUPPLIER_DATA_EXPORT.file]);
    const f = DATA_EXPORT_HANDLERS[0];
    expect(methods(f.src)).toEqual(["GET", "HEAD"]);
    const code = lex(f.src);
    const get = code.slice(code.search(/export\s+async\s+function\s+GET\b/));
    expect(get.slice(get.search(/\bawait\b/)).startsWith("await supplierGet(request, ")).toBe(true);
    expect(f.src).toMatch(/await supplierGet\(request, "data-export"\)/);
    expect(get).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    expect(bodyOf(f.src, "HEAD")).not.toMatch(/\bawait\b|\bdb\./);
    // The supplier is the session's: nothing is read from the request but the guard's token.
    expect(lex(f.src, { only: "comments" })).not.toMatch(/searchParams|\.get\(\s*["'](?:supplierId|organisationId|accountId)["']\s*\)/);
    expect(f.src).not.toMatch(/^\s*["']use server["']/m);
  });

  it("hold no server action", () => {
    for (const f of REGISTRATION_HANDLERS) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
  });

  it("the stores take the supplier from the actor, never from a parameter that a request could set", () => {
    for (const file of ["lib/portal/registration/draft-store.ts", "lib/portal/registration/upload-store.ts", "lib/portal/registration/submit-store.ts", "lib/portal/registration/own-file-store.ts", "lib/portal/registration/context-store.ts"]) {
      const src = read(file);
      expect(src, file).toMatch(/SupplierActor|Pick<SupplierActor/);
      expect(lex(src, { only: "comments" }), file).not.toMatch(/(?:fields|body|params|searchParams)\??\.\s*supplierId\b/);
    }
  });
});

describe("the Company workspace's handlers (Phase 4c)", () => {
  const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const methods = (src: string) => [...src.matchAll(HTTP)].map((m) => m[1]);
  const postBodyOf = (src: string): string => postBody(src);

  it("are exactly the two literal paths the public copy lists, and the page is there", () => {
    expect(COMPANY_HANDLERS.map(FILE).sort()).toEqual([...SUPPLIER_COMPANY_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_COMPANY_POSTS)).toHaveLength(2);
    expect(PAGES.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`)).toContain(SUPPLIER_COMPANY_PAGE);
  });

  it("each answers a POST and nothing else, and asks the upload guard before anything else is awaited, returning its refusal as it is", () => {
    for (const f of COMPANY_HANDLERS) {
      expect(methods(f.src), f.file).toEqual(["POST"]);
      const body = postBodyOf(f.src);
      const first = body.slice(body.search(/\bawait\b/));
      expect(first.startsWith("await supplierUploadPost(request, "), f.file).toBe(true);
      // (strings are blanked by the lexer, so the purpose is held by the source itself)
      expect(f.src, f.file).toMatch(/await supplierUploadPost\(request, "company"\)/);
      expect(body, f.file).toMatch(/^\{\s*const guard =/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    }
  });

  it("read the file only after the settings, the length and the limit (readUpload), and ask the password only after the details are judged", () => {
    const upload = lex(read("app/supplier/company/upload-request.ts"));
    const at = (needle: string) => upload.indexOf(needle);
    expect(at("uploadSettingFault(")).toBeGreaterThan(at("documentOrg("));
    expect(at("requestLengthFault(")).toBeGreaterThan(at("uploadSettingFault("));
    expect(at("limitBody(")).toBeGreaterThan(at("requestLengthFault("));
    expect(at("formData()")).toBeGreaterThan(at("limitBody("));
    expect(at("sniffMediaType(")).toBeGreaterThan(at("formData()"));
    for (const f of COMPANY_HANDLERS) expect(f.src, f.file).toContain("readUpload(");
    const bank = lex(COMPANY_HANDLERS.find((f) => f.file.endsWith("/bank/route.ts"))!.src);
    expect(bank.indexOf("confirmSupplierPassword(")).toBeGreaterThan(bank.indexOf("judge("));
    expect(bank.indexOf("sendBankChange(")).toBeGreaterThan(bank.indexOf("confirmSupplierPassword("));
  });

  it("no handler reads a supplier, an organisation, an account, a day or a time from the request", () => {
    for (const f of [...COMPANY_HANDLERS, { file: "app/supplier/company/upload-request.ts", src: read("app/supplier/company/upload-request.ts") }]) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|signedOn|signedAt|receivedOn|lodgedOn)["']\s*\)/);
      expect(code, f.file).not.toMatch(/text\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|signedOn|signedAt|receivedOn|lodgedOn)["']\s*\)/);
    }
  });

  it("hold no server action, and the stores take the supplier from the actor", () => {
    for (const f of COMPANY_HANDLERS) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
    for (const file of ["lib/portal/company/replace-store.ts", "lib/portal/company/bank-store.ts", "lib/portal/company/company-store.ts"]) {
      const src = read(file);
      expect(src, file).toMatch(/SupplierActor/);
      expect(lex(src, { only: "comments" }), file).not.toMatch(/(?:fields|body|params|searchParams|form)\??\.\s*supplierId\b/);
      // Every read and write names the actor's supplier and organisation.
      expect(src, file).toMatch(/actor\.supplierId/);
      expect(src, file).toMatch(/actor\.organisationId/);
    }
  });

  it("the page asks who is signed in first and reads its supplier from the actor", () => {
    const page = read("app/supplier/company/page.tsx");
    expect(page).toMatch(/const actor = await requireSupplier\(\);/);
    expect(page).not.toMatch(/props\.params|params\.supplierId|searchParams\.supplierId/);
  });
});

describe("My Bids' handlers and pages (Phase 4d)", () => {
  const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const methods = (src: string) => [...src.matchAll(HTTP)].map((m) => m[1]);

  it("are exactly the seven literal paths the public copy lists (plan section 1.5 adds the part upload and its discard, and step 10 the submit and the withdraw), and the list page is there", () => {
    expect(BIDS_ALL_POSTS.map(FILE).sort()).toEqual([...SUPPLIER_BIDS_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_BIDS_POSTS)).toHaveLength(7);
    expect(PORTAL.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`)).toContain(SUPPLIER_BIDS_PAGE);
  });

  it("each answers a POST and nothing else, and asks the portal's guard before anything else is awaited, returning its refusal as it is", () => {
    for (const f of BIDS_HANDLERS) {
      expect(methods(f.src), f.file).toEqual(["POST"]);
      const body = postBody(f.src);
      expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierPost(request, "), f.file).toBe(true);
      // Plan section 1.5: the submit's JSON may be 16 KB (SUBMIT_BODY_LIMIT), every other bids post 4 KB (BIDS_BODY_LIMIT).
      const limit = f.file === "app/supplier/bids/submit/route.ts" ? "SUBMIT_BODY_LIMIT" : "BIDS_BODY_LIMIT";
      expect(f.src, f.file).toMatch(new RegExp(`await supplierPost\\(request, "bids", \\{ maxBytes: ${limit} \\}\\)`));
      expect(body, f.file).toMatch(/^\{\s*const guard =/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      // Nothing is parsed before the guard: the first thing read from the body is `post.fields`, after it.
      expect(body.indexOf("post.fields"), f.file).toBeGreaterThan(body.indexOf("guard.ok"));
    }
  });

  it("the part upload is one POST that asks the portal's upload guard first, and reads no supplier, organisation or account from the request", () => {
    const f = BIDS_ALL_POSTS.find((x) => x.file === BIDS_UPLOAD)!;
    expect(methods(f.src)).toEqual(["POST"]);
    const body = postBody(f.src);
    expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierUploadPost(request, ")).toBe(true);
    expect(f.src).toMatch(/await supplierUploadPost\(request, "bids"\)/);
    expect(body).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    expect(f.src).not.toMatch(/^\s*["']use server["']/m);
    const code = lex(f.src, { only: "comments" });
    expect(code).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|uploadedAt)["']\s*\)/);
    const store = lex(read("lib/bids/online/upload-store.ts"), { only: "comments" });
    expect(store).not.toMatch(/(?:fields|body|params|searchParams|form)\??\.\s*(?:supplierId|organisationId|accountId)\b/);
    // The pattern can fail: it matches a store that does read the id from the request (a fixture, so the assertion above is shown not to be a no-op).
    expect("const s = form.supplierId;").toMatch(/(?:fields|body|params|searchParams|form)\??\.\s*(?:supplierId|organisationId|accountId)\b/);
    expect(read("lib/bids/online/upload-store.ts")).toMatch(/actor\.supplierId/);
  });

  it("no handler, page or store reads a supplier, an organisation, an account, a day or a time from the request", () => {
    const stores = ["lib/portal/bids/signup-store.ts", "lib/portal/bids/acknowledge-store.ts", "lib/portal/bids/request-store.ts", "lib/portal/bids/inspection-store.ts", "lib/portal/bids/list-store.ts", "lib/portal/bids/workspace-store.ts", "lib/portal/bids/context-store.ts", "lib/portal/bids/sale-facts.ts", "lib/portal/bids/api.ts"].map((file) => ({ file, src: read(file) }));
    for (const f of [...BIDS_HANDLERS, ...BIDS_PAGES, ...stores]) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|signedOn|signedAt|acknowledgedOn|requestedAt|viewedAt)["']\s*\)/);
      expect(code, f.file).not.toMatch(/(?:fields|body|post\.fields|params|searchParams)\??\.\s*(?:supplierId|organisationId|accountId|supplierAccountId|signedOn|signedAt|acknowledgedOn|requestedAt|viewedAt)\b/);
    }
    // The parsers read an exercise, an event, an addendum, an action and a name, and nothing else.
    expect(lex(read("lib/portal/bids/api.ts"), { only: "comments" })).not.toMatch(/\b(?:b|body)\.(?:supplierId|organisationId|accountId|supplierAccountId|acknowledgedOn|requestedAt)\b/);
  });

  it("the download of a released file is one GET that asks the portal's guard first, and a HEAD that reads nothing (SR-10)", () => {
    expect(BIDS_DOWNLOADS.map((f) => f.file)).toEqual(["app/supplier/bids/[id]/download/route.ts"]);
    const f = BIDS_DOWNLOADS[0];
    expect(methods(f.src)).toEqual(["GET", "HEAD"]);
    const code = lex(f.src);
    const get = code.slice(code.search(/export\s+async\s+function\s+GET\b/));
    expect(get.slice(get.search(/\bawait\b/)).startsWith("await supplierGet(request, ")).toBe(true);
    expect(get).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    // The supplier is the session's: the query names a file or a text, never a supplier.
    expect(lex(f.src, { only: "comments" })).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId)["']\s*\)/);
    expect(f.src).not.toMatch(/^\s*["']use server["']/m);
  });

  it("hold no server action", () => {
    for (const f of [...BIDS_HANDLERS, ...BIDS_PAGES]) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
  });

  it("every page asks who is signed in first, and reads its supplier from the actor", () => {
    // Wave 3a (SR-10) adds the payment page of an online purchase, so 5. Wave 3b (SR-13, build plan step 11) adds the page an online bid is submitted on, so 6.
    expect(BIDS_PAGES.length).toBe(6);
    for (const f of BIDS_PAGES) {
      expect(f.src, f.file).toMatch(/const actor = await requireSupplier\(\);/);
      // The id in the address is an exercise's; it is never taken for a supplier's.
      expect(f.src, f.file).not.toMatch(/params\.supplierId|searchParams\.supplierId|\{\s*supplierId\s*\}\s*=/);
    }
  });

  it("the stores take the supplier and the organisation from the actor, lock the exercise side first, and never the supplier row", () => {
    for (const file of ["lib/portal/bids/signup-store.ts", "lib/portal/bids/acknowledge-store.ts", "lib/portal/bids/request-store.ts"]) {
      const src = read(file);
      expect(src, file).toMatch(/SupplierActor/);
      expect(src, file).toMatch(/actor\.supplierId/);
      expect(src, file).toMatch(/actor\.organisationId/);
      // Each takes the exercise (then its window) before it reads or writes anything of the supplier's, and never `lockSupplierRow`: `recordSale` takes the supplier row last.
      const code = lex(src);
      expect(code.indexOf("lockExerciseSide("), file).toBeGreaterThan(-1);
      expect(code.indexOf("lockExerciseSide("), file).toBeLessThan(code.indexOf("loadBidContext("));
      expect(code, file).not.toMatch(/lockSupplierRow/);
    }
    const lock = read("lib/portal/bids/lock.ts");
    expect(lock.indexOf('FROM "SourcingExercise"')).toBeGreaterThan(-1);
    expect(lock.indexOf('FROM "ExerciseWindow"')).toBeGreaterThan(lock.indexOf('FROM "SourcingExercise"'));
  });

  it("the Overview reads its own few counts and loads nothing of a sibling tab, and the links that write the inspection log are never prefetched", () => {
    const src = lex(read("lib/portal/bids/workspace-store.ts"));
    const overview = src.slice(src.indexOf("export async function overviewTab"));
    expect(overview.length).toBeGreaterThan(100);
    for (const sibling of ["briefingsTab(", "addendaTab(", "documentsTab(", "loadMyNotices(", "loadSaleFacts(", "readRegister("]) expect(overview, sibling).not.toContain(sibling);
    // A render of either page writes a log row, so a prefetch of it would log an opening nobody made.
    const panels = read("app/supplier/bids/[id]/panels.tsx");
    for (const target of ["/table-document", "/documents"]) expect(panels, target).toMatch(new RegExp(String.raw`href=\{\`\$\{base\}${target}\`\}[^>]*prefetch=\{false\}`));
  });

  it("the inspection log is written before the documents are returned, and only the approved version is shown", () => {
    const src = lex(read("lib/portal/bids/inspection-store.ts"));
    // The write is `recordInspection` (it owns the create and the repeat rule since the Phase 4d review); the call is what must come after the approved-version check and before the view is returned.
    const call = src.indexOf("await recordInspection(db");
    expect(call).toBeGreaterThan(src.indexOf("view.watermark != null"));
    // Nothing returns the view before the log row: the only `open: true` return follows the write.
    expect(src.indexOf("return { open: true")).toBeGreaterThan(call);
    expect(src.indexOf("tenderInspectionEvent.create(")).toBeGreaterThan(-1);
  });

  it("a request another site started reads nothing and logs nothing: the store asks first, and both pages hand it Sec-Fetch-Site (Phase 4d review)", () => {
    const src = lex(read("lib/portal/bids/inspection-store.ts"));
    const guard = src.indexOf("downloadRequestFault(i.secFetchSite");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("loadBidContext(db, actor"));
    for (const page of ["app/supplier/bids/[id]/table-document/page.tsx", "app/supplier/bids/[id]/documents/page.tsx"]) {
      expect(lex(read(page), { only: "comments" }), page).toMatch(/secFetchSite:\s*\(await headers\(\)\)\.get\("sec-fetch-site"\)/);
    }
  });
});

describe("My Projects' handlers and pages (Phase 4e)", () => {
  const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const methods = (src: string) => [...src.matchAll(HTTP)].map((m) => m[1]);
  const STORES = ["lib/portal/projects/submission-store.ts", "lib/portal/projects/diary-store.ts", "lib/portal/projects/certificate-store.ts", "lib/portal/projects/list-store.ts", "lib/portal/projects/workspace-store.ts", "lib/portal/projects/context-store.ts", "lib/portal/projects/api.ts"];

  it("are exactly the three literal paths the public copy lists, and the list page and the board are there", () => {
    expect(PROJECTS_HANDLERS.map(FILE).sort()).toEqual([...SUPPLIER_PROJECTS_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_PROJECTS_POSTS)).toHaveLength(3);
    const pages = PORTAL.map((f) => `/${f.file.replace(/^app\//, "").replace(/\/page\.tsx$/, "")}`);
    expect(pages).toContain(SUPPLIER_PROJECTS_PAGE);
    expect(pages).toContain(SUPPLIER_ANNOUNCEMENTS_PAGE);
  });

  it("each answers a POST and nothing else, and asks the portal's guard before anything else is awaited, returning its refusal as it is", () => {
    for (const f of PROJECTS_HANDLERS) {
      expect(methods(f.src), f.file).toEqual(["POST"]);
      const body = postBody(f.src);
      expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierPost(request, "), f.file).toBe(true);
      expect(f.src, f.file).toMatch(/await supplierPost\(request, "projects", \{ maxBytes: PROJECTS_BODY_LIMIT \}\)/);
      expect(body, f.file).toMatch(/^\{\s*const guard =/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      expect(body.indexOf("post.fields"), f.file).toBeGreaterThan(body.indexOf("guard.ok"));
    }
  });

  it("a signature asks the password after the body is parsed and before the store is asked, and the password is handed only to confirmSupplierPassword", () => {
    for (const [file, store] of [["app/supplier/projects/submit/route.ts", "sendSubmission("], ["app/supplier/projects/diary/route.ts", "attestDiaryAsAgent("], ["app/supplier/projects/certificate/route.ts", "signContractorBlock("]] as const) {
      const src = lex(read(file));
      const ask = src.indexOf("confirmSupplierPassword(");
      expect(ask, file).toBeGreaterThan(src.indexOf("parse"));
      expect(ask, file).toBeLessThan(src.indexOf(store));
    }
    // The password is handed to no store: no store names it in code (strings and comments blanked: a store may say in its reason that one was asked). The body parser reads it only to hand it to the handler.
    for (const file of STORES.filter((f) => !f.endsWith("/api.ts"))) expect(lex(read(file)), file).not.toMatch(/\bpassword\b/i);
  });

  it("no handler, page or store reads a supplier, an organisation, an account, a day or a time from the request", () => {
    const stores = STORES.map((file) => ({ file, src: read(file) }));
    for (const f of [...PROJECTS_HANDLERS, ...PROJECTS_PAGES, ...stores]) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|signedOn|signedAt|submittedOn|submittedAt|agentAttestedOn|decidedOn)["']\s*\)/);
      expect(code, f.file).not.toMatch(/(?:fields|body|post\.fields|params|searchParams)\??\.\s*(?:supplierId|organisationId|accountId|supplierAccountId|signedOn|signedAt|submittedOn|submittedAt|agentAttestedOn|decidedOn)\b/);
    }
    expect(lex(read("lib/portal/projects/api.ts"), { only: "comments" })).not.toMatch(/\b(?:b|body)\.(?:supplierId|organisationId|accountId|supplierAccountId|submittedOn|submittedAt|signedOn)\b/);
  });

  it("hold no server action", () => {
    for (const f of [...PROJECTS_HANDLERS, ...PROJECTS_PAGES]) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
  });

  it("every page asks who is signed in first, and reads its supplier from the actor", () => {
    // Four: My Projects' list, one project, the announcements board, and (Project workspace, plan step 5) one document of a project. The new page is held to the same rules as the others by this very loop.
    expect(PROJECTS_PAGES.length).toBe(4);
    for (const f of PROJECTS_PAGES) {
      expect(f.src, f.file).toMatch(/const actor = await requireSupplier\(\);/);
      expect(f.src, f.file).not.toMatch(/params\.supplierId|searchParams\.supplierId|\{\s*supplierId\s*\}\s*=/);
    }
  });

  it("the stores take the supplier and the organisation from the actor, hold the contract through its award's supplier, and lock in the canonical order (withLockedContract, withLockedCertificate)", () => {
    for (const file of ["lib/portal/projects/submission-store.ts", "lib/portal/projects/certificate-store.ts"]) {
      const src = read(file);
      expect(src, file).toMatch(/SupplierActor/);
      expect(src, file).toMatch(/actor\.supplierId/);
      expect(src, file).toMatch(/actor\.organisationId/);
      expect(src, file).toMatch(/supplierHoldsContract\(/);
      expect(src, file).toMatch(/withLocked(?:Contract|Certificate)\(/);
      expect(lex(src), file).not.toMatch(/lockSupplierRow|FROM "Supplier"/);
    }
    // The diary store reaches the contract only through the submission store's wrapper, which holds it for the actor's supplier.
    const diaryStore = read("lib/portal/projects/diary-store.ts");
    expect(diaryStore).toMatch(/SupplierActor/);
    expect(diaryStore).toMatch(/inHeldContract\(actor, /);
    expect(diaryStore).toMatch(/actor\.organisationId/);
    expect(lex(diaryStore)).not.toMatch(/lockSupplierRow|FROM "Supplier"|withLockedContract\(/);
    // The one way a contract is a supplier's: its award names the supplier on the register and stands.
    const vis = read("lib/portal/projects/visibility.ts");
    expect(vis).toMatch(/awardVendorId != null && f\.awardVendorId === f\.supplierId/);
    const ctx = read("lib/portal/projects/context-store.ts");
    expect(ctx).toMatch(/supplierHoldsContract\(\{ awardVendorId: c\.award\.vendorId/);
  });

  it("the Overview reads its own few counts and loads nothing of a sibling tab", () => {
    const src = lex(read("lib/portal/projects/workspace-store.ts"));
    const overview = src.slice(src.indexOf("export async function overviewTab"), src.indexOf("export async function programmeTab"));
    expect(overview.length).toBeGreaterThan(100);
    for (const sibling of ["programmeTab(", "diaryTab(", "paymentsTab(", "certificatesTab(", "submissionsTab(", "loadSupervision(", "loadPayment("]) expect(overview, sibling).not.toContain(sibling);
  });

  it("the announcements board is read for the actor's organisation, and the staff side gates publishing on the permission", () => {
    expect(read("app/supplier/announcements/page.tsx")).toMatch(/loadBoard\(db, actor\.organisationId/);
    const actions = lex(read("app/suppliers/announcement-actions.ts"));
    for (const fn of ["publishAnnouncement", "pinAnnouncement", "withdrawAnnouncement"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.indexOf("staffForAct("), fn).toBeGreaterThan(-1);
      expect(body.indexOf("permissionGate(actor,"), fn).toBeGreaterThan(body.indexOf("staffForAct("));
      expect(body.indexOf("permissionGate(actor,"), fn).toBeLessThan(body.indexOf("$transaction("));
    }
  });
});

describe("the contractor's Project workspace documents (plan step 5)", () => {
  const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const methods = (src: string) => [...src.matchAll(HTTP)].map((m) => m[1]);
  const UPLOAD = "app/supplier/projects/documents/upload/route.ts";
  const DOWNLOAD = "app/supplier/projects/documents/file/[attachmentId]/route.ts";
  const POSTS = PROJECT_DOCUMENT_ROUTES.filter((f) => f.file !== DOWNLOAD);
  const JSON_POSTS = POSTS.filter((f) => f.file !== UPLOAD);
  const LIBS = ["portal-acts.ts", "portal-api.ts", "portal-upload.ts", "portal-file.ts", "portal-read.ts"].map((n) => ({ file: `lib/project-docs/${n}`, src: read(`lib/project-docs/${n}`) }));
  const bodyOf = (src: string, method: string): string => {
    const m = lex(src);
    const at = m.search(new RegExp(String.raw`export\s+async\s+function\s+${method}\b`));
    expect(at, method).toBeGreaterThanOrEqual(0);
    const open = m.indexOf("{", m.indexOf(")", at));
    let depth = 0;
    for (let i = open; i < m.length; i++) {
      if (m[i] === "{") depth++;
      else if (m[i] === "}" && --depth === 0) return m.slice(open, i + 1);
    }
    throw new Error("unbalanced");
  };

  it("are exactly the four literal posts the public copy lists, and the one download, and nothing else", () => {
    expect(POSTS.map(FILE).sort()).toEqual([...SUPPLIER_PROJECT_DOCUMENTS_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_PROJECT_DOCUMENTS_POSTS)).toHaveLength(4);
    expect(PROJECT_DOCUMENT_ROUTES.map((f) => f.file).sort()).toEqual([...POSTS.map((f) => f.file), DOWNLOAD].sort());
    expect(`${SUPPLIER_PROJECT_DOCUMENT_FILE}/[attachmentId]`).toBe(FILE({ file: DOWNLOAD }));
  });

  it("each JSON act answers a POST and nothing else, and asks the portal's guard before anything else is awaited, returning its refusal as it is", () => {
    expect(JSON_POSTS).toHaveLength(3);
    for (const f of JSON_POSTS) {
      expect(methods(f.src), f.file).toEqual(["POST"]);
      const body = postBody(f.src);
      expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierPost(request, "), f.file).toBe(true);
      expect(f.src, f.file).toMatch(/await supplierPost\(request, "projects", \{ maxBytes: PROJECTS_BODY_LIMIT \}\)/);
      expect(body, f.file).toMatch(/^\{\s*const guard =/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      expect(body.indexOf("post.fields"), f.file).toBeGreaterThan(body.indexOf("guard.ok"));
      // Parsed once, in one place, and acted on only if it parsed.
      expect(body.indexOf("(post.fields)"), f.file).toBeLessThan(body.indexOf("(actor, parsed.value)"));
    }
  });

  it("the upload is one POST that asks the portal's upload guard first, and judges the request in the order that keeps a stranger's cheap", () => {
    const f = POSTS.find((x) => x.file === UPLOAD)!;
    expect(methods(f.src)).toEqual(["POST"]);
    const body = postBody(f.src);
    expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierUploadPost(request, ")).toBe(true);
    expect(f.src).toMatch(/await supplierUploadPost\(request, "projects"\)/);
    expect(body).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    // The place in line is taken before the work, and given back in a finally.
    expect(body.indexOf("uploadLimiter().tryAcquire()")).toBeGreaterThan(body.indexOf("guard.ok"));
    expect(body).toMatch(/finally\s*\{\s*slot\(\);/);
    // Inside: the query (the contract, a posted kind) and the contract as this supplier holds it, then the stated length, the paced body, the form, the bytes' type, the store.
    const code = lex(f.src);
    const at = (needle: string) => code.indexOf(needle);
    for (const [a, b] of [["parseUploadQuery(", "preflightProjectUpload("], ["preflightProjectUpload(", "requestLengthFault("], ["requestLengthFault(", "limitBodyPaced("], ["limitBodyPaced(", "formData()"], ["formData()", "parseUploadForm("], ["parseUploadForm(", "recogniseFile("], ["recogniseFile(", "mediaFault("], ["mediaFault(", "storeProjectFile("]] as const) {
      expect(at(a), a).toBeGreaterThan(-1);
      expect(at(b), b).toBeGreaterThan(at(a));
    }
    // The route reads no supplier, organisation or account from the request; the contract's id is the one thing the query names.
    expect(lex(f.src, { only: "comments" })).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|storedAt)["']\s*\)/);
  });

  it("staging takes no contract lock: it takes the account's own row, never the contract, the supplier row or a document, and is not run inside the contract's lock (PW-15)", () => {
    const store = read("lib/project-docs/portal-upload.ts");
    expect(lex(store)).not.toMatch(/withLockedContract|inHeldContract|lockSupplierRow|FROM "Contract"|FROM "Supplier"|FROM "ProjectDocument"|withLockedOwner/);
    expect(store).toMatch(/FROM "SupplierAccount" WHERE id = \$\{actor\.accountId\}[^`]*FOR UPDATE/);
    expect(lex(read(UPLOAD))).not.toMatch(/withLockedContract|inHeldContract/);
    // The window is judged inside the store's own transaction, after the lock, and `now` is taken after it.
    expect(store.indexOf("const now = new Date()")).toBeGreaterThan(store.indexOf("FOR UPDATE"));
    expect(store.indexOf("windowFaults(")).toBeGreaterThan(store.indexOf("const now = new Date()"));
    expect(store).toMatch(/hooks: \{\s*before:/);
  });

  it("the download is one GET that asks the portal's read guard first, reads the file only through the reach chain, logs after the response is built, and has a HEAD that reads nothing", () => {
    const f = PROJECT_DOCUMENT_ROUTES.find((x) => x.file === DOWNLOAD)!;
    expect(methods(f.src)).toEqual(["GET", "HEAD"]);
    const get = bodyOf(f.src, "GET");
    expect(get.slice(get.search(/\bawait\b/)).startsWith("await supplierGet(request, ")).toBe(true);
    expect(f.src).toMatch(/await supplierGet\(request, "projects"\)/);
    expect(get).toMatch(/if \(!guard\.ok\) return guard\.response;/);
    expect(bodyOf(f.src, "HEAD")).not.toMatch(/\bawait\b|\bdb\./);
    const code = lex(f.src);
    expect(code.indexOf("findProjectFile(")).toBeGreaterThan(-1);
    expect(code.indexOf("findProjectFile(")).toBeLessThan(code.indexOf("store.get("));
    // Everything that can fail is built before the download is logged.
    expect(code.indexOf("new Response(")).toBeLessThan(code.lastIndexOf("logAccess("));
    expect(f.src).toMatch(/kind: "DOWNLOADED"/);
    expect(f.src).toMatch(/kind: "REFUSED"/);
    expect(f.src).toMatch(/actor: as/);
    // The supplier is the session's: the address names an attachment, never a supplier.
    expect(lex(f.src, { only: "comments" })).not.toMatch(/searchParams|\.get\(\s*["'](?:supplierId|organisationId|accountId)["']\s*\)/);
    // The reach chain: the attachment, held through its award, in the supplier's own organisation.
    const reach = read("lib/project-docs/portal-file.ts");
    expect(reach).toMatch(/organisationId: actor\.organisationId/);
    expect(reach).toMatch(/supplierHoldsContract\(\{ awardVendorId: award\.vendorId, awardStatus: award\.status, supplierId: actor\.supplierId \}\)/);
    expect(reach).toMatch(/contractorSeesVersion\(/);
    expect(reach).toMatch(/contractorMayDownload\(/);
    expect(reach).toMatch(/purpose: "PROJECT_DOCUMENT_FILE"/);
  });

  it("no handler or loader reads a supplier, an organisation, an account, a day or a time from the request", () => {
    for (const f of [...PROJECT_DOCUMENT_ROUTES, ...LIBS]) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|uploadedOn|uploadedAt|requestedAt|storedAt)["']\s*\)/);
      expect(code, f.file).not.toMatch(/(?:fields|body|post\.fields|params|searchParams)\??\.\s*(?:supplierId|organisationId|accountId|supplierAccountId|uploadedOn|uploadedAt|requestedAt|storedAt)\b/);
    }
    // The parsers read a contract, a document, staged files, a note and a title, and nothing else (and no approver: a contractor names none).
    const api = lex(read("lib/project-docs/portal-api.ts"), { only: "comments" });
    expect(api).not.toMatch(/["'](?:supplierId|organisationId|accountId|supplierAccountId)["']/);
  });

  it("hold no server action, and the acts and readers take the supplier and the organisation from the actor", () => {
    for (const f of PROJECT_DOCUMENT_ROUTES) expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
    const acts = read("lib/project-docs/portal-acts.ts");
    expect(acts).toMatch(/inHeldContract\(actor, contractId/);
    expect(acts).toMatch(/kind: "SUPPLIER", actor/);
    expect(lex(acts)).not.toMatch(/withLockedContract\(|lockSupplierRow|FROM "Supplier"/);
    for (const file of ["lib/project-docs/portal-read.ts", "lib/project-docs/portal-file.ts"]) {
      expect(read(file), file).toMatch(/organisationId: actor\.organisationId/);
    }
    // The contractor's readers never reach the staff ones, which name officers and carry the organisation's own state.
    for (const file of ["lib/project-docs/portal-read.ts", "lib/project-docs/portal-file.ts", "lib/project-docs/portal-acts.ts", "lib/project-docs/contractor-view.ts"]) {
      expect(lex(read(file)), file).not.toMatch(/loadDocumentPage|loadRegister\(|loadWorkspaceStart|organisationSideOn|decidedBy|approverName/);
    }
  });
});

describe("the supplier is the session's", () => {
  /// The files that act for a signed-in supplier: the portal's pages and handlers, the portal's guard and its loaders.
  const ACTING = [
    ...PORTAL.filter((f) => !f.file.startsWith("app/supplier/register/")),
    ...["app/_auth/supplier.ts", "lib/portal/registration-status-repo.ts", "lib/auth/supplier-session-store.ts", "lib/portal/registration/draft-store.ts", "lib/portal/registration/upload-store.ts", "lib/portal/registration/submit-store.ts", "lib/portal/registration/own-file-store.ts", "lib/portal/company/replace-store.ts", "lib/portal/company/bank-store.ts", "lib/portal/company/company-store.ts"].map((file) => ({ file, src: read(file) })),
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
    expect(read("app/_auth/supplier.ts")).not.toMatch(/text\/plain/);
    // Changed for Phase 4b: the upload takes a multipart body, and only `supplierUploadPost` says so: the JSON guard above names none, and it is the one guard that accepts it.
    const raw = lex(read("app/_auth/supplier.ts"), { only: "comments" });
    const upload = raw.slice(raw.indexOf("export async function supplierUploadPost"), raw.indexOf("export async function supplierGet"));
    expect(upload).toMatch(/foreignRequestFault\(request, \["multipart\/form-data"\], env\)/);
    expect(raw.replace(upload, "")).not.toMatch(/multipart/);
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

describe("the schedule of tenders a result publishes (go-live R4a)", () => {
  const f = RESULT_SCHEDULE_HANDLERS[0];
  it("is one GET at one literal shape, with a HEAD that is refused", () => {
    expect(RESULT_SCHEDULE_HANDLERS.map((h) => h.file)).toEqual(["app/supplier/results/[id]/schedule/route.ts"]);
    expect([...f.src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1])).toEqual(["GET", "HEAD"]);
    const code = lex(f.src);
    const head = code.slice(code.search(/export\s+async\s+function\s+HEAD\b/));
    expect(head.slice(0, head.indexOf("}") + 1)).not.toMatch(/\bawait\b|\bdb\.|loadResultSchedule/);
    expect(f.src).not.toMatch(/^\s*["']use server["']/m);
  });
  it("reads what it serves through the one public read, and takes nothing from the request but the id", () => {
    expect(f.src).toMatch(/loadResultSchedule\(id\)/);
    const code = lex(f.src, { only: "comments" });
    expect(code).not.toMatch(/searchParams|\.formData\(|\.json\(|headers\.get|cookies\(|from "next\/headers"/);
    expect(code).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId)["']\s*\)/);
  });
  it("serves nothing that is not Public, whatever the read says, and logs no download", () => {
    expect(f.src).toMatch(/classificationSnapshot !== "PUBLIC"/);
    expect(f.src).not.toMatch(/kind: "DOWNLOADED"/);
  });
});
