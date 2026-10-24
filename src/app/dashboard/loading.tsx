import { Card } from "@/components/ui/card";

/// The page at its final sizes (six tiles, two chart cards), so nothing jumps when the figures arrive.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading the Dashboard" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 min-[1440px]:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-card bg-sunken" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="h-72 animate-pulse bg-sunken" />
        ))}
      </div>
    </div>
  );
}
