import { signInOrganisation } from "@/lib/auth/deployment";
import { formSecret, issueFormToken } from "@/lib/auth/form-secret";
import type { FormPurpose } from "@/lib/auth/form-token";
import { unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { supplierClosedReason, type ClosedWords } from "@/lib/auth/supplier-closed";
import { db } from "@/lib/db";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

/**
 * What a supplier's sign-in page, activation page and reset page need to draw themselves (Phase 4a): why they cannot work yet, in words, or the signed token the form
 * will carry. Read from the database on this request. The activation and the reset page also need the shortest password set, since they set one.
 */
export async function loadSupplierAuthPage(purpose: FormPurpose): Promise<{ closed: ClosedWords | null; token: string | null; publicCopy: boolean }> {
  const publicCopy = surfaceOf(process.env[SURFACE_ENV]) === "public";
  const organisation = await signInOrganisation();
  const policy = organisation ? await loadSecurityPolicy(db, organisation.id) : null;
  const needs = purpose === "sign-in" ? (["SUPPLIER_SIGN_IN"] as const) : (["SUPPLIER_SIGN_IN", "SET_PASSWORD"] as const);
  const closed = supplierClosedReason({ publicCopy, organisationSet: organisation != null, unset: unsetSettings(policy, ...needs), formKeySet: formSecret() != null });
  return { closed, token: closed ? null : issueFormToken(purpose), publicCopy };
}
