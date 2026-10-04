import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fieldsNamed } from "@/lib/templates/merge";

import { certificateFaultWords, refusalText } from "./fault-text";
import { ANY_CERTIFICATE_FIELD } from "./fields";
import { NOT_RAISED_AGAIN, raisedWithoutFormFault, raisedWithoutFormWords, templateNotSetWords } from "./form-needs";
import { KIND_WORDS } from "./labels";
import { pinContextOf } from "./pin-context";
import { pinRefusals } from "./revision";
import { CERTIFICATE_KINDS, type CertificateKind } from "./types";

/**
 * BD-613-103 (product owner, SENT BACK) / code review S-6, 6.13 Part B Run 0 fix round. A certificate already opened
 * without a form (Certificate.templateId null) can never be given one: its form is fixed when it is opened, so choosing
 * one under Configuration › Post-award controls serves the next certificate raised, not this one. It gets its own finding,
 * RAISED_WITHOUT_FORM, in English and Malay, from one pure function (form-needs.ts) that both the Signatures panel and the
 * first signature's refusal use.
 *
 * Worked example: the demo's contract sum adjustment demo_hct5 was opened by the demo's loader with no form. Its page used
 * to say "No form is chosen for “this certificate”. Choose it under Configuration › Post-award controls." — an exit that
 * cannot help it. Open, it now says it was raised without a form, that a form chosen now serves the next one raised and
 * not this one, and to void it and raise it again. It is void, so it says only that it was raised without a form.
 */

const ctx = (kind: CertificateKind, status: string) => ({ contractDate: null, figures: null, raised: { kind, status } });
const pinOf = (kind: CertificateKind, status: string) => pinRefusals(null, ANY_CERTIFICATE_FIELD, fieldsNamed, ctx(kind, status));

