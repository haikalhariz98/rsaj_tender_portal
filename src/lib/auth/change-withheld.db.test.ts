import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makePerson, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";
import { RETURN_CORRECTION_KIND, RETURN_CORRECTION_OPERATION, RETURN_KEPT_FIELDS, RETURN_WITHHELD_FIELDS } from "@/lib/award/return-withheld";

/**
 * Go-live N7 (plan `docs/notes/plans/golive-n7.md` step 2, ruling on open item 2030): the guard of migration 20261114000000 lets the deciding UPDATE of a return
 * correction blank the listed personal values of its payload with JSON null, and nothing else. Rows are written by SQL as the owner, so the trigger alone judges them.
 * Refusals are told apart by SQLSTATE: PA004 the change guard, 23514 a CHECK.
 */

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}
async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

let organisationId: string;
let p1: string;
let p2: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  p1 = (await makePerson(organisationId)).id;
  p2 = (await makePerson(organisationId)).id;
});

type Field = [string, unknown];
type Payload = { operation: string; fields: Field[]; [key: string]: unknown };

/// Every field of the return form, each with a text value, so a refusal of a kept name comes from the name list and not from the value's type.
const returnPayload = (operation: string = RETURN_CORRECTION_OPERATION): Payload => ({
  operation,
  fields: [...RETURN_KEPT_FIELDS, ...RETURN_WITHHELD_FIELDS].map((name): Field => [name, `${name} value ${randomId()}`]),
});
const blank = (payload: Payload, names: readonly string[]): Payload => ({
  ...payload,
  fields: payload.fields.map(([name, value]): Field => [name, names.includes(name) ? null : value]),
});
const setValue = (payload: Payload, name: string, value: unknown): Payload => ({
  ...payload,
  fields: payload.fields.map(([n, v]): Field => [n, n === name ? value : v]),
});

async function insert(payload: object, kind: string = RETURN_CORRECTION_KIND): Promise<string> {
  const id = `n7_${randomId()}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "ConfigurationChange" ("id", "organisationId", "kind", "payload", "before", "proposedByPersonId") VALUES ($1, $2, $3::"ConfigurationChangeKind", $4::jsonb, '{}'::jsonb, $5)`,
    id,
    organisationId,
    kind,
    JSON.stringify(payload),
    p1,
  );
  return id;
}

/// The deciding UPDATE, with the payload written in the same statement. `extra` adds other assignments to it.
function decide(id: string, payload: object, status: "APPLIED" | "DECLINED" | "STALE" | "WITHDRAWN" = "APPLIED", extra = "") {
  const decider = status === "WITHDRAWN" ? p1 : p2;
  return db.$executeRawUnsafe(
    `UPDATE "ConfigurationChange" SET "status" = $2::"ConfigurationChangeStatus", "decidedByPersonId" = $3, "decidedAt" = now(), "payload" = $4::jsonb${extra} WHERE "id" = $1`,
    id,
    status,
    decider,
    JSON.stringify(payload),
  );
}

async function stored(id: string): Promise<{ status: string; payload: unknown }> {
  const rows = await db.$queryRawUnsafe<{ status: string; payload: unknown }[]>(`SELECT "status"::text AS status, "payload" FROM "ConfigurationChange" WHERE "id" = $1`, id);
  return rows[0];
}

/// A refused write leaves the row as it was proposed.
async function expectRefusedAndIntact(id: string, original: Payload, work: Promise<unknown>, label: string) {
  expect(await refusal(work), label).toBe("PA004");
  expect(await stored(id), label).toEqual({ status: "PROPOSED", payload: original });
}

