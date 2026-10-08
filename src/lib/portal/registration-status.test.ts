import { describe, expect, it } from "vitest";

import { applicationChannelWords, applicationKindWords, applicationStatusWords, outcomeWords, supplierStatusWords, type StatusApplication, type StatusDecision } from "./registration-status";

const day = (d: string) => `D(${d})`;
const CODE = /\b[A-Z]{2,}_[A-Z_]+\b/;

describe("where a supplier's registration stands, in its own words", () => {
  it("says each application state in both languages and never a code", () => {
    for (const status of ["RECEIVED", "RESUBMISSION_REQUESTED", "APPROVED", "REJECTED"] as const) {
      const s = applicationStatusWords({ status, resubmitBy: "2026-11-01" }, day);
      for (const t of [s.title, s.detail]) {
        expect(t.en, status).toBeTruthy();
        expect(t.ms, status).toBeTruthy();
        expect(t.en).not.toMatch(CODE);
      }
    }
  });

  it("names the deadline of a resubmission, and the consequence of missing it", () => {
    const s = applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: "2026-11-01" }, day);
    expect(s.detail.en).toContain("D(2026-11-01)");
    expect(s.detail.en).toMatch(/rejected/);
    expect(s.tone).toBe("warn");
    expect(applicationStatusWords({ status: "RESUBMISSION_REQUESTED", resubmitBy: null }, day).detail.en).not.toContain("D(");
  });

  it("says every outcome, including the lapse that nobody decided", () => {
    for (const o of ["APPROVE", "RESUBMIT", "REJECT", "LAPSE"] as StatusDecision["outcome"][]) {
      expect(outcomeWords(o).en).toBeTruthy();
      expect(outcomeWords(o).ms).toBeTruthy();
    }
    expect(outcomeWords("LAPSE").en).toMatch(/deadline/);
  });

  it("says where the supplier stands as a registrant from its status and its latest application", () => {
    expect(supplierStatusWords({ status: "REGISTERED", registeredOn: "2026-01-02" }, null, day).detail.en).toBe("On the supplier register since D(2026-01-02).");
    expect(supplierStatusWords({ status: "REGISTERED", registeredOn: null }, null, day).detail.en).toBe("On the supplier register.");
    expect(supplierStatusWords({ status: "REJECTED", registeredOn: null }, null, day).title.en).toBe("Application not accepted");
    expect(supplierStatusWords({ status: "APPLICANT", registeredOn: null }, { status: "RESUBMISSION_REQUESTED" }, day).tone).toBe("warn");
    expect(supplierStatusWords({ status: "APPLICANT", registeredOn: null }, { status: "RECEIVED" }, day).title.en).toBe("Application in progress");
    expect(supplierStatusWords({ status: "APPLICANT", registeredOn: null }, null, day).title.en).toBe("Application in progress");
  });

  it("names the kind and the channel of an application", () => {
    for (const k of ["NEW", "RENEWAL", "UPGRADE"] as StatusApplication["kind"][]) expect(applicationKindWords(k).ms).toBeTruthy();
    for (const c of ["COUNTER", "POST", "EMAIL", "PORTAL"] as StatusApplication["channel"][]) expect(applicationChannelWords(c).en).toMatch(/^(handed|sent)/);
  });
});
