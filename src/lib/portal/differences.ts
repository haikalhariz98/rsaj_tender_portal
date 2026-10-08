/**
 * What an officer changed between the applicant's words and the supplier the register now holds (Phase 4a; CPD's registration, ruling 6: "acceptance must stop erasing the
 * applicant's words"). The online application keeps what was typed; the officer checks it against the certificate and corrects it when recording the supplier; this lists
 * every field where the two differ, so the page can show the applicant's words beside the register's entry and nothing the officer changed is hidden.
 *
 * Pure. A list or code is compared by the code and shown by its name (a screen never shows a code, AGENTS.md rule 5); text is compared as a reader would, ignoring spaces
 * at the ends and between words and the case of the registration number (the register's own comparison, `normaliseRegistrationNo`).
 */

export interface CompanyWords {
  registeredName: string;
  registrationNo: string;
  entityTypeCode: string;
  countryCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  stateCode: string;
  bumiputeraClaimCode: string;
  /// YYYY-MM-DD, or null where none was given.
  incorporatedOn: string | null;
  companyEmail: string;
}

export interface ContactWords {
  name: string;
  designation: string;
  email: string;
  phone: string;
}

export interface Difference {
  label: string;
  applicant: string;
  register: string;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const same = (a: string, b: string) => clean(a) === clean(b);

/// How a field's value reads on the screen: a name for a coded field, "Not given" for nothing.
export interface DifferenceNames {
  /// The list's name for a code (null where it is no longer listed). `kind` is the list.
  nameOf: (kind: "ENTITY_TYPE" | "COUNTRY" | "STATE" | "BUMIPUTERA_STATUS", code: string) => string | null;
  /// Day shown as the screen shows days.
  day: (d: string) => string;
}

const NOT_GIVEN = "Not given";

export function companyDifferences(applicant: CompanyWords, register: CompanyWords, names: DifferenceNames): Difference[] {
  const out: Difference[] = [];
  const text = (label: string, a: string, r: string, eq: (x: string, y: string) => boolean = same) => {
    if (!eq(a, r)) out.push({ label, applicant: clean(a) || NOT_GIVEN, register: clean(r) || NOT_GIVEN });
  };
  const coded = (label: string, kind: Parameters<DifferenceNames["nameOf"]>[0], a: string, r: string) => {
    if (a !== r) out.push({ label, applicant: a ? (names.nameOf(kind, a) ?? "A value no longer listed") : NOT_GIVEN, register: r ? (names.nameOf(kind, r) ?? "A value no longer listed") : NOT_GIVEN });
  };
  text("Registered name", applicant.registeredName, register.registeredName);
  text("Registration number", applicant.registrationNo, register.registrationNo, (x, y) => clean(x).toUpperCase() === clean(y).toUpperCase());
  coded("Type of company", "ENTITY_TYPE", applicant.entityTypeCode, register.entityTypeCode);
  coded("Country", "COUNTRY", applicant.countryCode, register.countryCode);
  text("Street address", applicant.addressLine1, register.addressLine1);
  text("Street address, second line", applicant.addressLine2, register.addressLine2);
  text("City", applicant.city, register.city);
  text("Postcode", applicant.postcode, register.postcode);
  coded("State", "STATE", applicant.stateCode, register.stateCode);
  if (applicant.incorporatedOn !== register.incorporatedOn) {
    out.push({ label: "Date incorporated", applicant: applicant.incorporatedOn ? names.day(applicant.incorporatedOn) : NOT_GIVEN, register: register.incorporatedOn ? names.day(register.incorporatedOn) : NOT_GIVEN });
  }
  coded("Bumiputera status (declared)", "BUMIPUTERA_STATUS", applicant.bumiputeraClaimCode, register.bumiputeraClaimCode);
  text("Company email", applicant.companyEmail, register.companyEmail, (x, y) => clean(x).toLowerCase() === clean(y).toLowerCase());
  return out;
}

/// The same for the primary contact. SULIT: the caller asks this only for a reader the contact's details are open to.
export function contactDifferences(applicant: ContactWords, register: ContactWords): Difference[] {
  const out: Difference[] = [];
  const text = (label: string, a: string, r: string, eq: (x: string, y: string) => boolean = same) => {
    if (!eq(a, r)) out.push({ label, applicant: clean(a) || NOT_GIVEN, register: clean(r) || NOT_GIVEN });
  };
  text("Contact's name", applicant.name, register.name);
  text("Contact's position", applicant.designation, register.designation);
  text("Contact's email", applicant.email, register.email, (x, y) => clean(x).toLowerCase() === clean(y).toLowerCase());
  text("Contact's telephone", applicant.phone, register.phone);
  return out;
}