describe("(a) the deciding UPDATE of a return correction blanks the listed values", () => {
  it.each(RETURN_WITHHELD_FIELDS)("blanks %s alone", async (name) => {
    const original = returnPayload();
    const id = await insert(original);
    const target = blank(original, [name]);
    expect(await refusal(decide(id, target))).toBeNull();
    expect(await stored(id)).toEqual({ status: "APPLIED", payload: target });
  });

  it.each(["APPLIED", "DECLINED", "STALE", "WITHDRAWN"] as const)("blanks every listed value together on a %s decision, and keeps every other value", async (status) => {
    const original = returnPayload();
    const id = await insert(original);
    const target = blank(original, RETURN_WITHHELD_FIELDS);
    expect(await refusal(decide(id, target, status))).toBeNull();
    const after = (await stored(id)) as { status: string; payload: Payload };
    expect(after.status).toBe(status);
    expect(after.payload).toEqual(target);
    for (const name of RETURN_WITHHELD_FIELDS) expect(after.payload.fields.find(([n]) => n === name)?.[1], name).toBeNull();
    for (const name of RETURN_KEPT_FIELDS) expect(after.payload.fields.find(([n]) => n === name)?.[1], name).toBe(original.fields.find(([n]) => n === name)?.[1]);
  });

  it("still decides a return correction with its payload unchanged", async () => {
    const original = returnPayload();
    const id = await insert(original);
    expect(await refusal(decide(id, original))).toBeNull();
    expect(await stored(id)).toEqual({ status: "APPLIED", payload: original });
  });
});

describe("(b) a kept value is never blanked", () => {
  it.each(RETURN_KEPT_FIELDS)("refuses a blank of %s (PA004)", async (name) => {
    const original = returnPayload();
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, blank(original, [name])), name);
    await expectRefusedAndIntact(id, original, decide(id, blank(original, [...RETURN_WITHHELD_FIELDS, name])), `${name} with the listed`);
  });
});

describe("(c) the marker is JSON null replacing text, nothing else", () => {
  it.each([
    ["an empty text", ""],
    ["another text", "rewritten"],
    ["an object", {}],
    ["a number", 0],
    ["false", false],
  ])("refuses a listed value set to %s (PA004)", async (label, value) => {
    const original = returnPayload();
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, setValue(original, "icNumber", value)), label);
  });

  it("refuses a blank of a listed name whose value was not text, such as a file (PA004)", async () => {
    const original = setValue(returnPayload(), "address", { file: { name: "a.pdf" } });
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, blank(original, ["address"])), "file value");
  });
});

describe("(d) the blank is only in the decision", () => {
  it("refuses a blank that leaves the change proposed (PA004)", async () => {
    const original = returnPayload();
    const id = await insert(original);
    const blanked = JSON.stringify(blank(original, RETURN_WITHHELD_FIELDS));
    await expectRefusedAndIntact(id, original, db.$executeRawUnsafe(`UPDATE "ConfigurationChange" SET "payload" = $2::jsonb WHERE "id" = $1`, id, blanked), "payload only");
  });
});

