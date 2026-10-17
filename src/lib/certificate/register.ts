/**
 * The documents register's reads (6.14 increment 2, `/documents`). Reads only; every rule (a copy's state, the lists'
 * where-clauses, the sheets' counts and order, the search's variants and patterns) is in the pure modules beside this.
 *
 * - Library: every issued certificate and every frozen award document version, newest first. The two are one list in
 *   the database (code review M-3): a single query numbers and pages them (`libraryEntries`), and another counts them;
 *   nothing is loaded beyond the page. The search runs there too, over the whole register (number, contract,
 *   contractor, kind, form, the frozen text), for the query and each of its term variants (FR-CRT-011).
 * - Distribution: every addressed copy of an issued certificate not yet sent, or sent and its acknowledgement
 *   awaited, oldest issue first, on contracts not cancelled; the counts are the database's, and a cancelled contract's
 *   outstanding copies are counted apart, kept as they were (code review M-2).
 * - Routing sheets: every certificate on its routing sheet on a contract not cancelled, read through a slim select and
 *   drawn by the certificate page's own projection, judged over all of them (the counts every tab shows), then paged;
 *   a cancelled contract's are counted apart.
 */

import { Prisma } from "@/generated/prisma/client";
import { DOCUMENT_LABEL } from "@/lib/award/labels";
import { dayOf, storedDay } from "@/lib/dates";
import { db } from "@/lib/db";

import { KIND_WORDS } from "./labels";
import { issuedCopiesWhere, LIBRARY_PAGE, likePatterns, openSheetsWhere, pageOf, sheetCounts, sheetOrder } from "./library";
import { sheetOf } from "./pin-context";
import { termOf } from "./repo";
import { searchVariants } from "./terms";
import { CERTIFICATE_KINDS } from "./types";

const kindsMatching = (vs: readonly string[]) => CERTIFICATE_KINDS.filter((k) => vs.some((v) => [KIND_WORDS[k].en, KIND_WORDS[k].ms].some((x) => x.toLowerCase().includes(v.toLowerCase()))));
const awardKindsMatching = (vs: readonly string[]) => (Object.keys(DOCUMENT_LABEL) as (keyof typeof DOCUMENT_LABEL)[]).filter((k) => vs.some((v) => DOCUMENT_LABEL[k].toLowerCase().includes(v.toLowerCase())));

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

/**
 * The Library's entries as one numbered list in the database: an issued certificate is one entry, an award document
 * version (whatever its languages) one entry, each with the instant it was issued or frozen. Newest first; two in one
 * instant by their id in byte order (COLLATE "C"), whatever the database's collation, so a page never depends on it.
 */
/// `hidden`: the restricted exercises the reader may not see (FR-MTD-007). An award document of an award on one is left out of the list itself, so the count and
/// the paging stay honest; the row names the award, its reference and the awardee. (A certificate belongs to a contract, which is not hidden: see the decisions log.)
function entries(organisationId: string, variants: readonly string[], hidden: readonly string[] = []) {
  const pats = likePatterns(variants);
  const kinds = kindsMatching(variants);
  const awardKinds = awardKindsMatching(variants);
  const certSearch = variants.length
    ? Prisma.sql`(c."number" ILIKE ANY(${pats}) OR k."number" ILIKE ANY(${pats}) OR a."awardeeName" ILIKE ANY(${pats}) OR c."kind"::text = ANY(${kinds}) OR EXISTS (SELECT 1 FROM "CertificateDocument" d WHERE d."certificateId" = c."id" AND (d."renderedText" ILIKE ANY(${pats}) OR d."templateName" ILIKE ANY(${pats}))))`
    : Prisma.sql`TRUE`;
  const awardSearch = variants.length ? Prisma.sql`(ad."renderedText" ILIKE ANY(${pats}) OR ad."templateName" ILIKE ANY(${pats}) OR aw."reference" ILIKE ANY(${pats}) OR aw."awardeeName" ILIKE ANY(${pats}) OR ad."kind"::text = ANY(${awardKinds}))` : Prisma.sql`TRUE`;
  const awardVisible = hidden.length ? Prisma.sql`aw."exerciseId" NOT IN (${Prisma.join([...hidden])})` : Prisma.sql`TRUE`;
  return Prisma.sql`SELECT 'C'::text AS src, c."id" AS id, c."issuedAt" AS at FROM "Certificate" c JOIN "Contract" k ON k."id" = c."contractId" JOIN "Award" a ON a."id" = k."awardId" WHERE c."organisationId" = ${organisationId} AND c."status" = 'ISSUED' AND ${certSearch}
    UNION ALL
    SELECT 'A'::text AS src, ad."awardId" || ':' || ad."kind"::text || ':' || ad."version"::text AS id, max(ad."frozenAt") AS at FROM "AwardDocument" ad JOIN "Award" aw ON aw."id" = ad."awardId" WHERE aw."organisationId" = ${organisationId} AND ${awardVisible} AND ${awardSearch} GROUP BY ad."awardId", ad."kind", ad."version"`;
}

