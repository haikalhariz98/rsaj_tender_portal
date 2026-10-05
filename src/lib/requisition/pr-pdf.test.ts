import { decodePDFRawStream, PDFArray, PDFDocument, type PDFRawStream, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildPrPdf, printable, wrap } from "./pr-pdf";
import { PR_FOOTER_RULE, prDataOf, prFileName, prRefusal, type PrContext, type PrSource } from "./pr-pdf-data";

/// The text drawn on the pages, read back from the content streams: each Tj is a hex string of WinAnsi codes.
async function textOf(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      const raw = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
      for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(m[1], "hex").toString("latin1"));
    }
  }
  return out;
}

const d = (s: string) => ({ toString: () => s });
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const source: PrSource = {
  reference: "REQ/2026/0007",
  title: "Replacement laptops",
  justification: "The current fleet is out of warranty.",
  needStatement: "Twelve staff need a working machine.",
  placeOfDelivery: "Head office store",
  raisedOn: day("2026-09-01"),
  estimatedValue: d("24252.50"),
  erpRequisitionNo: null,
  erpNoteNo: null,
  requestingPerson: { name: "Aminah binti Ali" },
  lines: [
    { lineNo: 1, description: "Laptop 14 inch", quantity: d("5.0000"), unit: "unit", estimatedUnitPrice: d("4500.50"), estimatedAmount: d("22502.50") },
    { lineNo: 2, description: "Docking station", quantity: d("5.0000"), unit: "unit", estimatedUnitPrice: d("350.00"), estimatedAmount: d("1750.00") },
  ],
  endorsements: [{ tier: "DEPARTMENT", person: { name: "Faridah Ismail" }, endorsedOn: day("2026-09-02"), note: "" }],
  budgetChecks: [{ asAt: day("2026-09-03"), actualBudget: d("500000.00"), balanceAsAt: d("120000.00"), approvedAccount: null, projectedBalance: d("95747.50") }],
  approvalInstances: [
    {
      status: "APPROVED",
      checkedAgainstMatrix: true,
      steps: [
        { sequence: 1, roleLabel: "Head of Finance", act: "R", decision: "DONE", decidedByName: "Zul Kifli", decidedOn: day("2026-09-05"), recordedAt: new Date("2026-09-05T02:30:00Z"), reason: "Within budget", carriedFromStepId: null, delegation: null, committee: null },
        { sequence: 2, roleLabel: "Tender Committee", act: "A", decision: "DONE", decidedByName: null, decidedOn: day("2026-09-08"), recordedAt: null, reason: "", carriedFromStepId: null, delegation: null, committee: { committee: "Tender Committee", meetingReference: "MTG-2026-014", outcome: "CARRIED", date: day("2026-09-08"), notApprovedName: null } },
      ],
    },
  ],
};
const ctx: PrContext = {
  organisationName: "Example Body",
  logo: null,
  timeZone: "Asia/Kuala_Lumpur",
  purchaseType: null,
  costCentre: { code: "CC100", label: "CC100 · Operations" },
  account: { code: "5100", label: "5100 · IT equipment" },
  generatedAt: new Date("2026-10-05T01:00:00Z"),
};

describe("prDataOf", () => {
  const data = prDataOf(source, ctx);

  it("writes money as xx,xxx.xx and the total from the lines, nothing computed on the budget row", () => {
    expect(data.purpose.estimatedCost).toBe("24,252.50");
    expect(data.items.rows.at(-1)!.cells).toEqual(["", "", "", "TOTAL", "", "", "", "24,252.50"]);
    expect(data.items.rows[0].cells).toEqual(["1", "CC100", "5100", "Laptop 14 inch", "4,500.50", "5", "unit", "22,502.50"]);
    expect(data.budget.row).toEqual(["CC100 · Operations", "5100 · IT equipment", "500,000.00", "120,000.00", "Not recorded", "95,747.50"]);
    expect(data.budget.headers[3]).toBe("Balance as at 03 Sep 2026 (RM)");
  });

  it("says Not set for a missing purchase type and Not yet chosen for the supplier", () => {
    expect(data.purchaseType).toBe("Not set");
    expect(data.purpose.supplier).toBe("Not yet chosen");
    expect(prDataOf(source, { ...ctx, purchaseType: "Works" }).purchaseType).toBe("Works");
  });

  it("writes Not recorded for every budget figure when no check was made", () => {
    const none = prDataOf({ ...source, budgetChecks: [] }, ctx);
    expect(none.budget.row.slice(2)).toEqual(["Not recorded", "Not recorded", "Not recorded", "Not recorded"]);
  });

  it("lists registration, each endorsement, then each step with who, when and why, committee steps with the sitting", () => {
    expect(data.approvals.rows).toEqual([
      ["1", "Registration", "Raised", "01 Sep 2026", "Aminah binti Ali", ""],
      ["2", "Head of Department endorsement", "Endorsed", "02 Sep 2026", "Faridah Ismail", "Recorded on behalf of, not signed"],
      ["3", "Head of Finance · Recommend", "Recommended", "05 Sep 2026 · 10:30", "Zul Kifli", "Within budget"],
      ["4", "Tender Committee · Approve", "Approved", "08 Sep 2026", "Tender Committee", "Carried by the Tender Committee at MTG-2026-014 on 08 Sep 2026"],
    ]);
  });

  it("shows the finance system's numbers only where the requisition still has them", () => {
    expect(data.financeNumbers).toEqual([]);
    expect(prDataOf({ ...source, erpRequisitionNo: "PR-77" }, ctx).financeNumbers).toEqual([["Finance system requisition no.", "PR-77"]]);
  });

  it("prints the product's own rule and a generated stamp on the organisation's clock", () => {
    expect(data.footerRule).toBe(PR_FOOTER_RULE);
    expect(data.generated).toBe("Generated 05 Oct 2026 · 09:00 · Generated by the procurement portal");
    expect(prDataOf(source, { ...ctx, timeZone: null }).generated).toContain("time zone not set");
  });
});

