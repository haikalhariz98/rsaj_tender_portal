import { describe, expect, it } from "vitest";

import { releaseScanRefusal, type ReleaseScanRefusal } from "./release-scan";
import type { ScanResult } from "./store/types";
import type { ScanState } from "./types";

// The full table, written out by hand (plan §3.5): stored × fresh × configured. "serve" is null.
type Row = [stored: ScanState, fresh: ScanResult, configured: boolean, expected: ReleaseScanRefusal | null];
const TABLE: Row[] = [
  // No scanner configured: nothing is checked, so a file not scanned is served; a threat or a failed scan is not.
  ["NOT_SCANNED", "NOT_SCANNED", false, null],
  ["NOT_SCANNED", "CLEAN", false, null],
  ["NOT_SCANNED", "THREAT", false, "THREAT"],
  ["NOT_SCANNED", "ERROR", false, "SCAN_ERROR"],
  ["CLEAN", "NOT_SCANNED", false, null],
  ["CLEAN", "CLEAN", false, null],
  ["CLEAN", "THREAT", false, "THREAT"],
  ["CLEAN", "ERROR", false, "SCAN_ERROR"],
  ["THREAT", "NOT_SCANNED", false, "THREAT"],
  ["THREAT", "CLEAN", false, "THREAT"],
  ["THREAT", "THREAT", false, "THREAT"],
  ["THREAT", "ERROR", false, "THREAT"],
  // A scanner configured: only a fresh CLEAN on a version not stored as a threat is served.
  ["NOT_SCANNED", "NOT_SCANNED", true, "NOT_SCANNED"],
  ["NOT_SCANNED", "CLEAN", true, null],
  ["NOT_SCANNED", "THREAT", true, "THREAT"],
  ["NOT_SCANNED", "ERROR", true, "SCAN_ERROR"],
  ["CLEAN", "NOT_SCANNED", true, "NOT_SCANNED"],
  ["CLEAN", "CLEAN", true, null],
  ["CLEAN", "THREAT", true, "THREAT"],
  ["CLEAN", "ERROR", true, "SCAN_ERROR"],
  ["THREAT", "NOT_SCANNED", true, "THREAT"],
  ["THREAT", "CLEAN", true, "THREAT"],
  ["THREAT", "THREAT", true, "THREAT"],
  ["THREAT", "ERROR", true, "THREAT"],
];

describe("releaseScanRefusal (SEC-5)", () => {
  it("the table covers every stored state, fresh result and scanner setting once", () => {
    expect(TABLE).toHaveLength(3 * 4 * 2);
    expect(new Set(TABLE.map(([s, f, c]) => `${s}|${f}|${c}`)).size).toBe(24);
  });

  it.each(TABLE)("stored %s, fresh %s, configured %s gives %s", (stored, fresh, scannerConfigured, expected) => {
    expect(releaseScanRefusal({ stored, fresh, scannerConfigured })).toBe(expected);
  });

  it("without a scanner, a file not scanned is served, and a threat or a failed scan is refused", () => {
    const served = TABLE.filter(([, , c, e]) => !c && e === null).map(([s, f]) => `${s}|${f}`);
    expect(served.sort()).toEqual(["CLEAN|CLEAN", "CLEAN|NOT_SCANNED", "NOT_SCANNED|CLEAN", "NOT_SCANNED|NOT_SCANNED"]);
    for (const [, f, c, e] of TABLE) if (!c && (f === "THREAT" || f === "ERROR")) expect(e).not.toBeNull();
  });

  it("with a scanner, only a fresh clean scan of a version not stored as a threat is served", () => {
    const served = TABLE.filter(([, , c, e]) => c && e === null).map(([s, f]) => `${s}|${f}`);
    expect(served.sort()).toEqual(["CLEAN|CLEAN", "NOT_SCANNED|CLEAN"]);
  });

  it("a threat outranks a failed scan, and a stored clean does not excuse a fresh scan that did not run", () => {
    expect(releaseScanRefusal({ stored: "THREAT", fresh: "ERROR", scannerConfigured: true })).toBe("THREAT");
    expect(releaseScanRefusal({ stored: "CLEAN", fresh: "NOT_SCANNED", scannerConfigured: true })).toBe("NOT_SCANNED");
  });
});
