import { requireSettingsReader, SettingsSectionRoute } from "../section-route";

export const dynamic = "force-dynamic";

export const metadata = { title: "System settings" };

export default async function Page() {
  const actor = await requireSettingsReader();
  return <SettingsSectionRoute slug="system" actor={actor} />;
}
