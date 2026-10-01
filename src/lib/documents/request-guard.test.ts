import { describe, expect, it } from "vitest";

import { UPLOAD_HEADER_VALUE, uploadRequestFault, type UploadRequestFacts } from "./request-guard";

const ok: UploadRequestFacts = { secFetchSite: "same-origin", origin: "http://localhost:3000", host: "localhost:3000", uploadHeader: UPLOAD_HEADER_VALUE };

describe("who may upload (audit M-3)", () => {
  it("a same-origin request with the upload header passes", () => {
    expect(uploadRequestFault(ok)).toBeNull();
  });
  it("any other Sec-Fetch-Site is refused, whatever the Origin says", () => {
    for (const site of ["cross-site", "same-site", "none", "bogus"]) {
      expect(uploadRequestFault({ ...ok, secFetchSite: site }), site).toBe("NOT_SAME_ORIGIN");
    }
  });
  it("without Sec-Fetch-Site the Origin must name the request's own host", () => {
    expect(uploadRequestFault({ ...ok, secFetchSite: null })).toBeNull();
    expect(uploadRequestFault({ ...ok, secFetchSite: null, origin: "https://LOCALHOST:3000" })).toBeNull();
    expect(uploadRequestFault({ ...ok, secFetchSite: null, origin: "https://evil.example" })).toBe("NOT_SAME_ORIGIN");
    expect(uploadRequestFault({ ...ok, secFetchSite: null, origin: "http://localhost:3001" })).toBe("NOT_SAME_ORIGIN");
    expect(uploadRequestFault({ ...ok, secFetchSite: null, origin: "http://localhost:3000.evil.example" })).toBe("NOT_SAME_ORIGIN");
  });
  it("an absent, null or malformed Origin is not a match", () => {
    for (const origin of [null, "", "null", "not a url", "file://localhost:3000"]) {
      expect(uploadRequestFault({ ...ok, secFetchSite: null, origin }), String(origin)).toBe("NOT_SAME_ORIGIN");
    }
    expect(uploadRequestFault({ ...ok, secFetchSite: null, host: null })).toBe("NOT_SAME_ORIGIN");
  });
  it("the custom header is required even from the same origin", () => {
    expect(uploadRequestFault({ ...ok, uploadHeader: null })).toBe("UPLOAD_HEADER_MISSING");
    expect(uploadRequestFault({ ...ok, uploadHeader: "0" })).toBe("UPLOAD_HEADER_MISSING");
    expect(uploadRequestFault({ ...ok, secFetchSite: null, uploadHeader: "" })).toBe("UPLOAD_HEADER_MISSING");
  });
  it("a cross-site request is refused as such even when it also lacks the header", () => {
    expect(uploadRequestFault({ ...ok, secFetchSite: "cross-site", uploadHeader: null })).toBe("NOT_SAME_ORIGIN");
  });
});
