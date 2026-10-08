import type { Metadata } from "next";
import { Manrope, Newsreader } from "next/font/google";
import { AppKitProvider } from "@/lib/appkit";
import "./globals.css";

const ui = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
});

const display = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Kuroshio",
  description: "One book for every stablecoin on Solana devnet.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ui.variable} ${display.variable}`} suppressHydrationWarning>
        <AppKitProvider>{children}</AppKitProvider>
      </body>
    </html>
  );
}
