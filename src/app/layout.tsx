import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saans", template: "%s | Saans" },
  description: "Plan household routines and community activities around city air pollution.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <nav className="content flex flex-wrap items-center justify-between gap-x-6" aria-label="Main">
            <Link className="wordmark" href="/">Saans</Link>
            <div className="flex flex-wrap gap-x-5">
              <Link href="/plan">Plan</Link>
              <Link href="/sources">Sources</Link>
            </div>
          </nav>
        </header>
        <main id="main" tabIndex={-1} className="content page">{children}</main>
      </body>
    </html>
  );
}
