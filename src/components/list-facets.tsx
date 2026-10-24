"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import type { FacetSpec } from "@/lib/list-facets";

/// The dashboard's drill-down filters on a list (I-6): one dropdown each, kept in the address. Choosing goes to the option's own address.
export function ListFacets({ facets }: { facets: FacetSpec[] }) {
  const router = useRouter();
  return (
    <>
      {facets.map((f) => (
        <Select
          key={f.key}
          variant="chip"
          aria-label={f.label}
          chipLabel={f.label}
          searchable={f.options.length > 8}
          value={f.value}
          onChange={(e) => {
            const href = f.options.find((o) => o.value === e.target.value)?.href;
            if (href) router.push(href);
          }}
        >
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
    </>
  );
}
