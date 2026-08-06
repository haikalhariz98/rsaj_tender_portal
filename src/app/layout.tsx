import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { activeVersionLabel } from "@/lib/dal/load";
import { ORGANISATION_CODE, ORGANISATION_NAME } from "@/lib/org";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perolehan",
  description: "End-to-end procurement and contract administration",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The DAL issue in force is shown in the sidebar on every screen — which
  // authority version you are working under is never more than a glance away.
  // The database may not be up yet on a first run, so this must not break the shell.
  const dalLabel = await activeVersionLabel(ORGANISATION_CODE).catch(() => null);

  return (
    <html lang="en" className={inter.variable} style={{ colorScheme: "light" }}>
      <body>
        <div className="app">
          <Sidebar organisation={ORGANISATION_NAME} dalLabel={dalLabel} />
          <div className="main">
            <Topbar organisation={ORGANISATION_NAME} />
            <main className="content">
              <div className="container">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
