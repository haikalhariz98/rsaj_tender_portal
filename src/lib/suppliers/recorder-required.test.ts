import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { toPosix } from "@/lib/scan/files";

/**
 * Product owner, 2026-10-06 (ruling 5b): every application on the register names the officer who recorded
 * it. `SupplierApplication.recordedByPersonId` stays nullable only for the one test record the superseded
 * direct portal path made (DEMO/SUP/0008, kept and rejected, not deleted), and the database CHECK
 * `SupplierApplication_recorder_portal_only` refuses a null on any paper channel. This scan holds the rest:
 * no code path writes a null recorder, on any channel, and nothing changes the recorder once recorded.
 */

const ROOT = process.cwd();
const slash = (p: string) => toPosix(p);

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

  // Changed for Phase 4b, for a ruled decision (the CPD registration rulings of 2026-10-07, B3 of the specification): a registration the SUPPLIER sends from the signed-in wizard is an application with no
  // officer behind it. It names its sender instead (`submittedBySupplierAccountId`), the database holds that pair (CHECKs SupplierApplication_submitted_pair and _submitted_portal_only), and it is
  // written in exactly one place in the product, and in one demonstration loader that writes the same shape for a registration the demo shows as sent (prisma/demo-registration.ts, which judges the
  // draft by the product's own rule before it writes the send). Every other application still names an officer.
  const SENT_BY_SUPPLIER = ["src/lib/portal/registration/submit-store.ts", "prisma/demo-registration.ts"];

  it("every create of an application writes a person's id as its recorder, except the one a supplier sends, which names the supplier's account", () => {
    const creates = files.flatMap(({ file, src }) => calls(src, "supplierApplication", CREATES).map((c) => ({ file, ...c, value: recorderValue(c.arg), bySupplier: /\bsubmittedBySupplierAccountId:/.test(c.arg) })));
    // The officer's paper application and a further application (actions.ts), the demo's two (demo-suppliers.ts), and the supplier's own send.
    expect(creates.length).toBeGreaterThanOrEqual(5);
    // ADR 0041 D6 (registration step 4): the application created at the last approval of a whole online application. Nobody recorded it: an applicant who was not signed in sent it, its
    // officer is the route's requester (`submittedByPersonId`) and its decider is on its decision. Written in one place, on the portal channel, approved, naming the online application.
    const fromPortal = (c: { arg: string }) => /\bportalApplicationId:/.test(c.arg);
    expect(creates.filter((c) => !c.bySupplier && !fromPortal(c) && !namesAPerson(c.value)).map((c) => `${c.file} · ${c.method} · ${c.value ?? "no recorder"}`)).toEqual([]);
    const approved = creates.filter(fromPortal);
    expect(approved.map((c) => c.file)).toEqual(["src/lib/suppliers/portal-application-acts.ts"]);
    for (const c of approved) {
      expect(c.value, c.file).toBe("null");
      expect(c.arg, c.file).toMatch(/channel:\s*"PORTAL"/);
      expect(c.arg, c.file).toMatch(/status:\s*"APPROVED"/);
    }
    const sent = creates.filter((c) => c.bySupplier);
    expect(sent.map((c) => c.file).sort()).toEqual([...SENT_BY_SUPPLIER].sort());
    // And that one writes no officer, on the portal channel, with the time it was sent.
    for (const c of sent) {
      expect(c.value, c.file).toBe("null");
      expect(c.arg, c.file).toMatch(/channel:\s*"PORTAL"/);
      expect(c.arg, c.file).toMatch(/submittedAt:/);
    }
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
