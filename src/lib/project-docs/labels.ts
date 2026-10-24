/**
 * The Project workspace's words (AGENTS.md rule 5: no code reaches a screen; English only). The organisation is named by its configured name, never
 * an abbreviation of a customer's. No figure about a document is worded here: no count, no days waiting (PW-4). Pure.
 *
 * The kind changes two words (PW-24): on defects rectified, which is received only and never read as acceptance, the mark TAKEN_UP reads "Noted", not
 * "Taken up". So a state or an outcome is worded with its document's kind, through `stateWords` and `outcomeWords`; `STATE_WORDS` alone is the kind-free
 * base and must not be rendered for a document with a kind.
 */

import { CASE_SECTION_WORDS, CASE_TAB_WORDS } from "@/lib/contract/case-page-words";
import { SUBMISSION_KIND_WORDS } from "@/lib/portal/projects/labels";
import { SUBMISSION_KINDS } from "@/lib/portal/projects/types";
import { projectFaultText } from "@/lib/portal/projects/words";

import type { DocumentReading, DocumentState } from "./state";
import { takenUpWhere, type TakenUpWhere } from "./taken-up";
import type { DocKind, Finding, Outcome, Side } from "./types";

export const STATE_WORDS: Readonly<Record<DocumentState, string>> = {
  REQUESTED: "Asked for",
  WAITING_FOR_APPROVAL: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SHARED: "Shared",
  RECEIVED: "Received",
  TAKEN_UP: "Taken up",
  RETURNED: "Returned",
};

/// Received only, never read as acceptance (PW-9): its mark is "Noted".
const NOTED_KINDS: readonly DocKind[] = ["DEFECTS_RECTIFIED"];
const noted = (kind: DocKind | null) => kind !== null && NOTED_KINDS.includes(kind);

/// A document's state in words, its kind taken into account (PW-24).
export const stateWords = (state: DocumentState, kind: DocKind | null): string => (state === "TAKEN_UP" && noted(kind) ? "Noted" : STATE_WORDS[state]);

const OUTCOME_BASE: Readonly<Record<Outcome, string>> = { APPROVED: "Approved", REJECTED: "Rejected", TAKEN_UP: "Taken up", RETURNED: "Returned" };

/// A decision on a version in words, its document's kind taken into account (PW-24).
export const outcomeWords = (outcome: Outcome, kind: DocKind | null): string => (outcome === "TAKEN_UP" && noted(kind) ? "Noted" : OUTCOME_BASE[outcome]);

/// The button that records a mark on a version of a kind (step 6).
export const markActionWords = (outcome: "TAKEN_UP" | "RETURNED", kind: DocKind | null): string => (outcome === "RETURNED" ? "Return" : noted(kind) ? "Mark noted" : "Mark taken up");

/// The six kinds' names, as the legacy submissions name them.
export const kindWords = (kind: DocKind): string => SUBMISSION_KIND_WORDS[kind].en;

/// The kind of document whose every version is signed with the contractor's password (PW-10, AC-30).
export const SIGNED_KIND: DocKind = "STATUTORY_DECLARATION";

/**
 * The contractor's kind picker (plan step 6): each of the six kinds by its name, and whether sending it asks the password again. The value is a form's, never shown. No hint
 * about amounts or days goes with them: a kind carries no figure (PW-10), and the earlier form's hints (`SUBMISSION_KIND_HINT`) describe the figures it took.
 */
// shortcut: SUPPLY_CLAIM is left out until wave V step V6 offers it by the contract type's payment route (ADR 0045 D6, WV-10).
export const kindChoices = (): { value: DocKind; label: string; asksPassword: boolean }[] => SUBMISSION_KINDS.filter((k) => k !== "SUPPLY_CLAIM").map((k) => ({ value: k, label: kindWords(k), asksPassword: k === SIGNED_KIND }));

/**
 * The words beside "Taken up", with the tab they link to (PW-24). Null where no screen records the kind: then nothing is said, and no button is shown.
 * Never render the words without the link.
 */
export function takenUpLink(kind: DocKind): { words: string; where: TakenUpWhere } | null {
  const where = takenUpWhere(kind);
  if (!where) return null;
  const tab = CASE_TAB_WORDS[where.tab].en;
  const section = CASE_SECTION_WORDS[`${where.tab}.${where.section}`]?.en;
  return { words: section ? `Recorded under ${tab} › ${section}` : `Recorded under ${tab}`, where };
}

export const sideWords = (side: Side, orgName: string): string => (side === "CONTRACTOR" ? "The contractor" : orgName);

