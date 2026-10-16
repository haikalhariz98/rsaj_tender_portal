import { describe, expect, it } from "vitest";

import { downloadFaults } from "./grants";
import { MAX_SEALED_FILE_PASSPHRASE_CHARACTERS, parseSealedFileRequest, reasonOf, SEALED_FILE_FIELDS, SEALED_FILE_STATUS, SEALED_FILE_WORDS } from "./sealed-file";

const OK = { openingId: "op1", fileId: "f_1", password: "pw", passphrase: "a long passphrase" };

describe("parseSealedFileRequest (the one place the body is read)", () => {
  it("takes exactly the four fields", () => {
    expect(parseSealedFileRequest(OK)).toEqual({ ok: true, value: OK });
    expect([...SEALED_FILE_FIELDS].sort()).toEqual(Object.keys(OK).sort());
  });
  it.each([null, "x", 3, [], undefined])("refuses %j as a body", (b) => {
    expect(parseSealedFileRequest(b).ok).toBe(false);
  });
  it("names each field at fault and rejects unknown fields by name", () => {
    const r = parseSealedFileRequest({ ...OK, fileId: 5, password: "", extra: 1, passphrase: "x".repeat(MAX_SEALED_FILE_PASSPHRASE_CHARACTERS + 1), openingId: "a b" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fields).sort()).toEqual(["extra", "fileId", "openingId", "passphrase", "password"]);
  });
  it("accepts a passphrase of exactly the largest length", () => {
    expect(parseSealedFileRequest({ ...OK, passphrase: "x".repeat(MAX_SEALED_FILE_PASSPHRASE_CHARACTERS) }).ok).toBe(true);
  });
});

describe("answers", () => {
  it("every refusal has a status, and none is a success", () => {
    for (const s of Object.values(SEALED_FILE_STATUS)) expect(s).toBeGreaterThanOrEqual(400);
  });
  it("names an administrator whatever else is true", () => {
    const f = downloadFaults({ actorIsNamedOfficer: false, actorIsAdministrator: true, unsealed: false, finalised: false, use: "FINALISE", bidStatus: "SUBMITTED" });
    expect(reasonOf(f)).toBe("ADMINISTRATOR");
    expect(reasonOf(["NOT_UNSEALED", "NOT_OPENED"])).toBe("NOT_UNSEALED");
  });
  it("the words say no more than the refusal and quote no code", () => {
    for (const w of Object.values(SEALED_FILE_WORDS)) expect(w).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
  });
});
