"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function PrintButton({ icon }: { icon: ReactNode }) {
  return (
    <Button variant="secondary" size="sm" icon={icon} onClick={() => window.print()}>
      Print
    </Button>
  );
}
