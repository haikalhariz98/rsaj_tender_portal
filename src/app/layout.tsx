import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { ActorProvider } from "@/components/auth/actor-context";
import { AppShell } from "@/components/shell/app-shell";
import { loadShell } from "@/lib/shell";
import { currentStaffOrNull } from "./_auth/actor";
import { signOutAction } from "./sign-in/actions";
import { ORGANISATION_STRAPLINE } from "@/lib/org";
import { deploymentOrganisation } from "@/lib/portal/deployment";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perolehan",
  description: "Procurement and contract administration",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shell must render before anything is configured, so this never throws.
  const actor = await currentStaffOrNull();
  // The public copy serves strangers: it carries none of the staff side's counts, and no way over to it. Nor does the frame show counts to anyone not signed in.
  const portalOnly = surfaceOf(process.env[SURFACE_ENV]) === "public";
  // The frame names the signed-in person's organisation; before sign-in, and on the public copy, the deployment's one (ADR 0034 D10).
  const organisationId = actor?.organisationId ?? (await deploymentOrganisation().catch(() => null))?.id ?? null;
  const shell = await loadShell({ organisationId, counts: actor != null && !portalOnly });
  // Who is signed in comes from the session, read from the database on this request, never from the environment or from whoever sorts first.
  const user = actor ? { name: actor.personName, jobTitle: actor.jobTitle } : null;

  return (
    <html lang="en" className={jakarta.variable} style={{ colorScheme: "light" }}>
      <body>
        <ActorProvider name={actor?.personName ?? null} personId={actor?.personId ?? null}>
          <AppShell
            organisation={shell.organisation}
            strapline={ORGANISATION_STRAPLINE}
            counts={portalOnly ? {} : shell.counts}
            user={user}
            portalOnly={portalOnly}
            signOut={signOutAction}
          >
            {children}
          </AppShell>
        </ActorProvider>
      </body>
    </html>
  );
}
