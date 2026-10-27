import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { contractNumberSource } from "./contract-number";
import { formatDay, mergeFieldsFor, templateText, type MergeContext } from "./fields";
import { issueFaults, type IssueInput } from "./gate";
import { awardFindingText } from "./labels";
import { renderTemplate, renderedText } from "./merge";

const LOA = { kind: "LETTER_OF_ACCEPTANCE" as const, commitmentNo: null, commitmentKind: null };
const INDENT = { kind: "WORK_INDENT" as const, commitmentNo: "XI202600812", commitmentKind: "INDENT" as const };

const clear: IssueInput = {
  status: "APPROVED",
  opening: null,
  today: "2026-09-30",
  exerciseStatus: "DOCUMENTS_IN_PREPARATION",
  exercisePackKind: null,
  commitment: null,
  sourcingPermitted: true,
  instrument: { kind: "LETTER_OF_ACCEPTANCE" },
  valueFaults: [],
  dossierFaults: [],
  appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "A", outcome: "CARRIED" }] },
  signatory: { ok: true, roleCode: "FD", roleLabel: "Functional Director", ruleKey: "k", ruleLabel: "l", clause: "c", recommenders: [], delegable: false },
  indent: null,
  distribution: { rows: [{}] },
  documents: [{ kind: "LETTER_OF_ACCEPTANCE", state: "OK", templateName: "LoA", missing: [], unknown: [], unfilled: [] }],
  variant: null,
  terms: null,
  bond: { required: true, reason: "", basis: { state: "SET", amount: parseSen("1"), basis: "CONTRACT_PRICE" } },
  contractNumber: { source: "SERIES", seriesKey: "contract" },
  startDate: "2026-10-01",
  wc: { required: false, basis: null },
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
    expect(codes({ ...indent, indent: { number: null, formatOk: null, state: { state: "NOT_RECEIVED" }, validitySet: true } })).toEqual(["INDENT_NUMBER_REQUIRED"]);
    expect(codes({ ...indent, indent: { number: "X1", formatOk: false, state: { state: "VALID", expiresOn: "2026-10-10" }, validitySet: true } })).toEqual(["INDENT_NUMBER_FORMAT"]);
    expect(codes({ ...indent, indent: { number: "XI202600812", formatOk: true, state: { state: "EXPIRED", expiresOn: "2026-09-28" }, validitySet: true } })).toEqual(["INDENT_EXPIRED"]);
  });

  // Phase 0.3 item 9 (FR-AWD-006 "enforce"; gaps stay honest): an unset validity is not a valid indent, received or not.
  it("an indent is not issued while its validity is not set, and the words name the setting", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, variant: { state: "SELECTED" as const, variant: {} as never }, terms: { retentionAsked: false, dlpAsked: false, retentionSet: false, dlpSet: false }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] } };
    expect(codes({ ...indent, indent: { number: "XI202600812", formatOk: true, state: { state: "NOT_SET" }, validitySet: false } })).toEqual(["INDENT_VALIDITY_NOT_SET"]);
    expect(codes({ ...indent, indent: { number: "XI202600812", formatOk: true, state: { state: "NOT_RECEIVED" }, validitySet: false } })).toEqual(["INDENT_VALIDITY_NOT_SET"]);
    expect(awardFindingText({ code: "INDENT_VALIDITY_NOT_SET", level: "block" })).toBe("Set the indent validity under Award controls first.");
  });

  it("an indent that expires before the stated start date refuses issue", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, variant: { state: "SELECTED" as const, variant: {} as never }, terms: { retentionAsked: false, dlpAsked: false, retentionSet: false, dlpSet: false }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] } };
    const valid = { number: "XI202600812", formatOk: true, state: { state: "VALID" as const, expiresOn: "2026-10-10" }, validitySet: true };
    expect(codes({ ...indent, indent: valid, startDate: "2026-10-11" })).toEqual(["INDENT_EXPIRES_BEFORE_START"]);
    expect(codes({ ...indent, indent: valid, startDate: "2026-10-10" })).toEqual([]);
  });

  it("an indent's variant and the terms its band asks for", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, indent: { number: "X", formatOk: true, state: { state: "VALID" as const, expiresOn: "2026-10-10" }, validitySet: true }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] } };
    expect(codes({ ...indent, variant: { state: "TERMS_NOT_SET" }, terms: { retentionAsked: null, dlpAsked: null, retentionSet: false, dlpSet: false } })).toEqual(["TERMS_NOT_SET", "TERMS_UNDECIDED"]);
    expect(codes({ ...indent, variant: { state: "SELECTED", variant: {} as never }, terms: { retentionAsked: true, dlpAsked: true, retentionSet: false, dlpSet: true } })).toEqual(["RETENTION_REQUIRED"]);
  });

  it("the regulated question, unanswered where a recipient depends on it, and no recipients at all", () => {
    expect(codes({ distribution: { fault: "REGULATED_NOT_ANSWERED" } })).toEqual(["REGULATED_NOT_ANSWERED"]);
    expect(codes({ distribution: { fault: "RECIPIENTS_NOT_SET" } })).toEqual(["RECIPIENTS_NOT_SET"]);
  });

  it("a template missing, empty, undecided in language, or with a field unfilled refuses", () => {
    const d = (x: object) => ({ documents: [{ kind: "LETTER_OF_ACCEPTANCE" as const, state: "OK" as const, templateName: "LoA", missing: [], unknown: [], unfilled: [], ...x }] });
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

  it("each remaining rule refuses on its own", () => {
    expect(codes({ commitment: { code: "NO_APPROVAL_ROUTE" } as never })).toEqual(["REQUISITION_NOT_ROUTED"]);
    expect(codes({ sourcingPermitted: null })).toEqual(["SOURCING_NOT_RECORDED"]);
    expect(codes({ today: null })).toEqual(["TIME_ZONE_UNSET"]);
    expect(codes({ signatory: { ok: false, fault: "SIGNATORY_GAP" } })).toEqual(["SIGNATORY_GAP"]);
    expect(codes({ signatory: { ok: false, fault: "SIGNATORY_BOUNDARY_UNDECIDED" } })).toEqual(["SIGNATORY_BOUNDARY_UNDECIDED"]);
    expect(codes({ contractNumber: { fault: "INDENT_NUMBER_NOT_AN_INDENT" } })).toEqual(["INDENT_NUMBER_NOT_AN_INDENT"]);
    expect(codes({ valueFaults: [{ code: "INSTRUMENT_CHANGED", level: "block" }] })).toEqual(["INSTRUMENT_CHANGED"]);
  });

  it("an indent whose band asks for a defects liability period refuses without one", () => {
    const indent = { instrument: { kind: "WORK_INDENT" as const }, indent: { number: "X", formatOk: true, state: { state: "VALID" as const, expiresOn: "2026-10-10" }, validitySet: true }, appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [] }, variant: { state: "SELECTED" as const, variant: {} as never } };
    expect(codes({ ...indent, terms: { retentionAsked: false, dlpAsked: true, retentionSet: false, dlpSet: false } })).toEqual(["DLP_REQUIRED"]);
    expect(codes({ ...indent, terms: { retentionAsked: false, dlpAsked: true, retentionSet: false, dlpSet: true } })).toEqual([]);
  });

  it("a committee's mandatory approval counts as the approving act a Letter of Acceptance needs", () => {
    expect(codes({ appointment: { status: "APPROVED", pendingStep: null, committeeSteps: [{ committee: "Tender Board", act: "MA", outcome: "CARRIED" }] } })).toEqual([]);
  });

  it("FR-MTD-009: a dossier fault is re-checked at issue and refuses", () => {
    expect(codes({ dossierFaults: [{ code: "EVIDENCE_NOT_ATTACHED", level: "block" }] })).toEqual(["EVIDENCE_NOT_ATTACHED"]);
    expect(codes({ dossierFaults: [{ code: "SOMETHING_ADVISORY", level: "warn" }] })).toEqual([]);
  });

  it("BD-14: a text about to be frozen with a placeholder left refuses", () => {
    expect(codes({ documents: [{ kind: "LETTER_OF_ACCEPTANCE", state: "OK", templateName: "LoA", missing: [], unknown: [], unfilled: ["contract.number"] }] })).toEqual(["ISSUE_VALUE_UNFILLED"]);
  });

  it("only an approved award is issued, from an exercise still open", () => {
    expect(codes({ status: "PENDING_APPROVAL" })).toEqual(["NOT_APPROVED_YET"]);
    expect(codes({ exerciseStatus: "CANCELLED" })).toEqual(["EXERCISE_NOT_OPEN"]);
  });
});

