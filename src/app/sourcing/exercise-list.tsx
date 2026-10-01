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
  const [view, setView] = useState("");
  const chosen = list.views?.find((v) => v.id === view) ?? null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<GlobeIcon size={17} />}
        title={chosen ? chosen.label : "All exercises"}
        subtitle="Newest first. Search finds an exercise by its reference or its requisition's."
        divided={false}
      />
      <DataList {...list} onViewChange={setView} />
      {footer}
    </Card>
  );
}
