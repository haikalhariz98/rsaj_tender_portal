/**
 * Where a supplier's own registration stands, in the supplier's words (FR-VND-001: application status tracking, Phase 4a). Pure: the repo reads the supplier's rows and
 * this says what they mean to the supplier. It carries the officers' decisions as the officers wrote them (FR-VND-007: the reasons as written, with each item asked for),
 * because a notice shown to the supplier in the portal is the only notice there is (nothing is sent: INT-09).
 *
 * What it never carries: the officers' names, the route's steps, a document's internal verification notes, anything about another supplier. The standing of a supplier
 * (suspended, blacklisted) is not told here: it is a separate matter with its own notice.
 */

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

/// The state of one application, in the supplier's words, and how much it needs the supplier to do.
export function applicationStatusWords(a: Pick<StatusApplication, "status" | "resubmitBy">, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  switch (a.status) {
    case "RECEIVED":
      return { title: w("With the procurement office", "Bersama pejabat perolehan"), detail: w("It has been received and is waiting for the office to decide it. Nothing more is needed from you unless the office asks.", "Ia telah diterima dan menunggu keputusan pejabat. Anda tidak perlu berbuat apa-apa lagi melainkan pejabat memintanya."), tone: "info" };
    case "RESUBMISSION_REQUESTED":
      return {
        title: w("The office has asked for more", "Pejabat meminta maklumat tambahan"),
        detail: a.resubmitBy
          ? w(`Give the office what it asks for below by ${day(a.resubmitBy)}. After that day the application is rejected.`, `Berikan kepada pejabat apa yang diminta di bawah sebelum ${day(a.resubmitBy)}. Selepas hari itu permohonan ditolak.`)
          : w("Give the office what it asks for below.", "Berikan kepada pejabat apa yang diminta di bawah."),
        tone: "warn",
      };
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
export function supplierStatusWords(s: StatusSupplier, latest: Pick<StatusApplication, "status"> | null, day: (d: string) => string): { title: Words; detail: Words; tone: StatusTone } {
  if (s.status === "REGISTERED") {
    return { title: w("Registered", "Berdaftar"), detail: s.registeredOn ? w(`On the supplier register since ${day(s.registeredOn)}.`, `Dalam daftar pembekal sejak ${day(s.registeredOn)}.`) : w("On the supplier register.", "Dalam daftar pembekal."), tone: "ok" };
  }
  if (s.status === "REJECTED") return { title: w("Application not accepted", "Permohonan tidak diterima"), detail: w("Your company is not on the register. You can apply again.", "Syarikat anda tidak berada dalam daftar. Anda boleh memohon semula."), tone: "neutral" };
  if (latest?.status === "RESUBMISSION_REQUESTED") return { title: w("Waiting for you", "Menunggu anda"), detail: w("The office has asked for more before it can decide.", "Pejabat meminta maklumat tambahan sebelum ia boleh membuat keputusan."), tone: "warn" };
  return { title: w("Application in progress", "Permohonan sedang diproses"), detail: w("Your company is not on the register yet.", "Syarikat anda belum berada dalam daftar."), tone: "info" };
}
