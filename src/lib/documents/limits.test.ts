import { describe, expect, it } from "vitest";

import { documentFaultText } from "./labels";
import { effectiveCap, MULTIPART_ALLOWANCE_BYTES, parseCeiling, readLimit, requestLengthFault, sizeFault } from "./limits";

const MB = 1024n * 1024n;
const ceiling = parseCeiling(String(50n * MB));

describe("the size cap (OD-3): the smaller of policy and deployment ceiling", () => {
  it("exactly the cap passes; one byte over is refused", () => {
    const policy = { maxBytes: 20n * MB };
    expect(sizeFault(20n * MB, policy, ceiling)).toBeNull();
    const f = sizeFault(20n * MB + 1n, policy, ceiling);
    expect(f).toMatchObject({ code: "TOO_LARGE", data: { cap: String(20n * MB), from: "POLICY" } });
    expect(documentFaultText(f!)).toMatch(/20 MB/);
  });
  it("the deployment ceiling caps a larger policy, and says so", () => {
    const policy = { maxBytes: 100n * MB };
    expect(effectiveCap(policy, ceiling)).toEqual({ cap: 50n * MB, from: "CEILING" });
    expect(sizeFault(50n * MB, policy, ceiling)).toBeNull();
    const f = sizeFault(50n * MB + 1n, policy, ceiling);
    expect(f?.data?.from).toBe("CEILING");
    expect(documentFaultText(f!)).toMatch(/by this deployment/);
  });
  it("an unset policy size refuses everything, naming the setting — never a default", () => {
    const f = sizeFault(1n, { maxBytes: null }, ceiling);
    expect(f?.code).toBe("SIZE_NOT_SET");
    expect(documentFaultText(f!)).toMatch(/Upload rules/);
    expect(sizeFault(1n, { maxBytes: 0n }, ceiling)?.code).toBe("SIZE_NOT_SET");
  });
  it("an unset or malformed deployment ceiling refuses, naming the variable", () => {
    expect(parseCeiling(undefined)).toEqual({ fault: "CEILING_NOT_SET" });
    expect(parseCeiling("  ")).toEqual({ fault: "CEILING_NOT_SET" });
    expect(parseCeiling("20MB")).toEqual({ fault: "CEILING_INVALID" });
    expect(parseCeiling("0")).toEqual({ fault: "CEILING_INVALID" });
    expect(parseCeiling("-5")).toEqual({ fault: "CEILING_INVALID" });
    const f = sizeFault(1n, { maxBytes: MB }, parseCeiling(undefined));
    expect(f?.code).toBe("CEILING_NOT_SET");
    expect(documentFaultText(f!)).toMatch(/DOCUMENT_MAX_BYTES/);
  });
  it("an empty file is refused", () => {
    expect(sizeFault(0n, { maxBytes: MB }, ceiling)?.code).toBe("EMPTY");
  });
});

describe("refusing a request before it is read", () => {
  const cap = 20n * MB;
  it("a declared length over the cap plus the multipart allowance is refused; at it, read", () => {
    expect(requestLengthFault(String(cap + MULTIPART_ALLOWANCE_BYTES), cap)).toBeNull();
    expect(requestLengthFault(String(cap + MULTIPART_ALLOWANCE_BYTES + 1n), cap)).toBe("TOO_LARGE");
    expect(readLimit(cap)).toBe(cap + MULTIPART_ALLOWANCE_BYTES);
  });
  it("no declared length is not refused here: the body is counted as it arrives", () => {
    expect(requestLengthFault(null, cap)).toBeNull();
  });
  it("a declared length that is not a number is refused", () => {
    expect(requestLengthFault("lots", cap)).toBe("LENGTH_INVALID");
    expect(requestLengthFault("-1", cap)).toBe("LENGTH_INVALID");
  });
});
