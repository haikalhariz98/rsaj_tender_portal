import Link from "next/link";

import { HistoryButton } from "@/components/history-drawer";
import { BuildingIcon, FileIcon, SlidersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, parseSen } from "@/lib/money";
import { asHeading, LIST_KIND_LABEL, VALUE_KIND_LABEL } from "@/lib/suppliers/labels";
import { loadSupplierConfig, supplierOrg } from "@/lib/suppliers/repo";
import { SUPPLIER_LIST_KINDS, type RegistrationValueKind } from "@/lib/suppliers/types";

import { DocumentTypeDrawer, EditPortalIntake, EditStandingRules, EditSupplierPolicy, ListValueDrawer, RetireListValueDrawer, RetireStandingReasonDrawer, RetireTypeDrawer, RetireValueDrawer, StandingReasonDrawer, ValueDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// What a switch leaves undecided while it is unset: said beside "Not set", never guessed.
const UNSET = {
  expires: "No document of this type can be lodged until it is set.",
  mandatory: "No application can be decided until it is set.",
  notApplicable: "None is recorded as not applicable until it is set.",
} as const;

function Switch({ value, yes, no, unset }: { value: boolean | null; yes: string; no: string; unset: string }) {
  if (value == null) {
    return (
      <span className="flex flex-col items-start gap-1">
        <Badge tone="warn">Not set</Badge>
        <span className="text-[12px] text-ink-3">{unset}</span>
      </span>
    );
  }
  return <span>{value ? yes : no}</span>;
}

const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unset");

/**
 * Configuration › Supplier register (6.15 §5): the registration bodies' values, the statutory document
 * types, the register's own lists and its policy. Nothing ships (rule 1): the published lists are the
 * customer's seed. Each value says where it comes from; each unset switch says what it holds back.
 */
export default async function SupplierRegisterConfigPage() {
  const actor = await requireStaff();
  const org = await supplierOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        <PageHeader title="Supplier register" subtitle="Registration bodies' values, document types, the register's lists and its policy." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const cfg = await loadSupplierConfig(org.id);
  const live = (d: Date | null) => d == null || (org.today != null && storedDay(d) > org.today);
  const retiredText = (d: Date | null) => (d && !live(d) ? `Retired ${formatDate(storedDay(d))}` : null);
  const bodyOptions = cfg.bodies.filter((b) => live(b.retiredOn)).map((b) => ({ value: b.id, label: asHeading(b.labelEn) }));
  const switchesNotSet = cfg.types.filter((t) => live(t.retiredOn)).reduce((n, t) => n + [t.expires, t.mandatoryAtRegistration, t.notApplicableAllowed].filter((x) => x == null).length, 0);
  // The Bumiputera statuses are optional: an empty list means the claim is simply not asked, and blocks nothing. The others close recording (and the public form) while empty.
  const listsEmpty = SUPPLIER_LIST_KINDS.filter((k) => k !== "BUMIPUTERA_STATUS" && cfg.liveCodes(k, org.today).length === 0);
  const p = cfg.policy;
  // a2: the standing rules, each "Not set" until decided (OD-4..OD-7, condition 4).
  const rulesNotSet = [p?.criticalDays, p?.expiryOnClosingDayCounts, p?.autoSuspendOnLapse, p?.blacklistFirstOffenceMonths, p?.registerRequiredForSale, p?.restrictionEvidenceTypeId, p?.ineligibleBidConsequence, p?.personalDataNoticeEn, p?.personalDataNoticeMs, p?.portalDailyLimit, p?.portalDailyLimitPerNumber].filter((x) => x == null).length;
  const reasonName = (id: string | null | undefined) => cfg.reasons.find((x) => x.id === id)?.nameEn ?? null;
  const typeName = (id: string | null | undefined) => cfg.types.find((x) => x.id === id)?.nameEn ?? null;
  const rule = (set: boolean, value: React.ReactNode, from: string | null | undefined, unset: string) =>
    set ? <span className="flex flex-col items-start gap-1"><span className="break-words">{value}</span><ProvenanceBadge value={from ?? null} /></span> : <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><span className="text-[12px] text-ink-3">{unset}</span></span>;

  return (
    <>
      <PageHeader
        title="Supplier register"
        badge={switchesNotSet + listsEmpty.length + rulesNotSet > 0 ? <Badge tone="warn" dot>{switchesNotSet + listsEmpty.length + rulesNotSet} not set</Badge> : <Badge tone="ok" dot>Set</Badge>}
        subtitle="Registration values, statutory document types, the register's lists and its notice."
        actions={
          <>
            {p && <HistoryButton entity="SupplierPolicy" entityId={p.id} label="the register's policy" />}
            <EditSupplierPolicy values={{ verificationNoticeEn: p?.verificationNoticeEn ?? "", verificationNoticeMs: p?.verificationNoticeMs ?? "", noticeProvenance: p?.noticeProvenance ?? "", contactRule: p?.contactNeedsEmailAndPhone == null ? "" : p.contactNeedsEmailAndPhone ? "both" : "either", contactRuleProvenance: p?.contactRuleProvenance ?? "", governingSource: p?.governingSource ?? "" }} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {listsEmpty.length > 0 && (
          <Callout tone="warn" title="A list the register needs is empty">
            {listsEmpty.map((k) => LIST_KIND_LABEL[k].en).join(" and ")} {listsEmpty.length === 1 ? "has" : "have"} no entry in force, so no supplier can be recorded. Add them under Lists, below.
          </Callout>
        )}

        <Card>
          <CardHeader icon={<SlidersIcon size={17} />} title="Policy" subtitle="What the supplier is told about how its documents are checked. Shown to the vendor once vendors can sign in (6.15b); kept here now so the words are decided." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Verification notice", value: p?.verificationNoticeEn ? <span className="flex flex-col items-start gap-1.5"><span className="break-words">{p.verificationNoticeEn}</span><ProvenanceBadge value={p.noticeProvenance} /></span> : <Badge tone="warn">Not set</Badge> },
                { label: "Verification notice (Malay)", value: p?.verificationNoticeMs || <Badge tone="warn">Not set</Badge> },
                { label: "What a contact must give", value: p?.contactNeedsEmailAndPhone == null ? <span className="flex flex-col items-start gap-1.5"><Badge tone="warn">Not set</Badge><span className="text-[12px] text-ink-3">An email or a telephone is enough.</span></span> : <span className="flex flex-col items-start gap-1.5"><span>{p.contactNeedsEmailAndPhone ? "Both an email and a mobile number" : "An email or a mobile number"}</span><ProvenanceBadge value={p.contactRuleProvenance} /></span> },
                { label: "Where it is written", value: p?.governingSource || "No source is cited" },
                { label: "Registration number format", value: cfg.format ? `${cfg.format.example ? `For example ${cfg.format.example}` : "Set"}` : <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><span className="text-[12px] text-ink-3">Numbers are recorded as typed, marked &quot;format not checked&quot;. Set it under <Link href="/configuration/reference-data">Reference data</Link>.</span></span> },
              ]}
            />
          </CardBody>
        </Card>

        <Card id="online-applications" className="scroll-mt-24">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Online applications"
            subtitle="The public form on the supplier portal. It stays closed until the notice about personal details is written in both languages and both limits are set. The applications themselves are kept apart from the register until an officer records the supplier."
            actions={
              <span className="flex flex-wrap items-center gap-2">
                {p && <HistoryButton entity="SupplierPolicy" entityId={p.id} label="online applications" />}
                <EditPortalIntake values={{ personalDataNoticeEn: p?.personalDataNoticeEn ?? "", personalDataNoticeMs: p?.personalDataNoticeMs ?? "", personalDataProvenance: p?.personalDataProvenance ?? "", portalDailyLimit: p?.portalDailyLimit?.toString() ?? "", portalDailyLimitPerNumber: p?.portalDailyLimitPerNumber?.toString() ?? "", portalLimitProvenance: p?.portalLimitProvenance ?? "" }} />
              </span>
            }
          />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Notice about personal details", value: rule(!!p?.personalDataNoticeEn?.trim(), <span className="whitespace-pre-line">{p?.personalDataNoticeEn}</span>, p?.personalDataProvenance, "The public form stays closed.") },
                { label: "Notice about personal details (Malay)", value: rule(!!p?.personalDataNoticeMs?.trim(), <span className="whitespace-pre-line">{p?.personalDataNoticeMs}</span>, p?.personalDataProvenance, "The public form stays closed.") },
                { label: "Applications in any 24 hours", value: rule(p?.portalDailyLimit != null, `${p?.portalDailyLimit} at most`, p?.portalLimitProvenance, "The public form stays closed.") },
                { label: "Applications for one registration number in 24 hours", value: rule(p?.portalDailyLimitPerNumber != null, `${p?.portalDailyLimitPerNumber} at most`, p?.portalLimitProvenance, "The public form stays closed.") },
              ]}
            />
          </CardBody>
        </Card>

        <Card id="standing" className="scroll-mt-24">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title="Standing"
            subtitle="How expiry is banded, what a lapse does, how long a first blacklisting lasts, and what the register asks at a sale and an opening. Each rule not set holds back, or is read as not assessed, and says so."
            actions={
              <span className="flex flex-wrap items-center gap-2">
                {p && <HistoryButton entity="SupplierPolicy" entityId={p.id} label="the standing rules" />}
                <EditStandingRules
                  values={{ criticalDays: p?.criticalDays?.toString() ?? "", warningDays: p?.warningDays?.toString() ?? "", upcomingDays: p?.upcomingDays?.toString() ?? "", bandsProvenance: p?.bandsProvenance ?? "", expiryOnClosingDayCounts: tri(p?.expiryOnClosingDayCounts ?? null), closingDayProvenance: p?.closingDayProvenance ?? "", autoSuspendOnLapse: tri(p?.autoSuspendOnLapse ?? null), lapseReasonId: p?.lapseReasonId ?? "", lapseProvenance: p?.lapseProvenance ?? "", blacklistFirstOffenceMonths: p?.blacklistFirstOffenceMonths?.toString() ?? "", blacklistProvenance: p?.blacklistProvenance ?? "", registerRequiredForSale: tri(p?.registerRequiredForSale ?? null), saleProvenance: p?.saleProvenance ?? "", restrictionEvidenceTypeId: p?.restrictionEvidenceTypeId ?? "", restrictionProvenance: p?.restrictionProvenance ?? "", ineligibleBidConsequence: p?.ineligibleBidConsequence ?? "unset", ineligibleProvenance: p?.ineligibleProvenance ?? "" }}
                  suspensionReasons={cfg.reasons.filter((x) => x.appliesTo === "SUSPEND" && live(x.retiredOn)).map((x) => ({ value: x.id, label: x.nameEn }))}
                  documentTypes={cfg.types.filter((t) => live(t.retiredOn)).map((t) => ({ value: t.id, label: t.nameEn }))}
                />
              </span>
            }
          />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Expiry bands", value: rule(p?.criticalDays != null, `Critical within ${p?.criticalDays} days, warning within ${p?.warningDays}, upcoming within ${p?.upcomingDays}`, p?.bandsProvenance, "No document is banded: each reads “bands not set”, never valid.") },
                { label: "Reminders before expiry", value: cfg.reminderOffsets.length ? <span>{cfg.reminderOffsets.join(", ")} days before, from the rule “{cfg.expiryRule!.nameEn}” (<Link href="/configuration/notifications">Notifications</Link>). Shown, not sent.</span> : <span className="flex flex-col items-start gap-1"><Badge tone="warn">Not set</Badge><span className="text-[12px] text-ink-3">No reminder is due. Add a rule for document expiry under <Link href="/configuration/notifications">Notifications</Link>.</span></span> },
                { label: "Expiring on the closing day", value: rule(p?.expiryOnClosingDayCounts != null, p?.expiryOnClosingDayCounts ? "Counts as valid for the window" : "Does not count as valid", p?.closingDayProvenance, "That one case reads “not assessed”.") },
                { label: "An expired mandatory document", value: rule(p?.autoSuspendOnLapse != null, p?.autoSuspendOnLapse ? `The supplier stands suspended on lapse${reasonName(p?.lapseReasonId) ? `, shown with “${reasonName(p?.lapseReasonId)}”` : ""}` : "The supplier stays active, with the expiry noted", p?.lapseProvenance, "The supplier reads “Active — lapse rule not set; a mandatory document has expired”.") },
                { label: "A first-offence blacklisting", value: rule(p?.blacklistFirstOffenceMonths != null, `Lasts ${p?.blacklistFirstOffenceMonths} months; a later offence until further notice`, p?.blacklistProvenance, "A first offence cannot be recorded until it is set.") },
                { label: "Selling to a purchaser not on the register", value: rule(p?.registerRequiredForSale != null, p?.registerRequiredForSale ? "Refused: documents are sold only to suppliers on the register" : "Sold, not checked against the register", p?.saleProvenance, "Sold, not checked, and the sale says the rule is not set.") },
                { label: "The restriction's evidence", value: rule(p?.restrictionEvidenceTypeId != null, typeName(p?.restrictionEvidenceTypeId) ?? "A type no longer configured", p?.restrictionProvenance, "A restricted tender's restriction reads “not assessed”.") },
                { label: "A linked bidder found not eligible at the opening", value: rule(p?.ineligibleBidConsequence != null, p?.ineligibleBidConsequence === "ELIMINATE" ? "Eliminated at the opening" : "Reported to the committee, which decides", p?.ineligibleProvenance, "An opening holding such a bid cannot finalise.") },
              ]}
            />
          </CardBody>
        </Card>

        <Card id="reasons" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<SlidersIcon size={17} />}
            title={<span className="inline-flex items-center gap-2">Standing reasons{cfg.reasons.length > 0 && <Badge outline>{cfg.reasons.length}</Badge>}</span>}
            subtitle="The maintained list an officer chooses from when suspending a supplier or asking for its blacklisting."
            actions={<StandingReasonDrawer />}
            divided={cfg.reasons.length === 0}
          />
          {cfg.reasons.length === 0 ? (
            <EmptyState title="None configured">No supplier can be suspended, and no blacklisting asked for, until a reason is added.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 110 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Reason</Th>
                <Th>Given for</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {cfg.reasons.map((x) => (
                  <Tr key={x.id}>
                    <Td label="Reason"><CellStack title={x.nameEn} sub={[x.nameMs, x.governingSource, retiredText(x.retiredOn)].filter(Boolean).join(" · ") || undefined} /></Td>
                    <Td label="Given for">{x.appliesTo === "SUSPEND" ? "A suspension" : "A blacklisting"}</Td>
                    <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="StandingReason" entityId={x.id} label={x.nameEn} />
                        <StandingReasonDrawer reason={{ id: x.id, name: x.nameEn, values: { id: x.id, code: x.code, appliesTo: x.appliesTo, nameEn: x.nameEn, nameMs: x.nameMs, governingSource: x.governingSource, provenance: x.provenance, sortOrder: String(x.sortOrder) } }} />
                        <RetireStandingReasonDrawer id={x.id} name={x.nameEn} retired={!live(x.retiredOn)} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card id="types" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            icon={<FileIcon size={17} />}
            title={<span className="inline-flex items-center gap-2">Document types{cfg.types.length > 0 && <Badge outline>{cfg.types.length}</Badge>}</span>}
            subtitle="The statutory documents a supplier lodges. Each switch left not set holds back the act that needs it."
            actions={<DocumentTypeDrawer bodies={bodyOptions} />}
            divided={cfg.types.length === 0}
          />
          {cfg.types.length === 0 ? (
            <EmptyState title="None configured">No document can be lodged and no application decided until the document types are added.</EmptyState>
          ) : (
            // fix S-4 (b): within the 944px content column at 1280, so Edit and Retire stay in view; the type column wraps.
            <Table minWidth={900}>
              <colgroup>
                <col />
                <col style={{ width: 128 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 100 }} />
                <ActionsCol icons={1} labelled={2} />
              </colgroup>
              <THead>
                <Th>Type</Th>
                <Th>Expires</Th>
                <Th>Mandatory</Th>
                <Th>Not applicable</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {cfg.types.map((t) => {
                  const body = cfg.bodies.find((b) => b.id === t.bodyId);
                  const sub = [t.nameMs, body ? `${asHeading(body.labelEn)}${t.valueKinds.length ? `: ${t.valueKinds.map((k) => VALUE_KIND_LABEL[k as RegistrationValueKind].en.toLowerCase()).join(", ")}` : ""}` : null, t.governingSource, retiredText(t.retiredOn)].filter(Boolean).join(" · ");
                  return (
                    <Tr key={t.id}>
                      <Td label="Type"><CellStack title={t.nameEn} sub={sub || undefined} /></Td>
                      <Td label="Expires"><Switch value={t.expires} yes="Carries an expiry" no="Does not expire" unset={UNSET.expires} /></Td>
                      <Td label="Mandatory"><Switch value={t.mandatoryAtRegistration} yes="Mandatory" no="Not mandatory" unset={UNSET.mandatory} /></Td>
                      <Td label="Not applicable"><Switch value={t.notApplicableAllowed} yes="May be" no="May not be" unset={UNSET.notApplicable} /></Td>
                      <Td label="Source"><ProvenanceBadge value={t.provenance} /></Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="SupplierDocumentType" entityId={t.id} label={t.nameEn} />
                          <DocumentTypeDrawer bodies={bodyOptions} type={{ id: t.id, name: t.nameEn, values: { id: t.id, code: t.code, nameEn: t.nameEn, nameMs: t.nameMs ?? "", bodyId: t.bodyId ?? "", valueKinds: t.valueKinds.join("\n"), expires: tri(t.expires), mandatoryAtRegistration: tri(t.mandatoryAtRegistration), notApplicableAllowed: tri(t.notApplicableAllowed), governingSource: t.governingSource, provenance: t.provenance, sortOrder: String(t.sortOrder) } }} />
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

        <Card id="values" className="scroll-mt-24 overflow-hidden">
          <CardHeader icon={<BuildingIcon size={17} />} title="Registration bodies' values" subtitle="Grades, categories, specialisations, field codes, classes and permit types, under each body. The bodies themselves are configured under Tender documents." divided={cfg.bodies.length === 0} />
          {cfg.bodies.length === 0 ? (
            <EmptyState title="No registration body is configured" action={<Link href="/configuration/tender-documents">Tender documents</Link>}>Add the bodies first; their values are kept here.</EmptyState>
          ) : (
            <div className="divide-y divide-line/70">
              {cfg.bodies.map((b) => {
                const categories = b.values.filter((v) => v.kind === "CATEGORY").map((v) => ({ value: v.code, label: v.nameEn }));
                return (
                  <section key={b.id} className="flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                      <span className="text-[14px] font-semibold text-ink">{asHeading(b.labelEn)}{b.retiredOn && !live(b.retiredOn) ? <span className="ml-2 text-[12.5px] font-normal text-ink-3">Retired</span> : null}</span>
                      <ValueDrawer bodyId={b.id} bodyName={b.labelEn} categories={categories} />
                    </div>
                    {b.values.length === 0 ? (
                      <p className="px-5 pb-4 text-[13px] text-ink-3 sm:px-6">No values: a document recording this body&apos;s values cannot name any.</p>
                    ) : (
                      <Table minWidth={760}>
                        <colgroup>
                          <col />
                          <col style={{ width: 150 }} />
                          <col style={{ width: 90 }} />
                          <col style={{ width: 170 }} />
                          <col style={{ width: 110 }} />
                          <ActionsCol icons={1} labelled={2} />
                        </colgroup>
                        <THead>
                          <Th>Value</Th>
                          <Th>Kind</Th>
                          <Th>Rank</Th>
                          <Th>Ceiling (shown only)</Th>
                          <Th>Source</Th>
                          <Th className="text-right">Actions</Th>
                        </THead>
                        <tbody>
                          {b.values.map((v) => (
                            <Tr key={v.id}>
                              <Td label="Value"><CellStack title={v.nameEn} sub={[v.nameMs, v.parentCode ? `Under ${b.values.find((x) => x.kind === "CATEGORY" && x.code === v.parentCode)?.nameEn ?? "a category no longer listed"}` : null, retiredText(v.retiredOn)].filter(Boolean).join(" · ") || undefined} /></Td>
                              <Td label="Kind">{VALUE_KIND_LABEL[v.kind as RegistrationValueKind].en}</Td>
                              <Td label="Rank">{v.rank ?? <span className="text-ink-4">—</span>}</Td>
                              <Td label="Ceiling (shown only)">{v.valueCeiling ? <span className="flex flex-col items-start gap-1"><span className="tabular-nums">{formatMoney(parseSen(v.valueCeiling.toString()))}</span><ProvenanceBadge value={v.ceilingProvenance} /></span> : <span className="text-ink-4">—</span>}</Td>
                              <Td label="Source"><ProvenanceBadge value={v.provenance} /></Td>
                              <Td>
                                <RowActions>
                                  <HistoryButton iconOnly entity="RegistrationValue" entityId={v.id} label={v.nameEn} />
                                  <ValueDrawer bodyId={b.id} bodyName={b.labelEn} categories={categories} value={{ id: v.id, name: v.nameEn, values: { id: v.id, kind: v.kind, code: v.code, nameEn: v.nameEn, nameMs: v.nameMs ?? "", parentCode: v.parentCode ?? "", rank: v.rank == null ? "" : String(v.rank), valueCeiling: v.valueCeiling?.toString() ?? "", ceilingProvenance: v.ceilingProvenance ?? "", governingSource: v.governingSource, provenance: v.provenance, sortOrder: String(v.sortOrder) } }} />
                                  <RetireValueDrawer id={v.id} name={v.nameEn} retired={!live(v.retiredOn)} />
                                </RowActions>
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        <Card id="lists" className="scroll-mt-24 overflow-hidden">
          <CardHeader icon={<SlidersIcon size={17} />} title="Lists" subtitle="The entity types, countries (with their dial codes), states and Bumiputera statuses an officer, or an applicant on the public form, chooses from." />
          <div className="divide-y divide-line/70">
            {SUPPLIER_LIST_KINDS.map((k) => {
              const rows = cfg.lists.filter((l) => l.list === k);
              return (
                <section key={k} className="flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                    <span className="text-[14px] font-semibold text-ink">{LIST_KIND_LABEL[k].en}</span>
                    <ListValueDrawer list={k} listName={LIST_KIND_LABEL[k].en} />
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-5 pb-4 text-[13px] text-ink-3 sm:px-6">{k === "BUMIPUTERA_STATUS" ? "Not set: the declared Bumiputera status is not asked on the form. List only statuses that are a claim: a value on this list is read as a claim and expects an evidence document, and a blank answer is how no claim is made." : "Not set: no supplier can be recorded until it has an entry."}</p>
                  ) : (
                    <Table minWidth={560}>
                      <colgroup>
                        <col />
                        <col style={{ width: 110 }} />
                        <ActionsCol icons={1} labelled={2} />
                      </colgroup>
                      <THead>
                        <Th>Entry</Th>
                        <Th>Source</Th>
                        <Th className="text-right">Actions</Th>
                      </THead>
                      <tbody>
                        {rows.map((v) => (
                          <Tr key={v.id}>
                            <Td label="Entry"><CellStack title={v.nameEn} sub={[v.nameMs, v.list === "COUNTRY" ? (v.callingCode ? `Dial code ${v.callingCode}` : "Dial code not set") : null, retiredText(v.retiredOn)].filter(Boolean).join(" · ") || undefined} /></Td>
                            <Td label="Source"><ProvenanceBadge value={v.provenance} /></Td>
                            <Td>
                              <RowActions>
                                <HistoryButton iconOnly entity="SupplierListValue" entityId={v.id} label={v.nameEn} />
                                <ListValueDrawer list={k} listName={LIST_KIND_LABEL[k].en} value={{ id: v.id, name: v.nameEn, values: { id: v.id, list: v.list, code: v.code, nameEn: v.nameEn, nameMs: v.nameMs ?? "", callingCode: v.callingCode ?? "", provenance: v.provenance, sortOrder: String(v.sortOrder) } }} />
                                <RetireListValueDrawer id={v.id} name={v.nameEn} retired={!live(v.retiredOn)} />
                              </RowActions>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </section>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
