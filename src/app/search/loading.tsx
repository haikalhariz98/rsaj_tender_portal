import { ListPageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <ListPageSkeleton chips={0} toolbar={false} header={{ tight: true, actions: 0 }} />;
}
