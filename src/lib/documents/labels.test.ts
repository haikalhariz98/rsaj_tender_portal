import { describe, expect, it } from "vitest";

import { versionCreated, attached, policyView } from "./audit-view";
import { accessReasonText, CLASSIFICATION_LABEL, documentFaultText, WITHDRAW_NOTE, formatBytes, mediaLabel, PURPOSE_LABEL, shortFingerprint, STATUS_LABEL } from "./labels";
import { bytesToMegabytes, megabytesToBytes, policyFaults } from "./policy";
import { ATTACHMENT_PURPOSES, KNOWN_MEDIA_TYPES, SECURITY_CLASSES } from "./types";

// Every code the document store's rules, store and handlers return has its own words.
const CODES = [
  "TYPES_NOT_SET", "TYPE_NOT_RECOGNISED", "ARCHIVE_NOT_ACCEPTED", "MARKUP_NEVER_ACCEPTED", "TYPE_NOT_ALLOWED", "NAME_WITHOUT_TYPE", "DECLARED_TYPE_MISMATCH",
  "SIZE_NOT_SET", "CEILING_NOT_SET", "CEILING_INVALID", "EMPTY", "TOO_LARGE", "LENGTH_INVALID",
  "IDENTICAL_TO_VERSION_N", "DOCUMENT_WITHDRAWN", "ALREADY_WITHDRAWN", "RECEIVED_ON_INVALID", "TIME_ZONE_UNSET", "RECEIVED_ON_FUTURE",
  "PURPOSE_NOT_FOR_OWNER", "OWNER_NOT_READY", "OWNER_FROZEN", "VERSION_WITHDRAWN", "CLASS_NOT_SET", "CLASSES_NOT_CONFIGURED", "CLASS_UNKNOWN", "CLASSIFICATION_NOT_SET", "ALREADY_ATTACHED",
  "RELIED_ON", "ALREADY_DETACHED", "NOT_SAME_DOCUMENT", "ALREADY_PINNED",
  "UNCHANGED", "CANNOT_UNSET", "DOWNGRADE_FROM_SULIT", "ALREADY_ON_HOLD", "NOT_ON_HOLD",
  "RETENTION_NOT_SET", "TRIGGER_NOT_REACHED", "RETENTION_RUNNING", "ON_LEGAL_HOLD", "OBLIGATION_OUTSTANDING", "DISPOSAL_METHOD_NOT_SET", "DISPOSAL_AUTHORITY_NOT_SET",
  "TYPE_NOT_RECOGNISABLE", "SIZE_INVALID",
  "NO_ORGANISATION", "NO_FILE", "TITLE_REQUIRED", "PERSON_REQUIRED", "PERSON_UNKNOWN", "DOCUMENT_UNKNOWN", "VERSION_UNKNOWN", "REQUEST_UNREADABLE", "NAME_TOO_LONG", "NOT_SAME_ORIGIN", "UPLOAD_HEADER_MISSING", "DRIVER_UNKNOWN", "DRIVER_NOT_BUILT", "REASON_REQUIRED",
];

