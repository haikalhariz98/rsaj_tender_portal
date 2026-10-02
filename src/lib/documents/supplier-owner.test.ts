import { describe, expect, it } from "vitest";

import { attachFault, detachFault, ownerState, purposeFits, reliedOn } from "./attach";
import { EXIT_TEXT, documentFaultText } from "./labels";
import { supplierApplicationFacts, supplierDocumentFacts } from "./owner-facts";
import { ownerHref } from "./targets";
import { PURPOSE_CLASSIFICATION } from "./types";

/**
 * 6.15 (X-6, condition 2, OD-3 B): a supplier's document keeps its scan (not restricted until sign-in)
 * until it is renewed, and a verified one stands on it; an application keeps its signed declaration and
 * the paper E-Payment form's scan (SULIT at upload) until decided, and once sent for decision stands on
 * its declaration.
 */

const doc = (verification: string, renewed = false) => supplierDocumentFacts({ verification, renewedBy: renewed ? { id: "n" } : null });
const app = (status: string, routes: string[] = [], lapsed = false) => supplierApplicationFacts({ status, lapsedRecordedAt: lapsed ? new Date() : null, routes: routes.map((s) => ({ status: s })) });
const internal = { version: { withdrawnAt: null }, documentClass: { classification: "INTERNAL" as const } };
const sulit = { version: { withdrawnAt: null }, documentClass: { classification: "SULIT" as const } };

describe("the E-Payment form's scan is SULIT at upload (OD-3 B); the others take any class", () => {
  it("only the E-Payment form is held at SULIT", () => {
    expect(PURPOSE_CLASSIFICATION.SUPPLIER_EPAYMENT_FORM).toBe("SULIT");
    expect(PURPOSE_CLASSIFICATION.SUPPLIER_DOCUMENT).toBeUndefined();
    expect(PURPOSE_CLASSIFICATION.SUPPLIER_DECLARATION).toBeUndefined();
  });
  it("refuses an INTERNAL E-Payment form, takes a SULIT one", () => {
    expect(attachFault({ purpose: "SUPPLIER_EPAYMENT_FORM", owner: app("RECEIVED"), ...internal }).map((f) => f.code)).toEqual(["CLASSIFICATION_BELOW_PURPOSE"]);
    expect(attachFault({ purpose: "SUPPLIER_EPAYMENT_FORM", owner: app("RECEIVED"), ...sulit })).toEqual([]);
    expect(attachFault({ purpose: "SUPPLIER_DECLARATION", owner: app("RECEIVED"), ...internal })).toEqual([]);
  });
});

describe("a supplier's document as an owner", () => {
  it("takes only its scan", () => {
    expect(purposeFits("SUPPLIER_DOCUMENT", doc("NOT_CHECKED"))).toBe(true);
    expect(purposeFits("SUPPLIER_DECLARATION", doc("NOT_CHECKED"))).toBe(false);
  });
  it("open until renewed; renewed it keeps what it has", () => {
    expect(ownerState("SUPPLIER_DOCUMENT", doc("VERIFIED"))).toEqual({ state: "OPEN" });
    expect(ownerState("SUPPLIER_DOCUMENT", doc("VERIFIED", true))).toEqual({ state: "FROZEN", exit: "DOCUMENT_RENEWED" });
    expect(EXIT_TEXT.DOCUMENT_RENEWED).toMatch(/renewal/);
  });
  it("a verified document stands on its last live scan; an unchecked one does not", () => {
    expect(reliedOn("SUPPLIER_DOCUMENT", doc("VERIFIED"), 1)).toBe("DOCUMENT_VERIFIED_ON_IT");
    expect(reliedOn("SUPPLIER_DOCUMENT", doc("VERIFIED"), 2)).toBeNull();
    expect(reliedOn("SUPPLIER_DOCUMENT", doc("NOT_CHECKED"), 1)).toBeNull();
    const f = detachFault({ purpose: "SUPPLIER_DOCUMENT", owner: doc("VERIFIED"), reason: "wrong file", reliedOn: "DOCUMENT_VERIFIED_ON_IT" });
    expect(f.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(f[0])).toMatch(/verified on this scan/);
  });
  it("links to the supplier's Documents tab", () => {
    expect(ownerHref("supplierDocument", "d1", "s1")).toBe("/suppliers/s1?tab=documents");
  });
});

describe("a supplier's application as an owner", () => {
  it("open while received or awaiting resubmission; decided or lapsed it keeps what it has", () => {
    expect(ownerState("SUPPLIER_DECLARATION", app("RECEIVED"))).toEqual({ state: "OPEN" });
    expect(ownerState("SUPPLIER_DECLARATION", app("RESUBMISSION_REQUESTED"))).toEqual({ state: "OPEN" });
    expect(ownerState("SUPPLIER_EPAYMENT_FORM", app("APPROVED"))).toEqual({ state: "FROZEN", exit: "APPLICATION_DECIDED" });
    expect(ownerState("SUPPLIER_DECLARATION", app("RESUBMISSION_REQUESTED", [], true))).toEqual({ state: "FROZEN", exit: "APPLICATION_DECIDED" });
  });
  it("sent for decision, it stands on its signed declaration; a refused route alone does not count as sent", () => {
    expect(reliedOn("SUPPLIER_DECLARATION", app("RECEIVED", ["PENDING"]), 1)).toBe("SENT_ON_IT");
    expect(reliedOn("SUPPLIER_DECLARATION", app("RECEIVED", ["REJECTED"]), 1)).toBeNull();
    expect(reliedOn("SUPPLIER_EPAYMENT_FORM", app("RECEIVED", ["PENDING"]), 1)).toBeNull();
  });
  it("links to the supplier's Applications tab", () => {
    expect(ownerHref("supplierApplication", "a1", "s1")).toBe("/suppliers/s1?tab=applications");
  });
});