/// Who the document waits on, or null when it waits on nobody.
export function waitsOnWords(r: Pick<DocumentReading, "waitsOn">, orgName: string): string | null {
  if (r.waitsOn === null) return null;
  return r.waitsOn === "CONTRACTOR" ? "Waiting on the contractor" : `Waiting on ${orgName}`;
}

export const BEING_PREPARED = (orgName: string) => `Being prepared by ${orgName}`;
export const versionLabel = (n: number) => `Version ${n}`;

// ------------------------------------------------------------------ refusals

const str = (v: string | number | null | undefined): string => (v === null || v === undefined ? "" : String(v));
const minutes = (n: number) => (n === 1 ? "1 minute" : `${n} minutes`);
const NO_AUTHORITY_WORDS = "the S.O., someone acting as the S.O., or a representative whose letter covers communicating with the contractor";
const AGAIN = "Upload it again from this form.";

/// The short statement of the unset setting, for a screen's callout; `faultText` adds where it is set.
export const CLASS_NOT_SET_LEAD = "Project files have no document class yet.";

const NOTE_FIELD: Readonly<Record<string, string>> = { document: "The document's note", version: "The version's note", request: "The request's note" };

function finalWords(state: string, kind: DocKind | null): string {
  const s = state === "TAKEN_UP" ? stateWords("TAKEN_UP", kind).toLowerCase() : "approved";
  return `This document is ${s}, so it is closed. A later change is a new document.`;
}

function notWaitingWords(state: string, kind: DocKind | null): string {
  if (kind !== null) return "A document of one of the six kinds is never approved: its versions are taken up or returned.";
  switch (state) {
    case "REJECTED":
      return "An approver has rejected this version. It waits for a new version.";
    case "APPROVED":
      return "It is already approved.";
    case "REQUESTED":
      return "It is asked for again, so there is no version to decide yet.";
    default:
      return "It is not waiting for approval.";
  }
}

const isKind = (v: unknown): v is DocKind => typeof v === "string" && v in SUBMISSION_KIND_WORDS;

