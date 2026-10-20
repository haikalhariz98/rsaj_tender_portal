import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isStoredField } from "@/lib/auth/configuration-edit";
import { sulitFieldOf } from "@/lib/sulit-trail";

import {
  blankWithheld,
  RETURN_CORRECTION_KIND,
  RETURN_CORRECTION_OPERATION,
  RETURN_KEPT_FIELDS,
  RETURN_WITHHELD_FIELDS,
  WITHHELD_WORDS,
  withheldFieldsOf,
} from "./return-withheld";

// Go-live N7 (plan docs/notes/plans/golive-n7.md, ruling on decisions-log line 2030, scoped at 2823): the return correction's personal values are blanked at the decision.

const WITHHELD: readonly string[] = RETURN_WITHHELD_FIELDS;
const KEPT: readonly string[] = RETURN_KEPT_FIELDS;
const OP = RETURN_CORRECTION_OPERATION;
const KIND = RETURN_CORRECTION_KIND;

/// A return correction as the form posts it, every field once.
const posted = (): [string, unknown][] => [
  ["id", "ret-1"],
  ["signedLetterReceivedOn", "2026-10-01"],
  ["declarationReceivedOn", "2026-10-02"],
  ["authorisationReceivedOn", "2026-10-03"],
  ["whereHeld", "Registry, cabinet 4"],
  ["signatoryName", "Aminah binti Yusof"],
  ["icNumber", "900101-14-5678"],
  ["occupation", "Engineer"],
  ["address", "12 Jalan Mawar, Kuala Lumpur"],
  ["capacity", "Director"],
  ["contractorSigned", "yes"],
  ["stampAffixed", "yes"],
  ["witnessName", "Lim Wei Ming"],
  ["witnessSigned", "no"],
  ["reason", "Wrong IC number recorded"],
];

describe("the withheld and kept lists", () => {
  it("are disjoint, and name every field once", () => {
    for (const n of WITHHELD) expect(KEPT, n).not.toContain(n);
    expect(new Set(WITHHELD).size).toBe(WITHHELD.length);
    expect(new Set(KEPT).size).toBe(KEPT.length);
  });

  it("withhold the SULIT identity card number", () => {
    expect(sulitFieldOf("AwardReturn", "icNumber")).not.toBeNull();
    expect(WITHHELD).toContain("icNumber");
  });

  it("withhold only fields a change stores", () => {
    for (const n of WITHHELD) expect(isStoredField(n), n).toBe(true);
  });

  it("apply to the return correction only", () => {
    expect(withheldFieldsOf(KIND, OP)).toEqual(WITHHELD);
    expect(withheldFieldsOf("BASELINE_CORRECTION", OP)).toEqual([]);
    expect(withheldFieldsOf(KIND, "awards-records.recordTerms")).toEqual([]);
    expect(withheldFieldsOf("", "")).toEqual([]);
  });

  it("show a word in place of a withheld value, never an empty value", () => {
    expect(WITHHELD_WORDS.en).toBe("Withheld");
  });
});

