import Link from "next/link";
import { Fragment } from "react";

import { requireStaff } from "@/app/_auth/actor";
import { DataList, type Row } from "@/components/data-list";
import { SearchIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/lib/db";
import { Q_MIN } from "@/lib/list-query";
import { search } from "@/lib/search/store";
import type { SearchHit } from "@/lib/search/types";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const toRow = (h: SearchHit): Row => ({
  id: `${h.entity}-${h.id}`,
  search: "",
  cells: {
    title: { kind: "link", text: h.title, href: h.href, ...(h.sub ? { sub: h.sub } : {}) },
    status: h.status ? { kind: "badge", text: h.status.text, tone: h.status.tone } : { kind: "text", text: "" },
  },
});
const COLUMNS = [
  { key: "title", label: "Record" },
  { key: "status", label: "Status", width: "200px" },
];

export default async function SearchPage(props: PageProps<"/search">) {
  const actor = await requireStaff();
  const raw = (await props.searchParams).q;
  const text = (Array.isArray(raw) ? raw[0] : raw)?.trim().replace(/\s+/g, " ") ?? "";
  const tooShort = text.length < Q_MIN;
  const result = tooShort ? null : await search(db, actor, text);
  const nothing = result && !result.caseGroup && result.groups.length === 0;

  return (
    <>
      <PageHeader title="Search" subtitle={text ? `“${text}”` : undefined} className="mb-4" />

      {!result && <EmptyState icon={<SearchIcon size={22} />} title="Type at least 2 characters." />}
      {nothing && <EmptyState icon={<SearchIcon size={22} />} title={`Nothing matches “${text}”.`} />}

      <div className="space-y-4">
        {result?.caseGroup && (
          <Card>
            <CardHeader title="The whole case" subtitle={result.caseGroup.requisition.sub} />
            <ul className="divide-y divide-line/60">
              <CaseLine hit={result.caseGroup.requisition} level={0} />
              {result.caseGroup.exercises.map((e) => (
                <Fragment key={e.hit.id}>
                  <CaseLine hit={e.hit} level={1} />
                  {e.projects.map((p) => <CaseLine key={p.id} hit={p} level={2} />)}
                </Fragment>
              ))}
              {result.caseGroup.projects.map((p) => <CaseLine key={p.id} hit={p} level={1} />)}
            </ul>
          </Card>
        )}

        {result?.groups.map((g) => (
          <Card key={g.entity}>
            <CardHeader title={g.label} subtitle={g.total > g.hits.length ? `${g.hits.length} of ${g.total}` : `${g.total}`} />
            <DataList columns={COLUMNS} rows={g.hits.map(toRow)} toolbar={false} selectable={false} flat paging={false} searchable={false} />
            {g.total > g.hits.length && (
              <CardFooter className="text-[13px]">
                <Link href={g.seeAllHref} className="font-semibold">
                  See all {g.total} in {g.label}
                </Link>
              </CardFooter>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

const INDENT = ["pl-5", "pl-10", "pl-16"] as const;

function CaseLine({ hit, level }: { hit: SearchHit; level: 0 | 1 | 2 }) {
  return (
    <li className={`flex items-center justify-between gap-3 py-3 pr-5 ${INDENT[level]}`}>
      <Link href={hit.href} className="min-w-0 truncate font-semibold text-brand-700 no-underline hover:text-brand-800 hover:underline">
        {hit.title}
        {hit.sub && <span className="ml-2 font-normal text-ink-3">{hit.sub}</span>}
      </Link>
      {hit.status && <Badge tone={hit.status.tone}>{hit.status.text}</Badge>}
    </li>
  );
}
