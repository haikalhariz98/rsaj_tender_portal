/**
 * The online return's and the questions' refusals in plain words (ADR 0045; AGENTS.md rule 5: no code reaches a screen). One set, read by the contractor in the portal and by
 * the officer on the case: each names what can be done about it. Pure.
 */

import { projectFaultText } from "@/lib/portal/projects/words";
import type { ProjectFault } from "@/lib/portal/projects/types";

import { RETURN_SLOT_LABEL } from "./labels";
import type { DecideFault, OnlineReturnFault, QueryFault, StagedReturnFault } from "./online-return";
import type { Finding } from "./types";

export type AwardReturnFault = OnlineReturnFault | DecideFault | QueryFault | StagedReturnFault | "NOT_FOUND";

type Data = Record<string, string | number | null>;
const s = (d: Data, k: string) => String(d[k] ?? "");
const slot = (d: Data) => RETURN_SLOT_LABEL[s(d, "scan") as keyof typeof RETURN_SLOT_LABEL] ?? "A file";

const FIELD: Readonly<Record<string, string>> = { signatoryName: "The signatory's name", icNumber: "The identity card number", occupation: "The occupation", address: "The address", capacity: "The capacity", witnessName: "The witness's name" };

const TEXT: Readonly<Record<AwardReturnFault, (d: Data) => string>> = {
  NOT_FOUND: () => "That is not something you can open.",
  NOT_ISSUED: () => "The award is not issued, so this cannot be done now.",
  ALREADY_WAITING: () => "A return is already sent and being checked.",
  PAPER_STARTED: () => "The office has started recording the return from paper. Return the signed documents on paper.",
  CLASS_NOT_SET: () => "The office has not set up online returns. Return the signed documents on paper.",
  NO_ZONE: () => "The office's time zone is not set, so the day cannot be recorded. Return the signed documents on paper.",
  NOT_SIGNING_AUTHORITY: (d) => projectFaultText({ code: s(d, "fault") as ProjectFault }).en,
  SCAN_MISSING: (d) => `${slot(d)}: attach its signed scan.`,
  SCAN_NOT_TAKEN: () => "A file was sent that this award does not take.",
  PAGE_NOT_TAKEN: () => "A Letter of Acceptance has no acceptance page to type.",
  SIGNATORY_UNKNOWN: () => "Choose the signatory from your company's contacts who sign for it.",
  IC_FORMAT: () => "An identity card number is twelve digits, with or without the hyphens: 900101-14-5678.",
  PAGE_FIELD_TOO_LONG: (d) => `${FIELD[s(d, "field")] ?? "A field"} is longer than ${s(d, "max")} characters.`,
  SIGNATORY_NAME: () => "Give the signatory's name.",
  IC_NUMBER: () => "Give the signatory's identity card number.",
  OCCUPATION: () => "Give the signatory's occupation.",
  ADDRESS: () => "Give the signatory's address.",
  CAPACITY: () => "Give the capacity the signatory signs in.",
  CONTRACTOR_SIGNATURE_NOT_RECORDED: () => "Confirm the page is signed.",
  CONTRACTOR_NOT_SIGNED: () => "The page must be signed.",
  STAMP_NOT_RECORDED: () => "Confirm the company stamp is on the page.",
  STAMP_NOT_AFFIXED: () => "The page must carry the company stamp.",
  WITNESS_NAME: () => "Give the witness's name.",
  WITNESS_SIGNATURE_NOT_RECORDED: () => "Confirm the page is witnessed.",
  WITNESS_NOT_SIGNED: () => "The page must be witnessed.",
  NOT_WAITING: () => "This return has already been decided.",
  REASON_REQUIRED: () => "Say why it is refused, for the contractor to read.",
  REASON_TOO_LONG: (d) => `The reason is longer than ${s(d, "max")} characters.`,
  BODY_REQUIRED: () => "Write your question.",
  BODY_TOO_LONG: (d) => `The question is longer than ${s(d, "max")} characters.`,
  TOO_MANY_OPEN: (d) => `${s(d, "max")} questions are already waiting for an answer. Ask again once the office has answered.`,
  ALREADY_ANSWERED: () => "This question has already been answered.",
  ANSWER_REQUIRED: () => "Write the answer.",
  ANSWER_TOO_LONG: (d) => `The answer is longer than ${s(d, "max")} characters.`,
  NOT_STAGED_FOR_RETURN: (d) => `${slot(d)}: that file was not uploaded for this return. Upload it again.`,
  NOT_YOURS: (d) => `${slot(d)}: that file was not uploaded by you. Upload it again.`,
  ALREADY_ATTACHED: (d) => `${slot(d)}: that file is already used. Upload it again.`,
  WITHDRAWN: (d) => `${slot(d)}: that file was withdrawn. Upload it again.`,
  WRONG_CLASS: (d) => `${slot(d)}: that file was not uploaded for this return. Upload it again.`,
  DUPLICATE: (d) => `${slot(d)}: the same file is sent twice.`,
  FILE_UNKNOWN: (d) => `${slot(d)}: that file is not there. Upload it again.`,
};

export const awardReturnFaultText = (f: Pick<Finding<AwardReturnFault>, "code" | "data">): string => TEXT[f.code]((f.data ?? {}) as Data);
export const awardReturnFaultsText = (fs: readonly Finding<AwardReturnFault>[]): string => [...new Set(fs.map(awardReturnFaultText))].join(" ");

/// Raised inside a contractor's act (lodge, ask) so that nothing is written. `status` is what a route answers: 404 for an award that is not the supplier's, 403 for an account that
/// may not sign for the company, 409 for a return already waiting, 429 for too many questions waiting, 422 otherwise.
export class AwardReturnRefused extends Error {
  constructor(
    readonly faults: readonly Finding<AwardReturnFault>[],
    readonly status: 403 | 404 | 409 | 422 | 429 = 422,
  ) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "AwardReturnRefused";
  }
}
