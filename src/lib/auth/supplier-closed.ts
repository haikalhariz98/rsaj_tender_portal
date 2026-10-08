import { settingLabels } from "./policy";
import type { SecurityPolicyKey } from "./types";
import { AUTH_WORDS } from "./words";

/**
 * Why a supplier cannot sign in, activate or reset yet, said in words, or null when they can (Phase 4a). Pure: the page reads the facts and this says what they mean.
 * Nothing is assumed when a setting is missing: the portal says so and names what is waiting, as the staff sign-in does.
 */

export interface SupplierClosedFacts {
  /// False on the staff copy: suppliers sign in on the public copy only.
  publicCopy: boolean;
  organisationSet: boolean;
  /// The settings the supplier sign-in needs (and the password's shortest length, for activation and reset) that nobody has set.
  unset: readonly SecurityPolicyKey[];
  /// Whether the deployment's form key is set (`PORTAL_FORM_SECRET`).
  formKeySet: boolean;
}

export interface ClosedWords {
  title: string;
  body: string;
}

export function supplierClosedReason(f: SupplierClosedFacts): ClosedWords | null {
  if (!f.publicCopy) {
    return {
      title: "Supplier sign-in is on the public portal",
      body: "Suppliers sign in on the portal's public address, not on the officers' copy. Nothing here can sign a supplier in.",
    };
  }
  if (!f.organisationSet) return { title: "Not set up", body: AUTH_WORDS.notConfigured.en };
  if (!f.formKeySet) return { title: "The portal's forms are closed", body: AUTH_WORDS.portalFormsClosed.en };
  if (f.unset.length > 0) return { title: AUTH_WORDS.policyNotSet.en, body: `${settingLabels(f.unset).join("; ")}. ${AUTH_WORDS.policyNotSetHow.en}` };
  return null;
}
