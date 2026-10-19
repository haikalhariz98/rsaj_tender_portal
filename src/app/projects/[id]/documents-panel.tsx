import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import Link from "next/link";

import { DataList } from "@/components/data-list";
import { FilesIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { distributionState } from "@/lib/certificate/distribution";
import { CERT_WORDS, KIND_WORDS, STATUS_TONE, STATUS_WORDS } from "@/lib/certificate/labels";
import { contractDocumentFacts } from "@/lib/certificate/register";
import { CERTIFICATES_PAGE, certificatesOfContract } from "@/lib/certificate/repo";
import { CERTIFICATE_STATUSES } from "@/lib/certificate/types";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";

const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;

/**
 * The contract's Documents tab (6.14 increment 1, plan §5): every certificate of the contract, by kind and
 * where it stands, newest first, paged. Each opens on its own page. Certificates are raised by the
 * post-award modules (a delegation's letters under Team; the advance, interim, warning and non-completion certificates
 * under Payments; a variation's application, instruction and order, and the adjustments of the contract sum, under
 * Variations), and the tab says what raises them; none is raised from here.
 */
export async function DocumentsPanel({ contractId, page, facts }: { contractId: string; page: number; facts: Awaited<ReturnType<typeof contractDocumentFacts>> }) {
  const { rows, total } = await certificatesOfContract(contractId, page);
  const pages = Math.ceil(total / CERTIFICATES_PAGE);
  const sheetsText = `${facts.sheetsOpen} ${facts.sheetsOpen === 1 ? "routing sheet" : "routing sheets"} open${facts.overTarget == null ? " (past target not judged: the time zone is not set)" : ` (${facts.overTarget} past target)`}`;
  const copiesText = `${facts.notSent} ${facts.notSent === 1 ? "copy" : "copies"} not sent`;
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<FilesIcon size={17} />} title={<Say words={P.certificates} />} divided={false} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 pb-4 text-[13.5px] text-ink-2 sm:px-6">
        {facts.firstUnsentCertificateId ? <Link href={`/projects/${contractId}/certificates/${facts.firstUnsentCertificateId}?tab=distribution`} className="font-semibold hover:underline">{copiesText}</Link> : <span>{copiesText}</span>}
        {facts.firstOpenCertificateId ? <Link href={`/projects/${contractId}/certificates/${facts.firstOpenCertificateId}?tab=routing`} className="font-semibold hover:underline">{sheetsText}</Link> : <span>{sheetsText}</span>}
      </div>
      <DataList
        flat
        selectable={false}
        exportName="certificates"
        searchPlaceholder="Search by kind or number"
        emptyTitle="No certificates yet"
        filters={[{ key: "status", label: "Status", order: CERTIFICATE_STATUSES.map((s) => STATUS_WORDS[s].en) }]}
        rowAction={{ label: "Open", hrefTemplate: `/projects/${contractId}/certificates/{id}` }}
        rowOpens
        stackBelow="xl"
        columns={[
          { key: "certificate", label: "Certificate", sortable: true, mobile: "primary" },
          { key: "status", label: "Status", width: "190px", sortable: true, mobile: "meta" },
          { key: "date", label: "Dated", width: "160px", mobile: "meta" },
          { key: "copies", label: "Distribution", width: "220px", mobile: "meta" },
        ]}
        rows={rows.map((r) => {
          const copies = distributionState(r.copies.map((c) => ({ mandatory: !!c.mandatory, ackRequired: !!c.ackRequired, despatchedOn: c.despatchedOn ? storedDay(c.despatchedOn) : null, acknowledgedOn: c.acknowledgedOn ? storedDay(c.acknowledgedOn) : null })));
          const tone = TONE[STATUS_TONE[r.status]];
          return {
            id: r.id,
            search: [KIND_WORDS[r.kind].en, r.number ?? "", STATUS_WORDS[r.status].en].join(" "),
            sortKeys: { certificate: `${KIND_WORDS[r.kind].en} ${r.sequence ?? ""}`, status: CERTIFICATE_STATUSES.indexOf(r.status) },
            cells: {
              certificate: { kind: "stack", title: `${KIND_WORDS[r.kind].en}${r.sequence ? ` ${r.sequence}` : ""}`, sub: r.number ?? CERT_WORDS.numberOnIssue.en },
              status: { kind: "badge", text: STATUS_WORDS[r.status].en, ...(tone ? { tone } : {}) },
              date: { kind: "text", text: r.certificateDate ? formatDate(storedDay(r.certificateDate)) : r.status === "VOID" ? "Never dated" : "Set when signed", dim: !r.certificateDate },
              copies: { kind: "text", text: r.status !== "ISSUED" ? "Not issued" : copies.distributed ? (copies.awaitingAck ? `Sent · ${copies.awaitingAck} acknowledgement${copies.awaitingAck === 1 ? "" : "s"} awaited` : "Sent") : `${copies.undespatchedMandatory} mandatory to send`, dim: r.status !== "ISSUED" },
            },
          };
        })}
      />
      {pages > 1 && (
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
          <span>
            Certificates {page * CERTIFICATES_PAGE + 1}–{Math.min(total, (page + 1) * CERTIFICATES_PAGE)} of {total}. Search covers this page.
          </span>
          <span className="flex gap-2">
            {page > 0 && <ButtonLink href={`/projects/${contractId}?tab=documents&page=${page - 1}`} size="sm" variant="ghost">Previous</ButtonLink>}
            {page + 1 < pages && <ButtonLink href={`/projects/${contractId}?tab=documents&page=${page + 1}`} size="sm" variant="ghost">Next</ButtonLink>}
          </span>
        </CardFooter>
      )}
    </Card>
  );
}
