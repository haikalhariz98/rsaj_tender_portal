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
