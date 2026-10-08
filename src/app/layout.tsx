import type { Metadata, Viewport } from "next";
import { screenMeasureScript } from "@main/layout";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { MonochromeSync } from "@/shared/components/monochrome-sync";
import { PdfPreviewHost } from "@/shared/components/pdf-preview-host";
import { SupabaseSession } from "@/shared/components/supabase-session";
import { TabPrefetch } from "@/shared/components/tab-prefetch";
import { TrialLock } from "@/shared/components/trial-lock";
import { VisualBottom } from "@/shared/components/visual-bottom";
import "./globals.css";

/** White until the head script has measured. The library height move waits for that first measure. */
const MEASURE_CSS = `
html{height:var(--app-h,100svh)!important;bottom:auto!important}
html:not(.compass-sized),html:not(.compass-sized) body{background:#fff!important}
html:not(.compass-sized) .compass-layer,html:not(.compass-sized) .compass-sky-band{visibility:hidden}
html:not(.compass-settled) .compass-card-library{transition:none!important}
main.compass-main.fixed.top-0{height:var(--app-h,100svh)}
div.compass-main.fixed.inset-y-0:not([class*="overflow"]){height:var(--app-h,100svh);bottom:auto;background:#fff}
`;

export const metadata: Metadata = {
  title: "ADED",
  description: "ADED",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "ADED", statusBarStyle: "default" },
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: screenMeasureScript() }} />
        <style dangerouslySetInnerHTML={{ __html: MEASURE_CSS }} />
      </head>
      <body className="min-h-full font-sans antialiased">
        <AppResetGate />
        <MonochromeSync />
        <SupabaseSession />
        <VisualBottom />
        <PdfPreviewHost />
        <TabPrefetch />
        {children}
        <TrialLock />
      </body>
    </html>
  );
}
