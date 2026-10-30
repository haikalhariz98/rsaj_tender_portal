import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * The contractor's side of work items, read from the code (workspace 3b step 4; plan section 5 step 4; the leak is the one failure sharing cannot take back). Each query that
 * reaches a contractor names the two columns the leak tests rely on. What these do not read (declared): the values the columns hold (`portal.db.test.ts` holds those), and any
 * file outside the two portal files and the portal route handlers.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const reader = read("src/lib/work/portal-read.ts");
const store = read("src/lib/work/portal-store.ts");

/// The text of the call whose opening parenthesis is at `from`, to its closing one.
function callText(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}
const calls = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => callText(src, m.index! + m[0].length - 1));

describe("every item a contractor reads or locks is shared", () => {
  it("each workItem query in the portal reader names sharedAt: { not: null }, or reads it through portalWhere on the shared scope", () => {
    const q = calls(lex(reader), /\bworkItem\.(?:findFirst|findMany|count|findUnique)\(/g);
    expect(q.length).toBeGreaterThanOrEqual(4);
    // Every call names the column itself, or takes a `where` built by `shared(...)` (the only `const where` of the file), and `shared(...)` names the column.
    const code = lex(reader);
    const wheres = [...code.matchAll(/\bconst where = ([^;]*);/g)];
    expect(wheres).toHaveLength(1);
    expect(wheres[0][1].startsWith("shared(")).toBe(true);
    for (const c of q) expect(/sharedAt: \{ not: null \}/.test(c) || /\{ where[,\s]/.test(c), c.slice(0, 80)).toBe(true);
    expect(reader).toMatch(/const shared = [^\n]*sharedAt: \{ not: null \}/);
  });

  it("each workItem read in the portal store names sharedAt, except the number's aggregate (every item of the type, so an unshared number is never reused)", () => {
    const q = calls(lex(store), /\bworkItem\.(?:findFirst|findMany|aggregate)\(/g);
    const unshared = q.filter((c) => !/sharedAt: \{ not: null \}/.test(c));
    expect(q.length - unshared.length).toBe(1); // sharedItem's
    // The ones that do not: the number's aggregate, and the throttle's count and oldest row of the account's own raises (none reads anyone else's).
    expect(unshared.filter((c) => /_max: \{ number: true \}/.test(c))).toHaveLength(1);
    expect(unshared.filter((c) => /raisedBySupplierAccountId: actor\.accountId/.test(c))).toHaveLength(unshared.length - 1);
    // The throttle counts the account's own rows; it reads no one else's.
    expect(lex(store)).toMatch(/raisedBySupplierAccountId: actor\.accountId/);
  });

  it("every portal core reaches an existing item through sharedItem (the one 404), and re-checks sharedAt on the locked row", () => {
    const fnBody = (name: string) => store.slice(store.indexOf(`export function ${name}(`), store.indexOf("\n}\n", store.indexOf(`export function ${name}(`)));
    for (const name of ["attachAsContractor", "replyAsContractor", "moveAsContractor", "answerAsContractor"]) expect(fnBody(name), name).toContain("sharedItem(c, i.item)");
    expect(store).toMatch(/return row\.sharedAt === null \? refuse\(NOT_FOUND, 404\) : row;/);
  });
});

describe("a contractor reads and writes Replies only", () => {
  it("every workItemComment read in the portal reader names internal: false", () => {
    const q = calls(lex(reader), /\bworkItemComment\.\w+\(/g);
    expect(q.length).toBeGreaterThanOrEqual(1);
    for (const c of q) expect(c).toMatch(/internal: false/);
  });

  it("every comment the portal store inserts carries internal: false and the account, and never a literal true", () => {
    const q = calls(lex(store), /\bworkItemComment\.create\(/g);
    expect(q.length).toBe(2); // a reply, and Ask again's
    for (const c of q) {
      expect(c).toMatch(/internal: false/);
      expect(c).toMatch(/supplierAccountId: actor\.accountId/);
      expect(c).not.toMatch(/personId|internal: true/);
    }
  });

  it("the portal reader selects no audit rows, no links, no internal fields and not assigneeSupplierAccountId", () => {
    const code = lex(reader);
    expect(code).not.toMatch(/auditEntry|linksFrom|linksTo|workItemLink|assigneeSupplierAccount|cancelReason|priority|impact|actorPerson/);
  });
});

describe("a contractor is told nothing and names no one of the organisation", () => {
  it("the store passes no staff words: moveFaultText and whoNamesIn are not used; notices go out with actor null", () => {
    const code = lex(store);
    expect(code).not.toMatch(/moveFaultText|whoNamesIn|whoNamesOf|whoCanWords|actorDisplayName|displayName/);
    expect(code).toMatch(/writeNotices\(c\.tx, c\.l\.org\.id, null,/);
    expect(code).toMatch(/actorId: null/);
  });

  it("the portal reader names a staff member only through portalStaffLabel", () => {
    const code = lex(reader);
    expect(code).toMatch(/portalStaffLabel\(/);
    expect(code).not.toMatch(/name: true|person\.name/);
  });
});
