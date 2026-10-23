import type { Metadata, Viewport } from "next";
import { screenMeasureScript } from "@main/layout";
import { AppResetGate } from "@/shared/components/app-reset-gate";
import { MonochromeSync } from "@/shared/components/monochrome-sync";
import { PdfPreviewHost } from "@/shared/components/pdf-preview-host";
import { ServiceWorker } from "@/shared/components/service-worker";
import { SupabaseSession } from "@/shared/components/supabase-session";
import { TabPrefetch } from "@/shared/components/tab-prefetch";
import { TrialLock } from "@/shared/components/trial-lock";
import { VisualBottom } from "@/shared/components/visual-bottom";
import "./globals.css";

/** White until the head script has measured. Nothing moves until the portfolio measure has landed. */
const MEASURE_CSS = `
html{height:var(--app-h,100svh)!important;bottom:auto!important}
html:not(.compass-sized),html:not(.compass-sized) body{background:#fff!important}
html:not(.compass-sized) .compass-layer,html:not(.compass-sized) .compass-sky-band{visibility:hidden}
html:not(.compass-settled),html:not(.compass-settled) *,html:not(.compass-settled) *::before,html:not(.compass-settled) *::after{transition:none!important;animation:none!important}
main.compass-main.fixed.top-0{height:var(--app-h,100svh)}
div.compass-main.fixed.inset-y-0:not([class*="overflow"]){height:var(--app-h,100svh);bottom:auto;background:#fff}
@media (hover:hover) and (pointer:fine){
  html{bottom:0!important;height:auto!important}
  main.compass-main.fixed.top-0{bottom:0;height:auto}
  main.compass-main:not(.fixed){height:var(--app-h,100dvh)}
  div.compass-main.fixed.inset-y-0:not([class*="overflow"]){bottom:0!important;height:auto!important}
}
html.compass-main-standalone{height:100lvh!important;bottom:0!important;background:#fff!important}
html.compass-main-standalone main.compass-main.fixed.top-0{height:100lvh!important;bottom:0}
html.compass-main-standalone main.compass-main.fixed.top-0::after{content:"";position:absolute;z-index:25;left:0;right:0;bottom:calc(var(--band-h, 53px) + var(--vv-bottom, 0px));height:calc(100lvh - var(--app-h, 100svh));background:#ff0000;pointer-events:none}
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
var read=function(name){return root.style.getPropertyValue(name).trim()};
window.__compassHeadMeasure={appH:read("--app-h"),bandH:read("--band-h"),vvBottom:read("--vv-bottom"),hd:read("--hd")};
var path=location.pathname;
var standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
if(standalone){
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
  root.classList.add("compass-main-standalone");
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
        <script dangerouslySetInnerHTML={{ __html: screenMeasureScript() }} />
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
