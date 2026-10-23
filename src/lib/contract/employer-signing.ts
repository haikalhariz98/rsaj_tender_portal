/**
 * Which office signs a reconciliation amendment for the employer (FR-CON-004, NFR-SIG-001, the product owner's ruling of 2026-10-07).
 *
 * NFR-SIG-001 asks a signature to record the capacity it was made in. For the employer's signature on an amendment, which office that is, is the customer's configuration
 * (`ContractPolicy.employerSigningRoleCode`), nullable and unset by default. Unlike the settings that refuse the act they govern, an unset one does not refuse here: the
 * signature is still recorded, with the offices its signer held on the day, and the screen says the setting is not set. The product never invents a code.
 *
 * Pure: the caller reads the setting and the offices the signer held on the day (from the roster, the subject's and never the officer keying a paper record's).
 */

export interface HeldOffice {
  code: string;
  name: string;
}

export type EmployerSigning =
  /// No office is configured. Recorded all the same: `roleCode` is the one office the signer held, or null where they held none or several (a code holds one value, and the
  /// offices are named in full in `held`, which the audit trail carries).
  | { state: "NOT_SET"; roleCode: string | null; held: readonly HeldOffice[] }
  /// The configured office is one the signer held on the day: recorded as it.
  | { state: "HELD"; roleCode: string; held: readonly HeldOffice[] }
  /// An office is configured and the signer did not hold it on the day: refused. Open for the product owner (decisions log): whether another office may sign.
  | { state: "NOT_HELD"; configured: string; held: readonly HeldOffice[] };

export function employerSigning(i: { configuredCode: string | null; held: readonly HeldOffice[] }): EmployerSigning {
  // The same office held twice (two scopes) is one office.
  const held = i.held.filter((o, n, all) => all.findIndex((x) => x.code === o.code) === n);
  const configured = i.configuredCode?.trim() || null;
  if (!configured) return { state: "NOT_SET", roleCode: held.length === 1 ? held[0].code : null, held };
  return held.some((o) => o.code === configured) ? { state: "HELD", roleCode: configured, held } : { state: "NOT_HELD", configured, held };
}

/// What a screen says where the setting is unset.
export const EMPLOYER_SIGNING_NOT_SET = "Employer's signing office not set";
/// The longer sentence beside it: what happens meanwhile.
export const EMPLOYER_SIGNING_NOT_SET_WHY = "An amendment is still recorded, with the offices its signer held on the day.";

/// The offices a signer held, in words, for the audit trail and a refusal.
export const officesWords = (held: readonly HeldOffice[]): string => (held.length ? held.map((o) => o.name).join("; ") : "no office on record that day");

/// The refusal where an office is configured and the signer did not hold it. `officeName` is the configured office's name (null where it is no longer configured).
export function employerSigningRefusal(r: Extract<EmployerSigning, { state: "NOT_HELD" }>, officeName: string | null, signer: string): { en: string;  } {
  const office = officeName ?? "the configured office (no longer on the list of offices)";
  return {
    en: `Not recorded: ${signer} did not hold ${office} on the day they signed (they held ${officesWords(r.held)}), and the employer's amendments are signed by ${office}. Choose the officer who held it, or change the setting under Configuration › Contract controls.`,
  };
}
