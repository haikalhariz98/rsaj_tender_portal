import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/// The page at its final sizes (six tiles, two chart cards), so nothing jumps when the figures arrive.
export default function Loading() {
  return (
    <LoadingRegion className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-card" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-72 rounded-card" />
        ))}
      </div>
    </LoadingRegion>
  );
}