describe("where the contract number comes from (FR-CON-002, OQ-11)", () => {
  it("a tender award draws from its contract type's series; none set refuses", () => {
    expect(contractNumberSource("tender", null, "contract", LOA)).toEqual({ source: "SERIES", seriesKey: "contract" });
    expect(contractNumberSource("tender", "INDENT_NUMBER", null, LOA)).toEqual({ fault: "CONTRACT_SERIES_NOT_SET" });
  });
  it("a quotation award follows the setting, and unset refuses", () => {
    expect(contractNumberSource("quotation", null, "contract", INDENT)).toEqual({ fault: "QUOTATION_KEY_NOT_SET" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", null, INDENT)).toEqual({ source: "INDENT_NUMBER", number: "XI202600812" });
    expect(contractNumberSource("quotation", "CONTRACT_SERIES", "contract", INDENT)).toEqual({ source: "SERIES", seriesKey: "contract" });
  });
  // Phase 0.3 item 15 (RSAJ Q22(d)): the quotation's own number, as the Schedule of Rates letter takes it; a tender award still draws its series.
  it("a quotation award may take the quotation's own number, and only in the quotation regime", () => {
    expect(contractNumberSource("quotation", "QUOTATION_NUMBER", "contract", INDENT, " RSAJ/KP/QJB/007/26 ")).toEqual({ source: "QUOTATION_NUMBER", number: "RSAJ/KP/QJB/007/26" });
    expect(contractNumberSource("quotation", "QUOTATION_NUMBER", null, LOA, "Q/1")).toEqual({ source: "QUOTATION_NUMBER", number: "Q/1" });
    expect(contractNumberSource("quotation", "QUOTATION_NUMBER", "contract", INDENT)).toEqual({ fault: "QUOTATION_NUMBER_NOT_RECORDED" });
    expect(contractNumberSource("tender", "QUOTATION_NUMBER", "contract", LOA, "Q/1")).toEqual({ source: "SERIES", seriesKey: "contract" });
  });
  it("numbers from the indent only an indent award whose indent number is recorded — never a purchase order's, never nothing", () => {
    expect(contractNumberSource("quotation", "INDENT_NUMBER", "contract", LOA)).toEqual({ fault: "INDENT_NUMBER_NOT_AN_INDENT" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", "contract", { kind: "LETTER_OF_ACCEPTANCE", commitmentNo: "PO-1", commitmentKind: "PURCHASE_ORDER" })).toEqual({ fault: "INDENT_NUMBER_NOT_AN_INDENT" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", "contract", { kind: "WORK_INDENT", commitmentNo: null, commitmentKind: null })).toEqual({ fault: "INDENT_NUMBER_NOT_RECORDED" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", "contract", { kind: "WORK_INDENT", commitmentNo: "  ", commitmentKind: "INDENT" })).toEqual({ fault: "INDENT_NUMBER_NOT_RECORDED" });
    expect(contractNumberSource("quotation", "INDENT_NUMBER", "contract", { kind: "WORK_INDENT", commitmentNo: "PO-1", commitmentKind: "PURCHASE_ORDER" })).toEqual({ fault: "INDENT_NUMBER_NOT_RECORDED" });
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
    approver: { office: { en: "Chief Executive", ms: "Ketua Pegawai Eksekutif" }, receivedOn: null, name: "A", decidedOn: "2026-08-03" },
  };
  it("formats money in sen, days in the template's language, periods in words", () => {
    const f = mergeFieldsFor(ctx);
    expect(f["award.value"]).toBe("RM26,937.70");
    expect(f["award.issueDate"]).toBe("3 Ogos 2026");
    expect(f["award.completionPeriod"]).toBe("24 bulan");
    expect(f["terms.retention"]).toBe("5%");
    // A Malay letter says the unit in Malay (UX review: "per day" read in English in a Malay letter).
    expect(f["terms.lad"]).toBe("RM500.00 sehari");
    expect(mergeFieldsFor({ ...ctx, lang: "EN" })["terms.lad"]).toBe("RM500.00 per day");
    expect(f["bond.basis"]).toBe("5% daripada nilai setahun kontrak");
    expect(formatDay("2026-08-03", "EN")).toBe("3 August 2026");
  });
  it("a day received not recorded, and no committee decision, are empty: missing, never invented", () => {
    const f = mergeFieldsFor(ctx);
    expect(f["approver.receivedOn"]).toBe("");
    expect(f["committee.meetingDate"]).toBe("");
    expect(f["contract.number"]).toBe("");
  });
  it("a Malay letter takes the Malay names, and a name with no Malay set is missing — never the English", () => {
    expect(mergeFieldsFor(ctx)["approver.office"]).toBe("Ketua Pegawai Eksekutif");
    expect(mergeFieldsFor({ ...ctx, lang: "EN" })["approver.office"]).toBe("Chief Executive");
    expect(mergeFieldsFor({ ...ctx, approver: { ...ctx.approver!, office: { en: "Chief Executive", ms: null } } })["approver.office"]).toBe("");
    expect(mergeFieldsFor({ ...ctx, signatory: { name: "B", office: { en: "Finance Director", ms: "Pengarah Kewangan" } } })["signatory.office"]).toBe("Pengarah Kewangan");
  });
  it("has no IC number field", () => {
    expect(Object.keys(mergeFieldsFor(ctx)).some((k) => /\.(ic|icnumber|identity)/i.test(k))).toBe(false);
  });
});

describe("which body a template issues in", () => {
  // Founder, 2026-10-20: English only. These pinned the primary language and an undecided language; a new document is issued from the English body whatever the primary language says.
  it("the English body, whatever the primary language or a stored Malay body", () => {
    expect(templateText({ bodyMs: "Tuan", bodyEn: "Sir", primaryLanguage: "MS" })).toEqual({ language: "EN", body: "Sir" });
    expect(templateText({ bodyMs: null, bodyEn: "Sir", primaryLanguage: null })).toEqual({ language: "EN", body: "Sir" });
    expect(templateText({ bodyMs: "Tuan", bodyEn: "Sir", primaryLanguage: null })).toEqual({ language: "EN", body: "Sir" });
  });
  it("no English body is not configured, whatever Malay text there is", () => {
    expect(templateText({ bodyMs: "Tuan", bodyEn: null, primaryLanguage: "MS" })).toEqual({ fault: "NO_TEXT" });
    expect(templateText({ bodyMs: "  ", bodyEn: null, primaryLanguage: null })).toEqual({ fault: "NO_TEXT" });
  });
});
