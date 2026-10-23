import type { Metadata, Viewport } from "next";
import { COMPACT_BELOW_PX, COMPACT_HEADER_SCALE } from "@main/layout";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { MonochromeSync } from "@/shared/components/monochrome-sync";
import { PdfPreviewHost } from "@/shared/components/pdf-preview-host";
import { ServiceWorker } from "@/shared/components/service-worker";
import { SupabaseSession } from "@/shared/components/supabase-session";
import { TabPrefetch } from "@/shared/components/tab-prefetch";
import { TrialLock } from "@/shared/components/trial-lock";
import { VisualBottom } from "@/shared/components/visual-bottom";
import "./globals.css";

/**
 * One page height. A browser uses the small viewport, so the bar sits above Safari or Chrome.
 * The installed app uses the large viewport, the full glass. html is the same height there:
 * it is position:fixed and overflow:hidden, and a shorter html would clip the bar.
 * That root is sky, and the page shell is transparent, so the glass under the bar stays sky.
 * The card column above the bar stays white. A page with no bar stays white itself.
 */
const MEASURE_CSS = `
html{--shell:100svh}
html:not(.compass-sized),html:not(.compass-sized) body{background:#fff!important}
html:not(.compass-settled),html:not(.compass-settled) *,html:not(.compass-settled) *::before,html:not(.compass-settled) *::after{transition:none!important;animation:none!important}
main.compass-main,div.compass-main.fixed{height:var(--shell,100svh)}
@media (display-mode:standalone){
  html{--shell:100lvh;height:100lvh!important;bottom:auto!important;background:#c5e8f7!important}
  main.compass-main,div.compass-main.fixed{height:100lvh;background:transparent}
  main.compass-main:not(:has(.compass-sky-band)),div.compass-main.fixed:not(:has(.compass-sky-band)){background:#fff}
  main.compass-main:has(.compass-sky-band)>:not(.compass-sky-band),div.compass-main.fixed:has(.compass-sky-band)>:not(.compass-sky-band){background:#fff}
}
html.compass-standalone{--shell:100lvh;height:100lvh!important;bottom:auto!important;background:#c5e8f7!important}
html.compass-standalone main.compass-main,html.compass-standalone div.compass-main.fixed{height:100lvh;background:transparent}
html.compass-standalone main.compass-main:not(:has(.compass-sky-band)),html.compass-standalone div.compass-main.fixed:not(:has(.compass-sky-band)){background:#fff}
html.compass-standalone main.compass-main:has(.compass-sky-band)>:not(.compass-sky-band),html.compass-standalone div.compass-main.fixed:has(.compass-sky-band)>:not(.compass-sky-band){background:#fff}
`;

/**
 * Motion stays off only for the cold open of the portfolio.
 * The installed app starts at / and then moves to /main in the same document,
 * so an onboarded phone (or one that already has cards) must not be marked settled here.
 * Every other first paint is settled immediately, or the kill-switch would freeze that screen.
 */
const RELEASE_MOTION_SCRIPT = `(function(){
try{localStorage.removeItem("compass.resume-route")}catch(e){}
var root=document.documentElement;
var compact=window.innerHeight<${COMPACT_BELOW_PX};
root.style.setProperty("--hd",compact?"${COMPACT_HEADER_SCALE}":"1");
root.setAttribute("data-density",compact?"compact":"comfortable");
root.classList.add("compass-sized");
var path=location.pathname;
var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
if(standalone){
  root.classList.add("compass-standalone");
  var pin=function(){if(window.scrollX||window.scrollY)window.scrollTo(0,0)};
  pin();
  window.addEventListener("scroll",pin);
  if(window.visualViewport)window.visualViewport.addEventListener("scroll",pin);
}
var portfolio=path==="/main"||path.indexOf("/main/")===0;
if(!portfolio&&path==="/"){
  try{
    var raw=localStorage.getItem("compass-storage-v4");
    if(raw){
      var state=JSON.parse(raw).state||{};
      if(state.user&&state.user.onboarded)portfolio=true;
      else if(state.cards&&state.cards.length)portfolio=true;
    }
  }catch(e){}
}
if(portfolio&&standalone){
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute("content","#c5e8f7");
}
if(portfolio)return;
document.documentElement.classList.add("compass-settled");
})();`;

/** iOS Safari draws `:active` only on a page with a touchstart listener; without it a tap shows nothing. */
const TOUCH_ACTIVE_SCRIPT = `document.addEventListener("touchstart",function(){},{passive:true});`;

export const metadata: Metadata = {
  metadataBase: new URL("https://adedme.com"),
  title: "ADED",
  description: "ADED",
  manifest: "/manifest.json",
  // `?v=` is the icon's version: /icons/* is cached for a year, so a new icon needs a new address.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/icon-180.png?v=2", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "ADED", statusBarStyle: "black-translucent" },
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
        <script dangerouslySetInnerHTML={{ __html: RELEASE_MOTION_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: TOUCH_ACTIVE_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: MEASURE_CSS }} />
      </head>
      <body className="min-h-full font-sans antialiased">
        <AppResetGate />
        <MonochromeSync />
        <SupabaseSession />
        <VisualBottom />
        <PdfPreviewHost />
        <TabPrefetch />
        <ServiceWorker />
        {children}
        <TrialLock />
      </body>
    </html>
  );
}
