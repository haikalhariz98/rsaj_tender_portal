/**
 * The documents register's reads (6.14 increment 2, `/documents`). Reads only; every rule (the merged page, a copy's
 * state, the sheets' counts and order, the search's variants) is in the pure modules beside this.
 *
 * - Library: every issued certificate and every frozen award document, newest first, one page at a time; the search
 *   runs in the database over the whole register (number, contract, contractor, kind, the frozen text), for the query
 *   and each of its term variants (FR-CRT-011), and the total is counted over the whole match.
 * - Distribution: every addressed copy of an issued certificate not yet sent, or sent and its acknowledgement
 *   awaited, oldest issue first; the counts are the database's, over all of them.
 * - Routing sheets: every certificate on its routing sheet, its sheet drawn by the same projection as the
 *   certificate's page, judged over all of them, then paged.
 */

import type { Prisma } from "@/generated/prisma/client";
import { DOCUMENT_LABEL } from "@/lib/award/labels";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { KIND_WORDS } from "./labels";
import { DISTRIBUTION_PAGE, LIBRARY_PAGE, mergedPage, pageOf, sheetCounts, sheetOrder, SHEETS_PAGE } from "./library";
import { certificateInclude, termOf } from "./repo";
import { searchVariants } from "./terms";
import { CERTIFICATE_KINDS } from "./types";
import { sheetOf } from "./write";

const insensitive = (v: string) => ({ contains: v, mode: "insensitive" as const });
const kindsMatching = (v: string) => CERTIFICATE_KINDS.filter((k) => [KIND_WORDS[k].en, KIND_WORDS[k].ms].some((x) => x.toLowerCase().includes(v.toLowerCase())));
const awardKindsMatching = (v: string) => (Object.keys(DOCUMENT_LABEL) as (keyof typeof DOCUMENT_LABEL)[]).filter((k) => DOCUMENT_LABEL[k].toLowerCase().includes(v.toLowerCase()));

export interface LibraryRow {
  id: string;
  at: Date;
  source: "CERTIFICATE" | "AWARD_DOCUMENT";
  /// The record's own page.
  href: string;
  kindEn: string;
  number: string | null;
  /// The contract (a certificate's) or the award (an award document's) it belongs to.
  ofEn: string;
  form: { name: string; formCode: string; revisionDate: string | null; version: number };
  languages: ("EN" | "MS")[];
  /// The organisation's day it was issued or frozen. Null: an award document with the organisation's time zone not set.
  issuedOn: string | null;
  copies: { total: number; notSent: number; ackAwaited: number } | null;
}

