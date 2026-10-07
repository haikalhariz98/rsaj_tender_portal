import { notFound, redirect } from "next/navigation";

import { LockIcon, ShieldIcon } from "@/components/icons";
import { AuthForm } from "@/components/auth/auth-form";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { hasAdministrator } from "@/lib/auth/identity";
import { settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { loadSignInBranding } from "@/lib/organisation/sign-in-load";
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

  const [{ password }, closed, organisation] = await Promise.all([searchParams, whyClosed(), signInOrganisation()]);
  const branding = await loadSignInBranding(organisation?.id ?? null);

  return (
    <SignInScreen branding={branding}>
      <PageHeader eyebrow={branding.view.portalName ? AUTH_WORDS.welcomeTo.en : undefined} title={branding.view.title} subtitle={AUTH_WORDS.signInSubtitle.en} />
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
      <AuthForm
        action={signInAction}
        submitLabel={AUTH_WORDS.signInButton.en}
        busyLabel="Signing in…"
        submitArrow
        fields={[
          { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password", icon: "lock", reveal: true },
        ]}
        footer={
          <>
            <div className="flex items-center gap-3 text-[12px] font-semibold tracking-wider text-ink-3" role="separator" aria-label={AUTH_WORDS.orDivider.en}>
              <span aria-hidden="true" className="h-px flex-1 bg-line-2" />
              <span aria-hidden="true">{AUTH_WORDS.orDivider.en}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-line-2" />
            </div>
            <ButtonLink href="/sign-in/code" variant="secondary" size="lg" block icon={<ShieldIcon size={18} />} className="h-auto min-h-12 py-2.5 text-center whitespace-normal">
              {AUTH_WORDS.useCodeButton.en}
            </ButtonLink>
            <p className="-mt-1 text-center text-[13px] text-ink-2">{AUTH_WORDS.forgotHint.en}</p>
            <p className="flex items-center justify-center gap-2 text-center text-[12.5px] text-ink-2">
              <LockIcon size={14} className="shrink-0" />
              <span>{AUTH_WORDS.recordedNote.en}</span>
            </p>
          </>
        }
      />
    </SignInScreen>
  );
}
