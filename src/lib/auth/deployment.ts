import { deploymentOrganisation, type DeploymentOrganisation } from "@/lib/portal/deployment";

/**
 * The organisation a sign-in page speaks for.
 *
 * Before anyone has signed in there is no actor to name an organisation, yet the sign-in screen must say which settings are unset and
 * the throttle must count an unknown name's attempts somewhere. So, as the public pages do (ADR 0034 D10), it is the deployment's one
 * organisation (`src/lib/portal/deployment.ts`, the one reader of `ORGANISATION_CODE`): it is how the pre-sign-in screens find their
 * policy, and nothing after sign-in uses it.
 * A person who signs in is then in the organisation their account belongs to; an account of another organisation is treated as unknown here.
 */

export type SignInOrganisation = DeploymentOrganisation;

export async function signInOrganisation(): Promise<SignInOrganisation | null> {
  return deploymentOrganisation();
}
