import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { SupabaseSession } from "@/shared/components/supabase-session";
import "./globals.css";

const archivo = Archivo({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "Compass",
  description: "Compass — landing",
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
    <html lang="ru" className={`h-full ${archivo.variable}`}>
      <body className="min-h-full font-sans antialiased">
        <AppResetGate />
        <SupabaseSession />
        {children}
      </body>
    </html>
  );
}