/// A refusal in words. `orgName` is the organisation's configured name. An unknown code fails closed: "Refused."
export function faultText(f: Finding, orgName = "the organisation"): string {
  const d = f.data ?? {};
  const kind = isKind(d.kind) ? d.kind : null;
  // A file's place in the list, from 1; "A file" where the refusal cannot say which (the one-pin backstop, PW-37).
  const file = d.file === undefined ? "A file" : `File ${str(d.file)}`;
  switch (f.code) {
    case "NO_AUTHORITY":
      return `Only ${NO_AUTHORITY_WORDS} can do this today.`;
    case "CLASS_NOT_SET":
      return `${CLASS_NOT_SET_LEAD} An administrator sets the class for project files under Configuration › Documents.`;
    case "TITLE_REQUIRED":
      return "Give the document a title.";
    case "TITLE_TOO_LONG":
      return `The title is longer than ${str(d.limit)} characters. Shorten it.`;
    case "NOTE_TOO_LONG":
      return `${NOTE_FIELD[str(d.field)] ?? "The note"} is longer than ${str(d.limit)} characters. Shorten it.`;
    case "NO_FILES":
      return "Add at least one file.";
    case "TOO_MANY_FILES":
      return `A version holds at most ${str(d.limit)} files, and this one has ${str(d.files)}. Put the rest in another document.`;
    case "KIND_NOT_CONTRACTOR":
      return "Only the contractor picks one of the six kinds, with its own document's first version.";
    case "KIND_WITH_APPROVERS":
      return "A document with approvers cannot be one of the six kinds. Send it without a kind.";
    case "KIND_ALREADY_SET":
      return "A kind is picked only with the document's first version.";
    case "DECLARATION_NOT_SIGNED":
      return "A statutory declaration is signed with your password. Enter it to send.";
    case "APPROVERS_NOT_ORGANISATION":
      return `Only ${orgName} names approvers.`;
    case "APPROVER_NO_AUTHORITY":
      return `An approver must be ${NO_AUTHORITY_WORDS}, today. Choose someone who is.`;
    case "APPROVER_TWICE":
      return "The same person is named as an approver twice.";
    case "REQUEST_OWN_SIDE":
      return "A document is asked of the other side. To add it yourself, upload it.";
    case "OWN_SIDE":
      return "This document comes from your side. Upload a new version instead of asking for one.";
    case "NOT_YOUR_SIDE":
      return d.side === "CONTRACTOR" ? "Only the contractor uploads versions of this document." : `Only ${orgName} uploads versions of this document.`;
    case "FINAL":
      return finalWords(str(d.state), kind);
    case "ALREADY_WAITING":
      return `It is already waiting on ${d.side === "CONTRACTOR" ? "the contractor" : orgName}.`;
    case "UNDER_REVIEW":
      return d.state === "RECEIVED" ? "Its latest version is received and not yet marked. Return it to ask for a new version." : "Its latest version is waiting for approval. Reject it to ask for a new version.";
    case "NOT_ORGANISATION":
      return `Only ${orgName} can do this.`;
    case "ALREADY_APPROVER":
      return "That person is already an approver of this document.";
    case "KIND_TAKES_NO_APPROVERS":
      return "A document of one of the six kinds takes no approvers: its versions are taken up or returned.";
    case "NOT_LIVE":
      return "That approver is not on this document, or has been removed already.";
    case "DECIDED_CURRENT":
      return "That approver has decided the latest version, so they stay on it.";
    case "LAST_APPROVER":
      return "This is the document's only approver. To replace them, add the new approver first, then remove this one.";
    case "WOULD_APPROVE":
      return "Everyone else on the document has approved the latest version, so removing this approver would approve it with no decision. Add another approver first.";
    case "REASON_REQUIRED":
      return "Say why the approver is removed.";
    case "REASON_TOO_LONG":
      return `The reason is longer than ${str(d.limit)} characters. Shorten it.`;
    case "NOT_AN_APPROVER":
      return "You are not an approver of this document.";
    case "OWN_VERSION":
      return "You uploaded this version, so someone else decides it.";
    case "NOT_CURRENT":
      return "Only the latest version is decided. Reload to see it.";
    case "ALREADY_DECIDED":
      return "You have already decided this version.";
    case "NOT_WAITING":
      return notWaitingWords(str(d.state), kind);
    case "REMARKS_REQUIRED":
      return d.outcome === "RETURNED" ? "Say why it is returned: the remarks go back with it." : "Say why it is rejected: the remarks go back with it.";
    case "REMARKS_TOO_LONG":
      return `The remarks are longer than ${str(d.limit)} characters. Shorten them.`;
    case "NO_KIND":
      return "Only a document of one of the six kinds is taken up or returned.";
    case "ALREADY_MARKED":
      return "This version is already marked.";
    case "TOO_MANY_FILES_IN_WINDOW":
      return `This account has uploaded ${str(d.limit)} files in the last ${minutes(Number(d.minutes))}, the most allowed. Try again in ${minutes(Number(d.retryInMinutes))}.`;
    case "TOO_MANY_BYTES_IN_WINDOW":
      return d.retryInMinutes === null || d.retryInMinutes === undefined
        ? `This file is larger than ${str(d.limitMiB)} MiB, the most one account may upload in ${minutes(Number(d.minutes))}.`
        : `This file would take this account past ${str(d.limitMiB)} MiB uploaded in the last ${minutes(Number(d.minutes))}, the most allowed. Try again in ${minutes(Number(d.retryInMinutes))}.`;
    case "NOT_STAGED_FOR_PROJECT":
      return `${file} was not uploaded for a project document. ${AGAIN}`;
    case "NOT_YOURS":
      return `${file} was uploaded by someone else. ${AGAIN}`;
    case "ALREADY_ATTACHED":
      return `${file} is already attached to a record. ${AGAIN}`;
    case "WITHDRAWN":
      return `${file} was withdrawn. ${AGAIN}`;
    case "WRONG_CLASS":
      return `${file} is not in the class for project files. ${AGAIN}`;
    case "DUPLICATE":
      return `${file} is named twice.`;
    case "NOT_FOUND":
      return "That document is not on this contract.";
    case "ZONE_NOT_SET":
      return "Time zone not set. An administrator sets it under Configuration › Organisation.";
    case "FILE_UNKNOWN":
      return `${file} was not found. ${AGAIN}`;
    case "FILE_REFUSED":
      return `${file} cannot be attached: ${str(d.words)}`;
    case "FILE_NOT_FOR_CONTRACTOR":
      return `${file} is unclassified or SULIT, and the contractor downloads project files. ${AGAIN}`;
    // Who may bind the contractor with a statutory declaration from the portal (the organisation's switch, then the contact's own mark): the earlier submission's words.
    case "PORTAL_SIGNING_NOT_SET":
    case "PORTAL_SIGNING_OFF":
    case "SIGNER_NOT_AUTHORISED_NOT_SET":
    case "SIGNER_NOT_AUTHORISED":
      return projectFaultText({ code: f.code }).en;
    default:
      return "Refused.";
  }
}

/// A refusal of an act: the lead, then each fault's words.
export const refusalText = (lead: string, faults: readonly Finding[], orgName = "the organisation"): string => [lead, ...faults.map((f) => faultText(f, orgName))].join(" ");