export async function libraryPage(organisationId: string, query: string, askedPage: string | undefined, timeZone: string | null) {
  const terms = (await db.term.findMany({ where: { organisationId }, orderBy: { code: "asc" }, include: { aliases: true } })).map(termOf);
  const variants = searchVariants(query, terms);
  const certWhere: Prisma.CertificateWhereInput = {
    organisationId,
    status: "ISSUED",
    ...(variants.length
      ? {
          OR: variants.flatMap((v): Prisma.CertificateWhereInput[] => [
            { number: insensitive(v) },
            { contract: { number: insensitive(v) } },
            { contract: { award: { awardeeName: insensitive(v) } } },
            { documents: { some: { renderedText: insensitive(v) } } },
            { documents: { some: { templateName: insensitive(v) } } },
            ...(kindsMatching(v).length ? [{ kind: { in: kindsMatching(v) } }] : []),
          ]),
        }
      : {}),
  };
  // An award document is listed once per version, whatever the languages it was frozen in; it is found by its text,
  // its form, its award's reference or awardee, or its kind.
  const awardWhere: Prisma.AwardDocumentWhereInput = {
    award: { organisationId },
    ...(variants.length
      ? {
          OR: variants.flatMap((v): Prisma.AwardDocumentWhereInput[] => [
            { renderedText: insensitive(v) },
            { templateName: insensitive(v) },
            { award: { reference: insensitive(v) } },
            { award: { awardeeName: insensitive(v) } },
            ...(awardKindsMatching(v).length ? [{ kind: { in: awardKindsMatching(v) } }] : []),
          ]),
        }
      : {}),
  };
  const [certTotal, awardGroups] = await Promise.all([db.certificate.count({ where: certWhere }), db.awardDocument.groupBy({ by: ["awardId", "kind", "version"], where: awardWhere, _max: { frozenAt: true } })]);
  const total = certTotal + awardGroups.length;
  const page = pageOf(askedPage, total, LIBRARY_PAGE);
  const want = (page + 1) * LIBRARY_PAGE;
  const certs = await db.certificate.findMany({
    where: certWhere,
    orderBy: [{ issuedAt: "desc" }, { id: "asc" }],
    take: want,
    select: { id: true, kind: true, number: true, sequence: true, issuedAt: true, issueSnapshot: true, contract: { select: { id: true, number: true } }, documents: { select: { language: true, templateName: true, templateFormCode: true, templateRevisionDate: true, templateBodyVersion: true } }, copies: { select: { despatchedOn: true, ackRequired: true, acknowledgedOn: true } } },
  });
  const groups = [...awardGroups].map((g) => ({ ...g, at: g._max.frozenAt!, id: `${g.awardId}:${g.kind}:${g.version}` })).sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : 1)).slice(0, want);
  const certRows: LibraryRow[] = certs.map((c) => {
    const d = c.documents[0];
    const issuedOn = (c.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? storedDay(c.issuedAt!);
    return {
      id: c.id,
      at: c.issuedAt!,
      source: "CERTIFICATE",
      href: `/projects/${c.contract.id}/certificates/${c.id}?tab=print`,
      kindEn: `${KIND_WORDS[c.kind].en}${c.sequence ? ` ${c.sequence}` : ""}`,
      number: c.number,
      ofEn: `Contract ${c.contract.number}`,
      form: { name: d?.templateName ?? "", formCode: d?.templateFormCode ?? "", revisionDate: d?.templateRevisionDate ? storedDay(d.templateRevisionDate) : null, version: d?.templateBodyVersion ?? 0 },
      languages: c.documents.map((x) => x.language as "EN" | "MS"),
      issuedOn,
      copies: { total: c.copies.length, notSent: c.copies.filter((x) => !x.despatchedOn).length, ackAwaited: c.copies.filter((x) => x.despatchedOn && x.ackRequired && !x.acknowledgedOn).length },
    };
  });
  const groupIds = groups.map((g) => ({ awardId: g.awardId, kind: g.kind, version: g.version }));
  const docs = groupIds.length ? await db.awardDocument.findMany({ where: { OR: groupIds }, select: { awardId: true, kind: true, version: true, language: true, templateName: true, templateFormCode: true, templateRevisionDate: true, templateBodyVersion: true, frozenAt: true, award: { select: { id: true, reference: true, awardeeName: true } } } }) : [];
  const awardRows: LibraryRow[] = groups.map((g) => {
    const mine = docs.filter((d) => d.awardId === g.awardId && d.kind === g.kind && d.version === g.version);
    const d = mine[0];
    return {
      id: g.id,
      at: g.at,
      source: "AWARD_DOCUMENT",
      href: `/awards/${g.awardId}?tab=instrument`,
      kindEn: `${DOCUMENT_LABEL[g.kind]}${g.version > 1 ? `, version ${g.version}` : ""}`,
      number: null,
      ofEn: d ? `Award ${d.award.reference} · ${d.award.awardeeName}` : "An award",
      form: { name: d?.templateName ?? "", formCode: d?.templateFormCode ?? "", revisionDate: d?.templateRevisionDate ? storedDay(d.templateRevisionDate) : null, version: d?.templateBodyVersion ?? 0 },
      languages: mine.map((x) => x.language as "EN" | "MS"),
      issuedOn: dayOf(g.at, timeZone),
      copies: null,
    };
  });
  return { rows: mergedPage(certRows, awardRows, page * LIBRARY_PAGE, LIBRARY_PAGE), total, page, certTotal, awardTotal: awardGroups.length, variants };
}

