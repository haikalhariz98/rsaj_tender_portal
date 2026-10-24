import { requireStaff } from "@/app/_auth/actor";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Settings" };

/// Where Settings' front pages send someone who may not open them (`requireSettingsReader`): said in words rather than a silent trip home.
export default async function NoSettingsAccessPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Settings" />
      <EmptyState title="You don't have access to Settings" action={<ButtonLink href="/" variant="secondary" size="sm">Back to Home</ButtonLink>} />
    </>
  );
}
