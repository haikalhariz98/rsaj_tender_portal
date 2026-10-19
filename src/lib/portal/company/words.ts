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
  SUPPLIER_CLOSED: () => w("Registration not accepted. Documents cannot be sent."),
  NOT_ON_REGISTER: () => w("Send documents when the procurement office asks."),
  TYPE_RETIRED: (d) => w(`The procurement office no longer asks for the ${s(d, "type")}.`),
  ALREADY_LODGED: (d) => w(`You already have a ${s(d, "type")}. Renew that one instead.`),
  RENEWS_NOTHING: () => w("That document is not on your record."),
  RENEWS_SUPERSEDED: (d) => w(`The ${s(d, "type")} has been renewed since you opened this page. Reload.`),
  RENEWS_WAITING: (d) => w(`The ${s(d, "type")} is waiting for an officer to check it. Send a new copy once checked.`),
  RENEWAL_NOT_LATER: (d) => w(`The new ${s(d, "type")} must expire after the one it replaces, which expires on ${s(d, "expiresOn") ? formatDate(s(d, "expiresOn")) : "a later date"}.`),
  REQUEST_NOT_OPEN: () => w("The procurement office has no open request for more documents."),
  REQUEST_LAPSED: () => w("The answer date has passed. The request is closed."),
  ITEM_NOT_FOUND: () => w("The procurement office did not ask for that."),
  ITEM_WAITING: () => w("Already sent, not yet checked. Send again only if not in order."),
  EXPIRY_NOT_TAKEN: (d) => w(`The ${s(d, "type")} does not expire, so no expiry date is asked for. Clear it.`),
  REFERENCE_REQUIRED: (d) => w(`Give the reference number of the ${s(d, "type")}.`),
  AUTHORITY_REQUIRED: (d) => w(`Say who issued the ${s(d, "type")}.`),
  CHANGE_WAITING: () => w("A bank change is waiting for an officer. Send another once checked."),
  // Ruling on 1875(3): the supplier's standing bars the act, in its own words (src/lib/portal/standing-gate.ts).
  SUPPLIER_STANDING_BARS: (d) => w(s(d, "en")),
  NOT_REGISTERED_FOR_CHANGE: () => w("Bank details go with registration. Change them once registered."),
  PASSWORD_REQUIRED: () => w("Enter your password to sign the change."),
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
