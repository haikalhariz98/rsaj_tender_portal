import { describe, expect, it } from "vitest";

import { sha256Hex } from "./digest";
import { blobStore, deploymentCeiling, malwareScanner, orphanDigests } from "./index";
import { BlobAddressError, postgresBlobStore } from "./postgres";
import { driverFrom } from "./select";

describe("the storage façade (INT-13, OD-1)", () => {
  it("defaults to the Postgres driver, which writes inside the caller's transaction", () => {
    expect(driverFrom({})).toEqual({ driver: "postgres" });
    expect(driverFrom({ DOCUMENT_STORE_DRIVER: " Postgres " })).toEqual({ driver: "postgres" });
    const s = blobStore({});
    expect("store" in s && s.store.driver).toBe("postgres");
    expect("store" in s && s.store.transactional).toBe(true);
  });
  it("a driver not built yet, or not known, is refused naming the variable — never a silent fallback", () => {
    expect(blobStore({ DOCUMENT_STORE_DRIVER: "filesystem" })).toEqual({ fault: "DRIVER_NOT_BUILT" });
    expect(blobStore({ DOCUMENT_STORE_DRIVER: "s3" })).toEqual({ fault: "DRIVER_UNKNOWN" });
  });
  it("the deployment ceiling is read from DOCUMENT_MAX_BYTES; unset refuses", () => {
    expect(deploymentCeiling({ DOCUMENT_MAX_BYTES: "52428800" })).toEqual({ ceiling: 52428800n });
    expect(deploymentCeiling({})).toEqual({ fault: "CEILING_NOT_SET" });
  });
  it("the scanner ships unconfigured: everything is NOT_SCANNED", async () => {
    const s = malwareScanner();
    expect(s.configured).toBe(false);
    expect(await s.scan(new Uint8Array([1, 2, 3]))).toBe("NOT_SCANNED");
  });
});

describe("content addressing", () => {
  it("the fingerprint is SHA-256 in lowercase hex", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("bytes are refused at an address they do not hash to, before anything is written", async () => {
    const tx = { $executeRaw: () => { throw new Error("must not be reached"); } } as never;
    await expect(postgresBlobStore.put(tx, "org", "0".repeat(64), new Uint8Array([1]))).rejects.toBeInstanceOf(BlobAddressError);
  });
  it("orphans are the stored digests no version references", () => {
    expect(orphanDigests(["a", "b", "c"], new Set(["b"]))).toEqual(["a", "c"]);
  });
});
