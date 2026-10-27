/**
 * The development fill (plan step 4.6, ADR 0043 D3, SP-23): what a database holding the demonstration still lacks to work end to end, for the
 * founder's instruction of 2026-10-23, "we are still in development process, we don't need second approver until after go live".
 *
 * It loads only where `demoIsLoaded` holds and refuses anywhere else, whatever the switch reads. On a demonstration database it turns approval by
 * another admin off itself, audited as its own SYSTEM actor: the only pack that may (`DEMO_DATABASE_ONLY`). Then it fills, only where unset:
 * - the class every Project workspace file takes, so staff can create project documents and the contractor can answer a request;
 * - the supplier register's classes, which the generic pack cannot set on a database whose class list is not empty;
 * - the personal data notice, the three declarations and the help contact: invented demo wording, ASSUMED, so the Getting-started checklist still
 *   reads "todo" for them;
 * - Wave V (plan step V9): a contractor's portal account may sign for it ("yes", ASSUMED, a demo value), the SULIT class returned award documents take, the supply
 *   type's payment route (delivery order and invoice), and one contact allowed to sign: demo_vct2 of Demo Paip Services, the awardee of demo_law1, which the
 *   demonstration leaves ready for an online return (prisma/demo-wave-v.ts, whose supply claims wait for this route on a database loaded before it existed).
 * - ADR 0046 (plan step 8): two funding sources (a demo sukuk with a RM50m envelope, restricted to "Water storage", and Internal, any category), two project
 *   categories and the two impact measures SF-04 gives as examples. Invented, ASSUMED; prisma/demo-funding.ts puts them on demo records.
 * The rest the register needs (banks, account types, quotas, address limit, online declaration) is the generic pack's, loaded after this one.
 *
 * Demo ids are literal: a pack reference names only a row the same run creates, and the last two name a demo row by its id (`rowId`), filled only where unset and never
 * created. Data only: the loader is `src/lib/starter`.
 */

import { LOAD_DAY } from "../src/lib/starter/plan";
import type { PackGroup, PackList, StarterPack } from "../src/lib/starter/types";

const SOURCE = "Development fill: demo value, replace before go-live";
const MARK = "(demo text, replace before go-live)";

/// The demonstration's classes (prisma/demo-documents.ts): demo_dc1 Internal, demo_dc2 SULIT.
const INTERNAL = "demo_dc1";
const SULIT = "demo_dc2";

/// The demonstration's supply contract type (prisma/demo.ts), and the contact of demo_law1's awardee (prisma/demo-suppliers.ts).
const SUPPLY_TYPE = "demo_ct3";

/// ADR 0046: the demonstration's funding (codes, read by prisma/demo-funding.ts).
export const DEMO_FUNDING = { sukuk: "demo_fs1", internal: "demo_fs2", water: "demo_pc1", office: "demo_pc2", storage: "demo_im1", households: "demo_im2" } as const;
const SIGNING_CONTACT = "demo_vct2";

const group = (model: PackGroup["model"], label: string, values: PackGroup["values"], provenanceColumn?: string, rowId?: string): PackGroup => ({ model, label, values, provenanceColumn, source: SOURCE, ...(rowId ? { rowId } : {}) });
const text = (kind: string, label: string, bodyEn: string): PackList => ({
  model: "DeclarationText",
  label,
  scope: { kind },
  rows: [{ code: kind, label: "version 1", values: { version: 1, bodyEn: `${bodyEn} ${MARK}`, issuedOn: LOAD_DAY }, source: SOURCE }],
});

export const DEV_FILL_PACK = {
  name: "dev-fill",
  version: 1,
  provenance: "ASSUMED",
  setsTwoPersonOff: "DEMO_DATABASE_ONLY",
  lists: [
    text("TERMS_AND_CONDITIONS", "Terms and conditions", "These are the terms on which {organisation} keeps its supplier register. Registering does not entitle a company to any contract. The company keeps its details current and tells {organisation} of any change. {organisation} may suspend or cancel a registration under its published rules."),
    text("FALSE_DECLARATION", "False-declaration acknowledgement", "I declare that everything in this registration is true and complete. I understand that a false declaration may lead to the registration being refused or withdrawn and to {organisation} taking further action."),
    text("GIRO_AUTHORISATION", "GIRO authorisation", "I authorise {organisation} to pay every amount due to my company into the bank account given in this form, and I confirm that I am entitled to give this authorisation."),
    // ADR 0046: categories before the sources that name them.
    { model: "ProjectCategory", label: "Project category", rows: [
      { code: DEMO_FUNDING.water, label: "Water storage", values: { nameEn: "Water storage" }, source: SOURCE },
      { code: DEMO_FUNDING.office, label: "Office works", values: { nameEn: "Office works" }, source: SOURCE },
    ] },
    { model: "FundingSource", label: "Funding source", rows: [
      { code: DEMO_FUNDING.sukuk, label: "Demo Sukuk 2026", values: { nameEn: "Demo Sukuk 2026", envelope: "50000000.00", categoriesRestricted: true, eligibleCategoryCodes: [DEMO_FUNDING.water], eligibilityProvenance: "ASSUMED" }, source: SOURCE },
      { code: DEMO_FUNDING.internal, label: "Internal", values: { nameEn: "Internal", categoriesRestricted: false, eligibilityProvenance: "ASSUMED" }, source: SOURCE },
    ] },
    { model: "ImpactMeasure", label: "Impact measure", rows: [
      { code: DEMO_FUNDING.storage, label: "Storage added", values: { nameEn: "Storage added", unit: "ML" }, source: SOURCE },
      { code: DEMO_FUNDING.households, label: "Households served", values: { nameEn: "Households served", unit: "households" }, source: SOURCE },
    ] },
  ],
  groups: [
    // No provenance column: the upload rules' one provenance covers the types and size the organisation already set.
    group("DocumentStorePolicy", "Upload rules · project documents", { projectDocumentClassId: INTERNAL }),
    group("SupplierPolicy", "Supplier register · upload classes", { supplierUploadClassId: INTERNAL, supplierBankStatementClassId: SULIT }, "uploadClassProvenance"),
    group(
      "SupplierPolicy",
      "Supplier register · personal data notice",
      { personalDataNoticeEn: `The details you enter are used only to review your application to join the supplier register. Only officers of the procurement office see them. They are kept while the application is considered and erased once it is decided. To ask for access or a correction, contact the procurement office quoting your reference. ${MARK}` },
      "personalDataProvenance",
    ),
    group("SupplierPolicy", "Supplier register · help contact", { helpEmail: "procurement@demo.invalid", helpPhone: "+999 7 000 0000" }, "helpProvenance"),
    // Wave V (plan step V9): what an online award return and a supply claim stand on.
    group("PostAwardPolicy", "Post-award · contractor signs from its portal account", { contractorPortalSigning: true }, "contractorPortalSigningProvenance"),
    // Its own group: the project class beside it is set already on a demonstration database, and a half-set group is skipped whole.
    group("DocumentStorePolicy", "Upload rules · returned award documents", { awardReturnClassId: SULIT }),
    // No provenance column: the route has no tag of its own (WV-14).
    group("ContractType", "Contract type · Supply · how it is paid", { paymentRoute: "DELIVERY_ORDER_INVOICE" }, undefined, SUPPLY_TYPE),
    group("SupplierContact", "Demo Paip Services · Lim Kok Wai · may sign for the contractor", { authorisedToSignForContractor: true }, undefined, SIGNING_CONTACT),
  ],
} satisfies StarterPack;

export default DEV_FILL_PACK;
