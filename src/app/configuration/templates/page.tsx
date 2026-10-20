import { loadDocumentClasses, loadTemplates } from "@/lib/records/load";
import { db } from "@/lib/db";
import { dayToDate, todayIn } from "@/lib/dates";
import { liveClauses } from "@/lib/tender-docs/clauses";
import { loadClauses } from "@/lib/tender-docs/repo";

import { ProvenanceChip, Section, Stat, Stats } from "../records-ui";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddTemplate, EditTemplate } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { Tabs } from "@/components/tabs";
import { FilesIcon, InboxIcon, ToolsIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { otherUsesOf, TEMPLATE_OTHER_USES } from "@/lib/certificate/config";
import { formNeeds, NEED_STATE_WORDS, type FormOf } from "@/lib/certificate/form-needs";
import type { CertificateKind } from "@/lib/certificate/types";
import { AddCorrection, AddTerm, EditCorrection, EditTerm, RemoveCorrection, RemoveTerm } from "./glossary-editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

const day = (d: Date | null) => (d ? formatDate(d) : "—");
/// What a template's text is. Founder, 2026-10-20: English only, so a document is issued from the English text; a stored Malay text is kept and not issued.
/// The version counts the text, and on a certificate form (one with signature blocks, recipients or printed fields)
/// its blocks, list and printed form too (BD-614-21, increment 2), so the line says which.
function textLine(t: { bodyMs: string | null; bodyEn: string | null; primaryLanguage: "MS" | "EN" | null; bodyVersion: number }, form: boolean): string {
  const ms = !!t.bodyMs?.trim();
  const en = !!t.bodyEn?.trim();
  if (!en) return ms ? "No English text" : "Text not configured";
  const version = `version ${t.bodyVersion} (${form ? "its text, signature blocks, distribution list and printed form" : "its text"})`;
  return `English text, ${version}`;
}

const USE_COUNTS = Object.fromEntries(Object.keys(TEMPLATE_OTHER_USES).map((k) => [k, true])) as Record<keyof typeof TEMPLATE_OTHER_USES, true>;
const FORM_OF = { select: { id: true, nameEn: true, bodyEn: true, bodyMs: true } } as const;
const TAB_IDS = ["templates", "corrections", "terms"] as const;

export default async function TemplatesPage(props: PageProps<"/configuration/templates">) {
  const actor = await requireStaff();
  const { tab } = (await props.searchParams) as { tab?: string };
  const [templates, classes, org, blocks, rows, fields] = await Promise.all([
    loadTemplates(actor.organisationCode),
    loadDocumentClasses(actor.organisationCode),
    db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true, timeZone: true } }),
    // 6.14 increment 1: each form's signature blocks and distribution list, counted for its row.
    db.formSignatureBlock.groupBy({ by: ["templateId"], _count: { _all: true } }),
    db.formDistribution.groupBy({ by: ["templateId"], _count: { _all: true } }),
    // 6.14 increment 2: and its printed fields.
    db.formField.groupBy({ by: ["templateId"], _count: { _all: true } }),
  ]);
  const countOf = (list: { templateId: string; _count: { _all: number } }[], id: string) => list.find((x) => x.templateId === id)?._count._all ?? 0;
  const formLine = (id: string) => {
    const b = countOf(blocks, id);
    const r = countOf(rows, id);
    const f = countOf(fields, id);
    return b || r || f ? `${b} signature block${b === 1 ? "" : "s"}, ${r} recipient${r === 1 ? "" : "s"}${f ? `, ${f} printed field${f === 1 ? "" : "s"}` : ""}` : null;
  };
  const pages = (n: number | null) => (n == null ? null : `${n} printed page${n === 1 ? "" : "s"}`);
  // The clauses a text may cite (6.4 inc 2): live today, by title. Without the organisation's day none is judged live, so none is offered.
  const today = org ? todayIn(new Date(), org.timeZone) : null;
  const clauses = org && today ? liveClauses(await loadClauses(org.id), today).map((c) => ({ code: c.code, title: c.titleEn })) : [];
  const unclassified = templates.filter((t) => t.documentClassId == null);
  const withText = templates.filter((t) => t.bodyEn?.trim()).length;

  // 6.14 increment 2: the forms the certificates need (FR-CRT-012), the typing corrections and the terms.
  const [kindSettings, policy, sheetTypes, corrections, terms, formRows] = org
    ? await Promise.all([
        db.certificateKindSetting.findMany({ where: { organisationId: org.id }, include: { template: FORM_OF } }),
        db.postAwardPolicy.findUnique({ where: { organisationId: org.id }, include: { delegationLetterConventional: FORM_OF, delegationNoticeConventional: FORM_OF, delegationLetterDesignBuild: FORM_OF, delegationNoticeDesignBuild: FORM_OF } }),
        // Types retired by the organisation's day are left out; without its day none is judged retired.
        db.routingSheetType.findMany({ where: { organisationId: org.id, ...(today ? { OR: [{ retiredOn: null }, { retiredOn: { gt: dayToDate(today) } }] } : {}) }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], include: { template: FORM_OF } }),
        db.textCorrection.findMany({ where: { organisationId: org.id }, orderBy: [{ fromText: "asc" }, { id: "asc" }], include: { forms: { include: { template: { select: { id: true, nameEn: true } } } } } }),
        db.term.findMany({ where: { organisationId: org.id }, orderBy: { code: "asc" }, include: { aliases: { orderBy: { alias: "asc" } } } }),
        db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, pageCount: true, _count: { select: USE_COUNTS } } }),
      ])
    : [[], null, [], [], [], []];
  const kindForms: Partial<Record<CertificateKind, FormOf | null>> = Object.fromEntries(kindSettings.map((k) => [k.kind, k.template]));
  const needs = formNeeds({
    kinds: kindForms,
    delegation: { CONVENTIONAL: { letter: policy?.delegationLetterConventional ?? null, notice: policy?.delegationNoticeConventional ?? null }, DESIGN_AND_BUILD: { letter: policy?.delegationLetterDesignBuild ?? null, notice: policy?.delegationNoticeDesignBuild ?? null } },
    sheets: sheetTypes.map((t) => ({ id: t.id, labelEn: t.labelEn, labelMs: t.labelMs, form: t.template })),
  });
  const gaps = needs.filter((n) => n.setAt === "POST_AWARD" && n.state !== "READY").length;
  // A correction applies to certificate forms only (a template another module uses renders its own text).
  const certificateForms = formRows.filter((t) => otherUsesOf(t._count as unknown as Record<string, number>).length === 0).map((t) => ({ value: t.id, label: t.nameEn }));
  const pageCountOf = (id: string) => formRows.find((t) => t.id === id)?.pageCount ?? null;
  const termOptions = terms.map((t) => ({ code: t.code, wording: [t.canonicalMs, t.canonicalEn].filter(Boolean).join(" / ") }));

  const templatesPanel = (
    <>
      <Stats>
        <Stat
          label="Templates"
          value={templates.length === 0 ? null : templates.length}
          hint={templates.length === 0 ? "Nothing is issued yet" : withText === templates.length ? "Each has its text" : `${withText} with text; ${templates.length - withText} without, so not issued`}
        />
        <Stat
          label="Classified"
          value={
            templates.length === 0
              ? null
              : `${templates.length - unclassified.length} / ${templates.length}`
          }
          warn={unclassified.length > 0}
          hint={
            unclassified.length > 0
              ? "An unclassified template has no retention rule"
              : "Every template has a class"
          }
        />
        <Stat
          label="Bilingual"
          value={templates.length === 0 ? null : templates.filter((t) => t.bilingual).length}
          hint="Both languages on one page"
        />
      </Stats>

      <Section
        title="Templates"
        blurb="A generated form has to stand next to the printed one it replaces, so each carries its form code and revision. Open a template for its signature blocks in printed order, its distribution list and its printed form."
        empty="No template has been set. Nothing can be issued until one exists."
        count={templates.length}
        action={<AddTemplate classes={classes} clauses={clauses} terms={termOptions} />}
      >
        <Table>
          <colgroup>
            <col />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Template</Th>
            <Th>Form code</Th>
            <Th>Revision</Th>
            <Th>Class</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {templates.map((t) => {
              const cls = classes.find((c) => c.id === t.documentClassId);
              return (
                <Tr key={t.id}>
                  <Td label="Template" title={t.nameEn}>
                    <CellStack
                      title={<Link href={`/configuration/templates/${t.id}`} className="font-semibold">{t.nameEn}</Link>}
                      aside={t.bilingual ? <Badge outline>bilingual</Badge> : undefined}
                      sub={[textLine(t, formLine(t.id) != null), formLine(t.id), pages(pageCountOf(t.id))].filter(Boolean).join(" · ")}
                    />
                  </Td>
                  <Td label="Form code" className="truncate font-mono text-[12.5px] text-ink-2" title={t.formCode || undefined}>
                    {t.formCode || "—"}
                  </Td>
                  <Td label="Revision" className="text-ink-2 tabular-nums">{day(t.revisionDate)}</Td>
                  <Td label="Class" className="truncate" title={cls?.nameEn}>
                    {cls ? cls.nameEn : <Badge tone="warn">Not classified</Badge>}
                  </Td>
                  <Td label="Source">
                    <ProvenanceChip value={t.provenance} />
                  </Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="DocumentTemplate" entityId={t.id} label={t.nameEn} />
                      <EditTemplate row={t} classes={classes} clauses={clauses} terms={termOptions} />
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      <Card className="overflow-hidden">
        <CardHeader
          icon={<ToolsIcon size={17} />}
          title="Forms the certificates need"
          actions={gaps ? <Badge tone="warn" dot>{`${gaps} without a written form`}</Badge> : <Badge tone="ok">Each has its written form</Badge>}
          subtitle="Written by the organisation"
          divided={needs.length === 0}
        />
        {needs.length === 0 ? (
          <EmptyState size="sm" title="Nothing listed" />
        ) : (
          <Table minWidth={640}>
            <colgroup>
              <col />
              <col style={{ width: "32%" }} />
              <col style={{ width: "26%" }} />
            </colgroup>
            <THead>
              <Th>What needs a form</Th>
              <Th>Form</Th>
              <Th>State</Th>
            </THead>
            <tbody>
              {needs.map((n) => (
                <Tr key={n.key}>
                  <Td label="What needs a form">
                    <CellStack title={n.need.en} sub={n.setAt === "POST_AWARD" ? "Chosen under Post-award controls" : "Its printed sheet, named under Routing sheets"} />
                  </Td>
                  <Td label="Form" className="break-words">
                    {n.form ? <Link href={`/configuration/templates/${n.form.id}`} className="font-semibold">{n.form.nameEn}</Link> : <span className="text-ink-4">None chosen</span>}
                  </Td>
                  <Td label="State">
                    {n.setAt === "ROUTING_SHEETS" ? (
                      n.state === "READY" ? <Badge tone="ok">Printed sheet named</Badge> : <Badge>None named: the sheet shows the product&apos;s words only</Badge>
                    ) : (
                      <Badge tone={n.state === "READY" ? "ok" : "warn"}>{NEED_STATE_WORDS[n.state].en}</Badge>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );

  const correctionsPanel = (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<FilesIcon size={17} />}
        title="Typing corrections"
        subtitle="Corrected on render. None ships."
        actions={<AddCorrection forms={certificateForms} />}
        divided={corrections.length === 0}
      />
      {corrections.length === 0 ? (
        <EmptyState size="sm" title="None" />
      ) : (
        <Table minWidth={640}>
          <colgroup>
            <col />
            <col style={{ width: 130 }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Correction</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {corrections.map((c) => (
              <Tr key={c.id}>
                <Td label="Correction">
                  <CellStack title={`${c.fromText} → ${c.toText}`} sub={`On ${c.forms.map((f) => f.template.nameEn).sort().join(", ")}`} />
                </Td>
                <Td label="Source"><ProvenanceBadge value={c.provenance} /></Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="TextCorrection" entityId={c.id} label={c.fromText} />
                    <EditCorrection forms={certificateForms} row={{ id: c.id, fromText: c.fromText, toText: c.toText, templateIds: c.forms.map((f) => f.templateId), provenance: c.provenance, notes: c.notes }} />
                    <RemoveCorrection id={c.id} label={c.fromText} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );

  const termsPanel = (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<InboxIcon size={17} />}
        title="Terms"
        subtitle="One wording per concept. None ships."
        actions={<AddTerm />}
        divided={terms.length === 0}
      />
      {terms.length === 0 ? (
        <EmptyState size="sm" title="None" />
      ) : (
        <Table minWidth={640}>
          <colgroup>
            <col />
            <col style={{ width: 130 }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Term</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {terms.map((t) => (
              <Tr key={t.id}>
                <Td label="Term">
                  <CellStack
                    title={[t.canonicalMs, t.canonicalEn].filter(Boolean).join(" · ")}
                    sub={[t.aliases.length ? `Also written: ${t.aliases.map((a) => a.alias).join("; ")}` : "No other wording", `Cited in a form's text as {{term:${t.code}}}`].join(" · ")}
                  />
                </Td>
                <Td label="Source"><ProvenanceBadge value={t.provenance} /></Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="Term" entityId={t.id} label={t.canonicalMs ?? t.canonicalEn ?? "Term"} />
                    <EditTerm row={{ id: t.id, code: t.code, canonicalEn: t.canonicalEn, canonicalMs: t.canonicalMs, aliases: t.aliases.map((a) => a.alias), provenance: t.provenance, notes: t.notes }} />
                    <RemoveTerm id={t.id} label={t.canonicalMs ?? t.canonicalEn ?? "the term"} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader
        title="Templates"
        badge={
          unclassified.length > 0 ? (
            <Badge tone="warn" dot>
              {unclassified.length === 1 ? "1 unclassified" : `${unclassified.length} unclassified`}
            </Badge>
          ) : undefined
        }
        info={{ title: "Templates", text: "The certificates, letters and routing sheets the portal issues." }}
      />

      <Tabs
        initial={TAB_IDS.find((x) => x === tab) ?? "templates"}
        label="Templates"
        tabs={[
          { id: "templates", label: "Templates", icon: <FilesIcon size={15} />, count: templates.length, panel: templatesPanel },
          { id: "corrections", label: "Typing corrections", icon: <ToolsIcon size={15} />, count: corrections.length, panel: correctionsPanel },
          { id: "terms", label: "Terms", icon: <InboxIcon size={15} />, count: terms.length, panel: termsPanel },
        ]}
      />
    </>
  );
}
