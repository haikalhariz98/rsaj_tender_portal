"use client";

import { PrinterIcon } from "@/components/icons";
import { Bi } from "@/components/ui/bilingual";
import { Button } from "@/components/ui/button";
import type { Words } from "@/lib/contract/labels";

/// Prints the page it is on. The browser's own print dialog does it; nothing is sent anywhere. Hidden on paper.
export function PrintButton({ words }: { words: Words | string }) {
  return (
    <Button variant="secondary" size="sm" icon={<PrinterIcon size={15} />} onClick={() => window.print()} className="print:hidden">
      {typeof words === "string" ? words : <Bi words={words} inline inherit />}
    </Button>
  );
}
