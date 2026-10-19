import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EMPLOYER_SIGNING_NOT_SET, employerSigning, employerSigningRefusal, officesWords } from "./employer-signing";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * NFR-SIG-001 and the product owner's ruling of 2026-10-07: which office signs a reconciliation amendment for the employer is the customer's configuration, nullable and
 * unset by default. Unset, the signature is still recorded with the offices its signer held on the day, and the screen says "Employer's signing office not set". The
 * product never invents a code.
 */

const head = { code: "HEAD", name: "Head of Department" };
const legal = { code: "LEGAL", name: "Legal Adviser" };

describe("the capacity an employer's amendment is signed in", () => {
  it("unset: records the one office the signer held, and never invents one", () => {
    expect(employerSigning({ configuredCode: null, held: [head] })).toEqual({ state: "NOT_SET", roleCode: "HEAD", held: [head] });
    expect(employerSigning({ configuredCode: "  ", held: [head] })).toMatchObject({ state: "NOT_SET" });
  });
  it("unset: a signer who held several offices, or none, records no single code, and the offices are named in full", () => {
    expect(employerSigning({ configuredCode: null, held: [head, legal] })).toEqual({ state: "NOT_SET", roleCode: null, held: [head, legal] });
    expect(employerSigning({ configuredCode: null, held: [] })).toEqual({ state: "NOT_SET", roleCode: null, held: [] });
  });
  it("the same office held at two scopes is one office", () => {
    expect(employerSigning({ configuredCode: null, held: [head, { ...head }] })).toEqual({ state: "NOT_SET", roleCode: "HEAD", held: [head] });
  });
  it("set and held: recorded as the configured office, even where the signer held others", () => {
    expect(employerSigning({ configuredCode: "LEGAL", held: [head, legal] })).toEqual({ state: "HELD", roleCode: "LEGAL", held: [head, legal] });
  });
  it("set and not held: refused (an open item for the product owner), naming the office and what the signer held", () => {
    const r = employerSigning({ configuredCode: "LEGAL", held: [head] });
    expect(r).toEqual({ state: "NOT_HELD", configured: "LEGAL", held: [head] });
    const notHeld = r as Extract<typeof r, { state: "NOT_HELD" }>;
    const words = employerSigningRefusal(notHeld, "Legal Adviser", "Aminah");
    expect(words.en).toMatch(/Aminah did not hold Legal Adviser/);
    expect(words.en).toMatch(/Head of Department/);
    expect(words.en).not.toMatch(/LEGAL|HEAD/);
    // No longer a configured office: said in words, never the code.
    expect(employerSigningRefusal(notHeld, null, "Aminah").en).not.toMatch(/LEGAL/);
  });
  it("names the offices in words, and says so where there is none", () => {
    expect(officesWords([head, legal])).toBe("Head of Department; Legal Adviser");
    expect(officesWords([])).toBe("no office on record that day");
    expect(EMPLOYER_SIGNING_NOT_SET).toBe("Employer's signing office not set");
  });
});

describe("the act records it (source scan)", () => {
  const root = process.cwd();
  const src = readFileSync(path.join(root, "src", "app", "projects", "[id]", "actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function addAmendment("), src.indexOf("// ------------------------------------------------------------------ the checks"));
  it("reads the offices of the person signing for the employer (the subject), never the officer keying a paper record", () => {
    expect(body).toMatch(/officesHeldBy\(roster, officer\.id, officerSignedOn\)/);
    expect(body).not.toMatch(/actor\.offices/);
  });
  it("refuses before it writes, and passes the capacity to the attribution", () => {
    expect(body.indexOf("employerSigningRefusal(")).toBeGreaterThan(-1);
    expect(body.indexOf("employerSigningRefusal(")).toBeLessThan(body.indexOf("reconciliationAmendment.create("));
    expect(body).toMatch(/act\.write\(c\.tx, row\.id, \{ document: [^\n]*roleCode: capacity\.roleCode/);
  });
  it("says in the trail that the office is not set, where it is not", () => {
    expect(body).toContain("EMPLOYER_SIGNING_NOT_SET");
  });
  it("the setting is a nullable column with no default, an unset one refuses nothing, and the editor offers only the organisation's offices", () => {
    const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
    expect(schema).toMatch(/\n\s+employerSigningRoleCode\s+String\?\n/);
    const actions = readFileSync(path.join(root, "src", "app", "configuration", "contracts", "core.ts"), "utf8");
    expect(actions).toMatch(/authorityRole\.findFirst\(\{ where: \{ organisationId: o\.id, code: v\.employerSigningRoleCode, isCommittee: false \}/);
    // Preparation does not start on it: the start's faults do not read it.
    expect(readFileSync(path.join(root, "src", "lib", "contract", "preparation.ts"), "utf8")).not.toMatch(/employerSigning/);
  });
});
