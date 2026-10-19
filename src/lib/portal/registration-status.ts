/**
 * Where a supplier's own registration stands, in the supplier's words (FR-VND-001: application status tracking, Phase 4a). Pure: the repo reads the supplier's rows and
 * this says what they mean to the supplier. It carries the officers' decisions as the officers wrote them (FR-VND-007: the reasons as written, with each item asked for),
 * because a notice shown to the supplier in the portal is the only notice there is (nothing is sent: INT-09).
 *
 * What it never carries: the officers' names, the route's steps, a document's internal verification notes, anything about another supplier. The standing of a supplier
 * (suspended, blacklisted) is not told here: it is a separate matter with its own notice.
 */

import type { RequestReading } from "./request-reading";

export interface Words {
  en: string;
}

const w = (en: string): Words => ({ en });

export type StatusTone = "info" | "ok" | "warn" | "neutral";

export interface StatusApplication {
  id: string;
  kind: "NEW" | "RENEWAL" | "UPGRADE";
  channel: "COUNTER" | "POST" | "EMAIL" | "PORTAL";
  status: "RECEIVED" | "RESUBMISSION_REQUESTED" | "APPROVED" | "REJECTED";
  /// Days, YYYY-MM-DD.
  receivedOn: string;
  resubmitBy: string | null;
  decisions: readonly StatusDecision[];
  /// Phase 4c (FR-VND-007 online): where the office's latest request stands, derived from the documents the supplier sent against its items (`readRequest`). Absent: not read, and
  /// the application is told as waiting for the supplier.
  reading?: RequestReading;
}

export interface StatusDecision {
  id: string;
  outcome: "APPROVE" | "RESUBMIT" | "REJECT" | "LAPSE";
  decidedOn: string;
  remarks: string;
  resubmitBy: string | null;
  items: readonly { label: string; remarks: string }[];
}

export interface StatusSupplier {
  status: "APPLICANT" | "REGISTERED" | "REJECTED";
  registeredOn: string | null;
}

const KIND: Record<StatusApplication["kind"], Words> = {
  NEW: w("New registration"),
  RENEWAL: w("Renewal"),
  UPGRADE: w("Upgrade"),
};
const CHANNEL: Record<StatusApplication["channel"], Words> = {
  COUNTER: w("handed in at the counter"),
  POST: w("sent by post"),
  EMAIL: w("sent by email"),
  PORTAL: w("sent through the portal"),
};

export const applicationKindWords = (k: StatusApplication["kind"]): Words => KIND[k];
export const applicationChannelWords = (c: StatusApplication["channel"]): Words => CHANNEL[c];

/// What the office's request for more needs of the supplier, in words: the one place that says it, for the account page and the Company Overview. It is "answered" only when every item has an
/// answer that is not found not in order (before the date), or the lapse rule's own reading says so (after it).
export function requestWords(reading: RequestReading | undefined, resubmitBy: string | null, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  const r = reading ?? { kind: "WAITING" as const, needing: 0 };
  if (r.kind === "ANSWERED") {
    return {
      title: w("You have answered the office"),
      detail: w(
        "The office is checking. Nothing more to send unless it asks.",
      ),
      tone: "info",
    };
  }
  if (r.kind === "DATE_PASSED") {
    const n = r.unanswered;
    return {
      title: w("The date to answer the office has passed"),
      detail: w(
        `${n} not sent${resubmitBy ? ` by ${day(resubmitBy)}` : ""}. It will be rejected. Contact the procurement office if wrong.`,
      ),
      tone: "warn",
    };
  }
  const count = r.needing;
  return {
    title: w("The office has asked for more"),
    detail: w(
      `${resubmitBy ? `Answer by ${day(resubmitBy)} or the application is rejected.` : "Answer what it asks below."}${count > 0 ? ` ${count} waiting.` : ""}`,
    ),
    tone: "warn",
  };
}

/// The state of one application, in the supplier's words, and how much it needs the supplier to do.
export function applicationStatusWords(a: Pick<StatusApplication, "status" | "resubmitBy" | "reading">, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  switch (a.status) {
    case "RECEIVED":
      return { title: w("With the procurement office"), detail: w("Waiting for the office to decide."), tone: "info" };
    case "RESUBMISSION_REQUESTED":
      return requestWords(a.reading, a.resubmitBy, day);
    case "APPROVED":
      return { title: w("Approved"), detail: w("The office approved this application."), tone: "ok" };
    case "REJECTED":
      return { title: w("Not accepted"), detail: w("The reasons are below."), tone: "neutral" };
  }
}

export function outcomeWords(o: StatusDecision["outcome"]): Words {
  switch (o) {
    case "APPROVE":
      return w("Approved");
    case "RESUBMIT":
      return w("Resubmission requested");
    case "REJECT":
      return w("Rejected");
    case "LAPSE":
      return w("Rejected: the deadline to resubmit passed");
  }
}

/// Where the supplier stands as a registrant, in one line each way, from its status and its most recent application.
export function supplierStatusWords(s: StatusSupplier, latest: (Pick<StatusApplication, "status" | "reading"> & { resubmitBy?: string | null }) | null, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  if (s.status === "REGISTERED") {
    return { title: w("Registered"), detail: s.registeredOn ? w(`On the supplier register since ${day(s.registeredOn)}.`) : w("On the supplier register."), tone: "ok" };
  }
  if (s.status === "REJECTED") return { title: w("Application not accepted"), detail: w("You can apply again."), tone: "neutral" };
  if (latest?.status === "RESUBMISSION_REQUESTED" && latest.reading?.kind === "ANSWERED") return { title: w("With the procurement office"), detail: w("The office is checking your answer."), tone: "info" };
  if (latest?.status === "RESUBMISSION_REQUESTED" && latest.reading?.kind === "DATE_PASSED") return { title: w("The date to answer has passed"), detail: requestWords(latest.reading, latest.resubmitBy ?? null, day).detail, tone: "warn" };
  if (latest?.status === "RESUBMISSION_REQUESTED") return { title: w("Waiting for you"), detail: w("The office needs more to decide."), tone: "warn" };
  return { title: w("Application in progress"), detail: w("Your company is not on the register yet."), tone: "info" };
}