describe("(e) a decided change is never blanked afterwards", () => {
  it("refuses a blank of a row already decided (PA004) and keeps its payload", async () => {
    const original = returnPayload();
    const id = await insert(original);
    expect(await refusal(decide(id, original))).toBeNull();
    const blanked = JSON.stringify(blank(original, RETURN_WITHHELD_FIELDS));
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "ConfigurationChange" SET "payload" = $2::jsonb WHERE "id" = $1`, id, blanked))).toBe("PA004");
    expect(await refusal(db.$executeRawUnsafe(`UPDATE "ConfigurationChange" SET "payload" = $2::jsonb, "decisionReason" = 'again' WHERE "id" = $1`, id, blanked))).toBe("PA004");
    expect(await stored(id)).toEqual({ status: "APPLIED", payload: original });
  });
});

describe("(f) the operation, the names, the positions and the other keys stay", () => {
  const cases: [string, (p: Payload) => object][] = [
    ["a renamed field", (p) => ({ ...p, fields: p.fields.map(([n, v]): Field => (n === "icNumber" ? ["icNo", null] : [n, v])) })],
    ["a listed name moved onto a kept value", (p) => ({ ...p, fields: p.fields.map(([n, v]): Field => (n === "whereHeld" ? ["signatoryName", null] : [n, v])) })],
    ["a changed operation", (p) => ({ ...blank(p, RETURN_WITHHELD_FIELDS), operation: "awards-records.recordAcceptance" })],
    ["an added element", (p) => ({ ...blank(p, RETURN_WITHHELD_FIELDS), fields: [...blank(p, RETURN_WITHHELD_FIELDS).fields, ["icNumber", null]] })],
    ["a removed element", (p) => ({ ...p, fields: blank(p, RETURN_WITHHELD_FIELDS).fields.filter(([n]) => n !== "witnessName") })],
    ["a removed listed element alone", (p) => ({ ...p, fields: p.fields.filter(([n]) => n !== "icNumber") })],
    ["reordered elements", (p) => ({ ...p, fields: [...blank(p, RETURN_WITHHELD_FIELDS).fields].reverse() })],
    ["an added top-level key", (p) => ({ ...blank(p, RETURN_WITHHELD_FIELDS), withheld: ["icNumber"] })],
    ["fields that are no longer a list", (p) => ({ ...p, fields: {} })],
    ["an element that is no longer a pair", (p) => ({ ...p, fields: p.fields.map(([n, v]): unknown => (n === "icNumber" ? null : [n, v])) })],
    ["an element given a third member", (p) => ({ ...p, fields: p.fields.map(([n, v]): unknown[] => (n === "icNumber" ? [n, null, "x"] : [n, v])) })],
  ];
  it.each(cases)("refuses %s (PA004)", async (label, change) => {
    const original = returnPayload();
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, change(original)), label);
  });
});

describe("(g) only a return correction, under its own operation", () => {
  it("refuses the same blank on another kind (PA004)", async () => {
    const original = returnPayload();
    const id = await insert(original, "BASELINE_CORRECTION");
    await expectRefusedAndIntact(id, original, decide(id, blank(original, RETURN_WITHHELD_FIELDS)), "BASELINE_CORRECTION");
  });

  it("refuses the same blank on another operation of the return-correction kind (PA004)", async () => {
    const original = returnPayload("awards-records.recordAcceptance");
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, blank(original, RETURN_WITHHELD_FIELDS)), "other operation");
  });
});

describe("(h) every other column is still never changed by the decision", () => {
  it.each([
    ["before", `, "before" = '{"x": 1}'::jsonb`],
    ["reason", `, "reason" = 'rewritten'`],
    ["proposedAt", `, "proposedAt" = now() - interval '1 day'`],
    ["kind", `, "kind" = 'BASELINE_CORRECTION'::"ConfigurationChangeKind"`],
  ])("refuses a blank alongside a change of %s (PA004)", async (label, extra) => {
    const original = returnPayload();
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, decide(id, blank(original, RETURN_WITHHELD_FIELDS), "APPLIED", extra), label);
  });
});

describe("(i) a change is never deleted", () => {
  it("refuses DELETE (PA004)", async () => {
    const original = returnPayload();
    const id = await insert(original);
    await expectRefusedAndIntact(id, original, db.$executeRawUnsafe(`DELETE FROM "ConfigurationChange" WHERE "id" = $1`, id), "DELETE");
  });

  it("refuses TRUNCATE (PA004), inside a transaction that is rolled back whatever happens", async () => {
    const work = db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE "ConfigurationChange" CASCADE`);
      throw new Error("TRUNCATE was allowed, rolled back");
    });
    expect(await refusal(work)).toBe("PA004");
  });
});

describe("(j) the replaced function keeps its pinned search_path and its triggers", () => {
  it("holds search_path=pg_catalog, public, pg_temp in proconfig", async () => {
    const rows = await db.$queryRawUnsafe<{ config: string[] | null }[]>(`SELECT p.proconfig AS config FROM pg_proc p WHERE p.oid = 'public.guard_configuration_change()'::regprocedure`);
    expect(rows[0].config).toEqual(["search_path=pg_catalog, public, pg_temp"]);
  });

  it("is still the function of both triggers, each ENABLE ALWAYS", async () => {
    const rows = await db.$queryRawUnsafe<{ name: string; enabled: string }[]>(
      `SELECT t.tgname::text AS name, t.tgenabled::text AS enabled FROM pg_trigger t
        WHERE t.tgrelid = '"ConfigurationChange"'::regclass AND t.tgfoid = 'public.guard_configuration_change()'::regprocedure AND NOT t.tgisinternal ORDER BY 1`,
    );
    expect(rows).toEqual([
      { name: "ConfigurationChange_guard", enabled: "A" },
      { name: "ConfigurationChange_no_truncate", enabled: "A" },
    ]);
  });
});
