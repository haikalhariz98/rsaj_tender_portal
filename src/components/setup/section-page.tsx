import Link from "next/link";

import { ChevronRight } from "@/components/icons";
import { ChecklistCard } from "@/components/setup/checklist";
import { SectionBanner } from "@/components/setup/section-banner";
import { Card, CardBody } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/ui/page-header";
import type { SettingsSectionDef } from "@/lib/nav";
import type { ChecklistItem } from "@/lib/setup/types";

/// One Settings section: its head and info popover, the banner of what still needs a value, the essentials (the section's checklist
/// rows) and, folded away below, a link to each of its other pages. The dates are formatted by the caller (`at`).
export function SectionPage({ section, items, at }: { section: SettingsSectionDef; items: ChecklistItem[]; at: (d: Date) => string }) {
  const title = section.label.en;
  const essentials = items.filter((i) => i.section === section.slug && i.kind !== "go-live");
  return (
    <>
      <PageHeader title={title} info={{ title, text: section.about }} />
      <SectionBanner items={essentials} />
      <div className="flex flex-col gap-6">
        <ChecklistCard title="Essentials" items={essentials} at={at} />
        <Card>
          <CardBody>
            <Disclosure title="Advanced">
              <ul className="-my-1">
                {section.advanced.map((a) => (
                  <li key={a.href}>
                    <Link href={a.href} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-[14px] text-ink hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                      {a.label}
                      <ChevronRight size={15} className="text-ink-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
