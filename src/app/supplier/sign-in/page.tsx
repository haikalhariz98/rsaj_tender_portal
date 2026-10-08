import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LockIcon, ShieldIcon } from "@/components/icons";
import { PortalForm } from "@/components/auth/portal-form";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPLIER_AFTER_SIGN_IN } from "@/lib/auth/routes";
import { AUTH_WORDS } from "@/lib/auth/words";
import { loadSupplierAuthPage } from "@/lib/portal/supplier-auth-page";

import { currentSupplierOrNull } from "../../_auth/supplier";

export const metadata: Metadata = { title: "Sign in to the supplier portal" };
export const dynamic = "force-dynamic";

/**
 * A supplier signs in (Phase 4a). The account is a contact's, opened by an officer after the application was accepted; the officer hands over a one-time code to activate it.
 * The portal says in words when it cannot sign anyone in yet, and names what is waiting. Suppliers sign in on the public copy only.
 */
export default async function SupplierSignInPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { password } = await searchParams;
  if (await currentSupplierOrNull()) redirect(SUPPLIER_AFTER_SIGN_IN);
  const { closed, token } = await loadSupplierAuthPage("sign-in");

  return (
    <>
      <PageHeader title="Sign in" subtitle="To the supplier portal, with the account the procurement office opened for you." />
      <div className="max-w-xl">
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
          <Card>
            <CardBody>
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
                    <ButtonLink href="/supplier/activate" variant="secondary" size="lg" block icon={<ShieldIcon size={18} />} className="h-auto min-h-12 py-2.5 text-center whitespace-normal">
                      I have an activation code
                    </ButtonLink>
                    <div className="text-center">
                      <ButtonLink href="/supplier/reset" variant="link" size="sm">
                        I have a reset code
                      </ButtonLink>
                    </div>
                    <p className="text-center text-[13px] text-ink-2">
                      Forgotten your password? Ask the procurement office for a reset code. They will ask how they can be sure it is you, and nothing is sent by email.
                    </p>
                    <p className="flex items-center justify-center gap-2 text-center text-[12.5px] text-ink-2">
                      <LockIcon size={14} className="shrink-0" />
                      <span>Every sign-in, and every wrong password, is recorded.</span>
                    </p>
                  </>
                }
              />
            </CardBody>
          </Card>
        )}
        <p className="mt-5 text-[13.5px] text-ink-2">
          Not registered yet? <Link href="/supplier/register">Apply to join the supplier register</Link>. You get an account once the procurement office has accepted your application.
        </p>
      </div>
    </>
  );
}
