/**
 * Parsing what the sign-in screens submit, in one place per form (the edge rule: parsed and narrowed before it reaches a service, unknown
 * fields refused, a structured error back). No schema library is installed, so this is by hand, in the shape of `api/authority/resolve`.
 *
 * Pure: it takes the submitted entries as a list of [name, value]. A value that is not text (a file) is refused. A password is never
 * trimmed or changed, and is never put in an error message.
 */

export type Entries = Iterable<[string, FormDataEntryValue]>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const NAME_MAX = 128;
const SECRET_MAX = 1024;
const CODE_MAX = 64;

/// Fields React and Next add to a form that is posted as an action (`$ACTION_ID_…`, `$ACTION_REF_…`, `$ACTION_KEY`). They are the framework's, not the user's.
const isFramework = (name: string) => name.startsWith("$ACTION");

function collect(entries: Entries, allowed: readonly string[]): { values: Map<string, string>; errors: Record<string, string> } {
  const values = new Map<string, string>();
  const errors: Record<string, string> = {};
  for (const [name, value] of entries) {
    if (isFramework(name)) continue;
    if (!allowed.includes(name)) {
      // Named, so the caller can see what was sent that the form does not take; the value is not echoed.
      errors[name] = "This form does not take this field.";
      continue;
    }
    if (typeof value !== "string") {
      errors[name] = "This field takes text.";
      continue;
    }
    if (values.has(name)) errors[name] = "This field was sent more than once.";
    values.set(name, value);
  }
  return { values, errors };
}

function text(values: Map<string, string>, errors: Record<string, string>, name: string, label: string, opts: { max: number; trim?: boolean }): string {
  const raw = values.get(name);
  if (raw === undefined || raw === "") {
    errors[name] ??= `${label} is needed.`;
    return "";
  }
  const value = opts.trim ? raw.trim() : raw;
  if (value === "") errors[name] ??= `${label} is needed.`;
  if ([...value].length > opts.max) errors[name] ??= `${label} is too long.`;
  return value;
}

const done = <T>(errors: Record<string, string>, value: T): Parsed<T> => (Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value });

export interface SignInForm {
  loginName: string;
  password: string;
}
export function parseSignIn(entries: Entries): Parsed<SignInForm> {
  const { values, errors } = collect(entries, ["loginName", "password"]);
  const loginName = text(values, errors, "loginName", "The sign-in name", { max: NAME_MAX, trim: true });
  const password = text(values, errors, "password", "The password", { max: SECRET_MAX });
  return done(errors, { loginName, password });
}

export interface CodeForm {
  loginName: string;
  code: string;
  password: string;
  confirm: string;
}
export function parseCodeForm(entries: Entries): Parsed<CodeForm> {
  const { values, errors } = collect(entries, ["loginName", "code", "password", "confirm"]);
  const loginName = text(values, errors, "loginName", "The sign-in name", { max: NAME_MAX, trim: true });
  const code = text(values, errors, "code", "The code", { max: CODE_MAX, trim: true });
  const password = text(values, errors, "password", "The new password", { max: SECRET_MAX });
  const confirm = text(values, errors, "confirm", "The new password, again", { max: SECRET_MAX });
  if (password && confirm && password !== confirm) errors.confirm ??= "The two passwords are not the same.";
  return done(errors, { loginName, code, password, confirm });
}

export interface ChangePasswordForm {
  current: string;
  password: string;
  confirm: string;
}
export function parseChangePassword(entries: Entries): Parsed<ChangePasswordForm> {
  const { values, errors } = collect(entries, ["current", "password", "confirm"]);
  const current = text(values, errors, "current", "The current password", { max: SECRET_MAX });
  const password = text(values, errors, "password", "The new password", { max: SECRET_MAX });
  const confirm = text(values, errors, "confirm", "The new password, again", { max: SECRET_MAX });
  if (password && confirm && password !== confirm) errors.confirm ??= "The two passwords are not the same.";
  return done(errors, { current, password, confirm });
}

/// A form with no fields of its own (sign out, sign out everywhere, acknowledge): anything it carries beyond the framework's is refused.
export function parseNoFields(entries: Entries): Parsed<Record<string, never>> {
  const { errors } = collect(entries, []);
  return done(errors, {});
}

// ---------------------------------------------------------------------------------------------- account administration (Phase 1b)

const REASON_MAX = 2000;
const ID_MAX = 64;

export interface CreateAccountForm {
  personId: string;
  loginName: string;
}
export function parseCreateAccount(entries: Entries): Parsed<CreateAccountForm> {
  const { values, errors } = collect(entries, ["personId", "loginName"]);
  const personId = text(values, errors, "personId", "The person", { max: ID_MAX, trim: true });
  const loginName = text(values, errors, "loginName", "The sign-in name", { max: NAME_MAX, trim: true });
  return done(errors, { personId, loginName });
}

/// An act on one account with a reason (disable, put back, unlock). The account is named by id; the reason is the only account of why.
export interface AccountActForm {
  accountId: string;
  reason: string;
}
export function parseAccountAct(entries: Entries): Parsed<AccountActForm> {
  const { values, errors } = collect(entries, ["accountId", "reason"]);
  const accountId = text(values, errors, "accountId", "The account", { max: ID_MAX, trim: true });
  const reason = text(values, errors, "reason", "The reason", { max: REASON_MAX, trim: true });
  return done(errors, { accountId, reason });
}

