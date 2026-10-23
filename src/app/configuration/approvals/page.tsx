import { requireSettingsReader, SettingsSectionRoute } from "../section-route";

export const dynamic = "force-dynamic";

export const metadata = { title: "Approvals settings" };

export default async function Page() {
  const actor = await requireSettingsReader();
  return <SettingsSectionRoute slug="approvals" actor={actor} />;
}
