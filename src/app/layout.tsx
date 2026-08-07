import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { loadShell } from "@/lib/shell";
import { ORGANISATION_NAME } from "@/lib/org";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Perolehan — Ranhill SAJ",
  description: "Procurement and contract administration",
  icons: { icon: "/ranhill-saj.png" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The shell must render even before the database is seeded, so this never throws.
  const shell = await loadShell();

  return (
    <html lang="en" className={inter.variable} style={{ colorScheme: "light" }}>
      <body>
        <div className="app">
          <Sidebar
            organisation={ORGANISATION_NAME}
            strapline="Procure to Pay · Johor"
            counts={shell.counts}
          />
          <div className="main">
            <Topbar organisation={ORGANISATION_NAME} user={shell.user} />
            <main className="content">
              <div className="container">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
