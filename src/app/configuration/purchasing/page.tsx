import { requireSettingsReader, SettingsSectionRoute } from "../section-route";

export const dynamic = "force-dynamic";

export const metadata = { title: "Purchasing & tenders" };

export default async function Page() {
  const actor = await requireSettingsReader();
  return <SettingsSectionRoute slug="purchasing" actor={actor} />;
}
