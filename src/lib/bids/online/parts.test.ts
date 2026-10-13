import { describe, expect, it } from "vitest";

import type { ScanResult } from "@/lib/documents/store/types";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import { partUploadFaults, storedScan } from "./parts";
import type { BidPartRule } from "./types";
import { PART_UPLOAD_FAULT_WORDS, UPLOAD_BUSY_WORDS } from "./words";

const HASH = "a".repeat(64);
const PDF = "application/pdf";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const rule: BidPartRule = { packPartId: "summary", label: "Grand Summary", mandatory: true, returnedByBidder: true, acceptedMediaTypes: [PDF, XLSX], maxBytes: "1000", openingCheck: true };
const base = { rule: rule as BidPartRule | null, sniffed: PDF as Parameters<typeof partUploadFaults>[0]["sniffed"], office: null as Parameters<typeof partUploadFaults>[0]["office"], size: BigInt(500), storeCap: BigInt(5000) as bigint | null, browserSha256: HASH, serverSha256: HASH, scan: "CLEAN" as ScanResult, mode: "LIVE" as "LIVE" | "DEMONSTRATION", scannerConfigured: true, draftFilesBySupplier: 0 };
const faults = (over: Partial<typeof base>) => partUploadFaults({ ...base, ...over });

describe("a stored file's scan (D6, 20o, M3)", () => {
  it("THREAT and ERROR are refused in both modes", () => {
    for (const mode of ["LIVE", "DEMONSTRATION"] as const) for (const configured of [true, false]) {
      expect(storedScan("THREAT", mode, configured)).toBeNull();
      expect(storedScan("ERROR", mode, configured)).toBeNull();
    }
  });
  it("NOT_SCANNED is stored only under DEMONSTRATION with no scanner configured; under LIVE it is refused", () => {
    expect(storedScan("NOT_SCANNED", "DEMONSTRATION", false)).toBe("NOT_SCANNED");
    expect(storedScan("NOT_SCANNED", "DEMONSTRATION", true)).toBeNull();
    expect(storedScan("NOT_SCANNED", "LIVE", false)).toBeNull();
    expect(storedScan("NOT_SCANNED", "LIVE", true)).toBeNull();
  });
  it("CLEAN is stored as CLEAN", () => {
    expect(storedScan("CLEAN", "LIVE", true)).toBe("CLEAN");
    expect(storedScan("CLEAN", "DEMONSTRATION", true)).toBe("CLEAN");
  });
});

describe("a part's upload (D6, ruling 19)", () => {
  it("is taken when every rule holds", () => expect(faults({})).toEqual([]));

  it("an unknown part, a part not returned, and a rule with its types or size unset are refused", () => {
    expect(faults({ rule: null })).toEqual(["PART_UNKNOWN"]);
    expect(faults({ rule: { ...rule, returnedByBidder: false } })).toEqual(["PART_NOT_RETURNED"]);
    expect(faults({ rule: { ...rule, acceptedMediaTypes: [] } })).toEqual(["TYPES_NOT_SET"]);
    expect(faults({ rule: { ...rule, maxBytes: "" } })).toEqual(["SIZE_NOT_SET"]);
    expect(faults({ storeCap: null })).toEqual(["SIZE_NOT_SET"]);
  });

  it("the size is held to the smaller of the part's limit and the deployment's ceiling; empty is refused", () => {
    expect(faults({ size: BigInt(1000) })).toEqual([]);
    expect(faults({ size: BigInt(1001) })).toEqual(["TOO_LARGE"]);
    expect(faults({ size: BigInt(900), storeCap: BigInt(800) })).toEqual(["TOO_LARGE"]);
    expect(faults({ size: BigInt(0) })).toEqual(["EMPTY"]);
  });

  it("the type is the bytes', checked against the part's list; markup and a bare archive are never taken; a refused Office file is named", () => {
    expect(faults({ sniffed: "image/png" })).toEqual(["TYPE_NOT_ACCEPTED"]);
    expect(faults({ sniffed: null })).toEqual(["TYPE_NOT_ACCEPTED"]);
    expect(faults({ sniffed: "text/html", rule: { ...rule, acceptedMediaTypes: ["text/html"] } })).toEqual(["TYPE_NOT_ACCEPTED"]);
    expect(faults({ sniffed: "application/zip", office: { type: XLSX } })).toEqual([]);
    expect(faults({ sniffed: "application/zip", office: null, rule: { ...rule, acceptedMediaTypes: ["application/zip"] } })).toEqual(["TYPE_NOT_ACCEPTED"]);
    expect(faults({ sniffed: "application/zip", office: { refused: "MACRO" } })).toEqual(["OFFICE_REFUSED"]);
  });

  it("the bytes read are the bytes the browser hashed", () => {
    expect(faults({ browserSha256: "b".repeat(64) })).toEqual(["HASH_MISMATCH"]);
    expect(faults({ browserSha256: HASH.toUpperCase(), serverSha256: HASH })).toEqual(["HASH_MISMATCH"]);
    expect(faults({ browserSha256: "" })).toEqual(["HASH_MISMATCH"]);
  });

  it("a scan ERROR is refused under LIVE and under DEMONSTRATION; a THREAT is named as one", () => {
    expect(faults({ scan: "ERROR", mode: "LIVE" })).toEqual(["SCAN_ERROR"]);
    expect(faults({ scan: "ERROR", mode: "DEMONSTRATION" })).toEqual(["SCAN_ERROR"]);
    expect(faults({ scan: "THREAT" })).toEqual(["THREAT"]);
    expect(faults({ scan: "NOT_SCANNED", mode: "LIVE", scannerConfigured: false })).toEqual(["SCAN_ERROR"]);
    expect(faults({ scan: "NOT_SCANNED", mode: "DEMONSTRATION", scannerConfigured: false })).toEqual([]);
  });

  it("the drafts a supplier holds at once are capped per exercise (20e)", () => {
    expect(faults({ draftFilesBySupplier: MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE - 1 })).toEqual([]);
    expect(faults({ draftFilesBySupplier: MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE })).toEqual(["TOO_MANY_DRAFT_FILES"]);
  });

  it("each refusal has words; BUSY says to retry, and that the submission's stamp decides lateness (20e)", () => {
    for (const [k, w] of Object.entries(PART_UPLOAD_FAULT_WORDS)) {
      expect(w.length, k).toBeGreaterThan(10);
      expect(w, k).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
    expect(UPLOAD_BUSY_WORDS).toMatch(/Try again/);
    expect(UPLOAD_BUSY_WORDS).toMatch(/submitted decides whether it is late/);
  });
});
