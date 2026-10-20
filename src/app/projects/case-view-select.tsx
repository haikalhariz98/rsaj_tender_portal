"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";

export interface ViewGroup {
  label: string;
  options: { value: string; label: string; href: string }[];
}

/// The case list's one view picker: every option is a server-side view (or a register) with its count, and choosing one goes to the
/// address the old chip linked to, so `?view=` links keep working.
export function CaseViewSelect({ groups, current, label, chipLabel }: { groups: ViewGroup[]; current: string; label: string; chipLabel?: string }) {
  const router = useRouter();
  const hrefs = new Map(groups.flatMap((g) => g.options.map((o) => [o.value, o.href] as const)));
  return (
    <Select
      variant="chip"
      aria-label={label}
      chipLabel={chipLabel}
      searchable={false}
      value={current}
      onChange={(e) => {
        const href = hrefs.get(e.target.value);
        if (href) router.push(href);
      }}
    >
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
