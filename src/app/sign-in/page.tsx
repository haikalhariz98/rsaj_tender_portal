import { notFound, redirect } from "next/navigation";

import { LockIcon } from "@/components/icons";
import { AuthForm } from "@/components/auth/auth-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { hasAdministrator } from "@/lib/auth/identity";
import { settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { currentStaffOrNull } from "../_auth/actor";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

/// Why nobody can sign in yet, said in words, or null when they can. Read from the database on this request.
async function whyClosed(): Promise<{ title: string; body: string; command?: boolean } | null> {
  const organisation = await signInOrganisation();
  if (!organisation) return { title: "Not set up", body: AUTH_WORDS.notConfigured.en };
  if (!(await hasAdministrator(organisation.id))) return { title: "No administrator yet", body: "", command: true };
  const unset = unsetSettings(await loadSecurityPolicy(db, organisation.id), "SIGN_IN");
  if (unset.length > 0) return { title: AUTH_WORDS.policyNotSet.en, body: settingLabels(unset).join("; ") + ". " + AUTH_WORDS.policyNotSetHow.en };
  return null;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  // The public copy of the product has no staff sign-in: it is not found there (the proxy answers 404 before this runs, and this is the second line).
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") notFound();
  // Already signed in: there is nothing to do here.
  if (await currentStaffOrNull()) redirect("/");

  const [{ password }, closed] = await Promise.all([searchParams, whyClosed()]);

  return (
    <>
      <PageHeader title="Sign in" subtitle="Use the name and password of your own account." />
      {password === "set" && (
        <Callout tone="ok" className="mb-5">
          {AUTH_WORDS.codeUsed.en}
        </Callout>
      )}
      {closed && (
        <Callout tone="warn" title={closed.title} className="mb-5">
          {closed.command ? (
            <>
              No administrator yet: run <code className="font-mono text-[12.5px]">npm run auth:bootstrap</code> on the server.
            </>
          ) : (
            closed.body
          )}
        </Callout>
      )}
      <Card>
        <CardBody>
          <AuthForm
            action={signInAction}
            submitLabel="Sign in"
            busyLabel="Signing in…"
            fields={[
              { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true },
              { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
            ]}
          />
        </CardBody>
      </Card>
      <div className="mt-5 flex items-center justify-center gap-2 text-[13.5px] text-ink-3">
        <LockIcon size={15} />
        <span>Have a one-time code from an administrator?</span>
        <ButtonLink href="/sign-in/code" variant="link" size="sm">
          Use a code
        </ButtonLink>
      </div>
    </>
  );
}
