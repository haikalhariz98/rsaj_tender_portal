import { acknowledgeResetAction } from "@/app/account/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import type { AccountView } from "@/lib/auth/account-view";
import { AUTH_WORDS } from "@/lib/auth/words";
import { DASHBOARD_WORDS as D } from "@/lib/i18n/catalogues/dashboard";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

/**
 * What a person must know on arriving, shown on the dashboard only when there is something (founder, 2026-10-08: sign-in goes straight to
 * the dashboard, not to a page of its own). The compensating control for the missing second factor (ruling O-2) stays: failed attempts
 * against the account since its previous sign-in are raised here, and the previous sign-in itself is on the account page.
 *
 * `lang` is the language the screen is read in (NFR-LNG-001, ADR 0040); English when it is not passed.
 */
export function SignInNotices({ view, lang = "en" }: { view: AccountView; lang?: Language }) {
  const failed = view.last.failedSince ?? 0;
  if (!view.mustChangePassword && !view.resetNoticePending && failed === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-3">
      {view.mustChangePassword && (
        <Callout
          tone="warn"
          title={say(AUTH_WORDS.mustChangeTitle, lang)}
          action={
            <ButtonLink href="/account" variant="secondary" size="sm">
              {say(D.changePassword, lang)}
            </ButtonLink>
          }
        >
          {say(AUTH_WORDS.mustChangeBody, lang)}
        </Callout>
      )}
      {view.resetNoticePending && (
        <Callout
          tone="warn"
          title={say(AUTH_WORDS.resetNoticeTitle, lang)}
          action={
            <form action={acknowledgeResetAction}>
              <Button type="submit" variant="secondary" size="sm">
                {say(D.haveSeenThis, lang)}
              </Button>
            </form>
          }
        >
          {say(AUTH_WORDS.resetNoticeBody, lang)}
        </Callout>
      )}
      {failed > 0 && (
        <Callout
          tone="warn"
          title={sayWith(failed === 1 ? D.failedAttempt : D.failedAttempts, lang, { count: String(failed) })}
          action={
            <ButtonLink href="/account" variant="secondary" size="sm">
              {say(D.reviewSignIns, lang)}
            </ButtonLink>
          }
        >
          {say(D.notYou, lang)}
        </Callout>
      )}
    </div>
  );
}
