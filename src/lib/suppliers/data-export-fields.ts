/**
 * What a supplier's export of its own data may carry (N2, the PDPA right of access; plan docs/notes/plans/backlog-n2.md section 3). A closed
 * allow-list: every scalar column of every model the export reads is IN, or OUT with the reason it is left out. Every other model that names a
 * supplier, one of its accounts or one of its contacts is OUT as a whole, with its reason. `data-export.test.ts` reads `prisma/schema.prisma` as
 * text and fails on a column or a supplier-linked model that nobody has classified, so a new one is a decision, never a silent leak.
 *
 * IN means the export may show the value, as the portal already shows it to the supplier (no new right). Two IN columns are gated further by
 * `buildSupplierExport`: a verification note only where the office found the item NOT_IN_ORDER, and a sign-in name only for a contact open to
 * the reader (ruling 1875(7)). A list code (entity type, state, bank...) is IN as its list label, never as the code.
 *
 * INTERNAL_KEY columns are keys and joins. A reader may use them to find the rows; the export never writes them.
 */

export type OutReason =
  /// A password, a key, a token or anything that would let someone act as the account.
  | "SECRET"
  /// The office's own working (notes, checklists, its policy at the time). Ask the office (the export's left-out notice says how).
  | "STAFF_ONLY"
  /// Which officer did something. The portal names the office, not its people.
  | "STAFF_IDENTITY"
  /// A sealed bid's bytes, keys or their digests: not readable by anyone before the opening.
  | "SEALED"
  /// An identifier or a join.
  | "INTERNAL_KEY"
  /// Book-keeping the system needs (when a row was written, a counter, a transaction number) that says nothing about the supplier.
  | "TECHNICAL"
  /// Not shown to the supplier on the portal today, so the export would be a wider read.
  | "NOT_SHOWN_TODAY"
  /// Shown to the supplier elsewhere on the portal, but not in this first version of the export. A product-owner question (decisions log, 2026-10-19).
  | "NOT_YET_EXPORTED";

export type Classified = "IN" | { out: OutReason };

const IN = "IN" as const;
const out = (reason: OutReason) => ({ out: reason }) as const;
const KEY = out("INTERNAL_KEY");
const TECH = out("TECHNICAL");
const STAFF = out("STAFF_IDENTITY");

type Columns = Readonly<Record<string, Classified>>;

