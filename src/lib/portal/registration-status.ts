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
  ms: string;
}

const w = (en: string, ms: string): Words => ({ en, ms });

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
  NEW: w("New registration", "Pendaftaran baharu"),
  RENEWAL: w("Renewal", "Pembaharuan"),
  UPGRADE: w("Upgrade", "Peningkatan"),
};
const CHANNEL: Record<StatusApplication["channel"], Words> = {
  COUNTER: w("handed in at the counter", "diserahkan di kaunter"),
  POST: w("sent by post", "dihantar melalui pos"),
  EMAIL: w("sent by email", "dihantar melalui e-mel"),
  PORTAL: w("sent through the portal", "dihantar melalui portal"),
};

export const applicationKindWords = (k: StatusApplication["kind"]): Words => KIND[k];
export const applicationChannelWords = (c: StatusApplication["channel"]): Words => CHANNEL[c];

/// What the office's request for more needs of the supplier, in words: the one place that says it, for the account page and the Company Overview. It is "answered" only when every item has an
/// answer that is not found not in order (before the date), or the lapse rule's own reading says so (after it).
export function requestWords(reading: RequestReading | undefined, resubmitBy: string | null, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  const r = reading ?? { kind: "WAITING" as const, needing: 0 };
  if (r.kind === "ANSWERED") {
    return {
      title: w("You have answered the office", "Anda telah menjawab pejabat"),
      detail: w(
        "You sent a document for everything the office asked for. The office is checking them and decides what happens next. You do not need to do anything more unless it asks again.",
        "Anda telah menghantar dokumen bagi setiap yang diminta pejabat. Pejabat sedang menyemaknya dan memutuskan langkah seterusnya. Anda tidak perlu berbuat apa-apa lagi melainkan pejabat memintanya semula.",
      ),
      tone: "info",
    };
  }
  if (r.kind === "DATE_PASSED") {
    const n = r.unanswered;
    return {
      title: w("The date to answer the office has passed", "Tarikh untuk menjawab pejabat telah berlalu"),
      detail: w(
        `The date the office gave${resubmitBy ? ` (${day(resubmitBy)})` : ""} has passed and ${n} of the things it asked for ${n === 1 ? "was" : "were"} not sent. The application is rejected once the office records it. Contact the procurement office if you think this is wrong.`,
        `Tarikh yang diberikan pejabat${resubmitBy ? ` (${day(resubmitBy)})` : ""} telah berlalu dan ${n} daripada perkara yang diminta tidak dihantar. Permohonan ditolak sebaik sahaja pejabat merekodkannya. Hubungi pejabat perolehan jika anda fikir ini tidak betul.`,
      ),
      tone: "warn",
    };
  }
  const count = r.needing;
  return {
    title: w("The office has asked for more", "Pejabat meminta maklumat tambahan"),
    detail: w(
      `${resubmitBy ? `Give the office what it asks for below by ${day(resubmitBy)}. After that day the application is rejected.` : "Give the office what it asks for below."}${count > 0 ? ` ${count} ${count === 1 ? "thing is" : "things are"} waiting for you.` : ""}`,
      `${resubmitBy ? `Berikan kepada pejabat apa yang diminta di bawah sebelum ${day(resubmitBy)}. Selepas hari itu permohonan ditolak.` : "Berikan kepada pejabat apa yang diminta di bawah."}${count > 0 ? ` ${count} perkara menunggu anda.` : ""}`,
    ),
    tone: "warn",
  };
}

/// The state of one application, in the supplier's words, and how much it needs the supplier to do.
export function applicationStatusWords(a: Pick<StatusApplication, "status" | "resubmitBy" | "reading">, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  switch (a.status) {
    case "RECEIVED":
      return { title: w("With the procurement office", "Bersama pejabat perolehan"), detail: w("It has been received and is waiting for the office to decide it. Nothing more is needed from you unless the office asks.", "Ia telah diterima dan menunggu keputusan pejabat. Anda tidak perlu berbuat apa-apa lagi melainkan pejabat memintanya."), tone: "info" };
    case "RESUBMISSION_REQUESTED":
      return requestWords(a.reading, a.resubmitBy, day);
    case "APPROVED":
      return { title: w("Approved", "Diluluskan"), detail: w("The office approved this application.", "Pejabat telah meluluskan permohonan ini."), tone: "ok" };
    case "REJECTED":
      return { title: w("Not accepted", "Tidak diterima"), detail: w("The office did not accept this application. The reasons it gave are below.", "Pejabat tidak menerima permohonan ini. Sebab yang diberikan adalah di bawah."), tone: "neutral" };
  }
}

export function outcomeWords(o: StatusDecision["outcome"]): Words {
  switch (o) {
    case "APPROVE":
      return w("Approved", "Diluluskan");
    case "RESUBMIT":
      return w("Resubmission requested", "Penghantaran semula diminta");
    case "REJECT":
      return w("Rejected", "Ditolak");
    case "LAPSE":
      return w("Rejected: the deadline to resubmit passed", "Ditolak: tarikh akhir penghantaran semula telah berlalu");
  }
}

/// Where the supplier stands as a registrant, in one line each way, from its status and its most recent application.
export function supplierStatusWords(s: StatusSupplier, latest: (Pick<StatusApplication, "status" | "reading"> & { resubmitBy?: string | null }) | null, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  if (s.status === "REGISTERED") {
    return { title: w("Registered", "Berdaftar"), detail: s.registeredOn ? w(`On the supplier register since ${day(s.registeredOn)}.`, `Dalam daftar pembekal sejak ${day(s.registeredOn)}.`) : w("On the supplier register.", "Dalam daftar pembekal."), tone: "ok" };
  }
  if (s.status === "REJECTED") return { title: w("Application not accepted", "Permohonan tidak diterima"), detail: w("Your company is not on the register. You can apply again.", "Syarikat anda tidak berada dalam daftar. Anda boleh memohon semula."), tone: "neutral" };
  if (latest?.status === "RESUBMISSION_REQUESTED" && latest.reading?.kind === "ANSWERED") return { title: w("With the procurement office", "Bersama pejabat perolehan"), detail: w("You have answered what the office asked for, and it is checking it.", "Anda telah menjawab apa yang diminta pejabat, dan ia sedang menyemaknya."), tone: "info" };
  if (latest?.status === "RESUBMISSION_REQUESTED" && latest.reading?.kind === "DATE_PASSED") return { title: w("The date to answer has passed", "Tarikh untuk menjawab telah berlalu"), detail: requestWords(latest.reading, latest.resubmitBy ?? null, day).detail, tone: "warn" };
  if (latest?.status === "RESUBMISSION_REQUESTED") return { title: w("Waiting for you", "Menunggu anda"), detail: w("The office has asked for more before it can decide.", "Pejabat meminta maklumat tambahan sebelum ia boleh membuat keputusan."), tone: "warn" };
  return { title: w("Application in progress", "Permohonan sedang diproses"), detail: w("Your company is not on the register yet.", "Syarikat anda belum berada dalam daftar."), tone: "info" };
}
