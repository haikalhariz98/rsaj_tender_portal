"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LogOutIcon } from "@/components/icons";
import { postPortal } from "@/components/auth/portal-form";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/feedback";

/**
 * The two buttons of the supplier's account page that post a JSON form (Phase 4a): "I have seen this" for the reset notice, and "Sign out everywhere". The public copy
 * takes no server action, so each posts to its route with the page's signed token and then refreshes (or goes where the answer says).
 */
export function AccountButton({ path, formToken, label, variant = "secondary", icon }: { path: string; formToken: string; label: string; variant?: "secondary" | "destructive"; icon?: "logout" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant={variant}
        size="sm"
        aria-busy={pending || undefined}
        icon={icon === "logout" ? <LogOutIcon size={15} /> : undefined}
        onClick={() =>
          !pending &&
          start(async () => {
            const state = await postPortal(path, formToken, {});
            if (!state.ok) return setError(state.message ?? "That did not work. Try again.");
            if (state.href) router.replace(state.href);
            router.refresh();
          })
        }
      >
        {label}
      </Button>
      {error && <Callout tone="err">{error}</Callout>}
    </span>
  );
}