/// How many entries the Library holds for a search (none: the whole register), counted in the database.
export async function libraryCount(organisationId: string, variants: readonly string[], hidden: readonly string[]): Promise<number> {
  const list = entries(organisationId, variants, hidden);
  const r = await db.$queryRaw<{ n: number }[]>`WITH entries AS (${list}) SELECT count(*)::int AS n FROM entries`;
  return r[0]?.n ?? 0;
}

type Entry = { src: "C" | "A"; id: string; at: Date };

/// One page of the Library's entries, in the database's order.
async function libraryEntries(organisationId: string, variants: readonly string[], offset: number, limit: number, hidden: readonly string[]): Promise<Entry[]> {
  const list = entries(organisationId, variants, hidden);
  return db.$queryRaw<Entry[]>`WITH entries AS (${list}) SELECT src, id, at FROM entries ORDER BY at DESC, id COLLATE "C" ASC LIMIT ${limit} OFFSET ${offset}`;
}

/// `wholeTotal`: the whole Library's count where the caller has it, used when there is no search (never counted twice).
export async function libraryPage(organisationId: string, query: string, askedPage: string | undefined, timeZone: string | null, hidden: readonly string[], wholeTotal?: number) {
  const terms = (await db.term.findMany({ where: { organisationId }, orderBy: { code: "asc" }, include: { aliases: true } })).map(termOf);
  const variants = searchVariants(query, terms);
  const total = variants.length === 0 && wholeTotal != null ? wholeTotal : await libraryCount(organisationId, variants, hidden);
  const page = pageOf(askedPage, total, LIBRARY_PAGE);
  const list = await libraryEntries(organisationId, variants, page * LIBRARY_PAGE, LIBRARY_PAGE, hidden);
  const certIds = list.filter((e) => e.src === "C").map((e) => e.id);
  const groups = list.filter((e) => e.src === "A").map((e) => {
    const [awardId, kind, version] = e.id.split(":");
    return { awardId, kind: kind as keyof typeof DOCUMENT_LABEL, version: Number(version) };
  });
  const [certs, docs] = await Promise.all([
    certIds.length
      ? db.certificate.findMany({ where: { id: { in: certIds } }, select: { id: true, kind: true, number: true, sequence: true, issuedAt: true, issueSnapshot: true, contract: { select: { id: true, number: true } }, documents: { select: { language: true, templateName: true, templateFormCode: true, templateRevisionDate: true, templateBodyVersion: true } }, copies: { select: { despatchedOn: true, ackRequired: true, acknowledgedOn: true } } } })
      : Promise.resolve([]),
    groups.length ? db.awardDocument.findMany({ where: { OR: groups }, select: { awardId: true, kind: true, version: true, language: true, templateName: true, templateFormCode: true, templateRevisionDate: true, templateBodyVersion: true, award: { select: { reference: true, awardeeName: true } } } }) : Promise.resolve([]),
  ]);
  const rows: LibraryRow[] = list.flatMap((e): LibraryRow[] => {
    if (e.src === "C") {
      const c = certs.find((x) => x.id === e.id);
      if (!c) return [];
      const d = c.documents[0];
      return [
        {
          id: c.id,
          at: e.at,
          source: "CERTIFICATE",
          href: `/projects/${c.contract.id}/certificates/${c.id}?tab=print`,
          kindEn: `${KIND_WORDS[c.kind].en}${c.sequence ? ` ${c.sequence}` : ""}`,
          number: c.number,
          ofEn: `Contract ${c.contract.number}`,
          form: { name: d?.templateName ?? "", formCode: d?.templateFormCode ?? "", revisionDate: d?.templateRevisionDate ? storedDay(d.templateRevisionDate) : null, version: d?.templateBodyVersion ?? 0 },
          languages: c.documents.map((x) => x.language as "EN" | "MS"),
          issuedOn: (c.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? storedDay(c.issuedAt!),
          copies: { total: c.copies.length, notSent: c.copies.filter((x) => !x.despatchedOn).length, ackAwaited: c.copies.filter((x) => x.despatchedOn && x.ackRequired && !x.acknowledgedOn).length },
        },
      ];
    }
    const [awardId, kind, version] = e.id.split(":");
    const mine = docs.filter((d) => d.awardId === awardId && d.kind === kind && d.version === Number(version));
    const d = mine[0];
    return [
      {
        id: e.id,
        at: e.at,
        source: "AWARD_DOCUMENT",
        href: `/awards/${awardId}?tab=instrument`,
        kindEn: `${DOCUMENT_LABEL[kind as keyof typeof DOCUMENT_LABEL]}${Number(version) > 1 ? `, version ${version}` : ""}`,
        number: null,
        ofEn: d ? `Award ${d.award.reference} · ${d.award.awardeeName}` : "An award",
        form: { name: d?.templateName ?? "", formCode: d?.templateFormCode ?? "", revisionDate: d?.templateRevisionDate ? storedDay(d.templateRevisionDate) : null, version: d?.templateBodyVersion ?? 0 },
        languages: mine.map((x) => x.language as "EN" | "MS"),
        issuedOn: dayOf(e.at, timeZone),
        copies: null,
      },
    ];
  });
  return { rows, total, page, variants };
}

/// Code review S-1 (residual): only the columns a routing sheet is drawn from (pin-context.ts `SheetSource`), and the
/// list's own, never the certificate page's whole include.
const sheetSelect = {
  id: true,
  kind: true,
  routingSnapshot: true,
  computedSnapshot: true,
  routingReceivedOn: true,
  overrides: { select: { fieldKey: true, computed: true, overridden: true, justification: true, personName: true, recordedAt: true }, orderBy: { recordedAt: "asc" as const } },
  approvalInstances: { select: { id: true, status: true, openedAt: true, createdAt: true, steps: { select: { sequence: true, roleLabel: true, actingRoleLabel: true, act: true, committeeCode: true, decision: true, decidedByName: true, decidedOn: true, receivedOn: true }, orderBy: { sequence: "asc" as const } } }, orderBy: [{ openedAt: "asc" as const }, { createdAt: "asc" as const }] },
  routingChecks: { select: { iteration: true, defOrder: true, personName: true, on: true, note: true }, orderBy: [{ iteration: "asc" as const }, { defOrder: "asc" as const }] },
  contract: { select: { id: true, number: true } },
} satisfies Prisma.CertificateSelect;

/**
 * Every open sheet on a contract not cancelled, drawn and judged over the whole set, in the register's order (code
 * review S-1, residual): the counts every tab's header and warning read, and the list the Routing sheets tab pages.
 */
export async function openSheetsJudged(organisationId: string, today: string, contractId?: string) {
  const certs = await db.certificate.findMany({ where: { ...openSheetsWhere(organisationId, false), ...(contractId ? { contractId } : {}) }, select: sheetSelect });
  const sheets = certs
    .map((c) => ({ c, sheet: sheetOf(c, today) }))
    .filter((x): x is { c: (typeof certs)[number]; sheet: NonNullable<ReturnType<typeof sheetOf>> } => x.sheet != null)
    .sort((a, b) => sheetOrder({ date1: a.sheet.date1, id: a.c.id }, { date1: b.sheet.date1, id: b.c.id }));
  return { sheets, counts: sheetCounts(sheets.map((x) => x.sheet)) };
}

/// One contract's Documents tab header (AC-16): the copies still not sent and the routing sheets still open, each with the first certificate to go to. The sheets are judged against
/// the target only where the day is known (`today` null: the time zone is not set, so overTarget is null and nothing is called late, and the open count is the database's own).
export async function contractDocumentFacts(organisationId: string, contractId: string, today: string | null) {
  // The register's own "issued, on a contract not cancelled" reading (`issuedCopiesWhere`), narrowed to the contract and to the copies not sent.
  const unsent = { ...issuedCopiesWhere(organisationId, false, contractId), despatchedOn: null };
  const [notSent, firstUnsent, judged] = await Promise.all([
    db.issuedCopy.count({ where: unsent }),
    db.issuedCopy.findFirst({ where: unsent, orderBy: [{ certificate: { issuedAt: "asc" } }, { copyNo: "asc" }], select: { certificateId: true } }),
    today ? openSheetsJudged(organisationId, today, contractId) : Promise.resolve(null),
  ]);
  // Without a day nothing is judged, so the open sheets are counted by the database alone (no whole-set read).
  const [open, firstOpen] = judged
    ? [judged.counts.open, judged.sheets[0]?.c.id ?? null]
    : await Promise.all([
        db.certificate.count({ where: { ...openSheetsWhere(organisationId, false), contractId } }),
        db.certificate.findFirst({ where: { ...openSheetsWhere(organisationId, false), contractId }, orderBy: [{ routingReceivedOn: "asc" }, { id: "asc" }], select: { id: true } }).then((x) => x?.id ?? null),
      ]);
  return {
    notSent,
    firstUnsentCertificateId: firstUnsent?.certificateId ?? null,
    sheetsOpen: open,
    overTarget: judged ? judged.counts.overTarget : null,
    firstOpenCertificateId: firstOpen,
  };
}