export interface IssueCodeForm extends AccountActForm {
  purpose: "ACTIVATION" | "RESET";
}
export function parseIssueCode(entries: Entries): Parsed<IssueCodeForm> {
  const { values, errors } = collect(entries, ["accountId", "purpose", "reason"]);
  const accountId = text(values, errors, "accountId", "The account", { max: ID_MAX, trim: true });
  const reason = text(values, errors, "reason", "The reason", { max: REASON_MAX, trim: true });
  const purposeText = text(values, errors, "purpose", "What the code is for", { max: 16, trim: true });
  if (purposeText && purposeText !== "ACTIVATION" && purposeText !== "RESET") errors.purpose ??= "A code is for activating an account or for resetting a password.";
  return done(errors, { accountId, reason, purpose: purposeText === "RESET" ? "RESET" : "ACTIVATION" });
}

// ---------------------------------------------------------------------------------------------- a supplier's portal account (Phase 4a)

const CHECK_MAX = 1000;

/// An officer opens the portal account of one of a supplier's contacts: which supplier and contact, the sign-in name, and how the caller's identity was checked.
export interface OpenSupplierAccountForm {
  supplierId: string;
  contactId: string;
  loginName: string;
  identityCheck: string;
}
export function parseOpenSupplierAccount(entries: Entries): Parsed<OpenSupplierAccountForm> {
  const { values, errors } = collect(entries, ["supplierId", "contactId", "loginName", "identityCheck"]);
  const supplierId = text(values, errors, "supplierId", "The supplier", { max: ID_MAX, trim: true });
  const contactId = text(values, errors, "contactId", "The contact", { max: ID_MAX, trim: true });
  const loginName = text(values, errors, "loginName", "The sign-in name", { max: NAME_MAX, trim: true });
  const identityCheck = text(values, errors, "identityCheck", "How the caller's identity was checked", { max: CHECK_MAX, trim: true });
  return done(errors, { supplierId, contactId, loginName, identityCheck });
}

/// An officer issues a one-time code for a supplier's account, saying how the caller's identity was checked.
export interface IssueSupplierCodeForm {
  supplierId: string;
  accountId: string;
  purpose: "ACTIVATION" | "RESET";
  identityCheck: string;
}
export function parseIssueSupplierCode(entries: Entries): Parsed<IssueSupplierCodeForm> {
  const { values, errors } = collect(entries, ["supplierId", "accountId", "purpose", "identityCheck"]);
  const supplierId = text(values, errors, "supplierId", "The supplier", { max: ID_MAX, trim: true });
  const accountId = text(values, errors, "accountId", "The account", { max: ID_MAX, trim: true });
  const identityCheck = text(values, errors, "identityCheck", "How the caller's identity was checked", { max: CHECK_MAX, trim: true });
  const purposeText = text(values, errors, "purpose", "What the code is for", { max: 16, trim: true });
  if (purposeText && purposeText !== "ACTIVATION" && purposeText !== "RESET") errors.purpose ??= "A code is for activating an account or for resetting a password.";
  return done(errors, { supplierId, accountId, identityCheck, purpose: purposeText === "RESET" ? "RESET" : "ACTIVATION" });
}

export interface UnlockSupplierAccountForm {
  supplierId: string;
  accountId: string;
  identityCheck: string;
}
export function parseUnlockSupplierAccount(entries: Entries): Parsed<UnlockSupplierAccountForm> {
  const { values, errors } = collect(entries, ["supplierId", "accountId", "identityCheck"]);
  const supplierId = text(values, errors, "supplierId", "The supplier", { max: ID_MAX, trim: true });
  const accountId = text(values, errors, "accountId", "The account", { max: ID_MAX, trim: true });
  const identityCheck = text(values, errors, "identityCheck", "How the caller's identity was checked", { max: CHECK_MAX, trim: true });
  return done(errors, { supplierId, accountId, identityCheck });
}

/// An officer retires one of a supplier's contacts, with the reason.
export interface RetireContactForm {
  supplierId: string;
  contactId: string;
  reason: string;
}
export function parseRetireContact(entries: Entries): Parsed<RetireContactForm> {
  const { values, errors } = collect(entries, ["supplierId", "contactId", "reason"]);
  const supplierId = text(values, errors, "supplierId", "The supplier", { max: ID_MAX, trim: true });
  const contactId = text(values, errors, "contactId", "The contact", { max: ID_MAX, trim: true });
  const reason = text(values, errors, "reason", "The reason", { max: REASON_MAX, trim: true });
  return done(errors, { supplierId, contactId, reason });
}

/**
 * An officer marks whether a supplier's contact may sign for the contractor's company from the portal (decisions log, 2026-10-09, ruling on 1928(3)): yes, no, or back to not decided.
 * The reason is always asked: who may bind a company is an authority, and the change is audited with it.
 */
export interface SetContractorSignerForm {
  supplierId: string;
  contactId: string;
  mark: boolean | null;
  reason: string;
}
export function parseSetContractorSigner(entries: Entries): Parsed<SetContractorSignerForm> {
  const { values, errors } = collect(entries, ["supplierId", "contactId", "mark", "reason"]);
  const supplierId = text(values, errors, "supplierId", "The supplier", { max: ID_MAX, trim: true });
  const contactId = text(values, errors, "contactId", "The contact", { max: ID_MAX, trim: true });
  const raw = text(values, errors, "mark", "The answer", { max: 8, trim: true });
  if (raw && raw !== "yes" && raw !== "no" && raw !== "unset") errors.mark ??= "Choose yes, no, or not decided.";
  const reason = text(values, errors, "reason", "The reason", { max: REASON_MAX, trim: true });
  return done(errors, { supplierId, contactId, mark: raw === "yes" ? true : raw === "no" ? false : null, reason });
}
