import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Source scans for the Project workspace fix round's rulings that are about where a value is read, not what it is: the portal acts read the clock once (PW-55), the
 * document drawer draws no Withdraw on a project file (PW-33), and the workspace's notices carry no exercise (PW-45). The behaviour is held by the db tests; these hold
 * the shape, so a later edit cannot quietly undo it.
 */

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

describe("PW-55: a portal act reads the clock once, to the second, and derives the organisation's day from that moment", () => {
  it("portal-acts reads it once, through toSecond, and hands the same moment to the held contract and to the core", () => {
    const src = read("src/lib/project-docs/portal-acts.ts");
    expect(src.match(/new Date\(\)/g) ?? []).toHaveLength(1);
    expect(src).toContain("const now = toSecond(new Date());");
    expect(src).toContain("return fn({ tx, l, now, today });");
    expect(src).toMatch(/\}, now\);/);
  });

  it("inHeldContract derives the day from the moment it is handed, never from a second clock read", () => {
    const src = read("src/lib/portal/projects/submission-store.ts");
    const at = src.indexOf("export async function inHeldContract");
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).toContain("dayOf(now, l.org.timeZone)");
    // The only clock read is the default for a caller that hands none (the diary's acts).
    expect(body.match(/new Date\(\)/g) ?? []).toHaveLength(1);
    expect(body).toMatch(/now: Date = new Date\(\)/);
  });
});

describe("PW-33: the document drawer draws no Withdraw on a project file", () => {
  it("the Withdraw form is drawn only for a version not withdrawn and not kept as a project file", () => {
    const src = read("src/components/attachments/document-drawer.tsx");
    const gate = src.indexOf("{!v.withdrawn && !v.keptAsProjectFile && (");
    expect(gate).toBeGreaterThan(-1);
    expect(src.indexOf("title={`Withdraw version $" + "{v.versionNo}`}")).toBeGreaterThan(gate);
  });
});

describe("PW-45: the workspace's notices carry no exercise", () => {
  it("notify writes exerciseId null, as the contractor's submissions do", () => {
    const src = read("src/lib/project-docs/store.ts");
    const at = src.indexOf("async function notify(");
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).toContain("exerciseId: null");
    expect(body).not.toMatch(/exerciseId: c\.l\.ex/);
  });
});

describe("PW-51: marking is the officer's own act, so its drawer picks no person", () => {
  it("MarkDrawer has no actorField, and the editors no longer import it (no workspace drawer has one)", () => {
    const src = read("src/app/projects/[id]/document-editors.tsx");
    const at = src.indexOf("export function MarkDrawer(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).not.toContain("actorField(");
    expect(body).not.toContain("decidedByPersonId");
    expect(src).not.toMatch(/import \{[^}]*\bactorField\b/);
  });
});
