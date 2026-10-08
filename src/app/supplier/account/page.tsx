import type { Metadata } from "next";
import Link from "next/link";

import { DataList, type Column, type Row } from "@/components/data-list";
import { LockIcon, ShieldIcon } from "@/components/icons";
import { LastSignIn } from "@/components/auth/last-sign-in";
import { PortalForm } from "@/components/auth/portal-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { issueFormToken } from "@/lib/auth/form-secret";
import { retentionStatement } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { SUPPLIER_AUTH_POSTS } from "@/lib/auth/routes";
import { listOpenSupplierSessions, previousSupplierSignIn } from "@/lib/auth/supplier-session-store";
import { describeUserAgent } from "@/lib/auth/user-agent";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { loadRegistrationStatus } from "@/lib/portal/registration-status-repo";
import { applicationChannelWords, applicationKindWords, applicationStatusWords, outcomeWords, supplierStatusWords } from "@/lib/portal/registration-status";

import { requireSupplier } from "../../_auth/supplier";
import { AccountButton } from "./account-buttons";

export const metadata: Metadata = { title: "Your supplier account" };
export const dynamic = "force-dynamic";

const COLUMNS: Column[] = [
  { key: "device", label: "Signed in on", mobile: "primary" },
  { key: "started", label: "Signed in", width: "190px", nowrap: true, mobile: "meta" },
  { key: "seen", label: "Last active", width: "190px", nowrap: true, mobile: "meta" },
  { key: "this", label: "", width: "120px", mobile: "meta" },
];

/**
 * A supplier's own page (Phase 4a): where the registration stands (FR-VND-001: application status tracking), and the account itself. The supplier is the session's: this page
 * reads only that supplier's rows, and nothing in its address names one. Nothing is sent to a supplier (INT-09), so a decision the office makes is told here, in the reasons it wrote.
 */
