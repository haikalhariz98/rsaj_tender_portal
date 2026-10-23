import Link from "next/link";

import { HistoryButton } from "@/components/history-drawer";
import { BuildingIcon, FileIcon, SlidersIcon } from "@/components/icons";
import { SettingValue } from "@/components/setup/setting-value";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { trustedProxyHops } from "@/lib/auth/request";
import { storedDay } from "@/lib/dates";
import { addressLimitState } from "@/lib/portal/register/address-limit";
import { loadRegisterSettings } from "@/lib/portal/apply-repo";
import { formatDate } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { asHeading, LIST_KIND_LABEL, VALUE_KIND_LABEL } from "@/lib/suppliers/labels";
import { db } from "@/lib/db";
import { DECLARATION_KIND_WORDS, DECLARATION_KINDS, megabytesOfBytes, type DeclarationKindName } from "@/lib/suppliers/registration-settings";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { OPTIONAL_LIST_KINDS, SUPPLIER_LIST_KINDS, type RegistrationValueKind } from "@/lib/suppliers/types";

import { DeclarationTextDrawer, DocumentTypeDrawer, EditPortalIntake, EditRegistrationSettings, RetireDeclarationTextDrawer, EditStandingRules, EditSupplierPolicy, ListValueDrawer, RetireListValueDrawer, RetireStandingReasonDrawer, RetireTypeDrawer, RetireValueDrawer, StandingReasonDrawer, ValueDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Supplier register" };

/// What a switch holds back while it is unset: one press away in the popover, never a sentence on the page.
const UNSET = {
  expires: "No document of this type can be lodged until it is set.",
  mandatory: "No application can be decided until it is set.",
  notApplicable: "None is recorded as not applicable until it is set.",
} as const;

const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unset");
const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/// A setting's value with its Edit beside it.
const line = (label: string, value: React.ReactNode, edit?: React.ReactNode) => ({
  label,
  value: (
    <span className="flex items-start justify-between gap-3">
      <span className="min-w-0">{value}</span>
      {edit}
    </span>
  ),
});

/**
 * Configuration › Supplier register: essentials on top (online registration, document types, declarations), everything else in
 * one Advanced fold. A source stays in the data and in History, not on this page.
 */
export default async function SupplierRegisterConfigPage() {
  const actor = await requireStaff();
  const org = await supplierOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        <PageHeader title="Supplier register" info={{ title: "Supplier register", text: "Registration, document types, declarations and the register's lists." }} />
        <Card>
          <EmptyState title="No organisation is configured" />
        </Card>
      </>
    );
  }
  const cfg = await loadSupplierConfig(org.id);
  const [docClasses, declTexts, register] = await Promise.all([
    db.documentClass.findMany({ where: { organisationId: org.id }, select: { id: true, nameEn: true, classification: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    db.declarationText.findMany({ where: { organisationId: org.id }, orderBy: [{ kind: "asc" }, { version: "desc" }], include: { _count: { select: { signed: true } } } }),
    loadRegisterSettings(db).catch(() => null), // the public form's own reader; a failure reads as closed
  ]);
  const live = (d: Date | null) => d == null || (org.today != null && storedDay(d) > org.today);
  const retiredText = (d: Date | null) => (d && !live(d) ? `Retired ${formatDate(storedDay(d))}` : null);
  const bodyOptions = cfg.bodies.filter((b) => live(b.retiredOn)).map((b) => ({ value: b.id, label: asHeading(b.labelEn) }));
  const switchesNotSet = cfg.types.filter((t) => live(t.retiredOn)).reduce((n, t) => n + [t.expires, t.mandatoryAtRegistration, t.notApplicableAllowed].filter((x) => x == null).length, 0);
  // The Bumiputera statuses are optional: an empty list means the claim is simply not asked. The others close recording (and the public form) while empty.
  const listsEmpty = SUPPLIER_LIST_KINDS.filter((k) => !OPTIONAL_LIST_KINDS.includes(k) && cfg.liveCodes(k, org.today).length === 0);
  const p = cfg.policy;
  const rulesNotSet = [p?.criticalDays, p?.expiryOnClosingDayCounts, p?.autoSuspendOnLapse, p?.blacklistFirstOffenceMonths, p?.registerRequiredForSale, p?.restrictionEvidenceTypeId, p?.ineligibleBidConsequence, p?.personalDataNoticeEn, p?.portalDailyLimit, p?.portalDailyLimitPerNumber, p?.portalAddressAttempts].filter((x) => x == null).length;
  const declarationsMissing = DECLARATION_KINDS.filter((k) => !declTexts.some((t) => t.kind === k && live(t.retiredOn)));
  const registrationNotSet = [p?.helpEmail || p?.helpPhone || null, p?.uploadMaxFilesPerApplication, p?.supplierUploadClassId, p?.supplierBankStatementClassId, p?.onlineDeclarationReplacesPaper].filter((x) => x == null).length + declarationsMissing.length;
  const notSet = switchesNotSet + listsEmpty.length + rulesNotSet + registrationNotSet;
  const className = (id: string | null | undefined) => docClasses.find((c) => c.id === id)?.nameEn ?? "A class no longer configured";
  const reasonName = (id: string | null | undefined) => cfg.reasons.find((x) => x.id === id)?.nameEn ?? null;
  const typeName = (id: string | null | undefined) => cfg.types.find((x) => x.id === id)?.nameEn ?? null;
  // RSEC-1(a): the address is known only behind a trusted proxy (ADR 0034 D11).
  const addressLimit = addressLimitState({ attempts: p?.portalAddressAttempts ?? null, minutes: p?.portalAddressMinutes ?? null }, trustedProxyHops(process.env.TRUSTED_PROXY_HOPS) != null);
  const open = register != null && register.missing.length === 0;

  const policyEdit = (
    <EditSupplierPolicy values={{ verificationNoticeEn: p?.verificationNoticeEn ?? "", noticeProvenance: p?.noticeProvenance ?? "", contactRule: p?.contactNeedsEmailAndPhone == null ? "" : p.contactNeedsEmailAndPhone ? "both" : "either", contactRuleProvenance: p?.contactRuleProvenance ?? "", governingSource: p?.governingSource ?? "" }} />
  );
  const intakeEdit = (
    <EditPortalIntake values={{ personalDataNoticeEn: p?.personalDataNoticeEn ?? "", personalDataProvenance: p?.personalDataProvenance ?? "", portalDailyLimit: p?.portalDailyLimit?.toString() ?? "", portalDailyLimitPerNumber: p?.portalDailyLimitPerNumber?.toString() ?? "", portalLimitProvenance: p?.portalLimitProvenance ?? "", portalAddressAttempts: p?.portalAddressAttempts?.toString() ?? "", portalAddressMinutes: p?.portalAddressMinutes?.toString() ?? "", portalAddressProvenance: p?.portalAddressProvenance ?? "" }} />
  );
  const registrationEdit = (
    <EditRegistrationSettings
      values={{ helpEmail: p?.helpEmail ?? "", helpPhone: p?.helpPhone ?? "", helpProvenance: p?.helpProvenance ?? "", maxFiles: p?.uploadMaxFilesPerApplication?.toString() ?? "", maxMegabytes: megabytesOfBytes(p?.uploadMaxBytesPerApplication ?? null)?.toString() ?? "", uploadLimitProvenance: p?.uploadLimitProvenance ?? "", uploadClassId: p?.supplierUploadClassId ?? "", statementClassId: p?.supplierBankStatementClassId ?? "", uploadClassProvenance: p?.uploadClassProvenance ?? "", onlineDeclarationReplacesPaper: tri(p?.onlineDeclarationReplacesPaper ?? null), onlineDeclarationProvenance: p?.onlineDeclarationProvenance ?? "" }}
      classes={{ upload: docClasses.map((c) => ({ value: c.id, label: c.nameEn })), statement: docClasses.filter((c) => c.classification === "SULIT").map((c) => ({ value: c.id, label: c.nameEn })) }}
    />
  );
  const switchCell = (value: boolean | null, yes: string, no: string, unset: string) => <SettingValue value={value == null ? null : value ? yes : no} unset={unset} />;

  return (
    <>
      <PageHeader
        title="Supplier register"
        badge={notSet > 0 ? <Badge tone="warn" dot>{notSet} not set</Badge> : <Badge tone="ok" dot>Set</Badge>}
        info={{ title: "Supplier register", text: "Registration, document types, declarations and the register's lists." }}
        actions={p && <HistoryButton entity="SupplierPolicy" entityId={p.id} label="the register's policy" />}
      />
      <div className="flex flex-col gap-6">
        {listsEmpty.length > 0 && (
          <Callout tone="warn" title="A list the register needs is empty">
            {listsEmpty.map((k) => LIST_KIND_LABEL[k].en).join(" and ")}: none in force.
          </Callout>
        )}

        <Card id="registration-online" className="scroll-mt-24">
          <CardHeader icon={<SlidersIcon size={17} />} title="Online registration" actions={<Badge tone={open ? "ok" : "warn"} dot>{open ? "Open" : "Closed"}</Badge>} />
          <CardBody>
            {!open && register && register.missing.length > 0 && <p className="mb-4 text-[13px] text-ink-3">Still to set: {register.missing.map((m) => m.en).join(", ")}.</p>}
            <KeyValues
              columns={2}
              items={[
                line("Help contact", <SettingValue value={[p?.helpEmail, p?.helpPhone].filter(Boolean).join(" · ")} unset="The supplier's registration shows no line saying who to ask." />, registrationEdit),
                line("Notice about personal details", <SettingValue value={p?.personalDataNoticeEn?.trim() ? p.personalDataNoticeEn : null} unset="The public form stays closed." />, intakeEdit),
                line("Verification notice", <SettingValue value={p?.verificationNoticeEn ?? null} unset="Suppliers are told nothing about document checks." />, policyEdit),
                line("What a contact must give", <SettingValue value={p?.contactNeedsEmailAndPhone == null ? null : p.contactNeedsEmailAndPhone ? "Both an email and a mobile number" : "An email or a mobile number"} unset="An email or a telephone is enough." />),
              ]}
            />
          </CardBody>
        </Card>

        <Card id="types" className="scroll-mt-24 overflow-hidden">
          <CardHeader icon={<FileIcon size={17} />} title={<span className="inline-flex items-center gap-2">Document types{cfg.types.length > 0 && <Badge outline>{cfg.types.length}</Badge>}</span>} actions={<DocumentTypeDrawer bodies={bodyOptions} />} divided={cfg.types.length === 0} />
          {cfg.types.length === 0 ? (
            <EmptyState title="None configured" />
          ) : (
            <Table minWidth={760}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Type</Th>
                <Th>Expires</Th>
                <Th>Mandatory</Th>
                <Th>Not applicable</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {cfg.types.map((t) => {
                  const body = cfg.bodies.find((b) => b.id === t.bodyId);
                  const sub = [body ? `${asHeading(body.labelEn)}${t.valueKinds.length ? `: ${t.valueKinds.map((k) => VALUE_KIND_LABEL[k as RegistrationValueKind].en.toLowerCase()).join(", ")}` : ""}` : null, retiredText(t.retiredOn)].filter(Boolean).join(" · ");
                  return (
                    <Tr key={t.id}>
                      <Td label="Type"><CellStack title={t.nameEn} sub={sub || undefined} /></Td>
                      <Td label="Expires">{switchCell(t.expires, "Carries an expiry", "Does not expire", UNSET.expires)}</Td>
                      <Td label="Mandatory">{switchCell(t.mandatoryAtRegistration, "Mandatory", "Not mandatory", UNSET.mandatory)}</Td>
                      <Td label="Not applicable">{switchCell(t.notApplicableAllowed, "May be", "May not be", UNSET.notApplicable)}</Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="SupplierDocumentType" entityId={t.id} label={t.nameEn} />
                          <DocumentTypeDrawer bodies={bodyOptions} type={{ id: t.id, name: t.nameEn, values: { id: t.id, code: t.code, nameEn: t.nameEn, bodyId: t.bodyId ?? "", valueKinds: t.valueKinds.join("\n"), expires: tri(t.expires), mandatoryAtRegistration: tri(t.mandatoryAtRegistration), notApplicableAllowed: tri(t.notApplicableAllowed), hintEn: t.hintEn ?? "", recordsRate: tri(t.recordsRate), repeatable: tri(t.repeatable), governingSource: t.governingSource, provenance: t.provenance, sortOrder: String(t.sortOrder) } }} />
                          <RetireTypeDrawer id={t.id} name={t.nameEn} retired={!live(t.retiredOn)} />
                        </RowActions>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card id="declarations" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<FileIcon size={17} />}
            title={<span className="inline-flex items-center gap-2">Declarations{declTexts.length > 0 && <Badge outline>{declTexts.length}</Badge>}</span>}
            subtitle="Highest version in force applies"
            actions={<DeclarationTextDrawer />}
            divided={declTexts.length === 0}
          />
          {declarationsMissing.map((k) => (
            <p key={k} className="border-b border-line/70 px-5 py-3 text-[13px] text-ink-2 sm:px-6">
              {DECLARATION_KIND_WORDS[k]}: <SettingValue value={null} unset="It has no wording in force, so that step of a supplier's registration stays closed." />
            </p>
          ))}
          {declTexts.length === 0 ? (
            <EmptyState title="None configured" />
          ) : (
            <Table minWidth={680}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 110 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Wording</Th>
                <Th>In force from</Th>
                <Th>Signed by</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {declTexts.map((t) => {
                  const name = `${DECLARATION_KIND_WORDS[t.kind as DeclarationKindName]} · version ${t.version}`;
                  return (
                    <Tr key={t.id}>
                      <Td label="Wording"><CellStack title={name} sub={[t.bodyEn.length > 140 ? `${t.bodyEn.slice(0, 140)}…` : t.bodyEn, retiredText(t.retiredOn)].filter(Boolean).join(" · ")} /></Td>
                      <Td label="In force from">{formatDate(storedDay(t.issuedOn))}</Td>
                      <Td label="Signed by">{t._count.signed === 0 ? <span className="text-ink-4">No one</span> : noun(t._count.signed, "supplier", "suppliers")}</Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="DeclarationText" entityId={t.id} label={name} />
                          {t._count.signed === 0 && <DeclarationTextDrawer text={{ id: t.id, name, values: { id: t.id, kind: t.kind, bodyEn: t.bodyEn, governingSource: t.governingSource, provenance: t.provenance } }} />}
                          <RetireDeclarationTextDrawer id={t.id} name={name} retired={!live(t.retiredOn)} />
                        </RowActions>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Disclosure id="advanced" title="Advanced" summary={notSet > 0 ? `${notSet} not set` : "Registration bodies, lists, expiry bands, standing rules, reasons, intake limits"}>
          <div className="flex flex-col gap-6">
            <Card id="online-applications" className="scroll-mt-24">
              <CardHeader icon={<SlidersIcon size={17} />} title="Intake limits" actions={<span className="flex flex-wrap items-center gap-2">{intakeEdit}{registrationEdit}</span>} />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={[
                    { label: "Applications in any 24 hours", value: <SettingValue value={p?.portalDailyLimit != null ? `${p.portalDailyLimit} at most` : null} unset="The public form stays closed." /> },
                    { label: "Applications for one registration number in 24 hours", value: <SettingValue value={p?.portalDailyLimitPerNumber != null ? `${p.portalDailyLimitPerNumber} at most` : null} unset="The public form stays closed." /> },
                    // RSEC-1(a): never shown as met while the address is unknown.
                    {
                      label: "Applications from one address",
                      value: (
                        <SettingValue
                          value={
                            addressLimit === "NOT_SET" ? null : (
                              <span className="flex flex-col items-start gap-1">
                                <span>
                                  {p?.portalAddressAttempts} in {p?.portalAddressMinutes} minutes <MoreText text="Counted in memory on each server, and only where that server can tell addresses apart. A restart clears the count." />
                                </span>
                                {addressLimit === "NOT_APPLIED" && <Badge tone="warn">Set, not applied: addresses are unknown</Badge>}
                              </span>
                            )
                          }
                          unset="The public form stays closed."
                        />
                      ),
                    },
                    { label: "What one registration may hold", value: <SettingValue value={p?.uploadMaxFilesPerApplication != null && p?.uploadMaxBytesPerApplication != null ? `${p.uploadMaxFilesPerApplication} files, ${megabytesOfBytes(p.uploadMaxBytesPerApplication)} MB in all` : null} unset="A supplier cannot upload a file." /> },
                    { label: "Class of a supplier's uploads", value: <SettingValue value={p?.supplierUploadClassId != null ? className(p.supplierUploadClassId) : null} unset="A supplier cannot upload a file." /> },
                    { label: "Class of a bank statement", value: <SettingValue value={p?.supplierBankStatementClassId != null ? className(p.supplierBankStatementClassId) : null} unset="A supplier cannot upload its bank statement." /> },
                    { label: "The declaration signed online", value: <SettingValue value={p?.onlineDeclarationReplacesPaper != null ? (p.onlineDeclarationReplacesPaper ? "Replaces the paper declaration" : "The paper declaration is still required") : null} unset="The paper declaration is still required, and an application cannot be approved on the online one alone." /> },
                  ]}
                />
              </CardBody>
            </Card>

            <Card id="standing" className="scroll-mt-24">
              <CardHeader
                icon={<SlidersIcon size={17} />}
                title="Expiry bands and standing rules"
                actions={
                  <EditStandingRules
                    values={{ criticalDays: p?.criticalDays?.toString() ?? "", warningDays: p?.warningDays?.toString() ?? "", upcomingDays: p?.upcomingDays?.toString() ?? "", bandsProvenance: p?.bandsProvenance ?? "", expiryOnClosingDayCounts: tri(p?.expiryOnClosingDayCounts ?? null), closingDayProvenance: p?.closingDayProvenance ?? "", autoSuspendOnLapse: tri(p?.autoSuspendOnLapse ?? null), lapseReasonId: p?.lapseReasonId ?? "", lapseProvenance: p?.lapseProvenance ?? "", blacklistFirstOffenceMonths: p?.blacklistFirstOffenceMonths?.toString() ?? "", blacklistProvenance: p?.blacklistProvenance ?? "", registerRequiredForSale: tri(p?.registerRequiredForSale ?? null), saleProvenance: p?.saleProvenance ?? "", restrictionEvidenceTypeId: p?.restrictionEvidenceTypeId ?? "", restrictionProvenance: p?.restrictionProvenance ?? "", ineligibleBidConsequence: p?.ineligibleBidConsequence ?? "unset", ineligibleProvenance: p?.ineligibleProvenance ?? "" }}
                    suspensionReasons={cfg.reasons.filter((x) => x.appliesTo === "SUSPEND" && live(x.retiredOn)).map((x) => ({ value: x.id, label: x.nameEn }))}
                    documentTypes={cfg.types.filter((t) => live(t.retiredOn)).map((t) => ({ value: t.id, label: t.nameEn }))}
                  />
                }
              />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={[
                    { label: "Expiry bands", value: <SettingValue value={p?.criticalDays != null ? `Critical within ${p.criticalDays} days, warning within ${p.warningDays}, upcoming within ${p.upcomingDays}` : null} unset="No document is banded: each reads “bands not set”, never valid." /> },
                    {
                      label: "Reminders before expiry",
                      value: <SettingValue value={cfg.reminderOffsets.length ? <span>{cfg.reminderOffsets.join(", ")} days before, from the rule “{cfg.expiryRule!.nameEn}” (<Link href="/configuration/notifications">Notifications</Link>)</span> : null} unset="No reminder is due. Add a rule for document expiry under Notifications." />,
                    },
                    { label: "Expiring on the closing day", value: <SettingValue value={p?.expiryOnClosingDayCounts != null ? (p.expiryOnClosingDayCounts ? "Counts as valid for the window" : "Does not count as valid") : null} unset="That one case reads “not assessed”." /> },
                    { label: "An expired mandatory document", value: <SettingValue value={p?.autoSuspendOnLapse != null ? (p.autoSuspendOnLapse ? `The supplier stands suspended on lapse${reasonName(p.lapseReasonId) ? `, shown with “${reasonName(p.lapseReasonId)}”` : ""}` : "The supplier stays active, with the expiry noted") : null} unset="The supplier reads “Active — lapse rule not set; a mandatory document has expired”." /> },
                    { label: "A first-offence blacklisting", value: <SettingValue value={p?.blacklistFirstOffenceMonths != null ? `Lasts ${p.blacklistFirstOffenceMonths} months; a later offence until further notice` : null} unset="A first offence cannot be recorded until it is set." /> },
                    { label: "Selling to a purchaser not on the register", value: <SettingValue value={p?.registerRequiredForSale != null ? (p.registerRequiredForSale ? "Refused: documents are sold only to suppliers on the register" : "Sold, not checked against the register") : null} unset="Sold, not checked, and the sale says the rule is not set." /> },
                    { label: "The restriction's evidence", value: <SettingValue value={p?.restrictionEvidenceTypeId != null ? (typeName(p.restrictionEvidenceTypeId) ?? "A type no longer configured") : null} unset="A restricted tender's restriction reads “not assessed”." /> },
                    { label: "A linked bidder found not eligible at the opening", value: <SettingValue value={p?.ineligibleBidConsequence != null ? (p.ineligibleBidConsequence === "ELIMINATE" ? "Eliminated at the opening" : "Reported to the committee, which decides") : null} unset="An opening holding such a bid cannot finalise." /> },
                    {
                      label: "Registration number format",
                      value: <SettingValue value={cfg.format ? (cfg.format.example ? `For example ${cfg.format.example}` : "Set") : null} unset="Numbers are recorded as typed, marked “format not checked”. Set it under Reference data." action={<Link href="/configuration/reference-data" className="text-brand-700 underline">Reference data</Link>} />,
                    },
                  ]}
                />
              </CardBody>
            </Card>

            <Card id="reasons" className="scroll-mt-24 overflow-hidden">
              <CardHeader icon={<SlidersIcon size={17} />} title={<span className="inline-flex items-center gap-2">Standing reasons{cfg.reasons.length > 0 && <Badge outline>{cfg.reasons.length}</Badge>}</span>} subtitle="For suspensions and blacklistings" actions={<StandingReasonDrawer />} divided={cfg.reasons.length === 0} />
              {cfg.reasons.length === 0 ? (
                <EmptyState title="None configured" />
              ) : (
                <Table minWidth={560}>
                  <colgroup>
                    <col />
                    <col style={{ width: 150 }} />
                    <ActionsCol icons={1} labelled={2} />
                  </colgroup>
                  <THead>
                    <Th>Reason</Th>
                    <Th>Given for</Th>
                    <Th className="text-right">Actions</Th>
                  </THead>
                  <tbody>
                    {cfg.reasons.map((x) => (
                      <Tr key={x.id}>
                        <Td label="Reason"><CellStack title={x.nameEn} sub={retiredText(x.retiredOn) ?? undefined} /></Td>
                        <Td label="Given for">{x.appliesTo === "SUSPEND" ? "A suspension" : "A blacklisting"}</Td>
                        <Td>
                          <RowActions>
                            <HistoryButton iconOnly entity="StandingReason" entityId={x.id} label={x.nameEn} />
                            <StandingReasonDrawer reason={{ id: x.id, name: x.nameEn, values: { id: x.id, code: x.code, appliesTo: x.appliesTo, nameEn: x.nameEn, governingSource: x.governingSource, provenance: x.provenance, sortOrder: String(x.sortOrder) } }} />
                            <RetireStandingReasonDrawer id={x.id} name={x.nameEn} retired={!live(x.retiredOn)} />
                          </RowActions>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card id="values" className="scroll-mt-24">
              <CardHeader icon={<BuildingIcon size={17} />} title="Registration bodies' values" divided={cfg.bodies.length === 0} />
              {cfg.bodies.length === 0 ? (
                <EmptyState title="No registration body" action={<Link href="/configuration/tender-documents">Tender documents</Link>} />
              ) : (
                <CardBody>
                  <div className="flex flex-col gap-3">
                    {cfg.bodies.map((b) => {
                      const categories = b.values.filter((v) => v.kind === "CATEGORY").map((v) => ({ value: v.code, label: v.nameEn }));
                      return (
                        <Disclosure key={b.id} boxed title={<>{asHeading(b.labelEn)}{b.retiredOn && !live(b.retiredOn) ? <span className="ml-2 text-[12.5px] font-normal text-ink-3">Retired</span> : null}</>} summary={b.values.length === 0 ? "No values" : noun(b.values.length, "value", "values")}>
                          <div className="mb-3 flex justify-end">
                            <ValueDrawer bodyId={b.id} bodyName={b.labelEn} categories={categories} />
                          </div>
                          {b.values.length === 0 ? (
                            <p className="text-[13px] text-ink-3">No values: a document recording this body&apos;s values cannot name any.</p>
                          ) : (
                            <Table minWidth={680}>
                              <colgroup>
                                <col />
                                <col style={{ width: 150 }} />
                                <col style={{ width: 90 }} />
                                <col style={{ width: 170 }} />
                                <ActionsCol icons={1} labelled={2} />
                              </colgroup>
                              <THead>
                                <Th>Value</Th>
                                <Th>Kind</Th>
                                <Th>Rank</Th>
                                <Th>Ceiling</Th>
                                <Th className="text-right">Actions</Th>
                              </THead>
                              <tbody>
                                {b.values.map((v) => (
                                  <Tr key={v.id}>
                                    <Td label="Value"><CellStack title={v.nameEn} sub={[v.parentCode ? `Under ${b.values.find((x) => x.kind === "CATEGORY" && x.code === v.parentCode)?.nameEn ?? "a category no longer listed"}` : null, retiredText(v.retiredOn)].filter(Boolean).join(" · ") || undefined} /></Td>
                                    <Td label="Kind">{VALUE_KIND_LABEL[v.kind as RegistrationValueKind].en}</Td>
                                    <Td label="Rank">{v.rank ?? <span className="text-ink-4">—</span>}</Td>
                                    <Td label="Ceiling">{v.valueCeiling ? <span className="tabular-nums">{formatMoney(parseSen(v.valueCeiling.toString()))}</span> : <span className="text-ink-4">—</span>}</Td>
                                    <Td>
                                      <RowActions>
                                        <HistoryButton iconOnly entity="RegistrationValue" entityId={v.id} label={v.nameEn} />
                                        <ValueDrawer bodyId={b.id} bodyName={b.labelEn} categories={categories} value={{ id: v.id, name: v.nameEn, values: { id: v.id, kind: v.kind, code: v.code, nameEn: v.nameEn, parentCode: v.parentCode ?? "", rank: v.rank == null ? "" : String(v.rank), valueCeiling: v.valueCeiling?.toString() ?? "", ceilingProvenance: v.ceilingProvenance ?? "", governingSource: v.governingSource, provenance: v.provenance, sortOrder: String(v.sortOrder) } }} />
                                        <RetireValueDrawer id={v.id} name={v.nameEn} retired={!live(v.retiredOn)} />
                                      </RowActions>
                                    </Td>
                                  </Tr>
                                ))}
                              </tbody>
                            </Table>
                          )}
                        </Disclosure>
                      );
                    })}
                  </div>
                </CardBody>
              )}
            </Card>

            <Card id="lists" className="scroll-mt-24">
              <CardHeader icon={<SlidersIcon size={17} />} title="Lists" />
              <CardBody>
                <div className="flex flex-col gap-3">
                  {SUPPLIER_LIST_KINDS.map((k) => {
                    const rows = cfg.lists.filter((l) => l.list === k);
                    const unset =
                      k === "BUMIPUTERA_STATUS"
                        ? "The declared Bumiputera status is not asked on the form. List only statuses that are a claim: a value on this list is read as a claim and expects an evidence document, and a blank answer is how no claim is made."
                        : k === "BANK" || k === "ACCOUNT_TYPE"
                          ? "A signed-in supplier cannot finish the bank-details step of its registration until this list has an entry. Recording a supplier is not held up by it."
                          : "No supplier can be recorded until it has an entry.";
                    return (
                      <Disclosure key={k} boxed title={LIST_KIND_LABEL[k].en} summary={rows.length === 0 ? "Not set" : noun(rows.length, "entry", "entries")}>
                        <div className="mb-3 flex items-center justify-end gap-3">
                          {rows.length === 0 && <SettingValue value={null} unset={unset} />}
                          <ListValueDrawer list={k} listName={LIST_KIND_LABEL[k].en} />
                        </div>
                        {rows.length > 0 && (
                          <Table minWidth={520}>
                            <colgroup>
                              <col />
                              <ActionsCol icons={1} labelled={2} />
                            </colgroup>
                            <THead>
                              <Th>Entry</Th>
                              <Th className="text-right">Actions</Th>
                            </THead>
                            <tbody>
                              {rows.map((v) => (
                                <Tr key={v.id}>
                                  <Td label="Entry"><CellStack title={v.nameEn} sub={[v.list === "COUNTRY" ? (v.callingCode ? `Dial code ${v.callingCode}` : "Dial code not set") : null, retiredText(v.retiredOn)].filter(Boolean).join(" · ") || undefined} /></Td>
                                  <Td>
                                    <RowActions>
                                      <HistoryButton iconOnly entity="SupplierListValue" entityId={v.id} label={v.nameEn} />
                                      <ListValueDrawer list={k} listName={LIST_KIND_LABEL[k].en} value={{ id: v.id, name: v.nameEn, values: { id: v.id, list: v.list, code: v.code, nameEn: v.nameEn, callingCode: v.callingCode ?? "", provenance: v.provenance, sortOrder: String(v.sortOrder) } }} />
                                      <RetireListValueDrawer id={v.id} name={v.nameEn} retired={!live(v.retiredOn)} />
                                    </RowActions>
                                  </Td>
                                </Tr>
                              ))}
                            </tbody>
                          </Table>
                        )}
                      </Disclosure>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </div>
        </Disclosure>
      </div>
    </>
  );
}
