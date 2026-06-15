import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BriefcaseProvider } from "@/components/briefcase/BriefcaseProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.swfldatagulf.com"),
  title: {
    default: "SWFL Data Gulf — Southwest Florida Intelligence",
    template: "%s — SWFL Data Gulf",
  },
  description:
    "Public intelligence for Lee and Collier County operators — flood, freight, permits, rents, demographics, and macro signal, in one read.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* BriefcaseProvider owns the anonymous draft globally (A-2) so the unified
            pill files into it on every page, on or off /r/*. The highlighter
            conversation thread stays per-/r/* page (HighlighterProvider). */}
        <BriefcaseProvider>{children}</BriefcaseProvider>
      </body>
    </html>
  );
}
