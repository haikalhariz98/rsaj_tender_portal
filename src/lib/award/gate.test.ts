import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { contractNumberSource } from "./contract-number";
import { formatDay, mergeFieldsFor, templateText, type MergeContext } from "./fields";
import { issueFaults, type IssueInput } from "./gate";
import { renderTemplate, renderedText } from "./merge";

const clear: IssueInput = {
  status: "APPROVED",
  today: "2026-09-30",
  exerciseStatus: "DOCUMENTS_IN_PREPARATION",
  commitment: null,
  sourcingPermitted: true,
  instrument: { kind: "LETTER_OF_ACCEPTANCE" },
  valueFaults: [],
  dossierFaults: [],
  appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "A", outcome: "CARRIED" }] },
  signatory: { ok: true, roleCode: "FD", roleLabel: "Functional Director", ruleKey: "k", ruleLabel: "l", clause: "c", recommenders: [], delegable: false },
  indent: null,
  distribution: { rows: [{}] },
  documents: [{ kind: "LETTER_OF_ACCEPTANCE", state: "OK", templateName: "LoA", missing: [], unknown: [] }],
  variant: null,
  terms: null,
  bond: { required: true, reason: "", basis: { state: "SET", amount: parseSen("1"), basis: "CONTRACT_PRICE" } },
  contractNumber: { source: "SERIES", seriesKey: "contract" },
  startDate: "2026-10-01",
};
const codes = (x: Partial<IssueInput>) => issueFaults({ ...clear, ...x }).map((f) => f.code);

