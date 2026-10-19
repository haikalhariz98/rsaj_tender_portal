import { describe, expect, it } from "vitest";

import type { ScanResult } from "@/lib/documents/store/types";
import { MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE } from "@/lib/portal/bids/limits";

import { partPreBodyFaults, partUploadFaults, storedScan, uploadGateFaults } from "./parts";
import type { BidPartRule } from "./types";
import { PART_UPLOAD_FAULT_WORDS, UPLOAD_BUSY_WORDS } from "./words";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

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
      for (const text of [w.en]) {
        expect(text.length, k).toBeGreaterThan(10);
        expect(text, k).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      }
    }
    expect(UPLOAD_BUSY_WORDS.en).toMatch(/Try again/);
    expect(UPLOAD_BUSY_WORDS.en).toMatch(/submitted decides whether it is late/);
  });
});

describe("the upload's own guards, before the body is read (step 9)", () => {
  const open = { channel: "ONLINE" as const, online: { allowed: true, demonstration: false, fault: null }, published: true, cancelled: false, keyLive: true, fingerprintMatches: true, saleStands: true, invitedPath: false, onInviteeList: false, mainOpeningStartedAt: null as Date | null };
  it("passes an open exercise", () => expect(uploadGateFaults(open)).toEqual([]));
  it("a paper exercise answers only that", () => expect(uploadGateFaults({ ...open, channel: "PAPER", keyLive: false })).toEqual(["CHANNEL_NOT_ONLINE"]));
  it("names each door", () => {
    expect(uploadGateFaults({ ...open, online: { allowed: false, demonstration: false, fault: "ONLINE_NOT_ALLOWED" } })).toEqual(["ONLINE_NOT_ALLOWED"]);
    expect(uploadGateFaults({ ...open, published: false })).toEqual(["NOT_PUBLISHED"]);
    expect(uploadGateFaults({ ...open, cancelled: true })).toEqual(["NOT_PUBLISHED"]);
    expect(uploadGateFaults({ ...open, keyLive: false })).toEqual(["KEY_NOT_LIVE"]);
    expect(uploadGateFaults({ ...open, fingerprintMatches: false })).toEqual(["FINGERPRINT_MISMATCH"]);
    expect(uploadGateFaults({ ...open, saleStands: false })).toEqual(["NO_LIVE_SALE"]);
    expect(uploadGateFaults({ ...open, invitedPath: true, onInviteeList: false })).toEqual(["NOT_ON_INVITEE_LIST"]);
    expect(uploadGateFaults({ ...open, mainOpeningStartedAt: new Date() })).toEqual(["LATE_CLOSED"]);
  });
});

describe("what a part says before its body is read (step 9)", () => {
  const cap = (over: Partial<Parameters<typeof partPreBodyFaults>[0]> = {}) => partPreBodyFaults({ rule, storeCap: BigInt(5000), draftFilesBySupplier: 0, ...over });
  it("the largest body is the smaller of the part's and the deployment's", () => {
    expect(cap()).toEqual({ faults: [], cap: BigInt(1000) });
    expect(cap({ storeCap: BigInt(300) }).cap).toBe(BigInt(300));
  });
  it("names what is missing", () => {
    expect(cap({ rule: null }).faults).toEqual(["PART_UNKNOWN"]);
    expect(cap({ storeCap: null })).toEqual({ faults: ["SIZE_NOT_SET"], cap: null });
    expect(cap({ rule: { ...rule, acceptedMediaTypes: [] } }).faults).toEqual(["TYPES_NOT_SET"]);
    expect(cap({ rule: { ...rule, returnedByBidder: false } }).faults).toEqual(["PART_NOT_RETURNED"]);
    expect(cap({ draftFilesBySupplier: MAX_DRAFT_FILES_PER_SUPPLIER_PER_EXERCISE }).faults).toEqual(["TOO_MANY_DRAFT_FILES"]);
  });
});