describe("a certificate raised without a form: its own finding and words (BD-613-103, S-6)", () => {
  it("open: the first signature refuses with RAISED_WITHOUT_FORM, naming the kind, the next-raised point and the exit (EN and MS)", () => {
    const fs = pinOf("SUM_ADJUSTMENT", "DRAFT");
    expect(fs).toEqual([{ code: "RAISED_WITHOUT_FORM", level: "block", data: { kind: "SUM_ADJUSTMENT", status: "DRAFT" } }]);
    expect(certificateFaultWords(fs[0])).toEqual({
      en: "This certificate (Contract sum adjustment) was raised without a form. Choosing a form under Configuration › Post-award controls serves the next one raised, not this one: void it and raise it again.",
      ms: "Perakuan ini (Pelarasan harga kontrak) dibangkitkan tanpa borang. Memilih borang di Konfigurasi › Kawalan selepas setuju terima terpakai bagi yang dibangkitkan seterusnya, bukan yang ini: batalkannya dan bangkitkannya semula.",
    });
    // The refusal the act gives is the same words behind its lead.
    expect(refusalText("The first signature is refused:", fs)).toBe(`The first signature is refused: ${certificateFaultWords(fs[0]).en}`);
  });

  it("void: only that it was raised without a form, with no advice (EN and MS)", () => {
    const words = certificateFaultWords(pinOf("SUM_ADJUSTMENT", "VOID")[0]);
    expect(words).toEqual({ en: "This certificate (Contract sum adjustment) was raised without a form.", ms: "Perakuan ini (Pelarasan harga kontrak) dibangkitkan tanpa borang." });
    expect(words.en).not.toMatch(/Choos|void it|Configuration/);
    expect(words.ms).not.toMatch(/Memilih|batalkannya|Konfigurasi/);
  });

  it("every kind, open and void, in both languages: named through KIND_WORDS, no quotes, no code, never the raise's words", () => {
    for (const kind of CERTIFICATE_KINDS) {
      for (const status of ["DRAFT", "IN_ROUTING", "SIGNING", "VOID"]) {
        const w = raisedWithoutFormWords({ kind, status });
        expect(w.en, `${kind} ${status}`).toContain(`(${KIND_WORDS[kind].en})`);
        expect(w.ms, `${kind} ${status}`).toContain(`(${KIND_WORDS[kind].ms})`);
        for (const t of [w.en, w.ms]) {
          expect(t).not.toMatch(/[“”"]/);
          expect(t).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
          expect(t).not.toMatch(/No form is chosen|Tiada borang dipilih/);
        }
        if (status === "VOID") expect(w.en).toMatch(/was raised without a form\.$/);
        else expect(w.en).toContain("serves the next one raised, not this one");
      }
    }
  });

  it("a kind the product never raises again once void is not told to void it and raise it again (the variation's application)", () => {
    expect(NOT_RAISED_AGAIN).toEqual(["VARIATION_APPLICATION"]);
    const w = raisedWithoutFormWords({ kind: "VARIATION_APPLICATION", status: "DRAFT" });
    expect(w.en).toBe("This certificate (Application for a variation) was raised without a form. Choosing a form under Configuration › Post-award controls serves the next one raised, not this one. It was opened when its variation's prior approval was approved and is not raised again, so voiding it would leave the variation without its application: there is no way to give it a form yet.");
    expect(w.en).not.toMatch(/raise it again/);
    expect(w.ms).not.toMatch(/bangkitkannya semula/);
    for (const kind of CERTIFICATE_KINDS.filter((k) => !NOT_RAISED_AGAIN.includes(k))) expect(raisedWithoutFormWords({ kind, status: "DRAFT" }).en, kind).toMatch(/: void it and raise it again\.$/);
  });

  it("the certificate's own context carries its kind and status, so the act and the page agree (pinContextOf)", () => {
    const cert = { kind: "INTERIM_PAYMENT", status: "VOID", routingTypeId: null, baseline: { contractDate: null }, routingSnapshot: null, computedSnapshot: null, overrides: [], routingReceivedOn: null, approvalInstances: [], routingChecks: [] };
    const c = pinContextOf(cert);
    expect(c.raised).toEqual({ kind: "INTERIM_PAYMENT", status: "VOID" });
    expect(pinRefusals(null, ANY_CERTIFICATE_FIELD, fieldsNamed, c)).toEqual([raisedWithoutFormFault({ kind: "INTERIM_PAYMENT", status: "VOID" })]);
  });

  it("with no certificate facts the words still say it plainly, never a quoted placeholder", () => {
    expect(raisedWithoutFormWords({})).toEqual({
      en: "This certificate was raised without a form. Choosing a form under Configuration › Post-award controls serves the next one raised, not this one: void it and raise it again.",
      ms: "Perakuan ini dibangkitkan tanpa borang. Memilih borang di Konfigurasi › Kawalan selepas setuju terima terpakai bagi yang dibangkitkan seterusnya, bukan yang ini: batalkannya dan bangkitkannya semula.",
    });
    expect(templateNotSetWords({}).en).not.toMatch(/[“”]/);
    expect(templateNotSetWords({ need: "Interim payment certificate" }).en).toBe("No form is chosen for “Interim payment certificate”. Choose it under Configuration › Post-award controls.");
  });
});

describe("the screen and the act use the one function (source)", () => {
  const page = readFileSync("src/app/projects/[id]/certificates/[certId]/page.tsx", "utf8");
  const write = readFileSync("src/lib/certificate/write.ts", "utf8");
  it("the Signatures panel words a formless certificate by raisedWithoutFormWords, and no longer by the raise's words", () => {
    expect(page).toMatch(/raisedWithoutFormWords\(\{ kind: cert\.kind, status \}\)\.en/);
    expect(page).not.toMatch(/templateNotSetWords/);
    expect(page).not.toMatch(/need: "this certificate"/);
  });
  it("the first signature reads the certificate's own context (pinCheck → pinContextOf), so its refusal is the same finding", () => {
    expect(write).toMatch(/const fs = pinCheck\(t, cert, c\.today\);/);
  });
  it("openCertificate's refusal of a form not the organisation's names the kind's need, never the placeholder", () => {
    expect(write).toMatch(/refuse\("Not opened:", \[formNeedFault\(null, KIND_WORDS\[o\.kind\]\)!\]\)/);
    expect(write).not.toMatch(/one\("TEMPLATE_NOT_SET"\)/);
  });
});
