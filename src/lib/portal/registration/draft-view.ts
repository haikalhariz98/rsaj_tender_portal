import type { CreditorInput, Draft } from "./types";
import { EMPTY_CREDITOR } from "./types";

/**
 * A registration draft as the pages show it and the rules read it (Phase 4b). Pure: the store reads the rows into this shape, and nothing here touches a table.
 */

export interface FileView {
  versionId: string;
  name: string;
  size: bigint;
  mediaType: string;
  scanState: "NOT_SCANNED" | "CLEAN" | "THREAT";
  storedAt: Date;
}

export interface DraftDocumentView {
  id: string;
  typeId: string;
  title: string;
  reference: string;
  issuingAuthority: string;
  expiresOn: string | null;
  notApplicable: boolean;
  ratePercent: string | null;
  files: FileView[];
  valueIds: string[];
}

export interface DraftView {
  /// Null while the supplier has saved nothing yet (the draft is made by the first save or upload).
  id: string | null;
  version: number;
  sentAt: Date | null;
  lastSavedAt: Date | null;
  signatoryName: string;
  signatoryDesignation: string;
  giroConfirmed: boolean;
  /// The hash of the wording the tick was made on (null while unticked).
  giroTextSha256: string | null;
  documents: DraftDocumentView[];
  /// The profile being filled in, if one is started (not yet sent).
  creditorId: string | null;
  creditor: CreditorInput;
  statement: FileView[];
}

export const emptyDraftView = (): DraftView => ({ id: null, version: 0, sentAt: null, lastSavedAt: null, signatoryName: "", signatoryDesignation: "", giroConfirmed: false, giroTextSha256: null, documents: [], creditorId: null, creditor: { ...EMPTY_CREDITOR }, statement: [] });

/// The draft as the rules read it: counts, not files.
export function draftOf(view: DraftView): Draft {
  return {
    documents: view.documents.map((d) => ({ id: d.id, typeId: d.typeId, title: d.title, reference: d.reference, issuingAuthority: d.issuingAuthority, expiresOn: d.expiresOn, notApplicable: d.notApplicable, ratePercent: d.ratePercent, fileCount: d.files.length, valueIds: d.valueIds })),
    creditor: view.creditor,
    statementCount: view.statement.length,
    signatoryName: view.signatoryName,
    signatoryDesignation: view.signatoryDesignation,
    giroConfirmed: view.giroConfirmed,
    giroTextSha256: view.giroTextSha256,
  };
}

