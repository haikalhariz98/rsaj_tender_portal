import { inForceOn } from "@/lib/effective";

import type { PermissionKey } from "./types";
import type { Words } from "./words";

/**
 * Product permissions (ADR 0034 D8, Phase 2a). Pure: what a person holds is worked out from their administrator flag, the offices they
 * hold on the organisation's today, and the organisation's grants to roles. Nothing here reads a database.
 *
 * The keys are a closed list in code: product vocabulary, not policy. WHICH ROLE holds which key is the customer's, held in
 * `RolePermission`, and no row means undecided: refused, but shown as undecided and never as withheld.
 *
 * Three kinds of key:
 * - administrator only: held through the administrator flag and never granted to a role (accounts, security policy, who may grant);
 * - administrator or granted: held through the flag, and grantable to roles besides (drafting and issuing configuration, reading the audit trail);
 * - granted only: held by a role the customer has granted it to, and never through the flag (the administrator is kept apart from
 *   transactions, ADR D9, and these are transactional or reach records).
 *
 * Delegation carries approval authority only. It carries no product permission, so nothing here takes a delegation.
 */

export type PermissionSource = "ADMINISTRATOR_ONLY" | "ADMINISTRATOR_OR_GRANT" | "GRANT_ONLY";

export interface PermissionInfo {
  source: PermissionSource;
  label: Words;
  /// What holding it lets a person do, in a sentence, for the grid.
  lets: Words;
}

export const PERMISSIONS: Readonly<Record<PermissionKey, PermissionInfo>> = {
  "accounts.manage": {
    source: "ADMINISTRATOR_ONLY",
    label: { en: "Manage sign-in accounts", ms: "Urus akaun log masuk" },
    lets: { en: "Create, disable and unlock sign-in accounts, and issue activation and reset codes.", ms: "Cipta, lumpuhkan dan buka kunci akaun log masuk, dan keluarkan kod pengaktifan dan tetapan semula." },
  },
  "security.policy": {
    source: "ADMINISTRATOR_ONLY",
    label: { en: "Set the organisation's sign-in settings", ms: "Tetapkan tetapan log masuk organisasi" },
    lets: { en: "Propose a change to session limits, lockout, password length and the paper-signature switch.", ms: "Cadangkan perubahan had sesi, penguncian, panjang kata laluan dan suis tandatangan kertas." },
  },
  "permissions.grant": {
    source: "ADMINISTRATOR_ONLY",
    label: { en: "Grant product permissions to roles", ms: "Beri kebenaran produk kepada peranan" },
    lets: { en: "Propose which roles hold which product permission.", ms: "Cadangkan peranan mana memegang kebenaran produk mana." },
  },
  "configuration.draft": {
    source: "ADMINISTRATOR_OR_GRANT",
    label: { en: "Draft configuration", ms: "Draf konfigurasi" },
    lets: { en: "Edit a draft of the approval matrix and other configuration that is issued in turn.", ms: "Sunting draf matriks kelulusan dan konfigurasi lain yang dikeluarkan kemudian." },
  },
  "configuration.issue": {
    source: "ADMINISTRATOR_OR_GRANT",
    label: { en: "Issue configuration", ms: "Keluarkan konfigurasi" },
    lets: { en: "Put a draft into force, provided the issuer is not one of its makers.", ms: "Kuatkuasakan draf, dengan syarat pengeluar bukan salah seorang pembuatnya." },
  },
  "audit.read": {
    source: "ADMINISTRATOR_OR_GRANT",
    label: { en: "Read and export the audit trail", ms: "Baca dan eksport jejak audit" },
    lets: { en: "Open the audit trail and export it.", ms: "Buka jejak audit dan eksportnya." },
  },
  "supplierAccounts.manage": {
    source: "GRANT_ONLY",
    label: { en: "Manage supplier sign-in accounts", ms: "Urus akaun log masuk pembekal" },
    lets: { en: "Issue a supplier's activation or reset code, after recording how the caller's identity was checked.", ms: "Keluarkan kod pengaktifan atau tetapan semula pembekal, selepas merekodkan cara identiti pemanggil disemak." },
  },
  "sulit.read.organisation": {
    source: "GRANT_ONLY",
    label: { en: "Read SULIT values across the organisation", ms: "Baca nilai SULIT merentas organisasi" },
    lets: { en: "See SULIT values on records the person is not named on. It never opens a restricted exercise.", ms: "Lihat nilai SULIT pada rekod yang tidak menamakan orang itu. Ia tidak pernah membuka eksesais terhad." },
  },
  // Phase 4b (ruling 6 of the CPD registration rulings, 2026-10-07): a supplier's bank details are read by the officers who hold a step on its registration's route, and by staff the
  // organisation grants this to (finance). Undecided until the organisation decides: refused, and shown as undecided. It never reads a restricted exercise's figures.
  "sulit.read.creditorProfile": {
    source: "GRANT_ONLY",
    label: { en: "Read suppliers' creditor profiles", ms: "Baca profil pemiutang pembekal" },
    lets: { en: "See a supplier's bank and beneficiary details and the bank statement, and check them, without holding a step on its registration route. It opens no other SULIT value.", ms: "Lihat butiran bank dan benefisiari pembekal serta penyata bank, dan menyemaknya, tanpa memegang langkah pada laluan pendaftarannya. Ia tidak membuka nilai SULIT yang lain." },
  },
  "acts.recordOnBehalf": {
    source: "GRANT_ONLY",
    label: { en: "Record a signature-class act on someone's behalf from paper", ms: "Rekod tindakan kelas tandatangan bagi pihak seseorang daripada kertas" },
    lets: { en: "Record an approval, signature or unseal from a paper record, with the paper reference. It is recorded as not signed.", ms: "Rekod kelulusan, tandatangan atau pembukaan meterai daripada rekod kertas, dengan rujukan kertas. Ia direkodkan sebagai tidak ditandatangani." },
  },
  // Being named on an exercise is what opens its classified figures (FR-MTD-007, ADR 0034 D14), so naming is an authorised act: by someone already named on it, or by a holder of this.
  "sourcing.participants.manage": {
    source: "GRANT_ONLY",
    label: { en: "Name the people on a sourcing exercise", ms: "Namakan orang pada eksesais sumber" },
    lets: { en: "Name participants, the person in charge, the proposal's reviewer and the evaluation team on an exercise one is not named on. It does not let a person add themselves as a participant, person in charge or evaluator, and a holder is named on an exercise only by recording its proposal review or by restricting a draft.", ms: "Namakan peserta, orang yang bertanggungjawab, penyemak cadangan dan pasukan penilaian pada eksesais yang orang itu tidak dinamakan padanya. Ia tidak membenarkan seseorang menambah dirinya sebagai peserta, orang yang bertanggungjawab atau penilai, dan pemegangnya dinamakan pada sesuatu eksesais hanya dengan merekodkan semakan cadangannya atau dengan menghadkan draf." },
  },
};

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as readonly PermissionKey[];

