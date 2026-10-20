/**
 * The demonstration's reference data for step one of the public registration form (Phase 4a): the states of the address, the Bumiputera statuses an applicant may
 * declare (claims only: a listed value is read as a claim, so a "not Bumiputera" entry does not belong on the list; leaving it blank is how no claim is made), and a dial code on a country. Invented throughout, every entry ASSUMED: the demo's countries are not real, so the dial code is not a real one either.
 * None of it is a customer's list. Shared by the demo loader (a database loaded afresh) and `npm run demo:accounts` (one loaded before step one existed).
 */

const P = "demo_";

export const STEP_ONE_LISTS = [
  { id: `${P}slv6`, list: "STATE" as const, code: "demo_state_a", nameEn: "Demo State A", nameMs: "Negeri Demo A", sortOrder: 1 },
  { id: `${P}slv7`, list: "STATE" as const, code: "demo_state_b", nameEn: "Demo State B", nameMs: "Negeri Demo B", sortOrder: 2 },
  { id: `${P}slv8`, list: "STATE" as const, code: "demo_state_c", nameEn: "Demo State C", nameMs: "Negeri Demo C", sortOrder: 3 },
  { id: `${P}slv9`, list: "BUMIPUTERA_STATUS" as const, code: "demo_declared_yes", nameEn: "Bumiputera company", nameMs: "Syarikat Bumiputera", sortOrder: 1 },
];

/// A dial code by country code. Invented ("+999" is not assigned to any country).
export const DEMO_DIAL_CODES: Record<string, string> = { demo_home: "+999" };

/// The role the demonstration grants the permission to manage supplier accounts (ASSUMED): the office that approves a supplier's registration in the demo's matrix (Head of Contract & Procurement). The organisation decides this for itself.
export const DEMO_ACCOUNT_MANAGER_ROLE = "HOD_CP";

/// CPD's two further registration documents (addendum of 2026-10-07: FR-VND-002's LHDN tax clearance and the Surat Akuan Tidak Disenaraihitam, missing from the mock-up). Invented
/// wording and ASSUMED, neither mandatory: a customer sets its own. Document types are configuration, so a customer adds the real ones under Supplier register, with no code change.
export const STEP_TWO_TYPES = [
  { id: `${P}sdt9`, code: "demo_lhdn_clearance", nameEn: "LHDN tax clearance", nameMs: "Pelepasan cukai LHDN", bodyId: null, expires: true, mandatoryAtRegistration: false, notApplicableAllowed: true },
  { id: `${P}sdt10`, code: "demo_non_blacklisting", nameEn: "Declaration of non-blacklisting", nameMs: "Surat Akuan Tidak Disenaraihitam", bodyId: null, expires: false, mandatoryAtRegistration: false, notApplicableAllowed: true },
];