describe("blankWithheld", () => {
  it("replaces each listed text value with null and keeps every other element as stored", () => {
    const raw = { operation: OP, fields: posted() };
    const out = blankWithheld(KIND, raw) as { operation: string; fields: [string, unknown][] };
    expect(out).not.toBeNull();
    expect(out.operation).toBe(OP);
    expect(out.fields.map(([n]) => n)).toEqual(posted().map(([n]) => n));
    for (const [i, [n, v]] of out.fields.entries()) {
      if (WITHHELD.includes(n)) expect(v, n).toBeNull();
      else expect(v, n).toBe(posted()[i][1]);
    }
  });

  it("never changes the payload it is given", () => {
    const raw = { operation: OP, fields: posted() };
    const copy = structuredClone(raw);
    blankWithheld(KIND, raw);
    expect(raw).toEqual(copy);
  });

  it("keeps duplicates, order and unknown keys", () => {
    const raw = { operation: OP, extra: { kept: 1 }, fields: [["address", "a"], ["capacity", "Director"], ["address", "b"], ["unknown", "u"]] };
    expect(blankWithheld(KIND, raw)).toEqual({ operation: OP, extra: { kept: 1 }, fields: [["address", null], ["capacity", "Director"], ["address", null], ["unknown", "u"]] });
    expect(Object.keys(blankWithheld(KIND, raw) as object)).toEqual(["operation", "extra", "fields"]);
  });

  it("blanks a single listed field", () => {
    expect(blankWithheld(KIND, { operation: OP, fields: [["id", "r"], ["icNumber", "900101145678"]] })).toEqual({ operation: OP, fields: [["id", "r"], ["icNumber", null]] });
  });

  it("returns null when nothing would change", () => {
    const fields = posted();
    expect(blankWithheld("BASELINE_CORRECTION", { operation: OP, fields }), "another kind").toBeNull();
    expect(blankWithheld(KIND, { operation: "awards-records.recordTerms", fields }), "another operation").toBeNull();
    expect(blankWithheld(KIND, { operation: OP, fields: [["id", "r"], ["capacity", "Director"]] }), "no listed field").toBeNull();
    expect(blankWithheld(KIND, { operation: OP, fields: [] }), "no field").toBeNull();
    const once = blankWithheld(KIND, { operation: OP, fields });
    expect(blankWithheld(KIND, once), "already blank").toBeNull();
  });

  it("never touches a file value or a shape it does not understand", () => {
    const file = { file: { name: "ic.png", type: "image/png", size: 3, base64: "AAAA" } };
    const raw = { operation: OP, fields: [["icNumber", file], ["address", 3], ["witnessName"], ["occupation", "x", "y"], "signatoryName"] };
    expect(blankWithheld(KIND, raw)).toBeNull();
    expect(blankWithheld(KIND, { operation: OP, fields: [["icNumber", file], ["address", "x"]] })).toEqual({ operation: OP, fields: [["icNumber", file], ["address", null]] });
  });

  it("returns null for a payload that is not an editor and a list of fields", () => {
    for (const raw of [null, undefined, "x", 3, [], { operation: OP }, { fields: [] }, { operation: 1, fields: [] }, { operation: OP, fields: "x" }]) expect(blankWithheld(KIND, raw)).toBeNull();
  });
});

describe("every field the return form stores is classified", () => {
  /// The body of `recordReturn`, up to the next exported function.
  const body = (() => {
    const text = readFileSync(join(process.cwd(), "src/app/awards/actions.ts"), "utf8");
    const start = text.indexOf("export async function recordReturn(");
    expect(start).toBeGreaterThan(-1);
    const end = text.indexOf("\nexport ", start + 1);
    return text.slice(start, end < 0 ? undefined : end);
  })();

  /// The names the form reads: `r.<reader>("name"`, `triState(r, "name"`, `data.get("name"`, and every local alias of a reader (`const d = (n: string, ...) => r.date(n, ...)`).
  const read = (() => {
    const aliases = [...body.matchAll(/const (\w+) = \(\w+: string[^)]*\)\s*=>\s*(?:r\.(?!reject\b)\w+|triState)\(/g)].map((m) => m[1]);
    const patterns = [/\br\.(?!reject\b)\w+\(\s*"([^"]+)"/g, /\btriState\(\s*r\s*,\s*"([^"]+)"/g, /\bdata\.get(?:All)?\(\s*"([^"]+)"/g, ...aliases.map((a) => new RegExp(`\\b${a}\\(\\s*"([^"]+)"`, "g"))];
    return { aliases, names: new Set(patterns.flatMap((p) => [...body.matchAll(p)].map((m) => m[1]))) };
  })();

  it("finds the readers' aliases, so the scan reads every field", () => {
    expect(read.aliases.length).toBeGreaterThanOrEqual(2);
  });

  it("puts each stored name in exactly one list, and lists nothing the form does not post", () => {
    // `reason` is the change's own column, not a stored field, and a name `isStoredField` rejects is never stored (as `stagedFields`).
    const stored = [...read.names].filter((n) => n !== "reason" && isStoredField(n));
    for (const n of stored) expect(Number(WITHHELD.includes(n)) + Number(KEPT.includes(n)), n).toBe(1);
    expect(new Set(stored)).toEqual(new Set([...WITHHELD, ...KEPT]));
  });
});
