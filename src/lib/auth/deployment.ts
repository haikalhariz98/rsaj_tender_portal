import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";

/**
 * The organisation a sign-in page speaks for.
 *
 * Before anyone has signed in there is no actor to name an organisation, yet the sign-in screen must say which settings are unset and
 * the throttle must count an unknown name's attempts somewhere. So, as the public pages do (ADR 0034 D10), it is the deployment's one
 * organisation: `ORGANISATION_CODE`. This is a named exemption from the Phase 1c ban on importing that constant outside the
 * portal, `prisma/` and `scripts/`: it is how the pre-sign-in screens find their policy, and nothing after sign-in uses it.
 * A person who signs in is then in the organisation their account belongs to; an account of another organisation is treated as unknown here.
 */

export interface SignInOrganisation {
  id: string;
  code: string;
  timeZone: string | null;
}

export async function signInOrganisation(): Promise<SignInOrganisation | null> {
  const organisation = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true, code: true, timeZone: true } });
  return organisation;
}