/// Every scalar column of each model the export reads.
export const EXPORT_COLUMNS = {
  Supplier: {
    id: KEY,
    organisationId: KEY,
    reference: IN,
    registeredName: IN,
    registrationNo: IN,
    registrationNoKey: out("INTERNAL_KEY"),
    entityTypeCode: IN,
    countryCode: IN,
    registeredAddress: IN,
    addressLine1: IN,
    addressLine2: IN,
    city: IN,
    postcode: IN,
    stateCode: IN,
    bumiputeraClaimCode: IN,
    incorporatedOn: IN,
    companyEmail: IN,
    status: IN,
    registeredOn: IN,
    erpVendorCode: out("INTERNAL_KEY"),
    erpSyncedAt: out("INTERNAL_KEY"),
    createdAt: TECH,
    updatedAt: TECH,
  },
  SupplierContact: {
    id: KEY,
    organisationId: KEY,
    supplierId: KEY,
    name: IN,
    designation: IN,
    email: IN,
    phone: IN,
    isPrimary: IN,
    // A retired contact is not listed to the supplier today (the step-5 summary reads open ones only).
    retiredOn: out("NOT_SHOWN_TODAY"),
    createdAt: TECH,
    updatedAt: TECH,
    authorisedToSignForContractor: out("NOT_YET_EXPORTED"),
  },
  SupplierAccount: {
    id: KEY,
    organisationId: KEY,
    contactId: KEY,
    supplierId: KEY,
    // IN only for a contact open to the reader (ruling 1875(7)); buildSupplierExport gates it.
    loginName: IN,
    loginKey: out("SECRET"),
    passwordHash: out("SECRET"),
    passwordChangedAt: IN,
    mustChangePassword: out("SECRET"),
    status: IN,
    failedAttempts: out("SECRET"),
    lockedUntil: out("SECRET"),
    lastSignInAt: IN,
    disabledAt: IN,
    disabledReason: out("STAFF_ONLY"),
    resetNoticePending: out("SECRET"),
    createdAt: IN,
    updatedAt: TECH,
  },
  SupplierApplication: {
    id: KEY,
    organisationId: KEY,
    supplierId: KEY,
    kind: IN,
    receivedOn: IN,
    channel: IN,
    recordedByPersonId: STAFF,
    recordedAt: TECH,
    declarationSignedOn: IN,
    epaymentFormReceivedOn: IN,
    status: IN,
    resubmitBy: IN,
    lapsedRecordedAt: TECH,
    submittedByPersonId: STAFF,
    decidedAt: TECH,
    createdAt: TECH,
    submittedAt: IN,
    submittedBySupplierAccountId: KEY,
    portalApplicationId: KEY,
  },
  ApplicationDecision: {
    id: KEY,
    organisationId: KEY,
    applicationId: KEY,
    outcome: IN,
    remarks: IN,
    resubmitBy: IN,
    decidedByPersonId: STAFF,
    decidedOn: IN,
    decidedAt: TECH,
    policySnapshot: out("STAFF_ONLY"),
  },
  ResubmissionItem: {
    id: KEY,
    organisationId: KEY,
    decisionId: KEY,
    supplierDocumentId: KEY,
    documentTypeId: KEY,
    labelSnapshot: IN,
    remarks: IN,
  },
  SupplierDocument: {
    id: KEY,
    organisationId: KEY,
    supplierId: KEY,
    typeId: KEY,
    typeLabelSnapshot: IN,
    applicationId: KEY,
    reference: IN,
    issuingAuthority: IN,
    title: IN,
    issuedOn: IN,
    validFrom: IN,
    expiresOn: IN,
    notApplicable: IN,
    ratePercent: IN,
    supersedesId: KEY,
    lodgedOn: IN,
    recordedAt: TECH,
    recordedByPersonId: STAFF,
    recordedBySupplierAccountId: KEY,
    recordedByPortalApplicationId: KEY,
    answersItemId: KEY,
    verification: IN,
    verifiedByPersonId: STAFF,
    verifiedOn: IN,
    verifiedAt: TECH,
    // IN only when the state is NOT_IN_ORDER (panels.tsx shows it then); buildSupplierExport gates it.
    verificationNote: IN,
    note: out("STAFF_ONLY"),
  },
  SupplierDocumentValue: {
    id: KEY,
    organisationId: KEY,
    documentId: KEY,
    registrationValueId: KEY,
    kind: IN,
    // The registration body's own code, printed on the supplier's certificate and shown today as "<code> — <label>": not a configuration key.
    codeSnapshot: IN,
    labelSnapshot: IN,
  },
  CreditorProfile: {
    id: KEY,
    organisationId: KEY,
    supplierId: KEY,
    version: IN,
    supersedesId: KEY,
    beneficiaryName: IN,
    beneficiaryAddress: IN,
    beneficiaryIdentityNo: IN,
    beneficiaryContactPerson: IN,
    beneficiaryTelephone: IN,
    beneficiaryFax: IN,
    beneficiaryTaxRegistrationNo: IN,
    beneficiaryEmail: IN,
    bankCode: IN,
    bankAccountNo: IN,
    bankAccountTypeCode: IN,
    bankSwiftCode: IN,
    bankAddress: IN,
    enteredBySupplierAccountId: KEY,
    enteredByPortalApplicationId: KEY,
    createdAt: TECH,
    submittedAt: IN,
    verification: IN,
    verifiedByPersonId: STAFF,
    verifiedOn: IN,
    verifiedAt: TECH,
    // IN only when the state is NOT_IN_ORDER; buildSupplierExport gates it.
    verificationNote: IN,
  },
  RegistrationDeclaration: {
    id: KEY,
    organisationId: KEY,
    applicationId: KEY,
    creditorProfileId: KEY,
    kind: IN,
    textId: KEY,
    textVersion: IN,
    textSha256: TECH,
    frozenTextEn: IN,
    frozenTextMs: IN,
    signatoryName: IN,
    signatoryDesignation: IN,
    signedOn: IN,
    signedAt: IN,
    signedBySupplierAccountId: KEY,
    portalApplicationId: KEY,
    noticeSha256: TECH,
    // ADR 0041 D4: the Personal Data Notice as agreed with the terms is the supplier's own agreement, exported as the wording of the other agreements is.
    noticeFrozenEn: IN,
  },
  StandingEvent: {
    id: KEY,
    organisationId: KEY,
    supplierId: KEY,
    kind: IN,
    reasonId: KEY,
    // Blank for a registration cancelled, as standingEventFacts reads it: its line is the body and the reference.
    reasonSnapshot: IN,
    effectiveOn: IN,
    endsOn: IN,
    offenceNo: IN,
    periodMonths: IN,
    requestId: KEY,
    flaggedDocumentIds: out("STAFF_ONLY"),
    checklist: out("STAFF_ONLY"),
    reinstatesEventId: KEY,
    liftsEventId: KEY,
    note: out("STAFF_ONLY"),
    recordedByPersonId: STAFF,
    recordedAt: TECH,
    cancellingBodyId: KEY,
    bodyLabelSnapshot: IN,
    externalReference: IN,
    cancelsRegistrationOn: IN,
    withdrawnAt: IN,
    withdrawnReason: out("STAFF_ONLY"),
    withdrawnByPersonId: STAFF,
  },
  DocumentPurchase: {
    id: KEY,
    organisationId: KEY,
    windowId: KEY,
    supplierId: KEY,
    buyerAccountId: KEY,
    createdAt: IN,
    amount: IN,
    checks: out("STAFF_ONLY"),
    state: IN,
    paidAt: IN,
    paidChannel: IN,
    paidMethod: IN,
    paidReference: IN,
    receiptRecordedByPersonId: STAFF,
  },
  PaymentAttempt: {
    id: KEY,
    organisationId: KEY,
    purchaseId: KEY,
    attemptNo: IN,
    method: IN,
    outcome: IN,
    reference: IN,
    failureText: IN,
    attemptedAt: IN,
    byAccountId: KEY,
  },
  PurchaseDownload: {
    id: KEY,
    organisationId: KEY,
    windowId: KEY,
    supplierId: KEY,
    purchaseId: KEY,
    accountId: KEY,
    kind: IN,
    packVersion: IN,
    partLabel: IN,
    title: IN,
    documentVersionId: KEY,
    downloadedAt: IN,
  },
  OnlineBid: {
    id: KEY,
    organisationId: KEY,
    exerciseId: KEY,
    keyId: KEY,
    envelopeId: KEY,
    supplierId: KEY,
    submittedBySupplierAccountId: KEY,
    withdrawnBySupplierAccountId: KEY,
    kind: IN,
    parentOnlineBidId: KEY,
    replacesOnlineBidId: KEY,
    status: IN,
    statusAt: IN,
    sealedManifest: out("SEALED"),
    manifestDek: out("SEALED"),
    manifestCipherSha256: out("SEALED"),
    sealedDeclaration: out("SEALED"),
    declarationDek: out("SEALED"),
    declarationCipherSha256: out("SEALED"),
    receiptDigest: IN,
    insertedXact: TECH,
    statusXact: TECH,
  },
  // Not in the plan's list of fifteen (decisions log, 2026-10-19): the document files are read from it, so it is held to the allow-list too.
  DocumentVersion: {
    id: IN,
    organisationId: KEY,
    documentId: KEY,
    versionNo: TECH,
    sha256: TECH,
    byteSize: IN,
    mediaType: IN,
    originalFilename: IN,
    receivedOn: TECH,
    recordedByPersonId: STAFF,
    recordedBySupplierAccountId: KEY,
    recordedByPortalApplicationId: KEY,
    note: out("STAFF_ONLY"),
    storedAt: IN,
    scanState: TECH,
    withdrawnAt: out("NOT_SHOWN_TODAY"),
    withdrawnReason: out("STAFF_ONLY"),
  },
  // ADR 0042, PW-19, PW-28: a contractor's Project workspace documents. The reader takes every document on the contracts the supplier holds and `buildSupplierExport` lets only what the contractor may see
  // through (`contractor-view.ts`): an organisation document it did not ask for, with no version it may see, is left out whole, and so is every version, file and remark it may not read.
  ProjectDocument: {
    id: KEY,
    organisationId: KEY,
    contractId: KEY,
    title: IN,
    note: IN,
    side: IN,
    kind: IN,
    createdByPersonId: STAFF,
    createdBySupplierAccountId: KEY,
    createdAt: IN,
  },
  ProjectDocumentVersion: {
    id: KEY,
    organisationId: KEY,
    documentId: KEY,
    number: IN,
    note: IN,
    uploadedByPersonId: STAFF,
    uploadedBySupplierAccountId: KEY,
    uploadedAt: IN,
    uploadedOn: IN,
    // The organisation's own working: whether an approver was live when it was uploaded drives what the contractor may see, and is not itself shown.
    noApproversAtUpload: TECH,
    requestId: KEY,
    signedAt: IN,
  },
  ProjectDocumentRequest: {
    id: KEY,
    organisationId: KEY,
    documentId: KEY,
    toSide: IN,
    note: IN,
    requestedByPersonId: STAFF,
    requestedBySupplierAccountId: KEY,
    requestedAt: IN,
  },
  // Shown only on a document of the contractor's own side (`contractorSeesRemarks`): the organisation's remarks on its own versions are staff-only. `buildSupplierExport` gates it. Which officer decided is never shown.
  ProjectDocumentDecision: {
    id: KEY,
    organisationId: KEY,
    versionId: KEY,
    approverId: KEY,
    outcome: IN,
    remarks: IN,
    decidedByPersonId: STAFF,
    decidedAt: TECH,
    decidedOn: IN,
  },
  // ADR 0042 D10, PW-19 (plan step 7): the kick-off meeting of a contract the supplier holds, as its portal card shows it: when, where, the agenda and the day it was held.
  // Who scheduled it and who recorded it held are never shown to the contractor. The minutes are an ordinary shared Project document, already in `ProjectDocument`.
  KickOffMeeting: {
    id: KEY,
    organisationId: KEY,
    contractId: KEY,
    meetsAt: IN,
    place: IN,
    onlineLink: IN,
    agenda: IN,
    scheduledByPersonId: STAFF,
    scheduledAt: TECH,
    heldOn: IN,
    heldRecordedByPersonId: STAFF,
    heldRecordedAt: TECH,
    minutesDocumentId: KEY,
  },
  // PW-19: attendance by the supplier's OWN accounts is IN (named by the account's contact, as the reader hands it). `buildSupplierExport` lets only those rows through:
  // the organisation's attendees and the other names are other people, not the supplier's own data, and are left out (the portal card shows them; this export does not yet).
  KickOffAttendance: {
    id: KEY,
    organisationId: KEY,
    meetingId: KEY,
    side: IN,
    personId: STAFF,
    supplierAccountId: KEY,
    name: out("NOT_YET_EXPORTED"),
  },
} as const satisfies Readonly<Record<string, Columns>>;

