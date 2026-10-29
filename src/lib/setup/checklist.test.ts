import { describe, expect, it } from "vitest";

import { buildChecklist, progressOf, SETUP_PLACEHOLDER_NAME, type ChecklistFacts, type MatrixFact } from "./checklist";

const EMPTY: ChecklistFacts = {
  today: "2026-10-23",
  twoPersonOn: false,
  organisation: { name: SETUP_PLACEHOLDER_NAME, registrationNo: null, address: null, hasLogo: false },
  orgUnits: 0,
  costCentres: 0,
  matrices: [],
  officesHeldToday: [],
  assignmentsToday: 0,
  committees: [],
  documentFeeFloors: 0,
  holidays: { calendarSet: false, yearRow: false, thisYear: 0 },
  evaluation: { issued: 0, draft: 0, issuedBy: null },
  supplierDocumentTypes: 0,
  declarationsFirm: 0,
  personalDataNoticeFirm: false,
  helpContact: false,
  registration: { open: false, missing: [] },
  letterSlotsSet: 0,
  letterSlots: 6,
  budgetCheckSet: false,
  saleChannelSet: false,
  submissionChannelSet: false,
  sulitReadersDecided: false,
  contractorPortalSigning: false,
  awardReturnClassSet: false,
  contractTypes: { active: 0, withRoute: 0, withForm: 0 },
};
const state = (f: Partial<ChecklistFacts>, key: string) => buildChecklist({ ...EMPTY, ...f }).find((i) => i.key === key)!;
const matrix = (m: Partial<MatrixFact>): MatrixFact => ({ issued: true, effectiveFrom: "2026-01-01", effectiveTo: null, issuedBy: { name: "Aini", at: new Date("2026-02-01") }, offices: ["A"], ...m });

