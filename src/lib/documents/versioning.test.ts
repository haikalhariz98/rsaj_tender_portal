import { describe, expect, it } from "vitest";

import { documentFaultText } from "./labels";
import { receivedOnFault } from "./received";
import { currentVersion, heldByProjectFile, nextVersionFault, nextVersionNo, withdrawFault } from "./versioning";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const when = new Date("2026-09-01T00:00:00Z");

describe("versions are immutable: a correction is a new version", () => {
  it("an identical re-upload is refused, naming the version it matches", () => {
    const f = nextVersionFault([{ versionNo: 1, sha256: A, withdrawnAt: null }, { versionNo: 2, sha256: B, withdrawnAt: null }], A);
    expect(f).toEqual({ code: "IDENTICAL_TO_VERSION_N", level: "block", data: { n: 1 } });
    expect(documentFaultText(f!)).toBe("This file is identical to version 1. Nothing was added.");
  });
  it("identical to a withdrawn version is refused too: the bytes are already held", () => {
    expect(nextVersionFault([{ versionNo: 1, sha256: A, withdrawnAt: when }, { versionNo: 2, sha256: B, withdrawnAt: null }], A)?.code).toBe("IDENTICAL_TO_VERSION_N");
  });
  it("new bytes are the next version; a document every version of which is withdrawn takes no more", () => {
    expect(nextVersionFault([{ versionNo: 1, sha256: A, withdrawnAt: when }, { versionNo: 2, sha256: B, withdrawnAt: null }], C)).toBeNull();
    expect(nextVersionFault([{ versionNo: 1, sha256: A, withdrawnAt: when }], C)?.code).toBe("DOCUMENT_WITHDRAWN");
    expect(nextVersionFault([], C)).toBeNull();
    expect(nextVersionNo([{ versionNo: 1 }, { versionNo: 3 }])).toBe(4);
    expect(nextVersionNo([])).toBe(1);
  });
  it("the version a reader sees first is the latest that stands", () => {
    expect(currentVersion([{ versionNo: 1, withdrawnAt: null }, { versionNo: 2, withdrawnAt: when }])?.versionNo).toBe(1);
    expect(currentVersion([{ versionNo: 1, withdrawnAt: when }, { versionNo: 2, withdrawnAt: null }])?.versionNo).toBe(2);
    expect(currentVersion([{ versionNo: 1, withdrawnAt: when }])?.versionNo).toBe(1);
  });
  it("a withdrawal is once, with a reason", () => {
    const loose = { heldByProjectFile: false };
    expect(withdrawFault({ withdrawnAt: null }, "  ", loose)?.code).toBe("REASON_REQUIRED");
    expect(withdrawFault({ withdrawnAt: when }, "Wrong scan", loose)?.code).toBe("ALREADY_WITHDRAWN");
    expect(withdrawFault({ withdrawnAt: null }, "Wrong scan", loose)).toBeNull();
  });
  it("a project file is kept (PW-33): a version held by a live project attachment is never withdrawn, whatever the reason; once withdrawn says so first", () => {
    const kept = { heldByProjectFile: true };
    expect(withdrawFault({ withdrawnAt: null }, "Personal data uploaded by mistake", kept)?.code).toBe("PROJECT_FILE_KEPT");
    expect(withdrawFault({ withdrawnAt: null }, "  ", kept)?.code).toBe("PROJECT_FILE_KEPT");
    expect(withdrawFault({ withdrawnAt: when }, "Wrong scan", kept)?.code).toBe("ALREADY_WITHDRAWN");
    expect(documentFaultText(withdrawFault({ withdrawnAt: null }, "x", kept)!)).toBe("A project file is kept. Send a new version instead.");
  });
  it("only a live project pin holds a version: a detached one, or another purpose, holds nothing", () => {
    expect(heldByProjectFile([{ purpose: "PROJECT_DOCUMENT_FILE", detachedAt: null }])).toBe(true);
    expect(heldByProjectFile([{ purpose: "PROJECT_DOCUMENT_FILE", detachedAt: when }])).toBe(false);
    expect(heldByProjectFile([{ purpose: "PROGRAMME", detachedAt: null }, { purpose: "AS_BUILT", detachedAt: null }])).toBe(false);
    expect(heldByProjectFile([])).toBe(false);
  });
});

describe("the paper's received day (NFR-AUD-005)", () => {
  it("a received day in the future is refused", () => {
    expect(receivedOnFault("2026-10-02", "2026-10-01")).toMatchObject({ code: "RECEIVED_ON_FUTURE" });
  });
  it("today and earlier pass; a blank day is not asked for", () => {
    expect(receivedOnFault("2026-10-01", "2026-10-01")).toBeNull();
    expect(receivedOnFault("2026-09-30", "2026-10-01")).toBeNull();
    expect(receivedOnFault(null, null)).toBeNull();
    expect(receivedOnFault("", null)).toBeNull();
  });
  it("with the time zone unset a typed received day is refused, naming the setting — never judged in UTC", () => {
    const f = receivedOnFault("2026-09-30", null);
    expect(f?.code).toBe("TIME_ZONE_UNSET");
    expect(documentFaultText(f!)).toMatch(/Configuration, Organisation/);
    expect(documentFaultText(f!)).toMatch(/Time zone not set/);
  });
  it("a day that is not a date is refused", () => {
    expect(receivedOnFault("2026-02-30", "2026-10-01")?.code).toBe("RECEIVED_ON_INVALID");
    expect(receivedOnFault("30/09/2026", "2026-10-01")?.code).toBe("RECEIVED_ON_INVALID");
  });
});
