import { LastSignIn } from "@/components/auth/last-sign-in";
import { ButtonLink, Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { loadAccountView } from "@/lib/auth/account-view";
import { AUTH_WORDS } from "@/lib/auth/words";

import { requireStaff } from "../_auth/actor";
import { acknowledgeResetAction } from "../account/actions";

export const dynamic = "force-dynamic";

/**
 * The first page after signing in. It says what a person most needs to know on arrival, before the work: that their password was reset, or must be
 * changed, and when and from where this account last signed in (ruling O-2), so that a password in the wrong hands is noticed. Then on to the dashboard.
 */
export default async function WelcomePage() {
  const actor = await requireStaff();
  const view = await loadAccountView(actor);
  const firstName = actor.personName.split(/\s+/)[0];

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        subtitle="You are signed in. Before you go on, check the sign-in below is yours."
        actions={
          <ButtonLink href="/" variant="primary">
            Continue to the dashboard
          </ButtonLink>
        }
      />
      <div className="flex max-w-3xl flex-col gap-5">
        {view.mustChangePassword && (
          <Callout
            tone="warn"
            title={AUTH_WORDS.mustChangeTitle.en}
            action={
              <ButtonLink href="/account" variant="secondary" size="sm">
                Change password
              </ButtonLink>
            }
          >
            {AUTH_WORDS.mustChangeBody.en}
          </Callout>
        )}
        {view.resetNoticePending && (
          <Callout
            tone="warn"
            title={AUTH_WORDS.resetNoticeTitle.en}
            action={
              <form action={acknowledgeResetAction}>
                <Button type="submit" variant="secondary" size="sm">
                  I have seen this
                </Button>
              </form>
            }
          >
            {AUTH_WORDS.resetNoticeBody.en}
          </Callout>
        )}
        <LastSignIn info={view.last} timeZone={actor.organisationTimeZone} />
        {!view.addressesRecorded && (
          <Callout tone="neutral" title="Addresses are not recorded">
            {AUTH_WORDS.addressesNotRecorded.en}
          </Callout>
        )}
      </div>
    </>
  );
}
