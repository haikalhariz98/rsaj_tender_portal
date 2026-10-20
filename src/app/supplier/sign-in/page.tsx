import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LockIcon } from "@/components/icons";
import { PortalForm } from "@/components/auth/portal-form";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { StaffPortalCard } from "@/components/auth/staff-portal-card";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPLIER_AFTER_SIGN_IN } from "@/lib/auth/routes";
import { AUTH_WORDS } from "@/lib/auth/words";
import { loadSupplierDoor } from "@/lib/portal/supplier-door";

import { staffMaySetPortal } from "../../_auth/portal-door";
import { currentSupplierOrNull } from "../../_auth/supplier";

export const metadata: Metadata = { title: "Sign in to the supplier portal" };
export const dynamic = "force-dynamic";

/**
 * A supplier signs in (Phase 4a). The account is a contact's, opened by an officer after the application was accepted; the officer hands over a one-time code to activate it.
 * The portal says in words when it cannot sign anyone in yet, and names what is waiting. Suppliers sign in on the public copy only: the officers' copy draws a card that points
 * to the public portal instead of the form (design note 0006). The frame, the illustration and the Register button are the same on both.
 */
export default async function SupplierSignInPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  if (await currentSupplierOrNull()) redirect(SUPPLIER_AFTER_SIGN_IN);
  const { closed, token, publicCopy, branding } = await loadSupplierDoor("sign-in");

  return (
    <SignInScreen variant="portal" page="sign-in" branding={branding}>
      {!publicCopy ? (
        <StaffPortalCard path="/supplier/sign-in" address={branding.view.publicAddress} canSet={await staffMaySetPortal()} />
      ) : (
        <>
          <PageHeader title="Sign in" />
          {password === "set" && (
            <Callout tone="ok" className="mb-5">
              {AUTH_WORDS.codeUsed.en}
            </Callout>
          )}
          {closed || !token ? (
            <Callout tone="warn" title={closed?.title ?? "The portal's forms are closed"}>
              {closed?.body ?? AUTH_WORDS.portalFormsClosed.en}
            </Callout>
          ) : (
            <PortalForm
              path="/supplier/sign-in/submit"
              formToken={token}
              submitLabel={AUTH_WORDS.signInButton.en}
              submitArrow
              fields={[
                { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person" },
                { name: "password", label: "Password", type: "password", autoComplete: "current-password", icon: "lock", reveal: true },
              ]}
              footer={
                <>
                  <div className="flex flex-col items-center">
                    <ButtonLink href="/supplier/activate" variant="link" size="sm">
                      I have an activation code
                    </ButtonLink>
                    <ButtonLink href="/supplier/reset" variant="link" size="sm">
                      I have a reset code
                    </ButtonLink>
                  </div>
                  <p className="text-center text-[13px] text-ink-2">Forgot your password? Ask the office for a reset code.</p>
                  <p className="flex items-center justify-center gap-2 text-center text-[12.5px] text-ink-2">
                    <LockIcon size={14} className="shrink-0" />
                    <span>Every sign-in is recorded.</span>
                  </p>
                </>
              }
            />
          )}
        </>
      )}
    </SignInScreen>
  );
}
