/**
 * The close-out step's next line and its one main button (plan closeout-plan.md §3.2; ADR 0047 Consequences). Pure: the case page renders
 * what this says and decides nothing. Stage B's rows: practical completion, the defects liability period, the Schedule of Defects, the CMGD,
 * and the releases after it; stage D's performance report; stage C's final account, its payment and the close.
 */

import { formatDate } from "@/lib/format";
import { dayPlus } from "@/lib/dates";

import type { CloseoutFacts, CloseoutNext, StageCertificate } from "./types";

const STATE_WORDS: Readonly<Record<string, string>> = { DRAFT: "in draft", IN_ROUTING: "with its routing sheet", SIGNING: "being signed" };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const open = (c: StageCertificate | null) => !!c && c.status !== "ISSUED" && c.status !== "VOID";
const issued = (c: StageCertificate | null) => c?.status === "ISSUED";

/// The states from possession on that the close-out step reads; before them it waits.
const AFTER_POSSESSION = ["ACTIVE", "PRACTICALLY_COMPLETE", "MAKING_GOOD_COMPLETE", "FINAL_CERTIFICATE_ISSUED", "CLOSED"];

export function closeoutNext(f: CloseoutFacts): CloseoutNext {
  if (f.status === "CLOSED") return { state: "done", next: "The contract is closed", action: null };
  if (!AFTER_POSSESSION.includes(f.status)) return { state: "waiting", next: "Opens once the contract is in force", action: null };
  // Ruling 19: a contract paid on delivery order and invoice does not close in Phase 2.
  if (f.supply) return { state: "waiting", next: "Supply contracts are not closed here yet", action: null };
  const cpc = f.cpc;
  if (!cpc) return f.status === "ACTIVE" ? { state: "waiting", next: "Practical completion not certified", action: "RAISE_CPC" } : { state: "waiting", next: "Practical completion not certified", action: null };
  if (open(cpc)) return { state: "in-progress", next: `Practical completion certificate ${STATE_WORDS[cpc.status] ?? ""}`.trim(), action: "OPEN_CERTIFICATE", certificateId: cpc.id };
  if (cpc.dlp.applies === true) {
    // The period runs: defects are reported during it.
    if (f.today < cpc.dlp.endExclusive) return { state: "in-progress", next: `Defects liability period ends ${formatDate(dayPlus(cpc.dlp.endExclusive, -1))}`, action: "ADD_DEFECT" };
    if (!issued(f.cmgd)) {
      if (open(f.cmgd)) return { state: "in-progress", next: `Certificate of making good defects ${STATE_WORDS[f.cmgd!.status] ?? ""}`.trim(), action: "OPEN_CERTIFICATE", certificateId: f.cmgd!.id };
      if (f.defects.open > 0) {
        if (!f.schedule) return { state: "in-progress", next: `${plural(f.defects.open, "defect", "defects")} open at the end of the period`, action: "RAISE_SCHEDULE" };
        if (open(f.schedule)) return { state: "in-progress", next: `Schedule of Defects ${STATE_WORDS[f.schedule.status] ?? ""}`.trim(), action: "OPEN_CERTIFICATE", certificateId: f.schedule.id };
        return { state: "in-progress", next: `${plural(f.defects.open, "defect", "defects")} to make good by ${formatDate(f.schedule.rectifyBy)}`, action: null };
      }
      return { state: "in-progress", next: "Ready for the certificate of making good defects", action: "RAISE_CMGD" };
    }
  }
  // After the CMGD (or the CPC where no DLP applies): the releases its event has reached.
  if (f.retention.balanceDue && f.retention.event.state === "REACHED" && f.retention.event.event === "MAKING_GOOD") return { state: "in-progress", next: "Retention balance to release", action: "RELEASE_RETENTION" };
  const due = f.securities.find((s) => s.returnable);
  if (due) return { state: "in-progress", next: `${due.label} to return`, action: "RETURN_SECURITY" };
  // Stage D (ruling 17): the report is filed before the final certificate is sent for approval.
  if (f.performance !== "VERIFIED") return { state: "in-progress", next: f.performance === "ASSESSED" ? "Contractor performance to verify" : "Contractor performance not filed", action: "SCORE_PERFORMANCE" };
  // Stage C: the final account, its payment, the close.
  const fin = f.final;
  if (!fin) return { state: "in-progress", next: "Final account not raised", action: "RAISE_FINAL_ACCOUNT" };
  if (fin.status === "DRAFT") return { state: "in-progress", next: fin.firstMissing ?? "Final account ready to send for approval", action: fin.firstMissing ? "OPEN_FINAL_ACCOUNT" : "OPEN_CERTIFICATE", certificateId: fin.id };
  if (open(fin)) return { state: "in-progress", next: `Final certificate ${STATE_WORDS[fin.status] ?? ""}`.trim(), action: "OPEN_CERTIFICATE", certificateId: fin.id };
  if (!fin.paid) return { state: "in-progress", next: "Waiting for Finance's payment", action: "RECORD_FINAL_PAYMENT", certificateId: fin.id };
  if (f.closeBlocked) return { state: "in-progress", next: f.closeBlocked, action: null };
  return { state: "in-progress", next: "Ready to close", action: "CLOSE_CONTRACT" };
}
