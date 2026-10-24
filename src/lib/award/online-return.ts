/**
 * The award return lodged online, and the contractor's questions on an issued award (ADR 0045 D1, D3; wave V plan §2.2). Pure: the store reads the rows under the award's lock
 * and asks these.
 *
 * The contractor's signing-authority account lodges the wet-signed scans (and, for a work indent, types the acceptance page); an officer verifies it into the existing return,
 * or refuses it with a reason. The received day of every item is the organisation's day when it was lodged (WV-3), never the day it was verified. Paper and online never mix
 * on one award (WV-4): a lodge is refused once paper has started, and paper is refused while a lodged return waits.
 */

import { STAGED_FOR_AWARD_RETURN } from "@/lib/documents/staged-for";

import { IC_FORMAT } from "./mask";
import { acceptancePageFaults, EMPTY_RETURN, RETURN_SCANS, type AcceptanceFault, type ReturnRecord, type ReturnScan } from "./stage-two";
import type { Finding, InstrumentKind } from "./types";

export type OnlineReturnState = "NONE" | "WAITING" | "VERIFIED" | "REFUSED";

/// What `whereHeld` reads on a return verified from an online lodge (WV-16). An officer may note where the originals are later, through the correction path.
export const LODGED_ONLINE = "Lodged online";

/// A work indent's acceptance page, as the contractor types it. Each attestation must be true to lodge.
export interface OnlineReturnPage {
  signatoryName: string;
  icNumber: string;
  occupation: string;
  address: string;
  capacity: string;
  witnessName: string;
  contractorSigned: boolean;
  stampAffixed: boolean;
  witnessSigned: boolean;
}

/// The page as the contractor's browser sends it (security review M1): the signatory is one of the supplier's own contacts who signs for it, named by id. The lodge reads the
/// contact under the lock and writes its name; a name is never taken from the browser.
export type OnlineReturnPageInput = Omit<OnlineReturnPage, "signatoryName"> & { signatoryContactId: string };

/// The longest each typed field may be: the paper form's own bounds (`recordReturn`).
export const PAGE_FIELD_MAX: Readonly<Record<"signatoryName" | "icNumber" | "occupation" | "address" | "capacity" | "witnessName", number>> = {
  signatoryName: 240,
  icNumber: 40,
  occupation: 240,
  address: 1000,
  capacity: 240,
  witnessName: 240,
};

export interface OnlineReturnFacts {
  awardStatus: string;
  instrument: InstrumentKind;
  /// The organisation's day, or null where its time zone is not set.
  today: string | null;
  /// Any paper item or page field recorded, or any live return scan on the award (`paperStarted`).
  paperStarted: boolean;
  /// An undecided online return exists.
  waiting: boolean;
  /// `DocumentStorePolicy.awardReturnClassId` set, and its class SULIT (`awardReturnClassFault`).
  classSet: boolean;
  /// `contractorSigningFaultOf`: the organisation's switch and the contact's own mark. Null: the account may sign.
  signingFault: string | null;
}

export type OnlineReturnFault =
  | "NOT_ISSUED"
  | "ALREADY_WAITING"
  | "PAPER_STARTED"
  | "CLASS_NOT_SET"
  | "NO_ZONE"
  | "NOT_SIGNING_AUTHORITY"
  /// `data.scan`: a scan the instrument asks for that was not sent.
  | "SCAN_MISSING"
  /// `data.scan`: a scan sent that the instrument does not take.
  | "SCAN_NOT_TAKEN"
  /// Page fields sent with a Letter of Acceptance, which has no acceptance page.
  | "PAGE_NOT_TAKEN"
  /// The signatory named is not a current contact of this supplier who signs for it (M1).
  | "SIGNATORY_UNKNOWN"
  | "IC_FORMAT"
  /// `data.field`, `data.max`.
  | "PAGE_FIELD_TOO_LONG"
  | Exclude<AcceptanceFault, "RECEIVED_ON">;

const block = <C extends string>(code: C, data?: Finding["data"]): Finding<C> => (data ? { code, level: "block", data } : { code, level: "block" });

/// Whether paper has started on the award (WV-4): a received day, any acceptance-page field, or a live return scan. `whereHeld` and who received it are not items.
export function paperStarted(r: ReturnRecord | null, liveReturnScans: number): boolean {
  if (liveReturnScans > 0) return true;
  if (!r) return false;
  return (
    !!r.signedLetterReceivedOn || !!r.declarationReceivedOn || !!r.authorisationReceivedOn ||
    [r.signatoryName, r.icNumber, r.occupation, r.address, r.capacity, r.witnessName].some((v) => v.trim() !== "") ||
    [r.contractorSigned, r.stampAffixed, r.witnessSigned].some((v) => v != null)
  );
}

