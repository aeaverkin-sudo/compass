import type { Metadata, Viewport } from "next";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { PdfPreviewHost } from "@/shared/components/pdf-preview-host";
import { SupabaseSession } from "@/shared/components/supabase-session";
import { VisualBottom } from "@/shared/components/visual-bottom";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADED",
  description: "ADED",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F9F8F6",
  interactiveWidget: "overlays-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <AppResetGate />
        <SupabaseSession />
        <VisualBottom />
        <PdfPreviewHost />
        {children}
      </body>
    </html>
  );
}