export async function distributionPage(organisationId: string, askedPage: string | undefined) {
  const outstanding: Prisma.IssuedCopyWhereInput = {
    organisationId,
    certificate: { status: "ISSUED" },
    recalledOn: null,
    OR: [{ despatchedOn: null }, { ackRequired: true, acknowledgedOn: null }],
  };
  const [total, notSent, notSentMandatory, ackAwaited] = await Promise.all([
    db.issuedCopy.count({ where: outstanding }),
    db.issuedCopy.count({ where: { organisationId, certificate: { status: "ISSUED" }, recalledOn: null, despatchedOn: null } }),
    db.issuedCopy.count({ where: { organisationId, certificate: { status: "ISSUED" }, recalledOn: null, despatchedOn: null, mandatory: true } }),
    db.issuedCopy.count({ where: { organisationId, certificate: { status: "ISSUED" }, recalledOn: null, despatchedOn: { not: null }, ackRequired: true, acknowledgedOn: null } }),
  ]);
  const page = pageOf(askedPage, total, DISTRIBUTION_PAGE);
  const rows = await db.issuedCopy.findMany({
    where: outstanding,
    orderBy: [{ certificate: { issuedAt: "asc" } }, { certificateId: "asc" }, { copyNo: "asc" }],
    skip: page * DISTRIBUTION_PAGE,
    take: DISTRIBUTION_PAGE,
    select: { id: true, copyNo: true, recipientName: true, addressedTo: true, mandatory: true, ackRequired: true, isOriginal: true, despatchedOn: true, acknowledgedOn: true, certificate: { select: { id: true, kind: true, number: true, sequence: true, issueSnapshot: true, contract: { select: { id: true, number: true } } } } },
  });
  // Each copy with its certificate read flat (the outstanding filter means it always has one).
  const flat = rows.map((r) => ({ id: r.id, copyNo: r.copyNo, recipientName: r.recipientName, addressedTo: r.addressedTo, mandatory: !!r.mandatory, ackRequired: !!r.ackRequired, isOriginal: !!r.isOriginal, despatchedOn: r.despatchedOn ? storedDay(r.despatchedOn) : null, acknowledgedOn: r.acknowledgedOn ? storedDay(r.acknowledgedOn) : null, certId: r.certificate?.id ?? "", kind: r.certificate?.kind ?? "INTERIM_PAYMENT", number: r.certificate?.number ?? null, sequence: r.certificate?.sequence ?? null, issuedOn: (r.certificate?.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? null, contractId: r.certificate?.contract.id ?? "", contractNumber: r.certificate?.contract.number ?? "" }));
  return { rows: flat, total, page, counts: { notSent, notSentMandatory, ackAwaited } };
}

export async function routingSheetsPage(organisationId: string, askedPage: string | undefined, today: string) {
  const certs = await db.certificate.findMany({ where: { organisationId, status: "IN_ROUTING" }, include: { ...certificateInclude, contract: { select: { id: true, number: true } } } });
  const sheets = certs
    .map((c) => ({ c, sheet: sheetOf(c, today) }))
    .filter((x): x is { c: (typeof certs)[number]; sheet: NonNullable<ReturnType<typeof sheetOf>> } => x.sheet != null)
    .sort((a, b) => sheetOrder({ date1: a.sheet.date1, id: a.c.id }, { date1: b.sheet.date1, id: b.c.id }));
  const counts = sheetCounts(sheets.map((x) => x.sheet));
  const page = pageOf(askedPage, sheets.length, SHEETS_PAGE);
  return { rows: sheets.slice(page * SHEETS_PAGE, (page + 1) * SHEETS_PAGE), total: sheets.length, page, counts };
}