export default async function SupplierAccountPage() {
  const actor = await requireSupplier();
  const zone = actor.organisationTimeZone;
  const [status, last, sessions, account, policy] = await Promise.all([
    loadRegistrationStatus(actor),
    previousSupplierSignIn(actor.accountId, actor.sessionCreatedAt),
    listOpenSupplierSessions(actor.accountId, actor.organisationId, actor.sessionId),
    db.supplierAccount.findFirst({ where: { id: actor.accountId, organisationId: actor.organisationId }, select: { passwordChangedAt: true } }),
    loadSecurityPolicy(db, actor.organisationId),
  ]);
  const token = issueFormToken("account");

  const rows: Row[] = sessions.map((s) => ({
    id: s.id,
    cells: {
      device: { kind: "stack", title: describeUserAgent(s.userAgent), sub: s.sourceAddress ?? AUTH_WORDS.addressUnknown.en },
      started: { kind: "text", text: formatOrgDateTime(s.createdAt, zone) },
      seen: { kind: "text", text: formatOrgDateTime(s.lastSeenAt, zone) },
      this: s.current ? { kind: "badge", text: "This device", tone: "ok" } : { kind: "text", text: "" },
    },
    search: "",
  }));
  const latest = status?.applications[0] ?? null;
  const standing = status ? supplierStatusWords(status.supplier, latest, formatDate) : null;

  return (
    <>
      <PageHeader title="Your account" subtitle={`${actor.supplierName}. Where your registration stands, and your sign-in.`} meta={[actor.displayName, actor.loginName]} />

      <div className="flex max-w-4xl flex-col gap-5">
        {actor.mustChangePassword && (
          <Callout tone="warn" title={AUTH_WORDS.mustChangeTitle.en}>
            {AUTH_WORDS.mustChangeBody.en}
          </Callout>
        )}
        {actor.resetNoticePending && (
          <Callout
            tone="warn"
            title={AUTH_WORDS.resetNoticeTitle.en}
            action={token ? <AccountButton path={SUPPLIER_AUTH_POSTS.acknowledgeReset} formToken={token} label="I have seen this" /> : undefined}
          >
            This account&apos;s password was reset with a code from the procurement office. If that was not you, or you did not ask for it, tell the procurement office now.
          </Callout>
        )}

        <Card>
          <CardHeader
            title="Your registration"
            subtitle="What the procurement office has done with your application. Nothing is sent to you by email: this page is where you are told."
            actions={standing ? <Badge tone={standing.tone} dot>{standing.title.en}</Badge> : undefined}
          />
          <CardBody>
            {!status || !standing ? (
              <p className="text-[13.5px] text-ink-3">Your registration could not be found. Contact the procurement office.</p>
            ) : (
              <div className="flex flex-col gap-5">
                <KeyValues
                  columns={2}
                  items={[
                    { label: "Company", value: status.supplier.registeredName },
                    { label: "Where it stands", value: standing.detail.en },
                  ]}
                />
                {status.applications.length === 0 ? (
                  <p className="text-[13.5px] text-ink-3">The procurement office has no application of yours on record yet.</p>
                ) : (
                  status.applications.map((a) => {
                    const words = applicationStatusWords(a, formatDate);
                    return (
                      <div key={a.id} className="rounded-2xl border border-line p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[14px] font-bold text-ink">
                            {applicationKindWords(a.kind).en}, received {formatDate(a.receivedOn)}
                          </h3>
                          <span className="text-[13px] text-ink-3">{applicationChannelWords(a.channel).en}</span>
                          <Badge tone={words.tone} dot>
                            {words.title.en}
                          </Badge>
                        </div>
                        <p className="mt-1.5 text-[13.5px] text-ink-2">{words.detail.en}</p>
                        {a.decisions.length > 0 && (
                          <ul className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                            {a.decisions.map((d) => (
                              <li key={d.id} className="text-[13.5px] text-ink-2">
                                <p className="font-semibold text-ink">
                                  {outcomeWords(d.outcome).en}, {formatDate(d.decidedOn)}
                                </p>
                                {d.remarks && <p className="mt-0.5 whitespace-pre-line">{d.remarks}</p>}
                                {d.items.length > 0 && (
                                  <ul className="mt-1.5 list-disc pl-5">
                                    {d.items.map((i, n) => (
                                      <li key={n}>
                                        <span className="font-semibold">{i.label}</span>
                                        {i.remarks ? `: ${i.remarks}` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <LastSignIn info={last} timeZone={zone} contact="the procurement office" />

        <Card>
          <CardHeader icon={<LockIcon size={18} />} title="Change your password" subtitle={`${account ? `Last changed ${formatOrgDateTime(account.passwordChangedAt, zone)}. ` : ""}Changing it ends every other sign-in of yours.`} />
          <CardBody>
            <div className="max-w-md">
              {token ? (
                <PortalForm
                  path={SUPPLIER_AUTH_POSTS.changePassword}
                  formToken={token}
                  submitLabel="Change password"
                  fields={[
                    { name: "current", label: "Current password", type: "password", autoComplete: "current-password" },
                    { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
                    { name: "confirm", label: "New password, again", type: "password", autoComplete: "new-password" },
                  ]}
                />
              ) : (
                <Callout tone="warn">{AUTH_WORDS.portalFormsClosed.en}</Callout>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<ShieldIcon size={18} />}
            title="Where you are signed in"
            subtitle="If one of these is not yours, sign out everywhere and change your password."
            actions={token ? <AccountButton path={SUPPLIER_AUTH_POSTS.signOutEverywhere} formToken={token} label="Sign out everywhere" variant="destructive" icon="logout" /> : undefined}
          />
          <DataList columns={COLUMNS} rows={rows} toolbar={false} searchable={false} selectable={false} flat emptyTitle="No other sign-ins" />
          <CardBody>
            <KeyValues items={[{ label: "Sign-in addresses", value: retentionStatement(policy?.signInDetailRetentionDays ?? null) }]} />
          </CardBody>
        </Card>

        <div>
          <Link href="/supplier" className="text-[13.5px] font-semibold">
            Back to the portal
          </Link>
        </div>
      </div>
    </>
  );
}
