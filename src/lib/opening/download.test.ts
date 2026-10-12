import { describe, expect, it } from "vitest";

import { sulitGranted, sulitWithheld } from "@/lib/auth/sulit-access";

import { DOWNLOAD_REFUSAL_TEXT, NO_CLASS_ON_REGISTER, openingCsv, openingDownloadName, type DownloadOpening } from "./download";

const opening = (over: Partial<DownloadOpening> = {}): DownloadOpening => ({
  title: "Main opening",
  finalised: true,
  finalisedAt: "12 Oct 2026, 10:00",
  header: [{ label: "Reference", value: "T-1" }],
  rows: [
    { listingNo: 1, bidderName: "Acme Sdn Bhd", registrationClass: "G5", registrationStatus: "Active", openingPrice: sulitGranted("RM 1,000.00", "ORGANISATION_PERMISSION"), period: "12 months", alternative: null },
    { listingNo: 2, bidderName: "=Evil", registrationClass: "", registrationStatus: "", openingPrice: sulitGranted("RM 900.00", "ORGANISATION_PERMISSION"), period: "6 months", alternative: "Alternative to No. 1" },
  ],
  benchmark: { sealed: false, label: "Company estimate", companyEstimate: sulitGranted("RM 950.00", "ORGANISATION_PERMISSION") },
  summary: { rows: [{ listingNo: 1, bidderName: "Acme Sdn Bhd", openingPrice: sulitGranted("RM 1,000.00", "ORGANISATION_PERMISSION"), label: "Qualified" }, { listingNo: 2, bidderName: "=Evil", openingPrice: sulitGranted("RM 900.00", "ORGANISATION_PERMISSION"), label: "Not qualified" }] },
  ...over,
});

describe("openingCsv (SR-15, ruling 24)", () => {
  it("refuses before finalising, in words", () => {
    expect(openingCsv("schedule", opening({ finalised: false }))).toEqual({ refusal: "NOT_FINALISED" });
    expect(DOWNLOAD_REFUSAL_TEXT.NOT_FINALISED).toMatch(/not finalised/);
  });
  it("titles the schedule with the print label and keeps the opening order, the estimate row last", () => {
    const r = openingCsv("schedule", opening());
    if ("refusal" in r) throw new Error("refused");
    const lines = r.csv.split("\r\n");
    expect(lines[0]).toBe('"Schedule of tenders · Main opening"');
    const body = lines.slice(lines.indexOf('"Bil.","Bidder","Class","Status","Price as read","Completion period"') + 1);
    expect(body.map((l) => l.split(",")[0])).toEqual(['"1"', '"2"', '"—"']);
    expect(body[2]).toContain("Company estimate");
    expect(body[2]).toContain("RM 950.00");
  });
  it("says there is no class on the register rather than leaving a blank, and guards a formula-looking name", () => {
    const r = openingCsv("schedule", opening());
    if ("refusal" in r) throw new Error("refused");
    expect(r.csv).toContain(NO_CLASS_ON_REGISTER);
    expect(r.csv).toContain("'=Evil (alternative to no. 1)");
  });
  it("gives a reader who may not read prices the words, never a figure, and a sealed estimate its words", () => {
    const withheld = sulitWithheld<string>("NOT_LOGGED", "exercise");
    const r = openingCsv("schedule", opening({ rows: opening().rows.map((x) => ({ ...x, openingPrice: withheld })), benchmark: { sealed: true, text: "Sealed until the schedule is finalised" } }));
    if ("refusal" in r) throw new Error("refused");
    expect(r.csv).not.toMatch(/RM \d/);
    expect(r.csv).toContain("SULIT · withheld");
    expect(r.csv).toContain("Sealed until the schedule is finalised");
  });
  it("builds the Grand Summary titled by its print label, with the class from the schedule row", () => {
    const r = openingCsv("summary", opening());
    if ("refusal" in r) throw new Error("refused");
    const lines = r.csv.split("\r\n");
    expect(lines[0]).toBe('"Grand Summary · Main opening"');
    expect(r.csv).toContain('"1","Acme Sdn Bhd","G5","RM 1,000.00","Qualified"');
    expect(r.csv).toContain(`"'=Evil","${NO_CLASS_ON_REGISTER}"`);
  });
  it("refuses a Grand Summary that was not frozen", () => {
    expect(openingCsv("summary", opening({ summary: null }))).toEqual({ refusal: "NO_SUMMARY" });
  });
  it("names the file with letters, digits and hyphens only", () => {
    expect(openingDownloadName("T/2026 1", "schedule", 1)).toBe("T-2026-1-schedule-of-tenders-opening-1.csv");
  });
});
