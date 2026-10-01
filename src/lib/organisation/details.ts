/**
 * The organisation's identity details: what reports and letters carry.
 *
 * Only the legal name is required. Formats are checked loosely on purpose: the product
 * is resold, and a statutory body may hold neither a business registration nor a tax
 * number, so no national pattern is enforced. Hints on the form are examples, never
 * defaults, and nothing here proposes a value.
 */

export const DETAIL_FIELDS = [
  "name",
  "nameMs",
  "shortName",
  "registrationNo",
  "taxIdentificationNo",
  "sstRegistrationNo",
  "addressLine1",
  "addressLine2",
  "postcode",
  "city",
  "state",
  "country",
  "phone",
  "email",
  "website",
] as const;

export type DetailField = (typeof DETAIL_FIELDS)[number];

/// What the form posts: text as typed, absent or empty where left blank.
export type DetailsInput = Partial<Record<DetailField, string | null | undefined>>;

/// What is stored: trimmed, with blank as null. The legal name is never null.
export type Details = Record<Exclude<DetailField, "name">, string | null> & { name: string };

export const DETAIL_LABEL: Record<DetailField, string> = {
  name: "Legal name",
  nameMs: "Name in Malay",
  shortName: "Short name",
  registrationNo: "Business registration number",
  taxIdentificationNo: "Tax identification number (TIN)",
  sstRegistrationNo: "SST registration number",
  addressLine1: "Address line 1",
  addressLine2: "Address line 2",
  postcode: "Postcode",
  city: "City",
  state: "State",
  country: "Country",
  phone: "Telephone",
  email: "Email",
  website: "Website",
};

const MAX: Record<DetailField, number> = {
  name: 160,
  nameMs: 160,
  shortName: 40,
  registrationNo: 40,
  taxIdentificationNo: 20,
  sstRegistrationNo: 40,
  addressLine1: 120,
  addressLine2: 120,
  postcode: 10,
  city: 60,
  state: 60,
  country: 60,
  phone: 30,
  email: 120,
  website: 200,
};

export const NAME_MIN = 3;

const clean = (v: string | null | undefined) => (v ?? "").trim().replace(/[ \t]+/g, " ");

/// A bare domain is given https. Anything already carrying a scheme is left alone for
/// the check to judge.
function withScheme(site: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(site) ? site : `https://${site}`;
}

/// The values to store: trimmed, blank as null, a bare domain given https.
export function normaliseDetails(input: DetailsInput): Details {
  const out = {} as Record<DetailField, string | null>;
  for (const f of DETAIL_FIELDS) {
    const v = clean(input[f]);
    out[f] = v === "" ? null : v;
  }
  if (out.website) out.website = withScheme(out.website);
  return { ...out, name: out.name ?? "" } as Details;
}

const REGISTRATION = /^[A-Za-z0-9\-()/ ]+$/;
const TIN = /^[A-Za-z0-9]+$/;
const POSTCODE = /^[A-Za-z0-9\- ]+$/;
const PHONE = /^[0-9 +\-()]+$/;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function websiteFault(site: string): string | null {
  if (/^http:\/\//i.test(site)) return "Use https. Write the address as https://www.example.com.my.";
  let url: URL;
  try {
    url = new URL(site);
  } catch {
    return "That is not a web address. Write it as https://www.example.com.my.";
  }
  if (url.protocol !== "https:") return "Use an https address, for example https://www.example.com.my.";
  if (url.username || url.password) return "Leave out any user name or password from the web address.";
  if (!url.hostname.includes(".") || /\s/.test(site)) return "That is not a web address. Write it as https://www.example.com.my.";
  return null;
}

/**
 * What is wrong with the details, one plain sentence per field. Empty means they can
 * be saved. Judged on the normalised values, so a bare domain passes.
 */
export function detailsFaults(input: DetailsInput): Partial<Record<DetailField, string>> {
  const v = normaliseDetails(input);
  const faults: Partial<Record<DetailField, string>> = {};

  if (!v.name) faults.name = "Enter the legal name.";
  else if (v.name.length < NAME_MIN) faults.name = `The legal name needs at least ${NAME_MIN} characters.`;

  for (const f of DETAIL_FIELDS) {
    const text = v[f];
    if (text && text.length > MAX[f] && !faults[f]) faults[f] = `${DETAIL_LABEL[f]} can be at most ${MAX[f]} characters. This is ${text.length}.`;
  }

  const set = (f: DetailField, test: RegExp, message: string) => {
    const text = v[f];
    if (text && !faults[f] && !test.test(text)) faults[f] = message;
  };
  set("registrationNo", REGISTRATION, "Use letters, digits, spaces and - ( ) / only.");
  set("taxIdentificationNo", TIN, "Use letters and digits only, with no spaces.");
  set("postcode", POSTCODE, "Use letters, digits, spaces and hyphens only.");
  set("phone", PHONE, "Use digits, spaces and + - ( ) only.");
  set("email", EMAIL, "That does not look like an email address. Write it as name@example.com.my.");

  if (v.website && !faults.website) {
    const fault = websiteFault(v.website);
    if (fault) faults.website = fault;
  }
  return faults;
}

/// The short name shown in the shell and on headers, falling back to the legal name.
export function displayName(org: { name: string; shortName: string | null }): string {
  return org.shortName?.trim() || org.name;
}