export type ExportModel = keyof typeof EXPORT_COLUMNS;

/// Every other model with a field typed Supplier, SupplierAccount or SupplierContact, left out as a whole. Two are listed though no field of
/// theirs names a supplier, because what they hold is a supplier's: a sealed bid's parts, and a paper bid's envelope.
export const OUT_MODELS: Readonly<Record<string, OutReason>> = {
  SupplierSession: "SECRET",
  SignInEvent: "SECRET",
  OneTimeCode: "SECRET",
  StandingRequest: "STAFF_ONLY",
  Award: "NOT_YET_EXPORTED",
  ExerciseParty: "NOT_YET_EXPORTED",
  OnlineBidFile: "SEALED",
  OnlineBidPart: "SEALED",
  // Decision 4 (decisions log, 2026-10-19): a paper bid's envelope is not on the portal.
  BidEnvelope: "NOT_SHOWN_TODAY",
  // Decision 2: the intake copy, whose words were carried onto the supplier record.
  PortalApplication: "NOT_SHOWN_TODAY",
  RegistrationDraft: "NOT_YET_EXPORTED",
  SulitAccessEvent: "TECHNICAL",
  DocumentAccessEvent: "TECHNICAL",
  SealedAccessEvent: "TECHNICAL",
  // The export's own log (N2 step 2): what was exported, when and by which account, never a value. Its audit row is on the supplier's History.
  SupplierDataExport: "TECHNICAL",
  AddendumAcknowledgement: "NOT_YET_EXPORTED",
  SiteEventRegistration: "NOT_YET_EXPORTED",
  DocumentRequest: "NOT_YET_EXPORTED",
  TenderInspectionEvent: "NOT_YET_EXPORTED",
  // Contracts: shown on the portal's projects pages; contracts' Part B is parked by the founder until after go-live.
  ContractorSubmission: "NOT_YET_EXPORTED",
  SiteDiaryEntry: "NOT_YET_EXPORTED",
  CertificateSignature: "NOT_YET_EXPORTED",
  // ADR 0045 D1, D3 (wave V): the award return lodged online and the questions on an award, shown on the portal from wave V step V4. Whether the export carries them is a later decision.
  AwardOnlineReturn: "NOT_YET_EXPORTED",
  AwardQuery: "NOT_YET_EXPORTED",
  // Phase 2 close-out stage B (ADR 0047 D1): the contractor's report that a defect line is rectified, shown on the portal's Defects tab.
  DefectEvent: "NOT_YET_EXPORTED",
  // ADR 0042 D10 (plan step 7): the kick-off meeting and who attended it are classified above (EXPORT_COLUMNS), read and exported since the act step.
};

