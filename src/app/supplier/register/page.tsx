import type { Metadata } from "next";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { MoreText } from "@/components/ui/more-text";
import { BuildingIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { signInOrganisation } from "@/lib/auth/deployment";
import { issueFormToken } from "@/lib/auth/form-secret";
import { loadPortalBranding } from "@/lib/organisation/portal-load";
import { loadRegisterForm } from "@/lib/portal/apply-repo";
import { APPLY, PORTAL_PATH } from "@/lib/portal/labels";
import { loadPublicShell } from "@/lib/portal/deployment";

import { RegistrationWizard } from "./registration-wizard";

export const metadata: Metadata = { title: APPLY.title.en };
export const dynamic = "force-dynamic";

/**
 * A supplier applies to join the register, without signing in (ADR 0041): one five-step form, held in the browser for one visit and sent once at Submit to `/supplier/register/submit`.
 * Nothing is saved before then, and the line under the title says so. The register opens only when every step's configuration is set (`loadRegisterForm`, the same reader the submit
 * route asks); until then the page names what is missing. The office decides every application: sending one registers nothing.
 */
export default async function SupplierRegisterPage() {
  const [{ organisation }, form, door] = await Promise.all([loadPublicShell(), loadRegisterForm(), signInOrganisation()]);
  const branding = await loadPortalBranding(door?.id ?? null);
  // A token for this visit: spent by one application only (ADR 0041 D8). The form key is on the readiness list, so an open register has one.
  const token = form.ready && form.missing.length === 0 ? issueFormToken("register") : null;

  return (
    <SignInScreen variant="portal" page="register" branding={branding}>
      <PageHeader
        title={APPLY.title.en}
        subtitle={token ? APPLY.nothingSaved.en : APPLY.subtitle(organisation.name).en}
        info={{ title: APPLY.title.en, text: APPLY.info.en }}
        actions={
          token ? (
            <ButtonLink href={PORTAL_PATH.home} variant="ghost" size="sm">
              {APPLY.backToHome.en}
            </ButtonLink>
          ) : undefined
        }
      />

      {!form.ready ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en} action={<span className="text-[13.5px] text-ink-2">{APPLY.noOrganisation.en}</span>} />
        </Card>
      ) : !token ? (
        <Card>
          <EmptyState
            title={APPLY.closedTitle.en}
            icon={<BuildingIcon size={22} />}
            action={
              <span className="inline-flex items-center gap-1 text-[13.5px] text-ink-2">
                {APPLY.closedBody.en}
                {form.missing.length > 0 && <MoreText label="What is missing" text={`${APPLY.closedMissing.en} ${form.missing.join(", ")}.`} />}
              </span>
            }
          />
        </Card>
      ) : (
        <RegistrationWizard config={form} token={token} />
      )}
    </SignInScreen>
  );
}
