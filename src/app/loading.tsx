import { PageSkeleton } from "@/components/ui/skeleton";

/// Every screen without its own loading shape shows the page frame while it renders; the shell stays put.
export default function Loading() {
  return <PageSkeleton />;
}
