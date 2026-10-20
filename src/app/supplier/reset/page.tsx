import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalForm } from "@/components/auth/portal-form";
import { SignInScreen } from "@/components/auth/sign-in-screen";
import { StaffPortalCard } from "@/components/auth/staff-portal-card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPLIER_AFTER_SIGN_IN } from "@/lib/auth/routes";
import { AUTH_WORDS } from "@/lib/auth/words";
import { loadSupplierDoor } from "@/lib/portal/supplier-door";

import { staffMaySetPortal } from "../../_auth/portal-door";
import { currentSupplierOrNull } from "../../_auth/supplier";

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

/// A supplier who forgot their password sets a new one with the one-time RESET code an officer handed them after checking who was asking (Phase 4a, ADR 0034 D6, threat model F7).
export default async function SupplierResetPage() {
  if (await currentSupplierOrNull()) redirect(SUPPLIER_AFTER_SIGN_IN);
  const { closed, token, publicCopy, branding } = await loadSupplierDoor("reset");

  return (
    <SignInScreen variant="portal" page="reset" branding={branding}>
      {!publicCopy ? (
        <StaffPortalCard path="/supplier/reset" address={branding.view.publicAddress} canSet={await staffMaySetPortal()} />
      ) : (
        <>
          <PageHeader title="Set a new password" subtitle="Use the reset code the office gave you." />
          {closed || !token ? (
            <Callout tone="warn" title={closed?.title ?? "The portal's forms are closed"}>
              {closed?.body ?? AUTH_WORDS.portalFormsClosed.en}
            </Callout>
          ) : (
            <PortalForm
              path="/supplier/reset/submit"
              formToken={token}
              submitLabel="Set my password"
              fields={[
                { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person" },
                { name: "code", label: "Reset code", mono: true, hint: "Letters and digits. Spaces and dashes are ignored." },
                { name: "password", label: "New password", type: "password", autoComplete: "new-password", icon: "lock", reveal: true },
                { name: "confirm", label: "New password, again", type: "password", autoComplete: "new-password", icon: "lock", reveal: true },
              ]}
              footer={
                <div className="text-center">
                  <Link href="/supplier/sign-in" className="text-[13.5px] font-semibold">
                    {AUTH_WORDS.backToSignIn.en}
                  </Link>
                </div>
              }
            />
          )}
        </>
      )}
    </SignInScreen>
  );
}
