import { describe, expect, it } from "vitest";

import { resolutionText, supersession, type AttachmentSince } from "./supersession";

const recorded = new Date("2026-09-08T00:00:00.000Z");
const att = (over: Omit<Partial<AttachmentSince>, "version"> & { version?: Partial<AttachmentSince["version"]> } = {}): AttachmentSince => ({
  purpose: "DOSSIER_EVIDENCE",
  attachedAt: new Date("2026-09-10T11:25:00.000Z"),
  detachedAt: null,
  ...over,
  version: { versionNo: 2, withdrawnAt: null, title: "Distributor's letter", ...over.version },
});
const missing = { code: "EVIDENCE_NOT_ATTACHED" };

describe("supersession", () => {
  it("supersedes a recorded finding that a live attachment of its purpose now satisfies", () => {
    const [j] = supersession([missing], [att()], recorded);
    expect(j.superseded?.since).toEqual([{ title: "Distributor's letter", versionNo: 2, attachedAt: new Date("2026-09-10T11:25:00.000Z") }]);
  });

  it("leaves a finding standing when nothing has been attached", () => {
    expect(supersession([missing], [], recorded)[0].superseded).toBeNull();
  });

  it("leaves it standing when the only attachment was already there when the checks were recorded", () => {
    expect(supersession([missing], [att({ attachedAt: new Date("2026-09-03T09:05:00.000Z") })], recorded)[0].superseded).toBeNull();
  });

  it("does not count a detached attachment or a withdrawn version", () => {
    expect(supersession([missing], [att({ detachedAt: new Date("2026-09-11T00:00:00.000Z") })], recorded)[0].superseded).toBeNull();
    expect(supersession([missing], [att({ version: { withdrawnAt: new Date("2026-09-11T00:00:00.000Z") } })], recorded)[0].superseded).toBeNull();
  });

  it("matches the purpose: a scope attachment does not satisfy missing dossier evidence", () => {
    expect(supersession([missing], [att({ purpose: "COORDINATION_SCOPE" })], recorded)[0].superseded).toBeNull();
    expect(supersession([{ code: "SCOPE_DOCUMENT_NOT_ATTACHED" }], [att({ purpose: "COORDINATION_SCOPE" })], recorded)[0].superseded).not.toBeNull();
  });

  it("never supersedes a finding about anything else", () => {
    expect(supersession([{ code: "DOSSIER_UNNUMBERED" }, { code: "SPLIT_SUSPECTED" }], [att()], recorded).map((j) => j.superseded)).toEqual([null, null]);
  });

  it("lists every live attachment that arrived since, oldest first", () => {
    const later = att({ attachedAt: new Date("2026-09-20T08:00:00.000Z"), version: { versionNo: 1, title: "Second letter" } });
    const [j] = supersession([missing], [later, att()], recorded);
    expect(j.superseded?.since.map((s) => s.title)).toEqual(["Distributor's letter", "Second letter"]);
  });
});

describe("resolutionText", () => {
  it("says what was not attached then and what is attached since, with the day", () => {
    const [j] = supersession([missing], [att()], recorded);
    expect(resolutionText(j.superseded!, "Asia/Kuala_Lumpur")).toBe("When the checks were recorded, supporting evidence was not attached. Since then: Distributor's letter, version 2, attached 10 Sep 2026.");
  });
});
