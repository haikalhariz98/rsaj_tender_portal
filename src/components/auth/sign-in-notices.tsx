import { acknowledgeResetAction } from "@/app/account/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import type { AccountView } from "@/lib/auth/account-view";
import { AUTH_WORDS } from "@/lib/auth/words";

/**
 * What a person must know on arriving, shown on the dashboard only when there is something (founder, 2026-10-08: sign-in goes straight to
 * the dashboard, not to a page of its own). The compensating control for the missing second factor (ruling O-2) stays: failed attempts
 * against the account since its previous sign-in are raised here, and the previous sign-in itself is on the account page.
 */
export function SignInNotices({ view }: { view: AccountView }) {
  const failed = view.last.failedSince ?? 0;
  if (!view.mustChangePassword && !view.resetNoticePending && failed === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-3">
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
      {failed > 0 && (
        <Callout
          tone="warn"
          title={`${failed} failed ${failed === 1 ? "attempt" : "attempts"} to sign in to your account since you last signed in`}
          action={
            <ButtonLink href="/account" variant="secondary" size="sm">
              Review sign-ins
            </ButtonLink>
          }
        >
          If this was not you, change your password and tell an administrator.
        </Callout>
      )}
    </div>
  );
}
