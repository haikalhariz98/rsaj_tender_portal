import { requireSettingsReader, SettingsSectionRoute } from "../section-route";

export const dynamic = "force-dynamic";

export const metadata = { title: "Suppliers and portal settings" };

export default async function Page() {
  const actor = await requireSettingsReader();
  return <SettingsSectionRoute slug="suppliers-portal" actor={actor} />;
}