describe("the issue gate (FR-AWD-001 and what issue depends on)", () => {
  it("all clear gives no faults", () => expect(codes({})).toEqual([]));

  it("FR-REQ-016: a requisition not through its approval refuses, naming the outstanding step", () => {
    const f = issueFaults({ ...clear, commitment: { code: "NOT_APPROVED", outstanding: "Head of Division" } });
    expect(f).toEqual([{ code: "REQUISITION_NOT_APPROVED", level: "block", data: { step: "Head of Division" } }]);
    expect(codes({ sourcingPermitted: false })).toEqual(["SOURCING_NOT_PERMITTED"]);
  });

  it("FR-AWD-001: until the committee's decision is carried, issue is unavailable — naming the committee", () => {
    const f = issueFaults({ ...clear, appointment: { status: "PENDING", pendingStep: "Tender Board", committeeSteps: [{ committee: "Tender Board", act: "A", outcome: null }] } });
    expect(f.map((x) => x.code)).toEqual(["APPOINTMENT_NOT_APPROVED", "COMMITTEE_DECISION_NOT_RECORDED"]);
    expect(f[1].data).toEqual({ committee: "Tender Board", outcome: null });
    expect(codes({ appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "A", outcome: "DEFERRED" }] } })).toEqual(["COMMITTEE_DECISION_NOT_RECORDED"]);
  });

  it("a Letter of Acceptance whose route bypasses every approving body cannot satisfy FR-AWD-001", () => {
    expect(codes({ appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Quotation Committee", act: "MR", outcome: "CARRIED" }] } })).toEqual(["NO_COMMITTEE_APPROVAL_IN_ROUTE"]);
  });

  it("an indent needs its number, in its format, and not expired", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, variant: { state: "SELECTED" as const, variant: {} as never }, terms: { retentionAsked: false, dlpAsked: false, retentionSet: false, dlpSet: false }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] } };
    expect(codes({ ...indent, indent: { number: null, formatOk: null, state: { state: "NOT_RECEIVED" } } })).toEqual(["INDENT_NUMBER_REQUIRED"]);
    expect(codes({ ...indent, indent: { number: "X1", formatOk: false, state: { state: "VALID", expiresOn: "2026-10-10" } } })).toEqual(["INDENT_NUMBER_FORMAT"]);
    expect(codes({ ...indent, indent: { number: "XI202600812", formatOk: true, state: { state: "EXPIRED", expiresOn: "2026-09-28" } } })).toEqual(["INDENT_EXPIRED"]);
  });

  it("an indent's variant and the terms its band asks for", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, indent: { number: "X", formatOk: true, state: { state: "VALID" as const, expiresOn: "2026-10-10" } }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] } };
    expect(codes({ ...indent, variant: { state: "TERMS_NOT_SET" }, terms: { retentionAsked: null, dlpAsked: null, retentionSet: false, dlpSet: false } })).toEqual(["TERMS_NOT_SET", "TERMS_UNDECIDED"]);
    expect(codes({ ...indent, variant: { state: "SELECTED", variant: {} as never }, terms: { retentionAsked: true, dlpAsked: true, retentionSet: false, dlpSet: true } })).toEqual(["RETENTION_REQUIRED"]);
  });

  it("the regulated question, unanswered where a recipient depends on it, and no recipients at all", () => {
    expect(codes({ distribution: { fault: "REGULATED_NOT_ANSWERED" } })).toEqual(["REGULATED_NOT_ANSWERED"]);
    expect(codes({ distribution: { fault: "RECIPIENTS_NOT_SET" } })).toEqual(["RECIPIENTS_NOT_SET"]);
  });

  it("a template missing, empty, undecided in language, or with a field unfilled refuses", () => {
    const d = (x: object) => ({ documents: [{ kind: "LETTER_OF_ACCEPTANCE" as const, state: "OK" as const, templateName: "LoA", missing: [], unknown: [], ...x }] });
    expect(codes(d({ state: "TEMPLATE_NOT_SET" }))).toEqual(["TEMPLATE_NOT_SET"]);
    expect(codes(d({ state: "NO_TEXT" }))).toEqual(["TEMPLATE_TEXT_NOT_SET"]);
    expect(codes(d({ state: "NO_LANGUAGE" }))).toEqual(["TEMPLATE_LANGUAGE_NOT_SET"]);
    expect(codes(d({ missing: ["awardee.name"] }))).toEqual(["TEMPLATE_INCOMPLETE"]);
    expect(codes(d({ unknown: ["foo"] }))).toEqual(["TEMPLATE_UNKNOWN_FIELD"]);
  });

  it("the bond decided (D4): undecided, not required without a reason, or required with no basis, refuses", () => {
    expect(codes({ bond: { required: null, reason: "", basis: { state: "NOT_SET", missing: ["BASIS"] } } })).toEqual(["BOND_NOT_DECIDED"]);
    expect(codes({ bond: { required: false, reason: "", basis: { state: "NOT_SET", missing: ["BASIS"] } } })).toEqual(["BOND_REASON_REQUIRED"]);
    expect(codes({ bond: { required: true, reason: "", basis: { state: "NOT_SET", missing: ["BASIS"] } } })).toEqual(["BOND_BASIS_NOT_SET"]);
  });

  it("no contract series, no quotation key, no signatory row, no start day: each refuses", () => {
    expect(codes({ contractNumber: { fault: "CONTRACT_SERIES_NOT_SET" } })).toEqual(["CONTRACT_SERIES_NOT_SET"]);
    expect(codes({ signatory: { ok: false, fault: "SIGNATORY_UNRESOLVED" } })).toEqual(["SIGNATORY_UNRESOLVED"]);
    expect(codes({ startDate: null })).toEqual(["START_DATE_REQUIRED"]);
    expect(codes({ instrument: { fault: "INSTRUMENT_NOT_SET" } })).toContain("INSTRUMENT_NOT_SET");
  });

  it("only an approved award is issued, from an exercise still open", () => {
    expect(codes({ status: "PENDING_APPROVAL" })).toEqual(["NOT_APPROVED_YET"]);
    expect(codes({ exerciseStatus: "CANCELLED" })).toEqual(["EXERCISE_NOT_OPEN"]);
  });
});

