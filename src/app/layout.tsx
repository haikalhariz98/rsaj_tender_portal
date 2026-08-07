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
  // Only whether the application is configured at all, not which issue of the
  // authority limits is in force — that belongs on a record, not in the furniture.
  // The database may not be up on a first run, so this must not break the shell.
  const configured = Boolean(await activeVersionLabel(ORGANISATION_CODE).catch(() => null));

  return (
    <html lang="en" className={inter.variable} style={{ colorScheme: "light" }}>
      <body>
        <div className="app">
          <Sidebar
            organisation={ORGANISATION_NAME}
            department={configured ? "Jabatan Kontrak & Perolehan" : null}
          />
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
