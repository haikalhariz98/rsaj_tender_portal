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

export const metadata: Metadata = { title: "Set a new password" };
export const dynamic = "force-dynamic";

/// A supplier who forgot their password sets a new one with the one-time RESET code an officer handed them after checking who was asking (Phase 4a, ADR 0034 D6, threat model F7).
export default async function SupplierResetPage() {
  if (await currentSupplierOrNull()) redirect(SUPPLIER_AFTER_SIGN_IN);
  const { closed, token } = await loadSupplierAuthPage("reset");

  return (
    <>
      <PageHeader title="Set a new password" subtitle="Use the reset code the procurement office gave you after checking who you are." />
      <div className="max-w-xl">
        {closed || !token ? (
          <Callout tone="warn" title={closed?.title ?? "The portal's forms are closed"}>
            {closed?.body ?? AUTH_WORDS.portalFormsClosed.en}
          </Callout>
        ) : (
          <Card>
            <CardBody>
              <PortalForm
                path="/supplier/reset/submit"
                formToken={token}
                submitLabel="Set my password"
                fields={[
                  { name: "loginName", label: "Sign-in name", autoComplete: "username", autoFocus: true, icon: "person" },
                  { name: "code", label: "Reset code", mono: true, hint: "Letters and digits, in groups. Spaces and dashes do not matter." },
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
