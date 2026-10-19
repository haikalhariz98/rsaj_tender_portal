import { ClockIcon } from "@/components/icons";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { AUTH_WORDS } from "@/lib/auth/words";
import { formatOrgDateTime } from "@/lib/format";
import type { PreviousSignIn } from "@/lib/auth/session-store";

/**
 * When and from where this account last signed in before now, and how many times someone failed to get in since (ruling O-2).
 *
 * With no second sign-in factor, this is how a person notices that their password is in someone else's hands. It sits on the page after
 * sign-in and on the account page, in the same words. Failures against a name that matched no account cannot be attributed to anyone and are not counted.
 */
export function LastSignIn({ info, timeZone, contact = "an administrator" }: { info: PreviousSignIn; timeZone: string | null; /// Who to tell if it was not them: an administrator on the staff side, the procurement office on the portal.
  contact?: string }) {
  const failed = info.failedSince ?? 0;
  return (
    <Card>
      <CardHeader icon={<ClockIcon size={18} />} title={AUTH_WORDS.previousTitle.en} subtitle={`Not you? Tell ${contact}.`} />
      <CardBody>
        {info.previous ? (
          <div className="flex flex-col gap-4">
            <KeyValues
              columns={2}
              items={[
                { label: "When", value: formatOrgDateTime(info.previous.at, timeZone) },
                { label: "From address", value: info.previous.sourceAddress ?? AUTH_WORDS.addressUnknown.en },
              ]}
            />
            {failed > 0 ? (
              <Callout tone="warn" title={failed === 1 ? "1 failed sign-in since then" : `${failed} failed sign-ins since then`}>
                Not you? Change your password now.
              </Callout>
            ) : (
              <p className="text-[13.5px] text-ink-3">{AUTH_WORDS.noFailures.en}</p>
            )}
          </div>
        ) : (
          <p className="text-[13.5px] text-ink-3">{AUTH_WORDS.previousFirst.en}</p>
        )}
      </CardBody>
    </Card>
  );
}
