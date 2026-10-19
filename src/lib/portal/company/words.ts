/**
 * The Company workspace's findings in plain words, English and Malay (AGENTS.md rule 5: no code reaches a screen). A finding the registration already words (a missing reference, an expiry in the
 * past, a bank not on the list) is worded by `registrationFaultText`; the ones new to changing things after registration are worded here. A setting that is not set is named, and says who sets it.
 */

import { formatDate } from "@/lib/format";
import { hasRegistrationFaultText, registrationFaultText } from "@/lib/portal/registration/words";
import type { RegistrationFault } from "@/lib/portal/registration/types";

import type { CompanyFault, CompanyFinding } from "./types";

export interface Words {
  en: string;
}
const w = (en: string): Words => ({ en });
type Data = Record<string, string | number | null>;
const s = (d: Data | undefined, k: string): string => (d && d[k] != null ? String(d[k]) : "");

const OWN: Readonly<Partial<Record<CompanyFault, (d: Data) => Words>>> = {
  SUPPLIER_CLOSED: () => w("Your registration was not accepted, so documents cannot be sent here."),
  NOT_ON_REGISTER: () => w("Your registration is with the procurement office. You can send a document here when the office asks for one."),
  TYPE_RETIRED: (d) => w(`The procurement office no longer asks for the ${s(d, "type")}.`),
  ALREADY_LODGED: (d) => w(`You already have a ${s(d, "type")}. Renew that one instead.`),
  RENEWS_NOTHING: () => w("That document is not on your record."),
  RENEWS_SUPERSEDED: (d) => w(`The ${s(d, "type")} has been renewed since you opened this page. Reload the page to see the latest.`),
  RENEWS_WAITING: (d) => w(`The ${s(d, "type")} you sent is waiting for the office to check it. You can send a new copy when it has been checked.`),
  RENEWAL_NOT_LATER: (d) => w(`The new ${s(d, "type")} must expire after the one it replaces, which expires on ${s(d, "expiresOn") ? formatDate(s(d, "expiresOn")) : "a later date"}.`),
  REQUEST_NOT_OPEN: () => w("The procurement office has no open request for more documents."),
  REQUEST_LAPSED: () => w("The date to answer the procurement office has passed, so the request is closed."),
  ITEM_NOT_FOUND: () => w("That is not one of the things the procurement office asked for."),
  ITEM_WAITING: () => w("You have already sent this, and the office has not checked it yet. You can send it again if the office finds it not in order."),
  EXPIRY_NOT_TAKEN: (d) => w(`The ${s(d, "type")} does not expire, so no expiry date is asked for. Clear it.`),
  REFERENCE_REQUIRED: (d) => w(`Give the reference number of the ${s(d, "type")}.`),
  AUTHORITY_REQUIRED: (d) => w(`Say who issued the ${s(d, "type")}.`),
  CHANGE_WAITING: () => w("A change to your bank details is waiting for the procurement office to check it. You can send another when it has been checked."),
  // Ruling on 1875(3): the supplier's standing bars the act, in its own words (src/lib/portal/standing-gate.ts).
  SUPPLIER_STANDING_BARS: (d) => w(s(d, "en")),
  NOT_REGISTERED_FOR_CHANGE: () => w("Your bank details are sent with your registration. You can change them here once you are on the supplier register."),
  PASSWORD_REQUIRED: () => w("Enter your password to send the change. It is signed with it."),
  UPLOADS_CLOSED: () => w("Uploads are closed. Tell the procurement office."),
};

/// A finding of the Company workspace's rules, in words.
export function companyFaultText(f: Pick<CompanyFinding, "code" | "data">): Words {
  const own = OWN[f.code];
  if (own) return own((f.data ?? {}) as Data);
  if (hasRegistrationFaultText(f.code)) return registrationFaultText({ code: f.code as RegistrationFault, data: f.data as Data | undefined });
  return w("This cannot be done as it stands.");
}

/// Whether every code a rule here can return has words (the test asks this).
export const hasCompanyFaultText = (code: string): boolean => code in OWN || hasRegistrationFaultText(code);

export interface FaultView {
  field: string | null;
  level: CompanyFinding["level"];
  message: string;
}

export const companyFaultViews = (fs: readonly CompanyFinding[]): FaultView[] =>
  fs.map((f) => {
    const t = companyFaultText(f);
    return { field: f.field ?? null, level: f.level, message: t.en };
  });
