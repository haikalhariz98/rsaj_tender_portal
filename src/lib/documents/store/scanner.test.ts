import { describe, expect, it } from "vitest";

import { NotConfiguredScanner, runScan } from "./scanner";
import type { MalwareScanner, ScanResult } from "./types";

const bytes = new Uint8Array([1, 2, 3]);
const configured = (scan: MalwareScanner["scan"]): MalwareScanner => ({ configured: true, scan });

describe("runScan (M3, 20o): a failing scanner is ERROR, never NOT_SCANNED", () => {
  it("reads NOT_SCANNED only for a scanner that is not configured", async () => {
    expect(await runScan(NotConfiguredScanner, bytes)).toBe("NOT_SCANNED");
  });
  it("passes through each result a configured scanner gives", async () => {
    for (const r of ["CLEAN", "THREAT", "ERROR", "NOT_SCANNED"] as ScanResult[]) expect(await runScan(configured(async () => r), bytes)).toBe(r);
  });
  it("turns a throw, a rejection and an unknown answer into ERROR", async () => {
    expect(await runScan(configured(() => { throw new Error("down"); }), bytes)).toBe("ERROR");
    expect(await runScan(configured(async () => { throw new Error("down"); }), bytes)).toBe("ERROR");
    expect(await runScan(configured(async () => "OK" as unknown as ScanResult), bytes)).toBe("ERROR");
  });
});