describe("document store words", () => {
  it("every code has its own text, and none shows a code", () => {
    const fallback = documentFaultText({ code: "__none__", level: "block" });
    for (const code of CODES) {
      const t = documentFaultText({ code, level: "block", data: { sniffed: "application/pdf", declared: "image/png", cap: "1048576", n: 2, exit: "MINUTE_FIRST", by: "ACCEPTED_ON_IT", purpose: "SIGNED_MINUTES", obligation: "The bond", until: "2027-01-01", filename: "x" } });
      expect(t, code).not.toBe(fallback);
      // Environment variable names are allowed: whoever runs the portal sets them by name.
      expect(t.replace(/DOCUMENT_MAX_BYTES|DOCUMENT_STORE_DRIVER/g, ""), code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("every purpose, classification and known type has a label", () => {
    for (const p of ATTACHMENT_PURPOSES) expect(PURPOSE_LABEL[p]).toBeTruthy();
    for (const c of SECURITY_CLASSES) expect(CLASSIFICATION_LABEL[c]).toBeTruthy();
    for (const t of KNOWN_MEDIA_TYPES) expect(mediaLabel(t)).not.toMatch(/\//);
    expect(STATUS_LABEL.STAGED).toBe("Received, not filed");
  });
  it("sizes and fingerprints read as people read them", () => {
    expect(formatBytes(512n)).toBe("512 bytes");
    expect(formatBytes(20n * 1024n * 1024n)).toBe("20 MB");
    expect(formatBytes(1536n)).toBe("1.5 KB");
    expect(shortFingerprint("0123456789abcdef".repeat(4))).toBe("01234567…cdef");
  });
  it("the trail records labels and the fingerprint, never codes or bytes", () => {
    const v = versionCreated({ versionNo: 1, sha256: "a".repeat(64), byteSize: 2048n, mediaType: "application/pdf", originalFilename: "m.pdf", receivedOn: "2026-09-30", recordedBy: "Aminah", note: "" });
    expect(v.find((c) => c.field === "type")?.after).toBe("PDF");
    expect(v.find((c) => c.field === "recordedBy")?.after).toBe("Aminah (recorded on behalf of, not signed)");
    const a = attached({ purpose: "SIGNED_MINUTES", title: "Minutes", versionNo: 1, sha256: "a".repeat(64), owner: "TB 3/2026" });
    expect(a.find((c) => c.field === "purpose")?.after).toBe("Signed minutes");
    expect(policyView(null)).toMatchObject({ allowedTypes: "Not set", largestFile: "Not set" });
  });
});

describe("saving the upload rules", () => {
  it("only recognisable types, and a whole size above zero; unset is allowed", () => {
    expect(policyFaults({ allowedMediaTypes: ["application/pdf"], maxBytes: "20971520" })).toEqual([]);
    expect(policyFaults({ allowedMediaTypes: [], maxBytes: null })).toEqual([]);
    expect(policyFaults({ allowedMediaTypes: ["text/html"], maxBytes: "0" }).map((f) => f.code)).toEqual(["TYPE_NOT_RECOGNISABLE", "SIZE_INVALID"]);
  });
  it("megabytes as typed become bytes exactly", () => {
    expect(megabytesToBytes("20")).toBe(20n * 1024n * 1024n);
    expect(megabytesToBytes("0.5")).toBe(524288n);
    expect(megabytesToBytes("0")).toBeNull();
    expect(megabytesToBytes("abc")).toBeNull();
  });
});

describe("the access log never shows a code", () => {
  it("reads every reason the routes log as words, and nothing for a plain download", () => {
    expect(accessReasonText("")).toBeNull();
    for (const code of ["SULIT", "UNCLASSIFIED", "THREAT", "DIGEST_MISMATCH", "BYTES_MISSING", "TOO_LARGE", "TYPE_NOT_ALLOWED", "TYPES_NOT_SET", "DRIVER_NOT_BUILT"]) {
      const t = accessReasonText(code)!;
      expect(t, code).not.toBe("This was refused.");
      expect(t.replace(/DOCUMENT_MAX_BYTES|DOCUMENT_STORE_DRIVER/g, ""), code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("the withdraw note says withdrawal does not stop downloads and names the way to", () => {
    expect(WITHDRAW_NOTE).toMatch(/does NOT stop/);
    expect(WITHDRAW_NOTE).toMatch(/SULIT/);
  });
});

describe("megabytes on the upload rules form", () => {
  it("reads 1 MB as 1,048,576 bytes both ways", () => {
    expect(bytesToMegabytes(20971520n)).toBe("20");
    expect(bytesToMegabytes(1572864n)).toBe("1.5");
    expect(bytesToMegabytes(megabytesToBytes("0.25")!)).toBe("0.25");
    expect(megabytesToBytes(bytesToMegabytes(20971520n))).toBe(20971520n);
  });
});
