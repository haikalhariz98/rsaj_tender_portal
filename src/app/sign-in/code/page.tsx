import { notFound } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { redeemCodeAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function UseCodePage() {
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") notFound();
  const organisation = await signInOrganisation();
  const unset = organisation ? unsetSettings(await loadSecurityPolicy(db, organisation.id), "SIGN_IN", "SET_PASSWORD") : [];

  return (
    <>
      <PageHeader title="Use a one-time code" subtitle="Activate your account or set a new password with a code an administrator gave you." />
      {unset.length > 0 && (
        <Callout tone="warn" title={AUTH_WORDS.policyNotSet.en} className="mb-5">
          {settingLabels(unset).join("; ")}. {AUTH_WORDS.policyNotSetHow.en}
        </Callout>
      )}
      <Card>
        <CardBody>
          <AuthForm
            action={redeemCodeAction}
            submitLabel="Set my password"
            busyLabel="Setting your password…"
            fields={[
              { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true },
              { name: "code", label: "One-time code", mono: true, hint: "Letters and digits, in groups. Spaces and dashes do not matter." },
              { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
              { name: "confirm", label: "New password, again", type: "password", autoComplete: "new-password" },
            ]}
          />
        </CardBody>
      </Card>
      <div className="mt-5 text-center">
        <ButtonLink href="/sign-in" variant="link" size="sm">
          Back to sign in
        </ButtonLink>
      </div>
    </>
  );
}
