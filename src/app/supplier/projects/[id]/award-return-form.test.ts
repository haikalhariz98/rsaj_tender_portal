import { describe, expect, it } from "vitest";

import type { AcceptForm } from "@/lib/portal/projects/award-card";

import { canSend, chooseSignatory, startValues, submitBody } from "./award-return-form";

const indent: AcceptForm = { scans: [{ key: "ACCEPTANCE_PAGE", label: "Acceptance page" }], isIndent: true, signatories: [{ id: "k1", name: "Aminah", designation: "Director" }, { id: "k2", name: "Hassan", designation: "Manager" }], defaultSignatoryId: "k2", address: "1 Jalan Satu", resend: false };
const letter: AcceptForm = { scans: [{ key: "SIGNED_LETTER", label: "a" }, { key: "DECLARATION", label: "b" }, { key: "AUTHORISATION", label: "c" }], isIndent: false, signatories: [], defaultSignatoryId: "", address: "", resend: false };
const filled = { ...startValues(indent), icNumber: "900101-14-5678", occupation: "Director", witnessName: "Lee", signed: true, witnessed: true, stamped: true };

describe("the Accept drawer's form", () => {
  it("starts with the signed-in contact, the capacity from their designation, and the registered address", () => {
    expect(startValues(indent)).toMatchObject({ signatoryId: "k2", capacity: "Manager", address: "1 Jalan Satu", signed: false });
    expect(chooseSignatory(indent, startValues(indent), "k1")).toMatchObject({ signatoryId: "k1", capacity: "Director" });
  });

  it("is sent only with every scan, every field, the three ticks and the password", () => {
    const staged = { ACCEPTANCE_PAGE: "ver12345" };
    expect(canSend(indent, staged, filled, "pw")).toBe(true);
    expect(canSend(indent, {}, filled, "pw")).toBe(false);
    expect(canSend(indent, staged, filled, "")).toBe(false);
    expect(canSend(indent, staged, { ...filled, stamped: false }, "pw")).toBe(false);
    expect(canSend(indent, staged, { ...filled, icNumber: " " }, "pw")).toBe(false);
    expect(canSend(letter, { SIGNED_LETTER: "a", DECLARATION: "b" }, startValues(letter), "pw")).toBe(false);
    expect(canSend(letter, { SIGNED_LETTER: "a", DECLARATION: "b", AUTHORISATION: "c" }, startValues(letter), "pw")).toBe(true);
  });

  it("sends an indent's page with the chosen contact's id, never a name (security review M1), and a Letter of Acceptance with none", () => {
    expect(submitBody("c1", indent, { ACCEPTANCE_PAGE: "ver12345" }, filled, "pw")).toEqual({
      contractId: "c1",
      files: { ACCEPTANCE_PAGE: "ver12345" },
      page: { signatoryContactId: "k2", icNumber: "900101-14-5678", occupation: "Director", address: "1 Jalan Satu", capacity: "Manager", witnessName: "Lee", contractorSigned: true, stampAffixed: true, witnessSigned: true },
      password: "pw",
    });
    expect(JSON.stringify(submitBody("c1", indent, { ACCEPTANCE_PAGE: "ver12345" }, filled, "pw"))).not.toContain("Hassan");
    const body = submitBody("c1", letter, { SIGNED_LETTER: "a", DECLARATION: "b", AUTHORISATION: "c" }, startValues(letter), "pw");
    expect(body).not.toHaveProperty("page");
    expect(body.files).toEqual({ SIGNED_LETTER: "a", DECLARATION: "b", AUTHORISATION: "c" });
  });
});
