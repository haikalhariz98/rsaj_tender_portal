/**
 * The generic starter pack (ADR 0043 D1, plan step 4.3): working starting values that are not authority, for any organisation, loaded by
 * `npm run setup` and by `npm run pack -- generic`. Every value is ASSUMED, a generic starting value the organisation reviews and changes
 * as its own. It holds no approval value (SP-1): no limit, route, committee, threshold, fee or day count; no legal text (SP-9); no holiday
 * dates (SP-7).
 *
 * Data only: the loader is `src/lib/starter`. Nothing in the product reads this file.
 */

import type { Prisma } from "../../src/generated/prisma/client";
import { DOCX_TYPE, XLSX_TYPE } from "../../src/lib/documents/media";
import { megabytesToBytes } from "../../src/lib/documents/policy";
import { REJECTION_DOMAINS } from "../../src/lib/authority/rejection";
import { LOAD_DAY } from "../../src/lib/starter/plan";
import type { PackGroup, PackList, StarterPack } from "../../src/lib/starter/types";

const SOURCE = "generic starting value";
/// SP-8. Written from memory: the page could not be read when this was written. Check it against the page before go-live.
const BANK_SOURCE = "Bank Negara Malaysia, list of licensed commercial banks (bnm.gov.my): transcribed 2026-10-23 without access to the page, unverified; check it against the page before go-live";
/// The licensed Islamic banks, so a supplier banking with one can pick it. The same caution: written from memory, unverified. Development
/// financial institutions (a different licence) and the digital banks are left out until the list is checked.
const ISLAMIC_BANK_SOURCE = "Bank Negara Malaysia, list of licensed Islamic banks (bnm.gov.my): transcribed 2026-10-23 without access to the page, unverified; check it against the page before go-live";

/// The columns of each table this pack writes, from the generated client: a misspelt column does not compile.
interface Models {
  Organisation: Prisma.OrganisationUncheckedCreateInput;
  SecurityPolicy: Prisma.SecurityPolicyUncheckedCreateInput;
  DocumentClass: Prisma.DocumentClassUncheckedCreateInput;
  DocumentStorePolicy: Prisma.DocumentStorePolicyUncheckedCreateInput;
  SupplierPolicy: Prisma.SupplierPolicyUncheckedCreateInput;
  SupplierListValue: Prisma.SupplierListValueUncheckedCreateInput;
  HolidayCalendar: Prisma.HolidayCalendarUncheckedCreateInput;
  WindowPolicy: Prisma.WindowPolicyUncheckedCreateInput;
  NumberingSeries: Prisma.NumberingSeriesUncheckedCreateInput;
  RejectionDestination: Prisma.RejectionDestinationUncheckedCreateInput;
}
type Ref = { ref: string };
type Cols<T> = { [K in Exclude<keyof T, "id" | "organisationId">]?: T[K] | Ref | typeof LOAD_DAY };
type Model = keyof Models;

const group = <M extends Model>(model: M, label: string, values: Cols<Models[M]>, provenanceColumn?: keyof Models[M] & string): PackGroup => ({ model, label, values, provenanceColumn, source: SOURCE });
const list = <M extends Model>(model: M, label: string, scope: Cols<Models[M]> | undefined, rows: Array<{ code: string; label?: string; values: Cols<Models[M]>; source?: string }>): PackList => ({
  model,
  label,
  scope,
  rows: rows.map((r) => ({ code: r.code, label: r.label, values: r.values, source: r.source ?? SOURCE })),
});
const named = (names: Record<string, string>) => Object.entries(names).map(([code, nameEn]) => ({ code, values: { nameEn } }));
const ref = (model: Model, code: string): Ref => ({ ref: `${model}:${code}` });

const STATES = {
  johor: "Johor",
  kedah: "Kedah",
  kelantan: "Kelantan",
  melaka: "Melaka",
  negeri_sembilan: "Negeri Sembilan",
  pahang: "Pahang",
  perak: "Perak",
  perlis: "Perlis",
  pulau_pinang: "Pulau Pinang",
  sabah: "Sabah",
  sarawak: "Sarawak",
  selangor: "Selangor",
  terengganu: "Terengganu",
  wp_kuala_lumpur: "Federal Territory of Kuala Lumpur",
  wp_labuan: "Federal Territory of Labuan",
  wp_putrajaya: "Federal Territory of Putrajaya",
};

