import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AppShell } from "@/components/shell/app-shell";
import { loadShell } from "@/lib/shell";
import { currentStaffOrNull } from "./_auth/actor";
import { signOutAction } from "./sign-in/actions";
import { ORGANISATION_STRAPLINE } from "@/lib/org";
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
  const shell = await loadShell({ counts: actor != null && !portalOnly });
  // Who is signed in comes from the session, read from the database on this request, never from the environment or from whoever sorts first.
  const user = actor ? { name: actor.personName, jobTitle: actor.jobTitle } : null;

  return (
    <html lang="en" className={jakarta.variable} style={{ colorScheme: "light" }}>
      <body>
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
      </body>
    </html>
  );
}
