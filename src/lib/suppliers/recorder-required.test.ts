import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Product owner, 2026-10-06 (ruling 5b): every application on the register names the officer who recorded
 * it. `SupplierApplication.recordedByPersonId` stays nullable only for the one test record the superseded
 * direct portal path made (DEMO/SUP/0008, kept and rejected, not deleted), and the database CHECK
 * `SupplierApplication_recorder_portal_only` refuses a null on any paper channel. This scan holds the rest:
 * no code path writes a null recorder, on any channel, and nothing changes the recorder once recorded.
 */

const ROOT = process.cwd();
const slash = (p: string) => p.split(path.sep).join("/");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = slash(path.join(dir, name));
    if (rel === "src/generated" || name === "node_modules") continue;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

/// The argument text of each call `<model>.<method>(…)`, balanced on brackets.
function calls(src: string, model: string, methods: readonly string[]): { method: string; arg: string }[] {
  const out: { method: string; arg: string }[] = [];
  const re = new RegExp(`\\b${model}\\.(${methods.join("|")})\\(`, "g");
  for (const m of src.matchAll(re)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if ("({[".includes(src[i])) depth++;
      else if (")}]".includes(src[i])) depth--;
    }
    out.push({ method: m[1], arg: src.slice(start, i - 1) });
  }
  return out;
}

/// The value written for `recordedByPersonId` in a create's argument, or null if the key is absent.
function recorderValue(arg: string): string | null {
  const m = /\brecordedByPersonId:\s*/.exec(arg);
  if (!m) return null;
  let depth = 0;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < arg.length; i++) {
    const c = arg[i];
    if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) break;
  }
  return arg.slice(start, i).trim();
}

/// A recorder value is acceptable when it is a person's id read as present: never null, never optional.
const namesAPerson = (v: string | null) => v != null && /^[\w$]+!?\.id$/.test(v) && !/\b(null|undefined)\b/.test(v);

const CREATES = ["create", "createMany", "createManyAndReturn", "upsert"] as const;
const UPDATES = ["update", "updateMany", "updateManyAndReturn"] as const;

describe("every application names its recorder (ruling 5b)", () => {
  const files = [...walk("src"), ...walk("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));

  it("scans the app, the libraries and the demo", () => {
    const names = files.map((f) => f.file);
    for (const f of ["src/app/suppliers/actions.ts", "src/lib/suppliers/application-acts.ts", "prisma/demo-suppliers.ts"]) expect(names).toContain(f);
  });

  it("every create of an application writes a person's id as its recorder", () => {
    const creates = files.flatMap(({ file, src }) => calls(src, "supplierApplication", CREATES).map((c) => ({ file, ...c, value: recorderValue(c.arg) })));
    // The officer's paper application and a further application (actions.ts), and the demo's two (demo-suppliers.ts).
    expect(creates.length).toBeGreaterThanOrEqual(4);
    expect(creates.filter((c) => !namesAPerson(c.value)).map((c) => `${c.file} · ${c.method} · ${c.value ?? "no recorder"}`)).toEqual([]);
  });

  it("nothing changes or clears the recorder once recorded", () => {
    const updates = files.flatMap(({ file, src }) => calls(src, "supplierApplication", UPDATES).map((c) => ({ file, ...c })));
    expect(updates.length).toBeGreaterThan(0);
    const touched = updates.filter((c) => /\brecordedByPersonId\b/.test(c.arg)).map((c) => `${c.file} · ${c.method}`);
    expect(touched).toEqual([]);
  });

  it("no raw SQL writes an application", () => {
    const raw = files.filter(({ src }) => /\b(INSERT\s+INTO|UPDATE)\s+\\?"SupplierApplication\\?"/i.test(src)).map((f) => f.file);
    expect(raw).toEqual([]);
  });

  it("the public portal writes no application: an online one is staged and an officer records it", () => {
    const portal = files.filter(({ file }) => file.startsWith("src/app/supplier/"));
    expect(portal.length).toBeGreaterThan(0);
    expect(portal.filter(({ src }) => /\bsupplierApplication\.\w+\(/.test(src)).map((f) => f.file)).toEqual([]);
  });

  it("the database refuses a null recorder on any paper channel", () => {
    const dir = readdirSync(path.join(ROOT, "prisma/migrations")).find((d) => d.endsWith("_supplier_application_recorder_check"));
    expect(dir).toBeDefined();
    const sql = readFileSync(path.join(ROOT, "prisma/migrations", dir!, "migration.sql"), "utf8");
    expect(sql).toMatch(/ADD CONSTRAINT "SupplierApplication_recorder_portal_only"\s+CHECK \("recordedByPersonId" IS NOT NULL OR "channel" = 'PORTAL'\);/);
  });

  it("catches each form (self-tests)", () => {
    const value = (src: string) => recorderValue(calls(src, "supplierApplication", CREATES)[0].arg);
    expect(namesAPerson(value("tx.supplierApplication.create({ data: { kind: \"NEW\", recordedByPersonId: person!.id, recordedAt: now } })"))).toBe(true);
    expect(namesAPerson(value("db.supplierApplication.create({ data: { recordedByPersonId: OFFICER.id } })"))).toBe(true);
    expect(namesAPerson(value("tx.supplierApplication.create({ data: { recordedByPersonId: null, channel: \"PORTAL\" } })"))).toBe(false);
    expect(namesAPerson(value("tx.supplierApplication.create({ data: { recordedByPersonId: person?.id ?? null } })"))).toBe(false);
    expect(namesAPerson(value("tx.supplierApplication.create({ data: { recordedByPersonId: portal ? null : person!.id } })"))).toBe(false);
    expect(namesAPerson(value("tx.supplierApplication.create({ data: { kind: \"NEW\", channel: \"PORTAL\" } })"))).toBe(false);
    expect(calls("tx.supplierApplication.update({ where: { id }, data: { recordedByPersonId: null } })", "supplierApplication", UPDATES)[0].arg).toMatch(/recordedByPersonId/);
  });
});
