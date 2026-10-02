import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEAM } from "./fixture";
import { personFaults } from "./team";

/**
 * 6.8 fix R-8: a team member deactivated since being appointed is not an active person on record, so a
 * score or an assessment recorded in their name is refused (PERSON_REQUIRED), never a server error from
 * dereferencing a person who is not there.
 */

const act = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/actions.ts"), "utf8");
const body = (name: string) => act.slice(act.indexOf(`export async function ${name}(`), act.indexOf("\n}\n", act.indexOf(`export async function ${name}(`)));

describe("a deactivated member (R-8)", () => {
  it("the rule reads an inactive member as no person: PERSON_REQUIRED", () => {
    // The action resolves the member through activePerson first: a deactivated one is null here.
    expect(personFaults("IMPLEMENTING_DEPARTMENT", null, TEAM, []).map((f) => f.code)).toEqual(["PERSON_REQUIRED"]);
  });
  for (const name of ["recordScore", "assessAspect"]) {
    it(`${name} resolves the active person before the rule and never dereferences a missing one`, () => {
      const b = body(name);
      expect(b).not.toMatch(/activePerson\([^)]*\)\)!/);
      expect(b.indexOf("const person = await activePerson(tx, l.org.id, personId);")).toBeGreaterThan(0);
      expect(b.indexOf("const person = await activePerson(tx, l.org.id, personId);")).toBeLessThan(b.indexOf(name === "recordScore" ? "scoreFaults(" : "personFaults("));
      expect(b).toMatch(/person\?\.id \?\? null/);
      expect(b).toMatch(/\|\| !person\) return refuse\(/);
    });
  }
  it("no evaluation act dereferences activePerson with a bang", () => {
    for (const f of ["actions.ts", "meeting-actions.ts", "report-actions.ts"]) {
      const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation", f), "utf8");
      expect(src, f).not.toMatch(/\(await activePerson\([^)]*\)\)!/);
    }
  });
});
