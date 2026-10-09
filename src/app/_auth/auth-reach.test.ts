import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicEntryFile, PUBLIC_ENTRY_POINTS } from "@/lib/auth/routes";
import { isServerModule, lex, spans } from "@/lib/scan/source";

/**
 * Who is signed in is asked first, everywhere (Phase 1b, threat model F3 and the security tests of the plan). A source scan, in the manner of
 * `certificate-scan.test.ts`, of every entry point under `src/app`:
 *
 * - every export of a `"use server"` file (each is a public POST endpoint, however the screen hides its button);
 * - every page;
 * - every route handler (and the HTTP method it answers);
 * - every layout that loads data.
 *
 * Each must ask `requireStaff` (an action or a page) or `staffRoute` (a route handler) as its first awaited call, before any read, any write and any
 * parse, or be named in `PUBLIC_ENTRY_POINTS` (`src/lib/auth/routes.ts`) with its reason, or in the short list of exceptions below with its own. Adding an
 * entry point that is neither fails here, which is the point.
 */

const ROOT = process.cwd();
const APP = path.join(ROOT, "src", "app");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
const rel = (f: string) => path.relative(APP, f).split(path.sep).join("/");

const FILES = walk(APP).map((f) => ({ file: rel(f), src: readFileSync(f, "utf8") }));
const publicEntry = (file: string) => isPublicEntryFile(file);

/// The calls that count as asking who is signed in. `staffOrSignIn` is the account page's own wrapper of `requireStaff`, which sends nobody-signed-in to sign in.
/// `staffForAct` (Phase 2a) is the wrapper an action uses for an act only an office holder may do: it calls `requireStaff` first, and hands an administrator's refusal back as the form's state.
/// `staffForPermission` (review of Phase 2a) is the same for an action that only someone holding a product permission may do: it calls `requireStaff` first and hands the refusal, in words, back as the form's state.
/// Phase 4a: `requireSupplier` (a supplier's page) and `supplierPost` (a handler behind a supplier's account) are the supplier store's `requireStaff` and `staffRoute`. They are asked first in the
/// pages and handlers of `supplier/account`, which are no longer exempt as a whole folder; `supplier-reach.test.ts` holds what they promise.
/// Phase 4b: `supplierUploadPost` (a multipart upload) and `supplierGet` (a read of codes or of the supplier's own file) are the same guard for the registration wizard's other handlers.
/// Phase 5: `stageEdit` is a Configuration editor's exported action: it asks `staffForPermission("configuration.draft")` as its first awaited call, and `stageRecordEdit` (a correction of the
/// record) asks `requireStaff()` (both pinned in `registry-scan.test.ts`).
const GUARDS = ["requireStaff(", "staffOrSignIn(", "staffRoute(", "staffForAct(", "staffForPermission(", "requireSupplier(", "supplierPost(", "supplierUploadPost(", "supplierGet(", "stageEdit(", "stageRecordEdit("];

interface Entry {
  file: string;
  name: string;
  /// The function's body with strings and comments blanked.
  body: string;
}

/// The exported functions of a file, by name, whatever they are exported as (`export async function`, `export default async function`).
function exportsOf(file: string, src: string): Entry[] {
  const m = lex(src);
  const out: Entry[] = [];
  const decl = /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g;
  for (const x of m.matchAll(decl)) {
    const name = x[1];
    const s = spans(m).find((sp) => sp.name === name && sp.from > x.index!);
    if (s) out.push({ file, name, body: m.slice(s.from, s.to) });
  }
  return out;
}

