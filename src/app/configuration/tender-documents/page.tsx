import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { FileIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ORGANISATION_CODE } from "@/lib/org";
import { senToDecimalString, parseSen } from "@/lib/money";
import { NOT_SET } from "@/lib/tender-docs/labels";
import { tenderDocsConfig } from "@/lib/tender-docs/read";
import { conditionsConfig } from "@/lib/tender-docs/read-config-conditions";

import { BodyDrawer, ClauseDrawer, RestoreDrawer, RetireDrawer } from "./conditions-editors";
import { EditMethodPack, EditTenderPolicy, PartDrawer, RestorePartDrawer, RetirePartDrawer, type PartValues } from "./editors";

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

function Setting({ value, unset, source }: { value: string; unset: string; source?: string | null }) {
  if (value === NOT_SET) {
    return (
      <span className="flex flex-col items-start gap-1.5">
        <Badge tone="warn">Not set</Badge>
        <span className="text-[12.5px] text-ink-3">{unset}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="break-words whitespace-pre-line">{value}</span>
      {source !== undefined && <ProvenanceBadge value={source} />}
    </span>
  );
}

const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "unset");

export default async function TenderDocumentsConfigurationPage({ searchParams }: { searchParams: Promise<{ retired?: string }> }) {
  const showRetired = (await searchParams).retired === "1";
  const [c, k] = await Promise.all([tenderDocsConfig(showRetired), conditionsConfig(showRetired)]);
  if (!c) {
    return (
      <>
        <PageHeader title="Tender documents" subtitle="The parts each pack assembles and the figures it is judged by." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
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

  const partValues = (r: { raw: Record<string, unknown> }): PartValues => {
    const x = r.raw as Record<string, unknown> & { mandatory: boolean | null; inTableDocument: boolean | null };
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
        subtitle="The parts each pack assembles, the wording it carries and the figures it is judged by."
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
            subtitle="Unset is not zero and not a guess: it says what it leaves undecided. A figure set says where it came from."
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
                setting("Wording stamped on a restricted tender (English)", <Setting value={p.restrictionStampEn} unset={UNSET.stamp} />),
                setting("Wording stamped on a restricted tender (Malay)", <Setting value={p.restrictionStampMs} unset={UNSET.stamp} />),
                setting("The restriction, as the exercise asks it", <Setting value={k?.policy.restrictionAskedAs ?? NOT_SET} unset={UNSET.restriction} source={k?.policy.restrictionProvenance ?? null} />),
                setting("Assurance confirmations required", <Setting value={p.assuranceRequired} unset={UNSET.assurance} source={p.assuranceRequired === NOT_SET ? undefined : (k?.policy.assuranceProvenance ?? null)} />),
                setting("The list of regulator permits", <Setting value={k?.policy.permitList ?? NOT_SET} unset={UNSET.permits} />),
                setting("Liquidated damages a day", <Setting value={p.ladDailyRate} unset={UNSET.lad} source={policyRow?.ladDailyPctProvenance ?? null} />),
                setting("First interim certificate's minimum", <Setting value={p.firstCertificate} unset={UNSET.certificate} source={policyRow?.firstCertificateProvenance ?? null} />),
                setting("Insurance beyond the defects liability period", <Setting value={p.insuranceTail} unset={UNSET.insurance} source={policyRow?.insuranceExtraProvenance ?? null} />),
                setting("The same, for design and build", <Setting value={p.designAndBuildTail} unset={UNSET.designAndBuild} source={policyRow?.dbInsuranceExtraProvenance ?? null} />),
                ...(p.governingSource ? [setting("Where the policy is written", p.governingSource)] : []),
              ]}
            />
            {policyRow?.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{policyRow.notes}</p>}
          </CardBody>
        </Card>

        {k && (
          <Card id="registration-bodies" className="scroll-mt-24 overflow-hidden">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  Registration bodies
                  {k.bodies.length > 0 && <Badge outline>{k.bodies.length}</Badge>}
                </span>
              }
              subtitle="The bodies a bidder registers with. Each exercise lists the registrations it requires from these, and its notice prints them."
              actions={<BodyDrawer />}
              divided={k.bodies.length === 0}
            />
            {k.bodies.length === 0 ? (
              <EmptyState title="None configured">An exercise cannot record who may bid until its registration bodies are added.</EmptyState>
            ) : (
              <Table minWidth={620}>
                <colgroup>
                  <col />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: 120 }} />
                  <ActionsCol icons={1} labelled={2} />
                </colgroup>
                <THead>
                  <Th>Body</Th>
                  <Th>Stated with it</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Actions</Th>
                </THead>
                <tbody>
                  {k.bodies.map((b) => (
                    <Tr key={b.id}>
                      <Td label="Body"><CellStack title={b.name} sub={[b.nameMs, b.governingSource, b.retired ? `Retired${b.retiredOn ? ` from ${formatDate(b.retiredOn)}` : ""}` : null].filter(Boolean).join(" · ") || undefined} /></Td>
                      <Td label="Stated with it">{b.statedWithIt}</Td>
                      <Td label="Source"><ProvenanceBadge value={b.provenance} /></Td>
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
              subtitle="Clauses a template cites. One every agreement carries can be left out only under a legal endorsement on the exercise."
              actions={<ClauseDrawer />}
              divided={k.clauses.length === 0}
            />
            {k.clauses.length === 0 ? (
              <EmptyState title="None configured">No clause is required in agreements until one is added here.</EmptyState>
            ) : (
              <Table minWidth={620}>
                <colgroup>
                  <col />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 120 }} />
                  <ActionsCol icons={1} labelled={2} />
                </colgroup>
                <THead>
                  <Th>Clause</Th>
                  <Th>Every agreement</Th>
                  <Th>Source</Th>
                  <Th className="text-right">Actions</Th>
                </THead>
                <tbody>
                  {k.clauses.map((x) => (
                    <Tr key={x.id}>
                      <Td label="Clause"><CellStack title={x.title} sub={[x.version, x.malay, x.governingSource, x.retired ? `Retired${x.retiredOn ? ` from ${formatDate(x.retiredOn)}` : ""}` : null].filter(Boolean).join(" · ")} /></Td>
                      <Td label="Every agreement">{x.mandatory === NOT_SET ? <Badge tone="warn" title="Every submission is held back until this is set">Not set</Badge> : x.mandatory === "Yes" ? "Carries it" : "Not required"}</Td>
                      <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
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

        <Card id="methods" className="scroll-mt-24 overflow-hidden">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                Which documents each method assembles
                {c.methods.length > 0 && <Badge outline>{c.methods.length}</Badge>}
              </span>
            }
            subtitle="An exercise moves into preparation only once its method says which documents it needs. Not set holds that move back, naming this setting; it is never read as none."
            divided={c.methods.length === 0}
          />
          {c.methods.length === 0 ? (
            <EmptyState title="Not set">No sourcing methods are configured. Add them under Reference data.</EmptyState>
          ) : (
            <Table minWidth={560}>
              <colgroup>
                <col />
                <col style={{ width: "30%" }} />
                <col style={{ width: "18%" }} />
                <ActionsCol icons={1} labelled={1} />
              </colgroup>
              <THead>
                <Th>Method</Th>
                <Th>Documents assembled</Th>
                <Th>Source</Th>
                <Th className="text-right">Actions</Th>
              </THead>
              <tbody>
                {c.methods.map((m) => (
                  <Tr key={m.id}>
                    <Td label="Method"><CellStack title={m.name} sub={m.retired ? "Retired" : undefined} /></Td>
                    <Td label="Documents assembled">{m.documentPack === NOT_SET ? <Badge tone="warn">Not set</Badge> : m.documentPack}</Td>
                    <Td label="Source">{m.documentPack === NOT_SET ? <span className="text-ink-3">—</span> : <ProvenanceBadge value={m.raw.documentPackKindProvenance} />}</Td>
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
                subtitle="In print order, for each contract basis. A part for one basis replaces the every-basis part of the same role."
                divided={count === 0}
              />
              {count === 0 ? (
                <EmptyState title="No parts configured" action={<PartDrawer options={options} />}>
                  {allRetiredHidden ? "Every part is retired. Choose Show retired parts to see them." : `${g.packKind} cannot be started on any basis until its parts are added.`}
                </EmptyState>
              ) : (
                g.byBasis.map((b) => (
                  <div key={b.basis} className="border-t border-line first:border-t-0">
                    <p className="bg-sunken px-5 py-2 text-[12.5px] font-semibold text-ink-2 sm:px-6">{b.basis === "Every basis" ? "On every basis" : `On ${b.basis}`}</p>
                    <Table minWidth={760}>
                      <colgroup>
                        <col style={{ width: 56 }} />
                        <col />
                        <col style={{ width: 136 }} />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 120 }} />
                        <ActionsCol icons={1} labelled={2} />
                      </colgroup>
                      <THead>
                        <Th>No.</Th>
                        <Th>Part</Th>
                        <Th>Prepared by</Th>
                        <Th>Mandatory</Th>
                        <Th>Source</Th>
                        <Th className="text-right">Actions</Th>
                      </THead>
                      <tbody>
                        {b.parts.map((r) => {
                          const sub = [r.role, r.content, r.template ? `Template: ${r.template}` : r.source, r.retired ? `Retired${r.raw.retiredOn ? ` from ${formatDate(r.raw.retiredOn)}` : ""}` : null].filter(Boolean).join(" · ");
                          return (
                            <Tr key={r.id}>
                              <Td label="No." className="font-semibold text-ink-2">{r.printedNumber}</Td>
                              <Td label="Part"><CellStack title={r.label} sub={sub} /></Td>
                              <Td label="Prepared by">{r.preparedBy === NOT_SET ? <Badge outline>Not set</Badge> : r.preparedBy}</Td>
                              <Td label="Mandatory">
                                {r.mandatory === NOT_SET ? <Badge tone="warn" title="Submission is held back until this is set">Not set</Badge> : r.mandatory}
                                {r.inTableDocument === "Yes" && <span className="block text-[12.5px] text-ink-3">In the Tender Table Document</span>}
                              </Td>
                              <Td label="Source"><ProvenanceBadge value={r.raw.provenance} /></Td>
                              <Td>
                                <RowActions>
                                  <HistoryButton iconOnly entity="TenderDocumentPart" entityId={r.id} label={`${r.printedNumber}. ${r.label}`} />
                                  <PartDrawer part={{ id: r.id, label: `${r.printedNumber}. ${r.label}`, values: partValues(r) }} options={options} />
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
      </div>
    </>
  );
}
