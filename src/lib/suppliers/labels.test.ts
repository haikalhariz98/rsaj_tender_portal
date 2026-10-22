import { describe, expect, it } from "vitest";

import { APPLICATION_KIND_LABEL, APPLICATION_STATUS_LABEL, CHANNEL_LABEL, declarationDayLabel, DOCUMENT_STATE_LABEL, LIST_KIND_LABEL, OUTCOME_LABEL, SUPPLIER_STATUS_LABEL, supplierFaultText, VALUE_KIND_LABEL, VERIFICATION_LABEL } from "./labels";
import { APPLICATION_CHANNELS, APPLICATION_KINDS, APPLICATION_OUTCOMES, APPLICATION_STATUSES, REGISTRATION_VALUE_KINDS, SUPPLIER_LIST_KINDS, SUPPLIER_STATUSES, VERIFICATION_STATES } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const CODE = /\b[A-Z]{2,}_[A-Z_]+\b/;

describe("the register's words: both languages, no codes (AGENTS.md rule 5)", () => {
  const maps: [string, Record<string, { en: string;  }>, readonly string[]][] = [
    ["value kinds", VALUE_KIND_LABEL, REGISTRATION_VALUE_KINDS],
    ["supplier statuses", SUPPLIER_STATUS_LABEL, SUPPLIER_STATUSES],
    ["application kinds", APPLICATION_KIND_LABEL, APPLICATION_KINDS],
    ["channels", CHANNEL_LABEL, APPLICATION_CHANNELS],
    ["application statuses", APPLICATION_STATUS_LABEL, APPLICATION_STATUSES],
    ["outcomes", OUTCOME_LABEL, APPLICATION_OUTCOMES],
    ["verification", VERIFICATION_LABEL, VERIFICATION_STATES],
    ["lists", LIST_KIND_LABEL, SUPPLIER_LIST_KINDS],
  ];
  it.each(maps)("every %s value has English and Malay words", (_, map, values) => {
    for (const v of values) {
      expect(map[v]?.en, v).toBeTruthy();
      expect(map[v].en).not.toMatch(CODE);
    }
  });

  it("every document state has words", () => {
    for (const s of Object.keys(DOCUMENT_STATE_LABEL)) expect(DOCUMENT_STATE_LABEL[s as keyof typeof DOCUMENT_STATE_LABEL].en).toBeTruthy();
  });

  it("a fault's words name the setting and the way on, in both languages, never a code", () => {
    const f = { code: "EXPIRES_NOT_SET", level: "block" as const, data: { type: "Works board certificate" } };
    expect(supplierFaultText(f)).toBe("Whether a Works board certificate expires is not set, so it cannot be lodged. Set it under Configuration › Supplier register, Document types.");
    expect(supplierFaultText({ code: "DOCUMENT_NOT_STANDING", level: "block", data: { type: "Works board certificate", state: "NOT_CHECKED" } })).toBe("Works board certificate is mandatory and reads “lodged, not checked”: it must be verified and in force.");
    expect(supplierFaultText({ code: "DOCUMENT_NOT_STANDING", level: "block", data: { type: "X", state: "EXPIRED" } })).not.toMatch(CODE);
  });

  it("an unknown code still reads as words", () => {
    expect(supplierFaultText({ code: "NO_SUCH_THING", level: "block" })).toBe("This cannot be done as it stands.");
  });
});

describe("an online applicant's agreement is never called signed (ADR 0041 D3, D4; plan 6.3.2)", () => {
  it("labels the declaration day agreed for an application approved from an online one, and signed otherwise", () => {
    expect(declarationDayLabel(true)).toBe("Declaration agreed on");
    expect(declarationDayLabel(true)).not.toMatch(/sign/i);
    expect(declarationDayLabel(false)).toBe("Declaration signed on");
  });
});
