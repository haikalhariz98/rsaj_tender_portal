import Link from "next/link";

import { Badge, Chip } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { SUPPLIER_REGISTRATION_GETS } from "@/lib/auth/routes";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { formatBytes, mediaLabel } from "@/lib/documents/labels";
import { formatDate, formatOrgDay } from "@/lib/format";
import { BANK_READING_WORDS, bankReading } from "@/lib/portal/company/bank";
import { loadBankTab, loadDocumentsTab, loadOverviewTab } from "@/lib/portal/company/company-store";
import { DOCUMENT_STATE_WORDS, ITEM_STATE_WORDS, type DocumentRow } from "@/lib/portal/company/documents";
import { companyFaultText } from "@/lib/portal/company/words";
import { requestWords } from "@/lib/portal/registration-status";
import { loadRegistrationContext, loadRegistrationSettings } from "@/lib/portal/registration/context-store";
import { fillText } from "@/lib/portal/registration/declaration";
import type { CreditorInput } from "@/lib/portal/registration/types";
import { EMPTY_CREDITOR } from "@/lib/portal/registration/types";
import { loadUploadSettings } from "@/lib/portal/registration/upload-settings";
import { acceptNote, codeKinds, uploadClosedWords } from "@/lib/portal/registration/view";
import { bumiputeraWords } from "@/lib/suppliers/bumiputera";
import { EXPIRY_BAND_LABEL, EXPIRY_BAND_TONE } from "@/lib/suppliers/labels";
import type { RegistrationValueKind } from "@/lib/suppliers/types";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";

import { BankDrawer } from "./bank-drawer";
import { ReplaceDrawer, type ReplaceDrawerProps } from "./replace-drawer";

/**
 * The panels of the supplier's Company workspace (Phase 4c). Each loads only its own slice and is rendered only while it is the tab the address names; the supplier is the SESSION's.
 * Everything the office decides (the bands, the reminder days, the notice, the limits, the lists, the authorisation text) is its configuration, and each that is not set is said so in
 * words, never shown as a safe-looking nothing.
 */

const Section = ({ children }: { children: React.ReactNode }) => <div className="flex max-w-5xl flex-col gap-5">{children}</div>;

// ------------------------------------------------------------------ overview

