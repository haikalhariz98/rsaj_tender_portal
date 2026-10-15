/**
 * What a refusal the database makes of a submit or a withdraw is said as (ADR 0036 D5, D7, rulings 20aa, 20h; build plan step 10). Pure.
 *
 * The door has already judged every rule it knows under the locks, so a refusal that still comes from the database is either the stamp having gone stale while the act waited on the
 * locks (the lock-wait edge, 20aa), a rival that committed first, or a defect or a forged row. None is thrown at the supplier: each is said in words, nothing was recorded, and
 * none counts toward any lockout. It is mapped by the statement it came from as well as by its SQLSTATE:
 *  - PA010, on the submit's envelope insert, is a stamp older than the skew at the moment of the insert: STAMP_STALE;
 *  - PA012, on the withdrawal's status move of its target, is the same for a withdrawal: STAMP_STALE;
 *  - PA027 is a rival's standing bid that committed first: LIVE_BID_HELD. (A stricter isolation level would also raise it. That is a defect, not a bid the supplier holds, and the act sets no
 *    isolation, which a test pins);
 *  - every other sealed SQLSTATE, and those two anywhere else, is NOT_TAKEN. The SQLSTATE goes to the server log, never to the body.
 */

import type { SubmitFault, WithdrawFault } from "./types";

/// The writes of a submit, in the order they are made, and the commit after them.
export type SubmitStep = "DOORS" | "ENVELOPE" | "BID" | "PARTS" | "FILES" | "REPLACED" | "ENVELOPE_FOLLOWS" | "REPOINT" | "ATTRIBUTION" | "RECORD" | "COMMIT";
/// The writes of a withdrawal, in order.
export type WithdrawStep = "DOORS" | "TARGET" | "TARGET_ENVELOPE" | "ALTERNATIVES" | "LINKS" | "ATTRIBUTION" | "RECORD" | "COMMIT";

export function submitFaultOfRefusal(sqlState: string, step: SubmitStep): Extract<SubmitFault, "STAMP_STALE" | "LIVE_BID_HELD" | "NOT_TAKEN"> {
  if (sqlState === "PA010" && step === "ENVELOPE") return "STAMP_STALE";
  if (sqlState === "PA027") return "LIVE_BID_HELD";
  return "NOT_TAKEN";
}

export function withdrawFaultOfRefusal(sqlState: string, step: WithdrawStep): Extract<WithdrawFault, "STAMP_STALE" | "NOT_TAKEN"> {
  if (sqlState === "PA012" && step === "TARGET") return "STAMP_STALE";
  return "NOT_TAKEN";
}
