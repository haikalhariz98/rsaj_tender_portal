import { redirect } from "next/navigation";

import { requireStaff } from "@/app/_auth/actor";
import { SectionPage } from "@/components/setup/section-page";
import { db } from "@/lib/db";
import { formatOrgDay } from "@/lib/format";
import { SETTINGS_SECTIONS } from "@/lib/nav";
import { loadChecklist } from "@/lib/setup/checklist-repo";
import type { SettingsSection } from "@/lib/setup/types";

/// Who may open Settings' front pages: the administrator, or anyone who drafts, issues or reads the audit trail. Anyone else goes home.
export async function requireSettingsReader() {
  const actor = await requireStaff();
  if (!(actor.isAdministrator || ["configuration.draft", "configuration.issue", "audit.read"].some((k) => actor.permissions.has(k as never)))) redirect("/");
  return actor;
}

/// The page of one Settings section; each section's `page.tsx` asks `requireSettingsReader` first, then renders this with its slug.
export async function SettingsSectionRoute({ slug, actor }: { slug: SettingsSection; actor: Awaited<ReturnType<typeof requireSettingsReader>> }) {
  const { items } = await loadChecklist(db, actor.organisationId);
  const section = SETTINGS_SECTIONS.find((s) => s.slug === slug)!;
  return <SectionPage section={section} items={items} at={(d) => formatOrgDay(d, actor.organisationTimeZone)} />;
}
