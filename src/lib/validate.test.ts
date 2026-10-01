import { describe, expect, it } from "vitest";

import { checkPeriod, FormReader } from "./validate";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new FormReader(fd);
};

describe("required fields", () => {
  it("reports every fault in one pass rather than stopping at the first", () => {
    const r = form({});
    r.text("a", "Name", { required: true });
    r.text("b", "Label", { required: true });
    r.int("c", "Order", { required: true });
    expect(Object.keys(r.errors)).toEqual(["a", "b", "c"]);
  });

  it("treats whitespace as absent", () => {
    const r = form({ name: "   " });
    r.text("name", "Name", { required: true });
    expect(r.errors.name).toMatch(/required/);
  });

  it("supplies no default for a missing value", () => {
    const r = form({});
    expect(r.int("n", "Number")).toBe(null);
    expect(r.money("m", "Amount")).toBe(null);
    expect(r.date("d", "Date")).toBe(null);
    expect(r.choice("c", "Choice", ["x", "y"])).toBe(null);
  });
});

describe("dates", () => {
  it("reads a real day as midnight UTC of that day", () => {
    expect(form({ d: "2028-02-29" }).date("d", "Date")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("refuses an impossible day rather than rolling it into the next month", () => {
    for (const bad of ["2026-11-31", "2026-02-30", "2026-02-29", "2026-13-01", "29/10/2026"]) {
      const r = form({ d: bad });
      expect(r.date("d", "Date"), bad).toBe(null);
      expect(r.errors.d, bad).toBe("Date is not a date.");
    }
  });
});

describe("codes", () => {
  it("accepts letters, numbers, hyphen and underscore", () => {
    const r = form({ code: "open_tender-2" });
    expect(r.code("code", "Code")).toBe("open_tender-2");
    expect(r.failed).toBe(false);
  });

  it("rejects spaces and punctuation", () => {
    for (const bad of ["open tender", "a.b", "a/b", "-leading"]) {
      const r = form({ code: bad });
      r.code("code", "Code");
      expect(r.failed).toBe(true);
    }
  });

  it("rejects a code already in use, whatever its case", () => {
    const r = form({ code: "Direct" });
    r.code("code", "Code", { taken: ["direct", "open"] });
    expect(r.errors.code).toMatch(/already in use/);
  });

  it("allows a code that is merely similar", () => {
    const r = form({ code: "direct2" });
    r.code("code", "Code", { taken: ["direct"] });
    expect(r.failed).toBe(false);
  });
});

describe("money", () => {
  it("keeps the value as a string so no sen is lost", () => {
    expect(form({ v: "12345678901234.56" }).money("v", "Value")).toBe("12345678901234.56");
  });

  it("accepts thousands separators", () => {
    expect(form({ v: "1,250,000.00" }).money("v", "Value")).toBe("1250000.00");
  });

  it("rejects more than two decimal places", () => {
    const r = form({ v: "10.005" });
    r.money("v", "Value");
    expect(r.failed).toBe(true);
  });

  it("rejects a negative amount and anything not a number", () => {
    for (const bad of ["-5", "abc", "1.2.3"]) {
      const r = form({ v: bad });
      r.money("v", "Value");
      expect(r.failed).toBe(true);
    }
  });

  it("an amount must fit a Decimal(18, 2) column: 16 digits before the point, not 17", () => {
    expect(form({ v: "9999999999999999.99" }).money("v", "Value")).toBe("9999999999999999.99");
    expect(form({ v: "9,999,999,999,999,999.99" }).money("v", "Value")).toBe("9999999999999999.99");
    const r = form({ v: "10000000000000000" });
    expect(r.money("v", "Value")).toBeNull();
    expect(r.errors.v).toBe("Value is too large to record: at most 16 digits before the decimal point.");
    expect(form({ v: "0000000000000000001.00" }).money("v", "Value")).toBe("0000000000000000001.00");
  });

  it("accepts zero, which is a real amount", () => {
    const r = form({ v: "0" });
    expect(r.money("v", "Value")).toBe("0");
    expect(r.failed).toBe(false);
  });
});

describe("whole numbers", () => {
  it("rejects a fraction where a count is wanted", () => {
    const r = form({ n: "2.5" });
    r.int("n", "Quorum");
    expect(r.errors.n).toMatch(/whole number/);
  });

  it("enforces a floor", () => {
    const r = form({ n: "-1" });
    r.int("n", "Quorum", { min: 0 });
    expect(r.failed).toBe(true);
  });

  it("accepts zero when zero is allowed", () => {
    const r = form({ n: "0" });
    expect(r.int("n", "Order", { min: 0 })).toBe(0);
  });
});

describe("choices", () => {
  it("refuses a value outside the offered options", () => {
    const r = form({ c: "SOMETHING_ELSE" });
    r.choice("c", "Provenance", ["STATED", "OBSERVED", "ASSUMED"]);
    expect(r.failed).toBe(true);
  });
});

describe("checkboxes", () => {
  it("reads an absent checkbox as false rather than as missing", () => {
    const r = form({});
    expect(r.bool("flag")).toBe(false);
    expect(r.failed).toBe(false);
  });

  it("reads a present checkbox as true", () => {
    expect(form({ flag: "on" }).bool("flag")).toBe(true);
  });
});

describe("effective periods", () => {
  it("rejects an end on or before the start", () => {
    const r = form({});
    checkPeriod(r, new Date("2026-01-01"), new Date("2026-01-01"));
    expect(r.errors.effectiveTo).toBeTruthy();
  });

  it("accepts an open-ended period", () => {
    const r = form({});
    checkPeriod(r, new Date("2026-01-01"), null);
    expect(r.failed).toBe(false);
  });

  it("accepts an end after the start", () => {
    const r = form({});
    checkPeriod(r, new Date("2026-01-01"), new Date("2026-01-02"));
    expect(r.failed).toBe(false);
  });
});

describe("the parsed result", () => {
  it("carries the value when nothing failed", () => {
    const r = form({ name: "Works" });
    const name = r.text("name", "Name", { required: true });
    expect(r.finish({ name })).toEqual({ ok: true, value: { name: "Works" } });
  });

  it("carries the errors instead when something did", () => {
    const r = form({});
    r.text("name", "Name", { required: true });
    const out = r.finish({ name: "" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.name).toMatch(/required/);
  });
});
