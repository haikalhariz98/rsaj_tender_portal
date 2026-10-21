/**
 * Test fixtures for the one-submission registration's rules: a whole body that passes, against the registration fixture's configuration (`../registration/fixture.ts`). Invented for
 * the tests, never a customer's: nothing here is read by the product.
 */

import type { PortalApplicationContext } from "@/lib/portal/apply";
import { creditor, FALSE_SHA, GIRO_SHA, NOTICE, TERMS_SHA } from "@/lib/portal/registration/fixture";

import type { PublicApplicationBody } from "./contract";

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