/// What the function does first: the text from its first `await`, or null where it awaits nothing.
const firstAwait = (body: string): string | null => {
  const at = body.search(/\bawait\b/);
  return at < 0 ? null : body.slice(at, at + 80);
};
/// Nothing is started before the guard: between the opening brace and the first await there is at most a declaration of what the guard's answer is kept in
/// (and, for an account action that answers a form, the `try {` it is asked inside). A read started and not awaited is still a read before it.
const BEFORE_GUARD = /^\{\s*(?:let \w+;\s*try \{\s*)?(?:(?:const|let)\s+\w+\s*=\s*|\w+\s*=\s*)?$/;
const asksFirst = (e: Entry) => {
  const first = firstAwait(e.body);
  if (first == null || !GUARDS.some((g) => new RegExp(String.raw`^await\s+${g.replace("(", "\\(")}`).test(first))) return false;
  return BEFORE_GUARD.test(e.body.slice(0, e.body.search(/\bawait\b/)).trim());
};

const ACTION_FILES = FILES.filter((f) => isServerModule(f.src) && !publicEntry(f.file));
const PAGE_FILES = FILES.filter((f) => /(^|\/)page\.tsx$/.test(f.file) && !publicEntry(f.file));
const ROUTE_FILES = FILES.filter((f) => /(^|\/)route\.ts$/.test(f.file) && !f.file.startsWith("_auth/"));
const LAYOUT_FILES = FILES.filter((f) => /(^|\/)layout\.tsx$/.test(f.file));

describe("the scan finds what it should", () => {
  it("reads the server modules, the pages, the routes and the layouts it is about", () => {
    // 61 server modules at the time of writing (the plan counted 54 earlier), less sign-in's.
    expect(ACTION_FILES.length).toBeGreaterThan(50);
    expect(PAGE_FILES.length).toBeGreaterThan(55);
    // 12 before Phase 4a, and the supplier portal's seven handlers since: sign-in, sign-out, activate, reset, and the account's password, sign-out-everywhere and acknowledge.
    // Phase 4b adds the registration wizard's six: save, upload, withdraw-file, submit, values and file.
    // Phase 4c adds the Company workspace's two uploads: a document (a replacement, a renewal, an answer to the office's request) and a change of bank details.
    // Changed for Phase 4d: My Bids adds three route handlers (event, acknowledge, request), so 30. The count is of files, and each is held below.
    // Changed for Phase 4e: My Projects adds three (submit, diary, certificate), so 33.
    expect(ROUTE_FILES.length).toBe(33);
    expect(LAYOUT_FILES.length).toBeGreaterThanOrEqual(2);
    expect(ACTION_FILES.flatMap((f) => exportsOf(f.file, f.src)).length).toBeGreaterThan(450);
  });

  it("recognises a guard first and an unguarded entry (self-test)", () => {
    const guarded = exportsOf("a.ts", 'export async function save(a) {\n  const actor = await requireStaff();\n  const x = await read();\n}');
    const late = exportsOf("a.ts", 'export async function save(a) {\n  const x = await read();\n  const actor = await requireStaff();\n}');
    const none = exportsOf("a.ts", "export async function save(a) {\n  return 1;\n}");
    const inString = exportsOf("a.ts", 'export async function save(a) {\n  const s = "await requireStaff()";\n  await read();\n}');
    const started = exportsOf("a.ts", "export async function save(a) {\n  const pending = read();\n  const actor = await requireStaff();\n}");
    const tried = exportsOf("a.ts", 'export async function save(a) {\n  let actor;\n  try {\n    actor = await requireStaff({ on: "throw" });\n  } catch (e) {\n    return 1;\n  }\n}');
    expect([guarded, late, none, inString, started, tried].map((e) => asksFirst(e[0]))).toEqual([true, false, false, false, false, true]);
  });
});

describe("every export of a server module asks who is signed in first", () => {
  it("none is reachable signed out", () => {
    const unguarded = ACTION_FILES.flatMap((f) => exportsOf(f.file, f.src)).filter((e) => !asksFirst(e));
    expect(unguarded.map((e) => `${e.file}: ${e.name}`)).toEqual([]);
  });

  it("the sign-in actions are the public ones, named, each behind the Origin guard", () => {
    const signIn = FILES.filter((f) => f.file.startsWith("sign-in/") && isServerModule(f.src)).flatMap((f) => exportsOf(f.file, f.src));
    expect(signIn.map((e) => e.name).sort()).toEqual(["redeemCodeAction", "signInAction", "signOutAction"]);
    for (const e of signIn) expect(e.body, e.name).toContain("refuseForeignPost(");
  });
});

describe("every page asks who is signed in first", () => {
  it("none shows anything to nobody", () => {
    const pages = PAGE_FILES.map((f) => {
      const defaults = exportsOf(f.file, f.src).filter((e) => new RegExp(String.raw`export\s+default\s+(?:async\s+)?function\s+${e.name}\b`).test(f.src));
      return { file: f.file, defaults };
    });
    expect(pages.filter((p) => p.defaults.length !== 1).map((p) => p.file)).toEqual([]);
    expect(pages.flatMap((p) => p.defaults).filter((e) => !asksFirst(e)).map((e) => `${e.file}: ${e.name}`)).toEqual([]);
  });

  it("a page does not load its data in generateMetadata or generateStaticParams, which no guard would precede", () => {
    expect(PAGE_FILES.filter((f) => /export\s+(?:async\s+)?function\s+generate(?:Metadata|StaticParams)\b/.test(f.src)).map((f) => f.file)).toEqual([]);
  });

  it("a layout that loads anything does so only for someone signed in", () => {
    // The root layout renders for everyone (the sign-in screens sit in it), so it loads no counts for nobody; every other layout loads nothing at all.
    // Phase 5b: but Configuration's, which says how many saves wait for a second person, and asks who is signed in before it reads anything (`requireStaff`, redirecting nobody to sign in).
    const loaders = LAYOUT_FILES.filter((f) => /from "@\/lib\//.test(f.src));
    expect(loaders.map((f) => f.file).sort()).toEqual(["configuration/layout.tsx", "layout.tsx"]);
    const root = loaders.find((f) => f.file === "layout.tsx")!;
    expect(root.src).toMatch(/const actor = await currentStaffOrNull\(\);/);
    // Phase 1c (ADR 0034 D10): the shell is now told whose organisation to name; the counts are still loaded only for someone signed in.
    expect(root.src).toMatch(/loadShell\(\{ organisationId, counts: actor != null && !portalOnly \}\)/);
    const configuration = loaders.find((f) => f.file === "configuration/layout.tsx")!;
    expect(configuration.src.indexOf("await requireStaff()")).toBeGreaterThan(-1);
    expect(configuration.src.indexOf("await requireStaff()")).toBeLessThan(configuration.src.indexOf("db.configurationChange.count"));
  });
});

describe("every route handler asks who is signed in first, and every one that changes anything passes the Origin guard", () => {
  const HTTP = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const handlers = ROUTE_FILES.filter((f) => !publicEntry(f.file)).flatMap((f) => [...f.src.matchAll(HTTP)].map((x) => exportsOf(f.file, f.src).find((e) => e.name === x[1])!));

  /// A handler that refuses outright with no read at all needs no session to do so.
  const EXCEPTIONS: Record<string, string> = {
    "api/documents/versions/[id]/route.ts#HEAD": "Answers 405 with no database read, no bytes and no log entry: Next would otherwise answer a HEAD with the GET handler, which reads and logs a download (audit C-2).",
    "supplier/registration/file/route.ts#HEAD": "Answers 405 with no database read, no bytes and no log entry, as the staff download does: Next would otherwise answer a HEAD with the GET handler, which reads and logs a download (audit C-2).",
  };

  it("finds the handlers", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(8);
    // The public ones are the logo, the staff sign-in page's picture, the registration post and (Phase 4a) the supplier portal's four doors that a stranger reaches: sign-in, activate, reset and sign-out.
    expect(ROUTE_FILES.filter((f) => publicEntry(f.file)).map((f) => f.file).sort()).toEqual([
      "organisation/logo/[sha]/route.ts",
      "sign-in/image/[sha]/route.ts",
      "supplier/activate/submit/route.ts",
      "supplier/register/submit/route.ts",
      "supplier/reset/submit/route.ts",
      "supplier/sign-in/submit/route.ts",
      "supplier/sign-out/route.ts",
    ]);
  });

  it("none is reachable signed out", () => {
    expect(handlers.filter((e) => !asksFirst(e) && !EXCEPTIONS[`${e.file}#${e.name}`]).map((e) => `${e.file}: ${e.name}`)).toEqual([]);
  });

  it("every exception is still a handler, and still reads nothing", () => {
    for (const key of Object.keys(EXCEPTIONS)) {
      const e = handlers.find((h) => `${h.file}#${h.name}` === key);
      expect(e, key).toBeDefined();
      expect(e!.body, key).not.toMatch(/\bawait\b|\bdb\./);
    }
  });

  it("a POST, PUT, PATCH or DELETE names the content types it accepts, so a cross-site form body is never read as one", () => {
    const writes = handlers.filter((e) => /^(POST|PUT|PATCH|DELETE)$/.test(e.name));
    expect(writes.length).toBeGreaterThanOrEqual(4);
    const raw = (e: Entry) => FILES.find((f) => f.file === e.file)!.src;
    for (const e of writes) {
      // Phase 2a: a handler for an act only an office holder may do also names the kind of act (`, holder: "HOLDER_CHECKED"`); the content types are asked as before.
      const types = /staffRoute\(\{ contentTypes: \[((?:"[a-z-]+\/[a-z-]+"(?:, )?)+)\](?:, holder: "[A-Z_]+")? \}\)/.exec(raw(e));
      // Phase 4a: a supplier's handler asks `supplierPost`, which accepts a JSON body from a page of this origin and nothing else (`readPortalPost`: `supplier-reach.test.ts` pins it).
      if (!types && /^supplier\/account\//.test(e.file)) {
        expect(e.body, `${e.file}: ${e.name}`).toMatch(/^\{\s*const guard = await supplierPost\(request, "[^"]*"\);/);
        continue;
      }
      // Phase 4b: the registration wizard's POSTs ask `supplierPost` (JSON; with a larger bound for a save) or `supplierUploadPost` (multipart, the upload only), first; `supplier-reach.test.ts`
      // holds what each promises, and that no other handler accepts a multipart body.
      // Phase 4c: the Company workspace's two POSTs are multipart uploads and ask `supplierUploadPost` first, held by the same section of `supplier-reach.test.ts`.
      // Phase 4d: My Bids' three POSTs are JSON and ask `supplierPost` first, with a small bound (`BIDS_BODY_LIMIT`).
      // Phase 4e: My Projects' three POSTs likewise (`PROJECTS_BODY_LIMIT`, room for a materials list).
      if (!types && /^supplier\/(?:registration|company|bids|projects)\//.test(e.file)) {
        expect(e.body, `${e.file}: ${e.name}`).toMatch(/^\{\s*const guard = await (?:supplierPost\(request, "[^"]*"(?:, \{ maxBytes: \w+ \})?\)|supplierUploadPost\(request, "[^"]*"\));/);
        continue;
      }
      expect(types, `${e.file}: ${e.name}`).not.toBeNull();
      expect(types![1], `${e.file}: ${e.name}`).not.toContain("text/plain");
    }
  });

  it("the public routes are the portal's registration post and the logo, and say why", () => {
    for (const e of PUBLIC_ENTRY_POINTS) expect(e.reason.length, e.under ?? e.file).toBeGreaterThan(40);
    // Phase 4a narrowed `supplier` (the whole folder) to the parts that are public, one by one: `supplier/account` is not among them.
    expect(PUBLIC_ENTRY_POINTS.map((e) => e.under ?? e.file).sort()).toEqual([
      "organisation/logo/[sha]/route.ts",
      "sign-in",
      "supplier/activate",
      // Changed for Phase 4c: "supplier/company" is no longer public. The Company workspace is built: its page asks `requireSupplier` and its handlers `supplierUploadPost`.
      // Changed for Phase 4d: "supplier/bids" is no longer public. My Bids is built: its pages ask `requireSupplier` and its handlers `supplierPost`.
      // Changed for Phase 4e: "supplier/projects" is no longer public. My Projects is built: its pages ask `requireSupplier` and its handlers `supplierPost`; `supplier/announcements` asks `requireSupplier`.
      "supplier/opportunities",
      "supplier/page.tsx",
      "supplier/register",
      "supplier/reset",
      "supplier/results",
      "supplier/sign-in",
      "supplier/sign-out/route.ts",
    ]);
    expect(PUBLIC_ENTRY_POINTS.some((e) => (e.under ?? e.file!) === "supplier" || (e.under ?? e.file!).startsWith("supplier/account"))).toBe(false);
  });

  it("every public entry names something that exists (none is stale)", () => {
    for (const e of PUBLIC_ENTRY_POINTS) expect(existsSync(path.join(APP, e.under ?? e.file!)), e.under ?? e.file).toBe(true);
  });
});

describe("the loader hook, the one way an act runs with nobody signed in, is for the loaders", () => {
  it("is named only by prisma/, scripts/ and src/app/_auth/", () => {
    const walkAll = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (n === "node_modules" || n === "generated" ? [] : statSync(path.join(dir, n)).isDirectory() ? walkAll(path.join(dir, n)) : /\.(ts|tsx|mts|mjs)$/.test(n) ? [path.join(dir, n)] : [])) : []);
    const users = [...walkAll(path.join(ROOT, "src")), ...walkAll(path.join(ROOT, "prisma")), ...walkAll(path.join(ROOT, "scripts"))]
      .map((f) => ({ f: path.relative(ROOT, f).split(path.sep).join("/"), src: readFileSync(f, "utf8") }))
      .filter(({ src }) => /\binstallLoader\b|\bloaderLabel\b|_auth\/loader["']/.test(src))
      .map(({ f }) => f);
    const outside = users.filter((f) => !(f.startsWith("prisma/") || f.startsWith("scripts/") || f.startsWith("src/app/_auth/")));
    expect(outside).toEqual([]);
    // And the one that installs it is the demo's act runner.
    expect(users.filter((f) => /installLoader\("/.test(readFileSync(path.join(ROOT, f), "utf8")) && !f.endsWith(".test.ts"))).toEqual(["prisma/demo-acts.ts"]);
  });
});
