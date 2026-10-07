import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Simulated Life", template: "%s · Simulated Life" },
  description: "An AI council that deliberates for its Prime and grows into a simulated society.",
};

export const viewport: Viewport = { themeColor: "#070a1a", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} antialiased`}>
      <body className="font-sans">
        <div className="starfield" aria-hidden="true" />
        <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-50 rounded bg-panel-solid px-3 py-2">
          Skip to content
        </a>
        <div className="relative z-10 flex min-h-dvh flex-col">
          <Suspense fallback={<div className="h-[58px] border-b border-line" />}>
            <SiteHeader />
          </Suspense>
          <main id="main" className="mx-auto w-full max-w-[1500px] flex-1 px-3 pb-10 pt-4 sm:px-5">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-[1500px] px-5 pb-6 text-xs text-faint">
            Simulated Life — council members are AI models and inhabitants are simulations, not people or conscious beings. Costs are estimates.
          </footer>
        </div>
      </body>
    </html>
  );
}
