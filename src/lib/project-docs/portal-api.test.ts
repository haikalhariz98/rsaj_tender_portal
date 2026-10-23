import { describe, expect, it } from "vitest";

import { parseCreateBody, parseRequestBody, parseUploadForm, parseUploadQuery, parseVersionBody } from "./portal-api";

const CON = "contract_0001";
const DOC = "document_0001";
const V1 = "version_00001";

describe("create", () => {
  it("a first version: the staged ids and its note", () => {
    const r = parseCreateBody({ contractId: CON, title: "Drainage layout", note: "For review.", mode: "upload", versionIds: [V1], versionNote: "First issue." });
    expect(r).toEqual({ ok: true, value: { body: { contractId: CON, title: "Drainage layout", note: "For review.", first: { upload: { stagedVersionIds: [V1], note: "First issue." } }, kind: null }, password: null } });
  });

  it("a first request: its note", () => {
    const r = parseCreateBody({ contractId: CON, title: "Insurance", mode: "request", requestNote: "Please send the policy." });
    expect(r).toEqual({ ok: true, value: { body: { contractId: CON, title: "Insurance", note: "", first: { request: { note: "Please send the policy." } }, kind: null }, password: null } });
  });

  // Rewritten for plan step 6 (PW-23: the kind picker lands in step 6, and step 5's refusal of a posted kind closes with it). Each guarantee of the old test that still
  // applies keeps a test: a kind is never ignored (it is read, or refused below on the routes that take none, `a request` and `the staging upload`), and a bad one is refused.
  it("a kind is taken with a first version (plan step 6): one of the six, set on the body; none, null or empty is an ordinary document", () => {
    const r = parseCreateBody({ contractId: CON, title: "Delay at the culvert", mode: "upload", versionIds: [V1], kind: "DELAY_NOTICE" });
    expect(r).toMatchObject({ ok: true, value: { body: { kind: "DELAY_NOTICE", first: { upload: { stagedVersionIds: [V1] } } }, password: null } });
    for (const kind of [null, ""]) expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], kind }), String(kind)).toMatchObject({ ok: true, value: { body: { kind: null } } });
  });

  it("a kind that is not one of the six is a field error; a kind with a request is a field error (a kind is picked with a file sent)", () => {
    for (const kind of ["PAY_ME", "interim_claim", 4, ["DELAY_NOTICE"]]) {
      expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], kind }), JSON.stringify(kind)).toMatchObject({ ok: false, status: 400, errors: { kind: expect.any(String) } });
    }
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "request", kind: "WORK_PROGRAMME" })).toMatchObject({ ok: false, status: 400, errors: { kind: expect.any(String) } });
  });

  it("a statutory declaration carries its password to the route alone; no other kind takes one, so nobody spends a step-up for nothing (PW-10)", () => {
    const signed = parseCreateBody({ contractId: CON, title: "Declaration lodged", mode: "upload", versionIds: [V1], kind: "STATUTORY_DECLARATION", password: "pw" });
    expect(signed).toMatchObject({ ok: true, value: { body: { kind: "STATUTORY_DECLARATION" }, password: "pw" } });
    if (signed.ok) expect(JSON.stringify(signed.value.body)).not.toContain("pw");
    // Without one, it parses: the store refuses an unsigned declaration in words (DECLARATION_NOT_SIGNED), and the route asks nothing of a password not given.
    expect(parseCreateBody({ contractId: CON, title: "Declaration lodged", mode: "upload", versionIds: [V1], kind: "STATUTORY_DECLARATION" })).toMatchObject({ ok: true, value: { password: null } });
    for (const kind of [undefined, "INTERIM_CLAIM"]) {
      expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], kind, password: "pw" }), String(kind)).toMatchObject({ ok: false, status: 400, errors: { password: expect.any(String) } });
    }
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], kind: "STATUTORY_DECLARATION", password: { p: 1 } })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], kind: "STATUTORY_DECLARATION", password: "x".repeat(513) })).toMatchObject({ ok: false, errors: { password: expect.any(String) } });
  });

  it("an unknown field is refused, named, 400", () => {
    const r = parseCreateBody({ contractId: CON, title: "x", mode: "request", approverPersonIds: ["p"], supplierId: "s" });
    expect(r).toMatchObject({ ok: false, status: 400, code: "VALIDATION", errors: { approverPersonIds: expect.any(String), supplierId: expect.any(String) } });
  });

  it("a bad contract, mode, file list or note is a field error each", () => {
    const r = parseCreateBody({ contractId: "no", title: 4, mode: "both", versionIds: ["no"], versionNote: {} });
    expect(r).toMatchObject({ ok: false, status: 400 });
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["contractId", "mode", "title", "versionIds", "versionNote"]);
  });

  it("files do not go with a request, nor a request note with a file", () => {
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "request", versionIds: [V1] })).toMatchObject({ ok: false, errors: { versionIds: expect.any(String) } });
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: [V1], requestNote: "n" })).toMatchObject({ ok: false, errors: { requestNote: expect.any(String) } });
  });

  it("a list far past the files a version may hold is refused, not read", () => {
    expect(parseCreateBody({ contractId: CON, title: "x", mode: "upload", versionIds: Array.from({ length: 41 }, (_, i) => `version_${String(i).padStart(5, "0")}`) })).toMatchObject({ ok: false, errors: { versionIds: expect.any(String) } });
  });
});

