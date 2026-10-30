import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPLIER_PROJECT_WORK_FILE, SUPPLIER_PROJECT_WORK_POST_PATHS, SUPPLIER_PROJECT_WORK_POSTS } from "@/lib/auth/routes";
import { lex } from "@/lib/scan/source";

/**
 * The contractor's work routes (workspace 3b step 4), held by a source scan as `supplier-reach.test.ts` holds the others (their first section skips `app/supplier/projects/work/`, so
 * these are the same rules and more, not fewer): the literal paths the public copy lists; the portal's guard first; the body parsed once and acted on only if it parsed; no password
 * (words, not a signature); the upload staged for a work item; the download applying `portalSeesFile` before a byte is read; the supplier the session's.
 */

const SRC = path.join(process.cwd(), "src");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)]));
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8").replace(/\r\n/g, "\n");
const ROUTES = walk(path.join(SRC, "app", "supplier", "projects", "work"))
  .filter((f) => /route\.ts$/.test(f))
  .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .map((file) => ({ file, src: read(file) }));

const FILE = (f: { file: string }) => `/${f.file.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
const methods = (src: string) => [...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]);
const UPLOAD = "app/supplier/projects/work/upload/route.ts";
const DOWNLOAD = "app/supplier/projects/work/file/[attachmentId]/route.ts";
const POSTS = ROUTES.filter((f) => f.file !== DOWNLOAD);
const JSON_POSTS = POSTS.filter((f) => f.file !== UPLOAD);

function bodyOf(src: string, method: string): string {
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
}

describe("the contractor's work routes", () => {
  it("are exactly the six literal posts the public copy lists, and the one download", () => {
    expect(POSTS.map(FILE).sort()).toEqual([...SUPPLIER_PROJECT_WORK_POST_PATHS].sort());
    expect(Object.values(SUPPLIER_PROJECT_WORK_POSTS)).toHaveLength(6);
    expect(`${SUPPLIER_PROJECT_WORK_FILE}/[attachmentId]`).toBe(FILE({ file: DOWNLOAD }));
    expect(ROUTES).toHaveLength(7);
  });

  it("each JSON act answers a POST only, asks the portal's guard first, parses once, acts only on what parsed, and asks no password", () => {
    expect(JSON_POSTS).toHaveLength(5);
    for (const f of JSON_POSTS) {
      expect(methods(f.src), f.file).toEqual(["POST"]);
      const body = bodyOf(f.src, "POST");
      expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierPost(request, "), f.file).toBe(true);
      expect(f.src, f.file).toMatch(/await supplierPost\(request, "projects", \{ maxBytes: PROJECTS_BODY_LIMIT \}\)/);
      expect(body, f.file).toMatch(/if \(!guard\.ok\) return guard\.response;/);
      expect(body.indexOf("(post.fields)"), f.file).toBeGreaterThan(body.indexOf("guard.ok"));
      expect(body.indexOf("if (!parsed.ok) return"), f.file).toBeGreaterThan(body.indexOf("(post.fields)"));
      expect(body.indexOf("if (!parsed.ok) return"), f.file).toBeLessThan(body.indexOf("parsed.value"));
      expect(lex(f.src), f.file).not.toMatch(/password/i);
    }
  });

  it("the upload is guarded first, takes a place in line, stages for a work item against the WORK_ITEM row, in the usual order, and takes no contract lock", () => {
    const f = POSTS.find((x) => x.file === UPLOAD)!;
    expect(methods(f.src)).toEqual(["POST"]);
    const body = bodyOf(f.src, "POST");
    expect(body.slice(body.search(/\bawait\b/)).startsWith("await supplierUploadPost(request, ")).toBe(true);
    expect(body.indexOf("uploadLimiter().tryAcquire()")).toBeGreaterThan(body.indexOf("guard.ok"));
    expect(body).toMatch(/finally\s*\{\s*slot\(\);/);
    const code = lex(f.src);
    for (const [a, b] of [["parseUploadQuery(", "preflightProjectUpload("], ["preflightProjectUpload(", "requestLengthFault("], ["requestLengthFault(", "limitBodyPaced("], ["limitBodyPaced(", "formData()"], ["formData()", "parseUploadForm("], ["parseUploadForm(", "recogniseFile("], ["recogniseFile(", "mediaFault("], ["mediaFault(", "storeProjectFile("]] as const) {
      expect(code.indexOf(a), a).toBeGreaterThan(-1);
      expect(code.indexOf(b), b).toBeGreaterThan(code.indexOf(a));
    }
    expect(f.src).toMatch(/act: "WORK_ITEM"/);
    expect(f.src).toMatch(/stagedFor: STAGED_FOR_WORK_ITEM/);
    expect(code).not.toMatch(/withLockedContract|inHeldContract/);
  });

  it("the download is guarded first, reads the file only through findWorkFile (which applies portalSeesFile), logs after the response is built, and a HEAD reads nothing", () => {
    const f = ROUTES.find((x) => x.file === DOWNLOAD)!;
    expect(methods(f.src)).toEqual(["GET", "HEAD"]);
    expect(f.src).toMatch(/await supplierGet\(request, "projects"\)/);
    const code = lex(f.src);
    expect(code.indexOf("findWorkFile(")).toBeGreaterThan(-1);
    expect(code.indexOf("findWorkFile(")).toBeLessThan(code.indexOf("store.get("));
    expect(code.indexOf("new Response(")).toBeLessThan(code.lastIndexOf("logAccess("));
    expect(bodyOf(f.src, "HEAD")).not.toMatch(/\bawait\b|\bdb\./);
    const reach = read("src/lib/work/portal-read.ts".replace(/^src\//, ""));
    const finder = reach.slice(reach.indexOf("export async function findWorkFile("));
    for (const needle of [/portalSeesFile\(/, /sharedAt: \{ not: null \}/, /purpose: "WORK_ITEM_FILE"/, /award\.vendorId !== actor\.supplierId/, /detachedAt: null/]) expect(finder).toMatch(needle);
  });

  it("no route, reader or parser reads a supplier, an organisation or an account from the request; no server action; the store takes the supplier from the actor", () => {
    const libs = ["lib/work/portal-store.ts", "lib/work/portal-read.ts", "lib/portal/projects/work-api.ts"].map((file) => ({ file, src: read(file) }));
    for (const f of [...ROUTES, ...libs]) {
      const code = lex(f.src, { only: "comments" });
      expect(code, f.file).not.toMatch(/\.get\(\s*["'](?:supplierId|organisationId|accountId|supplierAccountId|actorId|recordedAt|sharedAt)["']\s*\)/);
      expect(code, f.file).not.toMatch(/(?:fields|body|post\.fields|params|searchParams)\??\.\s*(?:supplierId|organisationId|accountId|supplierAccountId|recordedAt|sharedAt)\b/);
      expect(f.src, f.file).not.toMatch(/^\s*["']use server["']/m);
    }
    expect(lex(read("lib/portal/projects/work-api.ts"), { only: "comments" })).not.toMatch(/["'](?:supplierId|organisationId|accountId|supplierAccountId|sharedAt|internal)["']/);
    const store = read("lib/work/portal-store.ts");
    expect(store).toMatch(/inHeldContract\(actor, contractId/);
    expect(store).toMatch(/supplierAuditActor\(actor\)/);
    expect(lex(store)).not.toMatch(/withLockedContract\(|\bdb\./);
  });
});