/**
 * Every reason a lodge is refused. `scans` are the purposes sent (each once); `page` is the indent's acceptance page, or null. For a work indent with no page every field of
 * it is missing. The page reuses the paper's `acceptancePageFaults`, without RECEIVED_ON: the day is the server's.
 */
export function lodgeFaults(f: OnlineReturnFacts, i: { scans: readonly string[]; page: OnlineReturnPage | null }): Finding<OnlineReturnFault>[] {
  const out: Finding<OnlineReturnFault>[] = [];
  if (f.awardStatus !== "ISSUED") out.push(block("NOT_ISSUED"));
  if (f.waiting) out.push(block("ALREADY_WAITING"));
  if (f.paperStarted) out.push(block("PAPER_STARTED"));
  if (!f.classSet) out.push(block("CLASS_NOT_SET"));
  if (f.today == null) out.push(block("NO_ZONE"));
  if (f.signingFault) out.push(block("NOT_SIGNING_AUTHORITY", { fault: f.signingFault }));
  const wanted: readonly string[] = RETURN_SCANS[f.instrument];
  for (const s of wanted) if (!i.scans.includes(s)) out.push(block("SCAN_MISSING", { scan: s }));
  for (const s of i.scans) if (!wanted.includes(s)) out.push(block("SCAN_NOT_TAKEN", { scan: s }));
  if (f.instrument === "LETTER_OF_ACCEPTANCE") {
    if (i.page) out.push(block("PAGE_NOT_TAKEN"));
    return out;
  }
  const page = i.page;
  const rec: ReturnRecord = page ? { ...EMPTY_RETURN, ...page } : EMPTY_RETURN;
  for (const code of acceptancePageFaults(rec)) if (code !== "RECEIVED_ON") out.push(block(code));
  if (page) {
    if (page.icNumber.trim() && !IC_FORMAT.test(page.icNumber.trim())) out.push(block("IC_FORMAT"));
    for (const [field, max] of Object.entries(PAGE_FIELD_MAX)) if (page[field as keyof typeof PAGE_FIELD_MAX].length > max) out.push(block("PAGE_FIELD_TOO_LONG", { field, max }));
  }
  return out;
}

export type DecideFault = "NOT_ISSUED" | "NOT_WAITING" | "REASON_REQUIRED" | "REASON_TOO_LONG";

/// A lodged return is verified only while the award is issued and the return waits.
export function verifyFaults(f: { awardStatus: string; state: OnlineReturnState }): Finding<DecideFault>[] {
  const out: Finding<DecideFault>[] = [];
  if (f.awardStatus !== "ISSUED") out.push(block("NOT_ISSUED"));
  if (f.state !== "WAITING") out.push(block("NOT_WAITING"));
  return out;
}

/// The longest reason a refusal may give: the contractor reads it in the portal.
export const REFUSE_REASON_MAX = 2000;

/// A waiting return is refused with a reason, whatever the award's status: a waiting row is never left stuck. Nothing is attached to the award.
export function refuseFaults(f: { state: OnlineReturnState; reason: string }): Finding<DecideFault>[] {
  const out: Finding<DecideFault>[] = [];
  if (f.state !== "WAITING") out.push(block("NOT_WAITING"));
  if (!f.reason.trim()) out.push(block("REASON_REQUIRED"));
  else if (f.reason.trim().length > REFUSE_REASON_MAX) out.push(block("REASON_TOO_LONG", { max: REFUSE_REASON_MAX }));
  return out;
}

/// A lodged row as the verify act reads it. The page fields are empty, and the attestations null, on a Letter of Acceptance.
export interface OnlineReturnRow {
  submittedOn: string;
  signatoryName: string;
  icNumber: string;
  occupation: string;
  address: string;
  capacity: string;
  witnessName: string;
  contractorSigned: boolean | null;
  stampAffixed: boolean | null;
  witnessSigned: boolean | null;
}

/**
 * The `AwardReturn` fields a verified row writes. Every item's received day is `submittedOn` (WV-3): the three documents of a Letter of Acceptance, or the acceptance page of
 * an indent (kept, as on paper, in `signedLetterReceivedOn`). `whereHeld` reads "Lodged online".
 */
export function returnRecordFromOnline(instrument: InstrumentKind, row: OnlineReturnRow): ReturnRecord & { whereHeld: string } {
  if (instrument === "LETTER_OF_ACCEPTANCE") {
    return { ...EMPTY_RETURN, signedLetterReceivedOn: row.submittedOn, declarationReceivedOn: row.submittedOn, authorisationReceivedOn: row.submittedOn, whereHeld: LODGED_ONLINE };
  }
  return {
    ...EMPTY_RETURN,
    signedLetterReceivedOn: row.submittedOn,
    signatoryName: row.signatoryName,
    icNumber: row.icNumber,
    occupation: row.occupation,
    address: row.address,
    capacity: row.capacity,
    contractorSigned: row.contractorSigned,
    stampAffixed: row.stampAffixed,
    witnessName: row.witnessName,
    witnessSigned: row.witnessSigned,
    whereHeld: LODGED_ONLINE,
  };
}

