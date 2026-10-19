import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { AUTH_WORDS } from "@/lib/auth/words";
import { issueFormToken } from "@/lib/auth/form-secret";
import { SUPPLIER_DATA_EXPORT } from "@/lib/auth/routes";
import { formatOrgDateTime } from "@/lib/format";
import { exportSupplierData } from "@/lib/portal/data-export-store";
import { EXPORT_PAGE_WORDS } from "@/lib/suppliers/data-export-words";

import { requireSupplier } from "../../../_auth/supplier";
import { DataExportView } from "./data-view";

export const metadata: Metadata = { title: EXPORT_PAGE_WORDS.title };
export const dynamic = "force-dynamic";

/**
 * A supplier's own data on one printable page (N2, the PDPA right of access, ruling 1875(8)). The supplier is the session's and no id is read. Opening this page IS an export and writes
 * its audit row, which is why every link to it is `prefetch={false}`, and why a page another site sent the browser to is refused before anything is written. The links carry tokens made
 * here: one for the file, one for each document's download. The file is a plain anchor, never a client-side Link: a Link fetches the URL itself before the browser does, and each fetch is an export.
 */
export default async function SupplierDataPage() {
  const actor = await requireSupplier();
  if ((await headers()).get("sec-fetch-site") === "cross-site") notFound();
  const out = await exportSupplierData(actor, "PAGE");
  if (!out) notFound();
  const fileToken = issueFormToken("registration");
  const downloadToken = issueFormToken("data-export");
  const prepared = formatOrgDateTime(new Date(out.export.generatedAt), actor.organisationTimeZone);
  return (
    <>
      <PageHeader
        title={EXPORT_PAGE_WORDS.title}
        subtitle={`${out.export.supplier.name} · ${out.export.supplier.reference} · ${prepared}`}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <PrintButton words={EXPORT_PAGE_WORDS.print} />
            {downloadToken && (
              <a className={buttonClass("primary", "sm")} href={`${SUPPLIER_DATA_EXPORT.file}?t=${encodeURIComponent(downloadToken)}`} download>
                {EXPORT_PAGE_WORDS.download}
              </a>
            )}
          </div>
        }
      />
      {!downloadToken && (
        <div className="mb-4 print:hidden">
          <Callout tone="warn">{AUTH_WORDS.portalFormsClosed.en}</Callout>
        </div>
      )}
      <DataExportView data={out.export} fileToken={fileToken} liveLinks={out.liveLinks} timeZone={actor.organisationTimeZone} />
    </>
  );
}