/// The IN columns of a model, as a Prisma `select`.
export function inColumns<M extends ExportModel>(model: M): Record<string, true> {
  const select: Record<string, true> = {};
  for (const [column, c] of Object.entries(EXPORT_COLUMNS[model] as Columns)) if (c === IN) select[column] = true;
  return select;
}

/// A row cut down to its model's IN columns. The selector passes every row it is given through this first, so a reader that selects more than
/// `inColumns` (a join key, or a whole row) still cannot put an OUT column into the export.
export function pickIn<M extends ExportModel>(model: M, row: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const [column, c] of Object.entries(EXPORT_COLUMNS[model] as Columns)) if (c === IN && column in row) picked[column] = row[column];
  return picked;
}

const RELATION_ATTRS = /^\s*(@@|\/\/|$)/;

/// The scalar columns of each model in the schema's text: every field whose type, without `?` or `[]`, is not a model. Enums,
/// `String[]` and `Unsupported(...)` count as scalars.
export function schemaScalars(schema: string): Map<string, string[]> {
  const models = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));
  const out = new Map<string, string[]>();
  let model: string | null = null;
  for (const line of schema.split(/\r?\n/)) {
    const m = line.match(/^model (\w+) \{/);
    if (m) {
      model = m[1];
      out.set(model, []);
      continue;
    }
    if (line.startsWith("}")) {
      model = null;
      continue;
    }
    if (!model || RELATION_ATTRS.test(line)) continue;
    const f = line.match(/^\s+(\w+)\s+(\w+)/);
    if (!f || models.has(f[2])) continue;
    out.get(model)!.push(f[1]);
  }
  return out;
}

