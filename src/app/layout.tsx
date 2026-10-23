import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { DialogFocus } from "@/components/ui/dialog-focus-mount";
import { ActorProvider } from "@/components/auth/actor-context";
import { AppShell } from "@/components/shell/app-shell";
import { maySeeSettings } from "@/lib/nav";
import { loadShell } from "@/lib/shell";
import { currentStaffOrNull } from "./_auth/actor";
import { currentSupplierOrNull } from "./_auth/supplier";
import { staffCounts } from "./_auth/worklist";
import { signOutAction } from "./sign-in/actions";
import { deploymentOrganisation } from "@/lib/portal/deployment";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Every page sets only its own name (`metadata.title = "Requisitions"`); the template makes it "Requisitions · Perolehan" (SP-20).
  title: { template: "%s · Perolehan", default: "Perolehan" },
  description: "Procurement and contract administration",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shell must render before anything is configured, so this never throws.
  const actor = await currentStaffOrNull();
  // The public copy serves strangers: it carries none of the staff side's counts, and no way over to it. Nor does the frame show counts to anyone not signed in.
  const portalOnly = surfaceOf(process.env[SURFACE_ENV]) === "public";
  // The frame names the signed-in person's organisation; before sign-in, and on the public copy, the deployment's one (ADR 0034 D10).
  const organisationId = actor?.organisationId ?? (await deploymentOrganisation().catch(() => null))?.id ?? null;
  const shell = await loadShell({ organisationId });
  // The steps waiting for the person and their unread notices (Phase 3c): their own, never anyone else's.
  const personal = actor != null && !portalOnly ? await staffCounts(actor) : {};
  // Who is signed in comes from the session, read from the database on this request, never from the environment or from whoever sorts first.
  // On the public copy the one who can be signed in is a supplier's contact (Phase 4a), and the frame names them and their supplier: the same session, read once.
  const supplier = portalOnly ? await currentSupplierOrNull() : null;
  const user = actor ? { name: actor.personName, jobTitle: actor.jobTitle, kind: "staff" as const } : supplier ? { name: supplier.displayName, jobTitle: supplier.supplierName, kind: "supplier" as const } : null;

  return (
    <html lang="en" className={jakarta.variable} style={{ colorScheme: "light" }}>
      <body>
        <DialogFocus />
        <ActorProvider name={actor?.personName ?? null} personId={actor?.personId ?? null}>
          <AppShell
            organisation={shell.organisation}
            showSettings={actor != null && maySeeSettings(actor)}
            counts={portalOnly ? {} : personal}
            user={user}
            portalOnly={portalOnly}
            supplierSignedIn={supplier != null}
            signOut={signOutAction}
          >
            {children}
          </AppShell>
        </ActorProvider>
      </body>
    </html>
  );
}
