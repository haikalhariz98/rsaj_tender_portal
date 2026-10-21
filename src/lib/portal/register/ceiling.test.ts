import { describe, expect, it } from "vitest";

import { HONEYPOT_FIELD } from "@/lib/portal/apply";
import { CREDITOR_FIELDS } from "@/lib/portal/registration/types";

import { PART_OVERHEAD, REGISTER_TEXT_ALLOWANCE, registerBodyCeiling } from "./ceiling";
import { documentFilePart, REGISTER_APPLICATION_PART, STATEMENT_FILE_PART, type PublicApplicationBody } from "./contract";
import { ADDRESS_BOUNDS, AGREEMENT_BOUNDS, COMPANY_BOUNDS, CONTACT_BOUNDS, CREDITOR_BOUNDS, DOCUMENT_BOUNDS, LIST_BOUNDS, parsePublicApplication, SIGNATORY_BOUNDS } from "./parse";

describe("the body ceiling (ADR 0041 D9, REG-2, O-10)", () => {
  it("is the files' share from the settings, a part's overhead per file, and the text allowance", () => {
    const s = { capBytes: 10_000_000n, maxFiles: 10, maxBytes: 50_000_000n };
    expect(registerBodyCeiling(s)).toBe(50_000_000n + 10n * PART_OVERHEAD + REGISTER_TEXT_ALLOWANCE);
    // The count times the cap, where that is the smaller.
    expect(registerBodyCeiling({ ...s, maxBytes: 500_000_000n })).toBe(100_000_000n + 10n * PART_OVERHEAD + REGISTER_TEXT_ALLOWANCE);
  });

  it("is null while any setting is unset: the register is closed, never opened on an assumed figure", () => {
    expect(registerBodyCeiling({ capBytes: null, maxFiles: 3, maxBytes: 1n })).toBeNull();
    expect(registerBodyCeiling({ capBytes: 1n, maxFiles: null, maxBytes: 1n })).toBeNull();
    expect(registerBodyCeiling({ capBytes: 1n, maxFiles: 3, maxBytes: null })).toBeNull();
  });

  it("holds a body with every text at its hard bound, every list full, the bait field filled and every file at its limit", async () => {
    const worst = (n: number) => "\u0001".repeat(n); // six bytes each once written as JSON
    const id = (prefix: string, i: number) => `${prefix}${String(i).padStart(DOCUMENT_BOUNDS.valueId - prefix.length, "0")}`;
    const sha = "f".repeat(64);
    const company = Object.fromEntries(Object.entries(COMPANY_BOUNDS).map(([k, n]) => [k, worst(n)])) as unknown as PublicApplicationBody["company"];
    const b: PublicApplicationBody = {
      company: { ...company, address: Object.fromEntries(Object.entries(ADDRESS_BOUNDS).map(([k, n]) => [k, worst(n)])) as never, contact: Object.fromEntries(Object.entries(CONTACT_BOUNDS).map(([k, n]) => [k, worst(n)])) as never },
      documents: Array.from({ length: LIST_BOUNDS.documents }, (_, i) => ({
        clientKey: `new:${String(i).padStart(DOCUMENT_BOUNDS.clientKey - 4, "k")}`,
        typeId: id("type", i),
        title: worst(DOCUMENT_BOUNDS.title),
        reference: worst(DOCUMENT_BOUNDS.reference),
        issuingAuthority: worst(DOCUMENT_BOUNDS.issuingAuthority),
        expiresOn: worst(DOCUMENT_BOUNDS.expiresOn),
        notApplicable: false,
        ratePercent: worst(DOCUMENT_BOUNDS.ratePercent),
        valueIds: Array.from({ length: LIST_BOUNDS.valuesPerDocument }, (_, j) => id(`v${i}x`, j)),
      })),
      creditor: Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, worst(CREDITOR_BOUNDS[k])])) as never,
      signatory: { name: worst(SIGNATORY_BOUNDS.name), designation: worst(SIGNATORY_BOUNDS.designation) },
      agreements: (["GIRO_AUTHORISATION", "FALSE_DECLARATION", "TERMS_AND_CONDITIONS"] as const).map((kind) => ({ kind, textVersionId: worst(AGREEMENT_BOUNDS.textVersionId), textSha256: sha, confirmed: true })),
      noticeSha256: sha,
    };
    // It is a body the server reads: nothing in it is past a bound.
    expect(parsePublicApplication(JSON.parse(JSON.stringify(b))).ok).toBe(true);

    const settings = { capBytes: 1000n, maxFiles: 3, maxBytes: 2500n };
    const longName = "\u{1F600}".repeat(255);
    const fd = new FormData();
    fd.set(REGISTER_APPLICATION_PART, JSON.stringify(b));
    fd.set(HONEYPOT_FIELD, "x".repeat(1024));
    fd.append(documentFilePart(b.documents[0]!.clientKey), new File([new Uint8Array(1000)], `${longName}.pdf`, { type: "application/pdf" }));
    fd.append(documentFilePart(b.documents[1]!.clientKey), new File([new Uint8Array(1000)], `${longName}.pdf`, { type: "application/pdf" }));
    fd.append(STATEMENT_FILE_PART, new File([new Uint8Array(500)], `${longName}.pdf`, { type: "application/pdf" }));
    const bytes = BigInt((await new Response(fd).arrayBuffer()).byteLength);
    expect(bytes <= registerBodyCeiling(settings)!).toBe(true);
  });
});