const BANKS = {
  affin: "Affin Bank Berhad",
  alliance: "Alliance Bank Malaysia Berhad",
  ambank: "AmBank (M) Berhad",
  bangkok_bank: "Bangkok Bank Berhad",
  bank_of_america: "Bank of America Malaysia Berhad",
  bank_of_china: "Bank of China (Malaysia) Berhad",
  bnp_paribas: "BNP Paribas Malaysia Berhad",
  china_construction_bank: "China Construction Bank (Malaysia) Berhad",
  cimb: "CIMB Bank Berhad",
  citibank: "Citibank Berhad",
  deutsche_bank: "Deutsche Bank (Malaysia) Berhad",
  hong_leong: "Hong Leong Bank Berhad",
  hsbc: "HSBC Bank Malaysia Berhad",
  india_international: "India International Bank (Malaysia) Berhad",
  icbc: "Industrial and Commercial Bank of China (Malaysia) Berhad",
  jp_morgan: "J.P. Morgan Chase Bank Berhad",
  maybank: "Malayan Banking Berhad",
  mizuho: "Mizuho Bank (Malaysia) Berhad",
  mufg: "MUFG Bank (Malaysia) Berhad",
  ocbc: "OCBC Bank (Malaysia) Berhad",
  public_bank: "Public Bank Berhad",
  rhb: "RHB Bank Berhad",
  standard_chartered: "Standard Chartered Bank Malaysia Berhad",
  smbc: "Sumitomo Mitsui Banking Corporation Malaysia Berhad",
  bank_of_nova_scotia: "The Bank of Nova Scotia Berhad",
  uob: "United Overseas Bank (Malaysia) Bhd.",
};

const ISLAMIC_BANKS = {
  affin_islamic: "Affin Islamic Bank Berhad",
  al_rajhi: "Al Rajhi Banking & Investment Corporation (Malaysia) Berhad",
  alliance_islamic: "Alliance Islamic Bank Berhad",
  ambank_islamic: "AmBank Islamic Berhad",
  bank_islam: "Bank Islam Malaysia Berhad",
  bank_muamalat: "Bank Muamalat Malaysia Berhad",
  cimb_islamic: "CIMB Islamic Bank Berhad",
  hong_leong_islamic: "Hong Leong Islamic Bank Berhad",
  hsbc_amanah: "HSBC Amanah Malaysia Berhad",
  kuwait_finance_house: "Kuwait Finance House (Malaysia) Berhad",
  maybank_islamic: "Maybank Islamic Berhad",
  mbsb_bank: "MBSB Bank Berhad",
  ocbc_al_amin: "OCBC Al-Amin Bank Berhad",
  public_islamic: "Public Islamic Bank Berhad",
  rhb_islamic: "RHB Islamic Bank Berhad",
  standard_chartered_saadiq: "Standard Chartered Saadiq Berhad",
};

/// Every series the product numbers under a fixed key (the callers of `issueReference`). Series named by other configuration (a method's dossier
/// series, the evaluation report's series, an award's contract-number series) are the organisation's to make.
const SERIES = {
  requisition: ["Requisitions", "REQ"],
  exercise: ["Tenders and quotations", "TQ"],
  award: ["Awards", "AWD"],
  certificate: ["Certificates", "CERT"],
  variation: ["Variations", "VO"],
  contract_matter: ["Contract matters", "CM"],
  supplier: ["Suppliers", "SUP"],
  portal_application: ["Online registration applications", "APP"],
  meeting: ["Committee sittings", "MTG"],
} as const;

const MATTER_WORDS: Record<(typeof REJECTION_DOMAINS)[number], string> = { requisition: "Requisitions", name_approval: "Name approvals", appointment: "Appointments" };

