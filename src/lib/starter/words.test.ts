import { describe, expect, it } from "vitest";

import { inWords } from "./words";

describe("the audit words for a value the pack writes", () => {
  it("writes a payment route in its own words, keeping the 'and'", () => {
    expect(inWords("paymentRoute", "DELIVERY_ORDER_INVOICE")).toBe("Delivery order and invoice");
    expect(inWords("paymentRoute", "CERTIFIED_CLAIM")).toBe("Certified claim");
  });

  it("still writes any other code in plain words, and leaves names and non-codes alone", () => {
    expect(inWords("deliverable", "BILL_OF_QUANTITIES")).toBe("Bill of quantities");
    expect(inWords("nameEn", "BILL_OF_QUANTITIES")).toBe("BILL_OF_QUANTITIES");
    expect(inWords("paymentRoute", null)).toBeNull();
    expect(inWords("paymentRoute", "SOMETHING_ELSE")).toBe("Something else");
  });
});
