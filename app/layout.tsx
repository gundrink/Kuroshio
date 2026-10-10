import type { Metadata } from "next";
import { Manrope, Syne } from "next/font/google";
import { AppKitProvider } from "@/lib/appkit";
import "./globals.css";

const ui = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
});

const display = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Pool Ninja",
  description: "Four devnet stablecoins. One reserve. Pool Ninja.",
  icons: { icon: "/poolninja.png", apple: "/poolninja.png" },
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