export const GENERIC_PACK = {
  name: "generic",
  version: 1,
  provenance: "ASSUMED",
  setsTwoPersonOff: "WHEN_CREATING_ROW",
  lists: [
    list("DocumentClass", "Document class", undefined, [
      { code: "public", values: { nameEn: "Public", classification: "PUBLIC" } },
      { code: "internal", values: { nameEn: "Internal", classification: "INTERNAL" } },
      { code: "supplier_documents", values: { nameEn: "Supplier documents", classification: "INTERNAL" } },
      { code: "bank_statements", values: { nameEn: "Bank statements", classification: "SULIT" } },
      { code: "sulit", values: { nameEn: "SULIT", classification: "SULIT" } },
    ]),
    list("SupplierListValue", "Entity type", { list: "ENTITY_TYPE" }, named({ sdn_bhd: "Private limited company (Sdn Bhd)", berhad: "Public limited company (Berhad)", sole_proprietorship: "Sole proprietorship", partnership: "Partnership", llp: "Limited liability partnership (LLP)" })),
    list("SupplierListValue", "Country", { list: "COUNTRY" }, [{ code: "MY", values: { nameEn: "Malaysia", callingCode: "+60" } }]),
    list("SupplierListValue", "State", { list: "STATE" }, named(STATES)),
    list("SupplierListValue", "Bank", { list: "BANK" }, [...named(BANKS).map((r) => ({ ...r, source: BANK_SOURCE })), ...named(ISLAMIC_BANKS).map((r) => ({ ...r, source: ISLAMIC_BANK_SOURCE }))]),
    list("SupplierListValue", "Account type", { list: "ACCOUNT_TYPE" }, named({ current: "Current account", savings: "Savings account" })),
    list("HolidayCalendar", "Holiday calendar", undefined, [{ code: "public_holidays", values: { name: "Public holidays", weekendDays: [6, 7], weekendProvenance: "ASSUMED" } }]),
    list("NumberingSeries", "Numbering", undefined, Object.entries(SERIES).map(([key, [nameEn, prefix]]) => ({ code: key, values: { key, nameEn, pattern: `${prefix}/{YEAR}/{SERIAL}`, padding: 4, resetOn: "CALENDAR_YEAR" } }))),
    list("RejectionDestination", "When rejected", undefined, REJECTION_DOMAINS.map((domain) => ({ code: domain, label: MATTER_WORDS[domain], values: { domain, kind: "RETURN_TO_ORIGINATOR", effectiveFrom: LOAD_DAY } }))),
  ],
  groups: [
    group("Organisation", "Organisation · time zone", { timeZone: "Asia/Kuala_Lumpur" }),
    group("SecurityPolicy", "Sign-in settings", {
      staffIdleMinutes: 30,
      staffAbsoluteMinutes: 480,
      supplierIdleMinutes: 30,
      supplierAbsoluteMinutes: 480,
      maxConcurrentSessions: 3,
      concurrentSessionAction: "REVOKE_OLDEST",
      maxFailedAttempts: 5,
      lockoutMinutes: 15,
      addressThrottleAttempts: 10,
      addressThrottleMinutes: 30,
      passwordMinLength: 12,
      resetCodeValidityMinutes: 60,
      sealingPassphraseMinLength: 12,
      signInDetailRetentionDays: 365,
    }),
    group(
      "DocumentStorePolicy",
      "Upload rules",
      { allowedMediaTypes: ["application/pdf", DOCX_TYPE, XLSX_TYPE, "image/jpeg", "image/png"], maxBytes: megabytesToBytes("20"), projectDocumentClassId: ref("DocumentClass", "internal") },
      "provenance",
    ),
    group("SupplierPolicy", "Supplier register · verification notice", { verificationNoticeEn: "We will check your application and contact you." }, "noticeProvenance"),
    group("SupplierPolicy", "Supplier register · upload limits", { uploadMaxFilesPerApplication: 12, uploadMaxBytesPerApplication: megabytesToBytes("25") }, "uploadLimitProvenance"),
    group("SupplierPolicy", "Supplier register · daily limits", { portalDailyLimit: 200, portalDailyLimitPerNumber: 3 }, "portalLimitProvenance"),
    group("SupplierPolicy", "Supplier register · address limit", { portalAddressAttempts: 20, portalAddressMinutes: 60 }, "portalAddressProvenance"),
    group("SupplierPolicy", "Supplier register · online declaration", { onlineDeclarationReplacesPaper: true }, "onlineDeclarationProvenance"),
    group("SupplierPolicy", "Supplier register · upload classes", { supplierUploadClassId: ref("DocumentClass", "supplier_documents"), supplierBankStatementClassId: ref("DocumentClass", "bank_statements") }, "uploadClassProvenance"),
    group("WindowPolicy", "Invitation · calendar", { calendarId: ref("HolidayCalendar", "public_holidays") }),
  ],
} satisfies StarterPack;

export default GENERIC_PACK;
