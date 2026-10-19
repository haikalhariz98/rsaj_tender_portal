import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { loadSignInBranding } from "@/lib/organisation/sign-in-load";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { redeemCodeAction } from "../actions";

export const metadata: Metadata = { title: AUTH_WORDS.useCodeTitle.en };

export const dynamic = "force-dynamic";

export default async function UseCodePage() {
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") notFound();
  const organisation = await signInOrganisation();
  const unset = organisation ? unsetSettings(await loadSecurityPolicy(db, organisation.id), "SIGN_IN", "SET_PASSWORD") : [];

  const branding = await loadSignInBranding(organisation?.id ?? null);

  return (
    <SignInScreen branding={branding}>
      <PageHeader title={AUTH_WORDS.useCodeTitle.en} subtitle="Use the code an administrator gave you." />
      {unset.length > 0 && (
        <Callout tone="warn" title={AUTH_WORDS.policyNotSet.en} className="mb-5">
          {settingLabels(unset).join("; ")}. {AUTH_WORDS.policyNotSetHow.en}
        </Callout>
      )}
      <AuthForm
        action={redeemCodeAction}
        submitLabel="Set my password"
        busyLabel="Setting your password…"
        fields={[
          { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person" },
          { name: "code", label: "One-time code", mono: true, hint: "Letters and digits. Spaces and dashes are ignored." },
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", icon: "lock", reveal: true },
          { name: "confirm", label: "New password, again", type: "password", autoComplete: "new-password", icon: "lock", reveal: true },
        ]}
        footer={
          <div className="text-center">
            <ButtonLink href="/sign-in" variant="link" size="sm">
              {AUTH_WORDS.backToSignIn.en}
            </ButtonLink>
          </div>
        }
      />
    </SignInScreen>
  );
}