describe("a new version", () => {
  it("parses, and leaves the exact bounds to the rules", () => {
    expect(parseVersionBody({ contractId: CON, documentId: DOC, versionIds: [V1], note: "Levels corrected." })).toEqual({ ok: true, value: { body: { contractId: CON, documentId: DOC, stagedVersionIds: [V1], note: "Levels corrected.", kind: null }, password: null } });
    expect(parseVersionBody({ contractId: CON, documentId: DOC })).toMatchObject({ ok: true, value: { body: { stagedVersionIds: [], note: "" } } });
  });

  // Rewritten for plan step 6 (PW-23): the first version of a document the organisation asked for takes a kind; a later one is refused by the store (KIND_ALREADY_SET).
  it("a kind is read, a bad one is a field error; a password is taken when posted (the route cannot know the kind first); an unknown field 400, a missing document 400", () => {
    expect(parseVersionBody({ contractId: CON, documentId: DOC, kind: "DELAY_NOTICE" })).toMatchObject({ ok: true, value: { body: { kind: "DELAY_NOTICE" } } });
    expect(parseVersionBody({ contractId: CON, documentId: DOC, kind: "NOPE" })).toMatchObject({ ok: false, status: 400, errors: { kind: expect.any(String) } });
    expect(parseVersionBody({ contractId: CON, documentId: DOC, password: "pw" })).toMatchObject({ ok: true, value: { password: "pw" } });
    expect(parseVersionBody({ contractId: CON, documentId: DOC, password: 7 })).toMatchObject({ ok: false, status: 400, errors: { password: expect.any(String) } });
    expect(parseVersionBody({ contractId: CON, documentId: DOC, requestId: "r" })).toMatchObject({ ok: false, status: 400, errors: { requestId: expect.any(String) } });
    expect(parseVersionBody({ contractId: CON })).toMatchObject({ ok: false, status: 400, errors: { documentId: expect.any(String) } });
  });
});

describe("a request", () => {
  it("parses; a kind is 422; an unknown field is 400", () => {
    expect(parseRequestBody({ contractId: CON, documentId: DOC, note: "Please send it again." })).toEqual({ ok: true, value: { contractId: CON, documentId: DOC, note: "Please send it again." } });
    expect(parseRequestBody({ contractId: CON, documentId: DOC, kind: "x" })).toMatchObject({ ok: false, status: 422 });
    expect(parseRequestBody({ contractId: CON, documentId: DOC, toSide: "ORGANISATION" })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("the staging upload", () => {
  it("the query names the contract and nothing else; a kind is 422", () => {
    expect(parseUploadQuery(new URLSearchParams({ contractId: CON }))).toEqual({ ok: true, value: { contractId: CON } });
    expect(parseUploadQuery(new URLSearchParams({ contractId: CON, kind: "INTERIM_CLAIM" }))).toMatchObject({ ok: false, status: 422, code: "KIND_NOT_AVAILABLE" });
    expect(parseUploadQuery(new URLSearchParams({ contractId: CON, supplierId: "x" }))).toMatchObject({ ok: false, status: 400 });
    expect(parseUploadQuery(new URLSearchParams())).toMatchObject({ ok: false, status: 400, errors: { contractId: expect.any(String) } });
  });

  const file = new File([new Uint8Array([1, 2, 3])], "a.pdf", { type: "application/pdf" });

  it("the form is one file, and a contract only if it agrees with the query", () => {
    expect(parseUploadForm([["file", file]], CON)).toMatchObject({ ok: true });
    expect(parseUploadForm([["file", file], ["contractId", CON]], CON)).toMatchObject({ ok: true });
    expect(parseUploadForm([["file", file], ["contractId", "contract_0002"]], CON)).toMatchObject({ ok: false, status: 400, errors: { contractId: expect.any(String) } });
  });

  it("a kind in the form is 422; any other field, no file, two files and text for a file are 400", () => {
    expect(parseUploadForm([["file", file], ["kind", "INTERIM_CLAIM"]], CON)).toMatchObject({ ok: false, status: 422 });
    expect(parseUploadForm([["file", file], ["title", "x"]], CON)).toMatchObject({ ok: false, status: 400, errors: { title: expect.any(String) } });
    expect(parseUploadForm([], CON)).toMatchObject({ ok: false, status: 400, errors: { file: expect.any(String) } });
    expect(parseUploadForm([["file", file], ["file", file]], CON)).toMatchObject({ ok: false, status: 400, errors: { file: expect.any(String) } });
    expect(parseUploadForm([["file", "not a file"]], CON)).toMatchObject({ ok: false, status: 400 });
  });
});
