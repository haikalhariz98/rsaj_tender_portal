import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { templateFieldRefusals } from "@/lib/tender-docs/fields";

import { WINDOW_FIELD_KEYS } from "./fields";

/**
 * 6.5: a template's save accepts the window's merge fields (the notice, a letter of invitation, an
 * addendum fill them), and still refuses a field nobody fills. The save's rule is 6.4's
 * `templateFieldRefusals`, asked with the award's fields and the window's.
 */

const awardHas = (k: string) => k === "award.reference";
const has = (k: string) => awardHas(k) || WINDOW_FIELD_KEYS.has(k);

describe("saving a template", () => {
  it("accepts the window's fields and refuses an unknown one", () => {
    expect(templateFieldRefusals(["window.closing", "invitee.name", "addendum.number", "award.reference"], has, [])).toEqual([]);
    expect(templateFieldRefusals(["window.nonsense"], has, [])).toEqual(["window.nonsense"]);
  });
  it("the configuration action asks with the window's fields", () => {
    const src = readFileSync(join(process.cwd(), "src/app/configuration/templates/actions.ts"), "utf8");
    expect(src).toMatch(/templateFieldRefusals\(fieldsNamed\(v\[k\]\), \(f\) => !awardUnknown\.has\(f\) \|\| WINDOW_FIELD_KEYS\.has\(f\), clauseCodes\)/);
  });
});
