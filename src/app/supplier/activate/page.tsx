import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalForm } from "@/components/auth/portal-form";
import { Card, CardBody } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPLIER_AFTER_SIGN_IN } from "@/lib/auth/routes";
import { AUTH_WORDS } from "@/lib/auth/words";
import { loadSupplierAuthPage } from "@/lib/portal/supplier-auth-page";

import { currentSupplierOrNull } from "../../_auth/supplier";

export const metadata: Metadata = { title: "Activate your supplier account" };
export const dynamic = "force-dynamic";

/// A supplier activates the account the procurement office opened for them, with the one-time code the officer handed over (Phase 4a, ADR 0034 D6): the sign-in name the officer gave, the code, and a password of their own.
export default async function SupplierActivatePage() {
  if (await currentSupplierOrNull()) redirect(SUPPLIER_AFTER_SIGN_IN);
  const { closed, token } = await loadSupplierAuthPage("activate");

  return (
    <>
      <PageHeader title="Activate your account" subtitle="Use the code the office gave. Not emailed." />
      <div className="max-w-xl">
        {closed || !token ? (
          <Callout tone="warn" title={closed?.title ?? "The portal's forms are closed"}>
            {closed?.body ?? AUTH_WORDS.portalFormsClosed.en}
          </Callout>
        ) : (
          <Card>
            <CardBody>
              <PortalForm
                path="/supplier/activate/submit"
                formToken={token}
                submitLabel="Set my password"
                fields={[
                  { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person", hint: "As the office gave it to you" },
                  { name: "code", label: "Activation code", mono: true, hint: "Letters and digits. Spaces and dashes do not matter." },
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
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
