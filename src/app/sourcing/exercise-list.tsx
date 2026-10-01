"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

import { DataList } from "@/components/data-list";
import { GlobeIcon } from "@/components/icons";
import { Card, CardHeader } from "@/components/ui/card";

/**
 * The exercises card: its title says which list is showing. The list owns the selected view
 * and reports it, so the heading above never reads "All exercises" over a filtered list.
 */
export function ExerciseList({ footer, ...list }: { footer?: ReactNode } & ComponentProps<typeof DataList>) {
  const [view, setView] = useState(list.initialView && list.views?.some((v) => v.id === list.initialView) ? list.initialView : "");
  /// The chosen view is in the address (?view=), so a link to "Open for purchase" opens that list and a reload keeps it.
  const choose = (id: string) => {
    setView(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("view", id);
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  };
  const chosen = list.views?.find((v) => v.id === view) ?? null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<GlobeIcon size={17} />}
        title={chosen ? chosen.label : "All exercises"}
        subtitle={chosen?.about ?? "Listed by the day each exercise was opened, newest first, until you sort by a column. Search finds an exercise by its reference or its requisition's."}
        divided={false}
      />
      <DataList {...list} onViewChange={choose} />
      {footer}
    </Card>
  );
}
