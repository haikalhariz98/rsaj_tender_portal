import type { Metadata } from "next";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { MoreText } from "@/components/ui/more-text";
import { BuildingIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { loadPortalBranding } from "@/lib/organisation/portal-load";
import { loadRegistrationForm } from "@/lib/portal/apply-repo";
import { APPLY } from "@/lib/portal/labels";
import { loadPublicShell } from "@/lib/portal/deployment";

export const metadata: Metadata = { title: APPLY.title.en };
export const dynamic = "force-dynamic";

/**
 * A supplier applies to join the register, without signing in (ADR 0041): one five-step form, held in the browser and sent once at Submit to `/supplier/register/submit`.
 *
 * Transitional (plan 3.6, builder step 2): the step-one form that posted to the old route is gone with it, and the five-step wizard is builder step 3's. Until it lands, this page shows
 * the register closed, naming what is still to be set up where anything is. On the founder's database the register is closed anyway until a second account issues the terms text (REG-5).
 */
export default async function SupplierRegisterPage() {
  const [{ organisation }, form, door] = await Promise.all([loadPublicShell(), loadRegistrationForm(), signInOrganisation()]);
  const branding = await loadPortalBranding(door?.id ?? null);

  return (
    <SignInScreen variant="portal" page="register" branding={branding}>
      <PageHeader title={APPLY.title.en} subtitle={APPLY.subtitle(organisation.name).en} info={{ title: APPLY.title.en, text: APPLY.info.en }} />

      {!form.ready ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en} action={<span className="text-[13.5px] text-ink-2">{APPLY.noOrganisation.en}</span>} />
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={APPLY.closedTitle.en}
            icon={<BuildingIcon size={22} />}
            action={
              <span className="inline-flex items-center gap-1 text-[13.5px] text-ink-2">
                {APPLY.closedBody.en}
                {form.missing.length > 0 && <MoreText label="What is missing" text={`${APPLY.closedMissing.en} ${form.missing.map((m) => m.en).join(", ")}.`} />}
              </span>
            }
          />
        </Card>
      )}
    </SignInScreen>
  );
}
