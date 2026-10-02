/**
 * C-1 (the redesigned copy check): the paper ANGGARAN SYARIKAT in the box against the lodged version.
 * There is no check before disclosure — a verdict on a typed figure before then would let whoever asks
 * confirm a guess of the sealed figure (6.2 OD-1). Instead the officer enters what the paper says (or
 * that it was not in the box) as an input to finalising; it is compared only after every other
 * finalise check has passed, in the transaction that discloses the estimate, and both figures and
 * the outcome are frozen on the opening. A MISMATCH never refuses finalising: it, and NOT_IN_BOX, is
 * an append-only finding shown on the Schedule that holds evaluation and the award back until its
 * explanation (its own append-only record) is recorded. A refused finalise never stores, echoes or
 * depends on the typed figure (`finaliseFaults` is never handed it). Pure.
 */

import type { Sen } from "@/lib/money";

import type { CopyCheck, Finding } from "./types";

/// The paper as entered: a figure, or not in the box. Null: not answered.
export type PaperCopy = { figure: Sen } | { notInBox: true };

/// The comparison, made in the disclosing transaction only. Never called before every other check passed.
export function copyCheck(paper: PaperCopy, lodged: Sen): CopyCheck {
  if ("notInBox" in paper) return "NOT_IN_BOX";
  return paper.figure === lodged ? "MATCH" : "MISMATCH";
}

/// C-1: an unexplained MISMATCH or NOT_IN_BOX holds evaluation (6.8) and the award back.
export function copyFindingFault(check: CopyCheck | null, explained: boolean): Finding<"ESTIMATE_COPY_UNEXPLAINED"> | null {
  return (check === "MISMATCH" || check === "NOT_IN_BOX") && !explained ? { code: "ESTIMATE_COPY_UNEXPLAINED", level: "block", data: { check } } : null;
}

export type ExplanationFault = "NOT_FINALISED" | "NOTHING_TO_EXPLAIN" | "ALREADY_EXPLAINED" | "EXPLANATION_REQUIRED" | "PERSON_REQUIRED";

export function explanationFaults(i: { finalised: boolean; check: CopyCheck | null; explained: boolean; text: string; personActive: boolean }): Finding<ExplanationFault>[] {
  const out: Finding<ExplanationFault>[] = [];
  const f = (code: ExplanationFault) => out.push({ code, level: "block" });
  if (!i.finalised) f("NOT_FINALISED");
  if (i.check !== "MISMATCH" && i.check !== "NOT_IN_BOX") f("NOTHING_TO_EXPLAIN");
  if (i.explained) f("ALREADY_EXPLAINED");
  if (!i.text.trim()) f("EXPLANATION_REQUIRED");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

/// S-5: the paper copy as the Schedule and the print read it. NOT_COMPARED: a finalised main opening
/// disclosed the estimate with no comparison — a voluntary estimate whose paper copy was left
/// unanswered (BD-67-14). Null: nothing to say (not disclosed at this opening).
export type CopyReading = CopyCheck | "NOT_COMPARED";
export const copyReading = (check: CopyCheck | null, disclosedHere: boolean): CopyReading | null => check ?? (disclosedHere ? "NOT_COMPARED" : null);
export const COPY_NOT_COMPARED_LABEL = "Paper copy not compared";
export const COPY_NOT_COMPARED_TEXT = "The method does not need a company estimate; the one lodged voluntarily was disclosed at finalising, and the figure on its paper copy was not entered, so the two were not compared.";

/**
 * S-5: the Opening section's company-estimate card, never its figure. "Not needed" (the method says
 * so) and "not set" (whether it does is not configured) read differently; a voluntary estimate says
 * its paper copy may be left unanswered, and once disclosed whether the copy was compared.
 */
export function estimateCardText(i: { requires: boolean | null; state: "DRAFT" | "LODGED" | "DISCLOSED" | "VOID" | null; copyCheck: CopyCheck | null; sealedText: string }): { text: string; tone: "neutral" | "warn" | "ok" } {
  if (!i.state || i.state === "VOID") {
    if (i.requires === true) return { text: "The method needs a company estimate, and none is lodged.", tone: "warn" };
    if (i.requires === false) return { text: "Not needed: the method does not need a company estimate, and none is lodged.", tone: "neutral" };
    return { text: "None is lodged, and whether the method needs a company estimate is not set (Configuration › Scope and estimate).", tone: "warn" };
  }
  const voluntary = i.requires === false;
  if (i.state === "LODGED")
    return {
      text: voluntary
        ? `${i.sealedText}. Lodged voluntarily: the method does not need one. It is disclosed when the opening is finalised; its paper copy may be left unanswered then, and is then not compared.`
        : `${i.sealedText}. Lodged into the box; it is disclosed, and its paper copy compared, only when the opening is finalised.`,
      tone: "neutral",
    };
  if (i.state === "DISCLOSED") return { text: i.copyCheck ? "Disclosed when the opening was finalised. Its row is on the frozen schedule." : `Disclosed when the opening was finalised. Its row is on the frozen schedule. ${COPY_NOT_COMPARED_LABEL}.`, tone: "ok" };
  return { text: "Not lodged into the box yet.", tone: "warn" };
}
