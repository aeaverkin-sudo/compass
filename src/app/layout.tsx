import type { Metadata, Viewport } from "next";
import { AppShell } from "@/shared/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass",
  description: "Personal portfolio and professional networking",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Compass",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#faf9f7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-full bg-[#faf9f7] font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
