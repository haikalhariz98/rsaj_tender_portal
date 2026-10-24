"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";

/// A failed read. The filters stay in the address, so Try again repeats the same view. (This Next version names the callback `retry`.)
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <Card>
      <EmptyState title="These figures could not be loaded" action={<Button onClick={() => retry()}>Try again</Button>} />
    </Card>
  );
}
