import { Badge } from "@/components/ui/badge";

/// The class project files take, read-only. Unset says what it blocks, as the bid-file row does: it is not a class of nothing.
export function ProjectClassValue({ classId, classes }: { classId: string | null; classes: { id: string; nameEn: string }[] }) {
  if (!classId) return <Badge tone="warn">Not set, nothing can be added to a project&apos;s documents</Badge>;
  return <>{classes.find((c) => c.id === classId)?.nameEn ?? <span className="text-ink-4">Not set</span>}</>;
}