describe("prRefusal", () => {
  it("offers the form from approved onward, and after a closed approved one, never before", () => {
    for (const s of ["APPROVED", "SOURCING", "PARTIALLY_FULFILLED", "FULFILLED"] as const) expect(prRefusal(s, true)).toBeNull();
    expect(prRefusal("CLOSED", true)).toBeNull();
    for (const s of ["DRAFT", "ENDORSED", "REGISTERED", "BUDGET_CHECKED", "OVER_BUDGET", "PENDING_APPROVAL", "REJECTED", "RECALLED", "CANCELLED", "RETURNED"] as const) {
      expect(prRefusal(s, false)).toMatch(/not been approved/);
    }
    expect(prRefusal("CLOSED", false)).toMatch(/not been approved/);
  });
  it("names the file after the reference, slashes replaced", () => {
    expect(prFileName("REQ/2026/0007")).toBe("REQ-2026-0007.pdf");
  });
});

describe("buildPrPdf", () => {
  it("makes a valid A4 PDF holding the reference, the total, each approver and the footer", async () => {
    const bytes = await buildPrPdf(prDataOf(source, ctx));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    const text = (await textOf(bytes)).join("\n");
    for (const want of ["EXPENDITURE REQUEST FORM", "REQ/2026/0007", "24,252.50", "Aminah binti Ali", "Faridah Ismail", "Zul Kifli", "MTG-2026-014", "SULIT", "PURCHASE TYPE:", "Not set", "Not yet chosen", "TOTAL", "Not recorded", "Example Body", "Page 1 of 1"]) {
      expect(text, want).toContain(want);
    }
    expect(text).toContain("No purchase order, indent, letter of acceptance or contract may be issued before this requisition is approved.");
    expect(text).toContain("Generated by the procurement portal");
  });

  it("flows long tables onto further pages with the header repeated, and numbers every page", async () => {
    const lines = Array.from({ length: 90 }, (_, i) => ({ lineNo: i + 1, description: `Item number ${i + 1} with a description long enough to wrap inside its cell once or twice over`, quantity: d("1.0000"), unit: "ea", estimatedUnitPrice: d("10.00"), estimatedAmount: d("10.00") }));
    const bytes = await buildPrPdf(prDataOf({ ...source, lines }, ctx));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    const text = await textOf(bytes);
    expect(text.filter((t) => t === "Description").length).toBeGreaterThanOrEqual(doc.getPageCount() - 1);
    expect(text).toContain(`Page ${doc.getPageCount()} of ${doc.getPageCount()}`);
    expect(text.some((t) => t.startsWith("Item number 90 with a"))).toBe(true);
    expect(text).toContain("900.00");
  });

  it("does not throw on characters Helvetica cannot encode", async () => {
    const odd = prDataOf({ ...source, title: "Ringgit − “quoted” · 5 × 3 – ok 日本 ✓" }, ctx);
    const text = (await textOf(await buildPrPdf(odd))).join("\n");
    expect(text).toContain("Ringgit - ");
    expect(text).toContain("5 × 3 – ok".replace("–", "\u0096"));
  });
});

describe("printable and wrap", () => {
  it("keeps the characters the form uses, replaces the minus sign, and marks what it cannot draw", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(printable(font, "a · b – c × d é")).toBe("a · b – c × d é");
    expect(printable(font, "−5")).toBe("-5");
    expect(printable(font, "日")).toBe("?");
    expect(printable(font, "tab\there")).toBe("tab here");
  });
  it("wraps on words and breaks a word longer than the line", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrap(font, 10, 60, "alpha beta gamma delta").length).toBeGreaterThan(1);
    const long = wrap(font, 10, 40, "Supercalifragilisticexpialidocious");
    expect(long.length).toBeGreaterThan(1);
    expect(long.join("")).toBe("Supercalifragilisticexpialidocious");
    expect(wrap(font, 10, 100, "one\ntwo")).toEqual(["one", "two"]);
  });
});
