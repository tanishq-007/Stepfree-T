import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import HeaderNav from "@/components/HeaderNav";
import DemoSwitch from "@/components/DemoSwitch";
import "./globals.css";

export const metadata: Metadata = {
  title: "AccessPath AI — Step-free MBTA trips",
  description: "Know whether your MBTA subway trip is step-free before you travel.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:font-bold focus:shadow-card-lg"
        >
          Skip to main content
        </a>

        <header className="sticky top-0 z-40 border-b border-hairline bg-white/85 backdrop-blur-md">
          {/* flex-wrap: at 320 px the nav moves under the logo instead of causing sideways scrolling (WCAG 1.4.10). */}
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <Link href="/" className="group inline-flex items-center gap-3">
              <Logo />
              <span className="flex flex-col leading-none">
                <span className="text-lg font-extrabold tracking-tight text-ink">
                  AccessPath <span className="text-brand-700">AI</span>
                </span>
                <span className="mt-0.5 hidden text-xs font-medium text-ink-muted sm:block">
                  Step-free MBTA trips, in real time
                </span>
              </span>
            </Link>
            <HeaderNav />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>

        <footer className="mt-4 border-t border-hairline bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6">
            <DemoSwitch />
            <p className="mt-5 text-sm text-ink-muted">
              Data from the MBTA. Always check with station staff if you are unsure. This is a
              hackathon demonstration and not an official MBTA product.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
