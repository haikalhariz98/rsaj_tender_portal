import { describe, expect, it } from "vitest";

import { GIRO_SHA } from "@/lib/portal/registration/fixture";

import { body, FILES } from "./fixture";
import { heldDeclarations, heldDraft } from "./held-draft";

describe("the body read as the wizard's draft (plan 2.2)", () => {
  it("keys each document by the browser's row key and counts its files from what was sent", () => {
    const d = heldDraft(body(), new Map([["new:reg", 2]]), 1);
    expect(d.documents.map((x) => [x.id, x.typeId, x.fileCount, x.valueIds])).toEqual([["new:reg", "t-reg", 2, []], ["new:works", "t-works", 0, ["v-g1", "v-b"]]]);
    expect(d.statementCount).toBe(1);
  });

  it("reads blank expiry and rate as none", () => {
    const b = body({ documents: [{ ...body().documents[0]!, expiresOn: " ", ratePercent: "" }] });
    expect(heldDraft(b, FILES, 1).documents[0]).toMatchObject({ expiresOn: null, ratePercent: null });
  });

  it("takes the signatory from step 4 and the GIRO tick with the hash of the wording it was made on", () => {
    const d = heldDraft(body(), FILES, 1);
    expect(d).toMatchObject({ signatoryName: "Aminah Binti Ali", signatoryDesignation: "Director", giroConfirmed: true, giroTextSha256: GIRO_SHA });
    const unticked = heldDraft(body({ agreements: body().agreements.map((a) => (a.kind === "GIRO_AUTHORISATION" ? { ...a, confirmed: false } : a)) }), FILES, 1);
    expect(unticked).toMatchObject({ giroConfirmed: false, giroTextSha256: null });
    expect(heldDraft(body({ agreements: [] }), FILES, 1)).toMatchObject({ giroConfirmed: false, giroTextSha256: null });
  });

  it("records each agreement under the signatory of step 4, with the wording it names and its tick", () => {
    const ds = heldDeclarations(body({ signatory: { name: "Someone", designation: "Manager" } }));
    expect(ds.map((d) => [d.kind, d.signatoryName, d.signatoryDesignation, d.confirmed])).toEqual([
      ["GIRO_AUTHORISATION", "Someone", "Manager", true],
      ["FALSE_DECLARATION", "Someone", "Manager", true],
      ["TERMS_AND_CONDITIONS", "Someone", "Manager", true],
    ]);
  });
});