/// Every model with a field typed Supplier, SupplierAccount or SupplierContact (one or optional; a list is the other side of a relation).
export function supplierLinkedModels(schema: string): string[] {
  const found = new Set<string>();
  let model: string | null = null;
  for (const line of schema.split(/\r?\n/)) {
    const m = line.match(/^model (\w+) \{/);
    if (m) {
      model = m[1];
      continue;
    }
    if (line.startsWith("}")) model = null;
    if (model && /^\s+\w+\s+(Supplier|SupplierAccount|SupplierContact)\??(\s|$)/.test(line)) found.add(model);
  }
  return [...found].sort();
}

/// What is wrong with a classification against a schema's text: a column not classified, a classified column the schema lacks, a supplier-linked
/// model in neither list, a model listed that the schema lacks, or one listed in both. Empty when the lists and the schema agree.
export function classificationFaults(schema: string, columns: Readonly<Record<string, Columns>> = EXPORT_COLUMNS, outModels: Readonly<Record<string, OutReason>> = OUT_MODELS): string[] {
  const scalars = schemaScalars(schema);
  const faults: string[] = [];
  for (const [model, cols] of Object.entries(columns)) {
    const actual = scalars.get(model);
    if (!actual) {
      faults.push(`${model}: not a model in the schema`);
      continue;
    }
    for (const c of actual) if (!(c in cols)) faults.push(`${model}.${c}: not classified`);
    for (const c of Object.keys(cols)) if (!actual.includes(c)) faults.push(`${model}.${c}: classified, not in the schema`);
  }
  for (const model of Object.keys(outModels)) {
    if (!scalars.has(model)) faults.push(`${model}: listed OUT, not a model in the schema`);
    if (model in columns) faults.push(`${model}: both classified and listed OUT`);
  }
  for (const model of supplierLinkedModels(schema)) if (!(model in columns) && !(model in outModels)) faults.push(`${model}: names a supplier, in neither list`);
  return faults;
}