describe("where the contract number comes from (FR-CON-002, OQ-11)", () => {
  it("a tender award draws from its contract type's series; none set refuses", () => {
    expect(contractNumberSource("tender", null, "contract")).toEqual({ source: "SERIES", seriesKey: "contract" });
    expect(contractNumberSource("tender", "INDENT_NUMBER", null)).toEqual({ fault: "CONTRACT_SERIES_NOT_SET" });
  });
  it("a quotation award follows the setting, and unset refuses", () => {
    expect(contractNumberSource("quotation", null, "contract")).toEqual({ fault: "QUOTATION_KEY_NOT_SET" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", null)).toEqual({ source: "INDENT_NUMBER" });
    expect(contractNumberSource("quotation", "CONTRACT_SERIES", "contract")).toEqual({ source: "SERIES", seriesKey: "contract" });
  });
});

describe("rendering a template (ADR 0008)", () => {
  it("substitutes whitelisted fields and splits paragraphs on a blank line", () => {
    const r = renderTemplate("Dear {{awardee.name}},\n\nYour tender of {{ award.value }} is accepted.", { "awardee.name": "Demo Works Sdn Bhd", "award.value": "RM2,100,000.00" });
    expect(r).toEqual({ paragraphs: ["Dear Demo Works Sdn Bhd,", "Your tender of RM2,100,000.00 is accepted."], missing: [], unknown: [] });
  });
  it("never prints an unknown field as written", () => {
    const r = renderTemplate("A {{secret.field}} here", {});
    expect(r.unknown).toEqual(["secret.field"]);
    expect(r.paragraphs.join(" ")).not.toContain("{{");
    expect(r.paragraphs.join(" ")).not.toContain("secret.field");
  });
  it("an empty value is missing, and says which", () => {
    const r = renderTemplate("To {{awardee.name}}", { "awardee.name": " " });
    expect(r.missing).toEqual(["awardee.name"]);
    expect(r.paragraphs).toEqual(["To [awardee not recorded]"]);
  });
  it("is deterministic", () => {
    const body = "{{award.reference}}\n\n{{award.value}}";
    const fields = { "award.reference": "A/1", "award.value": "RM1.00" };
    expect(renderedText(renderTemplate(body, fields))).toBe(renderedText(renderTemplate(body, fields)));
  });
});

describe("merge values", () => {
  const ctx: MergeContext = {
    lang: "MS",
    organisationName: "Demo",
    award: { reference: "A/1", value: parseSen("26937.70"), issueDate: "2026-08-03", completionPeriod: 24, completionUnit: "MONTHS", startDate: null },
    awardee: { name: "W", registrationNo: "", address: "" },
    exercise: { reference: "X", title: "T" },
    requisitionReference: "R",
    contractNumber: null,
    signatory: { name: null, office: null },
    terms: { ladAmount: parseSen("500"), ladUnit: "per day", retentionPercent: "5.0000", retentionCapPercent: null, dlpMonths: 12 },
    bond: { amount: null, percent: "5.0000", basis: "ANNUAL_VALUE", validityMonths: 12 },
    indent: { number: null, receivedOn: null, expiresOn: null },
    committee: null,
    approver: { office: "Chief Executive", receivedOn: null, name: "A", decidedOn: "2026-08-03" },
  };
  it("formats money in sen, days in the template's language, periods in words", () => {
    const f = mergeFieldsFor(ctx);
    expect(f["award.value"]).toBe("RM26,937.70");
    expect(f["award.issueDate"]).toBe("3 Ogos 2026");
    expect(f["award.completionPeriod"]).toBe("24 bulan");
    expect(f["terms.retention"]).toBe("5%");
    expect(f["terms.lad"]).toBe("RM500.00 per day");
    expect(f["bond.basis"]).toBe("5% daripada nilai setahun kontrak");
    expect(formatDay("2026-08-03", "EN")).toBe("3 August 2026");
  });
  it("a day received not recorded, and no committee decision, are empty: missing, never invented", () => {
    const f = mergeFieldsFor(ctx);
    expect(f["approver.receivedOn"]).toBe("");
    expect(f["committee.meetingDate"]).toBe("");
    expect(f["contract.number"]).toBe("");
  });
  it("has no IC number field", () => {
    expect(Object.keys(mergeFieldsFor(ctx)).some((k) => /\.(ic|icnumber|identity)/i.test(k))).toBe(false);
  });
});

describe("which body a template issues in", () => {
  it("the primary language, or the only body there is", () => {
    expect(templateText({ bodyMs: "Tuan", bodyEn: "Sir", primaryLanguage: "MS" })).toEqual({ language: "MS", body: "Tuan" });
    expect(templateText({ bodyMs: null, bodyEn: "Sir", primaryLanguage: null })).toEqual({ language: "EN", body: "Sir" });
  });
  it("both bodies and no primary language is undecided; no body is not configured", () => {
    expect(templateText({ bodyMs: "Tuan", bodyEn: "Sir", primaryLanguage: null })).toEqual({ fault: "NO_LANGUAGE" });
    expect(templateText({ bodyMs: "  ", bodyEn: null, primaryLanguage: null })).toEqual({ fault: "NO_TEXT" });
  });
});
