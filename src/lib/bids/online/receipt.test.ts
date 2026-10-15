import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { RECEIPT_DIGEST_VERSION, RECEIPT_WORDS, receiptDigest } from "./receipt";

const h = (c: string) => c.repeat(64);
const base = { exerciseId: "cmex0001", submissionNumber: 7, receivedAt: new Date("2026-11-04T03:59:58Z"), keyFingerprint: h("f"), manifestCipherSha256: h("1"), declarationCipherSha256: h("2"), fileCipherSha256s: [h("a"), h("b")] };

describe("the receipt digest (D5, H2)", () => {
  it("is SHA-256, 64 lower-case hex digits, over one versioned encoding a supplier can recompute", () => {
    const d = receiptDigest(base);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    const encoding = JSON.stringify([RECEIPT_DIGEST_VERSION, "cmex0001", 7, "2026-11-04T03:59:58.000Z", h("f"), h("1"), h("2"), [h("a"), h("b")]]);
    expect(d).toBe(createHash("sha256").update(encoding, "utf8").digest("hex"));
  });

  it("does not depend on the order the files were sent in", () => {
    expect(receiptDigest({ ...base, fileCipherSha256s: [h("b"), h("a")] })).toBe(receiptDigest(base));
  });

  it("changes with every field", () => {
    const d = receiptDigest(base);
    for (const over of [{ exerciseId: "cmex0002" }, { submissionNumber: 8 }, { receivedAt: new Date("2026-11-04T03:59:59Z") }, { keyFingerprint: h("e") }, { manifestCipherSha256: h("3") }, { declarationCipherSha256: h("4") }, { fileCipherSha256s: [h("a")] }, { fileCipherSha256s: [h("a"), h("b"), h("c")] }]) {
      expect(receiptDigest({ ...base, ...over }), JSON.stringify(over)).not.toBe(d);
    }
  });

  it("refuses a stamp that is not a whole second, a submission number below 1, and a digest that is not SHA-256 hex", () => {
    expect(() => receiptDigest({ ...base, receivedAt: new Date("2026-11-04T03:59:58.500Z") })).toThrow(/whole second/);
    expect(() => receiptDigest({ ...base, submissionNumber: 0 })).toThrow(/submission number/);
    expect(() => receiptDigest({ ...base, keyFingerprint: "F".repeat(64) })).toThrow(/hex/);
    expect(() => receiptDigest({ ...base, fileCipherSha256s: ["abc"] })).toThrow(/hex/);
  });
});

describe("the receipt's words (20j)", () => {
  it("say it records what the portal told the supplier, and never call it signed or proof", () => {
    // Ruling 20ab: in English and Malay; neither language calls it signed, proof or verified.
    expect(RECEIPT_WORDS.title).toEqual({ en: "Your receipt", ms: "Resit anda" });
    expect(RECEIPT_WORDS.meaning.en).toMatch(/records what the portal told you/);
    expect(RECEIPT_WORDS.meaning.ms).toMatch(/merekodkan apa yang dimaklumkan oleh portal/);
    for (const w of Object.values(RECEIPT_WORDS)) {
      expect(w.en).not.toMatch(/\b(signed|signature|proof|proves|verified)\b/i);
      expect(w.ms).not.toMatch(/tandatangan|bukti|disahkan|mengesahkan|pengesahan/i);
    }
  });
});