describe("the checklist", () => {
  it("has the twenty-one items, the email sender left out until step 7", () => {
    const items = buildChecklist(EMPTY);
    expect(items).toHaveLength(21);
    expect(items.every((i) => i.state === "todo")).toBe(true);
    expect(progressOf(items)).toEqual({ done: 0, total: 21 });
  });

  it("organisation: the setup name, or a missing field, is not done", () => {
    const full = { name: "Jabatan X", registrationNo: "123", address: "1 Jalan", hasLogo: true };
    expect(state({ organisation: full }, "organisation").state).toBe("done");
    expect(state({ organisation: { ...full, name: SETUP_PLACEHOLDER_NAME } }, "organisation").state).toBe("todo");
    expect(state({ organisation: { ...full, hasLogo: false } }, "organisation").state).toBe("todo");
    expect(state({ organisation: { ...full, registrationNo: " " } }, "organisation").state).toBe("todo");
  });

  it("units needs both a unit and a cost centre", () => {
    expect(state({ orgUnits: 1 }, "units").state).toBe("todo");
    expect(state({ orgUnits: 1, costCentres: 1 }, "units").state).toBe("done");
  });

  it("people: every office on the in-force matrix is held; with no matrix, one assignment will do", () => {
    const m = matrix({ offices: ["A", "B"] });
    expect(state({ matrices: [m], officesHeldToday: ["A"] }, "people").state).toBe("todo");
    expect(state({ matrices: [m], officesHeldToday: ["A", "B"] }, "people").state).toBe("done");
    expect(state({ assignmentsToday: 1 }, "people").state).toBe("done");
    // a draft names the offices when nothing is in force
    expect(state({ matrices: [matrix({ issued: false, offices: ["Z"] })], officesHeldToday: ["A"], assignmentsToday: 1 }, "people").state).toBe("todo");
  });

  it("limits: issued by a named person is done, a draft is confirm, an issued one with no issuer is confirm, none is todo", () => {
    expect(state({ matrices: [matrix({})] }, "limits")).toMatchObject({ state: "done", confirmedBy: { name: "Aini" } });
    expect(state({ matrices: [matrix({ issued: false, issuedBy: null })] }, "limits").state).toBe("confirm");
    expect(state({ matrices: [matrix({ issuedBy: null })] }, "limits").state).toBe("confirm");
    // issued but not yet in force: nothing governs today, so it is still to do
    expect(state({ matrices: [matrix({ effectiveFrom: "2027-01-01" })] }, "limits").state).toBe("todo");
    expect(state({}, "limits").state).toBe("todo");
  });

  it("committees: every live committee has its quorum (or one) of members, and there is at least one", () => {
    expect(state({}, "committees").state).toBe("todo");
    expect(state({ committees: [{ quorum: 3, liveMembers: 3 }, { quorum: null, liveMembers: 1 }] }, "committees").state).toBe("done");
    expect(state({ committees: [{ quorum: 3, liveMembers: 2 }] }, "committees").state).toBe("todo");
    expect(state({ committees: [{ quorum: null, liveMembers: 0 }] }, "committees").state).toBe("todo");
  });

  it("fees and holidays", () => {
    expect(state({ documentFeeFloors: 1 }, "fees").state).toBe("done");
    expect(state({ holidays: { calendarSet: true, yearRow: true, thisYear: 0 } }, "holidays").state).toBe("todo");
    expect(state({ holidays: { calendarSet: false, yearRow: true, thisYear: 5 } }, "holidays").state).toBe("todo");
    expect(state({ holidays: { calendarSet: true, yearRow: true, thisYear: 5 } }, "holidays").state).toBe("done");
  });

  it("evaluation: issued is done, drafts only is confirm", () => {
    expect(state({ evaluation: { issued: 1, draft: 0, issuedBy: null } }, "evaluation").state).toBe("done");
    expect(state({ evaluation: { issued: 0, draft: 2, issuedBy: null } }, "evaluation").state).toBe("confirm");
  });

  it("supplier items: invented wording reads todo", () => {
    expect(state({ supplierDocumentTypes: 1 }, "documents").state).toBe("done");
    expect(state({ declarationsFirm: 2 }, "declarations").state).toBe("todo");
    expect(state({ declarationsFirm: 3 }, "declarations").state).toBe("done");
    expect(state({ personalDataNoticeFirm: true }, "notice").state).toBe("done");
    expect(state({ helpContact: true }, "help").state).toBe("done");
  });

  it("sale channel, submission channel and SULIT readers are done once set", () => {
    expect(state({ saleChannelSet: true }, "sale-channel").state).toBe("done");
    expect(state({ submissionChannelSet: true }, "submission-channel").state).toBe("done");
    expect(state({ sulitReadersDecided: true }, "sulit").state).toBe("done");
  });

  it("letters need every slot; budget needs its source", () => {
    expect(state({ letterSlotsSet: 5 }, "letters").state).toBe("todo");
    expect(state({ letterSlotsSet: 6 }, "letters").state).toBe("done");
    expect(state({ budgetCheckSet: true }, "budget").state).toBe("done");
  });

  it("the returned-award class item exists only where a contractor's account signs, and is done once a SULIT class is set (WV-5)", () => {
    expect(buildChecklist(EMPTY).some((i) => i.key === "award-return-class")).toBe(false);
    expect(buildChecklist({ ...EMPTY, awardReturnClassSet: true }).some((i) => i.key === "award-return-class")).toBe(false);
    expect(state({ contractorPortalSigning: true }, "award-return-class")).toMatchObject({ state: "todo", section: "contracts-payments", label: "Class for returned award documents" });
    expect(state({ contractorPortalSigning: true, awardReturnClassSet: true }, "award-return-class").state).toBe("done");
    expect(buildChecklist({ ...EMPTY, contractorPortalSigning: true })).toHaveLength(22);
  });

  it("how each contract type is paid: done only when every active type has a route; no active type is not done (Wave V V9)", () => {
    expect(state({}, "payment-route")).toMatchObject({ state: "todo", section: "contracts-payments", label: "How each contract type is paid", href: "/configuration/reference-data" });
    expect(state({ contractTypes: { active: 4, withRoute: 3, withForm: 0 } }, "payment-route").state).toBe("todo");
    expect(state({ contractTypes: { active: 4, withRoute: 4, withForm: 0 } }, "payment-route").state).toBe("done");
    expect(state({ contractTypes: { active: 1, withRoute: 0, withForm: 0 } }, "payment-route").state).toBe("todo");
    expect(state({ contractTypes: { active: 4, withRoute: 0, withForm: 3 } }, "performance-forms").state).toBe("todo");
    expect(state({ contractTypes: { active: 4, withRoute: 0, withForm: 4 } }, "performance-forms").state).toBe("done");
  });

  it("go-live: off links to the one-person changes, on does not", () => {
    expect(state({ twoPersonOn: false }, "two-person")).toMatchObject({ state: "todo", kind: "go-live", also: { href: "/configuration/audit?filter=one-person" } });
    const on = state({ twoPersonOn: true }, "two-person");
    expect(on.state).toBe("done");
    expect(on.also).toBeUndefined();
  });

  it("online registration: open or closed, with what is missing for staff", () => {
    expect(state({ registration: { open: true, missing: [] } }, "registration")).toMatchObject({ state: "done", label: "Online registration: open" });
    const closed = state({ registration: { open: false, missing: ["a", "b", "c", "d"] } }, "registration");
    expect(closed).toMatchObject({ state: "todo", label: "Online registration: closed" });
    expect(closed.detail).toContain("a, b, c and 1 more");
  });

  it("no label is over six words, except the go-live line, and no code is on screen", () => {
    for (const i of buildChecklist(EMPTY).filter((x) => x.kind !== "go-live")) expect(i.label.split(" ").length).toBeLessThanOrEqual(6);
    for (const i of buildChecklist(EMPTY)) expect((i.detail ?? "").split(" ").length).toBeLessThanOrEqual(25);
  });
});
