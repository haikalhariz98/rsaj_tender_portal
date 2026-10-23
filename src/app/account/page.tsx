import { DataList, type Column, type Row } from "@/components/data-list";
import { BackIcon, LogOutIcon, LockIcon, ShieldIcon } from "@/components/icons";
import { AuthForm } from "@/components/auth/auth-form";
import { LastSignIn } from "@/components/auth/last-sign-in";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { LeadWithMore } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { loadAccountView } from "@/lib/auth/account-view";
import { retentionStatement } from "@/lib/auth/policy";
import { describeUserAgent } from "@/lib/auth/user-agent";
import { AUTH_WORDS } from "@/lib/auth/words";
import { formatOrgDateTime } from "@/lib/format";

import { requireStaff } from "../_auth/actor";
import { acknowledgeResetAction, changePasswordAction, signOutEverywhereAction } from "./actions";

export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "device", label: "Signed in on", mobile: "primary" },
  { key: "started", label: "Signed in", width: "190px", nowrap: true, mobile: "meta" },
  { key: "seen", label: "Last active", width: "190px", nowrap: true, mobile: "meta" },
  { key: "this", label: "", width: "120px", mobile: "meta" },
];

export const metadata = { title: "Your account" };

export default async function AccountPage() {
  const actor = await requireStaff();
  const view = await loadAccountView(actor);
  const zone = actor.organisationTimeZone;

  const rows: Row[] = view.sessions.map((s) => ({
    id: s.id,
    cells: {
      device: { kind: "stack", title: describeUserAgent(s.userAgent), sub: s.sourceAddress ?? AUTH_WORDS.addressUnknown.en },
      started: { kind: "text", text: formatOrgDateTime(s.createdAt, zone) },
      seen: { kind: "text", text: formatOrgDateTime(s.lastSeenAt, zone) },
      this: s.current ? { kind: "badge", text: "This device", tone: "ok" } : { kind: "text", text: "" },
    },
    search: "",
  }));

  return (
    <>
      <PageHeader
        title="Your account"
        meta={[actor.personName, view.loginName, <InfoChip key="pw" outline detail="No second sign-in step is built.">Password only</InfoChip>]}
        actions={
          <ButtonLink href="/" variant="secondary" size="sm" icon={<BackIcon size={15} />}>
            Dashboard
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-5">
        {view.mustChangePassword && (
          <Callout tone="warn" title={AUTH_WORDS.mustChangeTitle.en}>
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

        <LastSignIn info={view.last} timeZone={zone} />

        <Card>
          <CardHeader icon={<LockIcon size={18} />} title="Change your password" subtitle={<LeadWithMore lead={`Last changed ${formatOrgDateTime(view.passwordChangedAt, zone)}`} more="Changing it ends every other sign-in of yours." />} />
          <CardBody>
            <div className="max-w-md">
              <AuthForm
                action={changePasswordAction}
                submitLabel="Change password"
                busyLabel="Changing…"
                fields={[
                  { name: "current", label: "Current password", type: "password", autoComplete: "current-password" },
                  { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
                  { name: "confirm", label: "New password, again", type: "password", autoComplete: "new-password" },
                ]}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<ShieldIcon size={18} />}
            title="Where you are signed in"
            actions={
              <form action={signOutEverywhereAction}>
                <Button type="submit" variant="destructive" size="sm" icon={<LogOutIcon size={15} />}>
                  Sign out everywhere
                </Button>
              </form>
            }
          />
          <DataList columns={COLUMNS} rows={rows} toolbar={false} searchable={false} selectable={false} flat emptyTitle="No other sign-ins" />
          <CardBody>
            <KeyValues
              items={[
                { label: "Sign-in addresses", value: retentionStatement(view.retentionDays) },
                ...(view.addressesRecorded ? [] : [{ label: "Source addresses", value: AUTH_WORDS.addressesNotRecorded.en }]),
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