/// Where the award's online return stands: the latest row lodged decides. No row: NONE.
export function onlineReturnState(rows: readonly { submittedAt: Date; verifiedAt: Date | null; refusedAt: Date | null }[]): OnlineReturnState {
  if (rows.length === 0) return "NONE";
  const latest = rows.reduce((a, b) => (b.submittedAt.getTime() > a.submittedAt.getTime() ? b : a));
  return latest.verifiedAt ? "VERIFIED" : latest.refusedAt ? "REFUSED" : "WAITING";
}

// ------------------------------------------------------------------ the staged scans a lodge pins

export type StagedReturnFault = "NOT_STAGED_FOR_RETURN" | "NOT_YOURS" | "ALREADY_ATTACHED" | "WITHDRAWN" | "WRONG_CLASS" | "DUPLICATE" | "FILE_UNKNOWN";

/// A staged store version as the lodge reads it, locked. `attachments` counts the records already holding it.
export interface StagedReturnFile {
  scan: string;
  versionId: string;
  /// False where the id is not a version of this organisation.
  known: boolean;
  stagedFor: string | null;
  recordedByPersonId: string | null;
  recordedBySupplierAccountId: string | null;
  attachments: number;
  withdrawn: boolean;
  documentClassId: string;
}

/// Each scan the lodge would pin (ADR 0045 D1): staged for an award return, by this same account, not yet attached, not withdrawn, of the return class, and not named twice. `data.scan` names it.
export function stagedReturnFileFaults(files: readonly StagedReturnFile[], accountId: string, classId: string): Finding<StagedReturnFault>[] {
  const out: Finding<StagedReturnFault>[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const add = (code: StagedReturnFault) => out.push(block(code, { scan: f.scan }));
    if (!f.known) {
      add("FILE_UNKNOWN");
      continue;
    }
    if (seen.has(f.versionId)) add("DUPLICATE");
    seen.add(f.versionId);
    if (f.stagedFor !== STAGED_FOR_AWARD_RETURN) add("NOT_STAGED_FOR_RETURN");
    if (f.recordedBySupplierAccountId !== accountId || f.recordedByPersonId !== null) add("NOT_YOURS");
    if (f.attachments > 0) add("ALREADY_ATTACHED");
    if (f.withdrawn) add("WITHDRAWN");
    if (f.documentClassId !== classId) add("WRONG_CLASS");
  }
  return out;
}

// ------------------------------------------------------------------ questions (ADR 0045 D3, WV-7)

export const QUERY_MAX = 2000;

/// The most questions an award may have waiting for an answer at once (security review L2): each is kept for ever and tells the office, so a flood is refused.
/// shortcut: a fixed bound, not a column; make it the organisation's setting if a customer ever asks for another.
export const QUERY_OPEN_MAX = 5;

export type QueryFault = "NOT_ISSUED" | "BODY_REQUIRED" | "BODY_TOO_LONG" | "TOO_MANY_OPEN" | "ALREADY_ANSWERED" | "ANSWER_REQUIRED" | "ANSWER_TOO_LONG";

/// A question is asked only while the award is issued (WV-7), and while fewer than `QUERY_OPEN_MAX` of the award's questions wait for an answer. It pauses no clock.
export function askFaults(i: { awardStatus: string; body: string; unanswered: number }): Finding<QueryFault>[] {
  const out: Finding<QueryFault>[] = [];
  if (i.awardStatus !== "ISSUED") out.push(block("NOT_ISSUED"));
  if (i.unanswered >= QUERY_OPEN_MAX) out.push(block("TOO_MANY_OPEN", { max: QUERY_OPEN_MAX }));
  if (!i.body.trim()) out.push(block("BODY_REQUIRED"));
  else if (i.body.trim().length > QUERY_MAX) out.push(block("BODY_TOO_LONG", { max: QUERY_MAX }));
  return out;
}

/// A question is answered once, in any status of the award (WV-7: NOT_ISSUED applies to asking only).
export function answerFaults(i: { answeredAt: Date | null; answer: string }): Finding<QueryFault>[] {
  const out: Finding<QueryFault>[] = [];
  if (i.answeredAt) out.push(block("ALREADY_ANSWERED"));
  if (!i.answer.trim()) out.push(block("ANSWER_REQUIRED"));
  else if (i.answer.trim().length > QUERY_MAX) out.push(block("ANSWER_TOO_LONG", { max: QUERY_MAX }));
  return out;
}

/// The scans the instrument takes, for the upload route's check of `scan`.
export const scanTaken = (instrument: InstrumentKind, scan: string): scan is ReturnScan => (RETURN_SCANS[instrument] as readonly string[]).includes(scan);
