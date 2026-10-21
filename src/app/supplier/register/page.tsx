import type { Metadata } from "next";

import { SignInScreen } from "@/components/auth/sign-in-screen";
import { MoreText } from "@/components/ui/more-text";
import { BuildingIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { EmptyState, Note } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { Stepper } from "@/components/ui/stepper";
import { signInOrganisation } from "@/lib/auth/deployment";
import { issueFormToken } from "@/lib/auth/form-secret";
import { loadPortalBranding } from "@/lib/organisation/portal-load";
import { loadRegistrationForm } from "@/lib/portal/apply-repo";
import { APPLY } from "@/lib/portal/labels";
import { loadPublicShell } from "@/lib/portal/deployment";
import { STEP_INFO } from "@/lib/portal/registration/view";

import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: APPLY.title.en };
export const dynamic = "force-dynamic";

/**
 * A supplier applies to join the register, without signing in. The application lands in the staff
 * review queue marked as sent through the portal; nothing here reads an application back, so there is
 * no status page. No bank details are asked and nothing is uploaded.
 */
export default async function SupplierRegisterPage() {
  const [{ organisation }, form, door] = await Promise.all([loadPublicShell(), loadRegistrationForm(), signInOrganisation()]);
  const branding = await loadPortalBranding(door?.id ?? null);
  const open = form.ready && form.missing.length === 0;

  return (
    <SignInScreen variant="portal" page="register" branding={branding}>
      <PageHeader title={APPLY.title.en} subtitle={APPLY.subtitle(organisation.name).en} info={{ title: APPLY.title.en, text: APPLY.info.en }} />

      {!form.ready ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en} action={<span className="text-[13.5px] text-ink-2">{APPLY.noOrganisation.en}</span>} />
        </Card>
      ) : !open ? (
        <Card>
          <EmptyState title={APPLY.closedTitle.en} icon={<BuildingIcon size={22} />} action={<span className="inline-flex items-center gap-1 text-[13.5px] text-ink-2">{APPLY.closedBody.en}<MoreText label="What is missing" text={`${APPLY.closedMissing.en} ${form.missing.map((m) => m.en).join(", ")}.`} /></span>} />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* SR-01: the five steps, step 1 current. Steps 2 to 5 are signed in, after the office has checked the company (the 2026-10-07 two-stage ruling). */}
          <Stepper label={APPLY.stepsLabel.en} steps={STEP_INFO.map((s, i) => ({ key: s.key, label: s.label, state: i === 0 ? "current" : "waiting" }))} />
          <Note title={APPLY.beforeTitle.en}>
            <ul className="mt-1 list-disc pl-5">
              {APPLY.beforeItems.map((item) => (
                <li key={item.en}>{item.en}</li>
              ))}
            </ul>
          </Note>
          <ApplicationForm
            formToken={issueFormToken("register")!}
            entityTypes={form.entityTypes}
            countries={form.countries}
            states={form.states}
            bumiputeraStatuses={form.bumiputeraStatuses}
            contactNeedsEmailAndPhone={form.contactNeedsEmailAndPhone === true}
            formatExample={form.formatExample}
            notice={form.notice}
            personalDataNotice={form.personalDataNotice!}
            organisationName={organisation.name}
          />
        </div>
      )}
    </SignInScreen>
  );
}
