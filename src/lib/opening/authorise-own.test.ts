import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { slotOf } from "@/lib/auth/act-slots";

/**
 * FR-OPN-003, the paper half (the product owner's ruling of 2026-10-07 on the 2b review, applied in Phase 3d): each present panel member authorises the opening with their own
 * password, signed in as themselves. Nobody authorises for another, so the authorisation is not paper-capable, the page offers the button to the member who is signed in alone,
 * and the drawer asks no person and says so in words.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), ...rel.split("/")), "utf8");
const WORKSPACE = read("src/app/sourcing/[id]/opening/workspace.tsx");
const EDITORS = read("src/app/sourcing/[id]/opening/editors.tsx");
const ACTIONS = read("src/app/sourcing/[id]/opening/actions.ts");

describe("an opening authorisation is each member's own", () => {
  it("is a signature with the password, refused to an administrator account as an unsealing, and is not paper-capable", () => {
    const slot = slotOf("OpeningAuthorisation", "person")!;
    expect(slot.signatureClass).toBe(true);
    expect(slot.onBehalf).toBe(false);
    expect(slot.holder).toBe("UNSEAL");
    expect(slotOf("BoxEvent", "person")!.onBehalf).toBe(false);
  });

  it("is offered on a member's row only to the member who is signed in; the others read that they authorise in their own sign-in", () => {
    expect(WORKSPACE).toMatch(/p\.personId === viewerPersonId \? <AuthoriseDrawer/);
    expect(WORKSPACE).toMatch(/Authorises in their own sign-in/);
    expect(WORKSPACE).toMatch(/viewerPersonId=\{actor\.personId\}/);
  });

  it("the drawer names no person to authorise for and offers no paper record, and its words say each member authorises in their own sign-in", () => {
    const drawer = EDITORS.slice(EDITORS.indexOf("export function AuthoriseDrawer"), EDITORS.indexOf("export function AdjournDrawer"));
    expect(drawer).not.toMatch(/forPerson/);
    expect(drawer).not.toMatch(/personId[,:]/);
    expect(drawer).toMatch(/own password/);
    expect(drawer).toMatch(/nobody authorises for another/i);
    expect(drawer).not.toMatch(/paper/i);
  });

  it("the action asks the unsealing guard first and begins the act on the authorisation's own slot, naming the opening as the document it signs", () => {
    const body = ACTIONS.slice(ACTIONS.indexOf("export async function recordAuthorisation"), ACTIONS.indexOf("export async function adjournOpening"));
    expect(body.indexOf('staffForAct("UNSEAL")')).toBeGreaterThan(0);
    expect(body.indexOf('staffForAct("UNSEAL")')).toBeLessThan(body.indexOf("beginAct("));
    expect(body).toMatch(/beginAct\(actor, data, "OpeningAuthorisation\.person", \{ personField: "personId", document: \{ entity: "Opening", id: openingId \} \}\)/);
  });
});
