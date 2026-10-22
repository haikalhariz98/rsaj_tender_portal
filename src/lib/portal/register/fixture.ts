/**
 * Test fixtures for the one-submission registration's rules: a whole body that passes, against the registration fixture's configuration (`../registration/fixture.ts`). Invented for
 * the tests, never a customer's: nothing here is read by the product.
 */

import type { PortalApplicationContext } from "@/lib/portal/apply";
import { creditor, ctx, FALSE_SHA, FIXTURE_ORGANISATION, GIRO_SHA, NOTICE, TERMS_SHA } from "@/lib/portal/registration/fixture";

import type { PublicRegistrationConfig } from "./config";
import type { PublicApplicationBody } from "./contract";
import { emptyWizard, type HeldFile, type WizardState } from "./wizard";

export const step1 = (o: Partial<PortalApplicationContext> = {}): PortalApplicationContext => ({
  today: "2026-10-09",
  formatPattern: null,
  entityTypeCodes: ["demo_private"],
  countryCodes: ["demo_home"],
  stateCodes: ["demo_state"],
  bumiputeraCodes: [],
  contactNeedsEmailAndPhone: null,
  ...o,
});

export const body = (o: Partial<PublicApplicationBody> = {}): PublicApplicationBody => ({
  company: {
    registeredName: "Demonstration Contractors",
    registrationNo: "202001000001",
    entityTypeCode: "demo_private",
    countryCode: "demo_home",
    incorporatedOn: "2020-01-01",
    bumiputeraClaimCode: null,
    companyEmail: "office@example.invalid",
    address: { addressLine1: "1 Demonstration Road", addressLine2: "", city: "Demonstration City", postcode: "10000", stateCode: "demo_state" },
    contact: { name: "Aminah Binti Ali", designation: "Director", email: "aminah@example.invalid", phone: "0123456789" },
  },
  documents: [
    { clientKey: "new:reg", typeId: "t-reg", title: "", reference: "R-1", issuingAuthority: "An authority", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "", valueIds: [] },
    { clientKey: "new:works", typeId: "t-works", title: "", reference: "W-1", issuingAuthority: "A board", expiresOn: "2027-06-30", notApplicable: false, ratePercent: "", valueIds: ["v-g1", "v-b"] },
  ],
  creditor: creditor(),
  signatory: { name: "Aminah Binti Ali", designation: "Director" },
  agreements: [
    { kind: "GIRO_AUTHORISATION", textVersionId: "text-giro-1", textSha256: GIRO_SHA, confirmed: true },
    { kind: "FALSE_DECLARATION", textVersionId: "text-false-1", textSha256: FALSE_SHA, confirmed: true },
    { kind: "TERMS_AND_CONDITIONS", textVersionId: "text-terms-1", textSha256: TERMS_SHA, confirmed: true },
  ],
  noticeSha256: NOTICE.sha256,
  ...o,
});

/// One file held for each row and one statement: what a complete submission carries.
export const FILES = new Map([["new:reg", 1], ["new:works", 1]]);

/// The public form's configuration, as `loadRegisterForm` would hand it to the page, on the registration fixture's context. Every file rule set: PDF and PNG, 5 MB each, 4 files and 12 MB in all.
export const config = (o: Partial<PublicRegistrationConfig> = {}): PublicRegistrationConfig => {
  const c = ctx();
  const shown = (kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS") => {
    const t = c.texts[kind]!;
    return { id: t.id, en: t.bodyEn.split("{organisation}").join(FIXTURE_ORGANISATION), version: t.version, sha256: t.sha256 };
  };
  return {
    ready: true,
    missing: [],
    organisationName: FIXTURE_ORGANISATION,
    step1: step1(),
    lists: { entityTypes: [{ value: "demo_private", label: "Private company" }], countries: [{ value: "demo_home", label: "Demonstration Country", callingCode: "+60" }], states: [{ value: "demo_state", label: "Demonstration State" }], bumiputeraStatuses: [] },
    formatExample: null,
    bumiputeraEvidenceSet: false,
    context: { today: c.today, types: c.types, bodies: c.bodies, available: c.available, banks: c.banks, accountTypes: c.accountTypes, texts: c.texts, noticeEn: c.noticeEn, personalDataNotice: c.personalDataNotice, accountNoPattern: null, swiftPattern: null },
    texts: { GIRO_AUTHORISATION: shown("GIRO_AUTHORISATION"), FALSE_DECLARATION: shown("FALSE_DECLARATION"), TERMS_AND_CONDITIONS: shown("TERMS_AND_CONDITIONS") },
    notice: NOTICE,
    verificationNoticeEn: c.noticeEn,
    upload: {
      allowedTypes: ["application/pdf", "image/png"],
      capBytes: String(5 * 1024 * 1024),
      document: { classSet: true, maxFiles: 4, maxBytes: String(12 * 1024 * 1024) },
      statement: { classSet: true, classIsSulit: true, maxFiles: 4, maxBytes: String(12 * 1024 * 1024) },
      acceptNote: "PDF, PNG; up to 5 MB each.",
      accept: "application/pdf,image/png",
    },
    ...o,
  };
};

/// A held file: what the rules read of a browser `File`.
export const pdf = (name: string, size = 1000): HeldFile => ({ name, size, type: "application/pdf" });

/// A whole application held in the page, every step filled: the same application as `body()`, with one file per row and a statement.
export const heldState = (o: Partial<WizardState> = {}): WizardState => ({
  ...emptyWizard(body().company, [
    { id: "new:reg", typeId: "t-reg", title: "", reference: "R-1", issuingAuthority: "An authority", expiresOn: "2027-06-30", ratePercent: "", notApplicable: false },
    { id: "new:works", typeId: "t-works", title: "", reference: "W-1", issuingAuthority: "A board", expiresOn: "2027-06-30", ratePercent: "", notApplicable: false },
  ], creditor()),
  files: { "new:reg": [pdf("registry.pdf")], "new:works": [pdf("board.pdf")] },
  chosen: { "new:works": { GRADE: ["v-g1"], CATEGORY: ["v-b"] } },
  hits: { "v-g1": { id: "v-g1", code: "G1", name: "Grade 1", kind: "GRADE", bodyId: "body-1" }, "v-b": { id: "v-b", code: "B", name: "Buildings", kind: "CATEGORY", bodyId: "body-1" } },
  statement: [pdf("statement.pdf")],
  signatoryName: "Aminah Binti Ali",
  signatoryDesignation: "Director",
  giroConfirmed: true,
  falseDeclaration: true,
  terms: true,
  touched: true,
  ...o,
});
