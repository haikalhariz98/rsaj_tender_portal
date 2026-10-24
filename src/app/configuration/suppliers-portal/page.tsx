import { requireSettingsReader, SettingsSectionRoute } from "../section-route";

export const dynamic = "force-dynamic";

export const metadata = { title: "Suppliers & portal" };

export default async function Page() {
  const actor = await requireSettingsReader();
  return <SettingsSectionRoute slug="suppliers-portal" actor={actor} />;
}