export const isPermissionKey = (key: string): key is PermissionKey => Object.prototype.hasOwnProperty.call(PERMISSIONS, key);

/// Whether a role can be granted the key at all. An administrator-only key cannot: a stored row for one is ignored.
export const isGrantable = (key: PermissionKey): boolean => PERMISSIONS[key].source !== "ADMINISTRATOR_ONLY";

/// Whether the administrator flag confers the key.
export const adminConfers = (key: PermissionKey): boolean => PERMISSIONS[key].source !== "GRANT_ONLY";

export interface HeldAssignment {
  roleCode: string;
  /// The department the office is held for. Null: the office is held organisation-wide.
  scope: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface StoredGrant {
  permissionKey: string;
  roleCode: string;
  decision: "GRANTED" | "WITHHELD";
}

export interface ResolveInput {
  isAdministrator: boolean;
  /// Every assignment the person has ever held, or just the current ones: those not in force `today` are ignored here.
  assignments: readonly HeldAssignment[];
  grants: readonly StoredGrant[];
  /// The organisation's today (`organisationDay`). Null where the organisation has no time zone set: today is not known, so no
  /// office is claimed and no role carries a permission. The administrator flag does not need today.
  today: Date | null;
}

/**
 * Why a person holds a key or not. `ADMINISTRATOR` and `ROLE` hold it; the rest refuse it, and each is told in words:
 * - `WITHHELD`: a role they hold has the customer's decision to withhold it (this wins over a grant on another role they hold);
 * - `SCOPED_ONLY`: a role they hold is granted it, but they hold that role only for a department, and a product permission is the
 *   organisation's, so it is not carried (an open item for the product owner);
 * - `ADMINISTRATOR_EXCLUDED`: a granted-only key, and an administrator never holds one;
 * - `NOT_GRANTABLE`: an administrator-only key and the person is not an administrator;
 * - `UNDECIDED`: no role they hold has a decision on it.
 */
export type PermissionState =
  | { state: "ADMINISTRATOR" }
  | { state: "ROLE"; roleCodes: string[] }
  | { state: "WITHHELD"; roleCodes: string[] }
  | { state: "SCOPED_ONLY"; roleCodes: string[] }
  | { state: "ADMINISTRATOR_EXCLUDED" }
  | { state: "NOT_GRANTABLE" }
  | { state: "UNDECIDED" };

export const holds = (s: PermissionState): boolean => s.state === "ADMINISTRATOR" || s.state === "ROLE";

/// The decisions the organisation has made about one key, by role, ignoring a row whose key is not on the closed list or whose key no role may be granted.
function decisionsFor(key: PermissionKey, grants: readonly StoredGrant[]): Map<string, "GRANTED" | "WITHHELD"> {
  const out = new Map<string, "GRANTED" | "WITHHELD">();
  if (!isGrantable(key)) return out;
  for (const g of grants) if (g.permissionKey === key) out.set(g.roleCode, g.decision);
  return out;
}

export function permissionState(key: PermissionKey, input: ResolveInput): PermissionState {
  // An administrator holds exactly what the flag confers. A role they somehow hold (the rule in `administration-conflict.ts` keeps this from
  // arising) adds nothing: administration stays apart from transactions.
  if (input.isAdministrator) return adminConfers(key) ? { state: "ADMINISTRATOR" } : { state: "ADMINISTRATOR_EXCLUDED" };
  if (!isGrantable(key)) return { state: "NOT_GRANTABLE" };

  const today = input.today;
  const held = today ? input.assignments.filter((a) => inForceOn(a, today)) : [];
  const decisions = decisionsFor(key, input.grants);
  const decided = new Map<string, { decision: "GRANTED" | "WITHHELD"; wholeOrganisation: boolean }>();
  for (const a of held) {
    const decision = decisions.get(a.roleCode);
    if (!decision) continue;
    const before = decided.get(a.roleCode);
    // The same role held twice (an organisation-wide spell and a department's): the organisation-wide one counts.
    decided.set(a.roleCode, { decision, wholeOrganisation: (before?.wholeOrganisation ?? false) || a.scope == null });
  }
  const withheld = [...decided].filter(([, d]) => d.decision === "WITHHELD").map(([code]) => code).sort();
  if (withheld.length > 0) return { state: "WITHHELD", roleCodes: withheld };
  const granted = [...decided].filter(([, d]) => d.decision === "GRANTED");
  const carried = granted.filter(([, d]) => d.wholeOrganisation).map(([code]) => code).sort();
  if (carried.length > 0) return { state: "ROLE", roleCodes: carried };
  if (granted.length > 0) return { state: "SCOPED_ONLY", roleCodes: granted.map(([code]) => code).sort() };
  return { state: "UNDECIDED" };
}

/// Every product permission the person holds.
export function resolvePermissions(input: ResolveInput): Set<PermissionKey> {
  return new Set(PERMISSION_KEYS.filter((key) => holds(permissionState(key, input))));
}

/// What to tell a person who was refused a key: the permission in words, and why they do not hold it. No code reaches the person.
export function permissionRefusal(key: PermissionKey, state: PermissionState, roleName: (code: string) => string = (c) => c): Words {
  const label = PERMISSIONS[key].label;
  const names = (codes: string[]) => codes.map(roleName).join(", ");
  switch (state.state) {
    case "WITHHELD":
      return {
        en: `This needs the permission "${label.en}", and the organisation has withheld it from ${names(state.roleCodes)}.`,
        ms: `Ini memerlukan kebenaran "${label.ms}", dan organisasi telah menahannya daripada ${names(state.roleCodes)}.`,
      };
    case "SCOPED_ONLY":
      return {
        en: `This needs the permission "${label.en}". It is granted to ${names(state.roleCodes)}, but you hold that office only for a department, and the permission is the organisation's.`,
        ms: `Ini memerlukan kebenaran "${label.ms}". Ia diberikan kepada ${names(state.roleCodes)}, tetapi anda memegang jawatan itu bagi sesuatu jabatan sahaja, dan kebenaran ini milik organisasi.`,
      };
    case "ADMINISTRATOR_EXCLUDED":
      return {
        en: `This needs the permission "${label.en}", which an administrator never holds: administration is kept apart from transactions.`,
        ms: `Ini memerlukan kebenaran "${label.ms}", yang tidak pernah dipegang pentadbir: pentadbiran diasingkan daripada urus niaga.`,
      };
    case "NOT_GRANTABLE":
      return { en: `This needs the permission "${label.en}", which only an administrator holds.`, ms: `Ini memerlukan kebenaran "${label.ms}", yang hanya dipegang pentadbir.` };
    case "UNDECIDED":
      return {
        en: `This needs the permission "${label.en}", and the organisation has not yet decided which roles hold it.`,
        ms: `Ini memerlukan kebenaran "${label.ms}", dan organisasi belum memutuskan peranan mana memegangnya.`,
      };
    default:
      return { en: `This needs the permission "${label.en}".`, ms: `Ini memerlukan kebenaran "${label.ms}".` };
  }
}
