import { describe, expect, it } from "vitest";

import { annotationLines, isAnnotation, releaseAnnotation, saleAnnotation } from "./sale";

describe("the label of a set bought online is a release record (SR-10, ruling 16)", () => {
  const base = { exerciseReference: "SX/1", purchaser: "Contoh Bina Sdn Bhd", address: "1 Jalan Demo", phone: "03-1", fax: "", closingText: "30 Nov 2026, 15:00" };
  it("names the buyer and the time, how it was paid and the reference, and says no officer issued it", () => {
    const a = releaseAnnotation({ ...base, release: { buyer: "Aini Binti Ahmad", releasedAtText: "12 Oct 2026, 10:15", payment: "Simulated payment", reference: "SIM-ABC123" } });
    expect(isAnnotation(a)).toBe(true);
    const lines = annotationLines(a);
    expect(lines).toContain("Released to: Aini Binti Ahmad, signed in to the supplier portal");
    expect(lines).toContain("Released on: 12 Oct 2026, 10:15");
    expect(lines).toContain("Payment: Simulated payment");
    expect(lines).toContain("Reference: SIM-ABC123");
    expect(lines.some((l) => /no officer issued it/.test(l))).toBe(true);
  });
  it("never carries a simulated reference as a finance receipt", () => {
    const sim = releaseAnnotation({ ...base, release: { buyer: "A", releasedAtText: "t", payment: "Simulated payment", reference: "SIM-1" } });
    expect(sim.receipt).toBeNull();
    const rec = releaseAnnotation({ ...base, release: { buyer: "A", releasedAtText: "t", payment: "Finance receipt recorded by an officer", reference: "R-77" } });
    expect(rec.receipt).toBe("R-77");
  });
  it("leaves the counter sale's label as it was", () => {
    const a = saleAnnotation({ ...base, issuedBy: "Chen", soldOnText: "1 Oct 2026", receiptNo: "R-1", exerciseReference: "SX/1", purchaser: "X" });
    expect(annotationLines(a)).toContain("Issued by: Chen, on 1 Oct 2026 (recorded by the officer who issued it)");
  });
});