export async function OverviewPanel({ actor }: { actor: SupplierActor }) {
  const o = await loadOverviewTab(db, actor, formatDate);
  if (!o) return <Callout tone="warn">Company not found. Tell the procurement office.</Callout>;
  const reading = bankReading(o.bank);
  const bankWords = BANK_READING_WORDS[reading];
  const registered = o.supplier.status === "REGISTERED";
  // Said by one rule, the account page's: answered only when every item has an answer, and the date having passed is said as such.
  const requestText = o.request ? requestWords(o.request.reading, o.request.resubmitBy, formatDate) : null;
  return (
    <Section>
      {o.supplier.status === "REJECTED" && (
        <Callout
          tone="warn"
          title="Application not accepted"
          action={
            <ButtonLink href="/supplier/account" variant="secondary" size="sm">
              Read the reasons
            </ButtonLink>
          }
        />
      )}
      {o.request && requestText && requestText.tone === "warn" && (
        <Callout
          tone="warn"
          title={requestText.title.en}
          action={
            <ButtonLink href="/supplier/company?tab=documents" variant="secondary" size="sm">
              {o.request.reading.kind === "WAITING" ? "Open the request" : o.request.reading.kind === "DATE_PASSED" ? "See the request" : "See what you sent"}
            </ButtonLink>
          }
        >
          {requestText.detail.en}
        </Callout>
      )}
      {(o.attention.expired > 0 || o.attention.critical > 0) && (
        <Callout
          tone={o.attention.expired > 0 ? "err" : "warn"}
          title={o.attention.expired > 0 ? "A document has expired" : "A document is about to expire"}
          action={
            <ButtonLink href="/supplier/company?tab=documents" variant="secondary" size="sm">
              See your documents
            </ButtonLink>
          }
        >
          {o.attention.expired > 0 ? `${o.attention.expired} of your documents ${o.attention.expired === 1 ? "has" : "have"} expired. ` : ""}
          {o.attention.critical > 0 ? `${o.attention.critical} ${o.attention.critical === 1 ? "expires" : "expire"} soon. ` : ""}
          Send a current copy.
        </Callout>
      )}

      <Card>
        <CardHeader title="Your registration" actions={<Badge tone={registered ? "ok" : "info"} dot>{registered ? "On the register" : o.supplier.status === "APPLICANT" ? "Application in progress" : "Not accepted"}</Badge>} />
        <CardBody>
          {o.company ? (
            <KeyValues
              columns={2}
              items={[
                { label: "Company", value: o.company.registeredName },
                { label: "Registration number", value: <span className="flex flex-wrap items-center gap-2">{o.company.registrationNo}{o.company.formatChecked === true ? <Chip tone="ok">Format checked</Chip> : o.company.formatChecked === false ? <Chip tone="warn">Format does not fit</Chip> : <Chip>Format not checked</Chip>}</span> },
                { label: "Reference", value: o.supplier.reference },
                { label: "On the register since", value: o.supplier.registeredOn ? formatDate(o.supplier.registeredOn) : "Not yet registered" },
                { label: "Type of company", value: o.company.entityTypeName ?? "Not given" },
                { label: "Country", value: o.company.countryName ?? "Not given" },
                { label: "Registered address", value: <span className="whitespace-pre-line">{o.company.addressLines.join("\n")}</span> },
                { label: "Date incorporated", value: o.company.incorporatedOn ? formatDate(o.company.incorporatedOn) : "Not given" },
                { label: "Company email", value: <span className="flex flex-wrap items-center gap-2">{o.company.companyEmail}<Chip tone="warn">Not verified</Chip></span> },
                {
                  label: "Bumiputera status",
                  value: (
                    <span className="flex flex-col gap-1">
                      <span>{bumiputeraWords(o.bumiputera!.reading).en}</span>
                      {o.bumiputera!.evidenceExpiry && <span className="text-[12.5px] text-ink-3">The document that evidences it expires on {formatDate(o.bumiputera!.evidenceExpiry)}.</span>}
                      {o.bumiputera!.flagged && <span className="text-[12.5px] text-amber-800">Send its evidence under Documents.</span>}
                    </span>
                  ),
                },
              ]}
            />
          ) : (
            <p className="text-[13.5px] text-ink-3">Registration not found. Contact the procurement office.</p>
          )}
          <p className="mt-4 text-[12.5px] text-ink-3">To correct these, contact the procurement office.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Where you stand" actions={o.standing ? <Badge tone={o.standing.tone} dot>{o.standing.title}</Badge> : undefined} />
        <CardBody>
          {o.standing ? (
            <div className="flex flex-col gap-2 text-[13.5px] text-ink-2">
              {o.standing.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              <p>{o.standing.meaning}</p>
              <p>
                <Link className="font-semibold" href="/supplier/company?tab=eligibility">
                  See the exercises you qualify for
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-3">Not judged: time zone not set. Tell the procurement office.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your bank details" actions={<Badge tone={bankWords.tone} dot>{bankWords.title}</Badge>} />
        <CardBody>
          <p className="text-[13.5px] text-ink-2">{bankWords.detail}</p>
          <p className="mt-2">
            <Link className="text-[13.5px] font-semibold" href="/supplier/company?tab=bank">
              Bank details
            </Link>
          </p>
        </CardBody>
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ documents

const KIND_TONE = { ok: "ok", warn: "warn", err: "err", info: "info", neutral: "neutral" } as const;

export async function DocumentsPanel({ actor, token, searchToken }: { actor: SupplierActor; token: string | null; searchToken: string | null }) {
  const tab = await loadDocumentsTab(db, actor);
  if (!tab) return <Callout tone="warn">Documents not found. Tell the procurement office.</Callout>;
  const types = new Map(tab.types.map((t) => [t.id, t]));
  const bandsOk = tab.policy.criticalDays != null && tab.policy.warningDays != null && tab.policy.upcomingDays != null;

  const drawer = (row: DocumentRow): ReplaceDrawerProps | null => {
    const t = types.get(row.typeId);
    if (!t) return null;
    const item = row.requested.find((i) => i.canAnswer) ?? null;
    const head = row.head;
    const target: ReplaceDrawerProps["target"] = item ? { kind: "item", id: item.id } : head ? { kind: "renew", id: head.id } : { kind: "new", id: row.typeId };
    const label = row.name;
    return {
      token,
      searchToken,
      target,
      title: item ? `Send ${label}` : head ? `Send a new copy of the ${label}` : `Send the ${label}`,
      buttonLabel: item ? "Send it" : head ? "Send a new copy" : "Send it",
      buttonVariant: item ? "primary" : "secondary",
      blockedReason: row.replace.allowed ? null : row.replace.reason,
      asked: item ? `${item.label}: ${item.remarks}` : null,
      type: { name: t.name, expires: t.expires, recordsRate: t.recordsRate, repeatable: t.repeatable, bodyId: t.bodyId, kinds: t.bodyId ? codeKinds(t.valueKinds as RegistrationValueKind[]) : [] },
      start: {
        reference: head?.reference ?? "",
        issuingAuthority: head?.issuingAuthority ?? "",
        title: head?.title ?? "",
        ratePercent: head?.ratePercent ?? "",
        chosen: (head?.codeValues ?? []).map((c) => ({ value: c.id, label: c.label, kind: c.kind })),
      },
      accept: tab.accept,
      renewal: head != null,
    };
  };

  return (
    <Section>
      {tab.request && (
        <Card>
          <CardHeader
            title="What the procurement office asked for"
            subtitle={tab.request.resubmitBy ? `Answer by ${formatDate(tab.request.resubmitBy)} or it is rejected.` : undefined}
            actions={<Badge tone={tab.request.open ? "warn" : "neutral"} dot>{tab.request.open ? "Open" : "The date has passed"}</Badge>}
          />
          <CardBody className="flex flex-col gap-3">
            {tab.request.remarks && <p className="text-[13.5px] whitespace-pre-line text-ink-2">{tab.request.remarks}</p>}
            <ul className="flex flex-col gap-2">
              {tab.request.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-line px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{i.label}</p>
                    <p className="text-[13px] whitespace-pre-line text-ink-2">{i.remarks}</p>
                  </div>
                  <Badge tone={ITEM_STATE_WORDS[i.state].tone} dot>{ITEM_STATE_WORDS[i.state].text}</Badge>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink-3">Send each below. Answers are not emailed.</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Your documents"
          subtitle={tab.notice ?? "An officer checks each copy."}
          divided
        />
        {!bandsOk && (
          <div className="border-b border-line px-5 py-3 sm:px-6">
            <Callout tone="warn">Expiry warnings are not set. Check each date yourself.</Callout>
          </div>
        )}
        {!tab.reminderRule && (
          <div className="border-b border-line px-5 py-3 sm:px-6">
            <p className="text-[12.5px] text-ink-3">Reminders: <Badge>Not set</Badge></p>
          </div>
        )}
        {tab.rows.length === 0 ? (
          <EmptyState size="sm" title={tab.today ? "No documents on record" : "Not judged: time zone not set"} />
        ) : (
          <div className="divide-y divide-line/70">
            {tab.rows.map((row) => {
              const d = drawer(row);
              const eff = row.effective;
              const words = DOCUMENT_STATE_WORDS[row.state];
              const doc = eff ?? row.head;
              return (
                <section key={`${row.typeId}-${row.name}-${row.head?.id ?? "new"}`} className="flex flex-col gap-3 px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-[14.5px] font-semibold text-ink">{row.name}</span>
                        {row.mandatory === true && <Badge outline>Required</Badge>}
                        {row.mandatory === null && <Badge tone="warn" outline>Required: not set</Badge>}
                        <Badge tone={KIND_TONE[words.tone]} dot>{words.text}</Badge>
                        {row.band && row.band.band !== "NONE" && row.band.band !== "NO_EXPIRY" && row.state === "VALID" && (
                          <Chip tone={EXPIRY_BAND_TONE[row.band.band] === "neutral" ? undefined : EXPIRY_BAND_TONE[row.band.band]}>
                            {EXPIRY_BAND_LABEL[row.band.band].en}
                            {row.band.daysLeft != null ? `: ${row.band.daysLeft} ${row.band.daysLeft === 1 ? "day" : "days"} left` : ""}
                          </Chip>
                        )}
                      </div>
                      {row.hint && <p className="text-[12.5px] text-ink-3">{row.hint}</p>}
                    </div>
                    {d && <ReplaceDrawer {...d} />}
                  </div>

                  {doc && !doc.notApplicable && (
                    <KeyValues
                      columns={3}
                      items={[
                        { label: "Reference", value: doc.reference || "—" },
                        { label: "Issued by", value: doc.issuingAuthority || "—" },
                        { label: "Valid", value: `${doc.validFrom ? `from ${formatDate(doc.validFrom)}` : "from issue"}${doc.expiresOn ? ` to ${formatDate(doc.expiresOn)}` : ", no expiry date"}` },
                        ...(doc.ratePercent ? [{ label: "Rate", value: `${doc.ratePercent}%` }] : []),
                        ...(doc.codes.length ? [{ label: "Codes", value: doc.codes.join("; ") }] : []),
                        { label: "File", value: doc.files > 0 ? <span className="flex flex-wrap items-center gap-2">{doc.files} {doc.files === 1 ? "file" : "files"}{doc.notScanned && <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>}</span> : "None on record" },
                      ]}
                    />
                  )}

                  {row.reminder && row.effective?.expiresOn && (
                    <p className="text-[13px] text-amber-800">
                      Expires {formatDate(row.effective.expiresOn)}. {row.reminder.offset}-day reminder, due {formatDate(row.reminder.dueOn)}. Not emailed.
                    </p>
                  )}
                  {row.state === "EXPIRED" && row.effective?.expiresOn && <p className="text-[13px] text-rose-700">This expired on {formatDate(row.effective.expiresOn)}. Send a current copy.</p>}
                  {row.state === "NOT_IN_ORDER" && !row.requested.length && <p className="text-[13px] text-amber-800">Not accepted. Send a corrected copy.</p>}
                  {row.pending && (
                    <p className="text-[13px] text-sky-800">
                      New copy sent {formatDate(row.pending.lodgedOn)}, waiting for an officer.{row.effective ? " The one above stays in force." : ""}
                    </p>
                  )}
                  {row.upcoming && <p className="text-[13px] text-sky-800">New copy checked. Takes over {row.upcoming.validFrom ? formatDate(row.upcoming.validFrom) : "on its first valid day"}.</p>}

                  {row.requested.length > 0 && (
                    <ul className="flex flex-col gap-1.5 rounded-2xl bg-sunken/60 px-4 py-3">
                      {row.requested.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-2">
                          <span>
                            <span className="font-semibold text-ink">The office asked:</span> {i.remarks}
                          </span>
                          <Badge tone={ITEM_STATE_WORDS[i.state].tone}>{ITEM_STATE_WORDS[i.state].text}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>

      {tab.supplier.status === "REGISTERED" && tab.types.some((t) => t.repeatable) && (
        <Card>
          <CardHeader title="Add another document" divided={false} />
          <CardBody className="flex flex-wrap gap-3">
            {tab.types
              .filter((t) => t.repeatable)
              .map((t) => {
                const row: DocumentRow = { typeId: t.id, name: t.name, hint: null, mandatory: null, state: "MISSING", effective: null, pending: null, upcoming: null, head: null, band: null, reminder: null, requested: [], replace: tab.supplier.status === "REGISTERED" && !tab.uploadClosed ? { allowed: true, reason: null } : { allowed: false, reason: tab.uploadClosed ?? "Send documents when the procurement office asks." } };
                const d = drawer(row);
                return d ? <ReplaceDrawer key={t.id} {...d} buttonLabel={`Add: ${t.name}`} title={`Add: ${t.name}`} /> : null;
              })}
          </CardBody>
        </Card>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ bank details

export async function BankPanel({ actor, token, searchToken }: { actor: SupplierActor; token: string | null; searchToken: string | null }) {
  const [tab, settings] = await Promise.all([loadBankTab(db, actor), loadRegistrationSettings(db, actor.organisationId)]);
  const supplier = await db.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { status: true } });
  if (!settings || !supplier) return <Callout tone="warn">Bank details not found. Tell the procurement office.</Callout>;
  const [ctx, uploads] = await Promise.all([loadRegistrationContext(db, actor, settings, []), loadUploadSettings(db, actor.organisationId, settings)]);
  const reading = bankReading(tab.state);
  const words = BANK_READING_WORDS[reading];
  const giro = ctx.texts.GIRO_AUTHORISATION;
  const shownVersion = tab.versions.find((v) => v.row.version === tab.state.inForce?.version) ?? tab.versions.find((v) => v.row.version === tab.state.waiting?.version) ?? tab.versions.find((v) => v.row.version === tab.state.notInOrder?.version) ?? null;
  const initial: CreditorInput = shownVersion ? ({ ...EMPTY_CREDITOR, ...Object.fromEntries(Object.entries(shownVersion.row.values).filter(([k]) => k in EMPTY_CREDITOR)) } as CreditorInput) : EMPTY_CREDITOR;
  const statementClosed = uploadClosedWords(uploads.store, uploads.statement, "statement");
  const blocked =
    supplier.status !== "REGISTERED"
      ? companyFaultText({ code: "NOT_REGISTERED_FOR_CHANGE" }).en
      : tab.state.waiting
        ? companyFaultText({ code: "CHANGE_WAITING" }).en
        : ctx.today == null
          ? companyFaultText({ code: "TIME_ZONE_UNSET" }).en
          : ctx.banks.length === 0
            ? "Bank list not set. Tell the procurement office."
            : ctx.accountTypes.length === 0
              ? "Account types not set. Tell the procurement office."
              : !giro
                ? "Authorisation text not set. Tell the procurement office."
                : statementClosed;
  return (
    <Section>
      {words.tone === "warn" && (
        <Callout tone="warn" title={words.title}>
          {words.detail}
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Your bank details"
          subtitle="Confidential"
          actions={
            <BankDrawer
              token={token}
              initial={initial}
              banks={ctx.banks.map((b) => ({ value: b.code, label: b.nameEn }))}
              accountTypes={ctx.accountTypes.map((b) => ({ value: b.code, label: b.nameEn }))}
              giro={giro ? { id: giro.id, text: fillText(giro.bodyEn, settings.org.name), ms: giro.bodyMs ? fillText(giro.bodyMs, settings.org.name) : "", sha256: giro.sha256 } : null}
              signatoryName={actor.displayName}
              signatoryDesignation=""
              blockedReason={blocked}
              accept={acceptNote(uploads.store, mediaLabel, formatBytes)}
              buttonLabel={tab.state.none ? "Give your bank details" : "Change bank details"}
            />
          }
        />
        <CardBody className="flex flex-col gap-5">
          {tab.versions.length === 0 ? (
            <p className="text-[13.5px] text-ink-3">No bank details on record.</p>
          ) : (
            tab.versions.map(({ row, summary }) => {
              const state = row.version === tab.state.inForce?.version ? { text: "In force", tone: "ok" as const } : row.verification === "NOT_CHECKED" ? { text: "Waiting for an officer", tone: "info" as const } : { text: "Not accepted", tone: "warn" as const };
              return (
                <div key={row.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14.5px] font-bold text-ink">Version {row.version}</h3>
                    <Badge tone={state.tone} dot>{state.text}</Badge>
                    {row.submittedAt && <span className="text-[12.5px] text-ink-3">Sent {formatOrgDay(row.submittedAt, actor.organisationTimeZone)}</span>}
                  </div>
                  <KeyValues
                    columns={2}
                    className="mt-3"
                    items={[
                      { label: "Beneficiary", value: summary.beneficiaryName || "—" },
                      { label: "Identity card or company number", value: summary.beneficiaryIdentityNo || "—" },
                      { label: "Bank", value: summary.bankName || "—" },
                      { label: "Account type", value: summary.accountTypeName || "—" },
                      { label: "Account number", value: summary.bankAccountNo || "—" },
                      { label: "SWIFT code", value: summary.bankSwiftCode || "—" },
                      { label: "Bank address", value: <span className="whitespace-pre-line">{summary.bankAddress || "—"}</span> },
                      {
                        label: "Bank statement",
                        value: row.statement.length ? (
                          <span className="flex flex-col gap-1">
                            {row.statement.map((f) => (
                              <span key={f.versionId} className="flex flex-wrap items-center gap-2">
                                <a className="min-w-0 break-all font-medium text-brand-700 hover:underline" href={`${SUPPLIER_REGISTRATION_GETS.file}?id=${encodeURIComponent(f.versionId)}&t=${encodeURIComponent(searchToken ?? "")}`}>
                                  {f.name}
                                </a>
                                <Chip tone="warn">{NOT_SCANNED_LABEL}</Chip>
                              </span>
                            ))}
                          </span>
                        ) : (
                          "None"
                        ),
                      },
                    ]}
                  />
                  {row.verification === "NOT_IN_ORDER" && row.verificationNote && (
                    <p className="mt-3 text-[13px] text-amber-800">
                      <span className="font-semibold">What the office said:</span> {row.verificationNote}
                    </p>
                  )}
                  {row.verification === "VERIFIED" && row.verifiedOn && <p className="mt-3 text-[12.5px] text-ink-3">Checked {formatDate(row.verifiedOn)}.</p>}
                </div>
              );
            })
          )}
        </CardBody>
      </Card>
    </Section>
  );
}
