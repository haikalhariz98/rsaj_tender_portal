import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { exerciseRoutesOf } from "@/lib/method/approval";
import { NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN } from "@/lib/method/types";

/**
 * Acceptance C-4: the two ways an exercise ends — cancelling it, and a name refusal that
 * terminates it — each void the exercise's live tender pack and withdraw its pending routes
 * of BOTH domains (the name's and the tendering's), not only the route that decided. A source
 * scan (vitest has no database) plus the behaviour the withdrawal loops lean on.
 */

const actions = readFileSync(join(process.cwd(), "src/app/sourcing/actions.ts"), "utf8");
const store = readFileSync(join(process.cwd(), "src/lib/tender-docs/store.ts"), "utf8");

const region = (from: string, to: string) => {
  const i = actions.indexOf(from);
  expect(i, `${from} exists`).toBeGreaterThan(-1);
  const j = actions.indexOf(to, i + from.length);
  expect(j, `${to} follows`).toBeGreaterThan(i);
  return actions.slice(i, j);
};

const cancel = region("export async function cancelExercise(", "// --------------------------------------------------------------- participants");
const terminate = region('} else if (kind === "TERMINATE") {', "// Back to whoever asked");

describe("cancelling an exercise", () => {
  it("voids the live pack, with the cancel reason", () => {
    expect(cancel).toMatch(/await voidLivePacks\(tx, l, reason\)/);
  });
  it("withdraws every pending route of the exercise, of each domain", () => {
    expect(cancel).toMatch(/exerciseRoutesOf\(ex\.approvalInstances\)\.filter\(\(i\) => i\.status === "PENDING"\)/);
    expect(cancel).toMatch(/status: "RECALLED"/);
    expect(cancel).not.toMatch(/nameRoutesOf|tenderingRoutesOf/);
  });
});

describe("a name refusal that terminates the exercise", () => {
  it("voids the live pack, with the refusal as the reason", () => {
    expect(terminate).toMatch(/await voidLivePacks\(tx, l, `The name was refused and the exercise ends: \$\{reason\}`\)/);
  });
  it("withdraws the other pending routes of every domain (the deciding route is closed by its own rejection)", () => {
    expect(terminate).toMatch(/exerciseRoutesOf\(ex\.approvalInstances\)\.filter\(\(i\) => i\.status === "PENDING" && i\.id !== instId\)/);
    expect(terminate).toMatch(/status: "RECALLED"/);
    expect(terminate).not.toMatch(/nameRoutesOf|tenderingRoutesOf/);
  });
  it("the status of the exercise is the cancelled one, and the pack's voiding is not conditional on the route's domain", () => {
    expect(terminate).toMatch(/status: "CANCELLED"/);
    expect(terminate.indexOf("voidLivePacks")).toBeGreaterThan(terminate.indexOf('status: "CANCELLED"'));
  });
});

describe("voiding the live pack", () => {
  it("writes the VOID status with the reason, and its audit row, for a draft or a pack with approval only", () => {
    expect(store).toMatch(/isLivePack\(x\.status as TenderPackStatus\)/);
    expect(store).toMatch(/data: \{ status: "VOID", voidReason: reason \}/);
    expect(store).toMatch(/writeAudit\(tx,/);
  });
  it("the migration holds the rule too: a voided pack always says why", () => {
    const sql = readFileSync(join(process.cwd(), "prisma/migrations/20261001192500_tender_pack_void_reason/migration.sql"), "utf8");
    expect(sql).toMatch(/ADD CONSTRAINT "TenderPack_void_reason"\s+CHECK \("status" <> 'VOID' OR btrim\("voidReason"\) <> ''\)/);
    expect(sql.split("\n").filter((l) => l.startsWith("--")).join("")).not.toContain(";");
  });
});

describe("the withdrawal loops reach both domains", () => {
  const route = (id: string, domain: string, status: "PENDING" | "APPROVED") => ({ id, domain, awardId: null, status });
  it("exerciseRoutesOf keeps a pending name route and a pending tendering route, and drops an award's", () => {
    const routes = [route("n", NAME_APPROVAL_DOMAIN, "PENDING"), route("t", TENDERING_APPROVAL_DOMAIN, "PENDING"), { ...route("a", "appointment", "PENDING"), awardId: "aw" }, route("done", NAME_APPROVAL_DOMAIN, "APPROVED")];
    expect(exerciseRoutesOf(routes).filter((i) => i.status === "PENDING").map((i) => i.id).sort()).toEqual(["n", "t"]);
  });
});

describe("the ADR records it (C-7)", () => {
  it("decision 3 of ADR 0013 says a name refusal that ends the exercise also voids its live pack", () => {
    const adr = readFileSync(join(process.cwd(), "docs/notes/architecture/0013-tender-pack-freeze-and-tendering-states.md"), "utf8");
    expect(adr).toMatch(/A name refusal that ends the exercise does the same:\s+it\s+also voids the live pack/);
  });
});
