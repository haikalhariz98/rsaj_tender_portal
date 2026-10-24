import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { mediaLabel } from "@/lib/documents/labels";
import { realSource } from "@/lib/labels";
import { megabytesFromBytes } from "@/lib/tender-docs/bid-part-rules";
import { SettingValue } from "@/components/setup/setting-value";
import { Disclosure } from "@/components/ui/disclosure";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { senToDecimalString, parseSen } from "@/lib/money";
import { NOT_SET } from "@/lib/tender-docs/labels";
import { tenderDocsConfig } from "@/lib/tender-docs/read";
import { conditionsConfig } from "@/lib/tender-docs/read-config-conditions";

import { BodyDrawer, ClauseDrawer, RestoreDrawer, RetireDrawer } from "./conditions-editors";
import { EditMethodPack, EditTenderPolicy, PartBidRulesDrawer, PartDrawer, RestorePartDrawer, RetirePartDrawer, type PartValues } from "./editors";
import { RemoveTemplateFileDrawer, TemplateFileDrawer } from "./template-file";
import { uploadContext } from "@/lib/documents/read";
import { uploadView } from "@/lib/documents/views";
import { requireStaff } from "@/app/_auth/actor";

export const metadata = { title: "Tender documents" };
export const dynamic = "force-dynamic";

/// What a setting leaves undecided while it is unset: said beside "Not set", never a zero.
const UNSET = {
  stamp: "No wording is stamped on a restricted tender: there is none to print.",
  assurance: "Whether the two assurance confirmations are required is undecided, so no tender documents can be submitted.",
  restriction: "The restriction is asked on each exercise as a restricted tender.",
  permits: "Works that need the regulator's permit cannot name its type, so their documents cannot be submitted.",
  lad: "A liquidated damages rate stated as a percentage has no policy rate to be suggested from.",
  certificate: "The first interim certificate's minimum cannot be stated from policy: it is entered by hand.",
  insurance: "The end of the insurance period cannot be worked out.",
  designAndBuild: "The end of the insurance period for a design and build contract cannot be worked out.",
} as const;

const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unset");

