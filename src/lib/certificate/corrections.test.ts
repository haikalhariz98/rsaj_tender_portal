import { describe, expect, it } from "vitest";

import { applyCorrections, correctionFaults, CORRECTION_MAX, type CorrectionIn } from "./corrections";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

/**
 * FR-CRT-010 fixture: the typing errors the spec lists for the printed forms (FORMS §B7 item 8). Test data only:
 * the product ships no correction; which ones a customer applies is its document-control decision (§13.10).
 */
const SPEC_TYPOS = [
  { fromText: "CERTICATE", toText: "CERTIFICATE" },
  { fromText: "PARTICAL", toText: "PARTIAL" },
  { fromText: "ADJUSMENT", toText: "ADJUSTMENT" },
  { fromText: "BORAD", toText: "BOARD" },
  { fromText: "behlaf", toText: "behalf" },
  { fromText: "statisfactorily", toText: "satisfactorily" },
  { fromText: "keada", toText: "kepada" },
  { fromText: "gendaklah", toText: "hendaklah" },
  { fromText: "berkenanan", toText: "berkenaan" },
  { fromText: "pernerimaan", toText: "penerimaan" },
  { fromText: "penyelerasan", toText: "penyelarasan" },
];

describe("text corrections (FR-CRT-010)", () => {
  it('worked example: "INTERIM CERTICATE" reads "INTERIM CERTIFICATE"; the form code and revision are not the text and stay as printed', () => {
    const r = applyCorrections("INTERIM CERTICATE OF PAYMENT\n\nForm DEMO-01, revision 1 September 2026.", SPEC_TYPOS);
    expect(r.text).toBe("INTERIM CERTIFICATE OF PAYMENT\n\nForm DEMO-01, revision 1 September 2026.");
    expect(r.applied).toEqual([{ fromText: "CERTICATE", toText: "CERTIFICATE", count: 1 }]);
  });

  it("an empty list leaves the text as written, every character", () => {
    const body = "Saya CERTICATE {{contract.number}} keada";
    expect(applyCorrections(body, [])).toEqual({ text: body, applied: [] });
  });

  it("every listed typo in English and Malay is corrected, and counted", () => {
    const r = applyCorrections("CERTICATE PARTICAL ADJUSMENT BORAD behlaf statisfactorily keada gendaklah berkenanan pernerimaan penyelerasan CERTICATE", SPEC_TYPOS);
    expect(r.text).toBe("CERTIFICATE PARTIAL ADJUSTMENT BOARD behalf satisfactorily kepada hendaklah berkenaan penerimaan penyelarasan CERTIFICATE");
    expect(r.applied.find((a) => a.fromText === "CERTICATE")?.count).toBe(2);
    expect(r.applied).toHaveLength(11);
  });

  it("never touches a merge field, so the value it is filled with prints as recorded", () => {
    const r = applyCorrections("{{CERTICATE}} CERTICATE {{contract.title}}", SPEC_TYPOS);
    expect(r.text).toBe("{{CERTICATE}} CERTIFICATE {{contract.title}}");
  });

  it("is exact, letter case included", () => {
    expect(applyCorrections("Certicate", SPEC_TYPOS).text).toBe("Certicate");
  });

  it("does not cascade: what one correction writes is never corrected again, whatever the order entered", () => {
    const list = [
      { fromText: "AB", toText: "BC" },
      { fromText: "BC", toText: "XX" },
    ];
    expect(applyCorrections("AB BC", list).text).toBe("BC XX");
    expect(applyCorrections("AB BC", [...list].reverse()).text).toBe("BC XX");
  });

  it("where two match at one place the longer wins, whatever the order entered", () => {
    const list = [
      { fromText: "Detect", toText: "Defect" },
      { fromText: "Detects Liability", toText: "Defects Liability" },
    ];
    expect(applyCorrections("Detects Liability and a Detect", list).text).toBe("Defects Liability and a Defect");
    expect(applyCorrections("Detects Liability and a Detect", [...list].reverse()).text).toBe("Defects Liability and a Defect");
  });

  it("property: with every correction applied the result is the same for any order of the list", () => {
    const body = "CERTICATE keada berkenanan {{x}} PARTICAL ADJUSMENT ADJUSMENT";
    const base = applyCorrections(body, SPEC_TYPOS).text;
    let seed = 7;
    for (let i = 0; i < 50; i++) {
      const shuffled = [...SPEC_TYPOS].sort(() => ((seed = (seed * 1103515245 + 12345) % 2147483648) % 3) - 1);
      expect(applyCorrections(body, shuffled).text).toBe(base);
    }
  });
});

describe("saving a correction", () => {
  const ok: CorrectionIn = { fromText: "CERTICATE", toText: "CERTIFICATE", templateIds: ["t1"] };
  it("a well-formed correction is accepted", () => expect(correctionFaults(ok, [])).toEqual([]));
  it("names the forms it applies to: never every form by default", () => expect(codes(correctionFaults({ ...ok, templateIds: [] }, []))).toEqual(["CORRECTION_FORMS_REQUIRED"]));
  it("refuses empty, unchanged, padded, braced or overlong words", () => {
    expect(codes(correctionFaults({ ...ok, fromText: "" }, []))).toEqual(["CORRECTION_FROM_REQUIRED"]);
    expect(codes(correctionFaults({ ...ok, toText: " " }, []))).toEqual(["CORRECTION_TO_REQUIRED", "CORRECTION_SPACES"]);
    expect(codes(correctionFaults({ ...ok, toText: "CERTICATE" }, []))).toEqual(["CORRECTION_SAME"]);
    expect(codes(correctionFaults({ ...ok, fromText: " CERTICATE" }, []))).toEqual(["CORRECTION_SPACES"]);
    expect(codes(correctionFaults({ ...ok, toText: "{{contract.number}}" }, []))).toEqual(["CORRECTION_BRACES"]);
    expect(codes(correctionFaults({ ...ok, toText: "x".repeat(CORRECTION_MAX + 1) }, []))).toEqual(["CORRECTION_TOO_LONG"]);
    expect(correctionFaults({ ...ok, toText: "x".repeat(CORRECTION_MAX) }, [])).toEqual([]);
  });
  it("two corrections of the same words on one form are refused; on different forms both stand", () => {
    expect(codes(correctionFaults(ok, [{ fromText: "CERTICATE", toText: "CERTIFIKAT", templateIds: ["t1", "t2"] }]))).toEqual(["CORRECTION_TAKEN"]);
    expect(correctionFaults(ok, [{ fromText: "CERTICATE", toText: "CERTIFIKAT", templateIds: ["t2"] }])).toEqual([]);
  });
});
