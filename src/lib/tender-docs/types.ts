/**
 * The vocabulary of tender and quotation document preparation (spec §6.4, plan 6.4), as
 * pure types. Mirrors the Prisma enums so `src/lib/tender-docs/**` stays free of the
 * client, as the other lib modules do. Every rule about a pack lives beside this file;
 * actions and screens call it and never restate it.
 */

import type { ExerciseStatus, PackKind, Provenance } from "@/lib/method/types";

export type { ExerciseStatus, PackKind, Provenance };

export const PACK_KINDS: readonly PackKind[] = ["TENDER", "QUOTATION", "NONE"];

/// What a part is, so a rule can recognise it (closed product vocabulary, BD-DS-4 precedent).
export const PART_ROLES = [
  "INVITATION",
  "INSTRUCTIONS",
  "FORM_OF_TENDER",
  "CONDITIONS",
  "APPENDIX",
  "LOA_SPECIMEN",
  "BOND_FORMS",
  "SPECIFICATION",
  "BILL_OF_QUANTITIES",
  "SUMMARY_AND_RATES",
  "REGISTRATION_BACKGROUND",
  "DECLARATION",
  "DRAWINGS",
  "OTHER",
] as const;
export type PartRole = (typeof PART_ROLES)[number];

export const PART_CONTENTS = ["STANDARD", "BESPOKE", "MIXED"] as const;
export type PartContent = (typeof PART_CONTENTS)[number];

export const PART_SOURCES = ["TEMPLATE", "BQ_UNPRICED", "APPENDIX", "UPLOAD"] as const;
export type PartSource = (typeof PART_SOURCES)[number];

export const TENDER_PACK_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED", "VOID"] as const;
export type TenderPackStatus = (typeof TENDER_PACK_STATUSES)[number];

export const PACK_PART_STATES = ["NOT_STARTED", "READY", "OMITTED"] as const;
export type PackPartState = (typeof PACK_PART_STATES)[number];

export type LadKind = "AMOUNT_PER_DAY" | "PERCENT_OF_SUM_PER_DAY";
export type UpliftKind = "AMOUNT" | "PERCENT";
export type AppendixStatus = "DRAFT" | "COMPLETE";
export type DocumentLanguage = "MS" | "EN";

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (labels, counts, days; never a code shown as such).
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

/// A part as the customer configures it (TenderDocumentPart).
export interface ConfiguredPart {
  code: string;
  packKind: PackKind;
  /// Null: the part applies on any basis.
  contractBasisCode: string | null;
  printedNumber: string;
  sortOrder: number;
  labelEn: string;
  labelMs: string | null;
  role: PartRole;
  content: PartContent;
  source: PartSource;
  mandatory: boolean | null;
  inTableDocument: boolean | null;
  /// 6.7 (6.6 ruling): whether a bidder returns the part with its bid, with its own provenance.
  /// Absent or null: not set. Snapshotted onto the pack part when a pack starts, as `mandatory` is.
  returnedByBidder?: boolean | null;
  returnedByBidderProvenance?: Provenance | null;
  ownerOrgUnitCode: string | null;
  templateCode: string | null;
  /// SR-11 (ruling 14): the template file an officer downloads for the part, a version in the document store. Absent or null: no template set.
  templateFileVersionId?: string | null;
  governingSource: string;
  provenance: Provenance;
  /// The organisation's day it was retired on, or null.
  retiredOn: string | null;
}

/// A part as resolved for one pack kind and basis: what a pack's composition snapshot holds.
export type ResolvedPart = Omit<ConfiguredPart, "packKind" | "retiredOn">;

/// A library template as a pack part reads it (DocumentTemplate).
export interface TemplateFacts {
  id: string;
  code: string;
  nameEn: string;
  formCode: string;
  revisionDate: string | null;
  bodyEn: string | null;
  bodyMs: string | null;
  primaryLanguage: DocumentLanguage | null;
  bodyVersion: number;
}

/// A pack's part as the rules see it.
export interface PackPartFacts {
  partCode: string;
  printedNumber: string;
  sortOrder: number;
  label: string;
  role: PartRole;
  content: PartContent;
  source: PartSource;
  mandatory: boolean | null;
  inTableDocument: boolean | null;
  /// 6.7 (6.6 ruling): as snapshotted when the pack started. Absent or null: not set.
  returnedByBidder?: boolean | null;
  returnedByBidderProvenance?: Provenance | null;
  templateCode: string | null;
  /// The template picked for this pack (by default the configured one), or null.
  template: TemplateFacts | null;
  state: PackPartState;
  omittedReason: string;
  /// Live attachments of the part's file (an UPLOAD part), as the document store counts them.
  liveUploads: number;
}