export default async function TenderDocumentsConfigurationPage({ searchParams }: { searchParams: Promise<{ retired?: string }> }) {
  const actor = await requireStaff();
  const showRetired = (await searchParams).retired === "1";
  const [c, k, uploadCtx] = await Promise.all([tenderDocsConfig(actor.organisationId, showRetired), conditionsConfig(actor.organisationId, showRetired), uploadContext(actor.organisationId)]);
  const upload = uploadView(uploadCtx ?? { classes: [], people: [], allowedMediaTypes: [], maxBytes: null, ceiling: null, cap: null, refusals: [], timeZoneSet: false, statement: "" });
  if (!c) {
    return (
      <>
        <PageHeader title="Tender documents" info={{ title: "Tender documents", text: "The parts each pack assembles and the figures it is judged by." }} />
        <Card>
          <EmptyState title="No organisation is configured" />
        </Card>
      </>
    );
  }
  const org = await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true } });
  const policyRow = org ? await db.tenderDocumentPolicy.findUnique({ where: { organisationId: org.id } }) : null;
  const p = c.policy;

  const policyValues: Record<string, string> = {
    restrictionStampTextEn: policyRow?.restrictionStampTextEn ?? "",
    restrictionStampTextMs: policyRow?.restrictionStampTextMs ?? "",
    assuranceRequired: tri(policyRow?.assuranceRequired ?? null) === "unset" ? "" : tri(policyRow?.assuranceRequired ?? null),
    ladDailyPct: policyRow?.ladDailyPct?.toString() ?? "",
    ladDailyPctProvenance: policyRow?.ladDailyPctProvenance ?? "",
    firstCertificateFloor: policyRow?.firstCertificateFloor == null ? "" : senToDecimalString(parseSen(policyRow.firstCertificateFloor.toString())),
    firstCertificatePct: policyRow?.firstCertificatePct?.toString() ?? "",
    firstCertificateProvenance: policyRow?.firstCertificateProvenance ?? "",
    insuranceExtraMonths: policyRow?.insuranceExtraMonths == null ? "" : String(policyRow.insuranceExtraMonths),
    insuranceExtraDays: policyRow?.insuranceExtraDays == null ? "" : String(policyRow.insuranceExtraDays),
    insuranceExtraProvenance: policyRow?.insuranceExtraProvenance ?? "",
    dbInsuranceExtraMonths: policyRow?.dbInsuranceExtraMonths == null ? "" : String(policyRow.dbInsuranceExtraMonths),
    dbInsuranceExtraDays: policyRow?.dbInsuranceExtraDays == null ? "" : String(policyRow.dbInsuranceExtraDays),
    dbInsuranceExtraProvenance: policyRow?.dbInsuranceExtraProvenance ?? "",
    regulatorPermitTaxonomyCode: policyRow?.regulatorPermitTaxonomyCode ?? "",
    restrictionLabelEn: policyRow?.restrictionLabelEn ?? "",
    restrictionProvenance: policyRow?.restrictionProvenance ?? "",
    assuranceProvenance: policyRow?.assuranceProvenance ?? "",
    governingSource: policyRow?.governingSource ?? "",
    notes: policyRow?.notes ?? "",
  };

  // SR-13: what a bidder may upload for each part online, read beside the parts (it is a rule of online bids only).
  const bidRuleRows = new Map((await db.tenderDocumentPart.findMany({ where: { organisationId: actor.organisationId }, select: { id: true, bidAcceptedMediaTypes: true, bidMaxBytes: true, openingCheck: true, openingCheckProvenance: true } })).map((x) => [x.id, x]));
  const bidRuleValues = (id: string): Record<string, string> => {
    const x = bidRuleRows.get(id);
    return { bidAcceptedMediaTypes: (x?.bidAcceptedMediaTypes ?? []).join("\n"), bidMaxMegabytes: x?.bidMaxBytes == null ? "" : String(megabytesFromBytes(x.bidMaxBytes) ?? ""), openingCheck: tri(x?.openingCheck ?? null), openingCheckProvenance: x?.openingCheckProvenance ?? "" };
  };
  const bidRuleSummary = (id: string): string => {
    const x = bidRuleRows.get(id);
    const types = x?.bidAcceptedMediaTypes.length ? x.bidAcceptedMediaTypes.map((t) => mediaLabel(t)).join(", ") : "file types not set";
    const size = x?.bidMaxBytes == null ? "largest file not set" : `up to ${megabytesFromBytes(x.bidMaxBytes) ?? x.bidMaxBytes} MB`;
    return `Online: ${types}; ${size}; ${x?.openingCheck == null ? "opening check not set" : x.openingCheck ? "checked at the opening" : "not checked at the opening"}`;
  };
  const partValues = (r: { raw: Record<string, unknown> }): PartValues => {
    const x = r.raw as Record<string, unknown> & { mandatory: boolean | null; inTableDocument: boolean | null; returnedByBidder?: boolean | null };
    const s = (k: string) => (x[k] == null ? "" : String(x[k]));
    return {
      code: s("code"),
      packKind: s("packKind"),
      contractBasisCode: s("contractBasisCode"),
      printedNumber: s("printedNumber"),
      sortOrder: s("sortOrder"),
      labelEn: s("labelEn"),
      labelMs: s("labelMs"),
      role: s("role"),
      content: s("content"),
      source: s("source"),
      templateCode: s("templateCode"),
      mandatory: tri(x.mandatory),
      inTableDocument: tri(x.inTableDocument),
      returnedByBidder: tri(x.returnedByBidder ?? null),
      returnedByBidderProvenance: s("returnedByBidderProvenance"),
      ownerOrgUnitCode: s("ownerOrgUnitCode"),
      governingSource: s("governingSource"),
      provenance: s("provenance"),
      notes: s("notes"),
    };
  };
  const retiredTotal = c.groups.reduce((n, g) => n + g.byBasis.reduce((m, b) => m + b.parts.filter((x) => x.retired).length, 0), 0);
  const allRetiredHidden = !showRetired && c.empty == null && c.groups.every((g) => g.byBasis.length === 0);
  const options = { packKinds: c.options.packKinds, bases: c.options.bases, templates: c.options.templates, units: c.options.units, roles: c.options.roles, contents: c.options.contents, sources: c.options.sources };

  const setting = (label: string, node: ReactNode) => ({ label, value: node });
  const holding = c.holdingWorkBack + (k?.holdingWorkBack ?? 0);

  return (
    <>
      <PageHeader
        title="Tender documents"
        badge={holding > 0 ? <Badge tone="warn" dot>{`${holding} holding work back`}</Badge> : <Badge tone="ok" dot>Nothing holding work back</Badge>}
        info={{ title: "Tender documents", text: "The parts each pack assembles, the wording it carries and the figures it is judged by." }}
        actions={
          <>
            {policyRow && <HistoryButton entity="TenderDocumentPolicy" entityId={policyRow.id} label="the tender documents policy" />}
            <PartDrawer options={options} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {c.empty && (
          <Callout tone="warn" title="No parts are configured">
            {c.empty}
          </Callout>
        )}
        {c.timeZoneNotSet && (
          <Callout tone="warn" title="Time zone not set">
            {c.timeZoneNotSet}
          </Callout>
        )}

        <Card id="policy" className="scroll-mt-24">
          <CardHeader
            icon={<FileIcon size={17} />}
            title="Policy"
            subtitle="Wording and figures for every pack"
            actions={
              <span className="flex flex-wrap items-center gap-2">
                <EditTenderPolicy values={policyValues} taxonomies={k?.taxonomyOptions ?? []} />
              </span>
            }
          />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                setting("Wording stamped on a restricted tender (English)", <SettingValue value={p.restrictionStampEn} unset={UNSET.stamp} />),
                setting("The restriction, as the exercise asks it", <SettingValue value={k?.policy.restrictionAskedAs ?? NOT_SET} unset={UNSET.restriction} />),
                setting("Assurance confirmations required", <SettingValue value={p.assuranceRequired} unset={UNSET.assurance} />),
                setting("The list of regulator permits", <SettingValue value={k?.policy.permitList ?? NOT_SET} unset={UNSET.permits} />),
                setting("Liquidated damages a day", <SettingValue value={p.ladDailyRate} unset={UNSET.lad} />),
                setting("First interim certificate's minimum", <SettingValue value={p.firstCertificate} unset={UNSET.certificate} />),
                setting("Insurance beyond the defects liability period", <SettingValue value={p.insuranceTail} unset={UNSET.insurance} />),
                setting("The same, for design and build", <SettingValue value={p.designAndBuildTail} unset={UNSET.designAndBuild} />),
                ...(realSource(p.governingSource) ? [setting("Where the policy is written", p.governingSource)] : []),
              ]}
            />
            {policyRow?.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{policyRow.notes}</p>}
          </CardBody>
        </Card>

        <Card id="methods" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                Which documents each method assembles
                {c.methods.length > 0 && <Badge outline>{c.methods.length}</Badge>}
              </span>
            }
                        divided={c.methods.length === 0}
          />
          {c.methods.length === 0 ? (
            <EmptyState title="Not set" />
          ) : (
            <Table minWidth={560}>
              <colgroup>
                <col />
                <col style={{ width: "30%" }} />
                <ActionsCol icons={1} labelled={1} />
              </colgroup>
              <THead>
                <Th>Method</Th>
                <Th>Documents assembled</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {c.methods.map((m) => (
                  <Tr key={m.id}>
                    <Td label="Method"><CellStack title={m.name} sub={m.retired ? "Retired" : undefined} /></Td>
                    <Td label="Documents assembled">{m.documentPack === NOT_SET ? <SettingValue value={null} unset="Preparation is held back until this is set." /> : m.documentPack}</Td>
                    <Td>
                      <RowActions>
                        <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.name} />
                        <EditMethodPack id={m.id} name={m.name} raw={m.raw} packKinds={c.options.methodPackKinds} />
                      </RowActions>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {retiredTotal + (k?.retiredCount ?? 0) > 0 || showRetired ? (
          <div className="-mb-3 flex justify-end">
            <ButtonLink href={showRetired ? "/configuration/tender-documents" : "/configuration/tender-documents?retired=1"} variant="ghost" size="sm">
              {showRetired ? "Hide retired records" : "Show retired records"}
            </ButtonLink>
          </div>
        ) : null}

        {c.groups.map((g) => {
          const count = g.byBasis.reduce((n, b) => n + b.parts.length, 0);
          return (
            <Card key={g.packKind} id={g.packKind.toLowerCase().replace(/\s+/g, "-")} className="scroll-mt-24 overflow-hidden">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    {g.packKind}: parts
                    {count > 0 && <Badge outline>{count}</Badge>}
                  </span>
                }
                subtitle="Print order, per contract basis"
                divided={count === 0}
              />
              {count === 0 ? (
                <EmptyState title={allRetiredHidden ? "Every part is retired" : "No parts configured"} action={<PartDrawer options={options} />} />
              ) : (
                g.byBasis.map((b) => (
                  <div key={b.basis} className="border-t border-line first:border-t-0">
                    <p className="bg-sunken px-5 py-2 text-[12.5px] font-semibold text-ink-2 sm:px-6">{b.basis === "Every basis" ? "On every basis" : `On ${b.basis}`}</p>
                    <Table minWidth={1000}>
                      <colgroup>
                        <col style={{ minWidth: 260 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 150 }} />
                        <ActionsCol icons={1} labelled={4} />
                      </colgroup>
                      <THead>
                        <Th>Part</Th>
                        <Th>Prepared by</Th>
                        <Th>Mandatory</Th>
                        <Th className="text-right">Actions</Th>
                      </THead>
                      <tbody>
                        {b.parts.map((r) => {
                          const sub = [r.role, r.content, r.template ? `Template: ${r.template}` : r.source, r.templateFile ? `Template file: ${r.templateFile}` : "No template file", r.retired ? `Retired${r.raw.retiredOn ? ` from ${formatDate(r.raw.retiredOn)}` : ""}` : null, r.raw.returnedByBidder === true ? bidRuleSummary(r.id) : null].filter(Boolean).join(" · ");
                          return (
                            <Tr key={r.id}>
                              <Td><CellStack title={`${r.printedNumber}. ${r.label}`} sub={sub} /></Td>
                              <Td label="Prepared by">{r.preparedBy === NOT_SET ? <span className="text-ink-3">Any office</span> : r.preparedBy}</Td>
                              <Td label="Mandatory">
                                {r.mandatory === NOT_SET ? <SettingValue value={null} unset="Submission is held back until this is set." /> : r.mandatory}
                                {r.inTableDocument === "Yes" && <span className="block text-[12.5px] text-ink-3">In the Tender Table Document</span>}
                                {r.inTableDocument === NOT_SET && (
                                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                                    <SettingValue value={null} unset="Submission is held back until this is set." /> In the Tender Table Document
                                  </span>
                                )}
                                {r.returned === NOT_SET ? (
                                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                                    <SettingValue value={null} unset="An opening cannot finalise against this part until it is set." /> Returned by the bidder
                                  </span>
                                ) : (
                                  r.returned && <span className="block text-[12.5px] text-ink-3">{r.returned}</span>
                                )}
                              </Td>
                              <Td>
                                <RowActions>
                                  <HistoryButton iconOnly entity="TenderDocumentPart" entityId={r.id} label={`${r.printedNumber}. ${r.label}`} />
                                  <PartDrawer part={{ id: r.id, label: `${r.printedNumber}. ${r.label}`, values: partValues(r) }} options={options} />
                                  {r.raw.returnedByBidder === true && <PartBidRulesDrawer id={r.id} label={`${r.printedNumber}. ${r.label}`} values={bidRuleValues(r.id)} />}
                                  <TemplateFileDrawer id={r.id} label={`${r.printedNumber}. ${r.label}`} current={r.templateFile} upload={upload} />
                                  {r.templateFile && <RemoveTemplateFileDrawer id={r.id} label={`${r.printedNumber}. ${r.label}`} />}
                                  {r.retired ? <RestorePartDrawer id={r.id} label={`${r.printedNumber}. ${r.label}`} /> : <RetirePartDrawer id={r.id} label={`${r.printedNumber}. ${r.label}`} />}
                                </RowActions>
                              </Td>
                            </Tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ))
              )}
            </Card>
          );
        })}
        {k && (
          <Disclosure id="advanced" title="Advanced">
            <div className="flex flex-col gap-6">
        {k && (
          <Card id="registration-bodies" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  Registration bodies
                  {k.bodies.length > 0 && <Badge outline>{k.bodies.length}</Badge>}
                </span>
              }
              subtitle="Exercises list the ones they require"
              actions={<BodyDrawer />}
              divided={k.bodies.length === 0}
            />
            {k.bodies.length === 0 ? (
              <EmptyState title="None configured" />
            ) : (
              <Table minWidth={620}>
                <colgroup>
                  <col />
                  <col style={{ width: "30%" }} />
                  <ActionsCol icons={1} labelled={2} />
                </colgroup>
                <THead>
                  <Th>Body</Th>
                  <Th>Stated with it</Th>
                  <Th className="text-right">Actions</Th>
                </THead>
                <tbody>
                  {k.bodies.map((b) => (
                    <Tr key={b.id}>
                      <Td label="Body"><CellStack title={b.name} sub={[realSource(b.governingSource), b.retired ? `Retired${b.retiredOn ? ` from ${formatDate(b.retiredOn)}` : ""}` : null].filter(Boolean).join(" · ") || undefined} /></Td>
                      <Td label="Stated with it">{b.statedWithIt}</Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="RegistrationBody" entityId={b.id} label={b.name} />
                          <BodyDrawer body={{ id: b.id, name: b.name, values: b.values }} />
                          {b.retired ? <RestoreDrawer kind="body" id={b.id} label={b.name} /> : <RetireDrawer kind="body" id={b.id} label={b.name} />}
                        </RowActions>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

        {k && (
          <Card id="clauses" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  Clauses
                  {k.clauses.length > 0 && <Badge outline>{k.clauses.length}</Badge>}
                </span>
              }
              subtitle="Endorsement can leave one out"
              actions={<ClauseDrawer />}
              divided={k.clauses.length === 0}
            />
            {k.clauses.length === 0 ? (
              <EmptyState title="None configured" />
            ) : (
              <Table minWidth={620}>
                <colgroup>
                  <col />
                  <col style={{ width: 170 }} />
                  <ActionsCol icons={1} labelled={2} />
                </colgroup>
                <THead>
                  <Th>Clause</Th>
                  <Th>Every agreement</Th>
                  <Th className="text-right">Actions</Th>
                </THead>
                <tbody>
                  {k.clauses.map((x) => (
                    <Tr key={x.id}>
                      <Td label="Clause"><CellStack title={x.title} sub={[x.version, x.citedBy.length ? `Cited by ${x.citedBy.join(", ")}` : "Cited by no template", realSource(x.governingSource), x.retired ? `Retired${x.retiredOn ? ` from ${formatDate(x.retiredOn)}` : ""}` : null].filter(Boolean).join(" · ")} /></Td>
                      <Td label="Every agreement">{x.mandatory === NOT_SET ? <SettingValue value={null} unset="Every submission is held back until this is set." /> : x.mandatory === "Yes" ? "Carries it" : "Not required"}</Td>
                      <Td>
                        <RowActions>
                          <HistoryButton iconOnly entity="ClauseText" entityId={x.id} label={x.title} />
                          <ClauseDrawer clause={{ id: x.id, title: x.title, values: x.values }} />
                          {x.retired ? <RestoreDrawer kind="clause" id={x.id} label={x.title} /> : <RetireDrawer kind="clause" id={x.id} label={x.title} />}
                        </RowActions>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

            </div>
          </Disclosure>
        )}
      </div>
    </>
  );
}
